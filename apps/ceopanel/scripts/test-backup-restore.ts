import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"

// No environment files, host volumes, ports, Docker socket or real ERP connection.
const run = randomUUID(),
  container = `ceopanel-backup-test-${run}`,
  image = `ceopanel-backup-test:${run}`
function docker(args: string[], quiet = false) {
  const result = spawnSync("docker", args, {
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
    timeout: 240000,
  })
  if (result.error || result.status !== 0)
    throw new Error(
      "Disposable backup test failed. Check Docker and the test output.",
    )
}
let built = false,
  started = false
try {
  const directory = fileURLToPath(new URL("..", import.meta.url))
  docker([
    "build",
    "--file",
    fileURLToPath(new URL("../deploy/Dockerfile.backup-test", import.meta.url)),
    "--tag",
    image,
    directory,
  ])
  built = true
  started = true
  docker(
    [
      "run",
      "--detach",
      "--name",
      container,
      "--network",
      "none",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "--tmpfs",
      "/app",
      "--env",
      "POSTGRES_USER=ceopanel",
      "--env",
      "POSTGRES_DB=ceopanel",
      "--env",
      "POSTGRES_PASSWORD=disposable_backup_test_only",
      "--env",
      "CEOPANEL_BACKUP_TEST=disposable",
      image,
    ],
    true,
  )
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = spawnSync(
      "docker",
      [
        "exec",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "ceopanel",
        "-d",
        "ceopanel",
      ],
      {
        stdio: "ignore",
        timeout: 5000,
      },
    )
    if (!probe.error && probe.status === 0) {
      ready = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  if (!ready)
    throw new Error("Disposable backup database did not become ready.")
  docker(["exec", container, "bash", "/audit/test-backup-restore.sh"])
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Backup restore test failed.",
  )
  process.exitCode = 1
} finally {
  // Names are generated above, never discovered from a user's deployment.
  for (const args of [
    ...(started ? [["rm", "--force", container]] : []),
    ...(built ? [["image", "rm", image]] : []),
  ]) {
    try {
      docker(args, true)
    } catch {
      console.error("Disposable backup test cleanup failed.")
      process.exitCode = 1
    }
  }
}
