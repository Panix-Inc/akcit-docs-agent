import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CaptureResult } from "./types.js";

// ---------------------------------------------------------------------------
// Mock captureDocs before importing the module under test so the mock is
// in place when mcp.ts is evaluated.
// ---------------------------------------------------------------------------

vi.mock("./capture.js", () => ({
  captureDocs: vi.fn()
}));

// Import after mock is registered.
import { captureDocs } from "./capture.js";
import { handleCaptureTool } from "./mcp.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockCaptureDocs = captureDocs as ReturnType<typeof vi.fn>;

const validResult: CaptureResult = {
  name: "test-lib",
  rootDir: "/tmp/docs/test-lib",
  manifestPath: "/tmp/docs/test-lib/manifest.json",
  pages: [],
  failures: []
};

beforeEach(() => {
  mockCaptureDocs.mockReset();
  mockCaptureDocs.mockResolvedValue(validResult);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleCaptureTool", () => {
  describe("valid input", () => {
    it("calls captureDocs and returns success content", async () => {
      const result = await handleCaptureTool({ url: "https://example.com/docs" });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.type).toBe("text");
      expect(result.content[0]?.text).toContain("Captured docs for test-lib");
    });

    it("applies schema defaults when optional fields are omitted", async () => {
      await handleCaptureTool({ url: "https://example.com/docs" });

      expect(mockCaptureDocs).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://example.com/docs",
          maxPages: 500,
          force: false,
          forceLargeCrawl: false,
          headless: true,
          respectRobots: true,
          rateLimitMs: 100
        })
      );
    });

    it("passes explicit rateLimitMs default of 0 through correctly", async () => {
      await handleCaptureTool({
        url: "https://example.com/docs",
        rateLimitMs: 0
      });

      expect(mockCaptureDocs).toHaveBeenCalledWith(
        expect.objectContaining({ rateLimitMs: 0 })
      );
    });

    it("passes forceLargeCrawl: true and respectRobots: false when provided", async () => {
      await handleCaptureTool({
        url: "https://example.com/docs",
        forceLargeCrawl: true,
        respectRobots: false,
        rateLimitMs: 0
      });

      expect(mockCaptureDocs).toHaveBeenCalledWith(
        expect.objectContaining({
          forceLargeCrawl: true,
          respectRobots: false,
          rateLimitMs: 0
        })
      );
    });

    it("forwards the name field when provided", async () => {
      await handleCaptureTool({ url: "https://example.com", name: "mylib" });

      expect(mockCaptureDocs).toHaveBeenCalledWith(
        expect.objectContaining({ name: "mylib" })
      );
    });
  });

  describe("invalid input — missing url", () => {
    it("returns isError: true mentioning url when url is absent", async () => {
      const result = await handleCaptureTool({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/url/i);
    });
  });

  describe("invalid input — bad url", () => {
    it("returns isError: true for a non-URL string", async () => {
      const result = await handleCaptureTool({ url: "not-a-url" });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/url/i);
    });

    it("returns isError: true for an empty string url", async () => {
      const result = await handleCaptureTool({ url: "" });

      expect(result.isError).toBe(true);
    });
  });

  describe("invalid input — bad maxPages", () => {
    it("returns isError: true for maxPages: -1", async () => {
      const result = await handleCaptureTool({
        url: "https://example.com",
        maxPages: -1
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/maxPages|max_pages/i);
    });

    it("returns isError: true for maxPages: 0", async () => {
      const result = await handleCaptureTool({
        url: "https://example.com",
        maxPages: 0
      });

      expect(result.isError).toBe(true);
    });

    it("returns isError: true for maxPages exceeding 5000", async () => {
      const result = await handleCaptureTool({
        url: "https://example.com",
        maxPages: 5001
      });

      expect(result.isError).toBe(true);
    });

    it("returns isError: true for maxPages as a string", async () => {
      const result = await handleCaptureTool({
        url: "https://example.com",
        maxPages: "abc"
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("captureDocs throws", () => {
    it("returns isError: true with the error message when captureDocs throws", async () => {
      mockCaptureDocs.mockRejectedValue(new Error("network timeout"));

      const result = await handleCaptureTool({ url: "https://example.com" });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("network timeout");
    });

    it("handles non-Error thrown values gracefully", async () => {
      mockCaptureDocs.mockRejectedValue("string error");

      const result = await handleCaptureTool({ url: "https://example.com" });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("string error");
    });
  });

  describe("unknown tool name (via CallTool handler contract)", () => {
    it("handleCaptureTool does not handle unknown tools — caller responsibility", async () => {
      // handleCaptureTool only handles capture_docs args; the unknown-tool
      // path is guarded in the SDK CallToolRequestSchema handler in runMcpServer.
      // We verify handleCaptureTool itself still returns a validation error
      // when given completely invalid input (e.g. empty object), not a crash.
      const result = await handleCaptureTool(null);
      expect(result.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Unknown-tool guard — inline simulation of what the SDK handler does.
// ---------------------------------------------------------------------------

describe("unknown tool guard (simulated SDK handler)", () => {
  function simulateCallToolHandler(
    toolName: string,
    args: unknown
  ): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
    if (toolName !== "capture_docs") {
      return Promise.resolve({
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }]
      });
    }
    return handleCaptureTool(args);
  }

  it("returns isError: true for an unknown tool name", async () => {
    const result = await simulateCallToolHandler("not_a_tool", {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Unknown tool: not_a_tool");
  });

  it("delegates to handleCaptureTool for capture_docs", async () => {
    const result = await simulateCallToolHandler("capture_docs", {
      url: "https://example.com"
    });

    expect(result.isError).toBeUndefined();
    expect(mockCaptureDocs).toHaveBeenCalled();
  });
});
