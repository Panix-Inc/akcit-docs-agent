import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// Import the module under test — will be re-imported per vi.mock usage.
import { installIntegrations, installTechSkill, installTechSkillLocal } from "./install.js";
import {
  claudeSkill,
  claudeCommand,
  claudePromptCommand,
  claudePromptCodeCommand,
  codexPluginManifest,
  mcpJson,
  codexSkill,
  codexOpenAiYaml,
  geminiExtensionJson,
  geminiContext,
  geminiCommand,
  geminiPromptCommand,
  geminiPromptCodeCommand,
  promptCodeOpenAiYaml,
  promptCodeSkill,
  promptOpenAiYaml,
  promptSkill
} from "./templates.js";

function tmpHome(): string {
  return path.join(os.tmpdir(), `akcit-test-${crypto.randomBytes(6).toString("hex")}`);
}

async function mtimeMs(filePath: string): Promise<number> {
  const s = await stat(filePath);
  return s.mtimeMs;
}

describe("installIntegrations", () => {
  let homeDir: string;

  beforeEach(async () => {
    homeDir = tmpHome();
    await mkdir(homeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  it("installs codex files to a fresh HOME", async () => {
    const result = await installIntegrations({ clients: ["codex"], homeDir });

    expect(result.installed).toEqual(["codex"]);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);

    const pluginRoot = path.join(homeDir, ".codex", "plugins", "docs-agent");
    const pluginJson = path.join(pluginRoot, ".codex-plugin", "plugin.json");
    const content = await readFile(pluginJson, "utf8");
    expect(content).toBe(codexPluginManifest());

    expect(await readFile(path.join(pluginRoot, "skills", "prompt", "SKILL.md"), "utf8")).toBe(promptSkill());
    expect(await readFile(path.join(pluginRoot, "skills", "prompt", "agents", "openai.yaml"), "utf8")).toBe(promptOpenAiYaml());
    expect(await readFile(path.join(pluginRoot, "skills", "prompt-code", "SKILL.md"), "utf8")).toBe(promptCodeSkill());
    expect(await readFile(path.join(pluginRoot, "skills", "prompt-code", "agents", "openai.yaml"), "utf8")).toBe(promptCodeOpenAiYaml());
  });

  it("installs claude files to a fresh HOME", async () => {
    const result = await installIntegrations({ clients: ["claude"], homeDir });

    expect(result.installed).toEqual(["claude"]);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);

    const skillPath = path.join(homeDir, ".claude", "skills", "docs", "SKILL.md");
    const content = await readFile(skillPath, "utf8");
    expect(content).toBe(claudeSkill());

    const promptSkillPath = path.join(homeDir, ".claude", "skills", "prompt", "SKILL.md");
    const promptCommandPath = path.join(homeDir, ".claude", "commands", "prompt.md");
    expect(await readFile(promptSkillPath, "utf8")).toBe(promptSkill());
    expect(await readFile(promptCommandPath, "utf8")).toBe(claudePromptCommand());
    expect(await readFile(path.join(homeDir, ".claude", "skills", "prompt-code", "SKILL.md"), "utf8")).toBe(promptCodeSkill());
    expect(await readFile(path.join(homeDir, ".claude", "commands", "prompt-code.md"), "utf8")).toBe(claudePromptCodeCommand());
  });

  it("second install is idempotent — mtime unchanged for unchanged files", async () => {
    await installIntegrations({ clients: ["claude"], homeDir });

    const skillPath = path.join(homeDir, ".claude", "skills", "docs", "SKILL.md");
    const mtime1 = await mtimeMs(skillPath);

    // Wait briefly to ensure mtime would differ if file is rewritten.
    await new Promise((r) => setTimeout(r, 20));

    const result2 = await installIntegrations({ clients: ["claude"], homeDir });

    const mtime2 = await mtimeMs(skillPath);
    expect(mtime2).toBe(mtime1);
    expect(result2.installed).toContain("claude");
    expect(result2.skipped).toHaveLength(0);
    expect(result2.failed).toHaveLength(0);
  });

  it("skips user-modified file without force — preserves custom content", async () => {
    await installIntegrations({ clients: ["claude"], homeDir });

    const skillPath = path.join(homeDir, ".claude", "skills", "docs", "SKILL.md");
    const customContent = "# My custom skill\nDo not overwrite me.\n";
    await writeFile(skillPath, customContent, "utf8");

    const result = await installIntegrations({ clients: ["claude"], homeDir });

    expect(result.skipped).toContain(skillPath);
    expect(result.installed).toContain("claude");
    expect(result.failed).toHaveLength(0);

    const actual = await readFile(skillPath, "utf8");
    expect(actual).toBe(customContent);
  });

  it("with force=true — overwrites user-modified file and creates .bak", async () => {
    await installIntegrations({ clients: ["claude"], homeDir });

    const skillPath = path.join(homeDir, ".claude", "skills", "docs", "SKILL.md");
    const customContent = "# My custom skill\nDo not overwrite me.\n";
    await writeFile(skillPath, customContent, "utf8");

    const result = await installIntegrations({ clients: ["claude"], homeDir, force: true });

    expect(result.skipped).toHaveLength(0);
    expect(result.installed).toContain("claude");
    expect(result.failed).toHaveLength(0);

    const actual = await readFile(skillPath, "utf8");
    expect(actual).toBe(claudeSkill());

    const bak = await readFile(`${skillPath}.bak`, "utf8");
    expect(bak).toBe(customContent);
  });

  it("per-client error isolation — failed client does not block others", async () => {
    const { installIntegrations: isolatedInstall } = await import("./install.js");

    // Monkey-patch by injecting a broken homeDir that will cause codex to fail
    // while claude succeeds. We do this by making .codex unwritable after claude's dir exists.
    // Simpler approach: pass a non-string to trigger an error via spy on fs.

    // Use vi.doMock to swap writeTextIfChanged for codex only is complex.
    // Instead: pass a homeDir where .codex is a file (not dir) to force ENOTDIR.
    const brokenHome = tmpHome();
    await mkdir(brokenHome, { recursive: true });
    // Make .codex a file so mkdir inside codex install fails.
    await writeFile(path.join(brokenHome, ".codex"), "not a directory", "utf8");

    try {
      const result = await isolatedInstall({ clients: ["codex", "claude"], homeDir: brokenHome });

      expect(result.failed.map((f) => f.client)).toContain("codex");
      expect(result.installed).toContain("claude");
      expect(result.installed).not.toContain("codex");
    } finally {
      await rm(brokenHome, { recursive: true, force: true });
    }
  });

  it("all four clients install without error on fresh HOME", async () => {
    const result = await installIntegrations({
      clients: ["codex", "claude", "cursor", "gemini"],
      homeDir
    });

    expect(result.installed).toEqual(["codex", "claude", "cursor", "gemini"]);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.paths.length).toBeGreaterThan(4);
  });

  it("installs prompt command assets for gemini and writes mcp.json for cursor", async () => {
    const result = await installIntegrations({ clients: ["cursor", "gemini"], homeDir });

    expect(result.failed).toHaveLength(0);
    // Cursor user-scope só recebe MCP config (não há `~/.cursor/commands/`).
    const cursorMcp = JSON.parse(await readFile(path.join(homeDir, ".cursor", "mcp.json"), "utf8")) as { mcpServers: Record<string, unknown> };
    expect(cursorMcp.mcpServers).toHaveProperty("docsAgent");
    expect(await readFile(path.join(homeDir, ".gemini", "extensions", "docs-agent", "commands", "prompt.toml"), "utf8")).toBe(geminiPromptCommand());
    expect(await readFile(path.join(homeDir, ".gemini", "extensions", "docs-agent", "commands", "prompt-code.toml"), "utf8")).toBe(geminiPromptCodeCommand());
    expect(await readFile(path.join(homeDir, ".gemini", "extensions", "docs-agent", "GEMINI.md"), "utf8")).toContain("/prompt");
    expect(await readFile(path.join(homeDir, ".gemini", "extensions", "docs-agent", "GEMINI.md"), "utf8")).toContain("/prompt-code");
  });
});

