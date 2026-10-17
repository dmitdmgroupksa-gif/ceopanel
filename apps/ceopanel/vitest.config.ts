import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["lib/**/*.test.ts"],
    // PDF workers and MCP imports are memory-heavy; keep local/CI runs bounded.
    maxWorkers: 2,
  },
})
