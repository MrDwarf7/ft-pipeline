/** All paths and settings in one place.
 *
 * Configuration resolution order (highest wins):
 *   1. FT_* environment variables (per-field overrides)
 *   2. standalone config file at <appConfigDir>/config.jsonc
 *   3. computed BASES defaults (XDG/env-derived)
 *
 * The config file is generated on first run with `CONFIG` defaults. Edit it
 * directly, or use `ft-pipeline config set <key> <value>`. Validation runs on
 * every load via zod, so a malformed file fails fast with the offending line.
 */
import { parse as parseJsonc } from "@std/jsonc";
import { z } from "zod";
import { BASES } from "./utils/bases.ts";
import { envOrFallback } from "./utils/env.ts";

const CONFIG_FILE = `${BASES.appConfigDir}/config.jsonc`;

/** Pure config schema -- no paths, no code. This is the serialization contract. */
const configSchema = z.object({
  pipelineDbPath: z.string().min(1),
  cookiesPath: z.string().min(1),
  mdOutputDir: z.string().min(1),
  clippingsBase: z.string().min(1),
  classificationResultsPath: z.string().min(1),
  logDir: z.string().min(1),
  xtracticleBase: z.string().min(1),
  llmBase: z.string().min(1),
  llmModel: z.string().min(1),
  maxLogFiles: z.number().int().positive(),
  syncDelayMs: z.number().int().nonnegative(),
  extractDelayMs: z.number().int().nonnegative(),
  extractJitterMs: z.number().int().nonnegative(),
  minPostTextLength: z.number().int().positive(),
  maxRetries: z.number().int().nonnegative(),
  retryBaseMs: z.number().int().nonnegative(),
  classificationBatchSize: z.number().int().positive(),
  clippingDirs: z.object({
    articles: z.string().min(1),
    posts: z.string().min(1),
    media: z.string().min(1),
  }),
});

export type Config = z.infer<typeof configSchema>;

/** Computed defaults -- the seed for the config file and the floor for resolution. */
const DEFAULTS: Config = {
  pipelineDbPath: BASES.pipelineDbPath,
  cookiesPath: BASES.cookiesPath,
  mdOutputDir: BASES.mdOutputDir,
  clippingsBase: BASES.clippingsBase,
  classificationResultsPath: BASES.classificationResultsPath,
  logDir: BASES.logDir,
  xtracticleBase: BASES.xtracticleBase,
  llmBase: BASES.llmBase,
  llmModel: BASES.llmModel,
  maxLogFiles: Number(Deno.env.get("FT_MAX_LOG_FILES")) || 100,
  syncDelayMs: 600,
  extractDelayMs: 750,
  extractJitterMs: 400,
  minPostTextLength: 200,
  maxRetries: 3,
  retryBaseMs: 2000,
  classificationBatchSize: 50,
  clippingDirs: {
    articles: "X-Articles",
    posts: "X-Posts",
    media: "X-Media",
  },
};

const withFallback = <T>(value: T | null | undefined, fallback: T): T =>
  value === null || value === undefined ? fallback : value;

/** Override computed defaults with any values present in the standalone file. */
const mergeFile = (file: Partial<Config> | null): Config => ({
  ...DEFAULTS,
  ...file,
  clippingDirs: { ...DEFAULTS.clippingDirs, ...(file?.clippingDirs ?? {}) },
});

/** FT_* env vars are the final, highest-precedence override layer. */
const applyEnvOverrides = (cfg: Config): Config => ({
  ...cfg,
  pipelineDbPath: envOrFallback("FT_PIPELINE_DB_PATH", cfg.pipelineDbPath),
  cookiesPath: envOrFallback("FT_COOKIES_PATH", cfg.cookiesPath),
  mdOutputDir: envOrFallback("FT_MARKDOWN_DIR", cfg.mdOutputDir),
  clippingsBase: envOrFallback("FT_CLIPPINGS_BASE", cfg.clippingsBase),
});

const loadConfig = (): Config => {
  let raw: string;
  try {
    raw = Deno.readTextFileSync(CONFIG_FILE);
  } catch (err) {
    /* Missing file is the only intentional default path; anything else fails loud. */
    if (err instanceof Deno.errors.NotFound) {
      return Object.freeze(applyEnvOverrides(DEFAULTS));
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = parseJsonc(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid config file ${CONFIG_FILE}: ${msg}`);
  }

  const merged = mergeFile((parsed as Partial<Config>) ?? {});
  const result = configSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config values in ${CONFIG_FILE}:\n${issues}`);
  }
  return Object.freeze(applyEnvOverrides(result.data));
};

export const CONFIG: Config = loadConfig();

/** Header lines written above the JSONC body of config.jsonc. */
const jsoncHeader =
  '// ft-pipeline configuration\n// Precedence: FT_* env vars > this file > built-in defaults\n// Run "ft-pipeline config show" to see effective values.\n\n';

/** Absolute path to the standalone config.jsonc file. */
export const configFilePath = (): string => CONFIG_FILE;

/** Serialize config as JSONC with the standard header (no env overrides baked in). */
export const serializeConfig = (cfg: Config): string =>
  `${jsoncHeader}${JSON.stringify(cfg, null, 2)}\n`;

/** Write config to disk under the app config directory. */
export const writeConfigFile = (cfg: Config): void => {
  Deno.mkdirSync(BASES.appConfigDir, { recursive: true });
  Deno.writeTextFileSync(CONFIG_FILE, serializeConfig(cfg));
};

/** Read and validate config.jsonc from disk. */
export const readConfigFile = (): Config => {
  const raw = Deno.readTextFileSync(CONFIG_FILE);
  return configSchema.parse(mergeFile(parseJsonc(raw) as Partial<Config>));
};

/** Load config from disk, or return built-in defaults only when the file is missing.
 *  Invalid JSONC / schema failures rethrow -- never hide corrupt config as defaults.
 */
export const loadConfigFileOrDefault = (): Config =>
  withFallback(
    (() => {
      try {
        return readConfigFile();
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) return null;
        throw err;
      }
    })(),
    DEFAULTS,
  );

/** Seed config.jsonc with computed defaults. */
export const writeConfigFileDefault = (): void => writeConfigFile(DEFAULTS);

/* Retired: ftDbPath, bookmarksJsonl, ftCliDir -- from old fieldtheory-cli DB */

/** Classification type labels. */
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

/** Classification domain labels. */
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
