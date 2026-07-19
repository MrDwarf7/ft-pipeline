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

/** stdout helper -- config cannot import logger (logger imports CONFIG). */
const writeOut = (line: string): void => {
  Deno.stdout.writeSync(new TextEncoder().encode(`${line}\n`));
};

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
  /** Total HTTP attempts for X / xtracticle / LLM (not "retries after first"). */
  maxExternalCallAttempts: z.number().int().min(1),
  retryBaseMs: z.number().int().nonnegative(),
  classificationBatchSize: z.number().int().positive(),
  clippingDirs: z.object({
    articles: z.string().min(1),
    posts: z.string().min(1),
    media: z.string().min(1),
  }),
});

export type Config = z.infer<typeof configSchema>;

/** One legacy key rename still accepted at load time until the file is rewritten. */
export interface ConfigKeyRename {
  readonly from: string;
  readonly to: string;
  /** Map the old value into the new key's domain. */
  readonly mapValue: (value: unknown) => unknown;
}

/**
 * Ordered renames for on-disk config.jsonc.
 * Load path still accepts legacy keys; migrate rewrites the file.
 */
export const CONFIG_KEY_RENAMES: readonly ConfigKeyRename[] = [
  {
    from: "maxRetries",
    to: "maxExternalCallAttempts",
    mapValue: (value: unknown): unknown =>
      typeof value === "number" && Number.isFinite(value) ? Math.max(1, value) : value,
  },
];

/** A pending file rewrite: old key still present on disk. */
export interface PendingConfigMigration {
  readonly from: string;
  readonly to: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

/** Apply rename rules to a plain object; pure (does not touch disk). */
export const applyConfigKeyRenames = (
  raw: Record<string, unknown>,
  renames: readonly ConfigKeyRename[],
): {
  readonly next: Record<string, unknown>;
  readonly applied: readonly PendingConfigMigration[];
} => {
  const next: Record<string, unknown> = { ...raw };
  const applied = renames.flatMap((rule): PendingConfigMigration[] => {
    if (!(rule.from in next)) return [];
    const oldValue = next[rule.from];
    const mapped = rule.mapValue(oldValue);
    const newValue = rule.to in next ? next[rule.to] : mapped;
    if (!(rule.to in next)) {
      next[rule.to] = mapped;
    }
    delete next[rule.from];
    return [{ from: rule.from, to: rule.to, oldValue, newValue }];
  });
  return { next, applied };
};

/** Map a parsed config object; rewrite legacy keys into Partial<Config> fields. */
const normalizeFilePartial = (raw: unknown): Partial<Config> => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const { next } = applyConfigKeyRenames(
    { ...(raw as Record<string, unknown>) },
    CONFIG_KEY_RENAMES,
  );
  return next as Partial<Config>;
};

/** Read config.jsonc root object, or null if the file is missing. */
const readConfigFileObject = (): Record<string, unknown> | null => {
  let text: string;
  try {
    text = Deno.readTextFileSync(CONFIG_FILE);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;
    throw err;
  }
  const parsed = parseJsonc(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid config file ${CONFIG_FILE}: root must be an object`);
  }
  return { ...(parsed as Record<string, unknown>) };
};

/** Legacy keys still present on disk (silent load mapping is not enough to clean the file). */
export const listPendingConfigMigrations = (): readonly PendingConfigMigration[] => {
  const obj = readConfigFileObject();
  if (obj === null) return [];
  return applyConfigKeyRenames(obj, CONFIG_KEY_RENAMES).applied;
};

/**
 * Rewrite config.jsonc applying all pending key renames.
 * Returns applied renames (empty if nothing to do or no file).
 */
export const migrateConfigFile = (): {
  readonly applied: readonly PendingConfigMigration[];
  readonly path: string;
} => {
  const obj = readConfigFileObject();
  if (obj === null) {
    throw new Error(
      `No config file at ${CONFIG_FILE}; run: ft-pipeline config init`,
    );
  }
  const { next, applied } = applyConfigKeyRenames(obj, CONFIG_KEY_RENAMES);
  if (applied.length === 0) {
    return { applied: [], path: CONFIG_FILE };
  }
  const cfg = configSchema.parse(mergeFile(normalizeFilePartial(next)));
  writeConfigFile(cfg);
  return { applied, path: CONFIG_FILE };
};

/**
 * If stdin/stdout are TTYs and the on-disk file still has legacy keys, ask once
 * whether to rewrite the file. Non-interactive runs skip (legacy keys still load).
 */
export const promptConfigMigrationIfNeeded = (): void => {
  if (Deno.env.get("FT_NO_CONFIG_MIGRATE_PROMPT") === "1") return;
  if (!Deno.stdin.isTerminal() || !Deno.stdout.isTerminal()) return;

  const pending = listPendingConfigMigrations();
  if (pending.length === 0) return;

  pending.forEach((p) => {
    writeOut(`${p.to} changed from ${p.from} -> ${p.to}`);
  });

  const answer = prompt("would you like to migrate it now? [Y/n]");
  if (answer === null) return;
  const trimmed = answer.trim().toLowerCase();
  const yes = trimmed === "" || trimmed === "y" || trimmed === "yes";
  if (!yes) {
    writeOut(
      "config migrate skipped (legacy keys still accepted until rewritten)",
    );
    return;
  }

  const { applied, path } = migrateConfigFile();
  writeOut(
    `migrated ${applied.length} key(s) in ${path}: ${
      applied.map((a) => `${a.from} -> ${a.to}`).join(", ")
    }`,
  );
};

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
  maxExternalCallAttempts: 4,
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

  const merged = mergeFile(normalizeFilePartial(parsed));
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
  return configSchema.parse(mergeFile(normalizeFilePartial(parseJsonc(raw))));
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
