import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import robotsParser from "robots-parser";
import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import type { Browser } from "playwright";
import { htmlToMarkdown, normalizeMarkdown } from "./markdown.js";
import type { CaptureFailure, CaptureManifest, CaptureOptions, CaptureResult, CapturedPage, DiscoveredPage } from "./types.js";
import {
  inferTechName,
  isMarkdownUrl,
  isProbablyNoise,
  normalizeUrl,
  outputPathForUrl,
  sameScope,
  sha256,
  sleep,
  writeTextIfChanged
} from "./utils.js";
import { assertSafeUrl } from "./url-safety.js";

const require_ = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pkg = require_("../package.json") as { version: string };
const DEFAULT_USER_AGENT = `avakit-docs-agent/${pkg.version} (+https://github.com/avakit/docs-agent)`;
const LARGE_CRAWL_THRESHOLD = 500;
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_REDIRECTS = 10;
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 5;
const RESUME_FLUSH_EVERY = 25;

export async function captureDocs(options: CaptureOptions): Promise<CaptureResult> {
  const seedUrl = normalizeUrl(options.url);

  // Validate seed URL for SSRF before doing anything
  assertSafeUrl(seedUrl);

  const name = inferTechName(seedUrl, options.name);
  const rootDir = path.resolve(options.outputDir || "docs", name);
  await mkdir(rootDir, { recursive: true });
  const manifestPath = path.join(rootDir, "manifest.json");

  // P3 #23: Resume — load existing manifest and skip URLs already captured
  // unless --force is set or the previous capture targeted a different sourceUrl.
  const existingContent = await readFileText(manifestPath);
  const existingManifest = existingContent ? parseManifestSafe(existingContent) : null;
  const canResume =
    !options.force && existingManifest !== null && existingManifest.sourceUrl === seedUrl;
  const previouslyCaptured = new Map<string, CapturedPage>();
  if (canResume && existingManifest) {
    for (const p of existingManifest.pages) previouslyCaptured.set(p.url, p);
  }

  const robots = options.respectRobots ? await loadRobots(seedUrl) : undefined;
  const discovered = await discoverPages(seedUrl, options, robots);

  // P0 #3: Check threshold BEFORE slice so large crawls are always detected
  if (discovered.length > LARGE_CRAWL_THRESHOLD && !options.forceLargeCrawl) {
    throw new Error(
      `Discovered ${discovered.length} pages (threshold: ${LARGE_CRAWL_THRESHOLD}). Re-run with --force-large-crawl to continue.`
    );
  }

  const selected = discovered
    .slice(0, options.maxPages)
    .filter((d) => !previouslyCaptured.has(d.url));
  const pages: CapturedPage[] = canResume ? [...previouslyCaptured.values()] : [];
  const failures: CaptureFailure[] = [];
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  // Periodic flush — protects against Ctrl+C losing all progress on a long run.
  let flushing = false;
  let captured = 0;
  const flushManifest = async (): Promise<void> => {
    if (flushing) return;
    flushing = true;
    try {
      const partial: CaptureManifest = {
        name,
        sourceUrl: seedUrl,
        generatedAt: new Date().toISOString(),
        sourceKinds: Array.from(new Set(pages.map((p) => p.source))),
        pages,
        failures
      };
      await writeFile(manifestPath, `${JSON.stringify(partial, null, 2)}\n`, "utf8");
    } finally {
      flushing = false;
    }
  };

  // P1 #8: Lazy singleton browser for Playwright — launched once, closed in finally
  let browser: Browser | undefined;
  const getBrowser = async (): Promise<Browser | undefined> => {
    if (browser !== undefined) return browser;
    try {
      const playwright = await import("playwright");
      browser = await playwright.chromium.launch({ headless: true });
      return browser;
    } catch {
      return undefined;
    }
  };

  try {
    // P1 #7: Concurrent worker pool — max N pages in-flight simultaneously
    await runConcurrent(
      selected,
      concurrency,
      options.rateLimitMs,
      async (page) => {
        if (robots && !robots.isAllowed(page.url, DEFAULT_USER_AGENT)) {
          failures.push({ url: page.url, reason: "Blocked by robots.txt" });
          return;
        }
        try {
          const result = await capturePage(rootDir, page, seedUrl, options, getBrowser);
          pages.push(result);
          captured++;
          if (captured % RESUME_FLUSH_EVERY === 0) void flushManifest();
        } catch (error) {
          failures.push({
            url: page.url,
            reason: error instanceof Error ? error.message : String(error)
          });
        }
      }
    );
  } finally {
    await browser?.close().catch(() => undefined);
  }

  // P1 #9: Idempotent manifest — skip write when pages/failures haven't changed.
  // After a resume run, on-disk manifest may have been flushed mid-capture; re-read for diff.
  const manifestForDiff: Omit<CaptureManifest, "generatedAt"> & { generatedAt: "" } = {
    name,
    sourceUrl: seedUrl,
    generatedAt: "",
    sourceKinds: Array.from(new Set(pages.map((p) => p.source))),
    pages,
    failures
  };
  const manifestFull: CaptureManifest = {
    ...manifestForDiff,
    generatedAt: new Date().toISOString()
  };

  const currentDiskContent = await readFileText(manifestPath);
  const existingNormalized = currentDiskContent
    ? normalizeManifestForDiff(currentDiskContent)
    : null;
  const newNormalized = `${JSON.stringify(manifestForDiff, null, 2)}\n`;
  if (existingNormalized !== newNormalized) {
    await writeTextIfChanged(manifestPath, `${JSON.stringify(manifestFull, null, 2)}\n`);
  }

  if (!pages.some((p) => path.basename(p.outputPath) === "index.md")) {
    const index = buildIndex(name, seedUrl, pages, failures);
    await writeTextIfChanged(path.join(rootDir, "index.md"), index);
  }

  return { name, rootDir, manifestPath, pages, failures };
}

