export async function completeResolvedIssue({ repository, issueNumber, merge, request, defaultBranch }) {
  await merge();
  await closeIssue({ repository, issueNumber, request });
  await advanceParent({ repository, issueNumber, request, defaultBranch });
}

async function closeIssue({ repository, issueNumber, request }) {
  await request(`/repos/${repository}/issues/${issueNumber}`, {
    method: "PATCH",
    body: { state: "closed", state_reason: "completed" }
  });
  await request(`/repos/${repository}/issues/${issueNumber}/labels/ready-for-agent`, {
    method: "DELETE",
    allowNotFound: true
  });
}

async function advanceParent({ repository, issueNumber, request, defaultBranch }) {
  const base = `/repos/${repository}`;
  const parent = await request(`${base}/issues/${issueNumber}/parent`, { allowNotFound: true });
  if (!parent?.number) return;

  const siblings = await request(`${base}/issues/${parent.number}/sub_issues?per_page=100`);
  const openSiblings = (siblings || []).filter((issue) => issue.state === "open" && issue.number !== issueNumber);
  for (const sibling of openSiblings) {
    const blockers = await request(`${base}/issues/${sibling.number}/dependencies/blocked_by?per_page=100`);
    if (!Array.isArray(blockers)) throw new Error("GitHub dependency listing returned an invalid response");
    if (blockers.some((blocker) => blocker.state === "open" && blocker.number !== issueNumber)) continue;
    const labels = (sibling.labels || []).map((label) => typeof label === "string" ? label : label.name);
    if (!labels.includes("ready-for-agent")) {
      await request(`${base}/issues/${sibling.number}/labels`, {
        method: "POST",
        body: { labels: ["ready-for-agent"] }
      });
    }
    if (!defaultBranch) throw new Error("default branch is required to dispatch the next sub-issue");
    await request(`${base}/actions/workflows/real-moises-issue-resolver.yml/dispatches`, {
      method: "POST",
      body: { ref: defaultBranch, inputs: { issue_number: String(sibling.number), issue_title: String(sibling.title || `Issue #${sibling.number}`).slice(0, 120) } }
    });
    return;
  }

  if (openSiblings.length > 0) return;

  await closeIssue({ repository, issueNumber: parent.number, request });
  await advanceParent({ repository, issueNumber: parent.number, request, defaultBranch });
}
