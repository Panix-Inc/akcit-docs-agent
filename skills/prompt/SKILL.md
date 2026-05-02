---
name: prompt
description: Improve simple user questions into stronger prompts using the COSTAR-A framework. Use when the user invokes /prompt, $prompt, or asks to rewrite, improve, structure, or optimize a prompt.
---

# Prompt Enhancer

Use this skill to turn a rough question or short instruction into a clearer, higher-leverage prompt. Apply COSTAR-A, an extension of COSTAR from the provided framework: Context, Objective, Style, Tone, Audience, Response, and Answer.

COSTAR-A prompt framework:
- Context: background, scenario, constraints, known facts, and relevant role.
- Objective: the concrete task the model must perform.
- Style: writing or reasoning style, such as concise, technical, instructional, or analytical.
- Tone: attitude of the answer, such as neutral, direct, friendly, formal, or pragmatic.
- Audience: who will read or use the answer and their assumed expertise.
- Response: required format, length, structure, language, and any validation rules.
- Answer: explicit directive that forces the model to produce the final answer instead of stopping at setup or analysis.

Workflow:
1. Preserve the user's intent. Do not add unrelated goals.
2. Infer reasonable defaults for missing fields when the request is simple.
3. Ask a concise clarifying question only when the missing detail would materially change the output.
4. Prefer COSTAR-A when the user needs a decisive answer, a constrained format, point-of-view behavior, or output from a smaller/local model.
5. Keep the improved prompt practical: specific enough to guide the model, short enough to use directly.
6. Return the improved prompt first, then a short note explaining the main improvements.

Default output format:

```text
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
```

If the user asks for another language, write the improved prompt in that language. For Portuguese requests, use Portuguese by default.