// Hand-rolled concurrency pool — dispatches up to `concurrency` tasks in parallel
// with `rateLimitMs` delay between dispatches. Errors are isolated per task.
async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  rateLimitMs: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const active: Promise<void>[] = [];

  const dispatch = async (): Promise<void> => {
    while (queue.length > 0 || active.length > 0) {
      while (active.length < concurrency && queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) break;
        const task = fn(item).finally(() => {
          const idx = active.indexOf(task);
          if (idx !== -1) active.splice(idx, 1);
        });
        active.push(task);
        if (rateLimitMs > 0 && queue.length > 0) await sleep(rateLimitMs);
      }
      if (active.length > 0) await Promise.race(active);
    }
  };

  await dispatch();
}

async function readFileText(filePath: string): Promise<string | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function normalizeManifestForDiff(content: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const withBlankGenAt = { ...parsed, generatedAt: "" };
    return `${JSON.stringify(withBlankGenAt, null, 2)}\n`;
  } catch {
    return "";
  }
}

function parseManifestSafe(content: string): CaptureManifest | null {
  try {
    const parsed = JSON.parse(content) as Partial<CaptureManifest>;
    if (
      typeof parsed.name === "string" &&
      typeof parsed.sourceUrl === "string" &&
      Array.isArray(parsed.pages) &&
      Array.isArray(parsed.failures)
    ) {
      return parsed as CaptureManifest;
    }
    return null;
  } catch {
    return null;
  }
}

async function discoverPages(
  seedUrl: string,
  options: CaptureOptions,
  robots?: ReturnType<typeof robotsParser>
): Promise<DiscoveredPage[]> {
  const llmsPages = await discoverLlmsPages(seedUrl, options);
  if (llmsPages.length > 0) return uniquePages(llmsPages);

  if (isMarkdownUrl(seedUrl)) return [{ url: seedUrl, source: "markdown" }];

  // Discover beyond maxPages so the LARGE_CRAWL_THRESHOLD guard can trigger
  const discoveryCap = Math.max(options.maxPages, LARGE_CRAWL_THRESHOLD + 1);
  const sitemapPages = await discoverSitemapPages(seedUrl, discoveryCap, robots);
  if (sitemapPages.length > 0) return uniquePages(sitemapPages);

  return uniquePages(await crawlLinks(seedUrl, { ...options, maxPages: discoveryCap }, robots));
}

async function discoverLlmsPages(seedUrl: string, options: CaptureOptions): Promise<DiscoveredPage[]> {
  const candidates = llmsCandidateUrls(seedUrl);
  const pages: DiscoveredPage[] = [];

  for (const url of candidates) {
    const response = await fetchText(url);
    if (!response.ok || !response.text.trim()) continue;

    if (url.endsWith("/llms-full.txt")) {
      const root = new URL(seedUrl);
      pages.push({ url, source: "llms", title: root.hostname });
      continue;
    }

    const links = extractMarkdownLinks(response.text, url)
      .map((link) => normalizeUrl(link, url))
      .filter((link) => sameScope(link, seedUrl) && !isProbablyNoise(link));
    pages.push(...links.map((link) => ({ url: link, source: "markdown" as const })));
  }

  if (pages.length > 0) return pages;

  const markdownAlternative = await discoverMarkdownAlternative(seedUrl, options);
  return markdownAlternative ? [markdownAlternative] : [];
}

