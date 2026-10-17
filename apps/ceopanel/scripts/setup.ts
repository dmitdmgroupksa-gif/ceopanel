import { fileURLToPath } from "node:url"
import { initializeStaging } from "../lib/platform/setup"

try {
  for (const result of await initializeStaging(
    fileURLToPath(new URL("..", import.meta.url)),
  ))
    console.log(`${result.state}: ${result.file}`)
  console.log(
    "Set the staging ERP URL and exact Company in .env.local, then run npm run platform:check.",
  )
  console.log(
    "Existing files are preserved. Reads, writes, AI and external clients remain disabled in newly created configuration.",
  )
} catch {
  console.error(
    "Staging setup could not prepare local files. Check directory permissions and example files.",
  )
  process.exitCode = 1
}
