import { mkdir, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { selectValidationCommands } from "../src/validation.mjs";

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const stateRoot = path.join(process.env.RUNNER_TEMP || workspace, "real-moises", String(process.env.GITHUB_RUN_ID || "local"));
await mkdir(stateRoot, { recursive: true });
const paths = await readdir(workspace);
const logs = [];
let passed = true;
for (const [command, args] of selectValidationCommands(paths)) {
  const result = spawnSync(command, args, { cwd: workspace, encoding: "utf8", timeout: 10 * 60_000, maxBuffer: 512 * 1024, env: scrubbedEnv() });
  logs.push(`$ ${command} ${args.join(" ")}\n${result.stdout || ""}\n${result.stderr || ""}`.slice(-100_000));
  if (result.error || result.status !== 0) { passed = false; break; }
}
await writeFile(path.join(stateRoot, "validation.log"), `${logs.join("\n\n").slice(-200_000)}\n`);
await writeFile(path.join(stateRoot, "validation.json"), `${JSON.stringify({ passed })}\n`);
if (!passed) process.exitCode = 1;

function scrubbedEnv() { const env = { ...process.env }; for (const key of ["OPENCODE_API_KEY", "GH_TOKEN", "GITHUB_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_URL"]) delete env[key]; return env; }
