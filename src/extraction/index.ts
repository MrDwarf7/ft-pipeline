/**
 * Extraction source interface + factory.
 * Pattern matches llm/ (provider -> check -> connected instance).
 * Type-state: Unchecked -> Checked -> Fetched -> Processed.
 */

import { TweetData } from "./types.ts";
import type { GraphQLConfig } from "./graphql.ts";

/** State 1: Unchecked. C = config type (GraphQLConfig, XtracticleConfig, etc.) */
export interface UncheckedSource<C> {
  check: (config: C) => Promise<CheckedSource>;
}

/** State 2: Checked (config captured in closure). */
export interface CheckedSource {
  fetchBatch: (
    limit: number,
    concurrency: number,
    existingIds: Set<string>,
  ) => Promise<FetchedBatchSource>;
  fetchOne: (id: string) => Promise<FetchedOneSource>;
}

/** State 3a: Fetched via batch (data captured, pooledMap set up). */
export interface FetchedBatchSource {
  processBatch: () => Promise<TweetData[]>;
  processAll: () => Promise<TweetData[]>;
}

/** State 3b: Fetched via one. */
export interface FetchedOneSource {
  processOne: () => Promise<TweetData>;
}

/** Concrete factory. */
export type CreateGraphQL = () => UncheckedSource<GraphQLConfig>;

export { createGraphQL } from "./graphql.ts";

// Future:
// export { createXtracticle } from "./xtracticle.ts";
// export { createWebsites } from "./websites.ts";
