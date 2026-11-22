import app from "./app.js";
import { PORT } from "./config/env.js";
import { pool } from "./db/client.js";

const server = app.listen(PORT, () => {
  console.log(`LogForge running on http://localhost:${PORT}`);
});

const shutdown = () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
