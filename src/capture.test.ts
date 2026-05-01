import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdir, rm, stat } from "node:fs/promises";
import { captureDocs } from "./capture.js";

// Minimal fetch mock builder
function makeFetchMock(responses: Map<string, { status: number; body: string; contentType?: string }>) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const entry = responses.get(url);
    if (!entry) {
      return {
        ok: false,
        status: 404,
        headers: { get: () => null },
        body: null,
        text: async () => ""
      };
    }
    const { status, body, contentType = "text/html" } = entry;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(body);
    // Provide body as a ReadableStream to exercise stream path
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      }
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (h: string) => {
          if (h === "content-type") return contentType;
          if (h === "location") return null;
          return null;
        }
      },
      body: stream
    };
  });
}

let tmpDir: string;

beforeEach(async () => {
  const suffix = Math.random().toString(36).slice(2);
  tmpDir = path.join(os.tmpdir(), `avakit-capture-test-${suffix}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tmpDir, { recursive: true, force: true });
});

describe("LARGE_CRAWL_THRESHOLD guard", () => {
  it("throws when discovered pages exceed threshold even if maxPages is under threshold", async () => {
    // Build 501 distinct URLs as a sitemap
    const sitemapXml = [
      '<?xml version="1.0"?>',
      "<urlset>",
      ...Array.from({ length: 501 }, (_, i) => `<url><loc>https://example.com/page-${i}</loc></url>`),
      "</urlset>"
    ].join("\n");

    const responses = new Map([
      ["https://example.com/robots.txt", { status: 404, body: "" }],
      ["https://example.com/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/llms.txt", { status: 404, body: "" }],
      ["https://example.com/sitemap.xml", { status: 200, body: sitemapXml, contentType: "application/xml" }],
      ["https://example.com/sitemap_index.xml", { status: 404, body: "" }]
    ]);

    vi.stubGlobal("fetch", makeFetchMock(responses));

    await expect(
      captureDocs({
        url: "https://example.com",
        maxPages: 400, // under threshold — bug was threshold never triggered
        force: false,
        forceLargeCrawl: false,
        headless: false,
        respectRobots: false,
        rateLimitMs: 0,
        outputDir: tmpDir
      })
    ).rejects.toThrow(/501/);
  });

  it("proceeds when forceLargeCrawl=true even above threshold", async () => {
    // Build 501 URLs but only allow 2 to be fetched (maxPages=2)
    const sitemapXml = [
      '<?xml version="1.0"?>',
      "<urlset>",
      ...Array.from({ length: 501 }, (_, i) => `<url><loc>https://example.com/page-${i}</loc></url>`),
      "</urlset>"
    ].join("\n");

    const responses = new Map<string, { status: number; body: string; contentType?: string }>([
      ["https://example.com/robots.txt", { status: 404, body: "" }],
      ["https://example.com/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/llms.txt", { status: 404, body: "" }],
      ["https://example.com/sitemap.xml", { status: 200, body: sitemapXml, contentType: "application/xml" }],
      ["https://example.com/sitemap_index.xml", { status: 404, body: "" }]
    ]);
    // Add page responses for first 2 pages
    for (let i = 0; i < 2; i++) {
      responses.set(`https://example.com/page-${i}`, {
        status: 200,
        body: `<html><head><title>Page ${i}</title></head><body><p>Content ${i}</p></body></html>`
      });
    }

    vi.stubGlobal("fetch", makeFetchMock(responses));

    const result = await captureDocs({
      url: "https://example.com",
      maxPages: 2,
      force: false,
      forceLargeCrawl: true,
      headless: false,
      respectRobots: false,
      rateLimitMs: 0,
      outputDir: tmpDir
    });

    expect(result.pages.length).toBe(2);
  });
});

describe("robots.txt blocking", () => {
  it("pushes blocked URL into failures", async () => {
    const robotsTxt = `User-agent: *\nDisallow: /blocked-page`;
    const sitemapXml = [
      '<?xml version="1.0"?>',
      "<urlset>",
      "<url><loc>https://example.com/allowed-page</loc></url>",
      "<url><loc>https://example.com/blocked-page</loc></url>",
      "</urlset>"
    ].join("\n");

    const responses = new Map<string, { status: number; body: string; contentType?: string }>([
      ["https://example.com/robots.txt", { status: 200, body: robotsTxt, contentType: "text/plain" }],
      ["https://example.com/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/llms.txt", { status: 404, body: "" }],
      ["https://example.com/sitemap.xml", { status: 200, body: sitemapXml, contentType: "application/xml" }],
      ["https://example.com/sitemap_index.xml", { status: 404, body: "" }],
      ["https://example.com/allowed-page", {
        status: 200,
        body: "<html><head><title>Allowed</title></head><body><p>OK</p></body></html>"
      }]
    ]);

    vi.stubGlobal("fetch", makeFetchMock(responses));

    const result = await captureDocs({
      url: "https://example.com",
      maxPages: 10,
      force: false,
      forceLargeCrawl: false,
      headless: false,
      respectRobots: true,
      rateLimitMs: 0,
      outputDir: tmpDir
    });

    const blockedFailures = result.failures.filter((f) => f.url.includes("blocked-page"));
    expect(blockedFailures.length).toBeGreaterThan(0);
    expect(blockedFailures[0]?.reason).toMatch(/robots/i);
  });
});

