# Sync & Generate Refactor -- Historical Note

**Date:** 2026-05-05 (intermediate step)

Sync and generate no longer use runFtCommand(). Current: src/extraction/graphql.ts and
src/commands/generate.ts.

---

## Archived detail

Refactored `sync.ts` and `generate.ts` to extract the hardcoded `ftDir` path into config and create
a reusable helper for shelling out to pnpm commands in the fieldtheory-cli directory.

## Changes

### 1. Config Update (`src/config.ts`)

Added `ftCliDir` to `CONFIG` using the existing `envOrFallback` pattern:

```typescript
ftCliDir: envOrFallback(
  "FT_CLI_DIR",
  `${Deno.env.get("HOME")}/Documents/GitHub_Projects/JavaScript/fieldtheory-cli`,
),
```

Now supports `FT_CLI_DIR` env var override with fallback to the original hardcoded path.

### 2. New Helper (`src/utils/ft-cli.ts`)

```typescript
export const runFtCommand = async (
  args: string[],
): Promise<Deno.CommandOutput> => {
  return await new Deno.Command("pnpm", {
    args,
    cwd: CONFIG.ftCliDir,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
};
```

### 3. Updated Commands

**`src/commands/sync.ts`:**

- Removed hardcoded `ftDir` and inline `Deno.Command("pnpm", ...)`
- Now uses `runFtCommand(args)` with args built from sync options

**`src/commands/generate.ts`:**

- Removed hardcoded `ftDir` and inline `Deno.Command("pnpm", ...)`
- Now uses `runFtCommand(["start", "md", "--force"])`

## API / Usage

The `FT_CLI_DIR` env var can be set to override the fieldtheory-cli directory:

```bash
export FT_CLI_DIR="/custom/path/to/fieldtheory-cli"
```

If not set, falls back to `~/Documents/GitHub_Projects/JavaScript/fieldtheory-cli`.

## Benefits

- No more duplicated `Deno.Command("pnpm", ...)` boilerplate
- Single source of truth for fieldtheory-cli directory
- Env var override for different environments (sandboxed, CI, etc.)
- Cleaner command files
