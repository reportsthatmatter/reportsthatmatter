"""Independent check of a hybrid report's printed-page anchors (reportsthatmatter-ivg.2).

    python3 anchors.py <report repo> [out.json]

The hybrid build stamps each block with the page its first word aligns to, and reports "pages anchored" from the
same alignment, so that number cannot fail. This does not use the aligner: for every paragraph or quotation of
8+ words in full.md it finds the paragraph's first 8 words in the raw `pdftotext -layout` text of the report's PDF
(one page at a time), reads that page's printed number off its own running head, and compares it with the
`%%page N%%` marker the paragraph sits under.

  right        the opening words occur on exactly one PDF page and its printed number is the paragraph's marker
  wrong        ... and it is another number (listed)
  ambiguous    the opening words occur on several pages (repeated text); counted consistent when the marker is one
  not located  no match: a note marker glued to a word inside the first 8 words, for instance

Needs `archive/*.pdf` in the repo (one volume) and the running head to carry the page number at its start or end
("Chapter 2: Outline of events before the day   49"); adapt `printed()` for another layout. Contents entries
("- Chapter 1 — 45") are skipped. Run it on the PDF build's full.md (git show <ref>:full.md) for the before figure.
"""
import glob, json, random, re, subprocess, sys
from collections import defaultdict

repo = sys.argv[1]
pdf = glob.glob(repo + "/archive/*.pdf")[0]
raw = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout.split("\f")


def toks(t):
    return re.findall(r"[a-z0-9]+", t.lower().replace("’", "'").replace("'", ""))


pages = [toks(p) for p in raw]


def printed(p):
    lines = [l for l in raw[p].split("\n") if l.strip()]
    for l in lines[:2] + lines[-2:]:
        m = re.match(r"^\s*(\d{1,3})\s{2,}\S", l) or re.search(r"\S\s{2,}(\d{1,3})\s*$", l) or re.match(r"^\s*(\d{1,3})\s*$", l)
        if m:
            return int(m.group(1))
    return None


pr = [printed(p) for p in range(len(raw))]
N = 8
idx = defaultdict(set)
for p, t in enumerate(pages):
    for i in range(len(t) - N + 1):
        idx[tuple(t[i : i + N])].add(p)

md = open(repo + "/full.md").read()
body = md.partition("\n## Notes\n")[0]
page = occ = None
res = []
for blk in body.split("\n\n"):
    m = re.fullmatch(r"%%page (\d+)(?:#(\d+))?%%", blk.strip())
    if m:
        page, occ = int(m.group(1)), m.group(2)
        continue
    if re.match(r"^(- .* — [0-9.]+\s*)+$", blk.strip()):
        continue
    t = re.sub(r"\[\^[^\]]*\]", "", blk)
    t = re.sub(r"^(>\s*|- |#+ )", "", t)
    w = toks(t)
    if len(w) < N or page is None:
        continue
    res.append((page, occ, set(idx.get(tuple(w[:N]), set())), blk[:60]))

right = wrong = amb = none = skipocc = cons = 0
bad = []
for page, occ, hits, txt in res:
    if not hits:
        none += 1
    elif len(hits) > 1:
        amb += 1
        cons += page in {pr[h] for h in hits}
    elif pr[next(iter(hits))] is None:
        none += 1
    elif occ:
        skipocc += 1
    else:
        h = next(iter(hits))
        if pr[h] == page:
            right += 1
        else:
            wrong += 1
            bad.append((page, pr[h], h + 1, txt))
print(f"paragraphs {len(res)}: right {right}, wrong {wrong}, ambiguous {amb} (consistent with a candidate page: {cons}), not located {none}, occurrence-tagged {skipocc}")
for b in bad[:40]:
    print(b)
if len(sys.argv) > 2:
    json.dump(bad, open(sys.argv[2], "w"))
