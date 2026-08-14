import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildPhasePrompt } from "../src/prompts.mjs";
import { captureWorkspaceDiff } from "../src/review-diff.mjs";
import { hasWorkspaceChanges } from "../src/workspace-changes.mjs";
import { loadTrustedSkillBundle } from "../src/trusted-skills.mjs";

const phase = process.argv[2];
const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateRoot = path.join(process.env.RUNNER_TEMP || workspace, "real-moises", String(process.env.GITHUB_RUN_ID || "local"));
await mkdir(stateRoot, { recursive: true });
const event = JSON.parse(await readFile(process.env.REAL_MOISES_EVENT_PATH || process.env.GITHUB_EVENT_PATH, "utf8"));
const planPath = path.join(stateRoot, "plan.md");
const validationPath = path.join(stateRoot, "validation.log");
const plan = phase === "plan" ? "" : await readFile(planPath, "utf8");
const validation = phase === "repair" ? await readFile(validationPath, "utf8") : "";
const trustedSkills = await loadTrustedSkillBundle(runtimeRoot, phase);
const diff = phase === "repair" ? captureWorkspaceDiff(workspace) : "";
const binary = path.join(runtimeRoot, "node_modules", ".bin", process.platform === "win32" ? "opencode.cmd" : "opencode");
const agent = { plan: "public-issue-planner", implement: "public-issue-resolver", repair: "public-issue-repair" }[phase];
if (!agent) throw new Error(`unsupported phase: ${phase}`);
const environment = { ...process.env,
  OPENCODE_CONFIG: path.join(runtimeRoot, "opencode.json"),
  OPENCODE_CONFIG_DIR: path.join(runtimeRoot, ".opencode"),
  OPENCODE_DISABLE_AUTOUPDATE: "true"
};
for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_URL"]) delete environment[name];

if (phase === "plan") {
  const result = runAgent(buildPhasePrompt(phase, { issue: event.issue, plan, validation, diff, trustedSkills }), 10 * 60_000);
  await writeFile(planPath, `${stripAnsi(result.stdout).trim().slice(0, 20_000)}\n`);
} else {
  const attempts = phase === "implement" ? 2 : 1;
  let producedChanges = false;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const retryHint = attempt > 1 ? "\n\n--- RETRY DIRECTIVE ---\nYour previous implementation run completed without producing any workspace changes, which fails the workflow. The plan has not been implemented yet. Inspect the current files and write the required implementation now; a no-op response will fail again.\n--- END RETRY DIRECTIVE ---" : "";
    const prompt = buildPhasePrompt(phase, { issue: event.issue, plan, validation, diff, trustedSkills }) + retryHint;
    const timeout = phase === "implement" && attempt > 1 ? 20 * 60_000 : phase === "implement" ? 30 * 60_000 : 15 * 60_000;
    const result = runAgent(prompt, timeout);
    process.stdout.write(result.stdout || "");
    if (result.stderr) process.stderr.write(`[opencode ${phase} stderr]\n${result.stderr}`);
    if (phase !== "implement" || hasWorkspaceChanges(workspace)) { producedChanges = true; break; }
    process.stdout.write(`\n[orchestrate] ${phase} attempt ${attempt} produced no workspace changes${attempt < attempts ? ", retrying" : ""}.\n`);
  }
  if (phase === "implement" && !producedChanges) throw new Error("OpenCode implementation produced no workspace changes after all attempts");
}

function runAgent(prompt, timeout) {
  const result = spawnSync(binary, ["--pure", "run", prompt, "--model", "opencode-go/deepseek-v4-flash", "--agent", agent, "--format", "default", "--dir", workspace, "--title", `Real Moises issue #${event.issue.number}: ${phase}`], {
    cwd: workspace,
    env: environment,
    encoding: "utf8",
    timeout,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`OpenCode ${phase} failed with status ${result.status}: ${(result.stderr || "").slice(-4000)}`);
  return result;
}

function stripAnsi(value) { return String(value || "").replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, ""); }
