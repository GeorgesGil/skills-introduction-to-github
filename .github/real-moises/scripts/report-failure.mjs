import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const stateRoot = path.join(process.env.RUNNER_TEMP, "real-moises", String(process.env.GITHUB_RUN_ID));
const log = await readFile(path.join(stateRoot, "validation.log"), "utf8").catch(() => "Validation did not produce a log.");
const response = await fetch(`https://api.github.com/repos/${event.repository.full_name}/issues/${event.issue.number}/comments`, {
  method: "POST",
  headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10" },
  body: JSON.stringify({ body: `Real Moises ejecutó la revisión automática, pero la reparación o la segunda validación falló. No se creó ni fusionó una PR.\n\n<details><summary>Validation log</summary>\n\n\`\`\`text\n${log.slice(-12_000)}\n\`\`\`\n</details>` })
});
if (!response.ok) throw new Error(`failure report failed: ${response.status}`);
process.exitCode = 1;
