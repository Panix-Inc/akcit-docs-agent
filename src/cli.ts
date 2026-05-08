#!/usr/bin/env node
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import { Command } from "commander";
import { captureDocs } from "./capture.js";
import {
  detectIntegrationStatus,
  installIntegrations,
  installTechSkill,
  installTechSkillLocal,
  parseClients
} from "./install.js";
import { runMcpServer } from "./mcp.js";
import { createProgressRenderer } from "./progress.js";

const require_ = createRequire(import.meta.url);
const pkg = require_("../package.json") as { version: string };

const program = new Command();

program
  .name("akcit-docs")
  .description("Capture documentation websites into organized Markdown.")
  .version(pkg.version)
  .action(async () => {
    // Default action when invoked with no subcommand. After `npm install -g`
    // users reasonably expect their `/docs`, `/prompt`, and `/prompt-code`
    // commands to "just appear" — but npm has no postinstall hook in this
    // package (HOME-side effects from postinstall are anti-pattern). Print
    // a status report and nudge `akcit-docs add` so the next step is obvious.
    await printStatus(os.homedir());
  });

// Polite defaults — opt-out via --aggressive.
const POLITE_DEFAULTS = { concurrency: 2, rateLimitMs: 750, maxRetries: 5 };
const AGGRESSIVE_PRESET = { concurrency: 10, rateLimitMs: 100, maxRetries: 2 };

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
  .option("--rate-limit-ms <number>", "delay between requests (ms)", parseInteger, POLITE_DEFAULTS.rateLimitMs)
  .option("--concurrency <number>", "parallel requests in flight", parseInteger, POLITE_DEFAULTS.concurrency)
  .option("--max-retries <number>", "retries on 429/5xx with backoff", parseInteger, POLITE_DEFAULTS.maxRetries)
  .option("--no-jitter", "disable random jitter on rate-limit spacing")
  .option("--no-progress", "disable progress bar even on TTY")
  .option("--aggressive", "preset: concurrency=10 rate-limit=100ms max-retries=2 (use only on tolerant sites)", false)
  .option("--no-skill", "skip generating the SKILL.md inside docs/<tech>/ AND skip project-scoped install in .claude/.agents/.cursor/.gemini/")
  .option("--no-skill-local", "skip project-scoped install (.claude/skills/, .agents/skills/, .cursor/rules/, .gemini/extensions/) but keep docs/<tech>/SKILL.md")
  .option("--install [clients]", "after capture, ALSO install the tech skill globally in HOME (default: all 4 clients). Pass comma list or 'all' to choose.")
  .option("--json", "emit machine-readable JSON to stdout (human text to stderr)", false)
  .option("--quiet", "suppress informational output", false)
  .option("--verbose", "log each page event in line mode (no progress bar)", false)
  .action(async (url, opts) => {
    const aggressive = Boolean(opts.aggressive);
    const concurrency = aggressive ? AGGRESSIVE_PRESET.concurrency : opts.concurrency;
    const rateLimitMs = aggressive ? AGGRESSIVE_PRESET.rateLimitMs : opts.rateLimitMs;
    const maxRetries = aggressive ? AGGRESSIVE_PRESET.maxRetries : opts.maxRetries;

    const renderer = createProgressRenderer({
      json: Boolean(opts.json),
      quiet: Boolean(opts.quiet),
      verbose: Boolean(opts.verbose),
      noProgress: !opts.progress
    });

    try {
      const result = await captureDocs({
        url,
        name: opts.name,
        outputDir: opts.outputDir,
        maxPages: opts.maxPages,
        force: Boolean(opts.force),
        forceLargeCrawl: Boolean(opts.forceLargeCrawl),
        headless: Boolean(opts.headless),
        respectRobots: Boolean(opts.respectRobots),
        rateLimitMs,
        concurrency,
        maxRetries,
        jitter: Boolean(opts.jitter),
        verbose: Boolean(opts.verbose),
        skill: opts.skill !== false,
        onProgress: (e) => renderer.handle(e)
      });
      renderer.finish();

      // DEFAULT: install per-tech skill into project-scoped paths
      // (.claude/skills/, .agents/skills/, .cursor/rules/, .gemini/extensions/)
      // so the AI client running on this project discovers it automatically.
      let localInstallResult: Awaited<ReturnType<typeof installTechSkillLocal>> | null = null;
      if (opts.skill !== false && opts.skillLocal !== false) {
        localInstallResult = await installTechSkillLocal({
          tech: result.name,
          sourceDir: opts.outputDir,
          clients: ["claude", "codex", "cursor", "gemini"],
          projectDir: process.cwd()
        });
      }

      // OPTIONAL: also install in HOME for cross-project visibility.
      let installResult: Awaited<ReturnType<typeof installTechSkill>> | null = null;
      if (opts.install !== undefined && opts.install !== false && opts.skill !== false) {
        const clientsArg = typeof opts.install === "string" ? opts.install : "all";
        installResult = await installTechSkill({
          tech: result.name,
          sourceDir: opts.outputDir,
          clients: parseClients(clientsArg),
          homeDir: os.homedir()
        });
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify({ ...result, localInstall: localInstallResult, install: installResult }) + "\n");
      } else if (!opts.quiet) {
        process.stderr.write(`Captured docs for ${result.name}\n`);
        process.stderr.write(`Output: ${result.rootDir}\n`);
        process.stderr.write(`Manifest: ${result.manifestPath}\n`);
        process.stderr.write(`Pages: ${result.pages.length}\n`);
        process.stderr.write(`Failures: ${result.failures.length}\n`);
        if (localInstallResult) {
          process.stderr.write(`Skill installed locally (project-scoped): ${localInstallResult.installed.join(", ") || "(none)"}\n`);
          for (const p of localInstallResult.paths) process.stderr.write(`  - ${p}\n`);
          if (localInstallResult.failed.length > 0) {
            for (const f of localInstallResult.failed) process.stderr.write(`  ! ${f.client}: ${f.error}\n`);
          }
        }
        if (installResult) {
          process.stderr.write(`Skill installed globally (HOME): ${installResult.installed.join(", ") || "(none)"}\n`);
          for (const p of installResult.paths) process.stderr.write(`  - ${p}\n`);
          if (installResult.failed.length > 0) {
            for (const f of installResult.failed) process.stderr.write(`  ! ${f.client}: ${f.error}\n`);
          }
        }
      }
    } catch (err) {
      renderer.finish();
      throw err;
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
  .command("install-skill")
  .description("Install a per-tech skill so AI agents (Claude Code, Codex, Cursor, Gemini CLI) discover it. By default installs HOME-scoped (global). Use --local for project-scoped (.claude/.agents/.cursor/.gemini/ in cwd).")
  .argument("<tech>", "technology name as written under docs/ (e.g. 'adk')")
  .option("--source-dir <dir>", "parent dir where docs/<tech>/manifest.json lives", "docs")
  .option("--clients <clients>", "comma-separated clients (claude,codex,cursor,gemini) or all", "all")
  .option("--home <dir>", "home directory override (used unless --local)", os.homedir())
  .option("--local", "install project-scoped (in .claude/, .agents/, .cursor/, .gemini/ at cwd) instead of HOME", false)
  .option("--project-dir <dir>", "project root for --local install (default: cwd)", process.cwd())
  .option("--force", "overwrite user-modified skill files (creates .bak)", false)
  .action(async (tech, opts) => {
    const requestedClients = parseClients(opts.clients);
    if (opts.local && opts.projectDir === os.homedir()) {
      process.stderr.write(`[akcit-docs] WARNING: --local with --project-dir == $HOME (${opts.projectDir}). Project-scoped paths will overlap with HOME-scoped install. Use without --local for HOME install.\n`);
    }
    const result = opts.local
      ? await installTechSkillLocal({
          tech,
          sourceDir: opts.sourceDir,
          clients: requestedClients,
          projectDir: opts.projectDir,
          force: Boolean(opts.force)
        })
      : await installTechSkill({
          tech,
          sourceDir: opts.sourceDir,
          clients: requestedClients,
          homeDir: opts.home,
          force: Boolean(opts.force)
        });
    const scope = opts.local ? "project-scoped" : "HOME-scoped";
    process.stderr.write(`Installed tech skill 'docs-${tech}' (${scope}) for: ${result.installed.join(", ") || "(none)"}\n`);
    for (const p of result.paths) process.stderr.write(`- ${p}\n`);
    if (result.skipped.length > 0) {
      process.stderr.write(`Skipped (user-modified, pass --force to overwrite):\n`);
      for (const p of result.skipped) process.stderr.write(`  ${p}\n`);
    }
    if (result.failed.length > 0) {
      process.stderr.write(`Failures:\n`);
      for (const f of result.failed) process.stderr.write(`  ${f.client}: ${f.error}\n`);
    }
    process.stderr.write("Restart your AI client to pick up the new skill.\n");
  });

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
    process.stderr.write("\n");
    await printStatus(os.homedir());
  });

