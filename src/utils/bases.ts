import * as path from "@std/path";

export type AppEnv = "DEV" | "UAT" | "PROD";

const getEnv = (): AppEnv => {
  const raw = Deno.env.get("FT_APP_ENV")?.toUpperCase();
  if (raw === "PROD") return "PROD";
  if (raw === "UAT") return "UAT";
  return "DEV";
};

const env = getEnv();

// ---------------------------------------------------------------------------
// HARDCODED PATHS — All paths below are explicit absolute paths to our own
// config directory at /home/dwarf/.config/ft-pipeline/.  This decouples the
// pipeline from the old fieldtheory-cli ecosystem (.ft-bookmarks/).
//
// TODO: make these configurable via env vars or a config file.  For now,
//       hardcoding keeps things simple while we finish the migration.
// ---------------------------------------------------------------------------

export const BASES = Object.freeze({
  env,

  // ── Our config root ─────────────────────────────────────────────────
  configRoot: "/home/dwarf/.config/ft-pipeline",

  // Pipeline DB — our canonical database
  pipelineDbPath: "/home/dwarf/.config/ft-pipeline/pipeline.db",

  // Encrypted X session cookies
  cookiesPath: "/home/dwarf/.config/ft-pipeline/.sync-cookies.enc",

  // Final generated output (bookmark pages, indexes, etc.)
  mdOutputDir: "/home/dwarf/.config/ft-pipeline/output",

  // Bookmark classification results
  classificationResultsPath:
    "/home/dwarf/.config/ft-pipeline/classification-results.json",

  // Pipeline logs
  logDir: "/home/dwarf/.config/ft-pipeline/logs",

  // ── Old .ft-bookmarks paths (retired) ───────────────────────────────
  // These were previously resolved relative to $HOME/.ft-bookmarks/.
  // They are kept here as reference but no longer used by the pipeline.
  //
  // ftDbPath:        path.join(root, ".ft-bookmarks/bookmarks.db"),
  // bookmarksJsonl:  path.join(root, ".ft-bookmarks/bookmarks.jsonl"),
  // ftCliDir:        path.join(root, "Documents/GitHub_Projects/JavaScript/fieldtheory-cli"),

  // ── StoneVault / Obsidian vault ──────────────────────────────────────
  // /home/dwarf/StoneVault is the actual vault location (symlinked from an
  // external drive).  /home/dwarf/wiki -> StoneVault/wiki.
  clippingsBase: "/home/dwarf/StoneVault/Clippings",

  // ── Static ──────────────────────────────────────────────────────────
  xtracticleBase: "https://xtracticle.com/api/thread",
  llmBase: "http://localhost:1234/v1",
  llmModel: "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf",
});
