import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import { access, mkdir, readFile, rm, stat } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { captureDocs } from "./capture.js";

const playwrightMocks = vi.hoisted(() => ({
  pageGoto: vi.fn(),
  pageContent: vi.fn(),
  pageClose: vi.fn(),
  browserClose: vi.fn()
}));

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }])
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newPage: vi.fn(async () => ({
        goto: playwrightMocks.pageGoto,
        content: playwrightMocks.pageContent,
        close: playwrightMocks.pageClose
      })),
      close: playwrightMocks.browserClose
    }))
  }
}));

const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>;

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
  tmpDir = path.join(os.tmpdir(), `akcit-capture-test-${suffix}`);
  await mkdir(tmpDir, { recursive: true });
  playwrightMocks.pageGoto.mockReset();
  playwrightMocks.pageContent.mockReset();
  playwrightMocks.pageClose.mockReset();
  playwrightMocks.browserClose.mockReset();
  playwrightMocks.pageGoto.mockResolvedValue(undefined);
  playwrightMocks.pageContent.mockResolvedValue("<html><head><title>Rendered</title></head><body><main><p>Rendered content</p></main></body></html>");
  playwrightMocks.pageClose.mockResolvedValue(undefined);
  playwrightMocks.browserClose.mockResolvedValue(undefined);
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
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

  it("throws when seed hostname resolves to a private IP", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      captureDocs({
        url: "https://docs.example.com",
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

describe("llms.txt discovery", () => {
  it("checks nested path prefixes such as /framework/docs/llms.txt", async () => {
    const responses = new Map<string, { status: number; body: string; contentType?: string }>([
      ["https://example.com/robots.txt", { status: 404, body: "" }],
      ["https://example.com/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/llms.txt", { status: 404, body: "" }],
      ["https://example.com/framework/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/framework/llms.txt", { status: 404, body: "" }],
      ["https://example.com/framework/docs/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/framework/docs/llms.txt", {
        status: 200,
        body: "- [API](./api.md)",
        contentType: "text/plain"
      }],
      ["https://example.com/framework/docs/api.md", {
        status: 200,
        body: "# API\n\nNested llms docs.",
        contentType: "text/markdown"
      }]
    ]);

    const fetchSpy = makeFetchMock(responses);
    vi.stubGlobal("fetch", fetchSpy);

    const result = await captureDocs({
      url: "https://example.com/framework/docs",
      maxPages: 10,
      force: false,
      forceLargeCrawl: false,
      headless: false,
      respectRobots: false,
      rateLimitMs: 0,
      outputDir: tmpDir
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.url).toBe("https://example.com/framework/docs/api.md");
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toContain("https://example.com/framework/docs/llms.txt");
  });
});

describe("Playwright fallback lifecycle", () => {
  it("closes page and owned browser when discovery uses headless fallback without singleton", async () => {
    const responses = new Map<string, { status: number; body: string; contentType?: string }>([
      ["https://example.com/robots.txt", { status: 404, body: "" }],
      ["https://example.com/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/llms.txt", { status: 404, body: "" }],
      ["https://example.com/docs/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/docs/llms.txt", { status: 404, body: "" }],
      ["https://example.com/docs", {
        status: 200,
        body: "<html><head><title>Shell</title></head><body><main></main></body></html>"
      }],
      ["https://example.com/sitemap.xml", { status: 404, body: "" }],
      ["https://example.com/sitemap_index.xml", { status: 404, body: "" }],
      ["https://example.com/docs/api.md", {
        status: 200,
        body: "# API\n\nRendered markdown.",
        contentType: "text/markdown"
      }]
    ]);
    vi.stubGlobal("fetch", makeFetchMock(responses));
    playwrightMocks.pageContent.mockResolvedValue(
      "<html><head><title>Rendered</title></head><body><main><a href='/docs/api.md'>View as Markdown</a></main></body></html>"
    );

    await captureDocs({
      url: "https://example.com/docs",
      maxPages: 10,
      force: false,
      forceLargeCrawl: false,
      headless: true,
      respectRobots: false,
      rateLimitMs: 0,
      outputDir: tmpDir
    });

    expect(playwrightMocks.pageClose).toHaveBeenCalledTimes(1);
    expect(playwrightMocks.browserClose).toHaveBeenCalledTimes(1);
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

describe("retry / polite layer", () => {
  type ResponseEntry = { status: number; body: string; contentType?: string; retryAfter?: string };

  function makeSequencedMock(perUrl: Map<string, ResponseEntry[]>) {
    const callCount = new Map<string, number>();
    const fn = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = String(url);
      const queue = perUrl.get(u);
      const n = callCount.get(u) ?? 0;
      callCount.set(u, n + 1);
      const entry = queue && queue[Math.min(n, queue.length - 1)];
      if (!entry) {
        return {
          ok: false, status: 404,
          headers: { get: () => null },
          body: null, text: async () => ""
        };
      }
      const encoded = new TextEncoder().encode(entry.body);
      const stream = new ReadableStream<Uint8Array>({
        start(c) { c.enqueue(encoded); c.close(); }
      });
      return {
        ok: entry.status >= 200 && entry.status < 300,
        status: entry.status,
        headers: {
          get: (h: string) => {
            const lower = h.toLowerCase();
            if (lower === "content-type") return entry.contentType ?? "text/html";
            if (lower === "retry-after") return entry.retryAfter ?? null;
            return null;
          }
        },
        body: stream
      };
    });
    return { fn, callCount };
  }

  const sitemapXml = (urls: string[]): string =>
    [`<?xml version="1.0"?>`, "<urlset>",
      ...urls.map((u) => `<url><loc>${u}</loc></url>`),
      "</urlset>"].join("\n");

  const baseOpts = (tmp: string) => ({
    url: "https://example.com",
    maxPages: 10, force: false, forceLargeCrawl: false,
    headless: false, respectRobots: false,
    rateLimitMs: 0, outputDir: tmp,
    jitter: false // deterministic in tests
  });

  it("retries on 429 with Retry-After=0 and succeeds on 2nd attempt", async () => {
    const perUrl = new Map<string, ResponseEntry[]>([
      ["https://example.com/robots.txt", [{ status: 404, body: "" }]],
      ["https://example.com/llms-full.txt", [{ status: 404, body: "" }]],
      ["https://example.com/llms.txt", [{ status: 404, body: "" }]],
      ["https://example.com/sitemap.xml", [{
        status: 200, contentType: "application/xml",
        body: sitemapXml(["https://example.com/page-a"])
      }]],
      ["https://example.com/sitemap_index.xml", [{ status: 404, body: "" }]],
      ["https://example.com/page-a", [
        { status: 429, body: "", retryAfter: "0" },
        { status: 200, body: "<html><head><title>A</title></head><body><p>ok</p></body></html>" }
      ]]
    ]);
    const { fn, callCount } = makeSequencedMock(perUrl);
    vi.stubGlobal("fetch", fn);

    const result = await captureDocs({ ...baseOpts(tmpDir), maxRetries: 3 });
    expect(result.pages.length).toBe(1);
    expect(callCount.get("https://example.com/page-a")).toBe(2);
  }, 10_000);

  it("exhausts retries on persistent 503 and pushes to failures", async () => {
    const perUrl = new Map<string, ResponseEntry[]>([
      ["https://example.com/robots.txt", [{ status: 404, body: "" }]],
      ["https://example.com/llms-full.txt", [{ status: 404, body: "" }]],
      ["https://example.com/llms.txt", [{ status: 404, body: "" }]],
      ["https://example.com/sitemap.xml", [{
        status: 200, contentType: "application/xml",
        body: sitemapXml(["https://example.com/page-x"])
      }]],
      ["https://example.com/sitemap_index.xml", [{ status: 404, body: "" }]],
      ["https://example.com/page-x", [
        { status: 503, body: "", retryAfter: "0" }
      ]]
    ]);
    const { fn, callCount } = makeSequencedMock(perUrl);
    vi.stubGlobal("fetch", fn);

    const result = await captureDocs({ ...baseOpts(tmpDir), maxRetries: 2 });
    expect(result.pages.length).toBe(0);
    expect(result.failures.length).toBe(1);
    expect(result.failures[0]?.reason).toMatch(/HTTP 503|503/);
    // Initial attempt + 2 retries = 3 total calls
    expect(callCount.get("https://example.com/page-x")).toBe(3);
  }, 10_000);

  it("emits onProgress events: discover-start, discover-end, page-start, page-success", async () => {
    const perUrl = new Map<string, ResponseEntry[]>([
      ["https://example.com/robots.txt", [{ status: 404, body: "" }]],
      ["https://example.com/llms-full.txt", [{ status: 404, body: "" }]],
      ["https://example.com/llms.txt", [{ status: 404, body: "" }]],
      ["https://example.com/sitemap.xml", [{
        status: 200, contentType: "application/xml",
        body: sitemapXml(["https://example.com/page-a", "https://example.com/page-b"])
      }]],
      ["https://example.com/sitemap_index.xml", [{ status: 404, body: "" }]],
      ["https://example.com/page-a", [{ status: 200, body: "<html><body>a</body></html>" }]],
      ["https://example.com/page-b", [{ status: 200, body: "<html><body>b</body></html>" }]]
    ]);
    const { fn } = makeSequencedMock(perUrl);
    vi.stubGlobal("fetch", fn);

    const events: string[] = [];
    await captureDocs({
      ...baseOpts(tmpDir),
      maxRetries: 0,
      onProgress: (e) => events.push(e.phase)
    });

    expect(events[0]).toBe("discover-start");
    expect(events).toContain("discover-end");
    expect(events.filter((e) => e === "page-start").length).toBe(2);
    expect(events.filter((e) => e === "page-success").length).toBe(2);
  });

  it("emits page-retry and throttle-adapt on 429", async () => {
    const perUrl = new Map<string, ResponseEntry[]>([
      ["https://example.com/robots.txt", [{ status: 404, body: "" }]],
      ["https://example.com/llms-full.txt", [{ status: 404, body: "" }]],
      ["https://example.com/llms.txt", [{ status: 404, body: "" }]],
      ["https://example.com/sitemap.xml", [{
        status: 200, contentType: "application/xml",
        body: sitemapXml(["https://example.com/page-c"])
      }]],
      ["https://example.com/sitemap_index.xml", [{ status: 404, body: "" }]],
      ["https://example.com/page-c", [
        { status: 429, body: "", retryAfter: "0" },
        { status: 200, body: "<html><body>c</body></html>" }
      ]]
    ]);
    const { fn } = makeSequencedMock(perUrl);
    vi.stubGlobal("fetch", fn);

    const phases: string[] = [];
    await captureDocs({
      ...baseOpts(tmpDir),
      maxRetries: 3,
      onProgress: (e) => phases.push(e.phase)
    });

    expect(phases).toContain("page-retry");
    expect(phases).toContain("throttle-adapt");
  }, 10_000);
});

describe("SKILL.md generation (per-tech)", () => {
  function basicResponses() {
    return new Map([
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
  }

  const baseOpts = (tmp: string) => ({
    url: "https://example.com",
    maxPages: 10, force: false, forceLargeCrawl: false,
    headless: false, respectRobots: false,
    rateLimitMs: 0, outputDir: tmp,
    jitter: false
  });

  it("writes docs/<tech>/SKILL.md by default", async () => {
    vi.stubGlobal("fetch", makeFetchMock(basicResponses()));
    await captureDocs(baseOpts(tmpDir));

    const skillPath = path.join(tmpDir, "example", "SKILL.md");
    const content = await readFile(skillPath, "utf8");
    expect(content).toContain("name: docs-example");
    expect(content).toContain("https://example.com");
    expect(content).toContain("## Quick entry points");
  });

  it("skips SKILL.md when skill: false", async () => {
    vi.stubGlobal("fetch", makeFetchMock(basicResponses()));
    await captureDocs({ ...baseOpts(tmpDir), skill: false });

    const skillPath = path.join(tmpDir, "example", "SKILL.md");
    await expect(access(skillPath)).rejects.toThrow();
  });
});

describe("code indexes", () => {
  it("writes api-index.md, examples-index.md, and snippets.json", async () => {
    const responses = new Map<string, { status: number; body: string; contentType?: string }>([
      ["https://example.com/robots.txt", { status: 404, body: "" }],
      ["https://example.com/llms-full.txt", { status: 404, body: "" }],
      ["https://example.com/llms.txt", { status: 404, body: "" }],
      ["https://example.com/sitemap.xml", {
        status: 200,
        body: '<?xml version="1.0"?><urlset><url><loc>https://example.com/api</loc></url></urlset>',
        contentType: "application/xml"
      }],
      ["https://example.com/sitemap_index.xml", { status: 404, body: "" }],
      ["https://example.com/api", {
        status: 200,
        body: [
          "<html><head><title>API</title></head><body><main>",
          "<h1>API</h1>",
          "<pre><code class=\"language-typescript\">import { Agent } from '@sdk/agent';\nexport function createAgent() {}\n</code></pre>",
          "<pre><code>npm test</code></pre>",
          "</main></body></html>"
        ].join("")
      }]
    ]);
    vi.stubGlobal("fetch", makeFetchMock(responses));

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

    const root = path.join(tmpDir, "example");
    const apiIndex = await readFile(path.join(root, "api-index.md"), "utf8");
    const examplesIndex = await readFile(path.join(root, "examples-index.md"), "utf8");
    const snippets = JSON.parse(await readFile(path.join(root, "snippets.json"), "utf8")) as Array<{ language: string; code: string }>;
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as { indexes?: { snippetCount: number; symbolCount: number } };

    expect(apiIndex).toContain("createAgent()");
    expect(apiIndex).toContain("@sdk/agent");
    expect(apiIndex).toContain("npm test");
    expect(examplesIndex).toContain("api.md#snippet-1");
    expect(snippets).toHaveLength(2);
    expect(snippets[0]?.language).toBe("typescript");
    expect(manifest.indexes?.snippetCount).toBe(2);
    expect(manifest.indexes?.symbolCount).toBeGreaterThan(0);
  });
});
