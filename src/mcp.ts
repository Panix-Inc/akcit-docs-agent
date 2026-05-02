import { createRequire } from "node:module";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { captureDocs } from "./capture.js";

const require_ = createRequire(import.meta.url);
const pkg = require_("../package.json") as { version: string };

// ---------------------------------------------------------------------------
// Input schema (Zod)
// ---------------------------------------------------------------------------

const captureToolSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).optional(),
  outputDir: z.string().min(1).default("docs"),
  maxPages: z.number().int().positive().max(5000).default(500),
  force: z.boolean().default(false),
  forceLargeCrawl: z.boolean().default(false),
  headless: z.boolean().default(true),
  respectRobots: z.boolean().default(true),
  rateLimitMs: z.number().int().min(0).default(750),
  concurrency: z.number().int().positive().max(20).default(2),
  maxRetries: z.number().int().min(0).max(20).default(5),
  jitter: z.boolean().default(true),
  skill: z.boolean().default(true)
});

type CaptureToolInput = z.infer<typeof captureToolSchema>;

// JSON Schema representation exposed via ListTools — kept in sync with Zod above.
const captureToolInputSchema = {
  type: "object" as const,
  properties: {
    url: {
      type: "string",
      format: "uri",
      description: "Documentation URL to capture."
    },
    name: {
      type: "string",
      minLength: 1,
      description: "Technology/folder name. Inferred from URL when omitted."
    },
    outputDir: {
      type: "string",
      minLength: 1,
      description: "Parent output directory for docs/<technology>.",
      default: "docs"
    },
    maxPages: {
      type: "number",
      description: "Maximum pages to capture (1–5000).",
      default: 500
    },
    force: {
      type: "boolean",
      description: "Overwrite managed generated files.",
      default: false
    },
    forceLargeCrawl: {
      type: "boolean",
      description: "Allow captures exceeding the large-crawl threshold (500 pages).",
      default: false
    },
    headless: {
      type: "boolean",
      description: "Allow Playwright headless fallback for SPA documentation sites.",
      default: true
    },
    respectRobots: {
      type: "boolean",
      description: "Honour robots.txt crawl rules.",
      default: true
    },
    rateLimitMs: {
      type: "number",
      description: "Minimum milliseconds between outgoing requests.",
      default: 750
    },
    concurrency: {
      type: "number",
      description: "Parallel requests in flight (1–20).",
      default: 2
    },
    maxRetries: {
      type: "number",
      description: "Retries on 429/5xx with backoff (0–20).",
      default: 5
    },
    jitter: {
      type: "boolean",
      description: "Apply random jitter to rate-limit spacing.",
      default: true
    },
    skill: {
      type: "boolean",
      description: "Generate the co-located docs/<technology>/SKILL.md. MCP does not install project- or HOME-scoped skills.",
      default: true
    }
  },
  required: ["url"]
};

// ---------------------------------------------------------------------------
// Pure handler — exported so tests can invoke it directly without stdio.
// ---------------------------------------------------------------------------

export interface CallToolResult {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
}

export async function handleCaptureTool(args: unknown): Promise<CallToolResult> {
  const parsed = captureToolSchema.safeParse(args);

  if (!parsed.success) {
    const message = parsed.error.errors
      .map((e) => `${e.path.join(".") || "root"}: ${e.message}`)
      .join("; ");
    return {
      isError: true,
      content: [{ type: "text", text: `Invalid arguments: ${message}` }]
    };
  }

  const options: CaptureToolInput = parsed.data;

  try {
    const { name, ...rest } = options;
    const result = await captureDocs(name === undefined ? rest : { ...rest, name });

    // M3: emit relative paths so the MCP response doesn't leak absolute server paths
    const rel = (p: string): string => {
      try {
        return path.relative(process.cwd(), p) || p;
      } catch {
        return p;
      }
    };
    return {
      content: [
        {
          type: "text",
          text: [
            `Captured docs for ${result.name}`,
            `Output: ${rel(result.rootDir)}`,
            `Manifest: ${rel(result.manifestPath)}`,
            `Pages: ${result.pages.length}`,
            `Failures: ${result.failures.length}`
          ].join("\n")
        }
      ]
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: "text", text: `Capture failed: ${message}` }]
    };
  }
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

export async function runMcpServer(): Promise<void> {
  const server = new Server(
    { name: "docs-agent", version: pkg.version },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "capture_docs",
        description:
          "Capture a documentation website into docs/<technology> as organized Markdown.",
        inputSchema: captureToolInputSchema
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "capture_docs") {
      return {
        isError: true,
        content: [
          { type: "text", text: `Unknown tool: ${request.params.name}` }
        ]
      };
    }

    const result = await handleCaptureTool(request.params.arguments);
    return result as unknown as Awaited<ReturnType<Parameters<typeof server.setRequestHandler>[1]>>;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