describe("SSRF protection on seed URL", () => {
  it("throws when seed URL is a private IP", async () => {
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      captureDocs({
        url: "http://169.254.169.254/latest/meta-data/",
        maxPages: 5,
        force: false,
        forceLargeCrawl: false,
        headless: false,
        respectRobots: false,
        rateLimitMs: 0,
        outputDir: tmpDir
      })
    ).rejects.toThrow(/Unsafe URL/);

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("throws when seed URL uses file:// protocol", async () => {
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      captureDocs({
        url: "file:///etc/passwd",
        maxPages: 5,
        force: false,
        forceLargeCrawl: false,
        headless: false,
        respectRobots: false,
        rateLimitMs: 0,
        outputDir: tmpDir
      })
    ).rejects.toThrow(/Unsafe URL/);
  });
});

describe("concurrency", () => {
  it("completes 5 pages in under 500ms with mocked 100ms latency each", async () => {
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const slowFetch = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("robots.txt") || u.includes("llms") || u.includes("sitemap")) {
        return {
          ok: false,
          status: 404,
          headers: { get: () => null },
          body: null
        };
      }
      // Simulate network latency per page
      await delay(100);
      const body = `<html><head><title>Page</title></head><body><p>ok</p></body></html>`;
      const encoded = new TextEncoder().encode(body);
      const stream = new ReadableStream<Uint8Array>({
        start(c) { c.enqueue(encoded); c.close(); }
      });
      return {
        ok: true,
        status: 200,
        headers: { get: (h: string) => h === "content-type" ? "text/html" : null },
        body: stream
      };
    });

    vi.stubGlobal("fetch", slowFetch);

    // Build a small sitemap with exactly 5 pages
    const sitemapXml = [
      '<?xml version="1.0"?>',
      "<urlset>",
      ...Array.from({ length: 5 }, (_, i) => `<url><loc>https://example.com/page-${i}</loc></url>`),
      "</urlset>"
    ].join("\n");

    // Override the sitemap fetch
    slowFetch.mockImplementation(async (url: string, _init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("sitemap.xml")) {
        const encoded = new TextEncoder().encode(sitemapXml);
        const stream = new ReadableStream<Uint8Array>({
          start(c) { c.enqueue(encoded); c.close(); }
        });
        return {
          ok: true,
          status: 200,
          headers: { get: (h: string) => h === "content-type" ? "application/xml" : null },
          body: stream
        };
      }
      if (u.includes("robots") || u.includes("llms") || u.includes("sitemap_index")) {
        return { ok: false, status: 404, headers: { get: () => null }, body: null, text: async () => "" };
      }
      await delay(100);
      const body = `<html><head><title>Page</title></head><body><p>ok</p></body></html>`;
      const encoded = new TextEncoder().encode(body);
      const stream = new ReadableStream<Uint8Array>({
        start(c) { c.enqueue(encoded); c.close(); }
      });
      return {
        ok: true,
        status: 200,
        headers: { get: (h: string) => h === "content-type" ? "text/html" : null },
        body: stream
      };
    });

    const start = Date.now();
    const result = await captureDocs({
      url: "https://example.com",
      maxPages: 5,
      force: false,
      forceLargeCrawl: false,
      headless: false,
      respectRobots: false,
      rateLimitMs: 0,
      outputDir: tmpDir,
      concurrency: 5
    } as Parameters<typeof captureDocs>[0]);
    const elapsed = Date.now() - start;

    expect(result.pages.length).toBe(5);
    // Sequential would be ~500ms; concurrent should be well under that
    expect(elapsed).toBeLessThan(450);
  });
});

describe("manifest idempotency", () => {
  it("does not update manifest mtime when pages and failures are unchanged", async () => {
    // First run: capture one page
    const responses = new Map<string, { status: number; body: string; contentType?: string }>([
      ["https://example.com/robots.txt", { status: 404, body: "" }],
      ["https://example.com/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/llms.txt", { status: 404, body: "" }],
      ["https://example.com/sitemap.xml", {
        status: 200,
        body: '<?xml version="1.0"?><urlset><url><loc>https://example.com/about</loc></url></urlset>',
        contentType: "application/xml"
      }],
      ["https://example.com/sitemap_index.xml", { status: 404, body: "" }],
      ["https://example.com/about", {
        status: 200,
        body: "<html><head><title>About</title></head><body><p>About page</p></body></html>"
      }]
    ]);

    vi.stubGlobal("fetch", makeFetchMock(responses));

    const opts = {
      url: "https://example.com",
      maxPages: 10,
      force: false,
      forceLargeCrawl: false,
      headless: false,
      respectRobots: false,
      rateLimitMs: 0,
      outputDir: tmpDir
    };

    await captureDocs(opts);
    const manifestPath = path.join(tmpDir, "example", "manifest.json");
    const firstStat = await stat(manifestPath);

    // Small delay to ensure mtime would change if file were rewritten
    await new Promise((r) => setTimeout(r, 50));

    // Second run with same data
    vi.stubGlobal("fetch", makeFetchMock(responses));
    await captureDocs(opts);
    const secondStat = await stat(manifestPath);

    // mtime should be the same — file was not rewritten
    expect(firstStat.mtimeMs).toBe(secondStat.mtimeMs);
  });
});