function llmsCandidateUrls(seedUrl: string): string[] {
  const url = new URL(seedUrl);
  const base = `${url.protocol}//${url.host}`;
  const parts = url.pathname.split("/").filter(Boolean);
  const pathBase = parts.length > 0 ? `${base}/${parts[0] ?? ""}` : base;
  return Array.from(new Set([
    `${base}/llms-full.txt`,
    `${pathBase}/llms-full.txt`,
    `${base}/llms.txt`,
    `${pathBase}/llms.txt`
  ]));
}

// P2 #18: Regex handles URLs with one level of nested parentheses (e.g. Wikipedia-style)
function extractMarkdownLinks(text: string, baseUrl: string): string[] {
  const markdownLinks = Array.from(text.matchAll(/\]\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g)).map((match) => match[1] ?? "");
  const rawUrls = Array.from(text.matchAll(/https?:\/\/[^\s)]+/g)).map((match) => match[0] ?? "");
  const plainMarkdown = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\.(mdx?|txt)($|[?#])/.test(line))
    .map((line) => line.replace(/^[-*]\s*/, ""));
  return [...markdownLinks, ...rawUrls, ...plainMarkdown]
    .map((link) => safeUrl(link, baseUrl))
    .filter((link): link is string => Boolean(link));
}

async function discoverMarkdownAlternative(seedUrl: string, options: CaptureOptions): Promise<DiscoveredPage | undefined> {
  const response = await fetchText(seedUrl);
  if (!response.ok) return undefined;
  const doc = htmlToMarkdown(response.text, seedUrl);
  const candidate = doc.markdownLinks.find((link) => sameScope(link, seedUrl));
  if (candidate) return { url: candidate, source: "markdown" };
  if (options.headless && doc.markdown.length < 500) {
    const rendered = await fetchRenderedHtml(seedUrl);
    if (!rendered) return undefined;
    const renderedDoc = htmlToMarkdown(rendered, seedUrl);
    const renderedCandidate = renderedDoc.markdownLinks.find((link) => sameScope(link, seedUrl));
    if (renderedCandidate) return { url: renderedCandidate, source: "markdown" };
  }
  return undefined;
}

async function discoverSitemapPages(
  seedUrl: string,
  maxPages: number,
  robots?: ReturnType<typeof robotsParser>
): Promise<DiscoveredPage[]> {
  const sitemapUrls = await sitemapCandidateUrls(seedUrl);
  // P0 #4: Disable XML entity processing to prevent billion-laughs attacks
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
  const pages: DiscoveredPage[] = [];
  const queue = [...sitemapUrls];
  const seen = new Set<string>();

  while (queue.length > 0 && pages.length < maxPages) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl) continue;
    if (seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);
    if (robots && !robots.isAllowed(sitemapUrl, DEFAULT_USER_AGENT)) continue;

    // SSRF guard for sitemap URLs
    try {
      assertSafeUrl(sitemapUrl);
    } catch {
      continue;
    }

    const response = await fetchText(sitemapUrl);
    if (!response.ok || !response.text.includes("<")) continue;
    const parsed = parser.parse(response.text);
    const { urls, sitemaps } = extractSitemapLocs(parsed);
    if (pages.length < maxPages) queue.push(...sitemaps);
    for (const url of urls) {
      if (pages.length >= maxPages) break;
      const normalized = normalizeUrl(url);
      if (sameScope(normalized, seedUrl) && !isProbablyNoise(normalized)) {
        pages.push({ url: normalized, source: isMarkdownUrl(normalized) ? "markdown" : "sitemap" });
      }
    }
  }

  return pages;
}

