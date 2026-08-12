import { spawnSync } from "node:child_process";

export const MAX_REVIEW_DIFF_BYTES = 1_000_000;

export function captureWorkspaceDiff(cwd, { run = spawnSync, maxBytes = MAX_REVIEW_DIFF_BYTES } = {}) {
  const intent = run("git", ["add", "--intent-to-add", "--all"], { cwd, encoding: "utf8", timeout: 60_000 });
  assertGitResult(intent, "prepare review diff");

  const result = run("git", ["diff", "--no-ext-diff", "--no-color", "--binary", "HEAD"], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: maxBytes * 2
  });
  assertGitResult(result, "capture review diff");
  const diff = String(result.stdout || "");
  if (Buffer.byteLength(diff) > maxBytes) throw new Error(`review blocked: complete diff exceeds ${maxBytes} bytes`);
  return diff;
}

function assertGitResult(result, operation) {
  if (result?.error) throw new Error(`could not ${operation}: ${result.error.message}`);
  if (result?.status !== 0) throw new Error(`could not ${operation}: ${(result?.stderr || result?.stdout || "git failed").trim()}`);
}
