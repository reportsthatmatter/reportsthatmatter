#!/usr/bin/env python3
"""Mirror and normalise reference editions (reportsthatmatter-38s.2).

A reference edition is an independent clean text of a report (official HTML,
court reporter text, the PDF's own structure tree). This script copies each one
into its report repo once, under reference/, with its SHA-256, source URL and
licence (reference/manifest.json), and normalises it to a simple structured
form the scorer reads (reference/blocks.jsonl):

  {"i": 12, "type": "paragraph", "level": null, "num": "3.71", "text": "...",
   "section": "Chapter 3", "markers": [{"label": "1", "offset": 211, "note": "3-17"}]}
  {"i": 13, "type": "note", "id": "3-17", "label": "1", "text": "...", "ref": 12, ...}

  type: heading | paragraph | quote | list | note | table | contents
  level: heading level, 1 = the edition's top level (report-relative)
  num: the printed paragraph number, where the edition prints one
  markers: footnote markers removed from `text`, at character `offset`, with the note id they link to
  ref (notes): index of the block carrying the note's marker

Usage (from the site repo root; report repos are found through reports/manifest.yaml):

  python3 scripts/score/reference.py fetch <id>     # download raw files into <repo>/reference/raw/
  python3 scripts/score/reference.py build <id>     # raw -> blocks.jsonl, update manifest.json
  python3 scripts/score/reference.py all <id>       # both
  python3 scripts/score/reference.py list

  RTM_REPO_ROOT=DIR  use DIR/<repo> (report-repo worktrees) instead of the sibling checkouts
  --cache DIR   read raw files from DIR (same file names) instead of the network, still recording the source URL

Holds the development set (us-911-commission, uk-saville-inquiry,
us-v-philip-morris) and the held-out set (uk-hillsborough-panel,
columbia-accident, uk-chilcot-inquiry, us-duelfer-report). Tagged-PDF builds
need pikepdf and pdfplumber (python3 -m venv v && v/bin/pip install pikepdf pdfplumber).
Stdlib only otherwise.
"""
import datetime
import hashlib
import html
import json
import os
import re
import shutil
import sys
import time
import urllib.request
from html.parser import HTMLParser

NORMALISER_VERSION = 2
SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

PUBLIC_DOMAIN = "Public domain: a work of the United States Government (17 U.S.C. § 105)."
CROWN = "Crown copyright, reused under the Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)."

WAYBACK_SAVILLE_PART = "https://web.archive.org/web/2011id_/http://report.bloody-sunday-inquiry.org/volume01/{name}/"
WAYBACK_SAVILLE = "https://web.archive.org/web/2011id_/http://report.bloody-sunday-inquiry.org/volume01/chapter{n:03d}/"
WAYBACK_HILLS = "https://web.archive.org/web/2id_/http://hillsborough.independent.gov.uk/report/main-section/{path}/"
# the pages Wayback holds (38s.12; chapters 4, 7, 8 and 9 are mostly missing): name -> website path
HILLS_PAGES = ['part-1-page-1.html', 'part-1-page-3.html', 'part-1-page-4.html', 'part-1-page-5.html', 'part-1-page-6.html', 'part-1-page-7.html', 'part-1-page-8.html', 'part-1-page-9.html', 'part-1-page-10.html', 'part-1-page-11.html', 'part-1-page-12.html', 'part-1-page-13.html', 'ch1-page-1.html', 'ch1-page-2.html', 'ch1-page-3.html', 'ch1-page-4.html', 'ch1-page-5.html', 'ch1-page-6.html', 'ch1-page-7.html', 'ch1-page-8.html', 'ch1-page-9.html', 'ch1-page-10.html', 'ch1-page-11.html', 'ch2-page-1.html', 'ch2-page-2.html', 'ch2-page-3.html', 'ch2-page-4.html', 'ch2-page-5.html', 'ch2-page-6.html', 'ch2-page-7.html', 'ch2-page-8.html', 'ch3-page-1.html', 'ch3-page-2.html', 'ch3-page-3.html', 'ch3-page-4.html', 'ch3-page-5.html', 'ch3-page-6.html', 'ch3-page-7.html', 'ch3-page-8.html', 'ch3-page-9.html', 'ch4-page-2.html', 'ch4-page-12.html', 'ch4-page-13.html', 'ch5-page-1.html', 'ch5-page-2.html', 'ch5-page-3.html', 'ch5-page-4.html', 'ch5-page-5.html', 'ch5-page-6.html', 'ch5-page-7.html', 'ch5-page-8.html', 'ch5-page-9.html', 'ch5-page-10.html', 'ch5-page-11.html', 'ch5-page-12.html', 'ch5-page-13.html', 'ch6-page-1.html', 'ch6-page-2.html', 'ch6-page-3.html', 'ch6-page-4.html', 'ch6-page-5.html', 'ch6-page-6.html', 'ch6-page-7.html', 'ch6-page-9.html', 'ch6-page-11.html', 'ch6-page-12.html', 'ch6-page-13.html', 'ch6-page-14.html', 'ch6-page-15.html', 'ch7-page-1.html', 'ch7-page-15.html', 'ch8-page-1.html', 'ch8-page-2.html', 'ch8-page-3.html', 'ch8-page-4.html', 'ch8-page-5.html', 'ch8-page-6.html', 'ch9-page-11.html', 'ch10-page-1.html', 'ch10-page-2.html', 'ch10-page-3.html', 'ch10-page-4.html', 'ch10-page-5.html', 'ch10-page-6.html', 'ch10-page-11.html', 'ch11-page-1.html', 'ch11-page-2.html', 'ch11-page-3.html', 'ch11-page-4.html', 'ch11-page-5.html', 'ch11-page-6.html', 'ch11-page-7.html', 'ch11-page-8.html', 'ch11-page-9.html', 'ch11-page-10.html', 'ch12-page-1.html', 'ch12-page-2.html', 'ch12-page-3.html', 'ch12-page-4.html', 'ch12-page-5.html', 'ch12-page-6.html', 'ch12-page-7.html', 'ch12-page-9.html']


def hills_path(name):
    m = re.match(r"^(?:part-(\d+)|ch(\d+))-page-(\d+)\.html$", name)
    part, ch, page = m.groups()
    return f"part-{part}/page-{page}" if part else f"part-2/chapter-{ch}/page-{page}"


WAYBACK_DUELFER = "https://web.archive.org/web/20110202012150id_/https://www.cia.gov/library/reports/general-reports-1/iraq_wmd_2004/{name}.html"

