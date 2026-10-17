import "server-only"
import { identity } from "../platform/auth"

// Native ERP reads and configuration/status requests do not need to initialize
// the MCP server, document parsers, voice SDK or background queue integrations.
export async function humanTool<T>(
  company: string | undefined,
  name: string,
  args: Record<string, unknown> = {},
) {
  const context = await identity(company)
  return (await import("./client")).humanToolForContext<T>(context, name, args)
}
