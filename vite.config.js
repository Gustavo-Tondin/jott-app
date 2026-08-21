import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The whole suite talks to ONE fake bridge (src/lib/test/bridge.js). Aliasing
// it here rather than leaving a `vi.mock` in each test file is what makes that
// true: a new test cannot forget the mock, and cannot invent a second shape of
// it. Only under VITEST — the real modules ship to the app untouched.
const bridgeStub = fileURLToPath(new URL("./src/lib/test/bridge.js", import.meta.url));

// Tauri expects a fixed port and fails if it is not available.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  // Under vitest, Svelte must resolve to its browser build — the server one
  // has no `mount()`, so every component test would fail to render.
  resolve: process.env.VITEST
    ? {
        conditions: ["browser"],
        alias: {
          "@tauri-apps/api/core": bridgeStub,
          "@tauri-apps/api/event": bridgeStub,
          "@tauri-apps/api/window": bridgeStub,
        },
      }
    : {},
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
