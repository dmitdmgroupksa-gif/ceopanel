# Durar Masagh — CEO Panel

A company management platform built from the shadcn dashboard design, with **18 CEO dashboard tabs** in the company menu's order. All navigation sits at the top, with scroll controls and a quick dashboard selector.

## Run the platform

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
npm run ceo:install
npm run dev
```

Open **http://localhost:3000**. Each dashboard has its metric, chart, and record layout ready and displays **Awaiting data**. Data sources and calculations will be connected when the company supplies their mappings. Optional **Connect ERPNext** sign-in connects to **https://dmgroup.frappe.cloud** and loads only the user's permitted company context; it does not automatically assign dashboard data sources.

The **ERP workspace** at **http://localhost:3000/workspace** prepares record browsing, creation/editing, and document actions for the listed company modules, plus custom DocTypes and reports. Live record actions await the company API setup. See [the ERP workspace integration guide](apps/ceopanel/ERP-WORKSPACE.md).

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
