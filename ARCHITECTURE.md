# Architecture — `@akcit/docs-agent`

← Back to [README.md](./README.md)

Complete technical reference: capture pipeline, security guarantees, politeness defaults, skill generation, internal organization, and development workflow.

---

## Features

### Capture pipeline
- CLI runnable via `npx`.
- `npx skills add`-style installer, through the `add` command.
- MCP server with the `capture_docs` tool (with Zod validation).
- Prioritization of `llms-full.txt`, `llms.txt`, `.md`, and `.mdx`.
- Fallback to `sitemap.xml`, `robots.txt`, navigation/sidebar, and scoped crawl.
- Optional Playwright fallback for SPA documentation.
- Manifest with captured pages, failures, hashes, and source used.
- Helper indexes for code: `api-index.md`, `examples-index.md`, and `snippets.json`.
- YAML front-matter in every `.md` with `title`, `source`, and `captured_at`.
- Automatic resume: re-running skips already-captured URLs (manifest); `--force` recaptures everything.
- Configurable concurrency + periodic manifest flush (resilient to Ctrl+C).

### Politeness and anti-ban (conservative defaults)
- Concurrency 2, `rate-limit-ms` 750ms, `max-retries` 5, jitter on by default.
- Automatic retry on HTTP 408/425/429/5xx with exponential backoff.
- Honors the `Retry-After` header (seconds or HTTP-date).
- Adaptive throttle: on the first 429, doubles `rate-limit-ms` for the rest of the run.
- `--aggressive` preset for tolerant sites (concurrency 10, rate-limit 100ms).

### Real-time UX
- TTY-aware progress bar with ETA, counter, and current URL.
- `--verbose` mode (one line per event) and `--quiet` (silent).
- `--json` mode (structured JSON on stdout, human-readable text on stderr).

### Security (P0 hardening)
- SSRF guard (blocks 0.0.0.0/8, 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, IPv6 link-local, IPv4-mapped, multicast).
- 10 MB cap on the response body (anti gzip-bomb).
- Cap of 10 manual redirects with SSRF re-validation on `Location`.
- `processEntities: false` in the XML parser (anti billion-laughs).

### Per-technology skills (auto-generated after scraping)
- Each capture generates `docs/<tech>/SKILL.md` co-located with the docs (Claude/Codex format).
- **By default**, a capture also installs the skill into **project-scoped paths** within the current directory: `.claude/skills/docs-<tech>/`, `.agents/skills/docs-<tech>/` (Codex repo-scoped), `.cursor/rules/docs-<tech>.mdc`, `.gemini/extensions/docs-<tech>/`. Agents running in the project discover the skill immediately.
- The `--install [clients]` flag on `capture` ADDITIONALLY installs into HOME (cross-project).
- The `install-skill <tech>` command lets you install into HOME (default) or project-scoped (`--local`) after an existing capture.
- Each client receives the appropriate format: `SKILL.md` (Claude/Codex), `.mdc` (Cursor), `GEMINI.md` + extension.json (Gemini).
- The package also installs `/prompt` and `/prompt-code`; `/prompt-code` generates COSTAR-A prompts for implementation or review based on the local docs.

### Bundled integrations
- Plugin for Codex.
- Repo-scoped skill for the Codex CLI at `.agents/skills/docs`.
- Skill and command for Claude Code under `.claude`.
- Command and MCP config for Cursor.
- Extension for the Gemini CLI.

---

## How It Works

The capture flow follows this order:

1. Checks for `llms-full.txt` at the domain and at the base path.
2. Checks for `llms.txt` and extracts Markdown links.
3. Detects native `.md` and `.mdx` links.
4. Looks for `sitemap.xml`, `sitemap_index.xml`, and sitemaps declared in `robots.txt`.
5. Performs a crawl scoped to the documentation's domain/path.
6. Converts HTML to Markdown when no native Markdown source exists.
7. Saves the content under `docs/<technology>/`.

Example output:

```text
docs/react/
├── index.md
├── manifest.json
├── api-index.md
├── examples-index.md
├── snippets.json
├── SKILL.md          ← auto-generated skill (co-located with the docs)
└── reference/
    └── hooks/
        └── use-state.md
```

---

## Politeness and Anti-Ban

The capture uses **conservative** defaults to prevent the user's IP from being blocked by documentation sites. Those who want speed can opt for `--aggressive`.

