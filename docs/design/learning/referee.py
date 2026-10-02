"""LLM referee pilot for the page-break join decision (38s.8).

For each held-out page break in results/ambiguous-holdout.jsonl (plus a random
sample of the other held-out page breaks, for comparison), show Claude the end
of the previous page's body and the start of the next page, as pdftotext
-layout prints them (indentation kept), with few-shot examples from the
development reports, and ask: same paragraph (join) or new block (split)?

Calls `claude -p --model sonnet` with a minimal system prompt, 20 decisions
per call, and records tokens and cost. Answers are cached in
results/referee-cache.jsonl so a rerun costs nothing.

    python referee.py [--random N] [--model sonnet]
"""
import argparse, hashlib, json, os, random, re, subprocess, sys
import pandas as pd
from show import page_lines

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "results")
CACHE = os.path.join(OUT, "referee-cache.jsonl")

SYSTEM = (
    "You are checking how a PDF report was converted to text. Each case shows the last lines of one page's body text "
    "and the first lines of the next page's body text, with the original indentation (running heads, page numbers and "
    "footnotes may also appear). Decide whether the first body line of the next page continues the same paragraph or "
    "block quotation as the last body line of the previous page (JOIN), or starts a new paragraph, heading, list item or "
    "quotation (SPLIT). Clues: a sentence left unfinished; a first-line indent or hanging paragraph number on the new page; "
    "a short last line; a change between quotation and prose. Answer only with JSON."
)


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def locate(lines, text, tail):
    """Index of the line holding `text` (its last or first 30 chars)."""
    key = norm(text)[-30:] if tail else norm(text)[:30]
    key = key.strip()
    for i, l in (reversed(list(enumerate(lines))) if tail else enumerate(lines)):
        if key and key in norm(l):
            return i
    # fall back on a shorter key
    key = key[-15:] if tail else key[:15]
    for i, l in (reversed(list(enumerate(lines))) if tail else enumerate(lines)):
        if key and key in norm(l):
            return i
    return None


def context(row):
    a = page_lines(row["report"], int(row["prev_page"]))
    b = page_lines(row["report"], int(row["next_page"]))
    ia = locate(a, row["prev_text"], True)
    ib = locate(b, row["next_text"], False)
    if ia is None or ib is None:
        return None
    pa = a[max(0, ia - 3): ia + 1]
    pb = b[max(0, ib - 1): ib + 3]
    strip = lambda ls: [l.rstrip()[:130] for l in ls]
    return "END OF PAGE (last body line last):\n" + "\n".join(strip(pa)) + "\n--- page break ---\nSTART OF NEXT PAGE (first body line marked >>):\n" + "\n".join(
        (">>" + l if k == min(1, ib) else "  " + l) for k, l in enumerate(strip(pb)))


def few_shot(pool, n=16, seed=0):
    rnd = random.Random(seed)
    df = pd.read_json(pool, lines=True)
    picks = []
    # cover the error classes: capital continuations, lower-case quotes, finished sentence, citations, and true splits
    groups = [
        df[~df.ref_boundary & (df.ours_boundary) & df.next_text.str.match(r"^[A-Z]")],
        df[~df.ref_boundary & (df.ours_boundary) & df.next_text.str.match(r"^[a-z]")],
        df[~df.ref_boundary & df.prev_ends_sentence],
        df[~df.ref_boundary & df.next_text.str.match(r"^[\d(\"“]")],
        df[df.ref_boundary & ~df.prev_ends_sentence],
        df[df.ref_boundary & df.prev_ends_sentence],
        df[df.ref_boundary & (df.ref_next_type == "heading")],
        df[df.ref_boundary & (df.ref_next_type == "quote")],
    ]
    for g in groups:
        for _, r in g.sample(min(2, len(g)), random_state=rnd.randint(0, 9999)).iterrows():
            c = context(r)
            if c:
                picks.append((c, "SPLIT" if r.ref_boundary else "JOIN", r.report))
    rnd.shuffle(picks)
    return picks[:n]


