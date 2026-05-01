import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80) || "docs";
}

export function inferTechName(rawUrl: string, explicit?: string): string {
  if (explicit?.trim()) return slugify(explicit);
  const url = new URL(rawUrl);
  const hostParts = url.hostname.replace(/^www\./, "").split(".");
  const hostName = hostParts.length > 1 && hostParts[0] ? hostParts[0] : url.hostname;
  const firstPath = url.pathname.split("/").filter(Boolean)[0];
  const candidate = firstPath && !["docs", "documentation", "learn", "reference", "guide", "guides"].includes(firstPath)
    ? firstPath
    : hostName;
  return slugify(candidate);
}

export function normalizeUrl(rawUrl: string, base?: string): string {
  const url = new URL(rawUrl, base);
  url.hash = "";
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function sameScope(candidate: string, seed: string): boolean {
  const c = new URL(candidate);
  const s = new URL(seed);
  if (c.hostname !== s.hostname) return false;
  const seedParts = s.pathname.split("/").filter(Boolean);
  if (seedParts.length === 0) return true;
  const first = seedParts[0];
  if (first && ["docs", "documentation", "learn", "guide", "guides"].includes(first)) {
    return c.pathname === `/${first}` || c.pathname.startsWith(`/${first}/`);
  }
  return true;
}

export function isProbablyNoise(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  const pathName = url.pathname.toLowerCase();
  return [
    "/blog",
    "/pricing",
    "/login",
    "/signin",
    "/signup",
    "/auth",
    "/careers",
    "/about",
    "/contact",
    "/changelog"
  ].some((part) => pathName === part || pathName.startsWith(`${part}/`));
}

export function isMarkdownUrl(rawUrl: string): boolean {
  const pathName = new URL(rawUrl).pathname.toLowerCase();
  return pathName.endsWith(".md") || pathName.endsWith(".mdx");
}

export function outputPathForUrl(rootDir: string, rawUrl: string, source: "markdown" | "html"): string {
  const url = new URL(rawUrl);
  const queryHash = url.search.length > 1 ? sha256(url.search.slice(1)).slice(0, 6) : "";
  const parts = url.pathname.split("/").filter(Boolean).map(slugify).filter(Boolean);
  let fileName = parts.pop() || "index";
  if (source === "markdown") fileName = fileName.replace(/-(md|mdx)$/i, "");
  const suffix = queryHash ? `-${queryHash}` : "";
  const result = fileName === "index" && parts.length === 0
    ? path.join(rootDir, `index${suffix}.md`)
    : path.join(rootDir, ...parts, `${fileName}${suffix}.md`);

  // L2: defense-in-depth — assert the produced path stays inside rootDir.
  // slugify already neutralizes traversal, but a future regression must fail loudly.
  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(result);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`outputPathForUrl: refused to escape rootDir (${resolved})`);
  }
  return result;
}

export async function writeTextIfChanged(filePath: string, content: string): Promise<boolean> {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    const current = await readFile(filePath, "utf8");
    if (current === content) return false;
  } catch {
    // Missing files are expected on first capture.
  }
  await writeFile(filePath, content, "utf8");
  return true;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