program
  .command("status")
  .description("Report which client integrations are installed, outdated, or missing.")
  .option("--home <dir>", "home directory override", os.homedir())
  .action(async (opts: { home: string }) => {
    await printStatus(opts.home);
  });

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid non-negative integer: ${value}`);
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

async function printStatus(homeDir: string): Promise<void> {
  const statuses = await detectIntegrationStatus(homeDir);
  const needsAttention = statuses.filter((s) => s.state !== "ok");

  process.stderr.write(`akcit-docs ${pkg.version}\n`);

  if (needsAttention.length === 0) {
    process.stderr.write("Integrations: up to date for codex, claude, cursor, gemini.\n");
    process.stderr.write("Run `akcit-docs --help` to see commands.\n");
    return;
  }

  const homePrefix = homeDir.endsWith("/") ? homeDir : `${homeDir}/`;
  const tilde = (p: string): string => (p.startsWith(homePrefix) ? `~/${p.slice(homePrefix.length)}` : p);

  process.stderr.write("Integrations: some are missing or outdated.\n\n");
  for (const s of statuses) {
    const labels: string[] = [];
    if (s.state === "ok") labels.push("up to date");
    if (s.missing.length > 0) labels.push(`${s.missing.length}/${s.expected} missing`);
    if (s.stale.length > 0) labels.push(`${s.stale.length} outdated`);
    process.stderr.write(`  - ${s.client.padEnd(7)} ${labels.join(", ")}\n`);
    for (const p of s.stale) process.stderr.write(`      outdated  ${tilde(p)}\n`);
    if (s.state !== "missing") {
      for (const p of s.missing) process.stderr.write(`      missing   ${tilde(p)}\n`);
    }
  }

  process.stderr.write("\nNext step: run `akcit-docs add` to apply the latest templates.\n");
  process.stderr.write("            (use `akcit-docs add --force` to overwrite locally-modified files; .bak backups are preserved)\n");
  process.stderr.write("            run `akcit-docs --help` to see all commands.\n");
}

async function runInstall(opts: { clients: string; home: string }): Promise<void> {
  const clients = parseClients(opts.clients);
  const result = await installIntegrations({ clients, homeDir: opts.home });
  process.stderr.write(`Installed: ${result.installed.join(", ") || "(none)"}\n`);
  for (const filePath of result.paths) process.stderr.write(`- ${filePath}\n`);
  if (result.skipped.length > 0) {
    process.stderr.write(`Skipped (user-modified, pass --force to overwrite):\n`);
    for (const filePath of result.skipped) process.stderr.write(`  ${filePath}\n`);
  }
  if (result.failed.length > 0) {
    process.stderr.write(`Failures:\n`);
    for (const f of result.failed) process.stderr.write(`  ${f.client}: ${f.error}\n`);
    process.exitCode = 1;
  }
  process.stderr.write("Restart the target clients to pick up new skills, commands, plugins, or MCP servers.\n");
}
