/** Required env var checker + .env loader. Loads .env at module init before CONFIG. */

import * as path from "@std/path";

export const envOrFallback = (key: string, fallback: string): string =>
  Deno.env.get(key) ?? fallback;

const getEnvHome = (): string => {
  const ftHome = Deno.env.get("FT_PIPELINE_HOME");
  if (ftHome) return ftHome;

  const appEnv = Deno.env.get("FT_APP_ENV")?.toUpperCase();
  return appEnv === "PROD" ? path.dirname(Deno.execPath()) : Deno.cwd();
};

const parseEnvFile = (content: string): Record<string, string> =>
  content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce(
      (acc, line) => {
        const eqIdx = line.indexOf("=");
        if (eqIdx < 0) return acc;
        const key = line.slice(0, eqIdx).trim();
        const raw = line.slice(eqIdx + 1).trim();
        const value = raw.replace(/^["']|["']$/g, "");
        return { ...acc, [key]: value };
      },
      {} as Record<string, string>,
    );

let dotenvLoaded = false;

const loadDotEnv = (): void => {
  if (dotenvLoaded) return;

  const envHome = getEnvHome();
  try {
    const vars = parseEnvFile(Deno.readTextFileSync(`${envHome}/.env`));
    Object.entries(vars).forEach(([k, v]) => Deno.env.set(k, v));
    dotenvLoaded = true;
  } catch {
    // No .env file -- vars must come from the actual environment
  }
};

// Load .env at module load time -- before CONFIG is evaluated
loadDotEnv();

export const assertEnvVars = (required: string[]): void => {
  const missing = required.filter((name) => !Deno.env.get(name));

  if (missing.length === 0) return;

  const list = missing.map((n) => `  - ${n}`).join("\n");
  const envHome = getEnvHome();
  throw new Error(
    `Missing required environment variable(s):\n${list}\n\n` +
      `Set these in your environment or add them to ${envHome}/.env`,
  );
};
