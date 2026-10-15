import "server-only"
import { z } from "zod"
import { externalCatalog, readExternal } from "../platform/external"
import type { BusinessPlugin } from "./types"
export const externalPlugin: BusinessPlugin = {
  id: "external",
  title: "External systems and Saudi banking",
  version: "1.0.0",
  tools: [
    {
      name: "external_sources",
      description:
        "Discover permitted ERP and external provider source configuration.",
      schema: z.object({}).strict(),
      audience: "human",
      effect: "read",
      run: async (s) => externalCatalog(s.context),
    },
    {
      name: "external_read",
      description:
        "Read a validated ERP or provider source. Partial results are not financial totals. Direct transfers are unavailable.",
      schema: z.object({ connector: z.string().min(1).max(140) }).strict(),
      audience: "human",
      effect: "read",
      run: (s, a) => readExternal(s.context, a.connector),
    },
  ],
}
