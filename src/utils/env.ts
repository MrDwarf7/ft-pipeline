// utils/env.ts -- Required environment variable checker + .env loader
//
// assertEnvVars loads .env from the project root (if it exists) on first
// call, setting any vars that aren't already in Deno.env. Then throws if
// any required vars are still missing.

const PROJECT_ROOT = new URL("../..", import.meta.url).pathname;

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

  try {
    const vars = parseEnvFile(Deno.readTextFileSync(`${PROJECT_ROOT}.env`));
    Object.entries(vars).forEach(([k, v]) => Deno.env.set(k, v));
    dotenvLoaded = true;
  } catch {
    // No .env file — vars must come from the actual environment
  }
};

export const assertEnvVars = (required: string[]): void => {
  loadDotEnv();

  const missing = required.filter((name) => !Deno.env.get(name));

  if (missing.length === 0) return;

  const list = missing.map((n) => `  - ${n}`).join("\n");
  throw new Error(
    `Missing required environment variable(s):\n${list}\n\n` +
      `Set these in your environment or add them to ${PROJECT_ROOT}.env`,
  );
};
