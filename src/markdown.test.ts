import { describe, expect, it } from "vitest";
import { htmlToMarkdown, normalizeMarkdown } from "./markdown.js";

const SOURCE = "https://example.com/docs/intro";
const FIXED_TS = "2024-01-01T00:00:00.000Z";

function parseFrontmatter(md: string): Record<string, string> {
  const match = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match?.[1]) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^"(.*)"$/, "$1");
    result[key] = value;
  }
  return result;
}

describe("htmlToMarkdown", () => {
  it("prepends YAML front-matter with title, source, captured_at", () => {
    const html = "<html><head><title>Intro Guide</title></head><body><p>Hello</p></body></html>";
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).toMatch(/^---\n/);
    const fm = parseFrontmatter(markdown);
    expect(fm["title"]).toBe("Intro Guide");
    expect(fm["source"]).toBe(SOURCE);
    expect(fm["captured_at"]).toBe(FIXED_TS);
  });

  it("uses capturedAt parameter instead of Date.now when provided", () => {
    const html = "<html><body><p>test</p></body></html>";
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).toContain(`captured_at: ${FIXED_TS}`);
  });

  it("converts <a href='javascript:...'> to plain text, no markdown link", () => {
    const html = `<html><body><p><a href="javascript:alert(1)">click</a></p></body></html>`;
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).not.toMatch(/\[click\]\(/);
    expect(markdown).toContain("click");
  });

  it("converts <a href='data:...'> to plain text, no markdown link", () => {
    const html = `<html><body><p><a href="data:text/html,<b>x</b>">label</a></p></body></html>`;
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).not.toMatch(/\[label\]\(/);
  });

  it("preserves safe https links as markdown links", () => {
    const html = `<html><body><p><a href="https://safe.example/x">ok</a></p></body></html>`;
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).toMatch(/\[ok\]\(https:\/\/safe\.example\/x\)/);
  });

  it("strips body-level site-header but not article-level header", () => {
    const html = `<html><body>
      <header class="site-header">Site Nav</header>
      <article><header>Article header</header><p>body text</p></article>
    </body></html>`;
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).not.toContain("Site Nav");
    expect(markdown).toContain("Article header");
    expect(markdown).toContain("body text");
  });

  it("strips body > header element", () => {
    const html = `<html><body>
      <header>Top nav</header>
      <main><p>main content</p></main>
    </body></html>`;
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).not.toContain("Top nav");
    expect(markdown).toContain("main content");
  });

  it("selects content from [role='main'] when no <main> or <article>", () => {
    const html = `<html><body>
      <div role="main"><p>role main content</p></div>
    </body></html>`;
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).toContain("role main content");
  });

  it("prefers article over main", () => {
    const html = `<html><body>
      <main><p>main section</p></main>
      <article><p>article section</p></article>
    </body></html>`;
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).toContain("article section");
    expect(markdown).not.toContain("main section");
  });

  it("renders fenced code block with language class", () => {
    const html = `<html><body><pre><code class="language-typescript">const x = 1;</code></pre></body></html>`;
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).toContain("```typescript");
    expect(markdown).toContain("const x = 1;");
    expect(markdown).toContain("```");
  });

  it("renders table as GFM-style markdown", () => {
    const html = `<html><body>
      <table>
        <tr><th>Name</th><th>Value</th></tr>
        <tr><td>foo</td><td>bar</td></tr>
      </table>
    </body></html>`;
    const { markdown } = htmlToMarkdown(html, SOURCE, FIXED_TS);
    expect(markdown).toContain("| Name | Value |");
    expect(markdown).toContain("| foo | bar |");
    expect(markdown).toContain("| --- |");
  });
});

describe("normalizeMarkdown", () => {
  it("prepends front-matter with title derived from first H1", () => {
    const input = "# My Title\n\nSome content.";
    const { markdown } = normalizeMarkdown(input, SOURCE, FIXED_TS);
    expect(markdown).toMatch(/^---\n/);
    const fm = parseFrontmatter(markdown);
    expect(fm["title"]).toBe("My Title");
    expect(fm["source"]).toBe(SOURCE);
    expect(fm["captured_at"]).toBe(FIXED_TS);
  });

  it("derives title from URL pathname when no H1 present", () => {
    const input = "Just some text without heading.";
    const { markdown } = normalizeMarkdown(input, "https://example.com/docs/guide", FIXED_TS);
    const fm = parseFrontmatter(markdown);
    expect(fm["title"]).toBe("guide");
  });

  it("strips existing front-matter before adding new one", () => {
    const input = "---\ntitle: old\nsource: old-source\n---\n\n# Real Title\n\ncontent";
    const { markdown } = normalizeMarkdown(input, SOURCE, FIXED_TS);
    const frontmatterCount = (markdown.match(/^---$/gm) ?? []).length;
    expect(frontmatterCount).toBe(2);
    const fm = parseFrontmatter(markdown);
    expect(fm["title"]).toBe("Real Title");
    expect(fm["source"]).toBe(SOURCE);
    expect(markdown).not.toContain("old-source");
  });

  it("does not double front-matter when called twice", () => {
    const input = "# Title\n\nContent";
    const first = normalizeMarkdown(input, SOURCE, FIXED_TS).markdown;
    const second = normalizeMarkdown(first, SOURCE, FIXED_TS).markdown;
    const frontmatterCount = (second.match(/^---$/gm) ?? []).length;
    expect(frontmatterCount).toBe(2);
  });

  it("preserves body content after front-matter", () => {
    const input = "# Title\n\nParagraph content here.";
    const { markdown } = normalizeMarkdown(input, SOURCE, FIXED_TS);
    expect(markdown).toContain("Paragraph content here.");
    expect(markdown).toContain("# Title");
  });
});
