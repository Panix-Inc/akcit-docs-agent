import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// Import the module under test — will be re-imported per vi.mock usage.
import { installIntegrations } from "./install.js";
import { claudeSkill, claudeCommand, codexPluginManifest, mcpJson, codexSkill, codexOpenAiYaml, cursorCommand, geminiExtensionJson, geminiContext, geminiCommand } from "./templates.js";

function tmpHome(): string {
  return path.join(os.tmpdir(), `avakit-test-${crypto.randomBytes(6).toString("hex")}`);
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
  });

  it("installs claude files to a fresh HOME", async () => {
    const result = await installIntegrations({ clients: ["claude"], homeDir });

    expect(result.installed).toEqual(["claude"]);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);

    const skillPath = path.join(homeDir, ".claude", "skills", "docs", "SKILL.md");
    const content = await readFile(skillPath, "utf8");
    expect(content).toBe(claudeSkill());
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
});
