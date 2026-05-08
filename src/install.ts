import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  claudeCommand,
  claudePromptCodeCommand,
  claudeSkill,
  claudePromptCommand,
  codexOpenAiYaml,
  codexPluginManifest,
  codexSkill,
  geminiCommand,
  geminiContext,
  geminiExtensionJson,
  geminiPromptCommand,
  geminiPromptCodeCommand,
  mcpJson,
  PLUGIN_NAME,
  promptCodeOpenAiYaml,
  promptCodeSkill,
  promptOpenAiYaml,
  promptSkill
} from "./templates.js";
import {
  techSkillCodexPlugin,
  techSkillCursor,
  techSkillGemini,
  techSkillGeminiExtension,
  techSkillMarkdown
} from "./tech-skill.js";
import type { CaptureManifest } from "./types.js";
import { slugify, writeTextIfChanged } from "./utils.js";

/**
 * Validate user-supplied tech argument. CLI accepts arbitrary strings; we
 * slugify here to neutralize any path traversal (e.g. "../../etc") and
 * reject empty results so we never compute paths from junk.
 */
function safeTech(input: string): string {
  const slug = slugify(input);
  if (!slug || slug === "docs") {
    throw new Error(`invalid tech name: ${JSON.stringify(input)}`);
  }
  return slug;
}

