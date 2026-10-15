import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const root = path.dirname(fileURLToPath(import.meta.url))
const config: NextConfig = {
  output: "standalone",
  devIndicators: false,
  serverExternalPackages: ["bullmq", "pg", "pdf-parse", "exceljs"],
  outputFileTracingRoot: root,
  turbopack: { root },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/mcp/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ]
  },
}
export default config
