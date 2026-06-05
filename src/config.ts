// config.ts -- All paths and settings in one place
// Single import point for the entire app

import { BASES } from "./utils/bases.ts";

const envOrFallback = (key: string, fallback: string): string => Deno.env.get(key) ?? fallback;

export const CONFIG = {
  // Pipeline DB — our canonical database (hardcoded, see bases.ts)
  pipelineDbPath: envOrFallback("FT_PIPELINE_DB_PATH", BASES.pipelineDbPath),

  // Cookies file — MUST be an absolute path.
  // Set FT_COOKIES_PATH to override the default.
  //
  //   export FT_COOKIES_PATH="/home/dwarf/.config/ft-pipeline/.sync-cookies.enc"
  //
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

// ── Retired config keys ──────────────────────────────────────────────
// These were previously used when the pipeline read from the old
// fieldtheory-cli database (.ft-bookmarks/).  They are no longer needed.
//
//   ftDbPath:          envOrFallback("FT_DB_PATH",         BASES.ftDbPath)
//   bookmarksJsonl:    BASES.bookmarksJsonl
//   ftCliDir:          envOrFallback("FT_CLI_DIR",         BASES.ftCliDir)
// -------------------------------------------------------------------

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
