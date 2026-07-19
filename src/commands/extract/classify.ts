/** Pure classify + article text/image helpers for xtracticle tweets. */

import { CONFIG } from "../../config.ts";
import type {
  XtracticleArticle,
  XtracticleMedia,
  XtracticleTweet,
} from "../../extraction/xtracticle-schema.ts";

export interface Classification {
  readonly dir: string;
  readonly type: string;
}

/** Normalize xtracticle media (array or {all, photos, mosaic} object). */
export const normalizeMedia = (
  media: XtracticleTweet["media"],
): XtracticleMedia[] => {
  if (media === null || media === undefined) return [];
  if (Array.isArray(media)) return media;
  if (Array.isArray(media.all)) return media.all;
  if (Array.isArray(media.photos)) return media.photos;
  return [];
};

/** True when article has at least one content block. */
export const hasArticleBlocks = (
  article: XtracticleArticle | null | undefined,
): boolean => {
  if (article === null || article === undefined) return false;
  const blocks = article.content?.blocks;
  return Array.isArray(blocks) && blocks.length > 0;
};

/**
 * Classify a tweet into clipping dir + content type.
 * Media-only short posts -> media; article blocks or long text -> article; else post.
 */
export const classifyTweet = (tweet: XtracticleTweet): Classification => {
  const mediaArray = normalizeMedia(tweet.media);
  const hasMedia = mediaArray.length > 0;
  const hasArticle = hasArticleBlocks(tweet.article);
  const textLen = (tweet.text ?? "").length;
  const hasLongText = textLen >= CONFIG.minPostTextLength;

  if (hasMedia && !hasArticle && !hasLongText) {
    return { dir: CONFIG.clippingDirs.media, type: "media" };
  }
  if (hasArticle || hasLongText) {
    return { dir: CONFIG.clippingDirs.articles, type: "article" };
  }
  return { dir: CONFIG.clippingDirs.posts, type: "post" };
};

/** Cover + inline article image URLs, de-duplicated in encounter order. */
export const extractArticleImages = (tweet: XtracticleTweet): string[] => {
  const urls: string[] = [];
  const article = tweet.article;
  if (article === null || article === undefined) return urls;

  const coverImg = article.cover_media?.media_info?.original_img_url;
  if (typeof coverImg === "string" && coverImg.length > 0) {
    urls.push(coverImg);
  }

  const entities = article.media_entities;
  if (!Array.isArray(entities)) return urls;

  const fromEntities = entities
    .map((entity) => entity.media_info?.original_img_url)
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .filter((url) => !urls.includes(url));

  return [...urls, ...fromEntities];
};

/** Plain text from X Article draft-js style content blocks. */
export const extractArticleText = (
  article: XtracticleArticle | null | undefined,
): string => {
  if (article === null || article === undefined) return "";
  const blockList = article.content?.blocks;
  if (!Array.isArray(blockList)) return "";
  return blockList
    .map((b) => b.text)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .join("\n\n");
};

/** Tweet text + article body; either side may be empty. */
export const getEffectiveText = (tweet: XtracticleTweet): string =>
  [tweet.text ?? "", extractArticleText(tweet.article)]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");
