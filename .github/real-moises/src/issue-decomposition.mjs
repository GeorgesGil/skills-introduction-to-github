const FENCE = /```real-moises-routing\s*\r?\n([\s\S]*?)\r?\n```/gi;
const MIN_CHILDREN = 2;
const MAX_CHILDREN = 12;

export function parseDecomposition(plan) {
  const matches = [...String(plan || "").matchAll(FENCE)];
  if (matches.length !== 1) throw new Error("plan must contain exactly one routing block");
  let manifest;
  try {
    manifest = JSON.parse(matches[0][1]);
  } catch (error) {
    throw new Error(`invalid routing JSON: ${error.message}`);
  }
  if (manifest?.version !== 1 || !["implement", "split"].includes(manifest.action)) {
    throw new Error("routing must use version 1 and action implement or split");
  }
  if (manifest.action === "implement") return null;
  if (!Array.isArray(manifest.issues)) throw new Error("split routing requires an issues array");
  if (manifest.issues.length < MIN_CHILDREN || manifest.issues.length > MAX_CHILDREN) {
    throw new Error(`decomposition must contain between ${MIN_CHILDREN} and ${MAX_CHILDREN} issues`);
  }
  const issues = manifest.issues.map((issue, index) => {
    const title = String(issue?.title || "").trim();
    const body = String(issue?.body || "").trim();
    if (!title || !body) throw new Error(`decomposition issue ${index + 1} requires title and body`);
    if (title.length > 120) throw new Error(`decomposition issue ${index + 1} title exceeds 120 characters`);
    if (body.length > 20_000) throw new Error(`decomposition issue ${index + 1} body exceeds 20000 characters`);
    return { title, body };
  });
  return { version: 1, reason: String(manifest.reason || "").trim().slice(0, 500), issues };
}

export async function routePlannedIssue({ repository, parentIssue, plan, request }) {
  const decomposition = parseDecomposition(plan);
  if (!decomposition) return { action: "implement", children: [] };

  const base = `/repos/${repository}`;
  const parentNumber = Number(parentIssue.number);
  const existing = await request(`${base}/issues/${parentNumber}/sub_issues?per_page=100`);
  if (!Array.isArray(existing)) throw new Error("GitHub sub-issue listing returned an invalid response");
  const childrenByIndex = new Map();
  for (const issue of existing || []) {
    const match = String(issue.body || "").match(new RegExp(`<!--\\s*real-moises-child parent=${parentNumber} index=(\\d+)\\s*-->`));
    if (match) childrenByIndex.set(Number(match[1]), issue);
  }
  const attachedIds = new Set((existing || []).map((issue) => issue.id));
  for (let page = 1; ; page += 1) {
    const repositoryIssues = await request(`${base}/issues?state=all&per_page=100&page=${page}`);
    if (!Array.isArray(repositoryIssues)) throw new Error("GitHub issue listing returned an invalid response");
    for (const issue of repositoryIssues) {
      if (issue.pull_request) continue;
      const match = String(issue.body || "").match(new RegExp(`<!--\\s*real-moises-child parent=${parentNumber} index=(\\d+)\\s*-->`));
      if (match && !childrenByIndex.has(Number(match[1]))) childrenByIndex.set(Number(match[1]), issue);
    }
    if (repositoryIssues.length < 100) break;
  }

  const children = [];
  let createdCount = 0;
  for (const [offset, specification] of decomposition.issues.entries()) {
    const index = offset + 1;
    let child = childrenByIndex.get(index);
    if (!child) {
      child = await request(`${base}/issues`, {
        method: "POST",
        body: {
          title: specification.title,
          body: `Parent: #${parentNumber}\n\n${specification.body}\n\n<!-- real-moises-child parent=${parentNumber} index=${index} -->`
        }
      });
    }
    if (!attachedIds.has(child.id)) {
      await request(`${base}/issues/${parentNumber}/sub_issues`, {
        method: "POST",
        body: { sub_issue_id: child.id }
      });
      attachedIds.add(child.id);
    }
    if (!childrenByIndex.has(index)) createdCount += 1;
    children.push(child);
  }

  for (let index = 1; index < children.length; index += 1) {
    const blockers = await request(`${base}/issues/${children[index].number}/dependencies/blocked_by?per_page=100`);
    if (!Array.isArray(blockers)) throw new Error("GitHub dependency listing returned an invalid response");
    if (!blockers.some((blocker) => blocker.id === children[index - 1].id)) {
      await request(`${base}/issues/${children[index].number}/dependencies/blocked_by`, {
        method: "POST",
        body: { issue_id: children[index - 1].id }
      });
    }
  }
  const firstLabels = (children[0].labels || []).map((label) => typeof label === "string" ? label : label.name);
  if (!firstLabels.includes("ready-for-agent")) {
    await request(`${base}/issues/${children[0].number}/labels`, {
      method: "POST",
      body: { labels: ["ready-for-agent"] }
    });
  }
  for (const child of children.slice(1)) {
    await request(`${base}/issues/${child.number}/labels/ready-for-agent`, {
      method: "DELETE",
      allowNotFound: true
    });
  }
  await request(`${base}/issues/${parentNumber}/labels/ready-for-agent`, {
    method: "DELETE",
    allowNotFound: true
  });
  const numbers = children.map((issue) => issue.number);
  if (createdCount > 0) {
    await request(`${base}/issues/${parentNumber}/comments`, {
      method: "POST",
      body: { body: `Real Moises dividió este epic en sub-issues atómicos: ${numbers.map((number) => `#${number}`).join(", ")}. Empezará automáticamente por #${numbers[0]} y continuará en orden.` }
    });
  }
  return { action: "split", children: numbers };
}
