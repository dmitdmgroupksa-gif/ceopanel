import nextEnvironment from "@next/env"
import { fileURLToPath } from "node:url"

// Use the same environment precedence as the portal, even outside the app directory.
const projectDirectory = fileURLToPath(new URL("..", import.meta.url))
nextEnvironment.loadEnvConfig(
  projectDirectory,
  process.env.NODE_ENV !== "production",
  {
    info: () => {},
    error: () =>
      console.error("Unable to load local environment configuration."),
  },
)
process.chdir(projectDirectory)
