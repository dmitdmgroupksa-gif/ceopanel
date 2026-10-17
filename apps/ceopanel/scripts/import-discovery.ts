import "./env"
import { readFile, writeFile } from "node:fs/promises"
import { parseConfig, platformConfig } from "../lib/platform/config"
import { draftFromDiscovery } from "../lib/platform/discovery"

try {
  const [input, ...extra] = process.argv.slice(2)
  if (!input || extra.length) throw new Error("Usage")
  const config = process.env.PLATFORM_CONFIG_PATH
    ? platformConfig()
    : parseConfig(
        JSON.parse(
          await readFile(
            new URL("../platform.config.example.json", import.meta.url),
            "utf8",
          ),
        ),
      )
  const { draft, warnings } = draftFromDiscovery(
    config,
    JSON.parse(await readFile(input, "utf8")),
  )
  await writeFile(
    new URL("../platform.config.draft.json", import.meta.url),
    JSON.stringify({ ...draft, discoveryReview: { warnings } }, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  )
  console.log(
    "Created platform.config.draft.json with discovered fields. All activation flags remain disabled.",
  )
  console.log(
    `${warnings.length} mapping items need review. Review scope, roles, AI fields, reports and workflows using STAGING.md.`,
  )
} catch {
  console.error(
    "Discovery import failed. Supply one exported inventory JSON path, check its schema, and preserve or move an existing draft before retrying.",
  )
  process.exitCode = 1
}
