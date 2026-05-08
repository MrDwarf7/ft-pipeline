// commands/extract.ts -- Extract articles via xtracticle + link to DB

import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { closePipelineDb, getPipelineDb } from "../utils/db.ts";
import type { Database } from "../utils/db.ts";

interface ExtractOptions {
  dryRun?: boolean;
  limit?: number;
  skipExisting?: boolean;
}

interface XtracticleMedia {
  id: string;
  url: string;
  type: string;
  thumbnail_url?: string;
  duration?: number;
  formats?: Array<{ url: string; bitrate?: number }>;
}

interface XtracticleResponse {
  tweets: Array<{
    id: string;
    url: string;
    text: string;
    author: { screen_name: string; name: string };
    created_at: string;
    likes?: number;
    bookmarks?: number;
    views?: number;
    media?:
      | XtracticleMedia[]
      | {
        all?: XtracticleMedia[];
        photos?: XtracticleMedia[];
        mosaic?: Record<string, unknown>;
      }
      | null;
    article?: Record<string, unknown> | null;
  }>;
}

interface Row {
  tweet_id: string;
  url: string;
  text: string;
  author_handle: string;
  links_json: string;
  media_count: number;
}

type ExtractResult = "extracted" | "skipped" | "failed";

/** Normalize xtracticle media (could be array or {all, photos, mosaic} object) */
const normalizeMedia = (
  media: XtracticleResponse["tweets"][0]["media"],
): XtracticleMedia[] => {
  if (!media) return [];
  if (Array.isArray(media)) return media;
  if (Array.isArray(media.all)) return media.all;
  if (Array.isArray(media.photos)) return media.photos;
  return [];
};

/** Build rev-iso filename: YYYY_MM_DD-Dow-@handle-slug-title.md */
const buildFilename = (tweet: XtracticleResponse["tweets"][0]): string => {
  const dateInfo = parseDate(tweet.created_at);
  const handle = `@${tweet.author.screen_name}`;
  const titleSlug = slug(tweet.text.slice(0, 50)) || tweet.id;

  if (dateInfo) {
    return `${dateInfo.year}_${dateInfo.month}_${dateInfo.day}-${dateInfo.dow}-${handle}-${titleSlug}.md`;
  }
  return `undated-${handle}-${titleSlug}.md`;
};

/** Parse Twitter date string (e.g. "Fri Aug 28 11:05:56 +0000 2020") or ISO date */
const parseDate = (
  dateStr: string,
): { year: string; month: string; day: string; dow: string } | null => {
  if (!dateStr) return null;

  // ISO format: "2024-07-17" or "2024-07-17T..."
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(5, 7);
    const day = dateStr.slice(8, 10);
    const dowNum = new Date(Date.UTC(+year, +month - 1, +day)).getUTCDay();
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dowNum];
    return { year, month, day, dow };
  }

  // Twitter format: "Fri Aug 28 11:05:56 +0000 2020"
  const match = dateStr.match(
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+\d{2}:\d{2}:\d{2}\s+[+\-]\d{4}\s+(\d{4})$/,
  );
  if (match) {
    const [, dow, monthStr, day, year] = match;
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = String(monthNames.indexOf(monthStr) + 1).padStart(2, "0");
    return { year, month, day: day.padStart(2, "0"), dow };
  }

  return null;
};

/** Slugify a string for filenames */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const queryRows = (db: Database, limit?: number): Row[] =>
  db
    .prepare(`
    SELECT tweet_id, url, text, author_handle, links_json, media_count
    FROM bookmarks
    WHERE (clipping_path IS NULL OR clipping_path = '')
      AND (extract_status IS NULL OR extract_status = 'error')
      AND (links_json IS NOT NULL AND links_json != '[]'
           OR COALESCE(media_count, 0) > 0)
    ORDER BY posted_at DESC
    ${limit ? `LIMIT ${limit}` : ""}
  `)
    .all<Row>();

