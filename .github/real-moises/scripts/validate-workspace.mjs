import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const NODE_IMAGE = "node:24.18.0-bookworm-slim@sha256:d45d78e7929b46875bbd4e29bea672d5bc48186c6c3588306521c815e78352d6";
const PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.62.0-noble@sha256:02bbb2155cd7109e3e9c741941097ed1608cf8b6fa44ee2595896da2bdc1f471";
const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const syncOutputs = process.env.REAL_MOISES_SYNC_OUTPUTS === "true";
const stateRoot = path.join(process.env.RUNNER_TEMP || workspace, "real-moises", String(process.env.GITHUB_RUN_ID || "local"));
await mkdir(stateRoot, { recursive: true });
const isolatedRoot = await mkdtemp(path.join(stateRoot, "validation-workspace-"));
await cp(workspace, isolatedRoot, {
  recursive: true,
  filter(source) {
    const relative = path.relative(workspace, source).replaceAll("\\", "/");
    return relative !== ".git" && !relative.startsWith(".git/") && relative !== ".github" && !relative.startsWith(".github/") && relative !== "node_modules" && !relative.startsWith("node_modules/");
  }
});

let packageJson = {};
try { packageJson = JSON.parse(await readFile(path.join(isolatedRoot, "package.json"), "utf8")); } catch {}
const hasQa = Boolean(packageJson.scripts?.qa);
if (hasQa) {
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  if (dependencies["@playwright/test"] !== "1.62.0") throw new Error("QA requires exactly @playwright/test 1.62.0");
}

const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), "validate-workspace-worker.mjs");
const validationModule = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "validation.mjs");
const image = hasQa ? PLAYWRIGHT_IMAGE : NODE_IMAGE;
const result = spawnSync("docker", [
  "run", "--rm", "--init", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=512", "--memory=6g", "--cpus=2", "--shm-size=1g",
  "--mount", `type=bind,source=${isolatedRoot},target=/workspace`,
  "--mount", `type=bind,source=${worker},target=/validator.mjs,readonly`,
  "--mount", `type=bind,source=${validationModule},target=/validation.mjs,readonly`,
  "--workdir", "/workspace", "--env", "CI=true", "--env", "HOME=/tmp", image, "node", "/validator.mjs"
], { encoding: "utf8", timeout: 30 * 60_000, maxBuffer: 2 * 1024 * 1024, env: scrubbedEnv() });

if (syncOutputs) {
  await syncGeneratedLockfile(isolatedRoot, workspace);
  if (hasQa) await syncPassiveEvidence(isolatedRoot, workspace);
}
const diffCheck = spawnSync("git", ["diff", "--check"], { cwd: workspace, encoding: "utf8", timeout: 60_000, maxBuffer: 512 * 1024, env: scrubbedEnv() });
const validationLog = `${result.stdout || ""}\n${result.stderr || ""}\n$ git diff --check\n${diffCheck.stdout || ""}\n${diffCheck.stderr || ""}`.slice(-200_000);
const passed = !result.error && result.status === 0 && !diffCheck.error && diffCheck.status === 0;
await writeFile(path.join(stateRoot, "validation.log"), validationLog);
await writeFile(path.join(stateRoot, "validation.json"), `${JSON.stringify({ passed })}\n`);
await rm(isolatedRoot, { recursive: true, force: true });
if (result.error) throw result.error;
if (diffCheck.error) throw diffCheck.error;
if (!passed) process.exitCode = 1;

async function syncPassiveEvidence(sourceRoot, targetRoot) {
  const roots = [path.join(sourceRoot, "docs")];
  let total = 0;
  for (const root of roots) {
    for (const file of await walk(root)) {
      const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
      if (!isAllowedEvidence(relative)) continue;
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`QA evidence must be a regular file: ${relative}`);
      if (stat.size > 5 * 1024 * 1024 || (total += stat.size) > 25 * 1024 * 1024) throw new Error("QA evidence exceeds size limit");
      await atomicCopy(file, path.join(targetRoot, relative), targetRoot);
    }
  }
}
async function syncGeneratedLockfile(sourceRoot, targetRoot) {
  const source = path.join(sourceRoot, "package-lock.json");
  try {
    const stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024) throw new Error("generated package-lock.json is invalid");
    await atomicCopy(source, path.join(targetRoot, "package-lock.json"), targetRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
async function atomicCopy(source, destination, targetRoot) {
  const sourceStat = await lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`generated output must be a regular file: ${source}`);
  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true });
  const [rootReal, parentReal] = await Promise.all([realpath(targetRoot), realpath(parent)]);
  const expectedParent = path.resolve(rootReal, path.relative(targetRoot, parent));
  if (parentReal !== expectedParent) throw new Error(`generated output destination traverses a symlink: ${destination}`);
  try {
    const destinationStat = await lstat(destination);
    if (!destinationStat.isFile() || destinationStat.isSymbolicLink()) throw new Error(`generated output destination is not a regular file: ${destination}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = path.join(parent, `.real-moises-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(await readFile(source)); } finally { await handle.close(); }
  try { await rename(temporary, destination); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
function isAllowedEvidence(relative) {
  return /^docs\/[^/]*validation\.md$/i.test(relative) || /^docs\/evidence\/.+\.(png|jpg|jpeg|webp|json|md|txt)$/i.test(relative);
}
async function walk(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const full = path.join(root, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`QA evidence tree contains symlink: ${full}`);
      if (entry.isDirectory()) result.push(...await walk(full));
      else result.push(full);
    }
    return result;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
function scrubbedEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(GITHUB_|ACTIONS_|RUNNER_)|TOKEN|SECRET|KEY$/i.test(key) || ["OPENCODE_API_KEY", "GH_TOKEN", "GITHUB_TOKEN"].includes(key)) delete env[key];
  return env;
}