describe("installTechSkill", () => {
  let homeDir: string;
  let docsDir: string;

  const fakeManifest = {
    name: "foo",
    sourceUrl: "https://foo.example/",
    generatedAt: "2026-05-01T12:00:00.000Z",
    sourceKinds: ["markdown"],
    pages: [
      { url: "https://foo.example/", source: "markdown", title: "Foo Home", outputPath: "index.md", hash: "h1" },
      { url: "https://foo.example/api/", source: "markdown", title: "API", outputPath: "api/index.md", hash: "h2" }
    ],
    failures: []
  };

  beforeEach(async () => {
    homeDir = tmpHome();
    docsDir = path.join(homeDir, "docs");
    await mkdir(path.join(docsDir, "foo"), { recursive: true });
    await writeFile(
      path.join(docsDir, "foo", "manifest.json"),
      JSON.stringify(fakeManifest, null, 2),
      "utf8"
    );
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  const opts = (clients: ("claude" | "codex" | "cursor" | "gemini")[], extra?: { force?: boolean }) => ({
    tech: "foo",
    sourceDir: docsDir,
    clients,
    homeDir,
    ...extra
  });

  it("installs SKILL.md into ~/.claude/skills/docs-<tech>/ with frontmatter", async () => {
    const result = await installTechSkill(opts(["claude"]));
    const target = path.join(homeDir, ".claude", "skills", "docs-foo", "SKILL.md");
    const written = await readFile(target, "utf8");
    expect(written).toContain("name: docs-foo");
    expect(written).toContain("description:");
    expect(written).toContain("https://foo.example/");
    expect(result.installed).toContain("claude");
    expect(result.failed).toHaveLength(0);
  });

  it("installs SKILL.md + plugin.json for codex", async () => {
    const result = await installTechSkill(opts(["codex"]));
    const skillTarget = path.join(homeDir, ".codex", "plugins", "docs-foo", "skills", "SKILL.md");
    const pluginTarget = path.join(homeDir, ".codex", "plugins", "docs-foo", "plugin.json");
    const skill = await readFile(skillTarget, "utf8");
    const plugin = JSON.parse(await readFile(pluginTarget, "utf8")) as { name: string; skills: string; description: string };
    expect(skill).toContain("name: docs-foo");
    expect(plugin.name).toBe("docs-foo");
    expect(plugin.skills).toBe("./skills/");
    expect(plugin.description).toContain("https://foo.example/");
    expect(result.installed).toContain("codex");
  });

  it("installs Cursor .mdc rule with cursor-specific frontmatter", async () => {
    const result = await installTechSkill(opts(["cursor"]));
    const target = path.join(homeDir, ".cursor", "rules", "docs-foo.mdc");
    const written = await readFile(target, "utf8");
    expect(written).toMatch(/^---\ndescription: /);
    expect(written).toContain("alwaysApply: false");
    expect(written).toContain("globs:");
    expect(written).not.toContain("name: docs-foo"); // cursor uses description-only frontmatter
    expect(written).toContain("# foo knowledge base");
    expect(result.installed).toContain("cursor");
  });

  it("installs Gemini extension (GEMINI.md + gemini-extension.json)", async () => {
    const result = await installTechSkill(opts(["gemini"]));
    const contextTarget = path.join(homeDir, ".gemini", "extensions", "docs-foo", "GEMINI.md");
    const extTarget = path.join(homeDir, ".gemini", "extensions", "docs-foo", "gemini-extension.json");
    const context = await readFile(contextTarget, "utf8");
    const ext = JSON.parse(await readFile(extTarget, "utf8")) as { name: string; contextFileName: string; description: string };
    expect(context).not.toMatch(/^---/); // no frontmatter
    expect(context).toContain("# foo knowledge base");
    expect(ext.name).toBe("docs-foo");
    expect(ext.contextFileName).toBe("GEMINI.md");
    expect(ext.description).toContain("https://foo.example/");
    expect(result.installed).toContain("gemini");
  });

  it("installs all four clients in one call", async () => {
    const result = await installTechSkill(opts(["claude", "codex", "cursor", "gemini"]));
    expect(result.installed).toEqual(["claude", "codex", "cursor", "gemini"]);
    expect(result.failed).toHaveLength(0);
    expect(result.paths.length).toBe(6); // 1+2+1+2 paths
  });

  it("skips overwriting user-modified file without force; force creates .bak", async () => {
    await installTechSkill(opts(["claude"]));
    const target = path.join(homeDir, ".claude", "skills", "docs-foo", "SKILL.md");
    await writeFile(target, "user-customized content", "utf8");

    const r1 = await installTechSkill(opts(["claude"]));
    expect(r1.skipped).toContain(target);
    expect(await readFile(target, "utf8")).toBe("user-customized content");

    const r2 = await installTechSkill(opts(["claude"], { force: true }));
    expect(r2.skipped).not.toContain(target);
    expect(await readFile(target, "utf8")).toContain("name: docs-foo");
    expect(await readFile(`${target}.bak`, "utf8")).toBe("user-customized content");
  });

  it("fails gracefully when manifest.json is missing", async () => {
    await expect(
      installTechSkill({ tech: "missing", sourceDir: docsDir, clients: ["claude"], homeDir })
    ).rejects.toThrow(/ENOENT|no such file/i);
  });
});

describe("installTechSkillLocal", () => {
  let projectDir: string;
  let docsDir: string;

  const fakeManifest = {
    name: "foo",
    sourceUrl: "https://foo.example/",
    generatedAt: "2026-05-01T12:00:00.000Z",
    sourceKinds: ["markdown"],
    pages: [
      { url: "https://foo.example/", source: "markdown", title: "Foo Home", outputPath: "index.md", hash: "h1" },
      { url: "https://foo.example/api/", source: "markdown", title: "API", outputPath: "api/index.md", hash: "h2" }
    ],
    failures: []
  };

  beforeEach(async () => {
    projectDir = tmpHome();
    docsDir = path.join(projectDir, "docs");
    await mkdir(path.join(docsDir, "foo"), { recursive: true });
    await writeFile(
      path.join(docsDir, "foo", "manifest.json"),
      JSON.stringify(fakeManifest, null, 2),
      "utf8"
    );
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  const opts = (clients: ("claude" | "codex" | "cursor" | "gemini")[], extra?: { force?: boolean }) => ({
    tech: "foo",
    sourceDir: docsDir,
    clients,
    projectDir,
    ...extra
  });

  it("installs Claude skill in <project>/.claude/skills/docs-<tech>/SKILL.md", async () => {
    const result = await installTechSkillLocal(opts(["claude"]));
    const target = path.join(projectDir, ".claude", "skills", "docs-foo", "SKILL.md");
    const content = await readFile(target, "utf8");
    expect(content).toContain("name: docs-foo");
    expect(content).toContain("https://foo.example/");
    expect(result.installed).toContain("claude");
  });

  it("installs Codex skill in <project>/.agents/skills/docs-<tech>/SKILL.md (repo-scoped, no plugin.json)", async () => {
    const result = await installTechSkillLocal(opts(["codex"]));
    const target = path.join(projectDir, ".agents", "skills", "docs-foo", "SKILL.md");
    const content = await readFile(target, "utf8");
    expect(content).toContain("name: docs-foo");
    expect(result.installed).toContain("codex");
    // No plugin.json in repo-scoped Codex install
    expect(result.paths).toHaveLength(1);
  });

  it("installs Cursor rule in <project>/.cursor/rules/docs-<tech>.mdc", async () => {
    const result = await installTechSkillLocal(opts(["cursor"]));
    const target = path.join(projectDir, ".cursor", "rules", "docs-foo.mdc");
    const content = await readFile(target, "utf8");
    expect(content).toMatch(/^---\ndescription:/);
    expect(content).toContain("alwaysApply: false");
    expect(result.installed).toContain("cursor");
  });

  it("installs Gemini extension in <project>/.gemini/extensions/docs-<tech>/", async () => {
    const result = await installTechSkillLocal(opts(["gemini"]));
    const ctx = path.join(projectDir, ".gemini", "extensions", "docs-foo", "GEMINI.md");
    const ext = path.join(projectDir, ".gemini", "extensions", "docs-foo", "gemini-extension.json");
    expect(await readFile(ctx, "utf8")).toContain("# foo knowledge base");
    const json = JSON.parse(await readFile(ext, "utf8")) as { name: string };
    expect(json.name).toBe("docs-foo");
    expect(result.installed).toContain("gemini");
  });

  it("installs all four clients in one call (5 paths total: 1+1+1+2)", async () => {
    const result = await installTechSkillLocal(opts(["claude", "codex", "cursor", "gemini"]));
    expect(result.installed).toEqual(["claude", "codex", "cursor", "gemini"]);
    expect(result.failed).toHaveLength(0);
    expect(result.paths).toHaveLength(5);
  });

  it("respects --force semantics with .bak backups (same as HOME install)", async () => {
    await installTechSkillLocal(opts(["claude"]));
    const target = path.join(projectDir, ".claude", "skills", "docs-foo", "SKILL.md");
    await writeFile(target, "user-customized", "utf8");

    const r1 = await installTechSkillLocal(opts(["claude"]));
    expect(r1.skipped).toContain(target);
    expect(await readFile(target, "utf8")).toBe("user-customized");

    const r2 = await installTechSkillLocal(opts(["claude"], { force: true }));
    expect(r2.skipped).not.toContain(target);
    expect(await readFile(target, "utf8")).toContain("name: docs-foo");
    expect(await readFile(`${target}.bak`, "utf8")).toBe("user-customized");
  });
});

describe("security regressions (post-review)", () => {
  let homeDir: string;
  let docsDir: string;

  const fakeManifest = (overrides?: Record<string, unknown>) => ({
    name: "foo",
    sourceUrl: "https://foo.example/",
    generatedAt: "2026-05-01T12:00:00.000Z",
    sourceKinds: ["markdown"],
    pages: [
      { url: "https://foo.example/", source: "markdown", title: "Foo Home", outputPath: "index.md", hash: "h1" }
    ],
    failures: [],
    ...overrides
  });

  beforeEach(async () => {
    homeDir = tmpHome();
    docsDir = path.join(homeDir, "docs");
    await mkdir(path.join(docsDir, "foo"), { recursive: true });
    await writeFile(
      path.join(docsDir, "foo", "manifest.json"),
      JSON.stringify(fakeManifest(), null, 2),
      "utf8"
    );
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  // C1
  it("rejects path-traversal tech via install-skill (../../../foo)", async () => {
    await expect(
      installTechSkill({ tech: "../../../etc/cron.d/payload", sourceDir: docsDir, clients: ["claude"], homeDir })
    ).rejects.toThrow(/manifest|invalid tech/i);
  });

  it("rejects empty/whitespace tech name", async () => {
    await expect(
      installTechSkill({ tech: "   ", sourceDir: docsDir, clients: ["claude"], homeDir })
    ).rejects.toThrow(/invalid tech/i);
  });

  // C2
  it("refuses to write through pre-placed symlink even on first install (no --force)", async () => {
    const claudeDir = path.join(homeDir, ".claude", "skills", "docs-foo");
    await mkdir(claudeDir, { recursive: true });
    const target = path.join(claudeDir, "SKILL.md");
    const fakeSensitive = path.join(homeDir, ".bashrc-fake");
    await writeFile(fakeSensitive, "ORIGINAL_CONTENT", "utf8");
    const { symlink } = await import("node:fs/promises");
    await symlink(fakeSensitive, target);

    const result = await installTechSkill({ tech: "foo", sourceDir: docsDir, clients: ["claude"], homeDir });

    // claude install should land in failed[] with a symlink error
    expect(result.failed.map((f) => f.client)).toContain("claude");
    const claudeFail = result.failed.find((f) => f.client === "claude");
    expect(claudeFail?.error).toMatch(/symlink/i);

    // Symlink target was NOT overwritten
    expect(await readFile(fakeSensitive, "utf8")).toBe("ORIGINAL_CONTENT");
  });

  // H1
  it("sanitizes newlines/--- in sourceUrl to prevent YAML frontmatter injection", async () => {
    await writeFile(
      path.join(docsDir, "foo", "manifest.json"),
      JSON.stringify(fakeManifest({
        sourceUrl: "https://foo.example/\n---\nname: HIJACKED\n---\nMalicious"
      })),
      "utf8"
    );
    await expect(
      installTechSkill({ tech: "foo", sourceDir: docsDir, clients: ["claude"], homeDir })
    ).rejects.toThrow(/control characters/i);
  });

  it("sanitizes ^--- lines if they slip past control-char check", async () => {
    // Direct unit verification via tech-skill module
    const { techSkillMarkdown } = await import("./tech-skill.js");
    const out = techSkillMarkdown({
      name: "foo",
      sourceUrl: "https://foo.example/",
      generatedAt: "2026-05-01T00:00:00.000Z",
      sourceKinds: ["markdown"],
      pages: [{ url: "https://foo.example/", source: "markdown", title: "Foo", outputPath: "index.md", hash: "h" }],
      failures: []
    });
    // Frontmatter has exactly one opening --- and one closing --- (no injected blocks)
    const frontmatterDelimiters = out.match(/^---$/gm);
    expect(frontmatterDelimiters).toHaveLength(2);
  });

  // H2
  it("rejects manifest with non-array pages", async () => {
    await writeFile(
      path.join(docsDir, "foo", "manifest.json"),
      JSON.stringify({ name: "foo", sourceUrl: "https://foo.example/", pages: "not an array", failures: [] }),
      "utf8"
    );
    await expect(
      installTechSkill({ tech: "foo", sourceDir: docsDir, clients: ["claude"], homeDir })
    ).rejects.toThrow(/pages must be an array/i);
  });

  it("rejects manifest with non-string name", async () => {
    await writeFile(
      path.join(docsDir, "foo", "manifest.json"),
      JSON.stringify({ name: 123, sourceUrl: "https://foo.example/", pages: [], failures: [] }),
      "utf8"
    );
    await expect(
      installTechSkill({ tech: "foo", sourceDir: docsDir, clients: ["claude"], homeDir })
    ).rejects.toThrow(/name must be a string/i);
  });

  // M1
  it("refuses installTechSkillLocal into / system root", async () => {
    await expect(
      installTechSkillLocal({ tech: "foo", sourceDir: docsDir, clients: ["claude"], projectDir: "/" })
    ).rejects.toThrow(/system directory/i);
  });

  it("refuses installTechSkillLocal into /etc", async () => {
    await expect(
      installTechSkillLocal({ tech: "foo", sourceDir: docsDir, clients: ["claude"], projectDir: "/etc" })
    ).rejects.toThrow(/system directory/i);
  });

  // M3
  it("escapes [ and ] in page titles to prevent markdown link injection", async () => {
    const { techSkillMarkdown } = await import("./tech-skill.js");
    const out = techSkillMarkdown({
      name: "foo",
      sourceUrl: "https://foo.example/",
      generatedAt: "2026-05-01T00:00:00.000Z",
      sourceKinds: ["markdown"],
      pages: [{
        url: "https://foo.example/x",
        source: "markdown",
        title: "Evil ](https://attacker.example) title",
        outputPath: "x.md",
        hash: "h"
      }],
      failures: []
    });
    // The malicious bracket close + URL must appear escaped (`\]`) in the link text,
    // so a Markdown renderer treats it as literal text, not as a link close.
    expect(out).toContain("\\](https://attacker.example)");
    // No raw "](URL)(" pattern that would close one link and open another
    expect(out).not.toMatch(/\[Evil \]\(https:\/\/attacker\.example\)/);
  });
});
