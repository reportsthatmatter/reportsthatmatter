import registryText from "../../reports/registry.yaml";
import wallStreet from "../../reports/us-psi-financial-crisis/full.md";
import jackSmithVol1 from "../../reports/jack-smith-vol1/full.md";
import changelogText from "../../docs/CHANGELOG.md";

export { changelogText };

export { registryText };

/**
 * Reports are bundled into the worker as text modules (wrangler.toml `rules`).
 * That keeps dev and production identical, at the cost of bundle size — watch
 * the deploy output as more reports land here.
 */
export const bundledReports: Record<string, string> = {
  "reports/us-psi-financial-crisis/full.md": wallStreet,
  "reports/jack-smith-vol1/full.md": jackSmithVol1,
};
