import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { routePlannedIssue } from "../src/issue-decomposition.mjs";
import { createGitHubRequest } from "../src/github-request.mjs";

const event = JSON.parse(await readFile(process.env.REAL_MOISES_EVENT_PATH || process.env.GITHUB_EVENT_PATH, "utf8"));
const github = createGitHubRequest({ token: process.env.GH_TOKEN });
const stateRoot = path.join(process.env.RUNNER_TEMP, "real-moises", String(process.env.GITHUB_RUN_ID));
const plan = await readFile(path.join(stateRoot, "plan.md"), "utf8");
const result = await routePlannedIssue({
  repository: event.repository.full_name,
  parentIssue: event.issue,
  plan,
  request: github,
  defaultBranch: event.repository.default_branch
});
await appendFile(process.env.GITHUB_OUTPUT, `should_implement=${result.action === "implement"}\n`);
process.stdout.write(result.action === "implement"
  ? "Plan atómico: continúa la implementación.\n"
  : `Epic dividido en ${result.children.length} sub-issues: ${result.children.map((number) => `#${number}`).join(", ")}\n`);
