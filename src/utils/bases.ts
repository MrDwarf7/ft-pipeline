import * as path from "@std/path";

export type AppEnv = "DEV" | "UAT" | "PROD";

const getEnv = (): AppEnv => {
  const raw = Deno.env.get("FT_APP_ENV")?.toUpperCase();
  if (raw === "PROD") return "PROD";
  if (raw === "UAT") return "UAT";
  return "DEV";
};

const env = getEnv();

const root = Deno.env.get("FT_PIPELINE_HOME")
  ? path.resolve(Deno.env.get("FT_PIPELINE_HOME")!)
  : env === "DEV"
  ? path.resolve(Deno.env.get("HOME") ?? Deno.cwd())
  : path.dirname(path.resolve(Deno.execPath()));

export const BASES = Object.freeze({
  env,
  root,
  // .ft-bookmarks/ paths
  ftDbPath: path.join(root, ".ft-bookmarks/bookmarks.db"),
  pipelineDbPath: path.join(root, ".ft-bookmarks/pipeline.db"),
  cookiesPath: path.join(root, ".ft-bookmarks/.sync-cookies.enc"),
  mdOutputDir: path.join(root, ".ft-bookmarks/md"),
  bookmarksJsonl: path.join(root, ".ft-bookmarks/bookmarks.jsonl"),
  // StoneVault + fieldtheory-cli (relative to root, matching current config.ts)
  clippingsBase: path.join(root, "StoneVault/Clippings"),
  ftCliDir: path.join(
    root,
    "Documents/GitHub_Projects/JavaScript/fieldtheory-cli",
  ),
  // Static
  xtracticleBase: "https://xtracticle.com/api/thread",
  llmBase: "http://localhost:1234/v1",
  llmModel: "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf",
});
