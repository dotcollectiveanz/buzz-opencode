// Generates Buzz's type-only plugin API (`@buzz/author`) into .buzz-author/,
// which `npm run typecheck` uses. Building and testing don't need it.
//   node scripts/types.mjs                 clone block/buzz-app at BUZZ_REF
//   node scripts/types.mjs ~/Code/buzz-app use an existing checkout
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

// The Buzz release this plugin is checked against.
const BUZZ_REF = "v0.7.0-preview.260.1";
const root = new URL("..", import.meta.url).pathname;
const given = process.argv[2];
const app = given ? resolve(given) : join(root, ".buzz-app");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" });

if (!given) {
  if (!existsSync(app))
    run("git", ["clone", "--depth", "1", "--branch", BUZZ_REF, "https://github.com/block/buzz-app.git", app], root);
  // buzz-app pins its own tools with Hermit in bin/.
  run(join(app, "bin/pnpm"), ["install", "--frozen-lockfile"], app);
}
run(join(app, "bin/pnpm"), ["author:build"], app);
rmSync(join(root, ".buzz-author"), { recursive: true, force: true });
cpSync(join(app, "dist-author"), join(root, ".buzz-author"), { recursive: true });
console.log(`@buzz/author types in .buzz-author/ (from ${given ? app : BUZZ_REF})`);