describe("resume (P3 #23)", () => {
  function makeSitemapMock(urls: string[]) {
    const sitemapXml = [
      '<?xml version="1.0"?>',
      "<urlset>",
      ...urls.map((u) => `<url><loc>${u}</loc></url>`),
      "</urlset>"
    ].join("\n");
    const responses = new Map<string, { status: number; body: string; contentType?: string }>([
      ["https://example.com/robots.txt", { status: 404, body: "" }],
      ["https://example.com/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/llms.txt", { status: 404, body: "" }],
      ["https://example.com/sitemap.xml", {
        status: 200,
        body: sitemapXml,
        contentType: "application/xml"
      }],
      ["https://example.com/sitemap_index.xml", { status: 404, body: "" }]
    ]);
    for (const u of urls) {
      responses.set(u, {
        status: 200,
        body: `<html><head><title>${u}</title></head><body><p>${u}</p></body></html>`
      });
    }
    return responses;
  }

  it("skips URLs already in existing manifest when force=false", async () => {
    const urls = [
      "https://example.com/page-a",
      "https://example.com/page-b",
      "https://example.com/page-c"
    ];

    // First run: capture all 3
    vi.stubGlobal("fetch", makeFetchMock(makeSitemapMock(urls)));
    const baseOpts = {
      url: "https://example.com",
      maxPages: 10,
      force: false,
      forceLargeCrawl: false,
      headless: false,
      respectRobots: false,
      rateLimitMs: 0,
      outputDir: tmpDir
    };
    const first = await captureDocs(baseOpts);
    expect(first.pages.length).toBe(3);

    // Second run: fetch tracker — only NEW URLs should be fetched
    const fetchSpy = makeFetchMock(makeSitemapMock(urls));
    vi.stubGlobal("fetch", fetchSpy);
    const second = await captureDocs(baseOpts);
    expect(second.pages.length).toBe(3);

    // Manifest URL fetches happen (robots, llms, sitemap) but page-a/b/c should NOT be re-fetched
    const fetchedUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    for (const u of urls) {
      expect(fetchedUrls).not.toContain(u);
    }
  });

  it("force=true re-fetches every page and ignores existing manifest", async () => {
    const urls = ["https://example.com/page-a", "https://example.com/page-b"];

    vi.stubGlobal("fetch", makeFetchMock(makeSitemapMock(urls)));
    const baseOpts = {
      url: "https://example.com",
      maxPages: 10,
      force: false,
      forceLargeCrawl: false,
      headless: false,
      respectRobots: false,
      rateLimitMs: 0,
      outputDir: tmpDir
    };
    await captureDocs(baseOpts);

    const fetchSpy = makeFetchMock(makeSitemapMock(urls));
    vi.stubGlobal("fetch", fetchSpy);
    await captureDocs({ ...baseOpts, force: true });

    const fetchedUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    for (const u of urls) {
      expect(fetchedUrls).toContain(u);
    }
  });

  it("ignores existing manifest when sourceUrl differs", async () => {
    const urls = ["https://example.com/page-a"];
    vi.stubGlobal("fetch", makeFetchMock(makeSitemapMock(urls)));
    await captureDocs({
      url: "https://example.com",
      maxPages: 10,
      force: false,
      forceLargeCrawl: false,
      headless: false,
      respectRobots: false,
      rateLimitMs: 0,
      outputDir: tmpDir
    });

    // Manually rewrite manifest to point at a different sourceUrl while keeping page-a
    const { readFile, writeFile: writeFileFs } = await import("node:fs/promises");
    const manifestPath = path.join(tmpDir, "example", "manifest.json");
    const content = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(content) as { sourceUrl: string };
    parsed.sourceUrl = "https://other-site.com";
    await writeFileFs(manifestPath, JSON.stringify(parsed, null, 2));

    const fetchSpy = makeFetchMock(makeSitemapMock(urls));
    vi.stubGlobal("fetch", fetchSpy);
    await captureDocs({
      url: "https://example.com",
      maxPages: 10,
      force: false,
      forceLargeCrawl: false,
      headless: false,
      respectRobots: false,
      rateLimitMs: 0,
      outputDir: tmpDir
    });

    // Different sourceUrl in manifest → resume disabled → page-a re-fetched
    const fetchedUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(fetchedUrls).toContain("https://example.com/page-a");
  });
});
