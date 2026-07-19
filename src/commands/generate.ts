/** Generate bookmark .md files from pipeline.db */
import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { closePipelineDb, getPipelineDb } from "../utils/db.ts";
import { parseDate } from "../utils/datetime.ts";

interface BookmarkData {
  tweet_id: string;
  url: string;
  text: string;
  display_text: string;
  author_handle: string;
  author_name: string;
  posted_at: string;
  primary_type: string;
  primary_domain: string;
  types: string[];
  domains: string[];
  confidence: number | null;
  content_type: string;
  media_count: number;
}

const slugify = (text: string, maxLen = 60): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);

const safeJsonArr = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

/** Pure template -- no I/O, no DB, no network. String interpolation only. */
type BookmarkTemplate = (data: BookmarkData) => string;

const bookmarkTemplate: BookmarkTemplate = (b) => {
  const { parts } = parseDate(b.posted_at);
  const { year, month, day } = parts;
  const dateUnderscore = `${year}_${month}_${day}`;

  /* Derive a display title from the first line of content.
   * Strip any leading markdown heading markers so we don't get double `#` in the template
   */
  const firstLine = (b.display_text.split("\n")[0] ?? "")
    .replace(/^#+\s*/, "")
    .trim()
    .slice(0, 120);

  // Build cross-reference lists
  const typeLinks = b.types.map((t) => `[[categories/${t}]]`);
  const domainLinks = b.domains.map((d) => `[[domains/${d}]]`);

  return [
    "---",
    `tweet_id: "${b.tweet_id}"`,
    `url: "${b.url}"`,
    `author: "@${b.author_handle}"`,
    `author_name: "${b.author_name}"`,
    `posted_at: "${dateUnderscore}-${day}"`,
    `type: "${b.primary_type || "unclassified"}"`,
    `domain: "${b.primary_domain || "uncategorized"}"`,
    `content_type: "${b.content_type || "unknown"}"`,
    ...(b.confidence !== null ? [`confidence: ${b.confidence}`] : []),
    ...(b.media_count > 0 ? [`media_count: ${b.media_count}`] : []),
    "---",
    "",
    `# ${firstLine || "@" + b.author_handle}`,
    "",
    b.display_text,
    "",
    "## Metadata",
    `- **Author:** [[entities/${b.author_handle}]]`,
    `- **Category:** [[categories/${b.primary_type || "unclassified"}]]`,
    `- **Domain:** [[domains/${b.primary_domain || "uncategorized"}]]`,
    `- **Posted:** ${year}-${month}-${day}`,
    `- **Original:** [View on X](${b.url})`,
    typeLinks.length > 1 ? `- **All types:** ${typeLinks.join(", ")}` : "",
    domainLinks.length > 1 ? `- **All domains:** ${domainLinks.join(", ")}` : "",
    "",
    // Related section -- cross-links to other things in the same space
    "## See Also",
    `- [[categories/${b.primary_type || "unclassified"}]] — more "${b.primary_type}" bookmarks`,
    `- [[entities/${b.author_handle}]] — more by @${b.author_handle}`,
    `- [[domains/${b.primary_domain || "uncategorized"}]] — more in "${b.primary_domain}"`,
    "",
  ]
    .filter((l) => l !== "") // remove empty lines from conditional additions
    .join("\n");
};

const buildFilename = (b: BookmarkData): string => {
  const { parts } = parseDate(b.posted_at);
  const { year, month, day } = parts;
  const slug = slugify(b.display_text.slice(0, 80));
  return `${year}_${month}_${day}-${day}-${b.author_handle}-${slug}.md`;
};

const fetchAllBookmarks = (): BookmarkData[] => {
  const db = getPipelineDb();
  const rows = db
    .prepare(`
    SELECT
      tweet_id,
      url,
      text,
      author_handle,
      author_name,
      posted_at,
      COALESCE(clippings_text, text) AS display_text,
      COALESCE(primary_type, 'unclassified') AS primary_type,
      COALESCE(primary_domain, 'uncategorized') AS primary_domain,
      types  AS types_raw,
      domains AS domains_raw,
      confidence,
      COALESCE(content_type, 'unknown') AS content_type,
      media_count
    FROM bookmarks
    ORDER BY posted_at DESC
  `)
    .all<Record<string, unknown>>();

  return rows.map((r) => ({
    tweet_id: r.tweet_id as string,
    url: r.url as string,
    text: r.text as string,
    display_text: r.display_text as string,
    author_handle: r.author_handle as string,
    author_name: r.author_name as string,
    posted_at: r.posted_at as string,
    primary_type: r.primary_type as string,
    primary_domain: r.primary_domain as string,
    types: safeJsonArr(r.types_raw as string | null),
    domains: safeJsonArr(r.domains_raw as string | null),
    confidence: r.confidence as number | null,
    content_type: r.content_type as string,
    media_count: r.media_count as number,
  }));
};

const BATCH_SIZE = 50;

interface FileToWrite {
  filename: string;
  content: string;
}

const writeBatch = async (
  files: FileToWrite[],
  dir: string,
): Promise<number> => {
  // Split into chunks and flatten all writes functionally
  const chunks = Array.from(
    { length: Math.ceil(files.length / BATCH_SIZE) },
    (_, i) => {
      const start = i * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, files.length);
      const chunk = files.slice(start, end);
      const writes = chunk.map((f) => Deno.writeTextFile(`${dir}/${f.filename}`, f.content));
      return writes;
    },
  );
  await Promise.all(chunks.flat());
  return files.length;
};