REFERENCES = {
    "us-911-commission": {
        "set": "development",
        "adapter": "commission911",
        "edition": "The 9/11 Commission's own HTML edition (one file per chapter plus Notes), UNT CyberCemetery archive of 9-11commission.gov",
        "licence": PUBLIC_DOMAIN,
        "files": [
            (f"https://govinfo.library.unt.edu/911/report/911Report_{c}.htm", f"911Report_{c}.htm")
            for c in ["Exec", "FM", "Pref"] + [f"Ch{i}" for i in range(1, 14)] + ["App", "Notes"]
        ],
        "caveats": [
            "No printed page numbers in the HTML.",
            "Endnote links are positional: marker N in chapter C is note N under chapter C's heading in Notes.",
            "The executive summary (Exec) is a separate publication, not in our PDF: expect it unaligned.",
            "Run-in bold subheads followed by a line break are typed as headings (level 3); bold run-ins followed by a full stop stay in the paragraph.",
        ],
    },
    "uk-saville-inquiry": {
        "set": "development",
        "adapter": "saville",
        "edition": "Report of the Bloody Sunday Inquiry, Volume I, chapters 1-9, the Inquiry's report website (report.bloody-sunday-inquiry.org), via the Wayback Machine (UKGWA blocks scripts)",
        "licence": CROWN,
        # the general introduction and glossary live under volume01/ too (ivg.2); mirrored, but build_saville
        # reads chapters 1-9 only, so they are not in blocks.jsonl
        "files": [(WAYBACK_SAVILLE.format(n=n), f"chapter{n:03d}.html") for n in range(1, 10)]
        + [(WAYBACK_SAVILLE_PART.format(name=name), f"{name}.html") for name in ("general-introduction", "glossary")],
        "caveats": [
            "Footnote numbers restart in every paragraph on the website; notes are matched to ours by body text, not number.",
            "Post-publication corrections were not compared with the PDF (HC 29-I, 15 June 2010).",
        ],
    },
    "us-v-philip-morris": {
        "set": "development",
        "adapter": "cap",
        "edition": "United States v. Philip Morris USA, Inc., 449 F. Supp. 2d 1 (D.D.C. 2006), Caselaw Access Project (static.case.law)",
        "licence": "Public domain: a United States court opinion; CAP data published without use restrictions.",
        "files": [
            ("https://static.case.law/f-supp-2d/449/html/0001-01.html", "0001-01.html"),
            ("https://static.case.law/f-supp-2d/449/cases/0001-01.json", "0001-01.json"),
        ],
        "version": {
            "differs": True,
            "reference": "Final opinion of 17 August 2006 as printed in the reporter (449 F. Supp. 2d 1), OCR of a library scan",
            "ours": "Amended final opinion filed 8 September 2006 (docket document 5750)",
            "policy": "Unaligned stretches are version differences until shown otherwise: the scorer excludes them from structural metrics and reports them separately.",
        },
        "caveats": [
            "CAP has no heading markup: headings are inferred from short labelled lines (I., A., 1., a.) and short all-caps lines.",
            "OCR text (CAP mean confidence 0.664): character errors, especially in tables.",
            "Star pages (*15) are the reporter's, not the PDF's; kept as `page` on each block.",
        ],
    },
    "uk-hillsborough-panel": {
        "set": "held-out",
        "adapter": "tagged",
        "edition": "The panel website's HTML (Wayback captures) where captured, and the PDF's own structure tree (tagged PDF, InDesign styles) for the rest",
        "licence": CROWN,
        "numbered": True,
        "notes_by_size": True,
        "html_overlay": True,
        "files": [(WAYBACK_HILLS.format(path=hills_path(n)), n) for n in HILLS_PAGES],
        "caveats": [
            "A hybrid. The website HTML holds each paragraph in its own element, so unnumbered paragraphs are separate, footnotes are linked and a paragraph is never cut at a page break. Wayback holds about two thirds of its pages (chapters 4, 7, 8 and 9 are mostly missing): a stretch whose printed paragraph numbers the HTML has is taken from the HTML, the rest from the PDF's tags.",
            "The tags put one /P element around all the paragraphs between headings on a page: split at printed paragraph numbers (2.1.60), so unnumbered paragraphs inside one element are not separated in the stretches taken from the tags.",
            "In the tags a fragment that continues an unfinished paragraph (past the page's notes) is joined to it, whatever its first letter; footnotes sit inside the page's /P in the note size (9 pt against 12 pt) and are taken out by size.",
        ],
    },
    "columbia-accident": {
        "set": "held-out",
        "adapter": "tagged",
        "edition": "The PDF's own structure tree (tagged PDF, InDesign styles, role-mapped)",
        "licence": PUBLIC_DOMAIN,
        "files": [],
        "caveats": ["About a quarter of our text (figures, tables, front matter) is not in the tags.", "Soft hyphens remain in the tag text."],
    },
    "uk-chilcot-inquiry": {
        "set": "held-out",
        "adapter": "tagged",
        "edition": "The executive summary PDF's own structure tree (tagged PDF, InDesign styles, role-mapped)",
        "licence": CROWN,
        "files": [],
        "caveats": [
            "Names marked up as links are missing from marked content (roughly 15% of words).",
            "Bulleted findings are kept inside the paragraph above ('...included:\u2022 a \u2022 b'): split into list blocks at the bullets.",
            "One /P per page run: a fragment that continues an unfinished paragraph (past the page's notes) is joined to it, whatever its first letter.",
        ],
    },
    "us-duelfer-report": {
        "set": "held-out",
        "adapter": "duelfer",
        "edition": "Comprehensive Report of the Special Advisor to the DCI on Iraq's WMD, CIA reading-room HTML (chapters 1-2 are volume 1), via the Wayback Machine",
        "licence": PUBLIC_DOMAIN,
        "files": [(WAYBACK_DUELFER.format(name=n), f"{n}.html") for n in ["chap1", "chap2"]],
        "caveats": ["The HTML omits the key findings, annexes and notes our volume 1 PDF holds."],
    },
}


# ---------------------------------------------------------------- repos


def repo_dir(report_id):
    d = _repo_dir(report_id)
    # RTM_REPO_ROOT: a directory of report-repo worktrees (same basenames) to use instead of the siblings
    alt = os.environ.get("RTM_REPO_ROOT")
    if alt and os.path.isdir(os.path.join(alt, os.path.basename(d))):
        return os.path.join(alt, os.path.basename(d))
    return d


def _repo_dir(report_id):
    text = open(os.path.join(SITE, "reports/manifest.yaml"), encoding="utf-8").read()
    for m in re.finditer(r"- id: (\S+)\n\s+dir: (\S+)", text):
        if m.group(1) == report_id:
            return os.path.abspath(os.path.join(SITE, m.group(2)))
    # unmigrated or queued reports: a sibling repo of the same name
    sibling = os.path.abspath(os.path.join(SITE, "..", report_id))
    if os.path.isdir(sibling):
        return sibling
    raise SystemExit(f"no report repo for {report_id}")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def manifest_path(report_id):
    return os.path.join(repo_dir(report_id), "reference", "manifest.json")


def read_manifest(report_id):
    p = manifest_path(report_id)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def write_manifest(report_id, m):
    p = manifest_path(report_id)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2, ensure_ascii=False)
        f.write("\n")


def fetch(report_id, cache=None):
    spec = REFERENCES[report_id]
    raw = os.path.join(repo_dir(report_id), "reference", "raw")
    os.makedirs(raw, exist_ok=True)
    sources = []
    for url, name in spec["files"]:
        out = os.path.join(raw, name)
        resolved = url
        if cache and os.path.exists(os.path.join(cache, name)):
            shutil.copyfile(os.path.join(cache, name), out)
            if "web.archive.org" in url:  # provenance: which capture the cache copy came from (best effort)
                for attempt in range(3):
                    try:
                        head = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "reportsthatmatter reference mirror (rufus@lifeitself.org)"})
                        resolved = urllib.request.urlopen(head, timeout=60).geturl()
                        break
                    except Exception:
                        time.sleep(3 * (attempt + 1))
        else:
            err = None
            for attempt in range(6):
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "reportsthatmatter reference mirror (rufus@lifeitself.org)"})
                    resp = urllib.request.urlopen(req, timeout=180)
                    data = resp.read()
                    resolved = resp.geturl()
                    open(out, "wb").write(data)
                    err = None
                    break
                except Exception as e:  # Wayback refuses connections under load
                    err = e
                    time.sleep(5 * (attempt + 1))
            if err:
                raise SystemExit(f"{url}: {err}")
        src = {"path": f"reference/raw/{name}", "url": url, "sha256": sha256(out), "bytes": os.path.getsize(out)}
        if resolved != url:
            src["captured"] = resolved
        sources.append(src)
        print(f"  {name} {os.path.getsize(out):,} bytes")
    m = read_manifest(report_id)
    m.update(
        {
            "report": report_id,
            "set": spec["set"],
            "edition": spec["edition"],
            "licence": spec["licence"],
            "fetched": datetime.date.today().isoformat(),
            "sources": sources,
        }
    )
    write_manifest(report_id, m)


# ---------------------------------------------------------------- html events


