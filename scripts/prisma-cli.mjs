// Runs the local Prisma CLI with an argument array. On Windows npx is a
// .cmd file and needs a shell, so every argument is quoted there (paths can
// contain & ^ and other cmd.exe metacharacters).
import { spawnSync } from "node:child_process";

export function runPrisma(args, options = {}) {
  if (process.platform === "win32") {
    const quoted = args.map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`).join(" ");
    return spawnSync(`npx prisma ${quoted}`, { stdio: "inherit", shell: true, ...options });
  }
  return spawnSync("npx", ["prisma", ...args], { stdio: "inherit", ...options });
}
