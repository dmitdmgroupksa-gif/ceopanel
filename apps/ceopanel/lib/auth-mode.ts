// A local UI preview only. Business APIs always verify native ERP permissions.
// Read at request time; never expose this switch as a NEXT_PUBLIC variable.
export function localAuthDisabled(host: string) {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.CEOPANEL_DISABLE_AUTH === "true" &&
    /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)
  )
}
