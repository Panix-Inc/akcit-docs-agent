import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  claudeCommand,
  claudeSkill,
  codexOpenAiYaml,
  codexPluginManifest,
  codexSkill,
  cursorCommand,
  geminiCommand,
  geminiContext,
  geminiExtensionJson,
  mcpJson,
  PLUGIN_NAME
} from "./templates.js";
import { writeTextIfChanged } from "./utils.js";

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
  if (client === "cursor") return installCursor(homeDir, force);
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
    [path.join(pluginRoot, "skills", "docs", "agents", "openai.yaml"), codexOpenAiYaml()]
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
    [path.join(homeDir, ".claude", "commands", "docs.md"), claudeCommand()]
  ];
  const skipped: string[] = [];
  for (const [filePath, content] of files) {
    const didSkip = await writeOwned(filePath, content, force);
    if (didSkip) skipped.push(filePath);
  }
  return { paths: files.map(([filePath]) => filePath), skipped };
}

async function installCursor(
  homeDir: string,
  force: boolean
): Promise<{ paths: string[]; skipped: string[] }> {
  const commandPath = path.join(homeDir, ".cursor", "commands", "docs.md");
  const mcpPath = path.join(homeDir, ".cursor", "mcp.json");
  const skipped: string[] = [];
  const didSkip = await writeOwned(commandPath, cursorCommand(), force);
  if (didSkip) skipped.push(commandPath);
  await upsertMcpConfig(mcpPath);
  return { paths: [commandPath, mcpPath], skipped };
}

async function installGemini(
  homeDir: string,
  force: boolean
): Promise<{ paths: string[]; skipped: string[] }> {
  const root = path.join(homeDir, ".gemini", "extensions", PLUGIN_NAME);
  const files: [string, string][] = [
    [path.join(root, "gemini-extension.json"), geminiExtensionJson()],
    [path.join(root, "GEMINI.md"), geminiContext()],
    [path.join(root, "commands", "docs.toml"), geminiCommand()]
  ];
  const skipped: string[] = [];
  for (const [filePath, content] of files) {
    const didSkip = await writeOwned(filePath, content, force);
    if (didSkip) skipped.push(filePath);
  }
  return { paths: files.map(([filePath]) => filePath), skipped };
}

async function writeOwned(filePath: string, content: string, force: boolean): Promise<boolean> {
  await mkdir(path.dirname(filePath), { recursive: true });
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
    await writeFile(`${filePath}.bak`, existing, "utf8");
    await writeFile(filePath, content, "utf8");
    return false;
  }

  console.warn(`[avakit-docs] skipping ${filePath}: file was modified by user (pass --force to overwrite)`);
  return true;
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
    args: ["-y", "@avakit/docs-agent", "mcp"]
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}