### Defaults

| Parameter | Polite default | `--aggressive` |
|---|---|---|
| `--concurrency` | 2 | 10 |
| `--rate-limit-ms` | 750 | 100 |
| `--max-retries` | 5 | 2 |
| jitter | on | on |

### Retry and backoff

Returned statuses that trigger an automatic retry: **408, 425, 429, 500, 502, 503, 504**. The backoff works as follows:

1. If the response has `Retry-After`, wait the indicated value (seconds or HTTP-date).
2. Otherwise, exponential backoff (`500ms × 2^attempt`) with ±25% jitter, capped at 30s.

### Adaptive throttle

On receiving the first `429`, `rate-limit-ms` is **doubled** for the rest of the run and a `throttle-adapt` event is emitted (visible with `--verbose`).

### Flags

```bash
--rate-limit-ms <n>   # default 750
--concurrency <n>     # default 2
--max-retries <n>     # default 5
--no-jitter           # remove o jitter aleatório (debug determinístico)
--aggressive          # preset rápido (concurrency=10, rate=100, retries=2)
```

---

## UX and Progress Visualization

By default, in an interactive terminal (TTY), the CLI shows an inline-updated progress bar:

```text
[████████░░░░░░░░░░░░░░░░] 12/25 (48%) eta 1m23s • /agents/llm-agents
```

Alternative modes:

```bash
--verbose       # uma linha por página/evento (sem barra)
--quiet         # silêncio total (apenas erros)
--no-progress   # desabilita a barra mesmo em TTY
--json          # JSON estruturado em stdout (humano em stderr)
```

In a pipe / CI (non-TTY stdout), the renderer automatically falls back to verbose mode.

---

## Per-Technology Skill (auto-generated)

After each capture, the Docs Agent **automatically** generates a per-technology skill in **three scopes**:

1. **Co-located** — `docs/<tech>/SKILL.md` (alongside the docs, portable).
2. **Project-scoped (default)** — `.claude/`, `.agents/`, `.cursor/`, `.gemini/` in the current directory. Agents running in the project **discover it automatically**.
3. **HOME-scoped (opt-in via `--install`)** — paths under `~/` for global cross-project visibility.

The skill contains:

