import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { initializeStaging } from "./setup"

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "ceopanel-setup-"))
  directories.push(directory)
  for (const name of [".env.example", "platform.config.example.json"])
    await writeFile(
      path.join(directory, name),
      await readFile(new URL(`../../${name}`, import.meta.url)),
    )
  return directory
}
describe("local staging initialization", () => {
  it("creates disabled configuration and private secrets without targeting the live ERP", async () => {
    const directory = await fixture()
    expect((await initializeStaging(directory)).map((r) => r.state)).toEqual([
      "created",
      "created",
    ])
    const env = await readFile(path.join(directory, ".env.local"), "utf8")
    expect(env).toContain("ERPNEXT_URL=https://staging.invalid")
    expect(env).toContain("PLATFORM_CONFIG_PATH=platform.config.json")
    expect(env).toMatch(/^ERPNEXT_RECEIPT_SECRET=[a-f0-9]{64}$/m)
    expect(env).toMatch(/^MCP_AUTH_SECRET=[a-f0-9]{64}$/m)
    const config = JSON.parse(
      await readFile(path.join(directory, "platform.config.json"), "utf8"),
    )
    expect(config.aiDataApproved).toBe(false)
    expect(
      config.modules.every(
        (m: { readValidated: boolean; writeValidated: boolean }) =>
          !m.readValidated && !m.writeValidated,
      ),
    ).toBe(true)
    expect(config.channels).toEqual({
      email: false,
      whatsapp: false,
      voice: false,
    })
  })
  it("preserves existing configuration and secrets on repeated or concurrent setup", async () => {
    const directory = await fixture()
    await Promise.all([
      initializeStaging(directory),
      initializeStaging(directory),
    ])
    const original = await readFile(path.join(directory, ".env.local"), "utf8")
    await writeFile(
      path.join(directory, "platform.config.json"),
      '{"private":"preserve"}',
    )
    expect((await initializeStaging(directory)).map((r) => r.state)).toEqual([
      "preserved",
      "preserved",
    ])
    expect(await readFile(path.join(directory, ".env.local"), "utf8")).toBe(
      original,
    )
    expect(
      await readFile(path.join(directory, "platform.config.json"), "utf8"),
    ).toBe('{"private":"preserve"}')
  })
})
