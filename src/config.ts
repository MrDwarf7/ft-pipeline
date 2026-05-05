// config.ts -- All paths and settings in one place
// config.ts -- All paths and settings in one place

// Pipeline home: FT_PIPELINE_HOME env var takes precedence, falls back to HOME
import { DATA_HOME } from "./utils/env.ts";

const envOrFallback = (key: string, fallback: string): string =>
  Deno.env.get(key) ?? fallback;

export const CONFIG = {
  // ft DB path (read-only source) — independent of pipelineHome
  ftDbPath: envOrFallback(
    "FT_DB_PATH",
    `${Deno.env.get("HOME") ?? ""}/.ft-bookmarks/bookmarks.db`,
  ),
  // Pipeline DB path — our own database
  pipelineDbPath: envOrFallback(
    "FT_PIPELINE_DB_PATH",
    `${DATA_HOME}/.ft-bookmarks/pipeline.db`,
  ),
  bookmarksJsonl: `${DATA_HOME}/.ft-bookmarks/bookmarks.jsonl`,
  // Cookies file — MUST be an absolute path.
  // Set FT_COOKIES_PATH to the location of your encrypted .sync-cookies.enc file.
  // This decouples the pipeline from $HOME, so it works in sandboxed environments.
  //
  //   export FT_COOKIES_PATH=\"/home/$USER/.ft-bookmarks/.sync-cookies.enc\"
  //
  cookiesPath: envOrFallback(
    "FT_COOKIES_PATH",
    `${DATA_HOME}/.ft-bookmarks/.sync-cookies.enc`,
  ),
  mdOutputDir: envOrFallback(
    "FT_MARKDOWN_DIR",
    `${DATA_HOME}/.ft-bookmarks/md`,
  ),
  clippingsBase: envOrFallback(
    "FT_CLIPPINGS_BASE",
    `${DATA_HOME}/StoneVault/Clippings`,
  ),
  ftCliDir: envOrFallback(
    "FT_CLI_DIR",
    `${Deno.env.get("HOME")}/Documents/GitHub_Projects/JavaScript/fieldtheory-cli`,
  ),

  // Xtracticle API
  xtracticleBase: "https://xtracticle.com/api/thread",

  // LLM (llama-server local)
  llmBase: "http://localhost/1234/v1",
  llmModel: "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf",

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
