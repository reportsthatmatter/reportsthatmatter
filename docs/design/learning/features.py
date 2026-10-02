"""Derived features for the page-break join decision (38s.8).

decisions.jsonl rows come in reading order, one per break between two body
lines, so row i+1's prev line is row i's next line when the two match on page,
top and left. That gives each break the line after `next` (next2) and the line
before `prev` (prev2), from which the paragraph-shape features come:

- next_first_indent: next line's left minus next2's left (same page). A
  positive value is a first-line indent: a new paragraph. Zero: a run-on.
- prev_short: how much further the prev line stops from the right margin than
  prev2 (same page). A short last line ends a paragraph.
- next2_indent: is the block that opens the page inset (a quotation)?
"""
import numpy as np, pandas as pd
from load import load, PROSE

def same(a, b, pa, pb):
    return (a[f"{pa}_page"] == b[f"{pb}_page"]) & (a[f"{pa}_top_rel"] == b[f"{pb}_top_rel"]) & (a[f"{pa}_left"] == b[f"{pb}_left"])

def enrich(d):
    d = d.reset_index(drop=True)
    nxt = d.shift(-1)
    prv = d.shift(1)
    link_n = same(d, nxt, "next", "prev") & (nxt["report"] == d["report"])
    link_p = same(d, prv, "prev", "next") & (prv["report"] == d["report"])
    same_page_n = link_n & (nxt["next_page"] == d["next_page"])
    same_page_p = link_p & (prv["prev_page"] == d["prev_page"])
    d["next2_left"] = np.where(same_page_n, nxt["next_left"], np.nan)
    d["next2_indent"] = np.where(same_page_n, nxt["next_indent"], np.nan)
    d["next2_first"] = np.where(same_page_n, nxt["next_first"], "none")
    d["next_first_indent"] = d["next_left"] - d["next2_left"]
    d["prev2_left"] = np.where(same_page_p, prv["prev_left"], np.nan)
    d["prev_vs_prev2_left"] = d["prev_left"] - d["prev2_left"]
    d["prev_short"] = d["prev_right_gap"] - np.where(same_page_p, prv["prev_right_gap"], np.nan)
    # body measure: how far from the page's modal right edge, as share of a typical line
    d["prev_fill"] = d["prev_width_rel"]
    d["prev_ends_colon"] = d["prev_last"].isin([":"])
    d["prev_ends_comma"] = d["prev_last"].isin([",", ";"])
    d["prev_ends_digit"] = d["prev_last"].fillna("").str.match(r"\d")
    d["next_first_lower"] = d["next_first"] == "lower"
    d["next_first_upper"] = d["next_first"] == "upper"
    d["next_first_digit"] = d["next_first"] == "digit"
    d["next_first_quote"] = d["next_first"].isin(["quote"]) | d["next_opens_quote"]
    d["next_first_open"] = d["next_first"] == "open"
    d["ours_quote_either"] = d["ours_next_type"] == "quote"
    # scale-free versions: in ems of the line's own font size, so a rule learnt
    # on one publisher's points means the same on another's
    em = d["next_size"].where(d["next_size"] > 0, 10)
    pem = d["prev_size"].where(d["prev_size"] > 0, 10)
    d["next_first_indent_em"] = d["next_first_indent"] / em
    d["next_indent_em"] = d["next_indent"] / em
    d["next2_indent_em"] = d["next2_indent"] / em
    d["prev_indent_em"] = d["prev_indent"] / pem
    d["prev_vs_prev2_em"] = d["prev_vs_prev2_left"] / pem
    d["prev_right_gap_em"] = d["prev_right_gap"] / pem
    d["prev_short_em"] = d["prev_short"] / pem
    # Is the page set justified? The median right gap of its lines (in ems):
    # near 0 when justified, several ems when ragged-right. A short last line
    # ends a paragraph only on a justified page (Saville is ragged-right).
    page_rag = d.groupby(["report", "prev_page"])["prev_right_gap_em"].transform(lambda s: s.abs().median())
    d["page_ragged_em"] = page_rag
    justified = page_rag < 0.5
    d["prev_short_j"] = np.where(justified, d["prev_short_em"], 0.0)
    d["prev_right_gap_j"] = np.where(justified, d["prev_right_gap_em"], 0.0)
    return d

NUMERIC = [
    "skipped_lines", "prev_words", "prev_caps_ratio", "next_words", "next_caps_ratio",
    "prev_width_rel", "next_width_rel", "prev_size_rel", "next_size_rel",
    "next_first_indent_em", "next_indent_em", "next2_indent_em", "prev_indent_em", "prev_vs_prev2_em", "prev_short_j", "prev_right_gap_j", "page_ragged_em",
]
BOOL = [
    "font_change", "prev_ends_sentence", "prev_ends_hyphen", "prev_starts_label", "prev_opens_quote", "prev_closes_quote",
    "next_ends_sentence", "next_starts_label", "next_opens_quote", "next_closes_quote", "prev_bold", "next_bold", "prev_italic",
    "next_italic", "prev_superscript", "next_superscript", "prev_ends_colon", "prev_ends_comma", "prev_ends_digit",
    "next_first_lower", "next_first_upper", "next_first_digit", "next_first_quote", "next_first_open",
]
OURS = ["ours_boundary", "ours_quote_either"]

def boundary_frame(reports):
    d = enrich(load(reports, "boundary"))
    d = d[d.correct.notna() & d.ref_next_type.isin(PROSE)].copy()
    for c in ["ref_boundary", "ours_boundary", "correct"]:
        d[c] = d[c].astype(bool)
    return d

def X(d, ours=False, fill=-999):
    cols = NUMERIC + BOOL + (OURS if ours else [])
    x = d[cols].copy()
    for c in BOOL + (OURS if ours else []):
        x[c] = x[c].fillna(False).astype(int)
    return x.astype(float).fillna(fill)