class Events(HTMLParser):
    """Flattens HTML into (kind, tag, attrs|text) events; tolerant of HTML 4 unclosed <p>."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ev = []

    def handle_starttag(self, tag, attrs):
        self.ev.append(("start", tag, dict(attrs)))

    def handle_startendtag(self, tag, attrs):
        self.ev.append(("start", tag, dict(attrs)))
        self.ev.append(("end", tag, None))

    def handle_endtag(self, tag):
        self.ev.append(("end", tag, None))

    def handle_data(self, data):
        self.ev.append(("text", None, data))


def events(text):
    p = Events()
    p.feed(text)
    p.close()
    return p.ev


def clean(text):
    text = text.replace(" ", " ").replace("­", "").replace("\r", " ")
    return re.sub(r"\s+", " ", text).strip()


class Builder:
    """Accumulates blocks; markers are recorded at the character offset where they occur."""

    def __init__(self):
        self.blocks = []
        self.cur = None
        self.section = ""

    def open(self, type_, level=None, **extra):
        self.flush()
        self.cur = {"type": type_, "level": level, "parts": [], "markers": [], **extra}

    def text(self, s, implicit="paragraph"):
        if self.cur is None:
            if not s.strip():
                return
            self.open(implicit)
        self.cur["parts"].append(s)

    def current_text(self):
        return clean("".join(self.cur["parts"])) if self.cur else ""

    def marker(self, label, note=None):
        if self.cur is None:
            self.open("paragraph")
        raw = "".join(self.cur["parts"])
        # offset in the cleaned text: clean the prefix (keeping a trailing space if there was one)
        prefix = clean(raw)
        self.cur["markers"].append({"label": label, "offset": len(prefix), "note": note})

    def flush(self):
        c = self.cur
        self.cur = None
        if c is None:
            return None
        text = clean("".join(c.pop("parts")))
        if not text:
            return None
        block = {"type": c.pop("type"), "level": c.pop("level"), "num": None, "text": text, "section": c.pop("section", None) or self.section, "markers": c.pop("markers")}
        for m in block["markers"]:
            m["offset"] = min(m["offset"], len(text))
        block.update({k: v for k, v in c.items() if v is not None})
        if block["type"] in ("paragraph", "quote", "list"):
            n = re.match(r"^(\d{1,3}(?:\.\d{1,4})+|\d{1,4}\.)\s", text)
            if n:
                block["num"] = n.group(1).rstrip(".")
        self.blocks.append(block)
        return block


# ---------------------------------------------------------------- 9/11 Commission HTML


def build_911(raw):
    b = Builder()
    notes = []
    order = ["Exec", "FM", "Pref"] + [f"Ch{i}" for i in range(1, 14)] + ["App", "Notes"]
    for name in order:
        text = open(os.path.join(raw, f"911Report_{name}.htm"), encoding="latin-1").read()
        start = text.find("</div>", text.find('class="navText"'))
        end = text.find("<!-- SideNav -->")
        body = text[start + 6 : end]
        chapter = int(name[2:]) if name.startswith("Ch") else None
        b.section = name
        in_heading = None
        in_sup = False
        sup_text = ""
        in_quote = 0
        strong_depth = 0
        strong_only = False  # current paragraph so far is all bold
        notes_chapter = None
        in_table = 0
        tables = []
        for kind, tag, data in events(body):
            if kind == "start" and tag in ("h1", "h2", "h3", "h4"):
                b.open("heading", level={"h1": 1, "h2": 1, "h3": 2, "h4": 2}[tag])
                in_heading = tag
                continue
            if kind == "end" and tag == in_heading:
                h = b.flush()
                in_heading = None
                if h and name == "Notes":
                    m = re.match(r"^(\d{1,2})\b", h["text"])
                    if m:
                        notes_chapter = int(m.group(1))
                        h["type"] = "heading"
                    h["section"] = "Notes"
                if h and name == "FM" and re.search(r"\s\d{1,3}$|\s[ivx]+$", h["text"]):
                    h["type"] = "contents"
                continue
            if in_heading:
                if kind == "text":
                    b.text(data)
                continue
            # A bordered table is a box of prose (sidebar); any other table is data: one block per row.
            if kind == "start" and tag == "table":
                tables.append("box" if (data.get("border") or "0") != "0" else "data")
                in_table = len(tables)
                if tables[-1] == "data":
                    b.flush()
                continue
            if kind == "end" and tag == "table":
                if tables and tables.pop() == "data":
                    b.flush()
                in_table = len(tables)
                continue
            if tables and tables[-1] == "data":
                if kind == "start" and tag == "tr":
                    b.open("table")
                elif kind == "start" and tag in ("td", "th", "br", "p"):
                    b.text(" ", implicit="table")
                elif kind == "start" and tag == "sup":
                    in_sup, sup_text = True, ""
                elif kind == "end" and tag == "sup":
                    in_sup = False
                    b.text(sup_text, implicit="table")
                elif kind == "text":
                    if in_sup:
                        sup_text += data
                    else:
                        b.text(data, implicit="table")
                continue
            if kind == "start" and tag == "blockquote":
                b.flush()
                in_quote += 1
                continue
            if kind == "end" and tag == "blockquote":
                b.flush()
                in_quote = max(0, in_quote - 1)
                continue
            if kind == "start" and tag in ("p", "li", "td"):
                b.open("list" if tag == "li" else ("quote" if in_quote else "paragraph"), box=True if in_table else None)
                strong_only = True
                continue
            if kind == "start" and tag == "strong":
                strong_depth += 1
                continue
            if kind == "end" and tag == "strong":
                strong_depth -= 1
                continue
            if kind == "start" and tag == "br":
                # A bold run-in head on its own line: "<p><strong>Boarding the Flights<br>Boston: ...</strong>. Atta ..."
                if b.cur is not None and strong_only and b.current_text():
                    head = b.current_text()
                    typ = b.cur["type"]
                    b.cur["type"] = "heading"
                    b.cur["level"] = 3
                    b.flush()
                    b.open(typ, box=True if in_table else None)
                    strong_only = strong_depth > 0
                else:
                    b.text(" ")
                continue
            if kind == "start" and tag == "sup":
                in_sup = True
                sup_text = ""
                continue
            if kind == "end" and tag == "sup":
                in_sup = False
                label = sup_text.strip()
                if re.fullmatch(r"\d{1,3}", label) and chapter:
                    b.marker(label, f"{chapter}-{label}")
                elif re.fullmatch(r"\d{1,3}", label):
                    b.marker(label, None)
                else:
                    b.text(sup_text)
                continue
            if kind == "text":
                if in_sup:
                    sup_text += data
                    continue
                if strong_depth == 0 and data.strip():
                    strong_only = False
                b.text(data)
        b.flush()
    # Second pass over Notes: under each chapter heading, "N. text" opens note N and an
    # unnumbered paragraph continues the previous note.
    out = []
    chapter = None
    last_note = None
    for blk in b.blocks:
        if blk["section"] != "Notes":
            out.append(blk)
            continue
        if blk["type"] == "heading":
            m = re.match(r"^(\d{1,2})\b", blk["text"])
            chapter = int(m.group(1)) if m else None
            out.append(blk)
            continue
        if chapter is None:
            out.append(blk)
            continue
        m = re.match(r"^(\d{1,3})\.(?!\d)\s*(.+)$", blk["text"], re.S)
        if m:
            note = {"type": "note", "level": None, "num": None, "id": f"{chapter}-{m.group(1)}", "label": m.group(1), "text": m.group(2), "section": f"Notes {chapter}", "markers": []}
            out.append(note)
            last_note = note
        elif last_note is not None:
            last_note["text"] += "\n" + blk["text"]
        else:
            blk["type"] = "paragraph"
            out.append(blk)
    return out


# ---------------------------------------------------------------- Bloody Sunday Inquiry HTML

SAVILLE_HEADINGS = {"ahead": 1, "bhead-now-c": 2, "chead-now-d": 3, "dhead-now-e": 4, "ehead-now-f": 5}


def build_saville(raw):
    b = Builder()
    for n in range(1, 10):
        text = open(os.path.join(raw, f"chapter{n:03d}.html"), encoding="utf-8", errors="replace").read()
        start = text.find('<div class="story"')
        end = text.find('<div class="navigation-buttons"', start)
        body = text[start : end if end > 0 else len(text)]
        b.section = f"Chapter {n}"
        seq = 0
        pending = []  # markers in the current paragraph group, waiting for their notes: (block, marker)
        in_ref = False
        ref_text = ""
        in_note_num = False
        note_num_text = ""
        quote_table = 0
        table_depth = 0
        pclass = None
        for kind, tag, data in events(body):
            if kind == "start" and tag == "table":
                table_depth += 1
                if "highlight" in (data.get("class") or ""):
                    quote_table = table_depth
                continue
            if kind == "end" and tag == "table":
                if quote_table == table_depth:
                    quote_table = 0
                table_depth -= 1
                continue
            if kind == "start" and tag in ("p", "li", "td") and (tag != "td" or "highlight" in (data.get("class") or "")):
                cls = data.get("class") or ""
                pclass = cls
                if cls in SAVILLE_HEADINGS:
                    b.open("heading", level=SAVILLE_HEADINGS[cls])
                elif cls.startswith("x-contents") or cls == "maintextfullout":
                    b.open("contents")
                elif cls.startswith("inparaendnotes"):
                    b.open("note-pending")
                elif cls.startswith("highlight") or quote_table:
                    b.open("quote")
                elif tag == "li" or cls.startswith("bullet"):
                    b.open("list")
                else:
                    b.open("paragraph")
                continue
            if kind == "end" and tag in ("p", "li"):
                blk = b.flush()
                if blk and blk["type"] == "note-pending":
                    split_saville_notes(b, blk, pending, n, lambda: None)
                elif blk and blk["type"] in ("paragraph", "quote", "list"):
                    if blk["type"] == "paragraph" and blk["text"].startswith("•"):
                        blk["type"] = "list"
                    if blk["num"] and blk["type"] == "paragraph":
                        pending[:] = [p for p in pending if p[1]["note"] is None and False]
                    for m in blk["markers"]:
                        pending.append((blk, m))
                pclass = None
                continue
            if kind == "start" and tag == "span" and (data.get("class") or "") == "reference":
                in_ref = True
                ref_text = ""
                continue
            if kind == "start" and tag == "span" and (data.get("class") or "") == "opt2footnotenumber":
                in_note_num = True
                note_num_text = ""
                continue
            if kind == "end" and tag == "span" and in_ref:
                in_ref = False
                b.marker(ref_text.strip())
                continue
            if kind == "end" and tag == "span" and in_note_num:
                in_note_num = False
                b.text(f"␞{note_num_text.strip()} ")  # note separator inside one notes paragraph
                continue
            if kind == "start" and tag == "img":
                continue
            if kind == "text":
                if in_ref:
                    ref_text += data
                elif in_note_num:
                    note_num_text += data
                elif b.cur is not None:
                    b.text(data)
        b.flush()
    # number notes per chapter and drop pending artefacts
    blocks = [x for x in b.blocks if x["type"] != "note-pending"]
    return blocks


def split_saville_notes(b, blk, pending, chapter, _):
    """One `inparaendnotes` paragraph holds one or more notes ("1 G36AA.247.1 ␞2 G41.263"); link each
    to the nearest preceding unlinked marker with the same label."""
    b.blocks.pop()  # remove the pending block; re-add as notes
    pieces = [p.strip() for p in blk["text"].split("␞")]
    for piece in pieces:
        m = re.match(r"^(\d{1,3})\s+(.*)$", piece, re.S)
        if not m:
            continue
        label, body = m.group(1), m.group(2).strip()
        target = None
        for owner, mk in reversed(pending):
            if mk["label"] == label and mk["note"] is None:
                target = (owner, mk)
                break
        if target is None:
            # a marker left as plain text in the HTML ("ruling of 11th October 2004,1 we express"):
            # take it out of the text of the nearest body block before the note
            for owner in reversed(b.blocks[-6:]):
                if owner["type"] not in ("paragraph", "quote", "list"):
                    continue
                hit = None
                for mt in re.finditer(r"(?<=[a-z\)\u201d\u2019,.;:])" + label + r"(?=\s|$)", owner["text"]):
                    hit = mt
                if hit:
                    owner["text"] = owner["text"][: hit.start()] + owner["text"][hit.end() :]
                    for mk in owner["markers"]:
                        if mk["offset"] > hit.start():
                            mk["offset"] -= len(label)
                    mk = {"label": label, "offset": hit.start(), "note": None, "recovered": True}
                    owner["markers"].append(mk)
                    owner["markers"].sort(key=lambda x: x["offset"])
                    target = (owner, mk)
                    pending.append(target)
                break
        nid = f"{chapter}-{sum(1 for x in b.blocks if x['type'] == 'note' and x['section'] == b.section) + 1}"
        note = {"type": "note", "level": None, "num": None, "id": nid, "label": label, "text": body, "section": b.section, "markers": []}
        if target:
            target[1]["note"] = nid
            pending.remove(target)
        b.blocks.append(note)


# ---------------------------------------------------------------- Caselaw Access Project HTML

CAP_HEADING = re.compile(r"^(?:(?:(?P<roman>[IVXL]{1,6})|(?P<upper>[A-Z])|(?P<digit>\d{1,2})|(?P<lower>[a-z]{1,2}))\.|\((?P<paren>[a-z0-9]{1,4})\))\s+\S")


def cap_heading_level(text):
    words = text.split()
    if len(words) > 25 or re.search(r"\.{4,}\s*\d+$", text):
        return None
    m = CAP_HEADING.match(text)
    if m and text.rstrip().endswith((";", ",")):
        return None
    if m:
        if text.rstrip().endswith((".", ":", ";", ",")) and len(words) > 12:
            return None
        if m.group("lower") and len(m.group("lower")) == 2 and m.group("lower") not in ("ii", "iv", "vi", "ix", "xi"):
            return None
        for k, lvl in (("roman", 1), ("upper", 2), ("digit", 3), ("lower", 4), ("paren", 5)):
            if m.group(k):
                # single-letter roman numerals I, V, X, L are also capitals; treat I-L as roman only when unambiguous
                if k == "roman" and len(m.group("roman")) == 1 and m.group("roman") not in ("I", "V", "X"):
                    return 2
                return lvl
    letters = re.sub(r"[^A-Za-z]", "", text)
    if letters and letters.isupper() and len(words) <= 15 and not text.rstrip().endswith("."):
        return 1
    return None


def build_cap(raw):
    text = open(os.path.join(raw, "0001-01.html"), encoding="utf-8").read()
    text = re.sub(r'src="data:image/[^"]*"', 'src=""', text)
    b = Builder()
    b.section = "head"
    quote = 0
    aside = None
    in_mark = None
    mark_text = ""
    in_page = False
    page = None
    in_aside_label = False
    section_top = "head"
    for kind, tag, data in events(text):
        if kind == "start" and tag == "article":
            b.section = section_top = "opinion"
            continue
        if kind == "start" and tag == "blockquote":
            quote += 1
            b.open("quote", page=page)
            continue
        if kind == "end" and tag == "blockquote":
            b.flush()
            quote -= 1
            continue
        if kind == "start" and tag == "aside":
            b.flush()
            aside = {"id": data.get("id"), "label": data.get("data-label")}
            b.open("note", id=aside["id"], label=aside["label"])
            in_aside_label = False
            continue
        if kind == "end" and tag == "aside":
            blk = b.flush()
            if blk:
                blk["text"] = re.sub(r"^[.\s]+", "", blk["text"])
                blk["section"] = "notes"
            aside = None
            continue
        if aside is not None:
            if kind == "start" and tag == "a" and (data.get("href") or "").startswith("#ref_footnote"):
                in_aside_label = True
                continue
            if kind == "end" and tag == "a" and in_aside_label:
                in_aside_label = False
                continue
            if in_aside_label:
                continue
            if kind == "start" and tag == "a" and data.get("class") == "page-label":
                in_page = True
                continue
            if kind == "end" and tag == "a" and in_page:
                in_page = False
                continue
            if kind == "start" and tag == "p" and b.cur is not None and b.current_text():
                b.text(" ")
            if kind == "text" and not in_page:
                b.text(data)
            continue
        if kind == "start" and tag in ("p", "h4"):
            b.open("quote" if quote else "paragraph", page=page)
            continue
        if kind == "end" and tag in ("p", "h4"):
            blk = b.flush()
            if blk:
                if re.search(r"\.{5,}\s*\d+\s*$", blk["text"]) or blk["text"] == "TABLE OF CONTENTS":
                    blk["type"] = "contents"
                elif blk["type"] == "paragraph" and b.section != "head":
                    lvl = cap_heading_level(blk["text"])
                    if lvl:
                        blk["type"] = "heading"
                        blk["level"] = lvl
                        letters = re.sub(r"[^A-Za-z]", "", blk["text"])
                        if lvl == 1 and letters.isupper():
                            b.section = blk["text"][:60]
                if blk["section"] == "opinion" or blk["section"] == "head":
                    blk["section"] = b.section if blk["type"] != "heading" else blk["section"]
            continue
        if kind == "start" and tag == "a" and data.get("class") == "page-label":
            in_page = True
            page = data.get("data-label")
            continue
        if kind == "end" and tag == "a" and in_page:
            in_page = False
            continue
        if kind == "start" and tag == "a" and data.get("class") == "footnotemark":
            in_mark = (data.get("href") or "#").lstrip("#")
            mark_text = ""
            continue
        if kind == "end" and tag == "a" and in_mark is not None:
            b.marker(mark_text.strip(), in_mark)
            in_mark = None
            continue
        if kind == "text":
            if in_page:
                continue
            if in_mark is not None:
                mark_text += data
                continue
            if b.cur is not None:
                b.text(data)
    b.flush()
    return b.blocks


# ---------------------------------------------------------------- CIA (Duelfer) HTML


def build_duelfer(raw):
    b = Builder()
    for name in ["chap1", "chap2"]:
        p = os.path.join(raw, f"{name}.html")
        if not os.path.exists(p):
            continue
        text = open(p, encoding="utf-8", errors="replace").read()
        start = text.find('id="contentColsB"')
        start = text.find(">", start) + 1 if start >= 0 else 0
        end = text.find('class="relatedItems"', start)
        text = text[start : end if end > 0 else len(text)]
        text = re.sub(r"<p[^>]*>\s*\[<a[^>]*>Top of page</a>\]\s*</p>", "", text)
        b.section = name
        in_heading = None
        in_table = 0
        skip = 0
        for kind, tag, data in events(text):
            if kind == "start" and tag in ("script", "style"):
                skip += 1
                continue
            if kind == "end" and tag in ("script", "style"):
                skip = max(0, skip - 1)
                continue
            if skip:
                continue
            if kind == "start" and tag in ("h1", "h2", "h3", "h4", "h5"):
                b.open("heading", level=int(tag[1]))
                in_heading = tag
                continue
            if kind == "end" and tag == in_heading:
                b.flush()
                in_heading = None
                continue
            if kind == "start" and tag == "table":
                in_table += 1
            if kind == "end" and tag == "table":
                in_table -= 1
            if kind == "start" and tag in ("p", "li", "blockquote", "td"):
                b.open("list" if tag == "li" else "quote" if tag == "blockquote" else ("table" if in_table else "paragraph"))
                continue
            if kind == "end" and tag in ("p", "li", "td"):
                b.flush()
                continue
            if kind == "text":
                if b.cur is not None or in_heading:
                    b.text(data)
        b.flush()
    b.blocks = [x for x in b.blocks if x["text"] != "[Top of page]"]
    # normalise heading levels so the edition's top level is 1
    levels = sorted({x["level"] for x in b.blocks if x["type"] == "heading"})
    rank = {lv: i + 1 for i, lv in enumerate(levels)}
    for x in b.blocks:
        if x["type"] == "heading":
            x["level"] = rank[x["level"]]
    return b.blocks


# ---------------------------------------------------------------- Hillsborough panel website HTML


def hills_key(name):
    m = re.match(r"^(?:part-(\d+)|ch(\d+))-page-(\d+)\.html$", name)
    part, ch, page = m.groups()
    return (int(part) if part else 2, int(ch) if ch else 0, int(page))


def build_hillsborough_html(raw):
    """The Hillsborough Independent Panel's website (Wayback captures): one page per section of a
    chapter, each paragraph its own <P> (so unnumbered paragraphs are separate, which the PDF's tags do not
    give), footnotes in div.footnotes as '[n] text<br />[n+1] ...' with '[n]' markers in the text."""
    b = Builder()
    names = sorted((f for f in os.listdir(raw) if re.match(r"^(part-\d+|ch\d+)-page-\d+\.html$", f)), key=hills_key)
    last_title = None
    for name in names:
        text = open(os.path.join(raw, name), encoding="utf-8", errors="replace").read()
        title = re.search(r'<h1 class="entry-title[^"]*">(.*?)</h1>', text, re.S)
        title = clean(html.unescape(re.sub(r"<[^>]+>", "", title.group(1)))) if title else None
        start = text.find('class="entry-content"')
        if start < 0:
            continue
        start = text.rfind("<div", 0, start)
        if title and title != last_title:
            b.flush()
            b.section = title
            b.open("heading", level=1)
            b.text(title)
            b.flush()
            last_title = title
        depth = 0
        notes_html = None
        in_notes = 0
        note_buf = []
        page_blocks_from = len(b.blocks)
        in_heading = None
        last_br = False
        for kind, tag, data in events(text[start:]):
            if kind == "start" and tag == "div":
                depth += 1
                if in_notes:
                    in_notes += 1
                elif (data or {}).get("class") == "footnotes":
                    in_notes = 1
                continue
            if kind == "end" and tag == "div":
                depth -= 1
                if in_notes:
                    in_notes -= 1
                if depth <= 0:
                    break
                continue
            if in_notes:
                if kind == "text":
                    note_buf.append(data)
                elif kind == "start" and tag == "br":
                    note_buf.append("\n")
                continue
            if kind == "start" and tag in ("script", "style", "figure", "nav"):
                depth += 0
            if kind == "start" and tag in ("h1", "h2", "h3", "h4"):
                b.open("heading", level=int(tag[1]))
                in_heading = tag
                continue
            if kind == "end" and tag == in_heading:
                b.flush()
                in_heading = None
                continue
            if kind == "start" and tag in ("p", "li", "blockquote"):
                b.open("list" if tag == "li" else "quote" if tag == "blockquote" else "paragraph")
                last_br = False
                continue
            if kind == "end" and tag in ("p", "li", "blockquote"):
                b.flush()
                continue
            if kind == "start" and tag == "br":
                if last_br and b.cur is not None and b.cur["type"] == "paragraph":
                    b.flush()
                    b.open("paragraph")
                else:
                    b.text(" ")
                last_br = True
                continue
            if kind == "text":
                if not data.strip():
                    continue
                last_br = False
                if b.cur is None and not in_heading:
                    b.open("paragraph")
                if in_heading:
                    b.text(data)
                    continue
                pos = 0
                for m in re.finditer(r"\[(\d{1,3})\]", data):
                    b.text(data[pos : m.start()])
                    b.marker(m.group(1))
                    pos = m.end()
                b.text(data[pos:])
        b.flush()
        # this page's notes, linked to this page's markers by label in order
        raw_notes = "".join(note_buf)
        pending = [mk for blk in b.blocks[page_blocks_from:] for mk in blk.get("markers", [])]
        for line in raw_notes.split("\n"):
            mm = re.match(r"^\s*\[(\d{1,3})\]\s*(.*)$", line, re.S)
            if not mm or not clean(mm.group(2)):
                continue
            nid = f"n{sum(1 for x in b.blocks if x['type'] == 'note') + 1}"
            b.blocks.append({"type": "note", "level": None, "num": None, "label": mm.group(1), "id": nid, "text": clean(mm.group(2)), "section": b.section, "markers": [], "page": name})
            for mk in pending:
                if mk["label"] == mm.group(1) and mk["note"] is None:
                    mk["note"] = nid
                    break
    # web furniture: video links ("Click here to watch ...") are not in the PDF
    blocks = [x for x in b.blocks if x["text"] and not x["text"].startswith("Click here to ")]
    levels = sorted({x["level"] for x in blocks if x["type"] == "heading"})
    rank = {lv: i + 1 for i, lv in enumerate(levels)}
    for x in blocks:
        if x["type"] == "heading":
            x["level"] = rank[x["level"]]
    return blocks


# ---------------------------------------------------------------- tagged PDF structure tree

def tag_heading_level(name):
    m = re.match(r"^H(\d)$", name) or re.match(r"^Heading_(\d)", name)
    if m:
        return int(m.group(1))
    m = re.match(r"^Heading_([A-E])\b", name)
    return "ABCDE".index(m.group(1)) + 1 if m else None


def build_tagged(report_id):
    """Walks the PDF's structure tree (pikepdf) and collects the characters of each element's marked
    content (pdfplumber), one block per paragraph-level element. Adapted from
    docs/design/reference-editions/tools/ttfull.py."""
    import pikepdf
    import pdfplumber

    repo = repo_dir(report_id)
    pdfs = sorted(f for f in os.listdir(os.path.join(repo, "archive")) if f.lower().endswith(".pdf"))
    blocks = []
    sources = []
    for fname in pdfs:
        path = os.path.join(repo, "archive", fname)
        sources.append({"path": f"archive/{fname}", "sha256": sha256(path), "bytes": os.path.getsize(path)})
        spec = REFERENCES[report_id]
        blocks += tagged_blocks(path, pikepdf, pdfplumber, numbered=spec.get("numbered", False), notes_by_size=spec.get("notes_by_size", False))
    return blocks, sources


PARA_NUMBER = r"\d{1,2}(?:\.\d{1,3}){1,2}"


def split_note_run(text):
    """A run of footnotes set together ("16. File held ... 17. File note ..."): one (label, text) per
    note, splitting only at the next number in sequence so a "para 12. The" inside a note stays put."""
    m = re.match(r"^(\d{1,3})\.?\s+", text)
    if not m:
        return [(None, text)] if text else []
    out = []
    n = int(m.group(1))
    pos = m.end()
    label = m.group(1)
    while True:
        nxt = re.compile(r"(?<![\d.])" + str(n + 1) + r"\.\s+(?=\S)").search(text, pos)
        if not nxt:
            out.append((label, text[pos:].strip()))
            return out
        out.append((label, text[pos : nxt.start()].strip()))
        n += 1
        label = str(n)
        pos = nxt.end()


LABELLED = re.compile(r"^(?:\d{1,3}(?:\.\d{1,4})+|\d{1,4}\.|[a-z]\.|\([a-z0-9]{1,4}\)|[•·▪–-])\s")
BULLET = "•"


def unfinished(text):
    """Does the text stop mid-sentence? (a trailing footnote number after the full stop does not count)"""
    t = re.sub(r"(?<=[.!?:;”’\"')\]])\d{1,3}$", "", text.strip())
    return bool(t) and t[-1] not in ".!?:;”’\"')]…"


def join_text(prev, frag):
    """Append frag to prev, shifting frag's markers."""
    off = len(prev["text"]) + 1
    for m in frag.get("markers", []):
        prev["markers"].append({**m, "offset": m["offset"] + off})
    prev["text"] += " " + frag["text"]
    prev["endpage"] = max(prev.get("endpage", 0), frag.get("endpage", frag.get("page", 0)))
    prev["joined"] = True


