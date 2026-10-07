import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The bot is a separate package with its own runner (npm test in
    // discord-attendance-bot via tsx --test); don't collect its tests here.
    exclude: ["**/node_modules/**", "**/dist/**", "discord-attendance-bot/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
