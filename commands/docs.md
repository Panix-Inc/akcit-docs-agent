---
description: Capture a documentation website into local Markdown
argument-hint: [documentation-url]
allowed-tools: Bash(npx:*)
---

Run the docs capture workflow for $ARGUMENTS:

```bash
npx -y @akcit/docs-agent capture "$ARGUMENTS"
```

Summarize the output folder, manifest path, pages captured, and failures.
