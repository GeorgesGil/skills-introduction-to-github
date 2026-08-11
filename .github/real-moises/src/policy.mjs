const SENSITIVE_PATHS = [
  /^\.github\//i,
  /(^|\/)\.agents?(\/|$)/i,
  /(^|\/)\.opencode(\/|$)/i,
  /(^|\/)opencode\.jsonc?$/i,
  /(^|\/)\.env($|\.)/i,
  /credentials?/i,
  /secrets?/i,
  /\.pem$/i,
  /\.key$/i
];

export function evaluateChangeSet({ validationPassed, paths }) {
  if (!validationPassed) return { decision: "block", reason: "validation-failed" };
  if (!Array.isArray(paths) || paths.length === 0) return { decision: "block", reason: "no-changes" };
  if (paths.length > 100) return { decision: "block", reason: "change-set-too-large" };
  for (const value of paths) {
    const path = String(value).replaceAll("\\", "/");
    if (SENSITIVE_PATHS.some((pattern) => pattern.test(path))) {
      return { decision: "block", reason: `sensitive-path:${path}` };
    }
  }
  return { decision: "merge", reason: "green-safe-change-set" };
}
