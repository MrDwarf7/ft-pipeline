/** DEAD CODE -- kept for reference. Pipeline no longer shells out to fieldtheory-cli. */
export const runFtCommand = (): Promise<never> => {
  throw new Error(
    "runFtCommand is dead code. The pipeline no longer shells out to fieldtheory-cli. " +
      "See the giant comment at the top of src/utils/ft-cli.ts for context.",
  );
};
