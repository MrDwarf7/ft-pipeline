// utils/bases.ts -- Application environment and base path utilities
//
// Provides environment detection and base path resolution for the
// ft-pipeline project. Uses XDG Base Directory spec on Linux,
// and env-paths (OS-native conventions) on macOS and Windows.

export type AppEnv = "DEV" | "UAT" | "PROD";

const getEnv = (): AppEnv => {
  const raw = Deno.env.get("FT_APP_ENV")?.toUpperCase();
  if (raw === "PROD") return "PROD";
  if (raw === "UAT") return "UAT";
  return "DEV";
};

const env = getEnv();

// ── Home directory ─────────────────────────────────────────────
// Resolves $HOME via env var. Deno runtime guarantees this is set on
// POSIX systems. Falls back to $USERPROFILE on Windows (not tested).
const homeDir = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";

// ── Platform-specific paths ────────────────────────────────────
// Linux: XDG Base Directory spec via xdg-basedir
// macOS/Windows: OS-native conventions via env-paths
interface AppPaths {
  config: string;
  data: string;
  cache: string;
}

const PATHS: AppPaths = await (async (): Promise<AppPaths> => {
  if (Deno.build.os === "linux") {
    // Dynamic import — xdg-basedir is Linux-only
    const { xdgConfig, xdgData, xdgCache } = await import("xdg-basedir");
    return {
      config: xdgConfig ?? `${homeDir}/.config`,
      data: xdgData ?? `${homeDir}/.local/share`,
      cache: xdgCache ?? `${homeDir}/.cache`,
    };
  }

  // macOS + Windows: env-paths handles OS-native locations
  // const envPaths = (await import("npm:env-paths@4")).default;
  const envPaths = (await import("env-paths")).default;
  const p = envPaths("ft-pipeline", { suffix: "" });
  return {
    config: p.config,
    data: p.data,
    cache: p.cache,
  };
})();

// ── Application-specific subdirs ───────────────────────────────
const APP_NAME = "ft-pipeline";
const appConfigDir = `${PATHS.config}/${APP_NAME}`;
const appDataDir = `${PATHS.data}/${APP_NAME}`;
const appCacheDir = `${PATHS.cache}/${APP_NAME}`;

// ---------------------------------------------------------------------------
// BASES — All application paths derived from the above roots.
// Config/data/cache dirs are XDG-compliant on Linux, OS-native elsewhere.
// Vault paths always derive from $HOME.
// ---------------------------------------------------------------------------

export const BASES = Object.freeze({
  env,

  // ── XDG app dirs ──────────────────────────────────────────────
  appConfigDir,
  appDataDir,
  appCacheDir,

  // Pipeline DB — our canonical database
  pipelineDbPath: `${appConfigDir}/pipeline.db`,

  // Encrypted X session cookies
  cookiesPath: `${appConfigDir}/.sync-cookies.enc`,

  // Final generated output — written directly to the wiki so the cron agent
  // can pick up new notes without an intermediary folder.
  // Subdirs: bookmarks/, categories/, domains/, entities/
  mdOutputDir: `${homeDir}/StoneVault/wiki`,

  // Bookmark classification results
  classificationResultsPath: `${appConfigDir}/classification-results.json`,

  // Pipeline logs
  logDir: `${appConfigDir}/logs`,

  // ── StoneVault / Obsidian vault ──────────────────────────────────────
  // ~/StoneVault is the actual vault location (symlinked from an external drive).
  // ~/wiki -> StoneVault/wiki.
  clippingsBase: `${homeDir}/StoneVault/Clippings`,

  // ── Static ──────────────────────────────────────────────────────────
  xtracticleBase: "https://xtracticle.com/api/thread",
  llmBase: "http://localhost:1234/v1",
  llmModel: "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf",
});
