"use strict";

const path = require("path");
const os = require("os");
const fs = require("fs");

const PLATFORM_PACKAGES = {
  "darwin-arm64": "ctxlite-darwin-arm64",
  "darwin-x64": "ctxlite-darwin-x64",
  "linux-x64": "ctxlite-linux-x64",
  "linux-arm64": "ctxlite-linux-arm64",
  "win32-x64": "ctxlite-win32-x64",
};

function main() {
  const key = `${os.platform()}-${os.arch()}`;
  const pkg = PLATFORM_PACKAGES[key];

  if (!pkg) {
    process.stderr.write(
      `[ctxlite] Warning: platform ${key} is not supported.\n`
    );
    return;
  }

  let pkgJsonPath;
  try {
    pkgJsonPath = require.resolve(`${pkg}/package.json`);
  } catch {
    const localPath = path.join(__dirname, "..", "..", pkg, "package.json");
    if (fs.existsSync(localPath)) {
      pkgJsonPath = localPath;
    } else {
      process.stderr.write(
        `[ctxlite] Warning: could not find ${pkg}. Try: npm install -g ctxlite\n`
      );
      return;
    }
  }

  const binName = os.platform() === "win32" ? "ctxlite.exe" : "ctxlite";
  const binPath = path.join(path.dirname(pkgJsonPath), "bin", binName);

  if (!fs.existsSync(binPath)) {
    process.stderr.write(
      `[ctxlite] Warning: binary not found at ${binPath}\n`
    );
    return;
  }

  if (os.platform() !== "win32") {
    try {
      fs.accessSync(binPath, fs.constants.X_OK);
    } catch {
      try {
        fs.chmodSync(binPath, 0o755);
      } catch {
        process.stderr.write(
          `[ctxlite] Warning: binary at ${binPath} may not be executable.\n` +
            `Try: chmod +x ${binPath}\n`
        );
        return;
      }
    }
  }

  process.stdout.write(
    `[ctxlite] Binary ready: ${binPath}\n` +
      `[ctxlite] Run 'ctxlite --version' to verify installation.\n`
  );
}

main();
