// Minimal GitHub REST client for one sticky PR comment. Uses only the token it is given.
import { MARKER } from "./format.mjs";

export async function upsertComment({ api = "https://api.github.com", repo, issue, token, body, fetchImpl = fetch }) {
  const h = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json", "user-agent": "nss-security-check-action" };
  const call = async (method, path, data) => {
    const r = await fetchImpl(`${api}${path}`, { method, headers: h, body: data ? JSON.stringify(data) : undefined });
    if (!r.ok) { const e = new Error(`${method} ${path} -> HTTP ${r.status}`); e.status = r.status; throw e; }
    return r.json();
  };
  let existing;
  for (let page = 1; page <= 10 && !existing; page++) {
    const list = await call("GET", `/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`);
    existing = list.find((c) => typeof c.body === "string" && c.body.includes(MARKER));
    if (list.length < 100) break;
  }
  if (existing) { await call("PATCH", `/repos/${repo}/issues/comments/${existing.id}`, { body }); return { action: "updated", id: existing.id }; }
  const c = await call("POST", `/repos/${repo}/issues/${issue}/comments`, { body });
  return { action: "created", id: c.id };
}
