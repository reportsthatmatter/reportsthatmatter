/**
 * Small text bundled into the worker script: the registry and the changelog.
 *
 * Report markdown used to be bundled here too, one text module per report —
 * which is why this file exists, and why the bundle-size gotcha in AGENTS.md
 * was real. It no longer needs to be: reports are pre-rendered to static
 * assets at build time (#115, `scripts/prerender.mjs`), so the Worker never
 * touches report markdown at all, bundled or otherwise.
 */
import registryText from "../../reports/registry.yaml";
import changelogText from "../../docs/CHANGELOG.md";

export { changelogText };

export { registryText };
