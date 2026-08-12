import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

export const MAX_REVIEW_DIFF_BYTES = 1_000_000;

export function captureWorkspaceDiff(cwd, { run = spawnSync, maxBytes = MAX_REVIEW_DIFF_BYTES, readFile = readFileSync, lstat = lstatSync } = {}) {
  const intent = run("git", ["add", "--intent-to-add", "--all"], { cwd, encoding: "utf8", timeout: 60_000 });
  assertGitResult(intent, "prepare review diff");

  const result = run("git", ["diff", "--no-ext-diff", "--no-color", "HEAD"], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: maxBytes * 2
  });
  assertGitResult(result, "capture review diff");
  const numstatResult = run("git", ["diff", "--numstat", "-z", "HEAD"], { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: maxBytes });
  assertGitResult(numstatResult, "classify review paths");
  const binaryManifest = [];
  let binaryBytes = 0;
  for (const entry of parseNumstat(String(numstatResult.stdout || ""))) {
    if (!entry.binary) continue;
    const relative = entry.path;
    const absolute = path.resolve(cwd, relative);
    if (path.relative(path.resolve(cwd), absolute).startsWith("..")) throw new Error(`review blocked: binary path escapes workspace: ${relative}`);
    let stat;
    try { stat = lstat(absolute); } catch (error) {
      if (error?.code === "ENOENT") { binaryManifest.push(`${relative}\tdeleted\tsha256:none`); continue; }
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`review blocked: binary path is not a regular file: ${relative}`);
    binaryBytes += stat.size;
    if (binaryBytes > 50 * 1024 * 1024) throw new Error("review blocked: binary evidence exceeds 50 MiB");
    binaryManifest.push(`${relative}\t${stat.size}\tsha256:${createHash("sha256").update(readFile(absolute)).digest("hex")}`);
  }
  const diff = `${String(result.stdout || "")}\n--- VERIFIED BINARY MANIFEST ---\n${binaryManifest.join("\n")}\n--- END VERIFIED BINARY MANIFEST ---\n`;
  if (Buffer.byteLength(diff) > maxBytes) throw new Error(`review blocked: complete diff exceeds ${maxBytes} bytes`);
  return diff;
}

function parseNumstat(value) {
  const tokens = value.split("\0");
  const entries = [];
  for (let index = 0; index < tokens.length;) {
    const record = tokens[index++];
    if (!record) continue;
    const [added, deleted, ...pathParts] = record.split("\t");
    let filePath = pathParts.join("\t");
    if (!filePath) {
      index += 1;
      filePath = tokens[index++] || "";
    }
    if (!filePath) throw new Error("review blocked: malformed git numstat output");
    entries.push({ path: filePath, binary: added === "-" && deleted === "-" });
  }
  return entries;
}

function assertGitResult(result, operation) {
  if (result?.error) throw new Error(`could not ${operation}: ${result.error.message}`);
  if (result?.status !== 0) throw new Error(`could not ${operation}: ${(result?.stderr || result?.stdout || "git failed").trim()}`);
}