- YAML frontmatter with `name: docs-<tech>` and a precise `description` (match trigger for the agent).
- When to activate the skill (mention of the tech's name, questions about API/concepts).
- How to navigate: `index.md` → drill into subdirs → grep the `.md` files → consult `manifest.json`.
- How to write code with the docs: consult `api-index.md`, `examples-index.md`, `snippets.json`, and the source Markdown pages.
- A list of the 8 anchor pages (from the manifest).
- The command to refresh.

### Indexes for development

Every capture generates helper files in `docs/<tech>/` to improve code implementation and review with agents:

- `api-index.md`: symbols, imports, commands, and endpoints detected by lightweight heuristics.
- `examples-index.md`: captured code examples, with their source page/section.
- `snippets.json`: structured code blocks with language, page, section, and content.

These indexes are deliberately heuristic: they serve for quick discovery, but the agent should read the original Markdown page before using an API or example in code.

### Capture + automatic installation (default)

```bash
# Captura https://adk.dev — gera SKILL.md co-located + instala project-scoped em
# .claude/skills/docs-adk/, .agents/skills/docs-adk/, .cursor/rules/docs-adk.mdc, .gemini/extensions/docs-adk/
npx -y @akcit/docs-agent capture https://adk.dev

# Adicionar instalação HOME (cross-project) — permite que agentes em qualquer pasta encontrem a skill
npx -y @akcit/docs-agent capture https://adk.dev --install

# HOME install só para clients específicos
npx -y @akcit/docs-agent capture https://adk.dev --install claude,cursor

# Skip TUDO (co-located + project + HOME)
npx -y @akcit/docs-agent capture https://example.com --no-skill

# Skip APENAS project-scoped (mantém co-located)
npx -y @akcit/docs-agent capture https://example.com --no-skill-local
```

### Install the skill after an existing capture

```bash
# HOME-scoped (default) — todos os clients
npx -y @akcit/docs-agent install-skill adk

# Project-scoped explícito
npx -y @akcit/docs-agent install-skill adk --local

# Project-scoped em outro diretório
npx -y @akcit/docs-agent install-skill adk --local --project-dir /path/to/project

# Subset de clients
npx -y @akcit/docs-agent install-skill adk --clients claude,cursor

# Sobrescrever versão customizada (cria .bak)
npx -y @akcit/docs-agent install-skill adk --force
```

### Where the skill is installed (per client × scope)

| Client | Project-scoped (cwd) | HOME-scoped (`--install`) |
|---|---|---|
| Claude Code | `.claude/skills/docs-<tech>/SKILL.md` | `~/.claude/skills/docs-<tech>/SKILL.md` |
| Codex CLI | `.agents/skills/docs-<tech>/SKILL.md` (repo-scoped) | `~/.codex/plugins/docs-<tech>/skills/SKILL.md` + `plugin.json` |
| Cursor | `.cursor/rules/docs-<tech>.mdc` | `~/.cursor/rules/docs-<tech>.mdc` |
| Gemini CLI | `.gemini/extensions/docs-<tech>/GEMINI.md` + `gemini-extension.json` | `~/.gemini/extensions/docs-<tech>/GEMINI.md` + `gemini-extension.json` |

Each format is generated from the same `manifest.json`, so the skill content is consistent across clients and scopes.

### Coexistence

Auto-install **does not conflict** with the docs-agent's own pre-existing skills:

```text
.claude/skills/
├── docs/          # skill do CLI docs-agent (instalada via `add`)
└── docs-adk/      # knowledge base capturada (gerada por `capture https://adk.dev`)

.agents/skills/
├── docs/          # skill repo-scoped do Codex CLI
└── docs-adk/      # knowledge base capturada
```

Each knowledge base is an independent skill prefixed with `docs-`, with no impact on already-installed skills.

---

## Direct Usage

### Basic capture

```bash
# Mais simples (defaults polite, gera SKILL.md)
npx -y @akcit/docs-agent capture https://example.com/docs

# Captura + instala skill em todos os 4 clients (one-shot)
npx -y @akcit/docs-agent capture https://example.com/docs --install

# Subset de clients no install
npx -y @akcit/docs-agent capture https://example.com/docs --install claude,cursor
```

### Scope control

```bash
# Nome customizado (vira docs/<nome>/)
npx -y @akcit/docs-agent capture https://example.com/docs --name minha-tecnologia

# Limite de páginas
npx -y @akcit/docs-agent capture https://example.com/docs --max-pages 100

# Permitir capturas grandes (acima do threshold de 500)
npx -y @akcit/docs-agent capture https://example.com/docs --max-pages 1000 --force-large-crawl

# Output dir customizado
npx -y @akcit/docs-agent capture https://example.com/docs --output-dir ./knowledge-base
```

### Politeness and speed

```bash
# Override de throttling (default: concurrency=2, rate-limit=750, retries=5)
npx -y @akcit/docs-agent capture https://example.com/docs \
  --concurrency 4 --rate-limit-ms 500 --max-retries 3

# Modo agressivo para sites tolerantes (CDN-backed)
npx -y @akcit/docs-agent capture https://example.com/docs --aggressive

# Sem jitter (debug determinístico)
npx -y @akcit/docs-agent capture https://example.com/docs --no-jitter
```

### Visualization

```bash
# Default em TTY: barra de progresso com ETA + URL atual
npx -y @akcit/docs-agent capture https://example.com/docs

# Linha por página (útil para scrollar histórico)
npx -y @akcit/docs-agent capture https://example.com/docs --verbose

# JSON estruturado em stdout (pipe-friendly)
npx -y @akcit/docs-agent capture https://example.com/docs --json | jq '.pages | length'

# Silencioso
npx -y @akcit/docs-agent capture https://example.com/docs --quiet

# Sem barra mesmo em TTY
npx -y @akcit/docs-agent capture https://example.com/docs --no-progress
```

### Other options

```bash
# Desativar fallback com navegador headless (Playwright)
npx -y @akcit/docs-agent capture https://example.com/docs --no-headless

# Ignorar robots.txt
npx -y @akcit/docs-agent capture https://example.com/docs --no-respect-robots

# Re-captura forçada (ignora manifest existente)
npx -y @akcit/docs-agent capture https://example.com/docs --force

# Pular geração da SKILL.md
npx -y @akcit/docs-agent capture https://example.com/docs --no-skill
```

### Helper commands

```bash
# Instalar skill de uma tech já capturada
npx -y @akcit/docs-agent install-skill <tech>
npx -y @akcit/docs-agent install-skill adk --clients claude,codex
npx -y @akcit/docs-agent install-skill adk --force   # cria .bak se existir

# Servidor MCP
npx -y @akcit/docs-agent mcp

# Verificar ambiente (Node + Playwright + HOME)
npx -y @akcit/docs-agent doctor
```

---

## What the Installer Creates

For Codex:

```text
~/.codex/plugins/docs-agent/
~/.agents/plugins/marketplace.json
```

For the Codex CLI within this repository:

```text
.agents/skills/docs/SKILL.md
```

For Claude Code:

```text
~/.claude/skills/docs/SKILL.md
~/.claude/commands/docs.md
```

For Cursor:

```text
~/.cursor/commands/docs.md
~/.cursor/mcp.json
```

For the Gemini CLI:

```text
~/.gemini/extensions/docs-agent/
```

After installation, restart the client so it detects new skills, commands, plugins, and MCP servers.

---

## Usage in the Codex CLI

To use it as an installed package:

```bash
npx -y @akcit/docs-agent add --clients codex
```

To use it during development in this repository, the Codex CLI can discover the repo-scoped skill at:

```text
.agents/skills/docs/SKILL.md
```

The distributable Codex plugin lives at:

```text
.codex-plugin/plugin.json
skills/docs/SKILL.md
.mcp.json
```

---

## Usage in Claude Code

The project includes the `.claude` structure:

```text
.claude/skills/docs/SKILL.md
.claude/commands/docs.md
```

Once installed, the intent is to invoke the `/docs` command with a documentation URL. The skill instructs the agent to run:

```bash
npx -y @akcit/docs-agent capture <url>
```

---

## Internal Architecture

```text
.
├── src/
│   ├── cli.ts          # CLI principal (capture, install, install-skill, mcp, doctor)
│   ├── capture.ts      # pipeline: descoberta, crawl, retry/backoff, resume, manifest
│   ├── url-safety.ts   # SSRF guard (CIDR check sem deps)
│   ├── markdown.ts     # HTML → Markdown + front-matter (cheerio + turndown)
│   ├── progress.ts     # renderer TTY-aware (bar / verbose / silent)
│   ├── tech-skill.ts   # geradores de SKILL.md por tech (Claude, Codex, Cursor, Gemini)
│   ├── mcp.ts          # servidor MCP (Zod validation)
│   ├── install.ts      # instalador docs-agent + installTechSkill por tech
│   ├── templates.ts    # templates dos clientes (Codex, Claude, Cursor, Gemini)
│   ├── types.ts        # CaptureOptions, ProgressEvent, CaptureManifest, etc.
│   └── utils.ts        # slug, hash, paths, writeTextIfChanged, sleep
├── scripts/
│   └── sync-assets.ts  # sincroniza ativos bundled com templates (CI guard)
├── .codex-plugin/      # manifesto do plugin Codex (gerado)
├── .agents/skills/     # skill repo-scoped para Codex CLI (gerada)
├── .claude/            # skill e comando para Claude Code (gerados)
├── skills/             # skill empacotada no plugin Codex (gerada)
├── commands/           # comandos para clientes compatíveis (gerados)
└── gemini-extension.json
```

Test coverage: 141 unit + integration tests via Vitest, with `@vitest/coverage-v8`. Required threshold: 80% lines / 70% branches.

---

## Local Development

Install dependencies:

```bash
npm install
```

Run validations:

```bash
npm run typecheck
npm test
npm run build
```

Test the installer without altering your real home directory:

```bash
node dist/cli.js add --home /tmp/docs-agent-home
```

Test a capture locally after the build:

```bash
node dist/cli.js capture https://example.com/docs --name exemplo
```

Verify npm packaging:

```bash
npm pack --dry-run --cache /tmp/akcit-docs-agent-npm-cache
```

---

## Current Status

The package is structured to run as:

```bash
npx -y @akcit/docs-agent add
npx -y @akcit/docs-agent capture <url>
```

Before it works publicly via `npx`, the package must be published to npm under the name `@akcit/docs-agent`. While it is not published, use the local commands with `node dist/cli.js`.

← Back to [README.md](./README.md)
