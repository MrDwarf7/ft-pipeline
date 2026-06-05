// ──┬────────────────────────────────────────────────────────────────────
//   │  ft-cli.ts -- (DEAD CODE — kept for reference only)
//   │
//   │  ╔══════════════════════════════════════════════════════════════╗
//   │  ║  THIS FILE IS DEAD CODE                                     ║
//   │  ╠══════════════════════════════════════════════════════════════╣
//   │  ║  The pipeline no longer shells out to fieldtheory-cli.      ║
//   │  ║  The only consumer was generate.ts, which now crashes       ║
//   │  ║  explicitly with a "not implemented" error.                 ║
//   │  ║                                                            ║
//   │  ║  When generate is rewritten to read from pipeline.db        ║
//   │  ║  directly (no shell-out), this file AND the entire          ║
//   │  ║  `ft-cli.ts` module should be removed.                     ║
//   │  ║                                                            ║
//   │  ║  For now it's kept so we don't lose the reference           ║
//   │  ║  implementation, but it IS NOT CALLED by any active step.   ║
//   │  ╚══════════════════════════════════════════════════════════════╝
//   │
//   │  Old behaviour (removed):
//   │    import { CONFIG } from "../config.ts";
//   │    export const runFtCommand = async (args: string[]) => {
//   │      return await new Deno.Command("pnpm", {
//   │        args, cwd: CONFIG.ftCliDir, ...
//   │      }).output();
//   │    };
//   ──┴────────────────────────────────────────────────────────────────────
export const runFtCommand = (): Promise<never> => {
  throw new Error(
    "runFtCommand is dead code. The pipeline no longer shells out to fieldtheory-cli. " +
      "See the giant comment at the top of src/utils/ft-cli.ts for context.",
  );
};
