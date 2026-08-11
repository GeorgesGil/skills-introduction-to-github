export async function mergeWithRetry({ attempt, wait = delay, maxAttempts = 6 }) {
  let last;
  for (let index = 0; index < maxAttempts; index += 1) {
    last = await attempt();
    if (last.status >= 200 && last.status < 300 && last.data?.merged === true) return last.data;
    if (![405, 409].includes(last.status) || index === maxAttempts - 1) break;
    await wait(2_000);
  }
  throw new Error(`GitHub merge failed ${last?.status ?? "unknown"}: ${last?.data?.message || "unknown"}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
