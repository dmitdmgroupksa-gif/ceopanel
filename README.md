# Durar Masagh — CEO Panel

A company management platform built from the shadcn dashboard design, with top tabs for **Overview, Finance, Sales, Purchasing, Projects, People, and Reports**.

## Run the platform

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
npm run ceo:install
npm run dev
```

Open **http://localhost:3000**. The platform starts with explicitly labeled illustrative data. Click **Connect ERPNext** to sign in to **https://dmgroup.frappe.cloud** using your own company account. Company data is read through your ERPNext permissions; passwords are never saved by the platform.

```sh
npm run ceo:typecheck
npm run ceo:test
npm run ceo:test:browser
npm run build
npm start
```

Configuration, record mappings, integration limits, and deployment notes are in [apps/ceopanel/README.md](apps/ceopanel/README.md). The focused app has its own npm lockfile, so running it does not require installing the complete upstream shadcn toolchain.

## Upstream source

The original shadcn library and documentation source remain in `apps/v4`, `packages`, and `templates`. `upstream` points to `shadcn-ui/ui`; `origin` points to this repository. The CEO app uses local copies of shadcn Card, Tabs, Button, Table, Badge, Dialog, and Input components. See [shadcn/ui documentation](https://ui.shadcn.com/docs) and the original [contributing guide](CONTRIBUTING.md).

Licensed under the [MIT license](LICENSE.md). Original component copyright and license are retained.
