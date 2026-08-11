import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri expects a fixed port and fails if it is not available.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  // Under vitest, Svelte must resolve to its browser build — the server one
  // has no `mount()`, so every component test would fail to render.
  resolve: process.env.VITEST ? { conditions: ["browser"] } : {},
  test: {
    // The screens are driven through a mocked bridge: these tests check the
    // UI calls the right command with the right arguments, not that the core
    // works — that is covered in Rust.
    environment: "jsdom",
    include: ["src/**/*.test.js"],
    globals: true,
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Rust sources are rebuilt by cargo, not by vite.
      ignored: ["**/src-tauri/**"],
    },
  },
});
