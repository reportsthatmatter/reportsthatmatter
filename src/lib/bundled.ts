import registryText from "../../reports/registry.yaml";
import wallStreet from "../../reports/samples/us-senate-wall-street-and-financial-crisis/full.md";
import jackSmithVol1 from "../../reports/jack-smith-vol1/full.md";

export { registryText };

/**
 * Reports are bundled into the worker as text modules (wrangler.toml `rules`).
 * That keeps dev and production identical, at the cost of bundle size — watch
 * the deploy output as more reports land here.
 */
export const bundledReports: Record<string, string> = {
  "reports/samples/us-senate-wall-street-and-financial-crisis/full.md": wallStreet,
  "reports/jack-smith-vol1/full.md": jackSmithVol1,
};
