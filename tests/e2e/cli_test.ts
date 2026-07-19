import { assertEquals } from "@std/assert";

const projectRoot = new URL("../..", import.meta.url).pathname;

const runCli = async (args: string[], env: Record<string, string>): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "src/main.ts", ...args],
    cwd: projectRoot,
    env: { ...Deno.env.toObject(), ...env },
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
};

Deno.test({
  name: "e2e: migrate creates bookmarks table in temp db",
  permissions: { read: true, write: true, env: true, run: true },
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: "ft-pipeline-e2e-" });
    const dbPath = `${dir}/pipeline.db`;
    try {
      const { code, stderr } = await runCli(["migrate"], {
        FT_PIPELINE_DB_PATH: dbPath,
        FT_NO_HOUSEKEEPING: "1",
      });
      assertEquals(code, 0, `migrate failed: ${stderr}`);

      const tables = new Deno.Command("sqlite3", {
        args: [dbPath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"],
        stdout: "piped",
      }).outputSync();
      const out = new TextDecoder().decode(tables.stdout);
      assertEquals(out.includes("bookmarks"), true);
      assertEquals(out.includes("migration_runs"), true);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "e2e: help prints usage",
  permissions: { read: true, write: true, env: true, run: true },
  async fn() {
    const { code, stdout } = await runCli(["--help"], {
      FT_NO_HOUSEKEEPING: "1",
    });
    assertEquals(code, 0);
    assertEquals(stdout.includes("ft-pipeline"), true);
    assertEquals(stdout.includes("migrate"), true);
  },
});

Deno.test({
  name: "e2e: config show prints effective JSON keys",
  permissions: { read: true, write: true, env: true, run: true },
  async fn() {
    const { code, stdout, stderr } = await runCli(["config", "show"], {
      FT_NO_HOUSEKEEPING: "1",
    });
    assertEquals(code, 0, `config show failed: ${stderr}`);
    assertEquals(stdout.includes("pipelineDbPath"), true);
    assertEquals(stdout.includes("minPostTextLength"), true);
    assertEquals(stdout.includes("clippingDirs"), true);
  },
});

Deno.test({
  name: "e2e: config file prints a path string",
  permissions: { read: true, write: true, env: true, run: true },
  async fn() {
    const { code, stdout, stderr } = await runCli(["config", "file"], {
      FT_NO_HOUSEKEEPING: "1",
    });
    assertEquals(code, 0, `config file failed: ${stderr}`);
    assertEquals(stdout.includes("config.jsonc"), true);
  },
});
