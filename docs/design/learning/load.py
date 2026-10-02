"""Load score-out/<id>/decisions.jsonl into pandas (38s.8)."""
import json, os, pandas as pd
ROOT = os.environ.get("SCORE_OUT", os.path.join(os.path.dirname(__file__), "../../../score-out"))
DEV = ["us-911-commission", "uk-saville-inquiry", "us-v-philip-morris"]
HOLDOUT = ["uk-hillsborough-panel", "columbia-accident", "uk-chilcot-inquiry", "us-duelfer-report"]
PROSE = {"paragraph", "quote", "list", "heading", "contents"}

def load(reports, decision="boundary"):
    out = []
    for r in reports:
        with open(os.path.join(ROOT, r, "decisions.jsonl")) as f:
            for line in f:
                row = json.loads(line)
                if row["decision"] == decision:
                    out.append(row)
    return pd.DataFrame(out)

def boundaries(reports):
    d = load(reports, "boundary")
    d = d[d.correct.notna() & d.ref_next_type.isin(PROSE)].copy()
    for c in ["ref_boundary", "ours_boundary", "correct"]:
        d[c] = d[c].astype(bool)
    return d
