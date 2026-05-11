```text
 █████╗ ██╗  ██╗ ██████╗██╗████████╗
██╔══██╗██║ ██╔╝██╔════╝██║╚══██╔══╝
███████║█████╔╝ ██║     ██║   ██║
██╔══██║██╔═██╗ ██║     ██║   ██║
██║  ██║██║  ██╗╚██████╗██║   ██║
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝   ╚═╝
CENTRO DE COMPETÊNCIA EMBRAPII EM TECNOLOGIAS IMERSIVAS
```

[![npm version](https://img.shields.io/npm/v/@akcit/docs-agent.svg)](https://www.npmjs.com/package/@akcit/docs-agent)
[![npm downloads](https://img.shields.io/npm/dm/@akcit/docs-agent.svg)](https://www.npmjs.com/package/@akcit/docs-agent)
[![license](https://img.shields.io/npm/l/@akcit/docs-agent.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@akcit/docs-agent.svg)](https://nodejs.org)
[![provenance](https://img.shields.io/badge/provenance-signed-brightgreen.svg)](https://www.npmjs.com/package/@akcit/docs-agent)

# @akcit/docs-agent

**English** | [Português do Brasil](./README.pt-BR.md)

Capture documentation websites, convert them into organized Markdown, and make those docs available to AI coding agents through CLI commands, MCP, and client integrations.

`@akcit/docs-agent` ships three capabilities in one npm package:

1. **Documentation capture**: downloads public documentation sites into `docs/<technology>/`, then generates a technology-specific skill for Claude Code, Codex CLI, Cursor, and Gemini CLI. Agents can discover the local knowledge base and use it as context without manual setup.
2. **`/prompt`**: rewrites rough requests into structured prompts using the **COSTAR-A** framework.
3. **`/prompt-code`**: creates implementation or review prompts grounded in the local documentation captured by Docs Agent.

Available on npm: **[npmjs.com/package/@akcit/docs-agent](https://www.npmjs.com/package/@akcit/docs-agent)**, published with [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) through GitHub Actions OIDC and sigstore.

This project was built as a mini-project for the **Software Engineering with an Artificial Intelligence focus** course at AKCIT/Cegraf UFG, Universidade Federal de Goiás, 2026.

---

## Installation

Use it directly with `npx`:

```bash
npx -y @akcit/docs-agent <command>
```

Or install it globally for repeated use:

```bash
npm install -g @akcit/docs-agent
akcit-docs add        # installs /docs, /prompt, /prompt-code for the supported clients
```

> **Why two steps?** `npm install -g` only adds the binary to your PATH. Integration files such as skills, commands, and MCP config are written to your `$HOME` by `akcit-docs add`. This avoids using `postinstall` to mutate your home directory silently, which is an npm anti-pattern.
>
> ```bash
> akcit-docs               # status report: installed, missing, or outdated files
> akcit-docs status        # same report through an explicit subcommand
> akcit-docs add           # apply current templates to all supported clients
> akcit-docs add --force   # overwrite locally modified files, preserving .bak backups
> ```

Requires **Node.js 20+**.

## Quickstart

```bash
# Capture docs into docs/<tech>/ and install a project-scoped skill
npx -y @akcit/docs-agent capture https://adk.dev

# Capture docs and install the generated skill globally in HOME
npx -y @akcit/docs-agent capture https://adk.dev --install
```

After that, open the project in Claude Code, Codex CLI, Cursor, or Gemini CLI. The generated `docs-adk` skill is available, and the agent can activate it when the request matches the captured documentation.

## Main Commands

| Command | Purpose |
|---|---|
| `capture <url>` | Capture docs into `docs/<tech>/`, generate `SKILL.md`, and install it project-scoped |
| `add` | Install Docs Agent commands, skills, plugin files, and MCP config for supported clients |
| `install-skill <tech>` | Install an already captured technology skill in HOME, or project-scoped with `--local` |
| `/prompt <text>` | Improve a rough question or prompt using COSTAR-A |
| `/prompt-code <text>` | Create implementation or review prompts grounded in local docs |
| `mcp` | Start the MCP server over stdio with the `capture_docs` tool |
| `doctor` | Check Node.js, Playwright availability, and HOME integration paths |

For the complete flag reference, run:

```bash
npx -y @akcit/docs-agent capture --help
```

## `/prompt`: Terminal Prompt Engineer

`/prompt` rewrites a vague request into a complete prompt using **COSTAR-A**, based on the paper [COSTAR-A: A prompting framework for enhancing Large Language Model performance on Point-of-View questions](./references/costar.pdf).

COSTAR-A uses seven blocks:

| Block | Role | Question it answers |
|---|---|---|
| **C**ontext | Scenario, constraints, and relevant facts | What situation is this happening in? |
| **O**bjective | Concrete task | What should the model do? |
| **S**tyle | Writing or reasoning style | How should the response read? |
| **T**one | Attitude | Formal, direct, supportive, neutral? |
| **A**udience | Reader profile | Who will read the answer? |
| **R**esponse | Format, language, length, validation | How should the answer be delivered? |
| **A**nswer | Final execution directive | Produce the final answer now |

Example:

```bash
/prompt explain React hooks to a junior developer
```

Output:

```text
# Context #
You are helping a junior developer understand React hooks while learning the library.
#############
# Objective #
Explain what hooks are, why they exist, and when to use useState, useEffect, and useContext.
#############
# Style #
Didactic, with short code examples before each explanation.
#############
# Tone #
Clear, direct, and encouraging.
#############
# Audience #
Junior developer with basic JavaScript ES6 and functional component knowledge.
#############
# Response #
Answer in English, in up to 400 words, with 3 sections and one code example per section.
#############
# Answer #
Produce the final explanation now, following the sections and word limit exactly.
```

## `/prompt-code`: Coding Prompts Grounded in Local Docs

After capturing documentation, Docs Agent generates lightweight indexes that help coding agents implement or review code against local Markdown sources:

- `api-index.md`: symbols, imports, commands, and endpoints detected with lightweight heuristics.
- `examples-index.md`: code examples and their source pages.
- `snippets.json`: structured code blocks with language, page, section, and content.

Use `/prompt-code` to turn a simple coding request into a COSTAR-A prompt that requires the agent to inspect `manifest.json`, indexes, and the original Markdown pages before implementing.

```bash
/prompt-code create an ADK agent with a custom tool using the local docs
```

The generated prompt includes:

- which local documentation to inspect;
- APIs and examples to confirm before use;
- acceptance criteria;
- verification commands such as tests, typecheck, or build;
- local documentation citations the coding agent must report.

It also works for code review:

```bash
/prompt-code review this code against the local Next.js docs and flag incorrect APIs
```

## Client Integrations

Install Docs Agent integrations for the supported clients:

```bash
# All supported clients
npx -y @akcit/docs-agent add

# Subsets
npx -y @akcit/docs-agent add --clients codex,claude
npx -y @akcit/docs-agent add --clients cursor,gemini
```

Restart the client after installation so it can detect the new commands and skills.

## Capture Defaults

- **Polite by default**: `concurrency=2`, `rate-limit-ms=750`, `max-retries=5`, jitter enabled. Use `--aggressive` only for tolerant CDN-backed sites.
- **Automatic retry** for HTTP 408/425/429/5xx with exponential backoff and `Retry-After` support.
- **SSRF guard** blocks loopback, RFC-1918, link-local, multicast, and IPv6 ULA targets before every `fetch`.
- **Automatic resume**: rerunning `capture` skips URLs already present in `manifest.json`. Use `--force` to recapture everything.

## Architecture

The capture pipeline is intentionally ordered. The first source that yields pages wins:

1. `llms-full.txt` and `llms.txt` at the domain and base path.
2. Direct `.md` or `.mdx` URLs.
3. `sitemap.xml`, `sitemap_index.xml`, and sitemaps declared in `robots.txt`.
4. Scoped crawl restricted to the seed URL domain and path.
5. Optional Playwright fallback for SPA sites when headless mode is enabled and Playwright is available.

Each capture writes:

- `docs/<tech>/...*.md`: captured pages.
- `docs/<tech>/index.md`: generated only when no captured page produced an index.
- `docs/<tech>/manifest.json`: source URL, generation time, source kinds, page hashes, and failures.

For implementation details, security guardrails, generated skills, path tables, and local development workflow, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Local Development

```bash
npm install
npm run build
npm run typecheck
npm test
npm run dev
```

Run one test file or test name:

```bash
npx vitest run src/utils.test.ts
npx vitest run -t "slugifies technology names"
```

Verify npm packaging without publishing:

```bash
npm pack --dry-run --cache /tmp/akcit-docs-agent-npm-cache
```

## Academic Context

Practical delivery for the **Software Engineering with an AI focus** module at AKCIT/Cegraf UFG, 2026, based on the introductory lab proposal by Leon Sólon da Silva. The project exercises problem/solution framing, automation, npm packaging, multi-client AI integration, MCP, and software validation.

## License

MIT.
