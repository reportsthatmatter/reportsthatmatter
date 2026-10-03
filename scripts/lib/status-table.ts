/**
 * The answer to "must I republish?": per report, the content hash `pnpm publish-report` would publish
 * from this checkout's prerender against the one the site is serving.
 *
 * The served side is the public `x-rtm-content-version` header (docs/ARCHITECTURE.md): the hash being
 * served, or `assets` when the report has never been published and the deploy's own copy is what readers
 * get. It needs no secret, and it is what readers actually see, which `report_versions` alone is not
 * (a publish whose commit failed leaves uploaded objects that nothing points at).
 */
export type Served = { version: string } | { error: string };

export type Row = {
  id: string;
  local: string;
  served: string | null;
  /** current: nothing to do. drift: republish. unpublished: never published, served from the deploy. error: could not tell. */
  state: "current" | "drift" | "unpublished" | "error";
  detail?: string;
};

export function classify(id: string, local: string, served: Served): Row {
  if ("error" in served) return { id, local, served: null, state: "error", detail: served.error };
  if (served.version === "assets") return { id, local, served: "assets", state: "unpublished" };
  return { id, local, served: served.version, state: served.version === local ? "current" : "drift" };
}

const short = (hash: string | null) => (hash === null ? "-" : hash === "assets" ? "assets" : hash.slice(0, 12));

const LABEL: Record<Row["state"], string> = {
  current: "current",
  drift: "DRIFT: republish",
  unpublished: "not published (deploy copy)",
  error: "unknown",
};

export function formatTable(rows: Row[], base: string): string {
  const width = Math.max(6, ...rows.map((r) => r.id.length));
  const lines = [`published content against this checkout's prerender (${base})`, ""];
  lines.push(`  ${"report".padEnd(width)}  ${"local".padEnd(12)}  ${"served".padEnd(12)}  state`);
  for (const r of rows) {
    lines.push(`  ${r.id.padEnd(width)}  ${short(r.local).padEnd(12)}  ${short(r.served).padEnd(12)}  ${LABEL[r.state]}${r.detail ? ` (${r.detail})` : ""}`);
  }
  const todo = rows.filter((r) => r.state === "drift" || r.state === "unpublished");
  const unknown = rows.filter((r) => r.state === "error");
  lines.push("");
  if (!todo.length && !unknown.length) lines.push(`all ${rows.length} report(s) are serving what this checkout would publish.`);
  if (todo.length) {
    lines.push(`${todo.length} of ${rows.length} report(s) need publishing: ${todo.map((r) => r.id).join(", ")}`);
    lines.push(`  RTM_PUBLISH_SECRET=$(cat ~/.rtm-publish-secret) pnpm publish-report <id> --base ${base}`);
  }
  if (unknown.length) lines.push(`${unknown.length} report(s) could not be read: ${unknown.map((r) => r.id).join(", ")}`);
  return lines.join("\n");
}