def split_bullets(blk):
    """'...included:\u2022 a \u2022 b': the bulleted findings kept inside the paragraph become list blocks."""
    text = blk["text"]
    if blk["type"] != "paragraph" or BULLET not in text:
        return [blk]
    cuts = sorted(set(m.start() for m in re.finditer(r"(?<!^)\s*" + BULLET, text)))
    if not cuts:
        return [blk]
    bounds = [0] + cuts + [len(text)]
    out = []
    for k in range(len(bounds) - 1):
        a, b = bounds[k], bounds[k + 1]
        piece = text[a:b]
        lead = len(piece) - len(piece.lstrip())
        piece = piece.strip()
        if not piece:
            continue
        a += lead
        nb = {**blk, "text": piece, "markers": [{**m, "offset": max(0, m["offset"] - a)} for m in blk["markers"] if a <= m["offset"] < b or (k == len(bounds) - 2 and m["offset"] == b)]}
        if piece.startswith(BULLET):
            nb["type"] = "list"
            nb["num"] = None
        out.append(nb)
    return out


def repair_tagged(blocks, numbered=False, notes_by_size=False):
    """Known flaws of tag trees, repaired before scoring:
    - a paragraph continued over a page break is two elements (one /P per page run): a paragraph that
      opens in lower case joins the paragraph before it, and so does one that opens on a capital when
      the paragraph before it stops mid-sentence and the page is the next one; the page's notes between
      them are looked past;
    - bulleted findings kept inside a paragraph are split into list blocks;
    - numbered: one /P element holds every paragraph between two headings on a page (Hillsborough):
      split it at printed paragraph numbers ("2.1.60 Following ..."), and type an element of
      numbered citations ("57. Letter from ... 58. ...") as notes."""
    split = []
    for blk in blocks:
        split += split_bullets(blk)
    out = []
    for blk in split:
        # the block this one may continue: the last non-note block (notes sit at the foot of the page)
        k = len(out) - 1
        while k >= 0 and out[k]["type"] == "note":
            k -= 1
        prev = out[k] if k >= 0 else None
        if prev and blk["type"] in ("paragraph", "quote") and prev["type"] in ("paragraph", "quote", "list") and not (blk["type"] == "paragraph" and prev["type"] == "quote"):
            lower = re.match(r"^[a-z]", blk["text"])
            page_run = (
                unfinished(prev["text"])
                and not LABELLED.match(blk["text"])
                and blk.get("page", 0) - prev.get("endpage", prev.get("page", 0)) == 1
                and (blk["type"] == prev["type"] or prev["type"] == "list")
            )
            if lower or page_run:
                join_text(prev, blk)
                continue
        out.append(blk)
    if not numbered:
        return out
    final = []
    for blk in out:
        if blk["type"] != "paragraph":
            final.append(blk)
            continue
        parts = [blk]
        if re.match(r"^\d{1,3}\.\s+\S", blk["text"]):
            seq = split_note_run(blk["text"])
            if len(seq) >= 2 or notes_by_size:
                if notes_by_size:
                    # footnotes are taken out by size, so numbered pieces here are numbered paragraphs (the report summary's)
                    parts = [{**blk, "text": lab + ". " + t, "num": lab, "markers": []} for lab, t in seq if lab]
                else:
                    for lab, t in seq:
                        final.append({**blk, "type": "note", "label": lab, "text": t, "num": None, "markers": []})
                    continue
        for part in parts:
            pieces = re.split(r"\s(?=" + PARA_NUMBER + r"\s+[A-Z‘'“(])", part["text"])
            start = 0
            for k, piece in enumerate(pieces):
                n = re.match(r"^(" + PARA_NUMBER + r")\s", piece)
                at = part["text"].find(piece, start) if k else 0
                start = at + len(piece)
                final.append({**part, "text": piece, "num": n.group(1) if n else part.get("num"), "markers": [{**m, "offset": m["offset"] - at} for m in part["markers"] if at <= m["offset"] <= at + len(piece)]})
    return final


