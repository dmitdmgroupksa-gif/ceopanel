import { readFile } from "node:fs/promises"
import { database } from "../lib/platform/db"
await database().query(
  await readFile(new URL("../db/001-platform.sql", import.meta.url), "utf8"),
)
await database().query(
  await readFile(new URL("../db/002-channels.sql", import.meta.url), "utf8"),
)
await database().query(
  await readFile(
    new URL("../db/003-field-inputs.sql", import.meta.url),
    "utf8",
  ),
)
await database().query(
  await readFile(new URL("../db/004-mcp.sql", import.meta.url), "utf8"),
)
console.log("Platform migrations applied. ERPNext was not modified.")
await database().end()
