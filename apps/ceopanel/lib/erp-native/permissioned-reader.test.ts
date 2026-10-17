import { describe, it, expect, vi } from "vitest"
import { permissionedReader } from "./permissioned-reader"
import type { ERPNextClient } from "../erpnext-client"

const context = {
  user: "reader",
  company: "Company A",
  currency: "SAR",
  companies: [],
  siteUrl: "https://erp.example",
}
function fixture() {
  const fields = [
    {
      fieldname: "company",
      fieldtype: "Link",
      options: "Company",
      permlevel: 0,
    },
    { fieldname: "amount", fieldtype: "Currency", permlevel: 1 },
  ]
  const erp = {
    roles: vi.fn(async () => ["Employee"]),
    canRead: vi.fn(async () => true),
    request: vi.fn(async () => ({
      docs: [
        {
          name: "Custom Invoice",
          fields,
          permissions: [{ role: "Finance Manager", read: 1, permlevel: 1 }],
        },
      ],
    })),
    list: vi.fn(async () => [
      {
        name: "INV-1",
        company: "Company A",
        amount: 10,
        private_secret: "NEVER RETURN",
      },
    ]),
    page: vi.fn(async () => [
      {
        name: "INV-1",
        company: "Company A",
        amount: 10,
        private_secret: "NEVER RETURN",
      },
    ]),
  }
  return {
    fields,
    erp,
    reader: permissionedReader(erp as unknown as ERPNextClient, context),
  }
}
describe("native portal field permissions", () => {
  it("rejects restricted columns and filters before requesting any rows, including empty datasets", async () => {
    const f = fixture()
    await expect(
      f.reader.list("Custom Invoice", { fields: ["name", "amount"] }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      f.reader.page("Custom Invoice", {
        fields: ["name"],
        filters: [["amount", ">", 0]],
        offset: 0,
        limit: 20,
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(f.erp.list).not.toHaveBeenCalled()
    expect(f.erp.page).not.toHaveBeenCalled()
    expect(f.erp.roles).toHaveBeenCalledTimes(1)
    expect(f.erp.request).toHaveBeenCalledTimes(1)
  })
  it("uses only requested scalar fields and accepts explicitly granted higher-level fields", async () => {
    const f = fixture()
    const reader = permissionedReader(f.erp as unknown as ERPNextClient, {
      ...context,
      roles: ["Finance Manager"],
    })
    expect(
      await reader.list("Custom Invoice", { fields: ["name", "amount"] }),
    ).toEqual([{ name: "INV-1", amount: 10 }])
    expect(f.erp.roles).not.toHaveBeenCalled()
  })
  it("fails closed if ERP removes a required field after metadata validation", async () => {
    const f = fixture()
    f.erp.list.mockResolvedValue([{ name: "INV-1" }] as any)
    await expect(
      f.reader.list("Custom Invoice", { fields: ["name", "company"] }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it("does not share permission metadata across account contexts", async () => {
    const f = fixture()
    await permissionedReader(f.erp as unknown as ERPNextClient, {
      ...context,
      roles: ["Finance Manager"],
    }).list("Custom Invoice", { fields: ["amount"] })
    await expect(
      f.reader.list("Custom Invoice", { fields: ["amount"] }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