def tagged_blocks(path, pikepdf, pdfplumber, numbered=False, notes_by_size=False):
    pdf = pikepdf.open(path)
    root = pdf.Root.get("/StructTreeRoot")
    if root is None:
        return []
    rolemap = {}
    if "/RoleMap" in root:
        rolemap = {str(k)[1:]: str(v)[1:] for k, v in root.RoleMap.items()}
    page_index = {p.objgen: i for i, p in enumerate(pdf.pages)}
    chars = {}
    with pdfplumber.open(path) as pl:
        for i, page in enumerate(pl.pages):
            sizes = {}
            if notes_by_size:
                for ch in page.chars:
                    sizes[round(ch["size"], 1)] = sizes.get(round(ch["size"], 1), 0) + 1
            modal = max(sizes, key=sizes.get) if sizes else 0
            for ch in page.chars:
                mcid = ch.get("mcid")
                if mcid is not None:
                    # small: set well under the page's body size, low on the page (footnote or marker size)
                    small = bool(notes_by_size) and ch["size"] < 0.8 * modal and ch["top"] > 0.05 * float(page.height) and ch["top"] > 0
                    low = ch["top"] > 0.5 * float(page.height)
                    chars.setdefault((i, mcid), []).append((ch["text"], round(ch["top"]), small, low))
            page.flush_cache()

    def join_chars(items):
        out = []
        last_top = None
        for t, top in items:
            if last_top is not None and abs(top - last_top) > 2 and out and not out[-1].endswith((" ", "-", "­")):
                out.append(" ")
            out.append(t)
            last_top = top
        return "".join(out)

    def text_of(i, mcid):
        """(body text, footnote runs): runs of small characters 8 or more long, low on the page, are notes;
        shorter small runs (a marker's digits) stay in the body."""
        cs = chars.get((i, mcid), [])
        if not notes_by_size:
            return join_chars([(t, top) for t, top, _, _ in cs]), []
        body, runs = [], []
        k = 0
        while k < len(cs):
            j = k
            while j < len(cs) and cs[j][2] == cs[k][2]:
                j += 1
            seg = cs[k:j]
            if cs[k][2] and len(seg) >= 8 and all(c[3] for c in seg):
                runs.append(join_chars([(t, top) for t, top, _, _ in seg]))
            else:
                txt = "".join(c[0] for c in seg)
                if cs[k][2] and re.fullmatch(r"\d{1,3}", txt.strip()) and body:
                    # a footnote marker: kept as a sentinel, turned into a marker record at emit
                    body += [("\ue000" + txt.strip() + "\ue001", seg[0][1])]
                else:
                    body += [(t, top) for t, top, _, _ in seg]
            k = j
        return join_chars(body), runs

    def add_mcid(acc, i, mcid):
        t, runs = text_of(i, mcid)
        acc["parts"].append(t)
        for r in runs:
            acc.setdefault("runs", []).append((r, i))
        acc["pages"].add(i)

    blocks = []

    def names(elem):
        s = str(elem.get("/S", ""))[1:]
        return s, rolemap.get(s, s)

    def page_of(elem, page):
        pg = elem.get("/Pg")
        return page_index.get(pg.objgen, page) if pg is not None else page

    def collect(elem, page, acc, flat=False):
        """Text of an element's subtree into acc = {parts, markers, notes, pages}."""
        page = page_of(elem, page)
        k = elem.get("/K")
        if k is None:
            return
        kids = k if isinstance(k, pikepdf.Array) else [k]
        for kid in kids:
            if isinstance(kid, int):
                add_mcid(acc, page, int(kid))
            elif isinstance(kid, pikepdf.Dictionary):
                if "/MCID" in kid:
                    p2 = page_index.get(kid.Pg.objgen, page) if "/Pg" in kid else page
                    add_mcid(acc, p2, int(kid.MCID))
                elif "/S" in kid:
                    s, r = names(kid)
                    if s == "Reference":
                        sub = {"parts": [], "markers": [], "notes": [], "pages": set()}
                        collect(kid, page, sub)
                        acc.setdefault("runs", []).extend(sub.get("runs", []))
                        label = clean("".join(sub["parts"]))
                        if re.fullmatch(r"\d{1,3}", label):
                            acc["markers"].append({"label": label, "offset": len(clean("".join(acc["parts"]))), "note": None})
                        else:
                            acc["parts"].append(" " + label)
                    elif not flat and (s in ("Note", "Footnote") or s.lower().startswith("note")):
                        sub = {"parts": [], "markers": [], "notes": [], "pages": set()}
                        collect(kid, page, sub, True)
                        acc["notes"].append((clean("".join(sub["parts"])), min(sub["pages"], default=page)))
                    else:
                        collect(kid, page, acc, flat)
                        if s == "Lbl":
                            acc["parts"].append(" ")

    def emit(type_, level, acc, tag):
        text = clean("".join(acc["parts"]))
        if "\ue000" in text:
            plain, found = "", []
            for piece in re.split("(\ue000\\d+\ue001)", text):
                m = re.fullmatch("\ue000(\\d+)\ue001", piece)
                if m:
                    found.append({"label": m.group(1), "offset": len(plain), "note": None})
                else:
                    plain += piece
            text = plain
            acc["markers"] = acc["markers"] + found
        if text:
            blk = {"type": type_, "level": level, "num": None, "text": text, "section": "", "markers": acc["markers"], "page": min(acc["pages"], default=0) + 1, "endpage": max(acc["pages"], default=0) + 1, "tag": tag}
            n = re.match(r"^(\d{1,3}(?:\.\d{1,4})+|\d{1,4}\.?)\s", text)
            if n and type_ == "paragraph":
                blk["num"] = n.group(1).rstrip(".")
            blocks.append(blk)
        for run, pg in acc.get("runs", []):
            for label, note_text in split_note_run(clean(run)):
                blocks.append({"type": "note", "level": None, "num": None, "label": label, "text": note_text, "section": "", "markers": [], "page": pg + 1, "tag": "NoteRun"})
        for note_text, pg in acc["notes"]:
            m = re.match(r"^(\d{1,3})\s*(.*)$", note_text, re.S)
            if note_text:
                blocks.append({"type": "note", "level": None, "num": None, "label": m.group(1) if m else None, "text": (m.group(2) if m else note_text).strip(), "section": "", "markers": [], "page": pg + 1, "tag": "Note"})

    def walk(elem, page):
        page = page_of(elem, page)
        s, r = names(elem)
        level = tag_heading_level(s) or tag_heading_level(r)
        acc = {"parts": [], "markers": [], "notes": [], "pages": set()}
        if s in ("Figure", "Table", "Artifact"):
            return
        if level:
            collect(elem, page, acc)
            emit("heading", level, acc, s)
            return
        if s in ("Note", "Footnote") or s.lower().startswith("note"):
            collect(elem, page, acc, True)
            emit("note", None, {"parts": [], "markers": [], "notes": [(clean("".join(acc["parts"])), min(acc["pages"], default=page))], "pages": set()}, s)
            return
        if s.startswith("TOC") or r == "TOCI":
            collect(elem, page, acc)
            emit("contents", None, acc, s)
            return
        if r in ("P", "LI", "Caption", "BlockQuote", "Quote") or s in ("P", "LI", "Caption", "Quoted_Text") or s.startswith("Body") or s.startswith("_No_paragraph"):
            collect(elem, page, acc)
            typ = "quote" if "Quot" in s or r in ("BlockQuote", "Quote") else "paragraph"
            emit(typ, None, acc, s)
            if "Sidebar" in s or "Caption" in s:
                if blocks and blocks[-1].get("tag") == s:
                    blocks[-1]["box"] = True
            return
        k = elem.get("/K")
        if k is None:
            return
        kids = k if isinstance(k, pikepdf.Array) else [k]
        for kid in kids:
            if isinstance(kid, pikepdf.Dictionary) and "/S" in kid:
                walk(kid, page)

    walk(root, 0)
    blocks[:] = repair_tagged(blocks, numbered=numbered, notes_by_size=notes_by_size)
    # notes: link each marker to the next unclaimed note with its label, in document order
    pending = []
    for blk in blocks:
        for m in blk.get("markers", []):
            pending.append(m)
        if blk["type"] == "note" and blk.get("label"):
            blk["id"] = f"n{len([b for b in blocks[: blocks.index(blk)] if b['type'] == 'note']) + 1}"
            for m in pending:
                if m["note"] is None and m["label"] == blk["label"]:
                    m["note"] = blk["id"]
                    pending.remove(m)
                    break
    # sections: the top heading level present
    top = min((b["level"] for b in blocks if b["type"] == "heading"), default=1)
    section = ""
    for blk in blocks:
        if blk["type"] == "heading" and blk["level"] == top:
            section = blk["text"][:60]
        blk["section"] = section
    return blocks


