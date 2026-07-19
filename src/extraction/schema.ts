/** Zod schemas for GraphQL response validation. */
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
