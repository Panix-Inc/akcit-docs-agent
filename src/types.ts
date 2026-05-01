export type SourceKind = "llms" | "markdown" | "sitemap" | "crawl";

export type ProgressEvent =
  | { phase: "discover-start"; seedUrl: string }
  | { phase: "discover-end"; total: number }
  | { phase: "page-start"; url: string; index: number; total: number }
  | { phase: "page-success"; url: string; index: number; total: number; outputPath: string }
  | { phase: "page-fail"; url: string; index: number; total: number; reason: string }
  | { phase: "page-retry"; url: string; attempt: number; delayMs: number; reason: string }
  | { phase: "page-skipped-resume"; url: string; index: number; total: number }
  | { phase: "throttle-adapt"; newRateLimitMs: number };

export type ProgressCallback = (event: ProgressEvent) => void;

export interface CaptureOptions {
  url: string;
  name?: string;
  outputDir?: string;
  maxPages: number;
  force: boolean;
  forceLargeCrawl: boolean;
  headless: boolean;
  respectRobots: boolean;
  rateLimitMs: number;
  concurrency?: number;
  verbose?: boolean;
  maxRetries?: number;
  jitter?: boolean;
  onProgress?: ProgressCallback;
  skill?: boolean; // generate SKILL.md alongside docs (default true)
}

export interface DiscoveredPage {
  url: string;
  source: SourceKind;
  title?: string;
}

export interface CapturedPage {
  url: string;
  source: SourceKind;
  title: string;
  outputPath: string;
  hash: string;
}

export interface CaptureFailure {
  url: string;
  reason: string;
}

export interface CaptureManifest {
  name: string;
  sourceUrl: string;
  generatedAt: string;
  sourceKinds: SourceKind[];
  pages: CapturedPage[];
  failures: CaptureFailure[];
}

export interface CaptureResult {
  name: string;
  rootDir: string;
  manifestPath: string;
  pages: CapturedPage[];
  failures: CaptureFailure[];
}