/**
 * H2 fix: validate manifest.json shape and reject control-character-laden
 * fields before they are interpolated into YAML frontmatter or markdown.
 * Reject early rather than letting the cast pretend arbitrary JSON is a CaptureManifest.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

async function loadManifestSafe(manifestPath: string): Promise<CaptureManifest> {
  const text = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`manifest at ${manifestPath} is not an object`);
  }
  const m = parsed as Record<string, unknown>;

  const requireString = (k: string): string => {
    const v = m[k];
    if (typeof v !== "string") throw new Error(`manifest.${k} must be a string`);
    if (CONTROL_CHARS.test(v)) throw new Error(`manifest.${k} contains control characters`);
    return v;
  };
  const requireArray = (k: string): unknown[] => {
    const v = m[k];
    if (!Array.isArray(v)) throw new Error(`manifest.${k} must be an array`);
    return v;
  };

  const name = requireString("name");
  const sourceUrl = requireString("sourceUrl");
  const generatedAt = typeof m.generatedAt === "string" ? m.generatedAt : "";
  const sourceKinds = Array.isArray(m.sourceKinds)
    ? m.sourceKinds.filter((s): s is string => typeof s === "string")
    : [];

  const pages = requireArray("pages").map((p, i) => {
    if (!p || typeof p !== "object") throw new Error(`manifest.pages[${i}] must be an object`);
    const page = p as Record<string, unknown>;
    const pageStr = (k: string): string => {
      const v = page[k];
      if (typeof v !== "string") throw new Error(`manifest.pages[${i}].${k} must be a string`);
      if (CONTROL_CHARS.test(v)) throw new Error(`manifest.pages[${i}].${k} contains control characters`);
      return v;
    };
    return {
      url: pageStr("url"),
      source: pageStr("source") as CaptureManifest["pages"][number]["source"],
      title: typeof page.title === "string" ? page.title.replace(CONTROL_CHARS, " ") : "",
      outputPath: pageStr("outputPath"),
      hash: pageStr("hash")
    };
  });

  const failures = requireArray("failures").map((f, i) => {
    if (!f || typeof f !== "object") throw new Error(`manifest.failures[${i}] must be an object`);
    const fail = f as Record<string, unknown>;
    return {
      url: typeof fail.url === "string" ? fail.url : "",
      reason: typeof fail.reason === "string" ? fail.reason : ""
    };
  });

  return { name, sourceUrl, generatedAt, sourceKinds: sourceKinds as CaptureManifest["sourceKinds"], pages, failures };
}

export type ClientName = "codex" | "claude" | "cursor" | "gemini";

export interface InstallOptions {
  clients: ClientName[];
  homeDir: string;
  force?: boolean;
}

export interface InstallResult {
  installed: string[];
  paths: string[];
  skipped: string[];
  failed: { client: string; error: string }[];
}

export async function installIntegrations(options: InstallOptions): Promise<InstallResult> {
  const installed: string[] = [];
  const paths: string[] = [];
  const skipped: string[] = [];
  const failed: { client: string; error: string }[] = [];

  for (const client of options.clients) {
    try {
      const result = await installClient(client, options.homeDir, options.force ?? false);
      paths.push(...result.paths);
      skipped.push(...result.skipped);
      installed.push(client);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failed.push({ client, error });
    }
  }

  return { installed, paths, skipped, failed };
}

async function installClient(
  client: ClientName,
  homeDir: string,
  force: boolean
): Promise<{ paths: string[]; skipped: string[] }> {
  if (client === "codex") return installCodex(homeDir, force);
  if (client === "claude") return installClaude(homeDir, force);
  if (client === "cursor") return installCursor(homeDir);
  return installGemini(homeDir, force);
}

export function parseClients(input: string): ClientName[] {
  const all: ClientName[] = ["codex", "claude", "cursor", "gemini"];
  const values = input.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (values.includes("all")) return all;
  const invalid = values.filter((item) => !all.includes(item as ClientName));
  if (invalid.length > 0) throw new Error(`Unknown client(s): ${invalid.join(", ")}`);
  return Array.from(new Set(values as ClientName[]));
}

async function installCodex(
  homeDir: string,
  force: boolean
): Promise<{ paths: string[]; skipped: string[] }> {
  const pluginRoot = path.join(homeDir, ".codex", "plugins", PLUGIN_NAME);
  const marketplacePath = path.join(homeDir, ".agents", "plugins", "marketplace.json");
  const files: [string, string][] = [
    [path.join(pluginRoot, ".codex-plugin", "plugin.json"), codexPluginManifest()],
    [path.join(pluginRoot, ".mcp.json"), mcpJson()],
    [path.join(pluginRoot, "skills", "docs", "SKILL.md"), codexSkill()],
    [path.join(pluginRoot, "skills", "docs", "agents", "openai.yaml"), codexOpenAiYaml()],
    [path.join(pluginRoot, "skills", "prompt", "SKILL.md"), promptSkill()],
    [path.join(pluginRoot, "skills", "prompt", "agents", "openai.yaml"), promptOpenAiYaml()],
    [path.join(pluginRoot, "skills", "prompt-code", "SKILL.md"), promptCodeSkill()],
    [path.join(pluginRoot, "skills", "prompt-code", "agents", "openai.yaml"), promptCodeOpenAiYaml()]
  ];

  const skipped: string[] = [];
  for (const [filePath, content] of files) {
    const didSkip = await writeOwned(filePath, content, force);
    if (didSkip) skipped.push(filePath);
  }
  await upsertCodexMarketplace(marketplacePath);
  return { paths: [...files.map(([filePath]) => filePath), marketplacePath], skipped };
}

async function installClaude(
  homeDir: string,
  force: boolean
): Promise<{ paths: string[]; skipped: string[] }> {
  const files: [string, string][] = [
    [path.join(homeDir, ".claude", "skills", "docs", "SKILL.md"), claudeSkill()],
    [path.join(homeDir, ".claude", "skills", "prompt", "SKILL.md"), promptSkill()],
    [path.join(homeDir, ".claude", "skills", "prompt-code", "SKILL.md"), promptCodeSkill()],
    [path.join(homeDir, ".claude", "commands", "docs.md"), claudeCommand()],
    [path.join(homeDir, ".claude", "commands", "prompt.md"), claudePromptCommand()],
    [path.join(homeDir, ".claude", "commands", "prompt-code.md"), claudePromptCodeCommand()]
  ];
  const skipped: string[] = [];
  for (const [filePath, content] of files) {
    const didSkip = await writeOwned(filePath, content, force);
    if (didSkip) skipped.push(filePath);
  }
  return { paths: files.map(([filePath]) => filePath), skipped };
}

async function installCursor(
  homeDir: string
): Promise<{ paths: string[]; skipped: string[] }> {
  // Cursor não lê comandos do escopo HOME — `~/.cursor/commands/` simplesmente
  // não existe como path discoverable; commands no Cursor são project-scoped
  // em `<project>/.cursor/commands/`. Globalmente, só `~/.cursor/mcp.json` é
  // honrado. Skills `/prompt`, `/prompt-code` e `docs` chegam ao Cursor via
  // o servidor MCP (`docsAgent`) e via skill por tecnologia capturada
  // (`<project>/.cursor/rules/docs-<tech>.mdc` gravado por `installTechSkillLocal`).
  const mcpPath = path.join(homeDir, ".cursor", "mcp.json");
  await upsertMcpConfig(mcpPath);
  return { paths: [mcpPath], skipped: [] };
}

async function installGemini(
  homeDir: string,
  force: boolean
): Promise<{ paths: string[]; skipped: string[] }> {
  const root = path.join(homeDir, ".gemini", "extensions", PLUGIN_NAME);
  const files: [string, string][] = [
    [path.join(root, "gemini-extension.json"), geminiExtensionJson()],
    [path.join(root, "GEMINI.md"), geminiContext()],
    [path.join(root, "commands", "docs.toml"), geminiCommand()],
    [path.join(root, "commands", "prompt.toml"), geminiPromptCommand()],
    [path.join(root, "commands", "prompt-code.toml"), geminiPromptCodeCommand()]
  ];
  const skipped: string[] = [];
  for (const [filePath, content] of files) {
    const didSkip = await writeOwned(filePath, content, force);
    if (didSkip) skipped.push(filePath);
  }
  return { paths: files.map(([filePath]) => filePath), skipped };
}

export interface InstallTechSkillOptions {
  tech: string;
  /** Parent dir of `<tech>/manifest.json` (e.g. "docs"). */
  sourceDir: string;
  clients: ClientName[];
  homeDir: string;
  force?: boolean;
}

