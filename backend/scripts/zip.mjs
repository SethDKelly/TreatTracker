import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, unlinkSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distJs = path.join(root, "dist", "handler.js");
const outZip = path.join(root, "function.zip");

if (!existsSync(distJs)) {
  console.error("Missing dist/handler.js — run build first");
  process.exit(1);
}

if (existsSync(outZip)) {
  unlinkSync(outZip);
}

try {
  execFileSync("zip", ["-j", outZip, distJs], { stdio: "inherit" });
  process.exit(0);
} catch {
  // continue
}

try {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -LiteralPath '${distJs.replace(/'/g, "''")}' -DestinationPath '${outZip.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: "inherit" },
  );
  process.exit(0);
} catch {
  console.error("Could not create function.zip (need zip or PowerShell Compress-Archive)");
  process.exit(1);
}
