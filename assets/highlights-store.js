/* Highlights a reader keeps.
 *
 * Kept in the browser, deliberately. A reader who marks six passages and
 * exports them has had the whole value of the feature and given us nothing —
 * no account, no email, no record of what they read. Sync between devices is
 * the only thing an account would add, and it can be added later without
 * moving any of this: records carry their own ids, so signing in one day
 * uploads what is already here rather than starting over.
 *
 * The store takes its storage as an argument so it can be tested without a
 * browser, and so a future server-backed store is a drop-in.
 */
// @ts-check

const KEY = "rtm.highlights.v1";

/**
 * @typedef {{
 *   id: string,
 *   report: string, reportTitle: string,
 *   section: string, sectionTitle: string,
 *   paragraph: string, anchor: string,
 *   quote: string, page: number | null,
 *   url: string, created: number
 * }} Highlight
 *
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => void,
 *   removeItem: (key: string) => void
 * }} Storage
 */

/** @returns {string} */
function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** @param {Storage} storage */
export function createStore(storage) {
  /** @returns {Highlight[]} */
  function read() {
    try {
      const raw = storage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      // Unreadable storage is not worth taking the page down for.
      return [];
    }
  }

  /** @param {Highlight[]} records */
  function write(records) {
    try {
      storage.setItem(KEY, JSON.stringify(records));
    } catch (err) {
      /* full or blocked; the highlight is still on the page for this visit */
    }
  }

  return {
    /**
     * Newest first — the order a reader looks for what they just marked.
     *
     * Two highlights saved in the same millisecond are ordered by which was
     * added later, so the order never depends on the sort's stability.
     */
    all() {
      return read()
        .map((held, index) => ({ held, index }))
        .sort((a, b) => b.held.created - a.held.created || b.index - a.index)
        .map((entry) => entry.held);
    },

    /**
     * @param {Partial<Highlight>} record
     * @returns {Highlight}
     */
    add(record) {
      const records = read();
      const existing = records.find(
        (held) =>
          held.report === record.report &&
          held.paragraph === record.paragraph &&
          held.anchor === record.anchor
      );
      if (existing) return existing;

      const saved = /** @type {Highlight} */ ({
        ...record,
        id: record.id || newId(),
        created: record.created || Date.now(),
      });
      records.push(saved);
      write(records);
      return saved;
    },

    /** @param {string} id */
    remove(id) {
      write(read().filter((held) => held.id !== id));
    },

    /** @param {string} report */
    forReport(report) {
      return this.all().filter((held) => held.report === report);
    },

    /** Grouped for a page that lists them, newest highlight first within each. */
    byReport() {
      /** @type {{ report: string, title: string, highlights: Highlight[] }[]} */
      const groups = [];
      for (const held of this.all()) {
        let group = groups.find((candidate) => candidate.report === held.report);
        if (!group) {
          group = { report: held.report, title: held.reportTitle, highlights: [] };
          groups.push(group);
        }
        group.highlights.push(held);
      }
      return groups;
    },

    clear() {
      storage.removeItem(KEY);
    },
  };
}

/**
 * The export that makes this useful to the people the project is for: quote,
 * source, printed page, permalink — a citation that can be pasted into a draft.
 *
 * @param {Highlight[]} records
 * @returns {string}
 */
export function toMarkdown(records) {
  /** @type {string[]} */
  const out = [];
  /** @type {string | null} */
  let currentReport = null;

  for (const held of records) {
    if (held.report !== currentReport) {
      if (out.length) out.push("");
      out.push(`## ${held.reportTitle}`, "");
      currentReport = held.report;
    }

    const quoted = held.quote
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const where = [held.sectionTitle && `§ ${held.sectionTitle}`, held.page && `at ${held.page}`]
      .filter(Boolean)
      .join(", ");

    out.push(quoted, "");
    out.push(`— *${held.reportTitle}*${where ? `, ${where}` : ""} · [permalink](${held.url})`, "");
  }

  return out.join("\n").trim() + "\n";
}

/**
 * @param {Highlight[]} records
 * @returns {string}
 */
export function toJSON(records) {
  return JSON.stringify(records, null, 2);
}
