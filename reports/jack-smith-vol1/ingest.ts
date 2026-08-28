import { pipeline } from "@rtm/ingest";

/**
 * How this report is built. Owned by the report: every decision that shaped
 * its text is named here, and the passes it composes are library code, so a
 * fix to a shared pass reaches every report that calls it.
 */
export default pipeline({
  id: "jack-smith-vol1",
  title: "Report of Special Counsel Jack Smith, Volume One: The Election Case",
  authors: "Jack Smith, Special Counsel, U.S. Department of Justice",
  published_at: "January 2025",
  source_url: "https://www.justice.gov/storage/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf",
  repo: "../jack-smith-report",
  // Order is semantic: footnote numbering and page indices run continuously
  // across volumes, so reordering changes the output.
  volumes: [
    { path: "archive/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf", sha256: "d0d26b1ff6fbe96e5280623c6467e70d867c306af768f9dd02556c87892d1e5c" },
  ],
});
