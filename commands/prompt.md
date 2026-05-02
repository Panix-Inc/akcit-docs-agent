---
description: Improve a rough prompt using the COSTAR-A framework
argument-hint: [rough prompt or question]
---

Rewrite $ARGUMENTS into a stronger prompt using COSTAR-A.

Use these sections exactly:
- Context
- Objective
- Style
- Tone
- Audience
- Response
- Answer

Preserve the user's intent. Infer reasonable defaults for simple questions. Ask one concise clarifying question only if the missing information would materially change the resulting prompt.

Return the improved prompt first in a fenced `text` block, then a short note explaining the most important improvements.
