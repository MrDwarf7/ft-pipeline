/** Zod schemas for xtracticle.com thread API shapes used by extract. */

import { z } from "zod";

const MediaFormatSchema = z.object({
  url: z.string(),
  bitrate: z.number().optional(),
});

/** Direct tweet media item (photo / video / animated_gif). */
export const XtracticleMediaSchema = z.object({
  id: z.string().optional(),
  url: z.string(),
  type: z.string(),
  thumbnail_url: z.string().optional(),
  duration: z.number().optional(),
  formats: z.array(MediaFormatSchema).optional(),
});

/** Media as either a flat array or the { all, photos, mosaic } object. */
const MediaObjectSchema = z.object({
  all: z.array(XtracticleMediaSchema).optional(),
  photos: z.array(XtracticleMediaSchema).optional(),
  mosaic: z.record(z.string(), z.unknown()).optional(),
});

const MediaInfoSchema = z.object({
  original_img_url: z.string().optional(),
}).passthrough();

const MediaEntitySchema = z.object({
  media_info: MediaInfoSchema.optional(),
}).passthrough();

const CoverMediaSchema = z.object({
  media_info: MediaInfoSchema.optional(),
}).passthrough();

const ArticleBlockSchema = z.object({
  text: z.string().optional(),
}).passthrough();

const ArticleContentSchema = z.object({
  blocks: z.array(ArticleBlockSchema).optional(),
  entityMap: z.unknown().optional(),
}).passthrough();

/** X Article payload: title, draft blocks, cover + inline media. */
export const XtracticleArticleSchema = z.object({
  title: z.string().optional(),
  preview_text: z.string().optional(),
  content: ArticleContentSchema.optional(),
  cover_media: CoverMediaSchema.optional(),
  media_entities: z.array(MediaEntitySchema).optional(),
}).passthrough();

const AuthorSchema = z.object({
  screen_name: z.string(),
  name: z.string(),
});

/** One tweet element inside the xtracticle thread response. */
export const XtracticleTweetSchema = z.object({
  id: z.string(),
  url: z.string(),
  text: z.string().optional(),
  author: AuthorSchema,
  created_at: z.string(),
  likes: z.number().optional(),
  bookmarks: z.number().optional(),
  views: z.number().optional(),
  media: z.union([
    z.array(XtracticleMediaSchema),
    MediaObjectSchema,
    z.null(),
  ]).optional(),
  article: XtracticleArticleSchema.nullable().optional(),
});

/** Top-level xtracticle /api/thread/{id} body. */
export const XtracticleResponseSchema = z.object({
  tweets: z.array(XtracticleTweetSchema),
});

export type XtracticleMedia = z.infer<typeof XtracticleMediaSchema>;
export type XtracticleArticle = z.infer<typeof XtracticleArticleSchema>;
export type XtracticleTweet = z.infer<typeof XtracticleTweetSchema>;
export type XtracticleResponse = z.infer<typeof XtracticleResponseSchema>;

/** Parse unknown JSON into a validated xtracticle response. Throws on drift. */
export const parseXtracticleResponse = (data: unknown): XtracticleResponse => {
  const result = XtracticleResponseSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`xtracticle response schema mismatch: ${issues}`);
  }
  return result.data;
};
