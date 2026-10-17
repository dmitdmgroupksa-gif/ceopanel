// Quoting CSV alone does not neutralize spreadsheet formulas. Preserve actual
// numeric values (including returns/credits) while treating formula text as text.
export function spreadsheetText(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return /^[\s\uFEFF]*[=+\-@]/.test(text) && typeof value !== "number"
    ? `'${text}`
    : text
}
