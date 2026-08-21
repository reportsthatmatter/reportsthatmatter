import { beforeEach, describe, expect, it } from "vitest";
import { memo, resetMemo } from "../src/lib/prepared";

beforeEach(() => resetMemo());

describe("memo", () => {
  it("does the expensive work once per key", () => {
    let calls = 0;
    const make = () => {
      calls++;
      return { html: "rendered" };
    };

    memo("jack-smith", make);
    memo("jack-smith", make);

    expect(calls).toBe(1);
  });

  it("hands back the same value, not a copy", () => {
    const first = memo("a", () => ({ html: "x" }));

    expect(memo("a", () => ({ html: "y" }))).toBe(first);
  });

  it("keeps different reports apart", () => {
    expect(memo("a", () => "one")).toBe("one");
    expect(memo("b", () => "two")).toBe("two");
  });

  it("forgets the least recently used, so an isolate cannot grow without bound", () => {
    let rebuilds = 0;
    const rebuild = () => {
      rebuilds++;
      return "value";
    };

    memo("a", rebuild);
    memo("b", rebuild);
    memo("c", rebuild); // evicts "a"
    memo("a", rebuild); // so this has to be built again

    expect(rebuilds).toBe(4);
  });

  it("counts a read as a use, so the report being read is the one kept", () => {
    let rebuilds = 0;
    const rebuild = () => {
      rebuilds++;
      return "value";
    };

    memo("a", rebuild);
    memo("b", rebuild);
    memo("a", rebuild); // "a" is now the most recently used
    memo("c", rebuild); // so "b" is evicted, not "a"
    memo("a", rebuild); // still held

    expect(rebuilds).toBe(3);
  });
});
