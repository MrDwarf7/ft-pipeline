/** Shared fixture loader for integration tests under tests/fixtures/. */

import { dirname, fromFileUrl, join } from "@std/path";

const fixturesRoot = join(dirname(fromFileUrl(import.meta.url)));

/** Read and JSON.parse a fixture relative to tests/fixtures/. */
export const loadFixture = async (relativePath: string): Promise<unknown> => {
  const raw = await Deno.readTextFile(join(fixturesRoot, relativePath));
  return JSON.parse(raw);
};

/** Absolute path to a fixture file (for callers that need the path itself). */
export const fixturePath = (relativePath: string): string => join(fixturesRoot, relativePath);
