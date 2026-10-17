import { ERPNextError } from "./erpnext-error"

// Validate at descriptor creation and delivery, before sending any credentials.
export function validateERPFilePath(path: string, print = false) {
  const attachment = /^\/(?:private\/)?files\/[^?#]+$/.test(path)
  if (
    !attachment &&
    !(
      print &&
      /^\/api\/method\/frappe\.utils\.print_format\.download_pdf\?/.test(path)
    )
  )
    throw new ERPNextError("Unsupported ERP file source.", 400)
  let decoded: string
  try {
    decoded = decodeURIComponent(path.split("?")[0])
  } catch {
    throw new ERPNextError("Invalid ERP file path.", 400)
  }
  if (
    /[\\\x00-\x1f]/.test(decoded) ||
    /%[a-f0-9]{2}/i.test(decoded) ||
    decoded.split("/").some((part) => part === "." || part === "..")
  )
    throw new ERPNextError("Invalid ERP file path.", 400)
}
