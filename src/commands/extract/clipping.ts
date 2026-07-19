/** Clipping path search, filename, frontmatter, and file write. */

import { CONFIG } from "../../config.ts";
import type { XtracticleMedia, XtracticleTweet } from "../../extraction/xtracticle-schema.ts";
import { parseDate } from "../../utils/datetime.ts";
import { logger } from "../../utils/logger.ts";
import {
  classifyTweet,
  extractArticleImages,
  getEffectiveText,
  normalizeMedia,
} from "./classify.ts";

/** Slugify a string for filenames. */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Build rev-iso filename: YYYY_MM_DD-Dow-@handle-slug-title.md */
export const buildFilename = (tweet: XtracticleTweet): string => {
  const { ok, parts } = parseDate(tweet.created_at);
  const handle = `@${tweet.author.screen_name}`;
  const titleSlug = slug((tweet.text ?? "").slice(0, 50)) || tweet.id;

  if (ok) {
    return `${parts.year}_${parts.month}_${parts.day}-${parts.dow}-${handle}-${titleSlug}.md`;
  }
  return `undated-${handle}-${titleSlug}.md`;
};

const buildFrontmatter = (tweet: XtracticleTweet, type: string): string => {
  const directTypes = [
    ...new Set(normalizeMedia(tweet.media).map((m) => m.type)),
  ];
  const articleImages = extractArticleImages(tweet);

  const allTypes = [...directTypes];
  if (articleImages.length > 0 && !allTypes.includes("photo")) {
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

  if (typeof tweet.likes === "number") lines.push(`likes: ${tweet.likes}`);
  if (typeof tweet.bookmarks === "number") {
    lines.push(`bookmarks: ${tweet.bookmarks}`);
  }
  if (typeof tweet.views === "number") lines.push(`views: ${tweet.views}`);

  if (allTypes.length > 0) {
    lines.push(`media_types: [${allTypes.join(", ")}]`);
  }

  if (tweet.article !== null && tweet.article !== undefined) {
    lines.push("has_article: true");
  }

  lines.push("---");
  return lines.join("\n");
};

const mediaItemToMarkdown = (m: XtracticleMedia): string | null => {
  if (m.type === "photo") return `![image](${m.url})`;
  if (m.type === "video") {
    const thumb = m.thumbnail_url ? `![video thumbnail](${m.thumbnail_url})\n` : "";
    const bestFormat = m.formats !== undefined && m.formats.length > 0
      ? [...m.formats].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
      : null;
    const videoUrl = bestFormat?.url ?? m.url;
    const duration = typeof m.duration === "number" ? ` (${Math.round(m.duration)}s)` : "";
    return `${thumb}[▶ Watch video${duration}](${videoUrl})`;
  }
  if (m.type === "animated_gif") {
    const thumb = m.thumbnail_url ? `![gif](${m.thumbnail_url})\n` : "";
    return `${thumb}[▶ View GIF](${m.url})`;
  }
  return null;
};

const buildMediaList = (
  media: XtracticleTweet["media"],
  articleImages: readonly string[],
): string => {
  const lines: string[] = [];
  const mediaArray = normalizeMedia(media);

  lines.push(
    ...mediaArray
      .map(mediaItemToMarkdown)
      .filter((x): x is string => x !== null),
  );

  lines.push(
    ...articleImages
      .filter((url) => !lines.some((l) => l.includes(url)))
      .map((url) => `![article image](${url})`),
  );

  return lines.length > 0 ? lines.join("\n\n") : "";
};

/** Full markdown body for a clipping file. */
export const buildClippingContent = (
  tweet: XtracticleTweet,
  type: string,
): string => {
  const text = getEffectiveText(tweet);
  const articleImages = extractArticleImages(tweet);
  const mediaList = buildMediaList(tweet.media, articleImages);
  const articleTitle = tweet.article?.title;
  const heading = typeof articleTitle === "string" && articleTitle.length > 0
    ? articleTitle
    : tweet.author.name;

  return [
    buildFrontmatter(tweet, type),
    "",
    `# ${heading}`,
    "",
    text,
    mediaList,
  ].join("\n");
};

/** Write clipping markdown under the classified dir; returns absolute path. */
export const saveClipping = async (
  tweet: XtracticleTweet,
): Promise<string> => {
  const { dir, type } = classifyTweet(tweet);
  const filename = buildFilename(tweet);
  const path = `${CONFIG.clippingsBase}/${dir}/${filename}`;
  const content = buildClippingContent(tweet, type);

  await Deno.mkdir(`${CONFIG.clippingsBase}/${dir}`, { recursive: true });
  await Deno.writeTextFile(path, content);
  return path;
};

const isNotFound = (err: unknown): boolean => err instanceof Deno.errors.NotFound;

/** Search clipping dirs for an existing file for this tweet_id. */
export const findExistingClipping = async (
  tweetId: string,
): Promise<string | null> => {
  const searchDir = async (dir: string): Promise<string | null> => {
    const path = `${CONFIG.clippingsBase}/${dir}`;
    let entries: Deno.DirEntry[];
    try {
      entries = await Array.fromAsync(Deno.readDir(path));
    } catch (err) {
      if (isNotFound(err)) return null;
      logger.warn("failed to list clippings dir", {
        dir: path,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    const found = entries.find((e) => e.isFile && e.name.includes(tweetId));
    if (found) return `${path}/${found.name}`;

    const mdFiles = entries.filter((e) => e.isFile && e.name.endsWith(".md"));
    const results = await Promise.all(
      mdFiles.map(async (entry) => {
        const filePath = `${path}/${entry.name}`;
        try {
          const content = await Deno.readTextFile(filePath);
          return content.includes(`tweet_id: ${tweetId}`) ? filePath : null;
        } catch (err) {
          if (isNotFound(err)) {
            logger.warn("clipping disappeared during scan", { path: filePath });
            return null;
          }
          logger.warn("corrupt or unreadable clipping file", {
            path: filePath,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      }),
    );
    return results.find((r): r is string => r !== null) ?? null;
  };

  const results = await Promise.all(
    Object.values(CONFIG.clippingDirs).map(searchDir),
  );
  return results.find((r): r is string => r !== null) ?? null;
};
