import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { routePlannedIssue } from "../src/issue-decomposition.mjs";

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const stateRoot = path.join(process.env.RUNNER_TEMP, "real-moises", String(process.env.GITHUB_RUN_ID));
const plan = await readFile(path.join(stateRoot, "plan.md"), "utf8");
const result = await routePlannedIssue({
  repository: event.repository.full_name,
  parentIssue: event.issue,
  plan,
  request: github
});
await appendFile(process.env.GITHUB_OUTPUT, `should_implement=${result.action === "implement"}\n`);
process.stdout.write(result.action === "implement"
  ? "Plan atómico: continúa la implementación.\n"
  : `Epic dividido en ${result.children.length} sub-issues: ${result.children.map((number) => `#${number}`).join(", ")}\n`);

async function github(endpoint, { method = "GET", body, allowNotFound = false } = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (allowNotFound && response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GitHub ${method} ${endpoint} failed: ${response.status}`);
  return data;
}
