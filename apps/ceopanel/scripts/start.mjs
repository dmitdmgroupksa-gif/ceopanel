import { access, cp } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import nextEnvironment from "@next/env"

const directory = fileURLToPath(new URL("..", import.meta.url))
process.env.NODE_ENV = "production"
nextEnvironment.loadEnvConfig(directory, false, {
  info: () => {},
  error: () =>
    console.error("Unable to load production environment configuration."),
})

try {
  const standalone = path.join(directory, ".next", "standalone")
  const server = path.join(standalone, "server.js")
  await access(server)
  // Next deliberately omits static/public assets from standalone output.
  await cp(
    path.join(directory, ".next", "static"),
    path.join(standalone, ".next", "static"),
    { recursive: true },
  )
  const publicDirectory = path.join(directory, "public")
  const hasPublic = await access(publicDirectory).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false
      throw error
    },
  )
  if (hasPublic)
    await cp(publicDirectory, path.join(standalone, "public"), {
      recursive: true,
    })
  // The generated server changes cwd. Keep private files at the same locations
  // used by development, migrations and the worker, with runtime environment values.
  if (process.env.PLATFORM_CONFIG_PATH)
    process.env.PLATFORM_CONFIG_PATH = path.resolve(
      directory,
      process.env.PLATFORM_CONFIG_PATH,
    )
  process.env.DOCUMENT_STORAGE_PATH = path.resolve(
    directory,
    process.env.DOCUMENT_STORAGE_PATH || ".private-documents",
  )
  process.env.HOSTNAME ||= "0.0.0.0"
  await import(pathToFileURL(server).href)
} catch {
  console.error(
    "Production server could not start. Run npm run build and check asset/configuration access.",
  )
  process.exitCode = 1
}
