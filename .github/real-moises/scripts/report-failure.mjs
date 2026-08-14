import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const event = JSON.parse(await readFile(process.env.REAL_MOISES_EVENT_PATH || process.env.GITHUB_EVENT_PATH, "utf8"));
const stateRoot = path.join(process.env.RUNNER_TEMP, "real-moises", String(process.env.GITHUB_RUN_ID));
const log = await readFile(path.join(stateRoot, "validation.log"), "utf8").catch(() => "Validation did not produce a log.");
const body = `Real Moises ejecutó la revisión automática, pero la reparación o la segunda validación falló. No se creó ni fusionó una PR.\n\n<details><summary>Validation log</summary>\n\n\`\`\`text\n${escapeLog(log)}\n\`\`\`\n</details>`;
await writeSummary(`Unresolved validation failure.\n\n\`\`\`text\n${escapeLog(log)}\n\`\`\``);
const apiBase = process.env.REAL_MOISES_API_BASE || "https://api.github.com";
let failureDetail = "";
try {
  const response = await fetch(`${apiBase}/repos/${event.repository.full_name}/issues/${event.issue.number}/comments`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10" },
    body: JSON.stringify({ body })
  });
  if (!response.ok) failureDetail = `failure report failed: ${response.status} ${(await response.text().catch(() => "")).slice(0, 2000)}`;
} catch (error) {
  failureDetail = `failure report request failed: ${error.message}`;
}
if (failureDetail) {
  console.error(failureDetail);
  await writeSummary(failureDetail);
}
process.exitCode = 1;

function escapeLog(value) {
  return String(value || "").slice(-12_000).replace(/```/g, "``\u2060`");
}
async function writeSummary(value) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ${value}\n`).catch(() => {});
}
