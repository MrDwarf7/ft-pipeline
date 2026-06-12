/** App environment + base path resolution. XDG on Linux, env-paths elsewhere. */

export type AppEnv = "DEV" | "UAT" | "PROD";

const getEnv = (): AppEnv => {
  const raw = Deno.env.get("FT_APP_ENV")?.toUpperCase();
  if (raw === "PROD") return "PROD";
  if (raw === "UAT") return "UAT";
  return "DEV";
};

const env = getEnv();

// $HOME resolution
const homeDir = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";

/* Platform paths: XDG on Linux, env-paths on macOS/Windows */
interface AppPaths {
  config: string;
  data: string;
  cache: string;
}

const PATHS: AppPaths = await (async (): Promise<AppPaths> => {
  if (Deno.build.os === "linux") {
    // Dynamic import -- xdg-basedir is Linux-only
    const { xdgConfig, xdgData, xdgCache } = await import("npm:xdg-basedir@5");
    return {
      config: xdgConfig ?? `${homeDir}/.config`,
      data: xdgData ?? `${homeDir}/.local/share`,
      cache: xdgCache ?? `${homeDir}/.cache`,
    };
  }

  // macOS + Windows: env-paths handles OS-native locations
  const envPaths = (await import("npm:env-paths@4")).default;
  const p = envPaths("ft-pipeline", { suffix: "" });
  return {
    config: p.config,
    data: p.data,
    cache: p.cache,
  };
})();

const APP_NAME = "ft-pipeline";
const appConfigDir = `${PATHS.config}/${APP_NAME}`;
const appDataDir = `${PATHS.data}/${APP_NAME}`;
const appCacheDir = `${PATHS.cache}/${APP_NAME}`;

// ── Ensure directories exist ────────────────────────────────────
// Both xdg-basedir and env-paths only return path strings.
// Create app dirs on startup so downstream code can write without checks.
await Promise.all(
  [appConfigDir, appDataDir, appCacheDir].map((d) =>
    Deno.mkdir(d, { recursive: true }).catch(() => {})
  ),
);

export const BASES = Object.freeze({
  env,

  appConfigDir,
  appDataDir,
  appCacheDir,

  // Pipeline DB -- our canonical database
  pipelineDbPath: `${appConfigDir}/pipeline.db`,

  // Encrypted X session cookies
  cookiesPath: `${appConfigDir}/.sync-cookies.enc`,

  // Final generated output -- written directly to the wiki so the cron agent
  // can pick up new notes without an intermediary folder.
  // Subdirs: bookmarks/, categories/, domains/, entities/
  mdOutputDir: `${homeDir}/StoneVault/wiki`,

  // Bookmark classification results
  classificationResultsPath: `${appConfigDir}/classification-results.json`,

  // Pipeline logs
  logDir: `${appConfigDir}/logs`,

 // StoneVault is the actual vault location (symlinked from external drive).
  // ~/wiki -> StoneVault/wiki.
  clippingsBase: `${homeDir}/StoneVault/Clippings`,

  // Static API endpoints
  xtracticleBase: "https://xtracticle.com/api/thread",
  llmBase: "http://localhost:1234/v1",
  llmModel: "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf",
});
