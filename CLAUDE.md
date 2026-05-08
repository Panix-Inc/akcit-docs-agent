# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@akcit/docs-agent` (CLI binary: `akcit-docs`) is a Node 20+ TypeScript package that captures public documentation websites, converts them into organized Markdown under `docs/<technology>/`, and ships integrations for Codex, Claude Code, Cursor, and Gemini CLI. It also exposes its capability as an MCP server (tool: `capture_docs`).



## Common Commands

```bash
npm install                 # install dependencies
npm run build               # tsc → dist/
npm run typecheck           # tsc --noEmit
npm test                    # vitest run (all tests)
npm run dev                 # run CLI via tsx (no build step)
```

Run a single test file or test by name:

```bash
npx vitest run src/utils.test.ts
npx vitest run -t "slugifies technology names"
```

Exercise the built CLI locally (after `npm run build`):

```bash
node dist/cli.js capture <url> --name <tech>             # capture docs
node dist/cli.js add --home /tmp/docs-agent-home         # test installer in sandbox HOME
node dist/cli.js install --clients codex,claude          # explicit installer
node dist/cli.js mcp                                     # start MCP server over stdio
node dist/cli.js doctor                                  # check Node + Playwright availability
```

Verify npm packaging without publishing:

```bash
npm pack --dry-run --cache /tmp/akcit-docs-agent-npm-cache
```

## Architecture

### Capture pipeline (`src/capture.ts`)

`captureDocs()` is the single entry point used by both the CLI (`capture` command) and the MCP server. The discovery cascade is intentional and ordered — the first source that yields pages wins:

1. `llms-full.txt` and `llms.txt` at the domain and base path (LLM-optimized sources).
2. Direct `.md` / `.mdx` URLs.
3. `sitemap.xml`, `sitemap_index.xml`, and sitemaps declared in `robots.txt`.
4. Scoped crawl restricted to the seed URL's domain/path.
5. Optional Playwright fallback (`optionalDependencies`) for SPA sites when `--no-headless` is not set.

Guardrails enforced here:
- `LARGE_CRAWL_THRESHOLD = 500` pages — exceeding it requires `--force-large-crawl`.
- `robots.txt` is honored unless `--no-respect-robots` is passed.
- `rateLimitMs` throttles between requests.
- HTML → Markdown conversion only happens when no native Markdown source exists; conversion lives in `src/markdown.ts` (cheerio + turndown).

### Output contract

For each capture, the agent writes:
- `docs/<tech>/...*.md` — page content (paths derived via `outputPathForUrl` in `src/utils.ts`).
- `docs/<tech>/index.md` — auto-generated only if no captured page already produced an `index.md`.
- `docs/<tech>/manifest.json` — `CaptureManifest` (see `src/types.ts`): name, sourceUrl, generatedAt, sourceKinds, pages (with hash + source), failures.

`writeTextIfChanged` is used so unchanged files don't churn mtimes/hashes between runs.

### MCP server (`src/mcp.ts`)

Exposes the same capture functionality as the `capture_docs` tool over stdio using `@modelcontextprotocol/sdk`. Started by `akcit-docs mcp`. The repo-local `.mcp.json` registers this server as `docsAgent`.

### Multi-client installer (`src/install.ts`, `src/templates.ts`)

`installIntegrations({ clients, homeDir })` writes integration files into the user's HOME for any combination of `codex`, `claude`, `cursor`, `gemini` (or `all`). The `add` CLI command is a thin alias matching the `npx skills add` UX. Always pass `--home <dir>` when testing locally to avoid mutating your real `~`.

Templates for each client are centralized in `src/templates.ts`; the bundled assets shipped with the package (`.codex-plugin/`, `.agents/skills/`, `.claude/`, `skills/`, `commands/`, `gemini-extension.json`, `.mcp.json`, `GEMINI.md`) are listed in the `files` array of `package.json` and must stay in sync with the installer.

### Type model (`src/types.ts`)

Five small interfaces drive the system: `CaptureOptions`, `DiscoveredPage`, `CapturedPage`, `CaptureFailure`, `CaptureManifest`, `CaptureResult`. `SourceKind` (`"llms" | "markdown" | "sitemap" | "crawl"`) is the canonical provenance label written into the manifest.

## Conventions Specific to This Repo

- **ESM only.** `"type": "module"`, `"module": "NodeNext"`. All relative imports must include the `.js` extension (e.g. `import { ... } from "./capture.js"`) even though the source is `.ts`.
- **Test files are excluded from the build.** `tsconfig.json` excludes `src/**/*.test.ts`; tests stay in `src/` next to the code they cover and run via Vitest.
- **`playwright` is an optional dependency.** Headless-fallback code paths must tolerate its absence — `cli.ts doctor` checks for it explicitly. Don't promote it to a hard dependency.
- **`robots-parser` has a hand-written ambient declaration** at `src/robots-parser.d.ts`. If you change how it's imported, update the `.d.ts`.
- **Default User-Agent** is built dynamically from `package.json#version` at runtime (`akcit-docs-agent/${pkg.version}`, see `src/capture.ts`). No manual bump needed during releases — the UA tracks the published version automatically.
- **Project documentation language is Portuguese (Brazilian).** README.md and Gemini extension docs are in pt-BR. Match the existing language when editing user-facing prose; keep code, identifiers, and CLI strings in English.
