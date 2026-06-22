import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    watch: {
      ignored: ["**/.env", "**/.env.*"],
    },
    fs: { allow: [".."] },
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/storage": "http://127.0.0.1:8787",
    },
  },
});

await server.listen();
server.printUrls();
