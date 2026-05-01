export const PACKAGE_NAME = "@akcit/docs-agent";
export const PLUGIN_NAME = "docs-agent";

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

export function cursorCommand(): string {
  return `Capture the documentation URL provided by the user into local Markdown.

Use:

\`\`\`bash
npx -y ${PACKAGE_NAME} capture <documentation-url>
\`\`\`

Prefer llms.txt, llms-full.txt, native Markdown, sitemap, then scoped crawling. Save output under docs/<technology> and summarize the manifest.
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
