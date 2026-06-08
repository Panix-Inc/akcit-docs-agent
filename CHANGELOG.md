# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-06-07

### Changed
- **Documentation is now English-primary.** Root `README.md` and `ARCHITECTURE.md` are in English (the GitHub and npm project page), with the previous Brazilian Portuguese documentation preserved in `README.pt-BR.md`. The `CLAUDE.md` / `AGENTS.md` documentation-language convention was flipped to English-primary. From this entry forward the changelog is written in English; historical entries remain in Portuguese.
- npm/package metadata, Gemini extension metadata, Codex plugin metadata, and CLI description now use English copy focused on documentation capture for AI coding agents, CLI workflows, and MCP tools.

### Added
- **Scrape quality** (`src/markdown.ts`): images are now preserved (previously dropped) — resolved via `data-src`/`src`/`srcset` and sanitized through `safeAbsoluteUrl`; code-block language detection broadened beyond `language-*` to `data-language`, `lang-*`, and hljs-style classes; table cells collapse whitespace and escape pipes so cell content no longer breaks rows; additional boilerplate (`[role='complementary']`, `.sidebar`, `.toc`, `.breadcrumb`, skip-links) is stripped.

### Security
- Fixed a ReDoS in the markdown-link regex (`src/capture.ts`): replaced the catastrophic-backtracking pattern with a non-backtracking `[^()]` variant at both call sites and added an 8 KB per-line scan guard, with a regression test.
- `getBrowser` now warns when Playwright is missing instead of silently degrading to plain-text extraction.
- `npm audit fix` resolved 7 advisories (lockfile only); remaining advisories are dev-only (vite/vitest/esbuild) and deferred to avoid a breaking upgrade.

### Fixed
- Corrected the `@avakit/docs-agent` → `@akcit/docs-agent` package-name typo in bundled command/skill files, which prevented `npx` execution from those snippets.

## [0.2.1] - 2026-05-08

### Changed
- `/prompt` agora **reescreve E responde** no mesmo turno. Antes parava no bloco COSTAR-A; agora produz, em ordem: bloco fenced `text` com COSTAR-A → ≤3 bullets de melhorias → a resposta final executando o prompt otimizado conforme Style/Tone/Audience/Response/Answer definidos. Ambíguos disparam **uma** pergunta clarificadora curta antes do rewrite. Resposta no idioma do input (pt-BR por padrão para entradas em português). Aplicado consistentemente em Claude Code, Codex CLI, Cursor (via MCP) e Gemini CLI — `skills/prompt/SKILL.md`, `.agents/skills/prompt/SKILL.md`, `commands/prompt.{md,toml}` e `skills/prompt/agents/openai.yaml`. `/prompt-code` mantém comportamento atual (advisory).

### Added
- `akcit-docs` (sem subcomando) e `akcit-docs status` imprimem relatório de integrações por cliente (`codex`, `claude`, `cursor`, `gemini`) com paths exatos dos arquivos `missing` ou `outdated` e o próximo passo recomendado (`akcit-docs add` ou `add --force`). Endereça a confusão pós-`npm install -g`, em que usuários esperam ver `/docs`/`/prompt`/`/prompt-code` automaticamente — sem rodar `akcit-docs add`, nada é escrito no HOME (decisão intencional para evitar `postinstall` mexendo em `~`).
- `akcit-docs doctor` agora também exibe o status das integrações ao final do relatório de runtime.
- Função pública `detectIntegrationStatus(homeDir)` em `src/install.ts` para inspecionar o estado das integrações sem efeitos colaterais — usada pela CLI e disponível para testes/automação externa.

### Internal
- Listas `claudeOwnedFiles` / `codexOwnedFiles` / `geminiOwnedFiles` extraídas em `src/install.ts` como single source of truth; `installClaude` / `installCodex` / `installGemini` e `detectIntegrationStatus` consomem as mesmas listas (evita drift entre install e detecção).

## [0.2.0] - 2026-05-08

> **Nota de release:** a tag `v0.1.2` foi criada apontando para um commit anterior ao bump de versão, então o CI de publish falhou e a `0.1.2` **nunca chegou ao npm**. Quem está em `0.1.1` pula direto para `0.2.0`. As features adicionadas em `0.1.2` (`/prompt` e `/prompt-code`) estão incluídas aqui.

### Added
- Skills/comandos `/prompt` (COSTAR-A) e `/prompt-code` (doc-grounded coding prompts) auto-instaladas pelo `akcit-docs install` / `add` para Claude Code, Codex CLI, Cursor e Gemini CLI.
- Agentes Codex OpenAI YAML para `prompt` e `prompt-code` em `skills/{prompt,prompt-code}/agents/openai.yaml`.
- `akcit-docs install` agora imprime explicitamente `result.skipped` (arquivos modificados pelo usuário, pulados sem `--force`) e `result.failed` (clientes que erraram durante install). Antes esses eventos sumiam silenciosamente.

