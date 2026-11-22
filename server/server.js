import app from "./app.js";
import { PORT, PUBLIC_DEMO } from "./config/env.js";
import { pool } from "./db/client.js";
import { closeStreams } from "./modules/logs/log.stream.js";
import { startPublicDemo } from "./modules/demo/publicDemo.js";

const server = app.listen(PORT, () => {
  console.log(`LogForge running on http://localhost:${PORT}`);
  if (PUBLIC_DEMO) startPublicDemo();
});

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  // Live tails never end by themselves, and server.close() waits for every connection.
  closeStreams();
  setTimeout(() => server.closeAllConnections(), 5000).unref();
  setTimeout(() => process.exit(0), 15000).unref();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
