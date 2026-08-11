import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const names = await readdir(workspace);
if (names.includes("package-lock.json")) run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: workspace, stdio: "inherit", timeout: 10 * 60_000, env: scrubbedEnv() });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} dependency preparation failed: ${result.status}`);
}
function scrubbedEnv() { const env = { ...process.env }; for (const key of ["OPENCODE_API_KEY", "GH_TOKEN", "GITHUB_TOKEN"]) delete env[key]; return env; }
