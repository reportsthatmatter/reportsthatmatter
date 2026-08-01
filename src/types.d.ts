/**
 * Wrangler bundles `*.md` and `*.yaml` as text modules (see the `rules` block in
 * wrangler.toml), so they import as plain strings.
 */
declare module "*.md" {
  const content: string;
  export default content;
}

declare module "*.yaml" {
  const content: string;
  export default content;
}
