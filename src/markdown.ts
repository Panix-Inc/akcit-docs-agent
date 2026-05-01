import * as cheerio from "cheerio";
import TurndownService from "turndown";

export interface MarkdownDocument {
  title: string;
  markdown: string;
  links: string[];
  markdownLinks: string[];
}

const markdownLinkText = /view as markdown|raw|markdown|copy markdown/i;

function buildFrontmatter(title: string, sourceUrl: string, capturedAt: string): string {
  const safeTitle = title.replace(/"/g, "'");
  return `---\ntitle: "${safeTitle}"\nsource: ${sourceUrl}\ncaptured_at: ${capturedAt}\n---\n\n`;
}

function stripExistingFrontmatter(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function titleFromUrl(sourceUrl: string): string {
  try {
    const parts = new URL(sourceUrl).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "Documentation";
  } catch {
    return "Documentation";
  }
}

export function normalizeMarkdown(
  input: string,
  sourceUrl: string,
  capturedAt?: string
): MarkdownDocument {
  const ts = capturedAt ?? new Date().toISOString();
  const withoutFrontmatter = stripExistingFrontmatter(input);
  const titleMatch = withoutFrontmatter.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? titleFromUrl(sourceUrl);
  const bodyMarkdown = withoutFrontmatter.trimEnd() + "\n";
  const links = Array.from(bodyMarkdown.matchAll(/\]\(([^)]+)\)/g))
    .map((match) => match[1])
    .filter(Boolean) as string[];
  const markdown = buildFrontmatter(title, sourceUrl, ts) + bodyMarkdown;
  return {
    title,
    markdown,
    links,
    markdownLinks: links.filter((link) => /\.(mdx?|MDX?)($|[?#])/.test(link))
  };
}

export function htmlToMarkdown(
  html: string,
  sourceUrl: string,
  capturedAt?: string
): MarkdownDocument {
  const ts = capturedAt ?? new Date().toISOString();
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, canvas, iframe, nav, footer, aside").remove();
  $("body > header, .site-header, [role='banner']").remove();
  $("[aria-hidden='true']").remove();

  const title =
    cleanText($("title").first().text()) ||
    cleanText($("h1").first().text()) ||
    "Documentation";

  const markdownLinks: string[] = [];
  const links: string[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const absolute = safeAbsoluteUrl(href, sourceUrl);
    if (!absolute) return;
    links.push(absolute);
    const text = cleanText($(element).text());
    if (
      markdownLinkText.test(text) ||
      /\.(mdx?|MDX?)($|[?#])/.test(new URL(absolute).pathname)
    ) {
      markdownLinks.push(absolute);
    }
  });

  const article = $("article").first();
  const main = $("main").first();
  const rolMain = $("[role='main']").first();
  const contentId = $("#content").first();
  const mainContent = $("#main-content").first();

  const content =
    (article.length ? article.html() : null) ??
    (main.length ? main.html() : null) ??
    (rolMain.length ? rolMain.html() : null) ??
    (contentId.length ? contentId.html() : null) ??
    (mainContent.length ? mainContent.html() : null) ??
    $("body").html() ??
    "";

  const turndown = new TurndownService({
    codeBlockStyle: "fenced",
    headingStyle: "atx",
    bulletListMarker: "-"
  });

  turndown.addRule("fencedCodeBlocks", {
    filter: ["pre"],
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const code = element.querySelector("code");
      const className = code?.getAttribute("class") ?? "";
      const lang = className.match(/language-([a-zA-Z0-9_-]+)/)?.[1] ?? "";
      const text = code?.textContent ?? element.textContent ?? "";
      return `\n\n\`\`\`${lang}\n${text.replace(/\n+$/, "")}\n\`\`\`\n\n`;
    }
  });

  turndown.addRule("safeLink", {
    filter: (node) => {
      if (node.nodeName !== "A") return false;
      const href = ((node as HTMLElement).getAttribute("href") ?? "").trim().toLowerCase();
      if (href.length === 0) return false;
      // Allow safe schemes — only strip dangerous ones (javascript:, data:, vbscript:, file:, etc.)
      const safe =
        href.startsWith("http:") ||
        href.startsWith("https:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        href.startsWith("/");
      return !safe;
    },
    replacement: (content) => content
  });

  turndown.addRule("tableRow", {
    filter: ["table"],
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const rows = Array.from(element.querySelectorAll("tr"));
      if (rows.length === 0) return "";
      const toRow = (tr: Element): string => {
        const cells = Array.from(tr.querySelectorAll("th, td"))
          .map((cell) => (cell.textContent ?? "").replace(/\n/g, " ").trim());
        return `| ${cells.join(" | ")} |`;
      };
      const header = rows[0] ? toRow(rows[0]) : "";
      const separator = header
        .split("|")
        .filter((_, i, arr) => i > 0 && i < arr.length - 1)
        .map(() => " --- ")
        .join("|");
      const body = rows.slice(1).map(toRow);
      const parts = [`\n\n${header}`, `|${separator}|`, ...body, "\n\n"];
      return parts.join("\n");
    }
  });

  let bodyMarkdown = turndown.turndown(content);
  bodyMarkdown = `# ${title}\n\n${bodyMarkdown.replace(/^#\s+.+\n+/, "").trim()}\n`;
  const markdown = buildFrontmatter(title, sourceUrl, ts) + bodyMarkdown;
  return { title, markdown, links: unique(links), markdownLinks: unique(markdownLinks) };
}

function cleanText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function safeAbsoluteUrl(href: string, sourceUrl: string): string | undefined {
  try {
    const url = new URL(href, sourceUrl);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
