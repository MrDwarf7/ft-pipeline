// sqlite_test.ts -- Quick sanity check for @db/sqlite (Deno FFI)
// deno run --allow-all src/sqlite_test.ts

import { Database } from "@db/sqlite";

const db = new Database(":memory:");
db.exec("CREATE TABLE test(id INTEGER, name TEXT)");
db.exec("INSERT INTO test VALUES(?, ?)", [1, "foo"]);
db.exec("INSERT INTO test VALUES(?, ?)", [2, "bar"]);

// deno-lint-ignore no-console
console.log(
  "columns:",
  db.prepare("SELECT * FROM test ORDER BY id").columnNames(),
);
// deno-lint-ignore no-console
console.log(
  "all():",
  JSON.stringify(db.prepare("SELECT * FROM test ORDER BY id").all()),
);
db.prepare("SELECT * FROM test ORDER BY id").finalize();

// deno-lint-ignore no-console
console.log("Deno SQLite test passed!");