def ask(model, shots, cases):
    prompt = "Examples, with the right answer:\n\n"
    for k, (c, ans, rep) in enumerate(shots):
        prompt += f"Example {k + 1} ({rep}):\n{c}\nAnswer: {ans}\n\n"
    prompt += "Now decide these cases. Reply with a JSON object mapping each case id to \"JOIN\" or \"SPLIT\", nothing else.\n\n"
    for cid, c in cases:
        prompt += f"Case {cid}:\n{c}\n\n"
    p = subprocess.run(["claude", "-p", "--model", model, "--output-format", "json", "--tools", "", "--system-prompt", SYSTEM, "--setting-sources", "", "--strict-mcp-config"],
                       input=prompt, capture_output=True, text=True, timeout=600)
    j = json.loads(p.stdout)
    m = re.search(r"\{[\s\S]*\}", j["result"])
    answers = json.loads(m.group(0)) if m else {}
    u = j["usage"]
    return answers, {"cost": j["total_cost_usd"], "in": u["input_tokens"] + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0), "out": u["output_tokens"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--random", type=int, default=130)
    ap.add_argument("--model", default="sonnet")
    ap.add_argument("--batch", type=int, default=20)
    a = ap.parse_args()
    amb = pd.read_json(os.path.join(OUT, "ambiguous-holdout.jsonl"), lines=True)
    amb["sample"] = "ambiguous"
    # random comparison sample from all held-out page breaks (not ambiguous)
    hold = pd.read_json(os.path.join(OUT, "holdout-pagebreaks.jsonl"), lines=True)
    key = lambda df: df.report + ":" + df.prev_page.astype(int).astype(str) + ":" + df.prev_text.str[-30:]
    rest = hold[~key(hold).isin(set(key(amb)))].sample(a.random, random_state=7).copy()
    rest["sample"] = "random"
    cases = pd.concat([amb, rest], ignore_index=True)
    cases["cid"] = [hashlib.sha1(k.encode()).hexdigest()[:8] for k in key(cases)]
    cache = {}
    if os.path.exists(CACHE):
        for l in open(CACHE):
            r = json.loads(l)
            cache[(r["cid"], r["model"])] = r
    shots = few_shot(os.path.join(OUT, "dev-pool.jsonl"))
    todo = []
    for _, r in cases.iterrows():
        if (r.cid, a.model) in cache:
            continue
        c = context(r)
        if c:
            todo.append((r.cid, c))
    spend = []
    for i in range(0, len(todo), a.batch):
        chunk = todo[i: i + a.batch]
        answers, usage = ask(a.model, shots, chunk)
        spend.append({**usage, "n": len(chunk)})
        with open(CACHE, "a") as f:
            for cid, _ in chunk:
                f.write(json.dumps({"cid": cid, "model": a.model, "answer": answers.get(cid) or answers.get(f"Case {cid}"), "batch_cost": usage["cost"], "batch_n": len(chunk), "batch_in": usage["in"], "batch_out": usage["out"]}) + "\n")
                cache[(cid, a.model)] = {"answer": answers.get(cid) or answers.get(f"Case {cid}"), "batch_cost": usage["cost"], "batch_n": len(chunk), "batch_in": usage["in"], "batch_out": usage["out"]}
        print(f"batch {i // a.batch + 1}: {len(chunk)} cases, ${usage['cost']:.4f}, {usage['in']} in / {usage['out']} out", file=sys.stderr)
    cases["referee"] = [cache.get((c, a.model), {}).get("answer") for c in cases.cid]
    cases["cost"] = [cache.get((c, a.model), {}).get("batch_cost", 0) / max(1, cache.get((c, a.model), {}).get("batch_n", 1)) for c in cases.cid]
    got = cases[cases.referee.isin(["JOIN", "SPLIT"])].copy()
    got["ref_join"] = ~got.ref_boundary.astype(bool)
    got["referee_join"] = got.referee == "JOIN"
    got["pipeline_join"] = ~got.ours_boundary.astype(bool)
    rows = []
    for (s, rep), g in list(got.groupby(["sample", "report"])) + [((s, "all"), g) for s, g in got.groupby("sample")]:
        rows.append((s, rep, len(g), (g.pipeline_join == g.ref_join).mean(), (g.tree_join == g.ref_join).mean() if g.tree_join.notna().all() else float("nan"),
                     (g.r2_join == g.ref_join).mean() if g.r2_join.notna().all() else float("nan"), (g.referee_join == g.ref_join).mean()))
    md = "# LLM referee pilot: page-break joins on held-out rows\n\nGenerated by `referee.py`. Model: " + a.model + f". Few-shot: {len(shots)} development examples. Cases with no context found in the PDF text are skipped ({len(cases) - len(got)}).\n\n"
    md += "| sample | report | n | pipeline | tree | R2 | referee |\n|---|---|---:|---:|---:|---:|---:|\n"
    for s, rep, n, p, t, r2, f in rows:
        md += f"| {s} | {rep} | {n} | {p:.1%} | {t:.1%} | {r2:.1%} | {f:.1%} |\n"
    tot_cost = sum(v.get("batch_cost", 0) / max(1, v.get("batch_n", 1)) for k, v in cache.items() if k[1] == a.model)
    nn = sum(1 for k in cache if k[1] == a.model)
    ins = sum(v.get("batch_in", 0) / max(1, v.get("batch_n", 1)) for k, v in cache.items() if k[1] == a.model)
    md += f"\nCost: ${tot_cost:.2f} for {nn} decisions, ${tot_cost / max(1, nn):.4f} per decision ({ins / max(1, nn):.0f} input tokens per decision, few-shot prompt shared by a batch of {a.batch}).\n"
    open(os.path.join(OUT, f"referee-{a.model}.md"), "w").write(md)
    got[["sample", "report", "prev_page", "next_page", "ref_boundary", "pipeline_join", "tree_join", "r2_join", "referee_join", "prev_text", "next_text"]].to_json(os.path.join(OUT, f"referee-{a.model}-rows.jsonl"), orient="records", lines=True)
    print(md)


if __name__ == "__main__":
    main()
