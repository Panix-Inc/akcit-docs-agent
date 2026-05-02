---
name: prompt-code
description: Improve implementation or code-review requests into COSTAR-A prompts grounded in captured local documentation. Use when the user invokes /prompt-code, $prompt-code, or asks to create a better coding prompt using docs.
---

# Prompt Code

Use this skill to turn rough coding requests into implementation-ready COSTAR-A prompts grounded in local documentation captured by Docs Agent.

COSTAR-A prompt framework:
- Context: background, scenario, constraints, known facts, and relevant role.
- Objective: the concrete task the model must perform.
- Style: writing or reasoning style, such as concise, technical, instructional, or analytical.
- Tone: attitude of the answer, such as neutral, direct, friendly, formal, or pragmatic.
- Audience: who will read or use the answer and their assumed expertise.
- Response: required format, length, structure, language, and any validation rules.
- Answer: explicit directive that forces the model to produce the final answer instead of stopping at setup or analysis.

Doc-grounded coding workflow:
1. Identify the target technology, framework, library, or docs folder.
2. Require the agent to inspect `manifest.json`, `api-index.md`, `examples-index.md`, and `snippets.json` when they exist.
3. Require source Markdown pages to be read before using any API or example.
4. Include acceptance criteria and verification commands such as tests, typecheck, lint, or build when discoverable.
5. Require citations to local doc paths used for implementation decisions.
6. For review requests, ask for objective findings: nonexistent APIs, wrong imports, missing configuration, outdated patterns, and missing tests.

Default output format:

```text
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
```

For Portuguese requests, produce the improved prompt in Portuguese.
