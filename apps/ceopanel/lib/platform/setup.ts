import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export async function initializeStaging(directory: string) {
  const example = await readFile(path.join(directory, ".env.example"), "utf8")
  const environment = example
    .replace(/^ERPNEXT_URL=.*$/m, "ERPNEXT_URL=https://staging.invalid")
    .replace(
      /^PLATFORM_CONFIG_PATH=.*$/m,
      "PLATFORM_CONFIG_PATH=platform.config.json",
    )
    .replace(
      /^ERPNEXT_RECEIPT_SECRET=.*$/m,
      `ERPNEXT_RECEIPT_SECRET=${randomBytes(32).toString("hex")}`,
    )
    .replace(
      /^MCP_AUTH_SECRET=.*$/m,
      `MCP_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
    )
  const configuration = await readFile(
    path.join(directory, "platform.config.example.json"),
    "utf8",
  )
  const results: { file: string; state: "created" | "preserved" }[] = []
  for (const [file, content] of [
    [".env.local", environment],
    ["platform.config.json", configuration],
  ]) {
    try {
      await writeFile(path.join(directory, file), content, {
        flag: "wx",
        mode: 0o600,
      })
      results.push({ file, state: "created" })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      results.push({ file, state: "preserved" })
    }
  }
  return results
}
