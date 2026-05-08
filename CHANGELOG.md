# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ffpaniago/akcit-docs-agent/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/ffpaniago/akcit-docs-agent/releases/tag/v0.1.2
[0.1.1]: https://github.com/ffpaniago/akcit-docs-agent/releases/tag/v0.1.1
