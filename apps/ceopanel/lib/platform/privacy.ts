// Defense in depth for approved collections and user prompts. Collection owners
// still review content: pattern redaction cannot detect every sensitive value.
export function redactCredentials(text: string) {
  return text
    .replace(
      /^.*(?:password|api[_ -]?key|api[_ -]?secret|access[_ -]?token|private[_ -]?key|كلمة المرور).*$/gim,
      "[Credential removed]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[Credential removed]")
}
export function redactRestrictedText(text: string) {
  return text
    .replace(
      /^.*(?:password|api[_ -]?key|api[_ -]?secret|access[_ -]?token|bank[_ -]?account|iban|national[_ -]?id|كلمة المرور|رقم الحساب|الهوية الوطنية).*$/gim,
      "[Restricted information removed]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[Credential removed]")
    .replace(
      /\bSA(?:[ -]?\d){4}(?:[ -]?[A-Z0-9]){18}\b/gi,
      "[Bank identifier removed]",
    )
}
