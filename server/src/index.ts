import http from "node:http";
import { createApp } from "./app.js";
import { createRealtimeServer } from "./realtime.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();
const server = http.createServer(app);
createRealtimeServer(server);

server.listen(PORT, () => {
  console.log(`planner listening on :${PORT}`);
});