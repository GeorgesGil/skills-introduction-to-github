import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const original = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const issueNumber = String(process.env.REAL_MOISES_ISSUE_NUMBER || "").trim();
if (!issueNumber) process.exit(0);
if (!/^\d+$/.test(issueNumber)) throw new Error("dispatched issue number must be numeric");
const response = await fetch(`https://api.github.com/repos/${original.repository.full_name}/issues/${issueNumber}`, {
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${process.env.GH_TOKEN}`,
    "X-GitHub-Api-Version": "2026-03-10"
  }
});
if (!response.ok) throw new Error(`issue hydration failed: ${response.status}`);
const issue = await response.json();
if (issue.pull_request || issue.state !== "open") throw new Error("dispatched target must be an open issue");
const labels = (issue.labels || []).map((label) => typeof label === "string" ? label : label.name);
if (!labels.includes("ready-for-agent")) throw new Error("dispatched issue is not ready-for-agent");
const hydratedPath = path.join(process.env.RUNNER_TEMP, `real-moises-event-${process.env.GITHUB_RUN_ID}.json`);
await writeFile(hydratedPath, JSON.stringify({ ...original, issue }));
await appendFile(process.env.GITHUB_ENV, `REAL_MOISES_EVENT_PATH=${hydratedPath}\n`);
