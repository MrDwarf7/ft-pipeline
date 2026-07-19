import { assertEquals, assertThrows } from "@std/assert";
import { openDatabase } from "./db.ts";
import type { Database } from "./db.ts";

const schema = `
CREATE TABLE bookmarks (
  tweet_id TEXT PRIMARY KEY,
  text TEXT,
  media_count INTEGER DEFAULT 0,
  primary_type TEXT
);
`;

const withTempDb = (fn: (db: Database) => void): void => {
  const path = Deno.makeTempFileSync({ prefix: "ft-db-", suffix: ".db" });
  try {
    const db = openDatabase(path);
    db.exec(schema);
    fn(db);
  } finally {
    try {
      Deno.removeSync(path);
    } catch {
      /* ignore cleanup */
    }
  }
};

Deno.test("insert + select round-trip with bound values", () => {
  withTempDb((db) => {
    db.insert("bookmarks", {
      tweet_id: "111",
      text: "hello world",
      media_count: 2,
      primary_type: null,
    });
    const rows = db.select("bookmarks", {
      columns: ["tweet_id", "text", "media_count", "primary_type"],
      where: { tweet_id: "111" },
    });
    assertEquals(rows.length, 1);
    assertEquals(rows[0], {
      tweet_id: "111",
      text: "hello world",
      media_count: 2,
      primary_type: null,
    });
  });
});

Deno.test("select empty success returns []", () => {
  withTempDb((db) => {
    const rows = db.select("bookmarks", {
      columns: ["tweet_id"],
      where: { tweet_id: "missing" },
    });
    assertEquals(rows, []);
  });
});

Deno.test("selectOne returns null when no row", () => {
  withTempDb((db) => {
    const row = db.selectOne("bookmarks", {
      columns: ["tweet_id"],
      where: { tweet_id: "nope" },
    });
    assertEquals(row, null);
  });
});

Deno.test("upsert updates on conflict", () => {
  withTempDb((db) => {
    db.insert("bookmarks", {
      tweet_id: "222",
      text: "v1",
      media_count: 0,
      primary_type: null,
    });
    db.upsert(
      "bookmarks",
      {
        tweet_id: "222",
        text: "v2",
        media_count: 5,
        primary_type: "tool",
      },
      ["tweet_id"],
    );
    const row = db.selectOne("bookmarks", {
      columns: ["text", "media_count", "primary_type"],
      where: { tweet_id: "222" },
    });
    assertEquals(row, {
      text: "v2",
      media_count: 5,
      primary_type: "tool",
    });
  });
});

Deno.test("update sets columns with equality where", () => {
  withTempDb((db) => {
    db.insert("bookmarks", {
      tweet_id: "333",
      text: "before",
      media_count: 1,
      primary_type: null,
    });
    db.update(
      "bookmarks",
      { text: "after", primary_type: "news" },
      { tweet_id: "333" },
    );
    const row = db.selectOne("bookmarks", {
      columns: ["text", "primary_type"],
      where: { tweet_id: "333" },
    });
    assertEquals(row, { text: "after", primary_type: "news" });
  });
});

Deno.test("prepare run/all bind special strings and null", () => {
  withTempDb((db) => {
    db.prepare(
      "INSERT INTO bookmarks (tweet_id, text, media_count, primary_type) VALUES (?, ?, ?, ?)",
    ).run("444", "null", 0, null);
    db.prepare(
      "INSERT INTO bookmarks (tweet_id, text, media_count, primary_type) VALUES (?, ?, ?, ?)",
    ).run("445", "it's fine\nline2", 1, "tool");

    const nullWord = db.prepare(
      "SELECT text, primary_type FROM bookmarks WHERE tweet_id = ?",
    ).all<{ text: string; primary_type: string | null }>("444");
    assertEquals(nullWord, [{ text: "null", primary_type: null }]);

    const multi = db.prepare(
      "SELECT text FROM bookmarks WHERE tweet_id = ?",
    ).all<{ text: string }>("445");
    assertEquals(multi[0]?.text, "it's fine\nline2");
  });
});

Deno.test("bad SQL throws with stderr context", () => {
  withTempDb((db) => {
    assertThrows(
      () => db.exec("SELECT * FROM does_not_exist;"),
      Error,
      "sqlite3 error",
    );
    assertThrows(
      () => db.prepare("SELECT * FROM nope WHERE id = ?").all("x"),
      Error,
      "sqlite3 error",
    );
  });
});

Deno.test("JSON parse failure throws (never silent [])", () => {
  const binDir = Deno.makeTempDirSync({ prefix: "ft-fake-sqlite-" });
  const fakeBin = `${binDir}/sqlite3`;
  const dbPath = Deno.makeTempFileSync({ prefix: "ft-db-json-", suffix: ".db" });
  const priorPath = Deno.env.get("PATH") ?? "";
  try {
    Deno.writeTextFileSync(
      fakeBin,
      "#!/bin/sh\nprintf '%s\\n' 'NOT_VALID_JSON {{{'\nexit 0\n",
    );
    Deno.chmodSync(fakeBin, 0o755);
    Deno.env.set("PATH", `${binDir}:${priorPath}`);

    const db = openDatabase(dbPath);
    assertThrows(
      () => db.prepare("SELECT 1 AS n").all(),
      Error,
      "JSON parse failed",
    );
  } finally {
    Deno.env.set("PATH", priorPath);
    try {
      Deno.removeSync(fakeBin);
    } catch { /* ignore */ }
    try {
      Deno.removeSync(binDir);
    } catch { /* ignore */ }
    try {
      Deno.removeSync(dbPath);
    } catch { /* ignore */ }
  }
});

Deno.test("transaction commits multiple writes", () => {
  withTempDb((db) => {
    db.transaction((tx) => {
      tx.insert("bookmarks", {
        tweet_id: "t1",
        text: "a",
        media_count: 0,
        primary_type: null,
      });
      tx.insert("bookmarks", {
        tweet_id: "t2",
        text: "b",
        media_count: 1,
        primary_type: null,
      });
    });
    const rows = db.select("bookmarks", {
      columns: ["tweet_id"],
      orderBy: "tweet_id",
    });
    assertEquals(rows.map((r) => r.tweet_id), ["t1", "t2"]);
  });
});

Deno.test("transaction discards writes when fn throws", () => {
  withTempDb((db) => {
    assertThrows(
      () => {
        db.transaction((tx) => {
          tx.insert("bookmarks", {
            tweet_id: "x1",
            text: "a",
            media_count: 0,
            primary_type: null,
          });
          throw new Error("boom");
        });
      },
      Error,
      "boom",
    );
    assertEquals(db.select("bookmarks", { columns: ["tweet_id"] }), []);
  });
});

Deno.test("reject invalid identifiers in helpers", () => {
  withTempDb((db) => {
    assertThrows(
      () => db.insert("bookmarks; drop", { tweet_id: "1" }),
      Error,
      "invalid SQL identifier",
    );
    assertThrows(
      () =>
        db.select("bookmarks", {
          columns: ["tweet_id; --"],
        }),
      Error,
      "invalid SQL identifier",
    );
  });
});
