---
description: Improve a coding request using COSTAR-A and local captured documentation
argument-hint: [rough implementation or review request]
---

Rewrite $ARGUMENTS into a doc-grounded coding prompt using COSTAR-A.

The improved prompt must require the coding agent to:
- identify the relevant `docs/<technology>` folder;
- inspect `manifest.json`, `api-index.md`, `examples-index.md`, and `snippets.json` when present;
- read source Markdown pages before using an API or example;
- implement or review using only APIs confirmed by the local docs;
- run appropriate tests, typecheck, lint, or build commands;
- cite local doc paths used for decisions.

If the request is a review, the prompt must ask for objective findings: nonexistent APIs, wrong imports, missing configuration, outdated patterns, and missing tests.

Return the improved prompt first in a fenced `text` block, then a short note explaining the main improvements.
