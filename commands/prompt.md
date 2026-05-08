---
description: Improve a rough prompt using the COSTAR-A framework and answer it
argument-hint: [rough prompt or question]
---

Rewrite $ARGUMENTS into a stronger prompt using COSTAR-A, then answer it.

Use these sections exactly:
- Context
- Objective
- Style
- Tone
- Audience
- Response
- Answer

Preserve the user's intent. Infer reasonable defaults for simple questions. Ask one concise clarifying question only if the missing information would materially change the resulting prompt — in that case stop and wait for the answer.

Output, in order:

1. The improved prompt inside a fenced `text` block.
2. A short bullet list (≤3 bullets) noting the most important improvements.
3. **The final answer to the prompt**, executing the Optimized version yourself and respecting the Style/Tone/Audience/Response/Answer fields you defined. Do not stop at the rewrite.

Reply in the same language as `$ARGUMENTS` (default to Portuguese for pt-BR inputs).
