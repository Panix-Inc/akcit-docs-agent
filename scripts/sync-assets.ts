#!/usr/bin/env tsx
/**
 * Sync bundled static assets with the templates defined in src/templates.ts.
 *
 * Run: npx tsx scripts/sync-assets.ts
 * CI:  npm run sync-assets && git diff --exit-code
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  claudeCommand,
  claudePromptCodeCommand,
  claudePromptCommand,
  codexOpenAiYaml,
  codexPluginManifest,
  codexSkill,
  geminiCommand,
  geminiContext,
  geminiExtensionJson,
  geminiPromptCodeCommand,
  geminiPromptCommand,
  mcpJson,
  promptCodeOpenAiYaml,
  promptCodeSkill,
  promptOpenAiYaml,
  promptSkill
} from "../src/templates.js";
import { writeTextIfChanged } from "../src/utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const assets: [string, () => string][] = [
  // Codex plugin manifest
  [path.join(root, ".codex-plugin", "plugin.json"), codexPluginManifest],
  // Shared MCP config at repo root
  [path.join(root, ".mcp.json"), mcpJson],
  // Codex skill (used by skills/ directory bundled in npm package)
  [path.join(root, "skills", "docs", "SKILL.md"), codexSkill],
  // Codex OpenAI agent YAML
  [path.join(root, "skills", "docs", "agents", "openai.yaml"), codexOpenAiYaml],
  // COSTAR-A prompt enhancement skill
  [path.join(root, "skills", "prompt", "SKILL.md"), promptSkill],
  // COSTAR-A prompt specialist agent
  [path.join(root, "skills", "prompt", "agents", "openai.yaml"), promptOpenAiYaml],
  // COSTAR-A doc-grounded coding prompt skill and agent
  [path.join(root, "skills", "prompt-code", "SKILL.md"), promptCodeSkill],
  [path.join(root, "skills", "prompt-code", "agents", "openai.yaml"), promptCodeOpenAiYaml],
  // .agents/skills (alternative install path for Codex skill)
  [path.join(root, ".agents", "skills", "docs", "SKILL.md"), codexSkill],
  // .agents OpenAI agent YAML
  [path.join(root, ".agents", "skills", "docs", "agents", "openai.yaml"), codexOpenAiYaml],
  // .agents COSTAR-A prompt skill and agent
  [path.join(root, ".agents", "skills", "prompt", "SKILL.md"), promptSkill],
  [path.join(root, ".agents", "skills", "prompt", "agents", "openai.yaml"), promptOpenAiYaml],
  [path.join(root, ".agents", "skills", "prompt-code", "SKILL.md"), promptCodeSkill],
  [path.join(root, ".agents", "skills", "prompt-code", "agents", "openai.yaml"), promptCodeOpenAiYaml],
  // Gemini extension manifest
  [path.join(root, "gemini-extension.json"), geminiExtensionJson],
  // Gemini context file
  [path.join(root, "GEMINI.md"), geminiContext],
  // Gemini TOML command
  [path.join(root, "commands", "docs.toml"), geminiCommand],
  // Gemini TOML prompt command
  [path.join(root, "commands", "prompt.toml"), geminiPromptCommand],
  [path.join(root, "commands", "prompt-code.toml"), geminiPromptCodeCommand],
  // Claude/Cursor command (shared Markdown command)
  [path.join(root, "commands", "docs.md"), claudeCommand],
  // Claude/Cursor COSTAR-A command
  [path.join(root, "commands", "prompt.md"), claudePromptCommand],
  [path.join(root, "commands", "prompt-code.md"), claudePromptCodeCommand],
];

let written = 0;
let unchanged = 0;

for (const [filePath, generate] of assets) {
  const content = generate();
  const changed = await writeTextIfChanged(filePath, content);
  if (changed) {
    console.log(`  wrote   ${path.relative(root, filePath)}`);
    written++;
  } else {
    console.log(`  ok      ${path.relative(root, filePath)}`);
    unchanged++;
  }
}

console.log(`\nSync complete: ${written} written, ${unchanged} unchanged.`);