async function sitemapCandidateUrls(seedUrl: string): Promise<string[]> {
  const url = new URL(seedUrl);
  const base = `${url.protocol}//${url.host}`;
  const candidates = [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`];
  const robots = await fetchText(`${base}/robots.txt`);
  if (robots.ok) {
    for (const match of robots.text.matchAll(/^sitemap:\s*(.+)$/gim)) {
      const sitemapUrl = match[1]?.trim();
      if (sitemapUrl) candidates.push(sitemapUrl);
    }
  }
  return Array.from(new Set(candidates));
}

function extractSitemapLocs(parsed: unknown): { urls: string[]; sitemaps: string[] } {
  if (!parsed || typeof parsed !== "object") return { urls: [], sitemaps: [] };
  const value = parsed as Record<string, unknown>;
  const urls: string[] = [];
  const sitemaps: string[] = [];
  const urlSet = value["urlset"] as { url?: unknown } | undefined;
  const sitemapIndex = value["sitemapindex"] as { sitemap?: unknown } | undefined;

  const collectLoc = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    const loc = (entry as Record<string, unknown>)["loc"];
    if (typeof loc === "string") urls.push(loc);
  };

  const urlEntries = Array.isArray(urlSet?.url) ? urlSet?.url : urlSet?.url ? [urlSet.url] : [];
  urlEntries.forEach(collectLoc);

  const collectSitemap = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    const loc = (entry as Record<string, unknown>)["loc"];
    if (typeof loc === "string") sitemaps.push(loc);
  };

  const sitemapEntries = Array.isArray(sitemapIndex?.sitemap) ? sitemapIndex?.sitemap : sitemapIndex?.sitemap ? [sitemapIndex.sitemap] : [];
  sitemapEntries.forEach(collectSitemap);
  return { urls, sitemaps };
}

async function crawlLinks(
  seedUrl: string,
  options: CaptureOptions,
  robots?: ReturnType<typeof robotsParser>
): Promise<DiscoveredPage[]> {
  const queue = [seedUrl];
  const seen = new Set<string>();
  const pages: DiscoveredPage[] = [];

  while (queue.length > 0 && pages.length < options.maxPages) {
    const current = queue.shift();
    if (!current || seen.has(current) || isProbablyNoise(current)) continue;
    seen.add(current);
    if (robots && !robots.isAllowed(current, DEFAULT_USER_AGENT)) continue;

    // SSRF guard in crawl
    try {
      assertSafeUrl(current);
    } catch {
      continue;
    }

    const response = await fetchText(current);
    if (!response.ok) continue;
    pages.push({ url: current, source: isMarkdownUrl(current) ? "markdown" : "crawl" });

    if (isMarkdownUrl(current)) continue;
    const $ = cheerio.load(response.text);
    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;
      const next = safeUrl(href, current);
      if (!next || seen.has(next) || isProbablyNoise(next) || !sameScope(next, seedUrl)) return;
      queue.push(next);
    });
    if (options.rateLimitMs > 0) await sleep(options.rateLimitMs);
  }

  return pages;
}

async function capturePage(
  rootDir: string,
  page: DiscoveredPage,
  seedUrl: string,
  options: CaptureOptions,
  getBrowser: () => Promise<Browser | undefined>
): Promise<CapturedPage> {
  // SSRF guard per page
  assertSafeUrl(page.url);

  const response = await fetchText(page.url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const isMarkdown = isMarkdownUrl(page.url) || page.url.endsWith("/llms-full.txt") || contentTypeIsMarkdown(response.contentType);
  let doc = isMarkdown ? normalizeMarkdown(response.text, page.url) : htmlToMarkdown(response.text, page.url);

  if (!isMarkdown && options.headless && doc.markdown.replace(/\s+/g, "").length < 500) {
    const rendered = await fetchRenderedHtml(page.url, getBrowser);
    if (rendered) doc = htmlToMarkdown(rendered, page.url);
  }

  const rewritten = rewriteInternalLinks(doc.markdown, seedUrl, rootDir);
  const outputPath = page.url.endsWith("/llms-full.txt")
    ? path.join(rootDir, "index.md")
    : outputPathForUrl(rootDir, page.url, isMarkdown ? "markdown" : "html");
  await writeTextIfChanged(outputPath, rewritten);
  return {
    url: page.url,
    source: page.source,
    title: doc.title,
    outputPath: path.relative(rootDir, outputPath) || "index.md",
    hash: sha256(rewritten)
  };
}

// P2 #18: Handles URLs with one level of nested parens
function rewriteInternalLinks(markdown: string, seedUrl: string, rootDir: string): string {
  return markdown.replace(/\]\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g, (match, rawLink: string) => {
    const clean = rawLink.trim();
    if (clean.startsWith("#") || clean.startsWith("mailto:") || clean.startsWith("tel:")) return match;
    const absolute = safeUrl(clean, seedUrl);
    if (!absolute || !sameScope(absolute, seedUrl)) return match;
    const target = path.relative(rootDir, outputPathForUrl(rootDir, absolute, isMarkdownUrl(absolute) ? "markdown" : "html"));
    return match.replace(rawLink, target.split(path.sep).join("/"));
  });
}

async function loadRobots(seedUrl: string): Promise<ReturnType<typeof robotsParser> | undefined> {
  const url = new URL(seedUrl);
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
  // robots.txt is always on the same host as the seed — no SSRF risk, but guard for consistency
  try {
    assertSafeUrl(robotsUrl);
  } catch {
    return undefined;
  }
  const response = await fetchText(robotsUrl);
  if (!response.ok) return undefined;
  return robotsParser(robotsUrl, response.text);
}

type FetchTextResult = { ok: boolean; status: number; text: string; contentType: string };

// P0 #2: Timeout + manual redirect cap + size cap via streaming
async function fetchText(url: string): Promise<FetchTextResult> {
  // SSRF guard — reject non-http(s) and private/loopback IPs
  try {
    assertSafeUrl(url);
  } catch {
    return { ok: false, status: 0, text: "", contentType: "" };
  }

  let hopsLeft = MAX_REDIRECTS;
  let currentUrl = url;

  while (hopsLeft > 0) {
    hopsLeft--;
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        headers: { "user-agent": DEFAULT_USER_AGENT },
        redirect: "manual",
        signal
      });
    } catch {
      return { ok: false, status: 0, text: "", contentType: "" };
    }

    // Manual redirect following with SSRF re-validation on Location header
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, status: response.status, text: "", contentType: "" };
      const resolved = safeAbsoluteUrl(location, currentUrl);
      if (!resolved) return { ok: false, status: response.status, text: "", contentType: "" };
      try {
        assertSafeUrl(resolved);
      } catch {
        return { ok: false, status: 0, text: "", contentType: "" };
      }
      currentUrl = resolved;
      continue;
    }

    // Stream body with size cap
    const text = await readBodyWithSizeCap(response, MAX_BODY_BYTES);
    if (text === null) return { ok: false, status: 0, text: "", contentType: "" };

    return {
      ok: response.ok,
      status: response.status,
      text,
      contentType: response.headers.get("content-type") ?? ""
    };
  }

  return { ok: false, status: 0, text: "", contentType: "" };
}

async function readBodyWithSizeCap(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) {
    const text = await response.text().catch(() => null);
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    return null;
  }
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

// P1 #8: fetchRenderedHtml receives browser from the captureDocs singleton
async function fetchRenderedHtml(
  url: string,
  getBrowser?: () => Promise<Browser | undefined>
): Promise<string | undefined> {
  try {
    assertSafeUrl(url);
  } catch {
    return undefined;
  }
  try {
    let browser: Browser | undefined;
    if (getBrowser) {
      browser = await getBrowser();
    } else {
      const playwright = await import("playwright");
      browser = await playwright.chromium.launch({ headless: true });
    }
    if (!browser) return undefined;
    const page = await browser.newPage({ userAgent: DEFAULT_USER_AGENT });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    return await page.content();
  } catch {
    return undefined;
  }
}

function contentTypeIsMarkdown(contentType: string): boolean {
  return /text\/markdown|text\/x-markdown|mdx/.test(contentType);
}

function safeUrl(rawUrl: string, base: string): string | undefined {
  try {
    return normalizeUrl(rawUrl, base);
  } catch {
    return undefined;
  }
}

function safeAbsoluteUrl(rawUrl: string, base: string): string | undefined {
  try {
    return new URL(rawUrl, base).toString();
  } catch {
    return undefined;
  }
}

function uniquePages(pages: DiscoveredPage[]): DiscoveredPage[] {
  const seen = new Set<string>();
  const unique: DiscoveredPage[] = [];
  for (const page of pages) {
    if (seen.has(page.url)) continue;
    seen.add(page.url);
    unique.push(page);
  }
  return unique;
}

function buildIndex(name: string, sourceUrl: string, pages: CapturedPage[], failures: CaptureFailure[]): string {
  const pageLines = pages
    .sort((a, b) => a.outputPath.localeCompare(b.outputPath))
    .map((page) => `- [${page.title || page.url}](${page.outputPath.split(path.sep).join("/")})`);
  const failureLines = failures.map((failure) => `- ${failure.url}: ${failure.reason}`);
  return [
    `# ${name}`,
    "",
    `Source: ${sourceUrl}`,
    "",
    "## Pages",
    "",
    pageLines.join("\n") || "- No pages captured.",
    "",
    "## Failures",
    "",
    failureLines.join("\n") || "- None.",
    ""
  ].join("\n");
}
