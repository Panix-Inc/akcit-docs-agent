import type { ProgressEvent } from "./types.js";

export interface RendererOptions {
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  noProgress: boolean;
  // Injectable for testing
  stream?: NodeJS.WriteStream;
  isTTY?: boolean;
  now?: () => number;
}

export interface ProgressRenderer {
  handle(event: ProgressEvent): void;
  finish(): void;
}

const BAR_WIDTH = 24;

export function createProgressRenderer(opts: RendererOptions): ProgressRenderer {
  const stream = opts.stream ?? process.stderr;
  const isTTY = opts.isTTY ?? Boolean(stream.isTTY);
  const now = opts.now ?? Date.now;

  // Silent modes: machine output or explicit suppression.
  if (opts.json || opts.quiet) return silentRenderer();

  // Non-TTY (pipes, CI) auto-falls-back to verbose line logs.
  // Explicit --no-progress or --verbose also use line mode.
  const useBar = isTTY && !opts.verbose && !opts.noProgress;

  return useBar ? barRenderer(stream, now) : lineRenderer(stream);
}

function silentRenderer(): ProgressRenderer {
  return { handle: () => undefined, finish: () => undefined };
}

function lineRenderer(stream: NodeJS.WriteStream): ProgressRenderer {
  const write = (msg: string): void => {
    stream.write(msg + "\n");
  };

  return {
    handle(event) {
      switch (event.phase) {
        case "discover-start":
          write(`> discovering pages from ${event.seedUrl}`);
          break;
        case "discover-end":
          write(`> discovered ${event.total} pages to capture`);
          break;
        case "page-start":
          write(`[${event.index}/${event.total}] fetching ${event.url}`);
          break;
        case "page-success":
          write(`  ok    -> ${event.outputPath}`);
          break;
        case "page-fail":
          write(`  FAIL  ${event.url} (${event.reason})`);
          break;
        case "page-retry":
          write(`  retry attempt ${event.attempt} for ${event.url} after ${event.delayMs}ms (${event.reason})`);
          break;
        case "page-skipped-resume":
          write(`  skip  ${event.url} (already in manifest)`);
          break;
        case "throttle-adapt":
          write(`> adaptive throttle: rate-limit raised to ${event.newRateLimitMs}ms after 429 detected`);
          break;
      }
    },
    finish: () => undefined
  };
}

function barRenderer(stream: NodeJS.WriteStream, now: () => number): ProgressRenderer {
  const start = now();
  let current = 0;
  let total = 0;
  let lastUrl = "";
  let phase: "discovering" | "capturing" = "discovering";
  let lastRender = 0;

  const render = (force = false): void => {
    const t = now();
    if (!force && t - lastRender < 100) return; // throttle paints
    lastRender = t;

    if (phase === "discovering") {
      stream.write(`\x1b[2K\r⏳ discovering pages...`);
      return;
    }

    const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    const filled = total > 0 ? Math.round((current / total) * BAR_WIDTH) : 0;
    const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);

    const elapsed = (t - start) / 1000;
    const rate = current > 0 ? current / elapsed : 0;
    const remaining = total > current && rate > 0 ? (total - current) / rate : 0;
    const eta = formatDuration(remaining);

    const tail = truncate(lastUrl, 40);
    const line = `[${bar}] ${current}/${total} (${pct}%) eta ${eta} • ${tail}`;
    stream.write(`\x1b[2K\r${line}`);
  };

  return {
    handle(event) {
      switch (event.phase) {
        case "discover-start":
          phase = "discovering";
          render(true);
          break;
        case "discover-end":
          phase = "capturing";
          total = event.total;
          render(true);
          break;
        case "page-start":
          lastUrl = stripOrigin(event.url);
          render();
          break;
        case "page-success":
        case "page-fail":
          current = event.index;
          render();
          break;
        case "page-skipped-resume":
          current++;
          total = event.total;
          render();
          break;
        case "page-retry":
          stream.write(`\x1b[2K\r⚠ retry ${event.url} in ${event.delayMs}ms (${event.reason})\n`);
          render(true);
          break;
        case "throttle-adapt":
          stream.write(`\x1b[2K\r⚠ adaptive throttle engaged: rate-limit -> ${event.newRateLimitMs}ms\n`);
          render(true);
          break;
      }
    },
    finish() {
      render(true);
      stream.write("\n");
    }
  };
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return "…" + s.slice(s.length - max + 1);
}

function stripOrigin(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
