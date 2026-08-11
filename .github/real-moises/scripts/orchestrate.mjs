import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildPhasePrompt } from "../src/prompts.mjs";

const phase = process.argv[2];
const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateRoot = path.join(process.env.RUNNER_TEMP || workspace, "real-moises", String(process.env.GITHUB_RUN_ID || "local"));
await mkdir(stateRoot, { recursive: true });
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const planPath = path.join(stateRoot, "plan.md");
const validationPath = path.join(stateRoot, "validation.log");
const plan = phase === "plan" ? "" : await readFile(planPath, "utf8");
const validation = phase === "repair" ? await readFile(validationPath, "utf8") : "";
const prompt = buildPhasePrompt(phase, { issue: event.issue, plan, validation });
const binary = path.join(runtimeRoot, "node_modules", ".bin", process.platform === "win32" ? "opencode.cmd" : "opencode");
const agent = { plan: "public-issue-planner", implement: "public-issue-resolver", repair: "public-issue-repair" }[phase];
if (!agent) throw new Error(`unsupported phase: ${phase}`);
const environment = { ...process.env,
  OPENCODE_CONFIG: path.join(runtimeRoot, "opencode.json"),
  OPENCODE_CONFIG_DIR: path.join(runtimeRoot, ".opencode"),
  OPENCODE_DISABLE_AUTOUPDATE: "true",
  OPENCODE_DISABLE_DEFAULT_PLUGINS: "true"
};
for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_URL"]) delete environment[name];
const result = spawnSync(binary, ["run", prompt, "--model", "opencode-go/deepseek-v4-flash", "--agent", agent, "--format", "default", "--dir", workspace, "--title", `Real Moises issue #${event.issue.number}: ${phase}`], {
  cwd: workspace,
  env: environment,
  encoding: "utf8",
  timeout: phase === "plan" ? 10 * 60_000 : phase === "implement" ? 30 * 60_000 : 15 * 60_000,
  maxBuffer: 2 * 1024 * 1024
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`OpenCode ${phase} failed with status ${result.status}: ${(result.stderr || "").slice(-4000)}`);
if (phase === "plan") await writeFile(planPath, `${stripAnsi(result.stdout).trim().slice(0, 20_000)}\n`);
else process.stdout.write(result.stdout || "");

function stripAnsi(value) { return String(value || "").replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, ""); }
