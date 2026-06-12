/** All paths and settings in one place */

import { BASES } from "./utils/bases.ts";

const envOrFallback = (key: string, fallback: string): string => Deno.env.get(key) ?? fallback;

export const CONFIG = {
  pipelineDbPath: envOrFallback("FT_PIPELINE_DB_PATH", BASES.pipelineDbPath),

  /** Set FT_COOKIES_PATH to override. Must be absolute. */
  cookiesPath: envOrFallback("FT_COOKIES_PATH", BASES.cookiesPath),

  // Output directory for generated markdown files (bookmarks, indexes, etc.)
  mdOutputDir: envOrFallback("FT_MARKDOWN_DIR", BASES.mdOutputDir),

  // StoneVault clippings base dir
  clippingsBase: envOrFallback("FT_CLIPPINGS_BASE", BASES.clippingsBase),

  // Classification results backup
  classificationResultsPath: BASES.classificationResultsPath,

  // Pipeline logs
  logDir: BASES.logDir,

  // Xtracticle API
  xtracticleBase: BASES.xtracticleBase,

  // LLM (llama-server local)
  llmBase: BASES.llmBase,
  llmModel: BASES.llmModel,

  // Log housekeeping -- cap on log files in logDir
  maxLogFiles: Number(Deno.env.get("FT_MAX_LOG_FILES")) || 100,

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

/* Retired: ftDbPath, bookmarksJsonl, ftCliDir -- from old fieldtheory-cli DB */

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