### Changed (BREAKING)
- `installCursor` (HOME-scope) **não escreve mais** `~/.cursor/commands/{docs,prompt,prompt-code}.md`. Esses caminhos não são honrados pelo Cursor — commands no Cursor são project-scoped (`<project>/.cursor/commands/`). Globalmente, só `~/.cursor/mcp.json` é lido. Skills `/prompt`, `/prompt-code` e `docs` continuam chegando ao Cursor via o servidor MCP `docsAgent` (registrado em `~/.cursor/mcp.json`) e via skill por tecnologia capturada (`<project>/.cursor/rules/docs-<tech>.mdc` gravado por `installTechSkillLocal`). Quem instalou versões anteriores pode deletar os arquivos órfãos em `~/.cursor/commands/` — não havia efeito.
- `akcit-docs install` retorna **exit code 1** quando pelo menos um cliente falhar (antes silenciava com exit 0). CI/scripts que usam o exit code para detectar falhas devem verificar.
- `package.json#bin` normalizado de `./dist/cli.js` → `dist/cli.js` (remove warning do npm sobre prefixo `./`).

### Removed
- `GEMINI.md` deixou de ser shipado no tarball npm. O conteúdo é gerado em runtime no destino correto (`~/.gemini/extensions/docs-agent/GEMINI.md`) pelo template `geminiContext()` durante `install`/`add`.
- Funções `cursorCommand`, `cursorPromptCommand` e `cursorPromptCodeCommand` removidas de `src/templates.ts` (deixaram de ter consumidor depois do fix do escopo Cursor).

### Internal
- `package.json#files` lista explicitamente `.agents/skills/{docs,prompt,prompt-code}` e `skills/{docs,prompt,prompt-code}` em vez do glob `.agents/skills`/`skills` — evita vazamento de skills auto-geradas em capturas locais (`docs-adk`, `docs-nextjs`) para o tarball publicado.

## [0.1.2] - 2026-05-08

### Added
- Skill/comando `/prompt` baseado no framework **COSTAR-A** (Context, Objective, Style, Tone, Audience, Response, Answer) para Claude Code, Codex CLI, Cursor e Gemini CLI.
- Skill/comando `/prompt-code` (doc-grounded coding prompts) que força o agente a inspecionar `manifest.json`, `api-index.md`, `examples-index.md`, `snippets.json` e os Markdown de origem antes de gerar/revisar código.
- Agentes Codex OpenAI YAML para `prompt` e `prompt-code` em `skills/{prompt,prompt-code}/agents/openai.yaml`.
- Auto-install das três skills (`docs`, `prompt`, `prompt-code`) via `akcit-docs install` e `akcit-docs add` — escopo HOME (`~/.claude/skills/`, `~/.cursor/commands/`, `~/.codex/plugins/docs-agent/skills/`, `~/.gemini/extensions/docs-agent/commands/`).

### Changed
- `package.json#bin` normalizado de `./dist/cli.js` → `dist/cli.js` (remove warning do npm sobre prefixo `./`).

## [0.1.1] - 2026-05-01

First public npm release. Version 0.1.0 was tagged locally but never published; bumped to 0.1.1 to avoid reusing a tag that already pointed to a different commit on the remote.

### Added
- CLI `akcit-docs` com comandos `capture`, `add`, `install-skill`, `mcp`, `doctor`.
- Pipeline de captura em cascade: `llms-full.txt` → `llms.txt` → `.md`/`.mdx` → `sitemap.xml` → crawl escopado → fallback Playwright opcional.
- Conversão HTML → Markdown via cheerio + turndown.
- Geração automática de skill por tecnologia capturada (Claude Code, Codex CLI, Cursor, Gemini CLI).
- Servidor MCP via stdio expondo a tool `capture_docs`.
- Camada de retry com backoff exponencial e respeito ao header `Retry-After`.
- Resume automático via `manifest.json` (re-rodar `capture` pula URLs já capturadas; `--force` recaptura tudo).
- UX TTY: barra de progresso, modos `--verbose`, `--quiet`, `--json`.
- Instalador multi-cliente (`add` / `install-skill`) com escopos co-located, project e HOME.

### Security
- SSRF guard: bloqueia loopback, RFC-1918, link-local, multicast e IPv6 ULA antes de cada `fetch`.
- Honra `robots.txt` por padrão (override explícito via `--no-respect-robots`).
- `User-Agent` identificável: `akcit-docs-agent/0.1 (+https://github.com/akcit/docs-agent)`.
- Validação Zod em todas as entradas do MCP server.
- Defaults polite: `concurrency=2`, `rate-limit-ms=750`, `max-retries=5`, jitter on.
- Guardrail `LARGE_CRAWL_THRESHOLD=500` exige `--force-large-crawl` para crawls grandes.

[Unreleased]: https://github.com/Panix-Inc/akcit-docs-agent/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/Panix-Inc/akcit-docs-agent/releases/tag/v0.2.2
[0.2.1]: https://github.com/Panix-Inc/akcit-docs-agent/releases/tag/v0.2.1
[0.2.0]: https://github.com/Panix-Inc/akcit-docs-agent/releases/tag/v0.2.0
[0.1.2]: https://github.com/Panix-Inc/akcit-docs-agent/releases/tag/v0.1.2
[0.1.1]: https://github.com/Panix-Inc/akcit-docs-agent/releases/tag/v0.1.1
