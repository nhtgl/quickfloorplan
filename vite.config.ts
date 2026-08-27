import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      // The package's `main` is a UMD bundle that expects a jsPDF global, which breaks
      // under Node. Point everything at the ES build the browser already gets, so the
      // tests exercise the same code path as production.
      "svg2pdf.js": "svg2pdf.js/dist/svg2pdf.es.min.js",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
