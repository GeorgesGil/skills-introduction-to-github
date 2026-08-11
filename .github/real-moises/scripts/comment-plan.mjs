import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const stateRoot = path.join(process.env.RUNNER_TEMP, "real-moises", String(process.env.GITHUB_RUN_ID));
const plan = await readFile(path.join(stateRoot, "plan.md"), "utf8");
await github(`/repos/${event.repository.full_name}/issues/${event.issue.number}/comments`, {
  method: "POST",
  body: { body: `## Plan de Real Moises\n\n${plan.slice(0, 40_000)}\n\n> Plan generado por IA. La implementación, validación y revisión automática están limitadas a esta ejecución.` }
});

async function github(endpoint, { method, body }) {
  const response = await fetch(`https://api.github.com${endpoint}`, { method, headers: headers(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`GitHub comment failed: ${response.status}`);
}
function headers() { return { Accept: "application/vnd.github+json", Authorization: `Bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" }; }
