export type SourceKind = "llms" | "markdown" | "sitemap" | "crawl";

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
