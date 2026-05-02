import { describe, expect, it } from "vitest";
import {
  techSkillCodexPlugin,
  techSkillCursor,
  techSkillGemini,
  techSkillGeminiExtension,
  techSkillMarkdown
} from "./tech-skill.js";
import type { CaptureManifest } from "./types.js";

function makeManifest(overrides?: Partial<CaptureManifest>): CaptureManifest {
  return {
    name: "adk",
    sourceUrl: "https://adk.dev/",
    generatedAt: "2026-05-01T18:22:22.830Z",
    sourceKinds: ["llms", "markdown"],
    pages: [
      { url: "https://adk.dev/llms-full.txt", source: "llms", title: "Agent Development Kit (ADK)", outputPath: "index.md", hash: "h1" },
      { url: "https://adk.dev/agents/llm-agents/index.md", source: "markdown", title: "LLM Agent", outputPath: "agents/llm-agents/index.md", hash: "h2" },
      { url: "https://adk.dev/agents/multi-agents/index.md", source: "markdown", title: "Multi-agent systems", outputPath: "agents/multi-agents/index.md", hash: "h3" },
      { url: "https://adk.dev/tutorials/agent-team/index.md", source: "markdown", title: "Agent Team Tutorial", outputPath: "tutorials/agent-team/index.md", hash: "h4" },
      { url: "https://adk.dev/get-started/python/index.md", source: "markdown", title: "Python Quickstart", outputPath: "get-started/python/index.md", hash: "h5" }
    ],
    failures: [],
    ...overrides
  };
}

describe("techSkillMarkdown", () => {
  it("includes correct frontmatter with name and description", () => {
    const out = techSkillMarkdown(makeManifest());
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("name: docs-adk");
    expect(out).toContain("description: Use when the user asks about adk");
    expect(out).toContain("https://adk.dev/");
  });

  it("includes captured date in YYYY-MM-DD format", () => {
    const out = techSkillMarkdown(makeManifest());
    expect(out).toContain("**Captured:** 2026-05-01");
  });

  it("lists top-level sections sorted alphabetically", () => {
    const out = techSkillMarkdown(makeManifest());
    const sectionsBlock = out.split("Top-level sections:")[1] ?? "";
    const agentsIdx = sectionsBlock.indexOf("`agents/`");
    const getStartedIdx = sectionsBlock.indexOf("`get-started/`");
    const tutorialsIdx = sectionsBlock.indexOf("`tutorials/`");
    expect(agentsIdx).toBeGreaterThan(-1);
    expect(getStartedIdx).toBeGreaterThan(agentsIdx);
    expect(tutorialsIdx).toBeGreaterThan(getStartedIdx);
  });

  it("includes index.md as first quick entry", () => {
    const out = techSkillMarkdown(makeManifest());
    const quickIdx = out.indexOf("## Quick entry points");
    const indexIdx = out.indexOf("[Agent Development Kit (ADK)](./index.md)", quickIdx);
    expect(indexIdx).toBeGreaterThan(quickIdx);
  });

  it("falls back to outputPath when title is missing", () => {
    const m = makeManifest({
      pages: [
        { url: "https://x.com/a", source: "markdown", title: "", outputPath: "some/path.md", hash: "h" }
      ]
    });
    const out = techSkillMarkdown(m);
    expect(out).toContain("[some/path.md](./some/path.md)");
  });

  it("handles manifest with no subdirectories gracefully", () => {
    const m = makeManifest({
      pages: [{ url: "https://x.com/", source: "markdown", title: "Root", outputPath: "index.md", hash: "h" }]
    });
    const out = techSkillMarkdown(m);
    expect(out).toContain("(no subdirectories)");
  });

  it("limits quick entries to 8", () => {
    const pages = Array.from({ length: 30 }, (_, i) => ({
      url: `https://x.com/p${i}`,
      source: "markdown" as const,
      title: `Page ${i}`,
      outputPath: `p${i}.md`,
      hash: `h${i}`
    }));
    const out = techSkillMarkdown(makeManifest({ pages }));
    const quickBlock = out.split("## Quick entry points")[1]?.split("## Refreshing")[0] ?? "";
    const bulletCount = (quickBlock.match(/^- /gm) ?? []).length;
    expect(bulletCount).toBeLessThanOrEqual(8);
  });

  it("includes the refresh command with package name and source URL", () => {
    const out = techSkillMarkdown(makeManifest());
    expect(out).toContain("npx -y @akcit/docs-agent capture https://adk.dev/");
  });

  it("instructs agents to check freshness, cite local files, and use rg", () => {
    const out = techSkillMarkdown(makeManifest());
    expect(out).toContain("check [`manifest.json`](./manifest.json) for `generatedAt`");
    expect(out).toContain("cite the local Markdown file path");
    expect(out).toContain("rg -n \"<keyword>\" .");
    expect(out).not.toContain("grep -ri \"<keyword>\" .");
  });

  it("instructs coding agents to use generated code indexes", () => {
    const out = techSkillMarkdown(makeManifest());
    expect(out).toContain("[`api-index.md`](./api-index.md)");
    expect(out).toContain("[`examples-index.md`](./examples-index.md)");
    expect(out).toContain("[`snippets.json`](./snippets.json)");
    expect(out).toContain("## Coding workflow");
    expect(out).toContain("nonexistent APIs, wrong imports, missing configuration");
  });
});

describe("techSkillCursor", () => {
  it("uses cursor-specific frontmatter (description, globs, alwaysApply)", () => {
    const out = techSkillCursor(makeManifest());
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("description: Use when the user asks about adk");
    expect(out).toContain("globs:");
    expect(out).toContain("alwaysApply: false");
    expect(out).not.toContain("name: docs-adk"); // cursor frontmatter has no `name`
    expect(out).toContain("# adk knowledge base"); // body shared with claude
  });
});

describe("techSkillGemini", () => {
  it("returns body without YAML frontmatter (raw context)", () => {
    const out = techSkillGemini(makeManifest());
    expect(out).not.toMatch(/^---/);
    expect(out).toContain("# adk knowledge base");
    expect(out).toContain("https://adk.dev/");
  });

  it("techSkillGeminiExtension returns valid manifest JSON", () => {
    const json = JSON.parse(techSkillGeminiExtension("adk", "https://adk.dev/")) as {
      name: string; version: string; description: string; contextFileName: string;
    };
    expect(json.name).toBe("docs-adk");
    expect(json.contextFileName).toBe("GEMINI.md");
    expect(json.description).toContain("https://adk.dev/");
  });
});

describe("techSkillCodexPlugin", () => {
  it("returns valid plugin.json for codex tech skill", () => {
    const json = JSON.parse(techSkillCodexPlugin("adk", "https://adk.dev/")) as {
      name: string; skills: string; description: string;
    };
    expect(json.name).toBe("docs-adk");
    expect(json.skills).toBe("./skills/");
    expect(json.description).toContain("https://adk.dev/");
  });
});
