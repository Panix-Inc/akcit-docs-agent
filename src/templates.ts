export const PACKAGE_NAME = "@akcit/docs-agent";
export const PLUGIN_NAME = "docs-agent";

const COSTAR_A_GUIDE = `COSTAR-A prompt framework:
- Context: background, scenario, constraints, known facts, and relevant role.
- Objective: the concrete task the model must perform.
- Style: writing or reasoning style, such as concise, technical, instructional, or analytical.
- Tone: attitude of the answer, such as neutral, direct, friendly, formal, or pragmatic.
- Audience: who will read or use the answer and their assumed expertise.
- Response: required format, length, structure, language, and any validation rules.
- Answer: explicit directive that forces the model to produce the final answer instead of stopping at setup or analysis.`;

const COSTAR_A_SECTIONS_LIST = `- Context
- Objective
- Style
- Tone
- Audience
- Response
- Answer`;

const CODE_REVIEW_BULLETS =
  "nonexistent APIs, wrong imports, missing configuration, outdated patterns, and missing tests";

export function codexPluginManifest(): string {
  return `${JSON.stringify({
    name: PLUGIN_NAME,
    version: "0.1.0",
    description: "Capture documentation websites into organized Markdown for agent workflows.",
    license: "MIT",
    keywords: ["docs", "markdown", "mcp", "agent-skills"],
    skills: "./skills/",
    mcpServers: "./.mcp.json",
    interface: {
      displayName: "Docs Agent",
      shortDescription: "Capture docs into Markdown",
      longDescription: "Capture documentation websites into docs/<technology> using llms.txt, Markdown sources, sitemaps, and scoped crawling.",
      developerName: "Akcit",
      category: "Productivity",
      capabilities: ["Read", "Write"],
      defaultPrompt: [
        "Use Docs Agent to capture https://example.com/docs."
      ],
      brandColor: "#10A37F"
    }
  }, null, 2)}\n`;
}

export function mcpJson(): string {
  return `${JSON.stringify({
    mcpServers: {
      docsAgent: {
        command: "npx",
        args: ["-y", PACKAGE_NAME, "mcp"]
      }
    }
  }, null, 2)}\n`;
}

export function codexSkill(): string {
  return `---
name: docs
description: Capture documentation websites into local Markdown. Use when the user invokes /docs, $docs, or asks to download, mirror, convert, crawl, or organize docs from a documentation URL.
---

# Docs Capture

Use the docsAgent MCP tool \`capture_docs\` whenever available. Pass the documentation URL from the user and write output to \`docs/<technology>\` unless the user gives another path.

Workflow:
1. Prefer optimized sources: \`llms.txt\`, \`llms-full.txt\`, and native \`.md\` or \`.mdx\` links.
2. Fall back to sitemap discovery, then docs navigation/sidebar crawling.
3. Keep crawling scoped to the documentation domain and path.
4. Preserve Markdown files and convert HTML only when no native Markdown source exists.
5. Report the output folder, page count, failures, and manifest path.

If the MCP tool is unavailable, run:

\`\`\`bash
npx -y ${PACKAGE_NAME} capture <url>
\`\`\`
`;
}

export function promptSkill(): string {
  return `---
name: prompt
description: Improve simple user questions into stronger prompts using the COSTAR-A framework. Use when the user invokes /prompt, $prompt, or asks to rewrite, improve, structure, or optimize a prompt.
---

# Prompt Enhancer

Use this skill to turn a rough question or short instruction into a clearer, higher-leverage prompt. Apply COSTAR-A, an extension of COSTAR from the provided framework: Context, Objective, Style, Tone, Audience, Response, and Answer.

${COSTAR_A_GUIDE}

Workflow:
1. Preserve the user's intent. Do not add unrelated goals.
2. Infer reasonable defaults for missing fields when the request is simple.
3. If the original input is ambiguous enough that the answer would be wildly different across reasonable interpretations, ask **one** concise clarifying question and stop. Do not split the rewrite and the answer across separate turns.
4. Prefer COSTAR-A when the user needs a decisive answer, a constrained format, point-of-view behavior, or output from a smaller/local model.
5. Keep the improved prompt practical: specific enough to guide the model, short enough to use directly.
6. Return the improved prompt first inside a fenced \`text\` block, then a short note (≤3 bullets) explaining the main improvements.
7. Then **immediately produce the final answer** to the prompt, following the Style/Tone/Audience/Response/Answer fields you just defined. Do not stop at the rewrite — the user wants the actual answer in the same turn.

Default output format:

\`\`\`text
# Context #
...
#############
# Objective #
...
#############
# Style #
...
#############
# Tone #
...
#############
# Audience #
...
#############
# Response #
...
#############
# Answer #
...
\`\`\`

If the user asks for another language, write the improved prompt in that language. For Portuguese requests, use Portuguese by default.
`;
}

