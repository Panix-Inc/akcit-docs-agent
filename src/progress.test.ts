import { describe, expect, it, beforeEach } from "vitest";
import { createProgressRenderer } from "./progress.js";
import type { ProgressEvent } from "./types.js";

interface FakeStream extends NodeJS.WriteStream {
  output: string[];
}

function fakeStream(isTTY: boolean): FakeStream {
  const output: string[] = [];
  const stream = {
    isTTY,
    output,
    write(chunk: string | Uint8Array): boolean {
      output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }
  } as unknown as FakeStream;
  return stream;
}

const events: ProgressEvent[] = [
  { phase: "discover-start", seedUrl: "https://example.com" },
  { phase: "discover-end", total: 3 },
  { phase: "page-start", url: "https://example.com/a", index: 1, total: 3 },
  { phase: "page-success", url: "https://example.com/a", index: 1, total: 3, outputPath: "a.md" },
  { phase: "page-start", url: "https://example.com/b", index: 2, total: 3 },
  { phase: "page-fail", url: "https://example.com/b", index: 2, total: 3, reason: "HTTP 500" },
  { phase: "page-retry", url: "https://example.com/b", attempt: 1, delayMs: 500, reason: "HTTP 500" },
  { phase: "throttle-adapt", newRateLimitMs: 1500 }
];

describe("createProgressRenderer", () => {
  describe("silent modes", () => {
    it("json mode emits nothing", () => {
      const stream = fakeStream(true);
      const r = createProgressRenderer({ json: true, quiet: false, verbose: false, noProgress: false, stream });
      events.forEach((e) => r.handle(e));
      r.finish();
      expect(stream.output.join("")).toBe("");
    });

    it("quiet mode emits nothing", () => {
      const stream = fakeStream(true);
      const r = createProgressRenderer({ json: false, quiet: true, verbose: false, noProgress: false, stream });
      events.forEach((e) => r.handle(e));
      r.finish();
      expect(stream.output.join("")).toBe("");
    });
  });

  describe("verbose / line mode", () => {
    let stream: FakeStream;
    beforeEach(() => { stream = fakeStream(true); });

    it("explicit verbose flag uses line mode (no escape codes)", () => {
      const r = createProgressRenderer({ json: false, quiet: false, verbose: true, noProgress: false, stream });
      events.forEach((e) => r.handle(e));
      r.finish();
      const out = stream.output.join("");
      expect(out).not.toContain("\x1b["); // no ANSI cursor codes in verbose mode
      expect(out).toContain("discovering");
      expect(out).toContain("3 pages to capture");
      expect(out).toContain("[1/3] fetching https://example.com/a");
      expect(out).toContain("ok    -> a.md");
      expect(out).toContain("FAIL  https://example.com/b");
      expect(out).toContain("retry attempt 1");
      expect(out).toContain("adaptive throttle");
    });

    it("non-TTY auto-falls-back to line mode", () => {
      const nonTTY = fakeStream(false);
      const r = createProgressRenderer({ json: false, quiet: false, verbose: false, noProgress: false, stream: nonTTY });
      events.forEach((e) => r.handle(e));
      r.finish();
      expect(nonTTY.output.join("")).not.toContain("\x1b[");
      expect(nonTTY.output.join("")).toContain("[1/3] fetching");
    });

    it("--no-progress falls back to line mode even on TTY", () => {
      const r = createProgressRenderer({ json: false, quiet: false, verbose: false, noProgress: true, stream });
      events.forEach((e) => r.handle(e));
      r.finish();
      expect(stream.output.join("")).not.toContain("\x1b[");
    });
  });

  describe("bar mode", () => {
    let stream: FakeStream;
    let nowValue: number;
    beforeEach(() => {
      stream = fakeStream(true);
      nowValue = 1_000_000;
    });

    it("renders ANSI clear+CR sequences and unicode bar on TTY", () => {
      const r = createProgressRenderer({
        json: false, quiet: false, verbose: false, noProgress: false,
        stream, isTTY: true, now: () => (nowValue += 200)
      });
      events.forEach((e) => r.handle(e));
      r.finish();
      const joined = stream.output.join("");
      expect(joined).toContain("\x1b[2K\r"); // clear-line + carriage return
      expect(joined).toMatch(/[█░]/); // unicode bar
      expect(joined).toContain("eta");
    });

    it("shows current URL pathname (origin stripped)", () => {
      const r = createProgressRenderer({
        json: false, quiet: false, verbose: false, noProgress: false,
        stream, isTTY: true, now: () => (nowValue += 200)
      });
      r.handle({ phase: "discover-start", seedUrl: "https://example.com" });
      r.handle({ phase: "discover-end", total: 1 });
      r.handle({ phase: "page-start", url: "https://example.com/some/long/path", index: 1, total: 1 });
      r.finish();
      const out = stream.output.join("");
      expect(out).toContain("/some/long/path");
      expect(out).not.toContain("https://example.com/some/long/path");
    });

    it("emits a final newline on finish", () => {
      const r = createProgressRenderer({
        json: false, quiet: false, verbose: false, noProgress: false,
        stream, isTTY: true, now: () => (nowValue += 200)
      });
      r.handle({ phase: "discover-start", seedUrl: "x" });
      r.handle({ phase: "discover-end", total: 0 });
      r.finish();
      expect(stream.output[stream.output.length - 1]).toBe("\n");
    });
  });
});
