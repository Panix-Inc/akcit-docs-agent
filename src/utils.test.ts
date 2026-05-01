import { describe, expect, it } from "vitest";
import { inferTechName, isMarkdownUrl, outputPathForUrl, sha256, slugify } from "./utils.js";

describe("utils", () => {
  it("slugifies technology names", () => {
    expect(slugify("React Docs!")).toBe("react-docs");
  });

  it("infers a technology from docs URLs", () => {
    expect(inferTechName("https://react.dev/reference/react")).toBe("react");
    expect(inferTechName("https://example.com/docs", "My SDK")).toBe("my-sdk");
  });

  it("detects markdown URLs", () => {
    expect(isMarkdownUrl("https://example.com/guide.md")).toBe(true);
    expect(isMarkdownUrl("https://example.com/guide")).toBe(false);
  });

  it("builds stable output paths", () => {
    expect(outputPathForUrl("/tmp/docs/react", "https://react.dev/reference/hooks/use-state", "html"))
      .toBe("/tmp/docs/react/reference/hooks/use-state.md");
  });

  describe("outputPathForUrl — query string handling", () => {
    it("URLs with different query strings produce different paths", () => {
      const pathV1 = outputPathForUrl("/docs", "https://example.com/page?v=1", "html");
      const pathV2 = outputPathForUrl("/docs", "https://example.com/page?v=2", "html");
      expect(pathV1).not.toBe(pathV2);
      expect(pathV1).toMatch(/page-[0-9a-f]{6}\.md$/);
      expect(pathV2).toMatch(/page-[0-9a-f]{6}\.md$/);
    });

    it("URL with query string at root becomes index-<hash>.md", () => {
      const result = outputPathForUrl("/docs", "https://example.com/?lang=en", "html");
      const expectedHash = sha256("lang=en").slice(0, 6);
      expect(result).toBe(`/docs/index-${expectedHash}.md`);
    });

    it("URL without query string has no hash suffix", () => {
      const result = outputPathForUrl("/docs", "https://example.com/page", "html");
      expect(result).toBe("/docs/page.md");
    });

    it("URL with empty query string (?) has no hash suffix", () => {
      const result = outputPathForUrl("/docs", "https://example.com/page?", "html");
      expect(result).toBe("/docs/page.md");
    });

    it("hash is deterministic — same query always same path", () => {
      const path1 = outputPathForUrl("/docs", "https://example.com/api?version=2", "html");
      const path2 = outputPathForUrl("/docs", "https://example.com/api?version=2", "html");
      expect(path1).toBe(path2);
    });
  });
});
