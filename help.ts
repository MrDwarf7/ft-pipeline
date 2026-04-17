// help.ts -- Help text and usage output

import { logger } from "./utils/logger.ts";

export const HELP_TEXT = `ft-pipeline -- Bookmark pipeline

Usage: ft-pipeline <command> [options]

Commands:
  cookies extract   Extract X session cookies (interactive)
  cookies check     Check if cookies file exists
  sync              Sync bookmarks from X (requires cookies)
  extract           Extract articles via xtracticle + link to DB
  merge             Merge Clippings enriched text back into DB
  classify          LLM classification for unclassified bookmarks
  generate          Regenerate md files from DB
  indexes           Generate category/domain index notes
  full              Run all steps: sync -> extract -> merge -> classify -> generate -> indexes

Options:
  -p, --password <pw>   Cookie decryption password (or FT_PIPELINE_PASSWORD env)
  --limit <n>           Limit items to process
  --dry-run             Show what would happen without changes
  --skip-existing       Skip already processed items
  -h, --help            Show this help`;

export const printHelp = () => {
  logger.info(HELP_TEXT);
  Deno.exit(0);
};
