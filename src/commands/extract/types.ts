/** Shared types for the extract command modules. */

export interface ExtractOptions {
  readonly dryRun?: boolean;
  readonly limit?: number;
  readonly skipExisting?: boolean;
}

export interface BookmarkRow {
  readonly tweet_id: string;
  readonly url: string;
  readonly text: string;
  readonly author_handle: string;
  readonly links_json: string;
  readonly media_count: number;
}

export type ExtractResult = "extracted" | "skipped" | "failed";

/** Per-item outcome before DB write. */
export interface ExtractItemOutcome {
  readonly tweetId: string;
  readonly clippingPath: string | null;
  readonly extractStatus: string;
  readonly skipped: boolean;
}
