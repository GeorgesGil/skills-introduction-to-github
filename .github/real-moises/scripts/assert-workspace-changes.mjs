import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const event = JSON.parse(await readFile(process.env.REAL_MOISES_EVENT_PATH || process.env.GITHUB_EVENT_PATH, "utf8"));
const tracked = lines(git(["diff", "--name-only"]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));

if (tracked.length === 0 && untracked.length === 0) {
  const message = "Real Moises terminó la fase de implementación sin producir cambios en el workspace. Se detuvo antes de instalar dependencias o validar para evitar un PR vacío.";
  await comment(message);
  throw new Error("OpenCode implementation completed without workspace changes");
}

function git(args) {
  const result = spawnSync("git", args, { cwd: workspace, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${(result.stderr || "").slice(-2000)}`);
  return result.stdout || "";
}

function lines(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function comment(body) {
  const response = await fetch(`https://api.github.com/repos/${event.repository.full_name}/issues/${event.issue.number}/comments`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10"
    },
    body: JSON.stringify({ body })
  });
  if (!response.ok) throw new Error(`GitHub POST issue comment failed: ${response.status}`);
}
