"""Print page-break examples against the PDF and the reference (38s.8 error reading).

python show.py <report> "<pandas query>" [n] [seed]
For each sampled row: the last lines of the previous page and the first lines
of the next (pdftotext -layout), and the reference block holding the join.
"""
import json, os, re, subprocess, sys
from features import boundary_frame

REPOS = os.environ.get("RTM_REPO_ROOT", os.path.expanduser("~/src/reportsthatmatter"))
PDF = {
    "us-911-commission": "us-911-commission/archive/911Report.pdf",
    "uk-saville-inquiry": "uk-saville-inquiry/archive/bloody-sunday-inquiry-vol1-hc29-i.pdf",
    "us-v-philip-morris": "us-v-philip-morris/archive/final-opinion.pdf",
    "uk-hillsborough-panel": "uk-hillsborough-panel/archive/hillsborough-panel-report.pdf",
    "columbia-accident": "columbia-accident/archive/CAIB_lowres_full.pdf",
    "uk-chilcot-inquiry": "uk-chilcot-inquiry/archive/the-report-of-the-iraq-inquiry-executive-summary.pdf",
    "us-duelfer-report": "us-duelfer-report/archive/duelfer-report-vol1.pdf",
}

def page_lines(report, page):
    out = subprocess.run(["pdftotext", "-layout", "-f", str(page), "-l", str(page), os.path.join(REPOS, PDF[report]), "-"], capture_output=True, text=True).stdout
    return [l for l in out.splitlines() if l.strip()]

def ref_blocks(report):
    with open(os.path.join(REPOS, report, "reference", "blocks.jsonl")) as f:
        return [json.loads(l) for l in f]

def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"\s+", " ", s.lower()))

def main():
    report, query = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    d = boundary_frame([report])
    d = d[d.crosses_page].query(query)
    print(f"{len(d)} rows match")
    refs = ref_blocks(report)
    for _, x in d.sample(min(n, len(d)), random_state=seed).iterrows():
        print(f"\n--- pdf p{int(x.prev_page)}->{int(x.next_page)} ref={'split' if x.ref_boundary else 'join'} ({x.ref_prev_type}->{x.ref_next_type}) ours={'split' if x.ours_boundary else 'join'} ({x.ours_next_type}) first_indent_em={x.next_first_indent_em:.2f}")
        for l in page_lines(report, int(x.prev_page))[-4:]:
            print("   A|", l[:110])
        for l in page_lines(report, int(x.next_page))[1:4]:
            print("   B|", l[:110])
        key = norm(x.prev_text)[-25:]
        hit = [b for b in refs if key and key in norm(b.get("text", ""))]
        if hit:
            t = hit[0]["text"]
            i = norm(t).find(key)
            print(f"   REF[{hit[0]['type']}]: …{norm(t)[max(0, i - 60): i + 120]}…")
        else:
            print("   REF: (prev text not found)")

if __name__ == "__main__":
    main()
