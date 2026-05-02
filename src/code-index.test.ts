import { describe, expect, it } from "vitest";
import { extractCodeSnippets } from "./code-index.js";
import type { CapturedPage } from "./types.js";

const page: CapturedPage = {
  url: "https://example.com/docs/api",
  source: "markdown",
  title: "API",
  outputPath: "api.md",
  hash: "h"
};

describe("extractCodeSnippets", () => {
  it("extracts fenced code blocks with language", () => {
    const snippets = extractCodeSnippets("## Setup\n\n```ts\nexport function makeAgent() {}\n```", page);

    expect(snippets).toHaveLength(1);
    expect(snippets[0]).toMatchObject({
      id: "api.md#snippet-1",
      language: "ts",
      outputPath: "api.md",
      section: "Setup"
    });
    expect(snippets[0]?.code).toContain("makeAgent");
  });

  it("extracts fenced code blocks without language", () => {
    const snippets = extractCodeSnippets("```\nnpm test\n```", page);

    expect(snippets).toHaveLength(1);
    expect(snippets[0]?.language).toBe("");
    expect(snippets[0]?.code).toBe("npm test");
  });

  it("extracts multiple snippets from one page", () => {
    const snippets = extractCodeSnippets([
      "# Page",
      "```bash",
      "npm install",
      "```",
      "## Usage",
      "```js",
      "import sdk from 'sdk';",
      "```"
    ].join("\n"), page);

    expect(snippets).toHaveLength(2);
    expect(snippets.map((s) => s.language)).toEqual(["bash", "js"]);
    expect(snippets[1]?.section).toBe("Usage");
  });
});
