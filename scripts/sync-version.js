#!/usr/bin/env node
// Sync version from root config.version into all package.json files.

import { readFileSync, writeFileSync } from "fs"

const root = JSON.parse(readFileSync("package.json", "utf8"))
const version = root.config.version

const packages = [
  "packages/core/package.json",
  "packages/opencode/package.json",
  "packages/mcp/package.json",
  "packages/cli/package.json",
]

for (const pkgPath of packages) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  pkg.version = version

  for (const dep of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (!pkg[dep]) continue
    for (const name of Object.keys(pkg[dep])) {
      if (name.startsWith("@ctxlite/")) {
        pkg[dep][name] = version
      }
    }
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
  console.log(`Updated ${pkgPath} → v${version}`)
}
