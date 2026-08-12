import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { selectValidationCommands } from "/validation.mjs";

const workspace = "/workspace";
const paths = await readdir(workspace);
let packageScripts = {};
if (paths.includes("package.json")) {
  const packageJson = JSON.parse(await readFile(`${workspace}/package.json`, "utf8"));
  packageScripts = packageJson.scripts || {};
  run("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"]);
  run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
}
for (const [command, args] of selectValidationCommands(paths, packageScripts)) {
  if (command !== "git") run(command, args);
}

function run(command, args) {
  process.stdout.write(`$ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { cwd: workspace, stdio: "inherit", timeout: 10 * 60_000, env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