export function promptCodeSkill(): string {
  return `---
name: prompt-code
description: Improve implementation or code-review requests into COSTAR-A prompts grounded in captured local documentation. Use when the user invokes /prompt-code, $prompt-code, or asks to create a better coding prompt using docs.
---

# Prompt Code

Use this skill to turn rough coding requests into implementation-ready COSTAR-A prompts grounded in local documentation captured by Docs Agent.

${COSTAR_A_GUIDE}

Doc-grounded coding workflow:
1. Identify the target technology, framework, library, or docs folder.
2. Require the agent to inspect \`manifest.json\`, \`api-index.md\`, \`examples-index.md\`, and \`snippets.json\` when they exist.
3. Require source Markdown pages to be read before using any API or example.
4. Include acceptance criteria and verification commands such as tests, typecheck, lint, or build when discoverable.
5. Require citations to local doc paths used for implementation decisions.
6. For review requests, ask for objective findings: ${CODE_REVIEW_BULLETS}.

Default output format:

\`\`\`text
# Context #
The project has local captured documentation under docs/<technology>. Use manifest.json, api-index.md, examples-index.md, snippets.json, and the source Markdown pages before writing code.
#############
# Objective #
...
#############
# Style #
Pragmatic senior engineer. Prefer existing project patterns and APIs confirmed by the local docs.
#############
# Tone #
Direct, precise, and implementation-focused.
#############
# Audience #
Developer implementing or reviewing code in this repository.
#############
# Response #
Return a short implementation plan, the code changes, verification commands, and local doc citations.
#############
# Answer #
Produce the final implementation or review, using only APIs and examples confirmed by the captured documentation. If the docs do not cover a decision, say so explicitly.
\`\`\`

For Portuguese requests, produce the improved prompt in Portuguese.
`;
}

export function codexOpenAiYaml(): string {
  return `interface:
  display_name: "Docs"
  short_description: "Capture docs into Markdown"
  brand_color: "#10A37F"
  default_prompt: "Use $docs to capture a documentation URL into local Markdown."

dependencies:
  tools:
    - type: "mcp"
      value: "docsAgent"
      description: "Docs Agent MCP server"
      transport: "stdio"

policy:
  allow_implicit_invocation: true
`;
}

export function promptCodeOpenAiYaml(): string {
  return `interface:
  display_name: "Prompt Code"
  short_description: "Create doc-grounded coding prompts"
  brand_color: "#10A37F"
  default_prompt: "Use $prompt-code to improve this coding request with local docs: create an ADK agent with one custom tool."

policy:
  allow_implicit_invocation: true

instructions: |
  You are a doc-grounded coding prompt specialist. Convert rough implementation and code-review requests into COSTAR-A prompts that force the coding agent to use captured local docs.

  The prompt must tell the agent to inspect manifest.json, api-index.md, examples-index.md, snippets.json, and source Markdown pages when available.
  Include acceptance criteria, verification commands, and a requirement to cite local doc paths.
  For review requests, focus on objective findings: ${CODE_REVIEW_BULLETS}.
`;
}

export function promptOpenAiYaml(): string {
  return `interface:
  display_name: "Prompt"
  short_description: "Improve prompts with COSTAR-A"
  brand_color: "#10A37F"
  default_prompt: "Use $prompt to improve this rough request with COSTAR-A: summarize this document for executives."

policy:
  allow_implicit_invocation: true

instructions: |
  You are a prompt engineering specialist. Convert rough user requests into stronger prompts using COSTAR-A:
  Context, Objective, Style, Tone, Audience, Response, and Answer.

  Preserve the user's intent, infer low-risk defaults, and only ask one concise clarifying question when the missing detail would materially change the prompt — then stop and wait for the answer.

  Output, in order:
  1. The improved prompt in a fenced text block.
  2. A short bullet list (≤3 bullets) noting the main improvements.
  3. The final answer to the prompt, executing the Optimized version yourself and respecting the Style/Tone/Audience/Response/Answer fields you defined. Do not stop at the rewrite.
`;
}

export function claudeSkill(): string {
  return `---
name: docs
description: Capture documentation websites into docs/<technology> as organized Markdown. Use for /docs <url> or when mirroring online docs.
allowed-tools: Bash(npx:*)
---

Capture the documentation URL in $ARGUMENTS by running:

\`\`\`bash
npx -y ${PACKAGE_NAME} capture "$ARGUMENTS"
\`\`\`

Prefer the generated manifest for the final summary. Mention the output folder, pages captured, and failures.
`;
}

export function claudePromptCommand(): string {
  return `---
description: Improve a rough prompt using the COSTAR-A framework and answer it
argument-hint: [rough prompt or question]
---

Rewrite $ARGUMENTS into a stronger prompt using COSTAR-A, then answer it.

Use these sections exactly:
${COSTAR_A_SECTIONS_LIST}

Preserve the user's intent. Infer reasonable defaults for simple questions. Ask one concise clarifying question only if the missing information would materially change the resulting prompt — in that case stop and wait for the answer.

Output, in order:

1. The improved prompt inside a fenced \`text\` block.
2. A short bullet list (≤3 bullets) noting the most important improvements.
3. **The final answer to the prompt**, executing the Optimized version yourself and respecting the Style/Tone/Audience/Response/Answer fields you defined. Do not stop at the rewrite.

Reply in the same language as \`$ARGUMENTS\` (default to Portuguese for pt-BR inputs).
`;
}

