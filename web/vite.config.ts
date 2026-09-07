import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev server proxies API + Socket.IO to the backend (npm run dev -w server).
// Set PLANNER_API to point at a backend running on a different port.
const apiTarget = process.env.PLANNER_API ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Listen on all interfaces: this is a LAN app (phones/tablets join from
    // other devices on the home network, DESIGN.md "Live 2-device sync").
    host: true,
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/socket.io": {
        target: apiTarget,
        ws: true,
      },
    },
  },
});