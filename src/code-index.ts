import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CapturedPage } from "./types.js";
import { writeTextIfChanged } from "./utils.js";

export type CodeSymbolKind = "symbol" | "import" | "command" | "endpoint";

export interface CodeSnippet {
  id: string;
  language: string;
  outputPath: string;
  title: string;
  sourceUrl: string;
  section: string;
  code: string;
}

export interface CodeSymbol {
  kind: CodeSymbolKind;
  value: string;
  outputPath: string;
  title: string;
}

export interface CodeIndexResult {
  apiIndexPath: string;
  examplesIndexPath: string;
  snippetsPath: string;
  snippets: CodeSnippet[];
  symbols: CodeSymbol[];
}

export async function generateCodeIndexes(
  rootDir: string,
  pages: CapturedPage[],
  contentByOutputPath?: ReadonlyMap<string, string>
): Promise<CodeIndexResult> {
  const sortedPages = [...pages].sort((a, b) => a.outputPath.localeCompare(b.outputPath));

  const markdowns = await Promise.all(
    sortedPages.map(async (page) => {
      const cached = contentByOutputPath?.get(page.outputPath);
      if (cached !== undefined) return cached;
      try {
        return await readFile(path.join(rootDir, page.outputPath), "utf8");
      } catch {
        return null;
      }
    })
  );

  const snippets: CodeSnippet[] = [];
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < sortedPages.length; i++) {
    const markdown = markdowns[i];
    if (markdown === null || markdown === undefined) continue;
    const page = sortedPages[i]!;
    const pageSnippets = extractCodeSnippets(markdown, page);
    snippets.push(...pageSnippets);
    symbols.push(...extractSymbols(markdown, page, pageSnippets));
  }

  const uniqueSymbols = dedupeSymbols(symbols);
  await writeTextIfChanged(path.join(rootDir, "snippets.json"), `${JSON.stringify(snippets, null, 2)}\n`);
  await writeTextIfChanged(path.join(rootDir, "examples-index.md"), buildExamplesIndex(snippets));
  await writeTextIfChanged(path.join(rootDir, "api-index.md"), buildApiIndex(uniqueSymbols));

  return {
    apiIndexPath: "api-index.md",
    examplesIndexPath: "examples-index.md",
    snippetsPath: "snippets.json",
    snippets,
    symbols: uniqueSymbols
  };
}

export function extractCodeSnippets(markdown: string, page: CapturedPage): CodeSnippet[] {
  const snippets: CodeSnippet[] = [];
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = fence.exec(markdown)) !== null) {
    const language = normalizeLanguage(match[1] ?? "");
    const code = (match[2] ?? "").replace(/\n+$/, "");
    snippets.push({
      id: `${page.outputPath}#snippet-${index + 1}`,
      language,
      outputPath: page.outputPath,
      title: page.title,
      sourceUrl: page.url,
      section: nearestHeading(markdown.slice(0, match.index)),
      code
    });
    index++;
  }

  return snippets;
}

function extractSymbols(markdown: string, page: CapturedPage, snippets: CodeSnippet[]): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const push = (kind: CodeSymbol["kind"], value: string): void => {
    const clean = value.trim();
    if (clean.length > 0 && clean.length <= 160) {
      symbols.push({ kind, value: clean, outputPath: page.outputPath, title: page.title });
    }
  };

  for (const snippet of snippets) {
    for (const match of snippet.code.matchAll(/\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
      push("symbol", `${match[1]}()`);
    }
    for (const match of snippet.code.matchAll(/\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g)) {
      push("symbol", match[1] ?? "");
    }
    for (const match of snippet.code.matchAll(/\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
      push("symbol", match[1] ?? "");
    }
    for (const match of snippet.code.matchAll(/\bimport\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g)) {
      push("import", match[1] ?? "");
    }
    for (const match of snippet.code.matchAll(/^\s*(?:npm|npx|pnpm|yarn|bun|cargo|go|python|python3|pip|uv|node)\s+[^\n]+/gm)) {
      push("command", match[0] ?? "");
    }
    for (const match of snippet.code.matchAll(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[^\s"'`]+/g)) {
      push("endpoint", match[0] ?? "");
    }
  }

  for (const match of markdown.matchAll(/`([A-Za-z_$][\w$.:-]*(?:\(\))?)`/g)) {
    const value = match[1] ?? "";
    if (looksLikeApiSymbol(value)) push("symbol", value);
  }
  for (const match of markdown.matchAll(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[^\s"'`)<]+/g)) {
    push("endpoint", match[0] ?? "");
  }

  return symbols;
}

function buildExamplesIndex(snippets: CodeSnippet[]): string {
  const lines = ["# Code examples", "", "Generated from captured Markdown code fences.", ""];
  if (snippets.length === 0) {
    lines.push("No code examples were detected in the captured pages.", "");
    return lines.join("\n");
  }

  for (const snippet of snippets) {
    lines.push(`- ${snippet.language || "text"} example in [${snippet.outputPath}](./${snippet.outputPath})`);
    lines.push(`  - Section: ${snippet.section || snippet.title || "Untitled"}`);
    lines.push(`  - Snippet id: \`${snippet.id}\``);
  }
  lines.push("");
  return lines.join("\n");
}

function buildApiIndex(symbols: CodeSymbol[]): string {
  const lines = ["# API index", "", "Generated from captured Markdown text and code examples.", ""];
  if (symbols.length === 0) {
    lines.push("No API symbols, imports, commands, or endpoints were detected in the captured pages.", "");
    return lines.join("\n");
  }

  const kinds: readonly CodeSymbolKind[] = ["symbol", "import", "command", "endpoint"];
  for (const kind of kinds) {
    const items = symbols.filter((s) => s.kind === kind);
    if (items.length === 0) continue;
    lines.push(`## ${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`, "");
    for (const item of items) {
      lines.push(`- \`${item.value}\` — [${item.outputPath}](./${item.outputPath})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function dedupeSymbols(symbols: CodeSymbol[]): CodeSymbol[] {
  const seen = new Set<string>();
  const result: CodeSymbol[] = [];
  for (const symbol of symbols) {
    const key = `${symbol.kind}\0${symbol.value}\0${symbol.outputPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(symbol);
  }
  return result.sort((a, b) =>
    a.kind.localeCompare(b.kind) ||
    a.value.localeCompare(b.value) ||
    a.outputPath.localeCompare(b.outputPath)
  );
}

function nearestHeading(prefix: string): string {
  const headings = Array.from(prefix.matchAll(/^#{1,6}\s+(.+)$/gm));
  const last = headings[headings.length - 1];
  return last?.[1]?.trim() ?? "";
}

function normalizeLanguage(info: string): string {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function looksLikeApiSymbol(value: string): boolean {
  return (
    value.includes(".") ||
    value.includes("()") ||
    /^[A-Z][A-Za-z0-9_]+$/.test(value) ||
    /^[a-z][A-Za-z0-9_]+(?:-[a-z0-9_]+)+$/.test(value)
  );
}