export function claudePromptCodeCommand(): string {
  return `---
description: Improve a coding request using COSTAR-A and local captured documentation
argument-hint: [rough implementation or review request]
---

Rewrite $ARGUMENTS into a doc-grounded coding prompt using COSTAR-A.

The improved prompt must require the coding agent to:
- identify the relevant \`docs/<technology>\` folder;
- inspect \`manifest.json\`, \`api-index.md\`, \`examples-index.md\`, and \`snippets.json\` when present;
- read source Markdown pages before using an API or example;
- implement or review using only APIs confirmed by the local docs;
- run appropriate tests, typecheck, lint, or build commands;
- cite local doc paths used for decisions.

If the request is a review, the prompt must ask for objective findings: ${CODE_REVIEW_BULLETS}.

Return the improved prompt first in a fenced \`text\` block, then a short note explaining the main improvements.
`;
}

export function claudeCommand(): string {
  return `---
description: Capture a documentation website into local Markdown
argument-hint: [documentation-url]
allowed-tools: Bash(npx:*)
---

Run the docs capture workflow for $ARGUMENTS:

\`\`\`bash
npx -y ${PACKAGE_NAME} capture "$ARGUMENTS"
\`\`\`

Summarize the output folder, manifest path, pages captured, and failures.
`;
}

export function geminiExtensionJson(): string {
  return `${JSON.stringify({
    name: PLUGIN_NAME,
    version: "0.1.0",
    description: "Capture documentation websites into organized Markdown.",
    mcpServers: {
      docsAgent: {
        command: "npx",
        args: ["-y", PACKAGE_NAME, "mcp"],
        cwd: "${workspacePath}"
      }
    },
    contextFileName: "GEMINI.md"
  }, null, 2)}\n`;
}

export function geminiContext(): string {
  return `Use Docs Agent for documentation capture requests. Prefer \`/docs <url>\` when available, or call the docsAgent MCP tool.

The workflow saves documentation into \`docs/<technology>\` and prioritizes \`llms.txt\`, \`llms-full.txt\`, native Markdown/MDX, sitemap discovery, and scoped crawling.

Use \`/prompt <rough prompt>\` to improve simple user questions with COSTAR-A: Context, Objective, Style, Tone, Audience, Response, and Answer. Return the improved prompt first in a fenced text block, then a short note (≤3 bullets), then the final answer in the same turn.

Use \`/prompt-code <rough coding request>\` to create implementation or review prompts grounded in captured local docs, including api-index.md, examples-index.md, snippets.json, verification commands, and local doc citations.
`;
}

export function geminiCommand(): string {
  return `description = "Capture a documentation website into local Markdown"
prompt = """
Capture this documentation URL into docs/<technology>: {{args}}

Use the docsAgent MCP tool if available. Otherwise run:
npx -y ${PACKAGE_NAME} capture {{args}}

Summarize the output folder, manifest path, pages captured, and failures.
"""
`;
}

export function geminiPromptCommand(): string {
  return `description = "Improve a rough prompt using COSTAR-A and answer it"
prompt = """
Improve this prompt or question using the COSTAR-A framework, then answer it: {{args}}

COSTAR-A sections:
${COSTAR_A_SECTIONS_LIST}

Preserve the user's intent. Infer reasonable defaults for simple questions. Ask one concise clarifying question only if the missing information would materially change the improved prompt — in that case stop and wait for the answer.

Output, in order:
1. The improved prompt in a fenced text block.
2. A short bullet list (≤3 bullets) noting the most important improvements.
3. The final answer to the prompt, executing the Optimized version yourself and respecting the Style/Tone/Audience/Response/Answer fields you defined. Do not stop at the rewrite.

Reply in the same language as the input (default to Portuguese for pt-BR inputs).
"""
`;
}

export function geminiPromptCodeCommand(): string {
  return `description = "Improve a coding request using COSTAR-A and local docs"
prompt = """
Improve this coding request using COSTAR-A and captured local documentation: {{args}}

The improved prompt must require the coding agent to:
- identify the relevant docs/<technology> folder;
- inspect manifest.json, api-index.md, examples-index.md, and snippets.json when present;
- read source Markdown pages before using an API or example;
- implement or review using only APIs confirmed by the local docs;
- run appropriate tests, typecheck, lint, or build commands;
- cite local doc paths used for decisions.

If this is a review request, ask for objective findings: ${CODE_REVIEW_BULLETS}.

Return the improved prompt first in a fenced text block, then a short note explaining the main improvements.
"""
`;
}
