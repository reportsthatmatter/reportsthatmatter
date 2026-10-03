/**
 * Regenerate tests/fixtures/schemaorg-subset.json: the slice of the schema.org vocabulary
 * that the site's JSON-LD uses (y2y8.4), so tests/structured-data.test.ts can check every
 * emitted property is valid on its type and every value has an accepted type, offline.
 *
 *   node scripts/schemaorg-subset.mjs [path/to/schemaorg-current-https.jsonld]
 *
 * With no argument it fetches https://schema.org/version/latest/schemaorg-current-https.jsonld.
 * Re-run it when a type is added to src/lib/structured-data.ts; commit the result.
 */
import { readFileSync, writeFileSync } from "node:fs";

const ROOT_TYPES = ["Report", "WebPage", "WebSite", "Organization", "BreadcrumbList", "ListItem", "CreativeWork"];
const source = process.argv[2];
const vocab = JSON.parse(source ? readFileSync(source, "utf8") : await (await fetch("https://schema.org/version/latest/schemaorg-current-https.jsonld")).text());
const graph = new Map(vocab["@graph"].map((node) => [node["@id"], node]));
const ids = (value) => (value ? [].concat(value).map((v) => (typeof v === "string" ? v : v["@id"]).replace("schema:", "")) : []);
const strip = (id) => id.replace("schema:", "");

const types = {};
const wanted = new Set(ROOT_TYPES);
const queue = [...ROOT_TYPES];
while (queue.length) {
  const name = queue.shift();
  const node = graph.get(`schema:${name}`);
  if (!node) throw new Error(`${name} is not in the vocabulary`);
  const parents = ids(node["rdfs:subClassOf"]);
  types[name] = parents;
  for (const parent of parents) if (!wanted.has(parent)) { wanted.add(parent); queue.push(parent); }
}

const properties = {};
for (const node of graph.values()) {
  if (!ids(node["@type"]).includes("rdf:Property")) continue;
  const domain = ids(node["schema:domainIncludes"]);
  if (!domain.some((d) => wanted.has(d))) continue;
  properties[strip(node["@id"])] = { domain, range: ids(node["schema:rangeIncludes"]) };
}

writeFileSync(new URL("../tests/fixtures/schemaorg-subset.json", import.meta.url), JSON.stringify({ source: "schema.org " + (vocab["schema:version"] ?? "current"), types, properties }, null, 1) + "\n");
console.log(`${Object.keys(types).length} types, ${Object.keys(properties).length} properties`);
