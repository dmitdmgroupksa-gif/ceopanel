// Defense in depth for approved collections and user prompts. Collection owners
// still review content: pattern redaction cannot detect every sensitive value.
export function redactRestrictedText(text: string) {
  return text
    .replace(
      /^.*(?:password|api[_ -]?key|api[_ -]?secret|access[_ -]?token|bank[_ -]?account|iban|national[_ -]?id|كلمة المرور|رقم الحساب|الهوية الوطنية).*$/gim,
      "[Restricted information removed]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[Credential removed]")
    .replace(/\bSA\d{22}\b/g, "[Bank identifier removed]")
}
