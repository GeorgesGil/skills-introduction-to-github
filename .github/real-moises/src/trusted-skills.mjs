import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const PHASE_SKILLS = Object.freeze({
  repair: ["code-review", "diagnosing-bugs"]
});
const EXPECTED_SOURCE = Object.freeze({
  repository: "mattpocock/skills",
  commit: "84fdeffd12f2ee307994d1eb6feb48173b6e0502"
});

export async function loadTrustedSkillBundle(runtimeRoot, phase) {
  const names = [...(PHASE_SKILLS[phase] || [])];
  const sourcePath = path.join(runtimeRoot, "trusted-skills", "mattpocock", "source.json");
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  if (source.repository !== EXPECTED_SOURCE.repository || source.commit !== EXPECTED_SOURCE.commit) {
    throw new Error("trusted skill source provenance check failed");
  }
  if (names.length === 0) return { names, source, instructions: "" };

  const blocks = await Promise.all(names.map(async (name) => {
    if (!source.paths?.[name]) throw new Error(`trusted skill is not declared in source manifest: ${name}`);
    const relativePath = `${name}/SKILL.md`;
    const bytes = await readFile(path.join(runtimeRoot, "trusted-skills", "mattpocock", name, "SKILL.md"));
    const expectedHash = source.sha256?.[relativePath];
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (!expectedHash || actualHash !== expectedHash) throw new Error(`trusted skill integrity check failed: ${relativePath}`);
    const contents = bytes.toString("utf8");
    return `## Trusted skill: ${name}\n\n${contents.trim()}`;
  }));
  return { names, source, instructions: blocks.join("\n\n") };
}
