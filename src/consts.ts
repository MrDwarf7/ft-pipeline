/** App identity. Derives the binary name from deno.json so it stays in sync
 *  with the build target (e.g. @mrdwarf7/ft-pipeline -> ft-pipeline).
 */
import manifest from "../deno.json" with { type: "json" };

const name = typeof manifest.name === "string" ? manifest.name : "ft-pipeline";

export const APP_NAME: string = name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name;
