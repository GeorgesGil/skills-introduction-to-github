export async function completeResolvedIssue({ repository, issueNumber, merge, request }) {
  await merge();
  await request(`/repos/${repository}/issues/${issueNumber}`, {
    method: "PATCH",
    body: { state: "closed", state_reason: "completed" }
  });
  await request(`/repos/${repository}/issues/${issueNumber}/labels/ready-for-agent`, {
    method: "DELETE",
    allowNotFound: true
  });
}
