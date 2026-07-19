/** App identity. Derives the binary name from deno.json so it stays in sync
 *  with the build target (e.g. @mrdwarf7/ft-pipeline -> ft-pipeline). */

import { parse as parseJsonc } from "@std/jsonc";

const manifest = parseJsonc(
  Deno.readTextFileSync(new URL("../deno.json", import.meta.url)),
) as { name?: string };

const name = manifest.name ?? "ft-pipeline";

export const APP_NAME: string = name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name;
