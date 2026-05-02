Use Docs Agent for documentation capture requests. Prefer `/docs <url>` when available, or call the docsAgent MCP tool.

The workflow saves documentation into `docs/<technology>` and prioritizes `llms.txt`, `llms-full.txt`, native Markdown/MDX, sitemap discovery, and scoped crawling.

Use `/prompt <rough prompt>` to improve simple user questions with COSTAR-A: Context, Objective, Style, Tone, Audience, Response, and Answer. Return the improved prompt first, then a short note.

Use `/prompt-code <rough coding request>` to create implementation or review prompts grounded in captured local docs, including api-index.md, examples-index.md, snippets.json, verification commands, and local doc citations.
