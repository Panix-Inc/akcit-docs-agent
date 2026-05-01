# Arquitetura — `@akcit/docs-agent`

← Voltar para [README.md](./README.md)

Documento de referência técnica completa: pipeline de captura, garantias de segurança, defaults de polidez, geração de skills, organização interna e workflow de desenvolvimento.

---

## Funcionalidades

### Pipeline de captura
- CLI executável via `npx`.
- Instalador estilo `npx skills add`, por meio do comando `add`.
- Servidor MCP com tool `capture_docs` (com validação Zod).
- Priorização de `llms-full.txt`, `llms.txt`, `.md` e `.mdx`.
- Fallback para `sitemap.xml`, `robots.txt`, navegação/sidebar e crawl escopado.
- Fallback opcional com Playwright para documentações SPA.
- Manifest com páginas capturadas, falhas, hashes e fonte usada.
- Front-matter YAML em cada `.md` com `title`, `source` e `captured_at`.
- Resume automático: re-rodar pula URLs já capturadas (manifest); `--force` recaptura tudo.
- Concorrência configurável + flush periódico do manifest (resiste a Ctrl+C).

### Polidez e anti-ban (defaults conservadores)
- Concurrency 2, `rate-limit-ms` 750ms, `max-retries` 5, jitter on por default.
- Retry automático em HTTP 408/425/429/5xx com backoff exponencial.
- Honra o header `Retry-After` (segundos ou HTTP-date).
- Throttle adaptativo: ao primeiro 429, dobra o `rate-limit-ms` no resto da run.
- Preset `--aggressive` para sites tolerantes (concurrency 10, rate-limit 100ms).

### UX em tempo real
- Barra de progresso TTY-aware com ETA, contador e URL atual.
- Modo `--verbose` (linha por evento) e `--quiet` (silencioso).
- Modo `--json` (JSON estruturado em stdout, texto humano em stderr).

### Segurança (hardening P0)
- SSRF guard (bloqueia 0.0.0.0/8, 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, IPv6 link-local, IPv4-mapped, multicast).
- Cap de 10 MB no corpo de resposta (anti gzip-bomb).
- Cap de 10 redirects manuais com SSRF re-validation no `Location`.
- `processEntities: false` no parser XML (anti billion-laughs).

### Skills por tecnologia (auto-geradas após scraping)
- Cada captura gera `docs/<tech>/SKILL.md` co-located com os docs (formato Claude/Codex).
- **Por default**, captura também instala a skill em **paths project-scoped** dentro do diretório atual: `.claude/skills/docs-<tech>/`, `.agents/skills/docs-<tech>/` (Codex repo-scoped), `.cursor/rules/docs-<tech>.mdc`, `.gemini/extensions/docs-<tech>/`. Os agentes rodando no projeto descobrem a skill imediatamente.
- Flag `--install [clients]` em `capture` ADICIONALMENTE instala em HOME (cross-project).
- Comando `install-skill <tech>` permite instalar HOME (default) ou project-scoped (`--local`) após uma captura existente.
- Cada client recebe formato apropriado: `SKILL.md` (Claude/Codex), `.mdc` (Cursor), `GEMINI.md` + extension.json (Gemini).

### Integrações empacotadas
- Plugin para Codex.
- Skill repo-scoped para Codex CLI em `.agents/skills/docs`.
- Skill e comando para Claude Code em `.claude`.
- Comando e MCP config para Cursor.
- Extensão para Gemini CLI.

---

## Como Funciona

O fluxo de captura segue esta ordem:

1. Verifica `llms-full.txt` no domínio e no path base.
2. Verifica `llms.txt` e extrai links Markdown.
3. Detecta links nativos `.md` e `.mdx`.
4. Procura `sitemap.xml`, `sitemap_index.xml` e sitemaps declarados em `robots.txt`.
5. Faz crawl escopado ao domínio/path da documentação.
6. Converte HTML para Markdown quando não existe fonte Markdown nativa.
7. Salva o conteúdo em `docs/<tecnologia>/`.

Exemplo de saída:

