#!/usr/bin/env node
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import { Command } from "commander";
import { captureDocs } from "./capture.js";
import { installIntegrations, parseClients } from "./install.js";
import { runMcpServer } from "./mcp.js";

const require_ = createRequire(import.meta.url);
const pkg = require_("../package.json") as { version: string };

const program = new Command();

program
  .name("avakit-docs")
  .description("Capture documentation websites into organized Markdown.")
  .version(pkg.version);

program
  .command("capture")
  .argument("<url>", "documentation URL")
  .option("--name <technology>", "technology/folder name")
  .option("--output-dir <dir>", "parent output directory", "docs")
  .option("--max-pages <number>", "maximum pages to capture", parseInteger, 500)
  .option("--force", "ignore existing manifest and recapture every page", false)
  .option("--force-large-crawl", "allow discoveries above the large crawl guardrail", false)
  .option("--no-headless", "disable Playwright fallback")
  .option("--no-respect-robots", "ignore robots.txt")
  .option("--rate-limit-ms <number>", "delay between requests", parseInteger, 100)
  .option("--json", "emit machine-readable JSON to stdout (human text to stderr)", false)
  .option("--quiet", "suppress informational output", false)
  .option("--verbose", "log each page URL as it is captured", false)
  .action(async (url, opts) => {
    const result = await captureDocs({
      url,
      name: opts.name,
      outputDir: opts.outputDir,
      maxPages: opts.maxPages,
      force: Boolean(opts.force),
      forceLargeCrawl: Boolean(opts.forceLargeCrawl),
      headless: Boolean(opts.headless),
      respectRobots: Boolean(opts.respectRobots),
      rateLimitMs: opts.rateLimitMs,
      verbose: Boolean(opts.verbose)
    });
    if (opts.json) {
      process.stdout.write(JSON.stringify(result) + "\n");
    } else if (!opts.quiet) {
      process.stderr.write(`Captured docs for ${result.name}\n`);
      process.stderr.write(`Output: ${result.rootDir}\n`);
      process.stderr.write(`Manifest: ${result.manifestPath}\n`);
      process.stderr.write(`Pages: ${result.pages.length}\n`);
      process.stderr.write(`Failures: ${result.failures.length}\n`);
    }
  });

program
  .command("install")
  .description("Install Codex, Claude Code, Cursor, and Gemini integrations.")
  .option("--clients <clients>", "comma-separated clients or all", "all")
  .option("--home <dir>", "home directory override", os.homedir())
  .action(runInstall);

program
  .command("add")
  .description("Install Docs Agent, matching the npx skills add style.")
  .argument("[skill]", "optional skill name; defaults to docs-agent", "docs-agent")
  .option("--clients <clients>", "comma-separated clients or all", "all")
  .option("--home <dir>", "home directory override", os.homedir())
  .action(async (_skill, opts) => runInstall(opts));

program
  .command("mcp")
  .description("Start the Docs Agent MCP server over stdio.")
  .action(async () => {
    await runMcpServer();
  });

program
  .command("doctor")
  .description("Check runtime and optional integration prerequisites.")
  .action(async () => {
    process.stderr.write(`Node: ${process.version}\n`);
    await checkOptional("playwright", "Playwright package");
    await checkPath(os.homedir(), "Home directory");
  });

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`Invalid positive integer: ${value}`);
  return parsed;
}

async function checkOptional(specifier: string, label: string): Promise<void> {
  try {
    await import(specifier);
    process.stderr.write(`${label}: available\n`);
  } catch {
    process.stderr.write(`${label}: unavailable (headless SPA fallback will be skipped)\n`);
  }
}

async function checkPath(filePath: string, label: string): Promise<void> {
  try {
    await access(filePath);
    process.stderr.write(`${label}: ${filePath}\n`);
  } catch {
    process.stderr.write(`${label}: missing (${filePath})\n`);
  }
}

async function runInstall(opts: { clients: string; home: string }): Promise<void> {
  const clients = parseClients(opts.clients);
  const result = await installIntegrations({ clients, homeDir: opts.home });
  process.stderr.write(`Installed: ${result.installed.join(", ")}\n`);
  for (const filePath of result.paths) process.stderr.write(`- ${filePath}\n`);
  process.stderr.write("Restart the target clients to pick up new skills, commands, plugins, or MCP servers.\n");
}
