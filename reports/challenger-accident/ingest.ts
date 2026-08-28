import { pipeline } from "../../scripts/ingest";

/**
 * How this report is built. Owned by the report: every decision that shaped
 * its text is named here, and the passes it composes are library code, so a
 * fix to a shared pass reaches every report that calls it.
 */
export default pipeline({
  id: "challenger-accident",
  title: "Investigation of the Challenger Accident",
  authors: "Committee on Science and Technology, U.S. House of Representatives",
  published_at: "October 1986",
  source_url: "https://www.govinfo.gov/app/details/GPO-CRPT-99hrpt1016",
  repo: "../challenger-accident",
  // Order is semantic: footnote numbering and page indices run continuously
  // across volumes, so reordering changes the output.
  volumes: [
    { path: "archive/GPO-CRPT-99hrpt1016-challenger-accident-1986.pdf", sha256: "eb04493120feaf98e1944634260a2ab8b81339308a2c665a9414853652a8560e" },
  ],
});