const dryRunPreview = (rows: Row[]) => {
  logger.info("dry run — showing first 5 bookmarks to extract", {
    total: rows.length,
  });
  rows.slice(0, 5).forEach((row) =>
    logger.info(`  [${row.tweet_id}] ${row.text.slice(0, 80)}...`, {
      author: row.author_handle,
    })
  );
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const randomDelay = () => CONFIG.extractDelayMs + Math.random() * CONFIG.extractJitterMs;

const findExistingClipping = async (
  tweetId: string,
): Promise<string | null> => {
  const searchDir = async (dir: string): Promise<string | null> => {
    const path = `${CONFIG.clippingsBase}/${dir}`;
    try {
      const entries = await Array.fromAsync(Deno.readDir(path));
      // Fast path: tweet ID in filename
      const found = entries.find((e) => e.isFile && e.name.includes(tweetId));
      if (found) return `${path}/${found.name}`;

      // Slow path: check file content for tweet_id frontmatter (old format files)
      const mdFiles = entries.filter((e) => e.isFile && e.name.endsWith(".md"));
      const results = await Promise.all(
        mdFiles.map(async (entry) => {
          try {
            const content = await Deno.readTextFile(`${path}/${entry.name}`);
            return content.includes(`tweet_id: ${tweetId}`) ? `${path}/${entry.name}` : null;
          } catch {
            return null;
          }
        }),
      );
      return results.find(Boolean) ?? null;
    } catch {
      return null;
    }
  };

  const results = await Promise.all(
    Object.values(CONFIG.clippingDirs).map(searchDir),
  );
  return results.find(Boolean) ?? null;
};

const classifyTweet = (
  tweet: XtracticleResponse["tweets"][0],
): { dir: string; type: string } => {
  const mediaArray = normalizeMedia(tweet.media);
  const hasMedia = mediaArray.length > 0;
  const articleContent = (tweet.article as Record<string, unknown>)?.content as
    | Record<string, unknown>
    | undefined;
  const hasArticle = Array.isArray(articleContent?.blocks) &&
    (articleContent.blocks as unknown[]).length > 0;
  const textLen = (tweet.text || "").length;
  const hasLongText = textLen >= CONFIG.minPostTextLength;

  // Media only (short/no text, no article) → X-Media
  if (hasMedia && !hasArticle && !hasLongText) {
    return { dir: CONFIG.clippingDirs.media, type: "media" };
  }
  // Article content blocks from xtracticle OR long text → X-Articles
  if (hasArticle || hasLongText) {
    return { dir: CONFIG.clippingDirs.articles, type: "article" };
  }
  // Short text, no article, no direct media → X-Posts
  return { dir: CONFIG.clippingDirs.posts, type: "post" };
};

const buildFrontmatter = (
  tweet: XtracticleResponse["tweets"][0],
  type: string,
): string => {
  const directTypes = [
    ...new Set(normalizeMedia(tweet.media).map((m) => m.type)),
  ];
  const articleImages = extractArticleImages(tweet);

  // Include "photo" in media_types if article has images
  const allTypes = [...directTypes];
  if (articleImages.length && !allTypes.includes("photo")) {
    allTypes.push("photo");
  }

  const lines = [
    "---",
    `type: ${type}`,
    `source: ${tweet.url}`,
    `tweet_id: ${tweet.id}`,
    `author: ${tweet.author.name} (@${tweet.author.screen_name})`,
    `date: ${tweet.created_at}`,
    "extracted_via: xtracticle",
  ];

  if (tweet.likes !== null) lines.push(`likes: ${tweet.likes}`);
  if (tweet.bookmarks !== null) lines.push(`bookmarks: ${tweet.bookmarks}`);
  if (tweet.views !== null) lines.push(`views: ${tweet.views}`);

  if (allTypes.length) {
    lines.push(`media_types: [${allTypes.join(", ")}]`);
  }

  if (tweet.article) {
    lines.push("has_article: true");
  }

  lines.push("---");
  return lines.join("\n");
};

const mediaItemToMarkdown = (m: XtracticleMedia): string | null => {
  if (m.type === "photo") return `![image](${m.url})`;
  if (m.type === "video") {
    const thumb = m.thumbnail_url ? `![video thumbnail](${m.thumbnail_url})\n` : "";
    const bestFormat = m.formats?.length
      ? [...m.formats].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
      : null;
    const videoUrl = bestFormat?.url || m.url;
    const duration = m.duration ? ` (${Math.round(m.duration)}s)` : "";
    return `${thumb}[▶ Watch video${duration}](${videoUrl})`;
  }
  if (m.type === "animated_gif") {
    const thumb = m.thumbnail_url ? `![gif](${m.thumbnail_url})\n` : "";
    return `${thumb}[▶ View GIF](${m.url})`;
  }
  return null;
};

const buildMediaList = (
  media: XtracticleResponse["tweets"][0]["media"],
  articleImages: string[],
): string => {
  const lines: string[] = [];
  const mediaArray = normalizeMedia(media);

  // Direct tweet media (photos, videos, GIFs)
  lines.push(
    ...mediaArray
      .map(mediaItemToMarkdown)
      .filter((x): x is string => x !== null),
  );

  // Article images (cover + inline) — dedup against already-added media
  lines.push(
    ...articleImages
      .filter((url) => !lines.some((l) => l.includes(url)))
      .map((url) => `![article image](${url})`),
  );

  return lines.length ? lines.join("\n\n") : "";
};

/** Extract image URLs from article content (cover + inline media_entities) */
const extractArticleImages = (
  tweet: XtracticleResponse["tweets"][0],
): string[] => {
  const urls: string[] = [];

  // Cover image
  const coverUrl = (tweet.article as Record<string, unknown>)?.cover_media as
    | Record<string, unknown>
    | undefined;
  const coverImg = (coverUrl?.media_info as Record<string, unknown>)
    ?.original_img_url as string | undefined;
  if (coverImg) urls.push(coverImg);

  // Inline images from media_entities
  const mediaEntities = (tweet.article as Record<string, unknown>)
    ?.media_entities;
  if (Array.isArray(mediaEntities)) {
    const newUrls = mediaEntities
      .map(
        (entity) =>
          (entity?.media_info as Record<string, unknown>)?.original_img_url as
            | string
            | undefined,
      )
      .filter((url): url is string => {
        if (url === undefined) return false;
        return !urls.includes(url);
      });
    urls.push(...newUrls);
  }

  return urls;
};

/** Extract text from X Article content blocks */
const extractArticleText = (article: unknown): string => {
  if (!article || typeof article !== "object") return "";
  const blocks = (article as Record<string, unknown>)?.content;
  if (!blocks || typeof blocks !== "object") return "";
  const blockList = (blocks as Record<string, unknown>)?.blocks;
  if (!Array.isArray(blockList)) return "";
  return blockList
    .map((b: Record<string, unknown>) => b.text as string)
    .filter((t) => t && t.trim().length > 0)
    .join("\n\n");
};

/** Concatenate tweet text + article text — either can be empty, both get captured if present */
const getEffectiveText = (tweet: XtracticleResponse["tweets"][0]): string =>
  [tweet.text, extractArticleText(tweet.article)].filter(Boolean).join("\n\n");

const buildClippingContent = (
  tweet: XtracticleResponse["tweets"][0],
  type: string,
): string => {
  const text = getEffectiveText(tweet);
  const articleImages = extractArticleImages(tweet);
  const mediaList = buildMediaList(tweet.media, articleImages);

  // Extract article title if present
  const articleTitle = tweet.article && typeof tweet.article === "object"
    ? ((tweet.article as Record<string, unknown>).title as string) || null
    : null;

  return [
    buildFrontmatter(tweet, type),
    "",
    `# ${articleTitle || tweet.author.name}`,
    "",
    text,
    mediaList,
  ].join("\n");
};

const saveClipping = async (
  data: XtracticleResponse,
): Promise<string | null> => {
  const tweet = data.tweets[0];
  const { dir, type } = classifyTweet(tweet);
  const filename = buildFilename(tweet);
  const path = `${CONFIG.clippingsBase}/${dir}/${filename}`;
  const content = buildClippingContent(tweet, type);

  await Deno.mkdir(`${CONFIG.clippingsBase}/${dir}`, { recursive: true });
  await Deno.writeTextFile(path, content);
  return path;
};

const extractSingle = async (
  row: Row,
): Promise<{
  tweetId: string;
  clippingPath: string | null;
  extractStatus: string;
}> => {
  const resp = await fetch(`${CONFIG.xtracticleBase}/${row.tweet_id}`);

  if (!resp.ok) {
    logger.error("xtracticle fetch failed", {
      tweet_id: row.tweet_id,
      status: resp.status,
    });
    return {
      tweetId: row.tweet_id,
      clippingPath: null,
      extractStatus: resp.status === 404 ? "404" : "error",
    };
  }

  const data: XtracticleResponse = await resp.json();
  if (!data.tweets?.length) {
    logger.info("xtracticle returned no tweets", { tweet_id: row.tweet_id });
    return {
      tweetId: row.tweet_id,
      clippingPath: null,
      extractStatus: "no_tweets",
    };
  }

  const tweet = data.tweets[0];
  const effectiveText = getEffectiveText(tweet);
  if (!effectiveText || effectiveText.trim().length === 0) {
    logger.info("xtracticle returned empty text — skipping", {
      tweet_id: row.tweet_id,
      url: tweet.url,
    });
    return {
      tweetId: row.tweet_id,
      clippingPath: null,
      extractStatus: "empty",
    };
  }

  const clippingPath = await saveClipping(data);
  if (clippingPath) {
    logger.info("extracted clipping", {
      tweet_id: row.tweet_id,
      type: classifyTweet(tweet).type,
      path: clippingPath.split("/").pop(),
      textLen: tweet.text.length,
    });
  }

  await sleep(randomDelay());
  return {
    tweetId: row.tweet_id,
    clippingPath,
    extractStatus: clippingPath ? "extracted" : "error",
  };
};

const processBatch = async (
  db: Database,
  rows: Row[],
  skipExisting: boolean,
): Promise<ExtractResult[]> => {
  // Phase 1: fetch + save files concurrently
  const fetched = await Promise.all(
    rows.map((row) =>
      (skipExisting ? findExistingClipping(row.tweet_id) : Promise.resolve(null))
        .then((existing) =>
          existing
            ? {
              tweetId: row.tweet_id,
              clippingPath: existing,
              extractStatus: "extracted" as string,
              skipped: true,
            }
            : extractSingle(row).then((r) => ({ ...r, skipped: false }))
        )
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("extract failed", {
            tweet_id: row.tweet_id,
            error: msg,
          });
          return {
            tweetId: row.tweet_id,
            clippingPath: null,
            extractStatus: "error" as string,
            skipped: false,
          };
        })
    ),
  );

  // Phase 2: write DB updates sequentially
  const results = fetched.map(
    ({ tweetId, clippingPath, extractStatus, skipped }) => {
      if (skipped) {
        db.prepare(
          "UPDATE bookmarks SET clipping_path = ?, extract_status = 'extracted' WHERE tweet_id = ?",
        ).run([clippingPath, tweetId]);
        return "skipped";
      }
      if (clippingPath) {
        db.prepare(
          "UPDATE bookmarks SET clipping_path = ?, extract_status = 'extracted' WHERE tweet_id = ?",
        ).run([clippingPath, tweetId]);
        return "extracted";
      }
      db.prepare(
        "UPDATE bookmarks SET extract_status = ? WHERE tweet_id = ?",
      ).run([extractStatus, tweetId]);
      return "failed";
    },
  );

  return results;
};
const summarize = (results: ExtractResult[]) => {
  const counts = results.reduce(
    (acc, r) => ({ ...acc, [r]: (acc[r] || 0) + 1 }),
    {} as Record<ExtractResult, number>,
  );
  return {
    extracted: counts.extracted || 0,
    skipped: counts.skipped || 0,
    failed: counts.failed || 0,
  };
};