# ---------------------------------------------------------------- build

def _words(text):
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"[‘’“”–—-]", " ", text.lower()).replace("\u00ad", "")).split()


def _shingles(words, n=6):
    return {" ".join(words[i : i + n]) for i in range(len(words) - n + 1)}


def overlay_html(tags, html_blocks):
    """The Hillsborough hybrid: a stretch of tag blocks whose text the website HTML has (half of a block's
    6-word shingles found there) is replaced by the HTML blocks that hold it (one element per paragraph, linked
    footnotes, no cut at a page break); the rest stays as the tags have it. Short blocks (headings) take the
    coverage of the block after them, other short ones of the block before."""
    def chapter(b):
        m = re.match(r"^Chapter\s+(\d+)", b.get("section") or "")
        return int(m.group(1)) if m else 0

    # matched within the same chapter only: Part 1's summary repeats chapter conclusions word for word
    hwords = [_words(b["text"]) for b in html_blocks]
    where = {}
    for i, ws in enumerate(hwords):
        for sh in _shingles(ws):
            where.setdefault((chapter(html_blocks[i]), sh), []).append(i)
    allh = set(where)
    cov = [None] * len(tags)
    hit = [None] * len(tags)
    for i, b in enumerate(tags):
        ws = _words(b["text"])
        if len(ws) < 8:
            continue
        sh = _shingles(ws)
        ch = chapter(b)
        found = [(ch, x) for x in sh if (ch, x) in allh]
        cov[i] = len(found) >= 0.5 * len(sh)
        if cov[i]:
            votes = {}
            for x in found:
                for k in where[x]:
                    votes[k] = votes.get(k, 0) + 1
            hit[i] = max(votes, key=votes.get)
    nxt = False
    for i in range(len(tags) - 1, -1, -1):
        if cov[i] is not None:
            nxt = cov[i]
        elif tags[i]["type"] == "heading":
            cov[i] = nxt
    prev = False
    for i in range(len(tags)):
        if cov[i] is None:
            cov[i] = prev
        prev = cov[i]
    out = []
    emitted_to = 0
    i = 0
    while i < len(tags):
        j = i
        while j < len(tags) and cov[j] == cov[i]:
            j += 1
        run = tags[i:j]
        if not cov[i]:
            out += run
        else:
            hs = [hit[k] for k in range(i, j) if hit[k] is not None]
            if hs:
                lo, hi = max(min(hs), emitted_to), max(hs)
                while lo > emitted_to and html_blocks[lo - 1]["type"] == "heading":
                    lo -= 1
                e = hi + 1
                while e < len(html_blocks) and html_blocks[e]["type"] == "note":
                    e += 1
                if e > lo:
                    out += html_blocks[lo:e]
                    emitted_to = e
        i = j
    return out


