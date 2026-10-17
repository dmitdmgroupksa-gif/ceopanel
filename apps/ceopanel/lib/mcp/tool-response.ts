import { z } from "zod"
import { ERPNextError } from "../erpnext-error"
import { externalReady } from "./crypto"

// Values in errors never include raw upstream bodies, tokens or arguments.
export function toolFailure(error: unknown, tool: string) {
  const status =
    error instanceof ERPNextError
      ? error.status
      : error instanceof SyntaxError || error instanceof z.ZodError
        ? 400
        : 502
  const details: Record<number, [string, boolean, string]> = {
    400: [
      "invalid_arguments",
      false,
      tool === "erp_run_report" || tool === "erp_export_file"
        ? "Describe the report or document first and supply its exact required fields and filters. Do not invent missing dates or identifiers."
        : "Inspect the tool schema and source metadata, then correct the arguments before retrying.",
    ],
    401: [
      "authentication_required",
      false,
      "Reconnect this MCP connection and sign in to ERP again.",
    ],
    403: [
      "permission_denied",
      false,
      "Do not retry unchanged or bypass permissions. Use another approved source or ask the ERP administrator to review access.",
    ],
    404: [
      "source_not_found",
      false,
      "Search for the exact permitted source or record identifier before retrying.",
    ],
    409: [
      "source_unavailable",
      false,
      "Refresh the source metadata or workflow state. The source may require an ERP configuration correction.",
    ],
    413: [
      "result_too_large",
      false,
      "Narrow the dates, filters, fields or page size. No partial result was returned.",
    ],
    429: [
      "rate_limited",
      true,
      "Wait at least 60 seconds before retrying. Avoid parallel bursts of tool calls.",
    ],
    502: [
      "upstream_error",
      true,
      "Retry once after checking ERP availability. If it fails again, report the unavailable source instead of inventing results.",
    ],
    503: [
      "service_unavailable",
      true,
      "Check the application dependencies and ERP availability before retrying.",
    ],
    504: [
      "upstream_timeout",
      true,
      "Narrow the request and retry once. Do not present a timed-out read as an empty result.",
    ],
  }
  const [code, retryable, nextStep] = details[status] || [
    "tool_failed",
    false,
    "Report the failure and ask the application administrator to investigate.",
  ]
  return {
    error:
      error instanceof ERPNextError
        ? error.message
        : status === 400
          ? "Invalid tool arguments."
          : "This tool could not complete the request.",
    status,
    code,
    retryable,
    nextStep,
    ...(status === 429 ? { retryAfterSeconds: 60 } : {}),
  }
}

export function authenticationChallenge() {
  return `Bearer resource_metadata="${externalReady()}/.well-known/oauth-protected-resource/api/mcp", error="invalid_token", error_description="Reconnect and sign in to ERP again", scope="ceopanel:read ceopanel:erp-read"`
}
