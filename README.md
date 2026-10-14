# CET tools

Private Node.js tools managed as npm workspaces. Requires Node.js 22.13 or newer.

## Getting started

```sh
npm install
npm run check
```

Commit the root `package-lock.json`; use `npm ci` for reproducible installs.

## Development

Run commands from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run lint` | Check JavaScript and TypeScript; fail on warnings |
| `npm run lint:fix` | Apply ESLint's automatic fixes |
| `npm run typecheck` | Check workspace TypeScript types |
| `npm test` | Run workspace tests |
| `npm run build` | Build workspace packages |
| `npm run check` | Run all checks, also used by CI |

Target one package with `npm run build -w @cet/site-scan-engine` (or substitute
`typecheck` or `test`). ESLint runs centrally from the root.

ESLint uses the recommended JavaScript and TypeScript rules, with additional
checks for unhandled and misused promises, type-only imports, unused variables,
strict equality, and mutable declarations. Prefix intentionally unused bindings
with `_`. Console output is allowed for CLI tools. `.editorconfig` defines shared
formatting conventions without a separate formatter or Git hooks.

CI runs all checks on Node.js 22 and 24. Generated builds, dependencies, reports,
environment files, and local site inventories are ignored by Git.

## Restricted Windows environments

If npm cannot create a workspace link and reports `EISDIR` during installation,
install the root tooling and package dependencies separately:

```sh
npm install --workspaces=false
npm install --prefix site-scan-engine --workspaces=false --package-lock=false
npm run check
```

This runs the checks without creating workspace links. The root lockfile remains
the canonical lockfile; CI uses a standard workspace install.

## Tools

- [Site scan engine](site-scan-engine/README.md): pluggable multisite scanning and reporting.

When adding a tool, add its directory to `workspaces` in `package.json` and provide
`build`, `typecheck`, and `test` scripts as applicable.
