import { beforeEach, describe, expect, it } from "vitest";
import { createStore, toJSON, toMarkdown } from "../assets/highlights-store.js";

/** A stand-in for localStorage: the store must not care which it is given. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const record = (over = {}) => ({
  report: "litvinenko-inquiry",
  reportTitle: "The Litvinenko Inquiry",
  section: "conclusions",
  sectionTitle: "Conclusions",
  paragraph: "fsb-operation-kill-litvinenko",
  anchor: "was%20|probably%20approved|%20by",
  quote: "probably approved",
  page: 246,
  url: "https://reportsthatmatter.org/reports/litvinenko-inquiry/conclusions?p=x&h=y",
  ...over,
});

let store: ReturnType<typeof createStore>;

beforeEach(() => {
  store = createStore(memoryStorage());
});

describe("the store", () => {
  it("keeps a highlight and gives it an id of its own", () => {
    const saved = store.add(record());

    expect(saved.id).toBeTruthy();
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].quote).toBe("probably approved");
  });

  it("survives being reopened, which is the whole point", () => {
    const storage = memoryStorage();
    createStore(storage).add(record());

    expect(createStore(storage).all()).toHaveLength(1);
  });

  it("does not save the same passage twice", () => {
    store.add(record());
    store.add(record());

    expect(store.all()).toHaveLength(1);
  });

  it("treats a different passage in the same paragraph as its own highlight", () => {
    store.add(record());
    store.add(record({ anchor: "other|words here|other", quote: "words here" }));

    expect(store.all()).toHaveLength(2);
  });

  it("lists the newest first", () => {
    store.add(record({ quote: "first" }));
    store.add(record({ anchor: "b|second|b", quote: "second" }));

    expect(store.all().map((h) => h.quote)).toEqual(["second", "first"]);
  });

  it("removes a highlight by id", () => {
    const saved = store.add(record());
    store.remove(saved.id);

    expect(store.all()).toHaveLength(0);
  });

  it("groups by report, for a page that lists them", () => {
    store.add(record());
    store.add(record({ report: "jack-smith-vol1", reportTitle: "Jack Smith, Volume One" }));

    const groups = store.byReport();

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.title)).toContain("The Litvinenko Inquiry");
  });

  it("ignores storage it cannot read rather than losing the page", () => {
    const broken = {
      getItem: () => "{ not json",
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    expect(createStore(broken).all()).toEqual([]);
  });
});

describe("Markdown export", () => {
  it("writes a citation a journalist can paste into a draft", () => {
    store.add(record({ quote: "probably approved by Mr Patrushev" }));

    const markdown = toMarkdown(store.all());

    expect(markdown).toContain("## The Litvinenko Inquiry");
    expect(markdown).toContain("> probably approved by Mr Patrushev");
    expect(markdown).toContain("Conclusions");
    expect(markdown).toContain("at 246");
    expect(markdown).toContain(
      "https://reportsthatmatter.org/reports/litvinenko-inquiry/conclusions?p=x&h=y"
    );
  });

  it("groups a report's highlights under one heading", () => {
    store.add(record({ quote: "one" }));
    store.add(record({ anchor: "b|two|b", quote: "two" }));

    expect(toMarkdown(store.all()).match(/## The Litvinenko Inquiry/g)).toHaveLength(1);
  });

  it("leaves out the page when the source has none", () => {
    store.add(record({ page: null }));

    expect(toMarkdown(store.all())).not.toContain("at null");
  });

  it("quotes every line of a passage that runs long", () => {
    store.add(record({ quote: "a line\nand another" }));

    expect(toMarkdown(store.all())).toContain("> a line\n> and another");
  });
});

describe("JSON export", () => {
  it("round-trips, so anyone can script against it", () => {
    store.add(record());

    expect(JSON.parse(toJSON(store.all()))[0].quote).toBe("probably approved");
  });
});
