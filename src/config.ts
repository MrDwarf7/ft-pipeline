// config.ts -- All paths and settings in one place
// Single import point for the entire app

import { BASES } from "./utils/bases.ts";

const envOrFallback = (key: string, fallback: string): string => Deno.env.get(key) ?? fallback;

export const CONFIG = {
  // ft DB path (read-only source)
  ftDbPath: envOrFallback("FT_DB_PATH", BASES.ftDbPath),
  // Pipeline DB path — our own database
  pipelineDbPath: envOrFallback("FT_PIPELINE_DB_PATH", BASES.pipelineDbPath),
  bookmarksJsonl: BASES.bookmarksJsonl,
  // Cookies file — MUST be an absolute path.
  // Set FT_COOKIES_PATH to the location of your encrypted .sync-cookies.enc file.
  // This decouples the pipeline from $HOME, so it works in sandboxed environments.
  //
  //   export FT_COOKIES_PATH="/home/$USER/.ft-bookmarks/.sync-cookies.enc"
  //
  cookiesPath: envOrFallback("FT_COOKIES_PATH", BASES.cookiesPath),
  mdOutputDir: envOrFallback("FT_MARKDOWN_DIR", BASES.mdOutputDir),
  clippingsBase: envOrFallback("FT_CLIPPINGS_BASE", BASES.clippingsBase),
  ftCliDir: envOrFallback("FT_CLI_DIR", BASES.ftCliDir),

  // Xtracticle API
  xtracticleBase: BASES.xtracticleBase,

  // LLM (llama-server local)
  llmBase: BASES.llmBase,
  llmModel: BASES.llmModel,

  // Timing
  syncDelayMs: 600,
  extractDelayMs: 750,
  extractJitterMs: 400,

  // Thresholds
  minPostTextLength: 200,
  maxRetries: 3,
  retryBaseMs: 2000,
  classificationBatchSize: 50,

  // Clippings subdirs
  clippingDirs: {
    articles: "X-Articles",
    posts: "X-Posts",
    media: "X-Media",
  } as const,
} as const;

// Taxonomy for classification
export const TYPES = [
  "tool",
  "technique",
  "launch",
  "research",
  "opinion",
  "security",
  "news",
  "meme-shitpost",
  "tutorial",
  "resource",
] as const;

export const DOMAINS = [
  "agentic",
  "ai-ml",
  "security",
  "devops",
  "programming",
  "geopolitics",
  "conspiracy",
  "health",
  "finance",
  "crypto",
  "media",
  "culture",
  "science",
] as const;

export type BookmarkType = (typeof TYPES)[number];
export type BookmarkDomain = (typeof DOMAINS)[number];
