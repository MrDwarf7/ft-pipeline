/** Zod schemas for X Bookmarks GraphQL -- leaf tweet + timeline envelope. */
import { z } from "zod";

export const MediaSchema = z.object({
  type: z.string(),
  url: z.string().optional(),
  media_url_https: z.string().optional(),
  media_url: z.string().optional(),
  media_info: z
    .object({
      original_img_url: z.string().optional(),
    })
    .optional(),
});

export const UrlEntitySchema = z.object({
  expanded_url: z.string(),
});

/** Leaf tweet payload after optional flat->nested wrap (`{ tweet: ... }`). */
export const TweetDataSchema = z.object({
  tweet: z.object({
    legacy: z.object({
      id_str: z.string(),
      full_text: z.string().optional(),
      text: z.string().optional(),
      created_at: z.string(),
      favorite_count: z.number().default(0),
      retweet_count: z.number().default(0),
      reply_count: z.number().default(0),
      quote_count: z.number().default(0),
      bookmark_count: z.number().default(0),
      extended_entities: z
        .object({
          media: z.array(MediaSchema).optional(),
        })
        .optional(),
      entities: z
        .object({
          urls: z.array(UrlEntitySchema).optional(),
          media: z.array(MediaSchema).optional(),
        })
        .optional(),
    }),
    core: z.object({
      user_results: z.object({
        result: z.object({
          core: z.object({
            screen_name: z.string(),
            name: z.string(),
          }),
          legacy: z
            .object({
              screen_name: z.string().optional(),
              name: z.string().optional(),
            })
            .optional(),
        }),
      }),
    }),
    note_tweet: z
      .object({
        note_tweet_results: z
          .object({
            result: z
              .object({
                text: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
      })
      .optional(),
    views: z
      .object({
        count: z.string().optional(),
      })
      .optional(),
  }),
});

export type ParsedTweetNode = z.infer<typeof TweetDataSchema>;

export const GraphQLErrorSchema = z
  .object({
    message: z.string(),
  })
  .passthrough();

/** Single timeline entry (tweet item, cursor, or other module). */
export const TimelineEntrySchema = z
  .object({
    entryId: z.string().optional(),
    content: z
      .object({
        itemContent: z
          .object({
            tweet_results: z
              .object({
                result: z.unknown().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
        value: z.string().optional(),
      })
      .passthrough()
      .optional(),
    sortIndex: z.string().optional(),
  })
  .passthrough();

export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

const TimelineAddEntriesInstructionSchema = z.object({
  type: z.literal("TimelineAddEntries"),
  entries: z.array(TimelineEntrySchema),
});

const OtherTimelineInstructionSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

/** Prefer TimelineAddEntries match before the open instruction shape. */
export const TimelineInstructionSchema = z.union([
  TimelineAddEntriesInstructionSchema,
  OtherTimelineInstructionSchema,
]);

export type TimelineInstruction = z.infer<typeof TimelineInstructionSchema>;

/** `data.bookmark_timeline_v2.timeline` once `data` is known present. */
export const BookmarkTimelineDataSchema = z.object({
  bookmark_timeline_v2: z.object({
    timeline: z.object({
      instructions: z.array(TimelineInstructionSchema),
    }),
  }),
});

/**
 * Top-level Bookmarks GraphQL JSON. `data` may be null/absent on auth errors;
 * timeline shape is validated separately after presence checks.
 */
export const BookmarksResponseSchema = z
  .object({
    data: z.unknown().nullable().optional(),
    errors: z.array(GraphQLErrorSchema).optional(),
  })
  .passthrough();

export type BookmarksResponse = z.infer<typeof BookmarksResponseSchema>;