```text
docs/react/
├── index.md
├── manifest.json
├── SKILL.md          ← skill auto-gerada (co-located com os docs)
└── reference/
    └── hooks/
        └── use-state.md
```

---

## Polidez e Anti-Ban

A captura adota defaults **conservadores** para evitar que o IP do usuário seja bloqueado por sites de documentação. Quem quer velocidade pode optar por `--aggressive`.

### Defaults

| Parâmetro | Default polite | `--aggressive` |
|---|---|---|
| `--concurrency` | 2 | 10 |
| `--rate-limit-ms` | 750 | 100 |
| `--max-retries` | 5 | 2 |
| jitter | on | on |

### Retry e backoff

Status retornados que disparam retry automático: **408, 425, 429, 500, 502, 503, 504**. O backoff segue:

1. Se a resposta tem `Retry-After`, espera o valor indicado (segundos ou HTTP-date).
2. Caso contrário, backoff exponencial (`500ms × 2^attempt`) com ±25% de jitter, teto 30s.

### Throttle adaptativo

Ao receber o primeiro `429`, o `rate-limit-ms` é **dobrado** para o resto da run e um evento `throttle-adapt` é emitido (visível em `--verbose`).

### Flags

```bash
--rate-limit-ms <n>   # default 750
--concurrency <n>     # default 2
--max-retries <n>     # default 5
--no-jitter           # remove o jitter aleatório (debug determinístico)
--aggressive          # preset rápido (concurrency=10, rate=100, retries=2)
```

---

## UX e Visualização do Progresso

Por default, em terminal interativo (TTY), o CLI exibe uma barra de progresso atualizada em linha:

```text
[████████░░░░░░░░░░░░░░░░] 12/25 (48%) eta 1m23s • /agents/llm-agents
```

Modos alternativos:

```bash
--verbose       # uma linha por página/evento (sem barra)
--quiet         # silêncio total (apenas erros)
--no-progress   # desabilita a barra mesmo em TTY
--json          # JSON estruturado em stdout (humano em stderr)
```

Em pipe / CI (stdout não-TTY), o renderer cai automaticamente para modo verbose.

---

## Skill por Tecnologia (auto-gerada)

Após cada captura, o Docs Agent gera **automaticamente** uma skill por tecnologia em **três escopos**:

1. **Co-located** — `docs/<tech>/SKILL.md` (junto dos docs, portátil).
2. **Project-scoped (default)** — `.claude/`, `.agents/`, `.cursor/`, `.gemini/` no diretório atual. Os agentes rodando no projeto **descobrem automaticamente**.
3. **HOME-scoped (opt-in via `--install`)** — paths em `~/` para visibilidade global cross-project.

A skill contém:

- Frontmatter YAML com `name: docs-<tech>` e uma `description` precisa (gatilho de match para o agente).
- Quando ativar a skill (mention do nome da tech, perguntas sobre API/conceitos).
- Como navegar: `index.md` → drill em subdirs → grep nos `.md` → consultar `manifest.json`.
- Lista das 8 páginas-âncora (do manifest).
- Comando para refresh.

### Captura + instalação automática (default)

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

### Instalar skill após captura existente

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

### Onde a skill é instalada (por client × escopo)

| Client | Project-scoped (cwd) | HOME-scoped (`--install`) |
|---|---|---|
| Claude Code | `.claude/skills/docs-<tech>/SKILL.md` | `~/.claude/skills/docs-<tech>/SKILL.md` |
| Codex CLI | `.agents/skills/docs-<tech>/SKILL.md` (repo-scoped) | `~/.codex/plugins/docs-<tech>/skills/SKILL.md` + `plugin.json` |
| Cursor | `.cursor/rules/docs-<tech>.mdc` | `~/.cursor/rules/docs-<tech>.mdc` |
| Gemini CLI | `.gemini/extensions/docs-<tech>/GEMINI.md` + `gemini-extension.json` | `~/.gemini/extensions/docs-<tech>/GEMINI.md` + `gemini-extension.json` |

Cada formato é gerado a partir do mesmo `manifest.json`, então o conteúdo da skill é consistente entre clients e escopos.

### Coexistência

O auto-install **não conflita** com skills pré-existentes do próprio docs-agent:

