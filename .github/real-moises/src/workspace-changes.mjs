import { spawnSync } from "node:child_process";

export function hasWorkspaceChanges(cwd, { run = spawnSync } = {}) {
  const diff = run("git", ["diff", "--name-only"], { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024 });
  if (diff.error) throw diff.error;
  if (diff.status !== 0) throw new Error(`git diff failed: ${(diff.stderr || "").slice(-2000)}`);
  if (String(diff.stdout || "").trim()) return true;
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard"], { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024 });
  if (untracked.error) throw untracked.error;
  if (untracked.status !== 0) throw new Error(`git ls-files failed: ${(untracked.stderr || "").slice(-2000)}`);
  return Boolean(String(untracked.stdout || "").trim());
}
