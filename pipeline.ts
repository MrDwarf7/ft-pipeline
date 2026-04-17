// pipeline.ts -- Pipeline composition and full run orchestration

import { Args, getPassword } from "./types.ts";
import { runSync } from "./commands/sync.ts";
import { runExtract } from "./commands/extract.ts";
import { runClassify } from "./commands/classify.ts";
import { runGenerate } from "./commands/generate.ts";
import { runIndexes } from "./commands/indexes.ts";
import { createOpenAICompat } from "./llm/index.ts";
import { CONFIG } from "./config.ts";
import { logger } from "./utils/logger.ts";

const llm = createOpenAICompat({
  baseUrl: CONFIG.llmBase,
  model: CONFIG.llmModel,
});

export const pipeline = {
  sync: (args: Args) => () =>
    runSync(getPassword(args), {
      maxPages: args["max-pages"] ? Number(args["max-pages"]) : undefined,
      targetAdds: args["target-adds"] ? Number(args["target-adds"]) : undefined,
      maxMinutes: args["max-minutes"] ? Number(args["max-minutes"]) : undefined,
      rebuild: args.rebuild,
      continue: args.continue,
      gaps: args.gaps,
    }),

  extract: (args: Args) => () =>
    runExtract({
      dryRun: args["dry-run"],
      limit: args.limit ? Number(args.limit) : undefined,
      skipExisting: args["skip-existing"],
    }),

  classify: (args: Args) => async () => {
    const connected = await llm.check();
    return runClassify(connected, {
      dryRun: args["dry-run"],
      limit: args.limit ? Number(args.limit) : undefined,
    });
  },

  generate: () => () => runGenerate(),
  indexes: () => () => runIndexes(),
};

export const runFull = async (args: Args) => {
  const stepList = [
    ["Sync", pipeline.sync(args)],
    ["Extract", pipeline.extract(args)],
    ["Classify", pipeline.classify(args)],
    ["Generate", pipeline.generate()],
    ["Indexes", pipeline.indexes()],
  ] as const;

  await stepList.reduce(
    (chain, [name, fn], index) =>
      chain.then(async () => {
        logger.info("pipeline step", { step: name, index: index + 1, total: stepList.length });
        await fn();
      }),
    Promise.resolve(),
  );

  logger.info("pipeline complete");
};
