import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";
import { DEMO_RESET_AT_MB } from "../config/env.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(dir, "schema.sql"), "utf8");

const ATTEMPTS = 10;

// The write-ahead log can take 1 GB by itself, which is all the disk a free database has. A demo
// table that gets wiped anyway skips it (UNLOGGED: emptied if Postgres crashes). Real logs never do.
const setDurability = async () => {
  const { rows } = await pool.query("SELECT relpersistence FROM pg_class WHERE oid = 'logs'::regclass");
  const unlogged = rows[0].relpersistence === "u";
  const disposable = DEMO_RESET_AT_MB > 0;
  if (unlogged !== disposable) await pool.query(`ALTER TABLE logs SET ${disposable ? "UNLOGGED" : "LOGGED"}`);
};

// On a host, this runs at every start, possibly while the database is still coming up.
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  try {
    await pool.query(sql);
    await setDurability();
    console.log("Database schema is ready.");
    break;
  } catch (err) {
    console.error(`Schema setup failed (attempt ${attempt}/${ATTEMPTS}):`, err.message);
    if (attempt === ATTEMPTS) process.exitCode = 1;
    else await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
await pool.end();
