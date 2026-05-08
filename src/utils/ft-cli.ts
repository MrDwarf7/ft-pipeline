// utils/ft-cli.ts -- Run pnpm commands in the fieldtheory-cli directory
import { CONFIG } from "../config.ts";

export const runFtCommand = async (args: string[]): Promise<Deno.CommandOutput> => {
  return await new Deno.Command("pnpm", {
    args,
    cwd: CONFIG.ftCliDir,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      CI: "true",
      PNPM_CONFIRM_MODULES_PURGE: "false",
    },
  }).output();
};