export const runExtract = async (options: ExtractOptions): Promise<void> => {
  logger.info("extract started");

  const db = getPipelineDb();

  try {
    const rows = queryRows(db, options.limit);
    logger.info("found bookmarks to extract", {
      count: rows.length,
      limit: options.limit ?? "none",
      skipExisting: options.skipExisting ?? false,
    });

    if (options.dryRun) return dryRunPreview(rows);

    // TODO: We can probably combine the batches themselves into the reduce operation.
    // Also means we shouldn't have to rely on the `allResults` array either.

    const allResults: ExtractResult[] = [];
    const BATCH_SIZE = 10;

    // Gather batch slices functionally
    const batchCount = Math.ceil(rows.length / BATCH_SIZE);
    const batches = Array.from({ length: batchCount }, (_, batchIndex) => {
      const start = batchIndex * BATCH_SIZE;
      const batch = rows.slice(start, start + BATCH_SIZE);
      logger.info("extract batch queued", {
        batch: batchIndex + 1,
        total: batchCount,
        size: batch.length,
      });
      return batch;
    });

    // Flush batches sequentially via reduce chain
    await batches.reduce(
      (chain, batch, i) =>
        chain.then(async () => {
          logger.info("extract batch processing", {
            batch: i + 1,
            total: batches.length,
          });
          const results = await processBatch(
            db,
            batch,
            options.skipExisting ?? false,
          );
          allResults.push(...results);
        }),
      Promise.resolve(),
    );

    const { extracted, skipped, failed } = summarize(allResults);
    logger.info("extract complete", {
      extracted,
      skipped,
      failed,
      total: rows.length,
    });
  } finally {
    closePipelineDb();
  }
};
