#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write
// config.ts -- All paths and settings in one place

export const CONFIG = {
  // Paths
  dbPath: `${Deno.env.get("HOME")}/.ft-bookmarks/bookmarks.db`,
  bookmarksJsonl: `${Deno.env.get("HOME")}/.ft-bookmarks/bookmarks.jsonl`,
  cookiesPath: `${Deno.env.get("HOME")}/.ft-bookmarks/.sync-cookies.enc`,
  mdOutputDir: `${Deno.env.get("HOME")}/.ft-bookmarks/md`,
  clippingsBase: "/mnt/data_drive/Obsidian/StoneVault/Clippings",

  // Xtracticle API
  xtracticleBase: "https://xtracticle.com/api/thread",

  // LLM (llama-server local)
  llmBase: "http://localhost:1234/v1",
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