const scanExistingFilenames = async (dir: string): Promise<Set<string>> => {
  try {
    const entries = await Array.fromAsync(Deno.readDir(dir)).then((entries) =>
      entries.filter((e) => e.isFile && e.name.endsWith(".md"))
    );
    return new Set(entries.map((e) => e.name));
  } catch {
    // Directory doesn't exist yet -- nothing to skip
    return new Set();
  }
};

export const runGenerate = async (): Promise<void> => {
  logger.info(
    "generate started -- reading classified bookmarks from pipeline.db",
  );

  const bookmarks = fetchAllBookmarks();
  logger.info("fetched bookmarks for rendering", { count: bookmarks.length });

  if (bookmarks.length === 0) {
    logger.warn("no bookmarks in pipeline.db -- nothing to generate");
    closePipelineDb();
    return;
  }

  const outDir = `${CONFIG.mdOutputDir}/bookmarks`;
  await Deno.mkdir(outDir, { recursive: true });

  // Phase 0: Scan existing files to skip unchanged ones
  logger.info("scanning existing bookmark files on disk");
  const existingFiles = await scanExistingFilenames(outDir);
  logger.info("existing bookmark files on disk", { count: existingFiles.size });

  // Build filenames for all bookmarks and filter to only missing ones
  const allFiles: FileToWrite[] = bookmarks.map((b) => ({
    filename: buildFilename(b),
    content: bookmarkTemplate(b), // template closure -- pure, no I/O
  }));

  const toWrite = allFiles.filter((f) => !existingFiles.has(f.filename));
  const skipped = allFiles.length - toWrite.length;

  if (skipped > 0) {
    logger.info("skipped existing files", {
      skipped,
      reason: "already on disk",
    });
  }

  if (toWrite.length === 0) {
    logger.info("all bookmark files already up to date -- nothing to write");
    closePipelineDb();
    return;
  }

  // Phase 2: Batch-write only the missing files to disk
  logger.info("writing new rendered files", {
    count: toWrite.length,
    batchSize: BATCH_SIZE,
  });
  const written = await writeBatch(toWrite, outDir);

  closePipelineDb();
  logger.info("generate complete", { written, total: bookmarks.length });

  // Brief summary so the user knows what happened
  const types = new Set(bookmarks.map((b) => b.primary_type));
  const domains = new Set(bookmarks.map((b) => b.primary_domain));
  logger.info("generate summary", {
    files_written: written,
    unique_types: types.size,
    unique_domains: domains.size,
    authors: new Set(bookmarks.map((b) => b.author_handle)).size,
  });
};
