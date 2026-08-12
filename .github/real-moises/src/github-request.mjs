export function createGitHubRequest({ token, fetchImpl = fetch }) {
  if (!token) throw new Error("GitHub token is required");
  return async function request(endpoint, { method = "GET", body, allowNotFound = false } = {}) {
    const response = await fetchImpl(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (allowNotFound && response.status === 404) return null;
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GitHub ${method} ${endpoint} failed: ${response.status}`);
    return data;
  };
}