ADAPTERS = {"commission911": build_911, "saville": build_saville, "cap": build_cap, "duelfer": build_duelfer, "hillsborough": build_hillsborough_html}


def link_notes(blocks):
    """Index blocks and set each note's `ref` to the block carrying its marker."""
    for i, blk in enumerate(blocks):
        blk["i"] = i
    owner = {}
    for blk in blocks:
        for m in blk.get("markers", []):
            if m.get("note"):
                owner.setdefault(m["note"], blk["i"])
    for blk in blocks:
        if blk["type"] == "note":
            blk["ref"] = owner.get(blk.get("id"))


def build(report_id):
    spec = REFERENCES[report_id]
    repo = repo_dir(report_id)
    ref = os.path.join(repo, "reference")
    m = read_manifest(report_id)
    if spec["adapter"] == "tagged":
        blocks, sources = build_tagged(report_id)
        if spec.get("html_overlay"):
            for blk in blocks:  # note ids are prefixed by source: both number theirs from n1
                if blk.get("id"):
                    blk["id"] = "t" + blk["id"]
                for mk in blk.get("markers", []):
                    if mk.get("note"):
                        mk["note"] = "t" + mk["note"]
            html_blocks = build_hillsborough_html(os.path.join(ref, "raw"))
            for blk in html_blocks:
                if blk.get("id"):
                    blk["id"] = "h" + blk["id"]
                for mk in blk.get("markers", []):
                    if mk.get("note"):
                        mk["note"] = "h" + mk["note"]
            blocks = overlay_html(blocks, html_blocks)
            sources = sources + [x for x in m.get("sources", []) if x.get("url")]
        m.update({"report": report_id, "set": spec["set"], "edition": spec["edition"], "licence": spec["licence"], "fetched": datetime.date.today().isoformat(), "sources": sources})
        m["sources_note"] = "The reference is derived from the source PDF already in archive/, so no copy is kept under reference/raw/."
    else:
        blocks = ADAPTERS[spec["adapter"]](os.path.join(ref, "raw"))
    link_notes(blocks)
    out = os.path.join(ref, "blocks.jsonl")
    os.makedirs(ref, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for blk in blocks:
            f.write(json.dumps(blk, ensure_ascii=False) + "\n")
    counts = {}
    for blk in blocks:
        counts[blk["type"]] = counts.get(blk["type"], 0) + 1
    markers = sum(len(x.get("markers", [])) for x in blocks)
    linked = sum(1 for x in blocks for mk in x.get("markers", []) if mk.get("note"))
    m.update(
        {
            "blocks": {
                "path": "reference/blocks.jsonl",
                "sha256": sha256(out),
                "normaliser": f"reportsthatmatter scripts/score/reference.py, adapter {spec['adapter']}, version {NORMALISER_VERSION}",
                "built": datetime.date.today().isoformat(),
                "counts": dict(sorted(counts.items())),
                "markers": markers,
                "markers_linked": linked,
                "words": sum(len(x["text"].split()) for x in blocks),
            },
            "caveats": spec.get("caveats", []),
        }
    )
    if "version" in spec:
        m["version"] = spec["version"]
    write_manifest(report_id, m)
    print(f"{report_id}: {len(blocks)} blocks {dict(sorted(counts.items()))}; markers {markers} ({linked} linked)")


def main(argv):
    cache = None
    if "--cache" in argv:
        i = argv.index("--cache")
        cache = argv[i + 1]
        del argv[i : i + 2]
    if not argv or argv[0] == "list":
        for rid, spec in REFERENCES.items():
            print(f"{rid:24} {spec['set']:12} {spec['adapter']:14} {spec['edition'][:70]}")
        return
    cmd, ids = argv[0], argv[1:]
    for rid in ids:
        if rid not in REFERENCES:
            raise SystemExit(f"no reference edition known for {rid}")
        if cmd in ("fetch", "all") and REFERENCES[rid]["files"]:
            fetch(rid, cache)
        if cmd in ("build", "all"):
            build(rid)


if __name__ == "__main__":
    main(sys.argv[1:])
