import type { CaptureManifest, CapturedPage } from "./types.js";

const PACKAGE_NAME = "@akcit/docs-agent";
const TOP_ENTRY_LIMIT = 8;

/**
 * H1 fix: sanitize values interpolated into YAML frontmatter.
 * Strip newlines (which would terminate the value or inject extra keys) and
 * defang any `---` (which would close the frontmatter block early).
 */
function sanitizeYamlInline(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/^---/gm, "- --")
    .trim();
}

/**
 * M3 fix: escape Markdown link syntax characters to prevent a crafted page
 * title from breaking out of `[title](url)` and injecting attacker-controlled
 * link targets into the agent-readable skill body.
 */
function escapeMarkdownLinkText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/**
 * Trigger description used as frontmatter `description:` (Claude/Codex/Cursor)
 * or as the descriptor in extension manifests (Gemini).
 */
export function techSkillDescription(manifest: CaptureManifest): string {
  const name = sanitizeYamlInline(manifest.name);
  const sourceUrl = sanitizeYamlInline(manifest.sourceUrl);
  return `Use when the user asks about ${name} or related topics covered by ${sourceUrl}. References local Markdown documentation captured from that source — prefer this over web search when the user's question matches the captured topic.`;
}

/**
 * Markdown body shared across all client formats — describes what the skill
 * does and how to navigate the captured docs.
 */
export function techSkillBody(manifest: CaptureManifest): string {
  const tech = manifest.name;
  const source = manifest.sourceUrl;
  const captured = manifest.generatedAt.slice(0, 10);
  const sections = topLevelSections(manifest.pages);
  const entries = quickEntries(manifest.pages, TOP_ENTRY_LIMIT);

  const sectionLines = sections.length > 0
    ? sections.map((s) => `- [\`${s}/\`](./${s}/)`).join("\n")
    : "- (no subdirectories)";

  const entryLines = entries
    .map((p) => `- [${formatTitle(p)}](./${p.outputPath})`)
    .join("\n");

  return `# ${tech} knowledge base

**Source:** ${source}
**Captured:** ${captured}
**Pages:** ${manifest.pages.length}

## When to use this skill

Activate whenever the user mentions ${tech}, asks how to use it, or needs an API/conceptual reference. The local Markdown in this directory is the authoritative knowledge base for this topic — read it before searching the web.

Before answering API-specific or version-sensitive questions, check [\`manifest.json\`](./manifest.json) for \`generatedAt\`, source URLs, and captured pages. If the capture date may be stale for the user's question, say that explicitly and recommend refreshing before relying on exact behavior.

When you use this knowledge base, cite the local Markdown file path you relied on, such as \`docs/${tech}/index.md\` or a subpage path from the manifest.

For coding tasks, prefer the generated code indexes before writing or reviewing code:

- [\`api-index.md\`](./api-index.md) lists detected symbols, imports, commands, and endpoints.
- [\`examples-index.md\`](./examples-index.md) points to captured code examples.
- [\`snippets.json\`](./snippets.json) contains structured code snippets with source pages.

## How to navigate

1. **Start with [\`index.md\`](./index.md)** for the high-level overview.
2. **Drill into subdirectories** for specific topics. Top-level sections:

${sectionLines}

3. **Search across all files** for specific symbols, APIs, or concepts. From this directory:

\`\`\`bash
rg -n "<keyword>" .
\`\`\`

4. **Consult [\`manifest.json\`](./manifest.json)** for the complete list of captured pages and their original source URLs.

## Coding workflow

1. Search \`api-index.md\`, \`examples-index.md\`, and \`snippets.json\` for relevant APIs, imports, commands, and examples.
2. Read the source Markdown pages for any selected examples before using them.
3. Implement with APIs confirmed in the captured docs; do not invent package names, imports, or options.
4. Run the project's tests, typecheck, or build commands when available.
5. Cite the local doc paths used and call out any behavior not covered by the captured docs.

For code review requests, compare the implementation against the captured docs and report objective issues: nonexistent APIs, wrong imports, missing configuration, outdated patterns, and missing validation or tests.

## Quick entry points

${entryLines}

## Refreshing the knowledge base

If the docs may be out of date, re-capture (skips already-captured pages by default):

\`\`\`bash
npx -y ${PACKAGE_NAME} capture ${source}
\`\`\`

Use \`--force\` to re-fetch every page.
`;
}

/**
 * Claude Code / Codex CLI format: SKILL.md with YAML frontmatter (`name`, `description`).
 */
export function techSkillMarkdown(manifest: CaptureManifest): string {
  return `---
name: docs-${manifest.name}
description: ${techSkillDescription(manifest)}
---

${techSkillBody(manifest)}`;
}

/**
 * Cursor `.mdc` rule format: YAML frontmatter with `description` (auto-attach trigger),
 * empty `globs`, `alwaysApply: false` (rule auto-attaches based on the description).
 */
export function techSkillCursor(manifest: CaptureManifest): string {
  return `---
description: ${techSkillDescription(manifest)}
globs:
alwaysApply: false
---

${techSkillBody(manifest)}`;
}

/**
 * Gemini context file (no frontmatter — Gemini extensions load this as raw markdown context).
 */
export function techSkillGemini(manifest: CaptureManifest): string {
  return techSkillBody(manifest);
}

/**
 * Gemini extension manifest (`gemini-extension.json`).
 */
export function techSkillGeminiExtension(tech: string, sourceUrl: string): string {
  return `${JSON.stringify({
    name: `docs-${tech}`,
    version: "0.1.0",
    description: `Knowledge base captured by @akcit/docs-agent from ${sourceUrl}.`,
    contextFileName: "GEMINI.md"
  }, null, 2)}\n`;
}

/**
 * Codex plugin manifest (`plugin.json`) for a tech-specific knowledge base.
 */
export function techSkillCodexPlugin(tech: string, sourceUrl: string): string {
  return `${JSON.stringify({
    name: `docs-${tech}`,
    version: "0.1.0",
    description: `Knowledge base captured by @akcit/docs-agent from ${sourceUrl}.`,
    skills: "./skills/"
  }, null, 2)}\n`;
}

function topLevelSections(pages: CapturedPage[]): string[] {
  const sections = new Set<string>();
  for (const p of pages) {
    const parts = p.outputPath.split("/").filter(Boolean);
    if (parts.length > 1 && parts[0]) sections.add(parts[0]);
  }
  return [...sections].sort();
}

function quickEntries(pages: CapturedPage[], limit: number): CapturedPage[] {
  const indexEntry = pages.find((p) => p.outputPath === "index.md");
  const others = pages
    .filter((p) => p.outputPath !== "index.md")
    .sort((a, b) => a.outputPath.localeCompare(b.outputPath));
  const result: CapturedPage[] = [];
  if (indexEntry) result.push(indexEntry);
  for (const p of others) {
    if (result.length >= limit) break;
    result.push(p);
  }
  return result;
}

function formatTitle(page: CapturedPage): string {
  // M3 fix: escape Markdown link syntax to prevent injection via crafted titles.
  const raw = page.title && page.title.trim().length > 0 ? page.title.trim() : page.outputPath;
  return escapeMarkdownLinkText(raw);
}
