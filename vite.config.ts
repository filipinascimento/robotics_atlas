import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Bundle the Helios source entry so Vite emits portable worker URLs.
  // The distributed renderer otherwise requests workers from /assets/.
  resolve: {
    alias: {
      "helios-web": fileURLToPath(
        new URL("./node_modules/helios-web/src/index.js", import.meta.url),
      ),
    },
  },
  optimizeDeps: { exclude: ["helios-web", "helios-network"] },
  base: "./",
});