```text
.claude/skills/
├── docs/          # skill do CLI docs-agent (instalada via `add`)
└── docs-adk/      # knowledge base capturada (gerada por `capture https://adk.dev`)

.agents/skills/
├── docs/          # skill repo-scoped do Codex CLI
└── docs-adk/      # knowledge base capturada
```

Cada knowledge base é uma skill independente prefixada com `docs-`, sem nenhum impacto em skills já instaladas.

---

## Uso Direto

### Captura básica

```bash
# Mais simples (defaults polite, gera SKILL.md)
npx -y @akcit/docs-agent capture https://example.com/docs

# Captura + instala skill em todos os 4 clients (one-shot)
npx -y @akcit/docs-agent capture https://example.com/docs --install

# Subset de clients no install
npx -y @akcit/docs-agent capture https://example.com/docs --install claude,cursor
```

### Controle de escopo

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

### Polidez e velocidade

```bash
# Override de throttling (default: concurrency=2, rate-limit=750, retries=5)
npx -y @akcit/docs-agent capture https://example.com/docs \
  --concurrency 4 --rate-limit-ms 500 --max-retries 3

# Modo agressivo para sites tolerantes (CDN-backed)
npx -y @akcit/docs-agent capture https://example.com/docs --aggressive

# Sem jitter (debug determinístico)
npx -y @akcit/docs-agent capture https://example.com/docs --no-jitter
```

### Visualização

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

### Outras opções

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

### Comandos auxiliares

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

## O Que o Instalador Cria

Para Codex:

```text
~/.codex/plugins/docs-agent/
~/.agents/plugins/marketplace.json
```

Para Codex CLI dentro deste repositório:

```text
.agents/skills/docs/SKILL.md
```

Para Claude Code:

```text
~/.claude/skills/docs/SKILL.md
~/.claude/commands/docs.md
```

Para Cursor:

```text
~/.cursor/commands/docs.md
~/.cursor/mcp.json
```

Para Gemini CLI:

```text
~/.gemini/extensions/docs-agent/
```

Depois da instalação, reinicie o cliente para que ele detecte novas skills, comandos, plugins e servidores MCP.

---

## Uso no Codex CLI

Para usar como pacote instalado:

```bash
npx -y @akcit/docs-agent add --clients codex
```

Para usar durante o desenvolvimento neste repositório, o Codex CLI consegue descobrir a skill repo-scoped em:

```text
.agents/skills/docs/SKILL.md
```

O plugin distribuível do Codex fica em:

```text
.codex-plugin/plugin.json
skills/docs/SKILL.md
.mcp.json
```

---

## Uso no Claude Code

O projeto inclui a estrutura `.claude`:

```text
.claude/skills/docs/SKILL.md
.claude/commands/docs.md
```

Depois de instalado, a intenção é chamar o comando `/docs` com uma URL de documentação. A skill orienta o agente a executar:

```bash
npx -y @akcit/docs-agent capture <url>
```

---

## Arquitetura interna

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

Cobertura de testes: 141 testes unitários + integração via Vitest, com `@vitest/coverage-v8`. Limiar exigido: 80% lines / 70% branches.

---

## Desenvolvimento Local

Instalar dependências:

```bash
npm install
```

Rodar validações:

```bash
npm run typecheck
npm test
npm run build
```

Testar o instalador sem alterar seu diretório home real:

```bash
node dist/cli.js add --home /tmp/docs-agent-home
```

Testar captura localmente depois do build:

```bash
node dist/cli.js capture https://example.com/docs --name exemplo
```

Verificar empacotamento npm:

```bash
npm pack --dry-run --cache /tmp/akcit-docs-agent-npm-cache
```

---

## Estado Atual

O pacote está estruturado para rodar como:

```bash
npx -y @akcit/docs-agent add
npx -y @akcit/docs-agent capture <url>
```

Antes de funcionar publicamente via `npx`, o pacote precisa ser publicado no npm com o nome `@akcit/docs-agent`. Enquanto não estiver publicado, use os comandos locais com `node dist/cli.js`.

← Voltar para [README.md](./README.md)
