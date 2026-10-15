import "server-only"
import { createHash } from "node:crypto"
import { z } from "zod"
import type { ExternalAdapter } from "./external"
import type { UserContext } from "./policy"
import { ERPNextError } from "../erpnext-client"

// ISO 13616 registry: SA2!n2!n18!c. A valid checksum does not verify ownership.
export function saudiIBAN(input: string) {
  const iban = input.replace(/[ -]/g, "").toUpperCase()
  if (!/^SA\d{4}[A-Z0-9]{18}$/.test(iban))
    throw new ERPNextError("Invalid Saudi IBAN format.", 400)
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (char) =>
    String(char.charCodeAt(0) - 55),
  )
  let remainder = 0
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  if (remainder !== 1)
    throw new ERPNextError("Invalid Saudi IBAN checksum.", 400)
  return iban
}
export function maskSaudiIBAN(input: string) {
  const iban = saudiIBAN(input)
  return `SA•• •••• •••• •••• •••• ${iban.slice(-4)}`
}
export function sarMinorUnits(input: string) {
  if (!/^-?(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(input))
    throw new ERPNextError(
      "SAR amounts require decimal text with at most two fractional digits.",
      400,
    )
  const [whole, fraction = ""] = input.replace(/^-/, "").split(".")
  const result = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))
  return (input.startsWith("-") ? -result : result).toString()
}
const identifier = z.string().min(1).max(200)
const date = z.iso.date()
const money = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    amount: z.string().regex(/^-?(0|[1-9]\d{0,15})(\.\d{1,3})?$/),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.currency === "SAR" && !/^-?\d+(\.\d{1,2})?$/.test(m.amount))
      ctx.addIssue({
        code: "custom",
        message: "SAR has two fractional digits.",
      })
  })
export const bankSnapshotSchema = z
  .object({
    company: identifier,
    provider: identifier,
    retrievedAt: z.iso.datetime({ offset: true }),
    asOf: z.iso.datetime({ offset: true }),
    authorization: z
      .object({
        company: identifier,
        expiresAt: z.iso.datetime({ offset: true }),
        permissions: z.array(z.enum(["accounts", "balances", "transactions"])),
      })
      .strict(),
    accounts: z
      .array(
        z
          .object({
            id: identifier,
            iban: z.string().max(40),
            balanceType: z.enum(["booked", "available"]),
            balance: money,
          })
          .strict(),
      )
      .max(100),
    transactions: z
      .array(
        z
          .object({
            id: identifier,
            accountId: identifier,
            date,
            status: z.enum(["booked", "pending"]),
            direction: z.enum(["credit", "debit"]),
            amount: money,
          })
          .strict(),
      )
      .max(1000),
    hasMore: z.boolean(),
  })
  .strict()
export type BankSnapshot = z.infer<typeof bankSnapshotSchema>
export function transactionIdentity(
  company: string,
  provider: string,
  account: string,
  transaction: string,
) {
  return createHash("sha256")
    .update(JSON.stringify([company, provider, account, transaction]))
    .digest("hex")
}
// Provider adapters handle their own OAuth/mTLS, paging and provider-specific schemas.
// This boundary validates results and never initiates a transfer or posts a ledger entry.
export function saudiBankAdapter(options: {
  provider: string
  roles: string[]
  validated: boolean
  read: (context: UserContext) => Promise<unknown>
}): ExternalAdapter {
  return {
    type: "bank",
    roles: options.roles,
    validated: options.validated,
    read: async (context) => {
      if (
        !options.validated ||
        !options.roles.some((r) => context.roles.includes(r))
      )
        throw new ERPNextError("Bank source access denied.", 403)
      let snapshot: BankSnapshot
      try {
        snapshot = bankSnapshotSchema.parse(await options.read(context))
      } catch {
        throw new ERPNextError(
          "Bank provider returned an invalid snapshot.",
          502,
        )
      }
      if (
        snapshot.company !== context.company ||
        snapshot.authorization.company !== context.company ||
        snapshot.provider !== options.provider
      )
        throw new ERPNextError(
          "Bank source returned a different company or provider.",
          403,
        )
      if (Date.parse(snapshot.authorization.expiresAt) <= Date.now())
        throw new ERPNextError(
          "Bank authorization expired. Reconnect through the provider.",
          401,
        )
      if (
        Date.parse(snapshot.retrievedAt) > Date.now() + 60000 ||
        Date.parse(snapshot.asOf) > Date.parse(snapshot.retrievedAt) + 60000
      )
        throw new ERPNextError(
          "Bank source returned an invalid timestamp.",
          502,
        )
      const permissions = snapshot.authorization.permissions
      if (
        !permissions.includes("accounts") ||
        (snapshot.accounts.length && !permissions.includes("balances")) ||
        (snapshot.transactions.length && !permissions.includes("transactions"))
      )
        throw new ERPNextError(
          "Bank authorization does not permit this data.",
          403,
        )
      const accounts = new Map(snapshot.accounts.map((a) => [a.id, a]))
      if (accounts.size !== snapshot.accounts.length)
        throw new ERPNextError("Bank source returned duplicate accounts.", 502)
      const accountIdentities = new Set<string>()
      try {
        for (const a of snapshot.accounts) {
          const identity = JSON.stringify([
            saudiIBAN(a.iban),
            a.balance.currency,
          ])
          if (accountIdentities.has(identity)) throw new Error()
          accountIdentities.add(identity)
        }
      } catch {
        throw new ERPNextError(
          "Bank source returned an invalid or duplicate account.",
          502,
        )
      }
      const seen = new Set<string>()
      const records: Record<string, string | number | null>[] =
        snapshot.accounts.map((a) => ({
          kind: "balance",
          accountRef: transactionIdentity(
            context.company,
            options.provider,
            a.id,
            "account",
          ),
          account: maskSaudiIBAN(a.iban),
          balanceType: a.balanceType,
          currency: a.balance.currency,
          amount: a.balance.amount,
        }))
      for (const transaction of snapshot.transactions) {
        const account = accounts.get(transaction.accountId)
        if (
          !account ||
          account.balance.currency !== transaction.amount.currency ||
          transaction.amount.amount.startsWith("-")
        )
          throw new ERPNextError(
            "Bank transaction account, currency or direction is invalid.",
            502,
          )
        const id = transactionIdentity(
          context.company,
          options.provider,
          account.id,
          transaction.id,
        )
        if (seen.has(id))
          throw new ERPNextError(
            "Bank source returned duplicate transactions.",
            502,
          )
        seen.add(id)
        records.push({
          kind: "transaction",
          id,
          accountRef: transactionIdentity(
            context.company,
            options.provider,
            account.id,
            "account",
          ),
          account: maskSaudiIBAN(account.iban),
          currency: transaction.amount.currency,
          amount: transaction.amount.amount,
          direction: transaction.direction,
          status: transaction.status,
          date: transaction.date,
        })
      }
      return {
        company: context.company,
        source: options.provider,
        updatedAt: snapshot.asOf,
        retrievedAt: snapshot.retrievedAt,
        freshnessBasis: "provider-as-of",
        hasMore: snapshot.hasMore,
        records,
      }
    },
  }
}
