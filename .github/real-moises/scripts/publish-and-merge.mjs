import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { evaluateChangeSet } from "../src/policy.mjs";
import { mergeWithRetry } from "../src/merge.mjs";

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const stateRoot = path.join(process.env.RUNNER_TEMP, "real-moises", String(process.env.GITHUB_RUN_ID));
const validation = JSON.parse(await readFile(path.join(stateRoot, "validation.json"), "utf8"));
const plan = await readFile(path.join(stateRoot, "plan.md"), "utf8");
const tracked = lines(git(["diff", "--name-only"]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
const paths = [...new Set([...tracked, ...untracked])];
const gate = evaluateChangeSet({ validationPassed: validation.passed, paths });
if (gate.decision !== "merge") {
  await comment(`Real Moises no fusionó cambios: **${gate.reason}**.`);
  throw new Error(`merge blocked: ${gate.reason}`);
}
const branch = `real-moises/issue-${event.issue.number}-${process.env.GITHUB_RUN_ID}`;
git(["config", "user.name", "real-moises[bot]"]);
git(["config", "user.email", "real-moises[bot]@users.noreply.github.com"]);
git(["checkout", "-b", branch]);
git(["add", "--all"]);
git(["commit", "-m", `fix: resolve issue #${event.issue.number}`]);
const originalRemote = git(["remote", "get-url", "origin"]).trim();
try {
  git(["remote", "set-url", "origin", `https://x-access-token:${process.env.GH_TOKEN}@github.com/${event.repository.full_name}.git`]);
  git(["push", "--set-upstream", "origin", branch]);
} finally {
  git(["remote", "set-url", "origin", originalRemote]);
}
const pull = await github(`/repos/${event.repository.full_name}/pulls`, { method: "POST", body: {
  title: `fix: ${event.issue.title}`.slice(0, 240),
  body: `Fixes #${event.issue.number}\n\n## Plan\n\n${plan.slice(0, 20_000)}\n\n## Validation\n\nAutomated validation passed, including one bounded repair cycle when required.`,
  head: branch,
  base: event.repository.default_branch
} });
await mergeWithRetry({ attempt: () => mergePullRequest(pull.number) });
await comment(`Real Moises implementó, validó y fusionó automáticamente #${pull.number}.`);

function git(args) { const result = spawnSync("git", args, { cwd: workspace, encoding: "utf8", timeout: 2 * 60_000, maxBuffer: 1024 * 1024 }); if (result.error) throw result.error; if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${(result.stderr || "").slice(-2000)}`); return result.stdout || ""; }
function lines(value) { return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }
async function comment(body) { await github(`/repos/${event.repository.full_name}/issues/${event.issue.number}/comments`, { method: "POST", body: { body } }); }
async function mergePullRequest(number) {
  const response = await fetch(`https://api.github.com/repos/${event.repository.full_name}/pulls/${number}/merge`, {
    method: "PUT",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ merge_method: "squash" })
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
async function github(endpoint, { method, body }) { const response = await fetch(`https://api.github.com${endpoint}`, { method, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" }, body: JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(`GitHub ${method} ${endpoint} failed: ${response.status}`); return data; }