export async function installTechSkill(opts: InstallTechSkillOptions): Promise<InstallResult> {
  // C1 fix: slugify tech to defeat path traversal in arguments to install-skill
  const tech = safeTech(opts.tech);
  const sourceDir = path.resolve(opts.sourceDir);
  const manifestPath = path.join(sourceDir, tech, "manifest.json");
  const manifest = await loadManifestSafe(manifestPath);

  const force = opts.force ?? false;
  const installed: string[] = [];
  const paths: string[] = [];
  const skipped: string[] = [];
  const failed: { client: string; error: string }[] = [];

  const recordWrite = async (target: string, content: string): Promise<void> => {
    const wasSkipped = await writeOwned(target, content, force);
    paths.push(target);
    if (wasSkipped) skipped.push(target);
  };

  for (const client of opts.clients) {
    try {
      if (client === "claude") {
        const target = path.join(opts.homeDir, ".claude", "skills", `docs-${tech}`, "SKILL.md");
        await recordWrite(target, techSkillMarkdown(manifest));
      } else if (client === "codex") {
        const root = path.join(opts.homeDir, ".codex", "plugins", `docs-${tech}`);
        await recordWrite(path.join(root, "skills", "SKILL.md"), techSkillMarkdown(manifest));
        await recordWrite(path.join(root, "plugin.json"), techSkillCodexPlugin(tech, manifest.sourceUrl));
      } else if (client === "cursor") {
        const target = path.join(opts.homeDir, ".cursor", "rules", `docs-${tech}.mdc`);
        await recordWrite(target, techSkillCursor(manifest));
      } else if (client === "gemini") {
        const root = path.join(opts.homeDir, ".gemini", "extensions", `docs-${tech}`);
        await recordWrite(path.join(root, "GEMINI.md"), techSkillGemini(manifest));
        await recordWrite(path.join(root, "gemini-extension.json"), techSkillGeminiExtension(tech, manifest.sourceUrl));
      }
      installed.push(client);
    } catch (err) {
      failed.push({ client, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { installed, paths, skipped, failed };
}

/**
 * Install per-tech skill into project-scoped paths (`.claude/`, `.agents/`,
 * `.cursor/`, `.gemini/`) at the given project directory. Equivalent of
 * `installTechSkill` but for the workspace where the AI client opens the project.
 */
export interface InstallTechSkillLocalOptions {
  tech: string;
  /** Parent dir of `<tech>/manifest.json` (e.g. "docs"). */
  sourceDir: string;
  clients: ClientName[];
  /** Project root where `.claude/`, `.agents/`, `.cursor/`, `.gemini/` live. */
  projectDir: string;
  force?: boolean;
}

// M1 fix: refuse to install into obviously-dangerous project roots.
const DANGEROUS_PROJECT_DIRS = new Set(["/", "/etc", "/bin", "/sbin", "/usr", "/var", "/boot", "/dev", "/proc", "/sys", "/root"]);

function safeProjectDir(input: string): string {
  const resolved = path.resolve(input);
  if (DANGEROUS_PROJECT_DIRS.has(resolved)) {
    throw new Error(`refusing to install into system directory: ${resolved}`);
  }
  return resolved;
}

export async function installTechSkillLocal(opts: InstallTechSkillLocalOptions): Promise<InstallResult> {
  // C1 fix: slugify tech to defeat path traversal in arguments
  const tech = safeTech(opts.tech);
  const sourceDir = path.resolve(opts.sourceDir);
  const projectDir = safeProjectDir(opts.projectDir);
  const manifestPath = path.join(sourceDir, tech, "manifest.json");
  const manifest = await loadManifestSafe(manifestPath);

  const force = opts.force ?? false;
  const installed: string[] = [];
  const paths: string[] = [];
  const skipped: string[] = [];
  const failed: { client: string; error: string }[] = [];

  const recordWrite = async (target: string, content: string): Promise<void> => {
    const wasSkipped = await writeOwned(target, content, force);
    paths.push(target);
    if (wasSkipped) skipped.push(target);
  };

  for (const client of opts.clients) {
    try {
      if (client === "claude") {
        // Claude project-scoped skill
        const target = path.join(projectDir, ".claude", "skills", `docs-${tech}`, "SKILL.md");
        await recordWrite(target, techSkillMarkdown(manifest));
      } else if (client === "codex") {
        // Codex CLI repo-scoped uses `.agents/skills/` (no plugin.json needed for repo scope)
        const target = path.join(projectDir, ".agents", "skills", `docs-${tech}`, "SKILL.md");
        await recordWrite(target, techSkillMarkdown(manifest));
      } else if (client === "cursor") {
        // Cursor project rules in `.cursor/rules/`
        const target = path.join(projectDir, ".cursor", "rules", `docs-${tech}.mdc`);
        await recordWrite(target, techSkillCursor(manifest));
      } else if (client === "gemini") {
        // Gemini project-scoped extension
        const root = path.join(projectDir, ".gemini", "extensions", `docs-${tech}`);
        await recordWrite(path.join(root, "GEMINI.md"), techSkillGemini(manifest));
        await recordWrite(path.join(root, "gemini-extension.json"), techSkillGeminiExtension(tech, manifest.sourceUrl));
      }
      installed.push(client);
    } catch (err) {
      failed.push({ client, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { installed, paths, skipped, failed };
}

async function writeOwned(filePath: string, content: string, force: boolean): Promise<boolean> {
  await mkdir(path.dirname(filePath), { recursive: true });

  // C2 fix: refuse to write through a symlink for ANY path (not just --force).
  // An attacker pre-placing a symlink at the target before first install would
  // otherwise get arbitrary file overwrite via Node's writeFile follow-symlinks.
  await assertNotSymlink(filePath);

  let existing: string | null = null;
  try {
    existing = await readFile(filePath, "utf8");
  } catch {
    // File does not exist yet — proceed with write.
  }

  if (existing === null || existing === content) {
    await writeTextIfChanged(filePath, content);
    return false;
  }

  if (force) {
    // L3: also guard the .bak target (an attacker could pre-place that as a symlink too).
    await assertNotSymlink(`${filePath}.bak`);
    await writeFile(`${filePath}.bak`, existing, "utf8");
    await writeFile(filePath, content, "utf8");
    return false;
  }

  console.warn(`[akcit-docs] skipping ${filePath}: file was modified by user (pass --force to overwrite)`);
  return true;
}

async function assertNotSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to write through symlink at ${filePath}`);
    }
  } catch (err: unknown) {
    // ENOENT is fine — file doesn't exist yet
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
}

interface MarketplacePlugin {
  name?: string;
  [key: string]: unknown;
}

interface Marketplace {
  name: string;
  interface: { displayName: string };
  plugins: MarketplacePlugin[];
  [key: string]: unknown;
}

interface McpConfig {
  mcpServers: Record<string, unknown>;
  [key: string]: unknown;
}

async function upsertCodexMarketplace(filePath: string): Promise<void> {
  const raw = await readJson(filePath).catch(() => null);
  const marketplace: Marketplace =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Marketplace)
      : { name: "local", interface: { displayName: "Local Plugins" }, plugins: [] };

  if (!Array.isArray(marketplace.plugins)) marketplace.plugins = [];
  const entry: MarketplacePlugin = {
    name: PLUGIN_NAME,
    source: { source: "local", path: "./.codex/plugins/docs-agent" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity"
  };
  const index = marketplace.plugins.findIndex((plugin) => plugin.name === PLUGIN_NAME);
  if (index >= 0) marketplace.plugins[index] = entry;
  else marketplace.plugins.push(entry);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(marketplace, null, 2)}\n`, "utf8");
}

async function upsertMcpConfig(filePath: string): Promise<void> {
  const raw = await readJson(filePath).catch(() => null);
  const config: McpConfig =
    raw !== null && typeof raw === "object" && !Array.isArray(raw) &&
    typeof (raw as McpConfig).mcpServers === "object"
      ? (raw as McpConfig)
      : { mcpServers: {} };

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }
  config.mcpServers["docsAgent"] = {
    command: "npx",
    args: ["-y", "@akcit/docs-agent", "mcp"]
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}
