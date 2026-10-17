import { ERPNextError } from "../erpnext-error"

// Frappe dates/datetimes are site-local. Preserve their calendar day rather
// than converting it through the browser/server machine's timezone.
export function erpDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null
  const match =
    typeof value === "string"
      ? /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(?:Z|([+-])(\d{2}):(\d{2}))?)?$/.exec(
          value,
        )
      : null
  const invalid = () =>
    new ERPNextError(
      "An ERP date is invalid. This view cannot be calculated.",
      409,
    )
  if (!match) throw invalid()
  const day = match[1],
    stamp = Date.parse(`${day}T00:00:00Z`)
  if (
    !Number.isFinite(stamp) ||
    new Date(stamp).toISOString().slice(0, 10) !== day ||
    (match[2] !== undefined &&
      (+match[2] > 23 || +match[3] > 59 || +(match[4] || 0) > 59)) ||
    (match[6] !== undefined && (+match[6] > 23 || +match[7] > 59))
  )
    throw invalid()
  return day
}
