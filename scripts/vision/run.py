#!/usr/bin/env python3
"""Vision-model structure pass (reportsthatmatter-kyj3): render PDF pages and read them with granite-docling.

    python3 scripts/vision/run.py <report-repo> [--pdf archive/x.pdf] [--pages 1-30,45] [--backend mlx|cpu] [--dpi 150]

Per page it renders with pdftoppm, runs granite-docling (Docling VLM pipeline) and caches the raw
DocTags plus a Markdown export under <report-repo>/.cache/vision/<pdf-sha256>/<backend>/pNNNN.*.
Cached pages are skipped, so a run is resumable and idempotent. Nothing is trusted here:
verify.py checks every page against the PDF text layer. `--manifest` writes
<report-repo>/reference/vision/manifest.json (per-page output hashes and timings) and doctags.jsonl.gz (the raw
output, committed so the verifier and every number can be re-run without the model; `--unpack` restores the cache from it).

Setup (Python >= 3.10; the system 3.9 is too old): uv venv --python 3.11 .venv-vision &&
uv pip install --python .venv-vision docling mlx-vlm. RTM_VISION_PYTHON is not needed: run this
script with the venv's python. RTM_VISION_CACHE overrides the cache root (e.g. a shared checkout's .cache/vision).
"""
import argparse, glob, hashlib, json, os, subprocess, sys, tempfile, time

MODEL = "ibm-granite/granite-docling-258M"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def parse_pages(spec, n):
    if not spec:
        return list(range(1, n + 1))
    out = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out += range(int(a), int(b or a) + 1)
    return [p for p in out if 1 <= p <= n]


def npages(pdf):
    info = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True, check=True).stdout
    return int(next(l for l in info.splitlines() if l.startswith("Pages:")).split()[1])


def converter(backend):
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import VlmPipelineOptions
    from docling.datamodel import vlm_model_specs as s
    from docling.document_converter import DocumentConverter, ImageFormatOption
    from docling.pipeline.vlm_pipeline import VlmPipeline
    spec = {"mlx": s.GRANITEDOCLING_MLX, "cpu": s.GRANITEDOCLING_TRANSFORMERS}[backend]
    o = VlmPipelineOptions(vlm_options=spec)
    return DocumentConverter(format_options={InputFormat.IMAGE: ImageFormatOption(pipeline_cls=VlmPipeline, pipeline_options=o)})


def versions(pkg):
    try:
        from importlib.metadata import version
        return version(pkg)
    except Exception:
        return None


def snapshots():
    """The model revisions in the local Hugging Face cache (the run's exact weights are one of them)."""
    base = os.path.expanduser("~/.cache/huggingface/hub")
    return {os.path.basename(d).replace("models--", "").replace("--", "/"): sorted(os.listdir(os.path.join(d, "snapshots")))
            for d in glob.glob(os.path.join(base, "models--ibm-granite--granite-docling-258M*")) if os.path.isdir(os.path.join(d, "snapshots"))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("repo")
    ap.add_argument("--pdf")
    ap.add_argument("--pages")
    ap.add_argument("--backend", default="mlx", choices=["mlx", "cpu"])
    ap.add_argument("--dpi", type=int, default=150)
    ap.add_argument("--manifest", action="store_true", help="only (re)write reference/vision/manifest.json (and doctags.jsonl.gz) from the cache")
    ap.add_argument("--unpack", action="store_true", help="fill the cache from reference/vision/doctags.jsonl.gz (no model run), then exit")
    a = ap.parse_args()
    repo = os.path.abspath(a.repo)
    pdf = os.path.join(repo, a.pdf) if a.pdf else sorted(glob.glob(os.path.join(repo, "archive", "*.pdf")))[0]
    digest = sha256(pdf)
    root = os.environ.get("RTM_VISION_CACHE") or os.path.join(repo, ".cache", "vision")
    cdir = os.path.join(root, digest, a.backend + ("" if a.dpi == 150 else f"-{a.dpi}"))  # 150 dpi is the default; another resolution is its own cache
    os.makedirs(cdir, exist_ok=True)
    gi = os.path.join(os.path.dirname(root) if root.endswith("vision") else root, ".gitignore")
    if not os.path.exists(gi) and os.path.isdir(os.path.dirname(gi)):
        open(gi, "w").write("*\n")
    n = npages(pdf)
    pages = parse_pages(a.pages, n)
    suffix = "" if a.backend == "mlx" else "-" + a.backend  # the committed record is the mlx run; another backend writes beside it
    packf = os.path.join(repo, "reference", "vision", f"doctags{suffix}.jsonl.gz")

    if a.unpack:
        # a committed pack replaces the GPU run: write each page's doctags back where verify.ts reads them
        import gzip
        for line in gzip.open(packf, "rt"):
            r = json.loads(line)
            base = os.path.join(cdir, f"p{r['page']:04d}")
            open(base + ".doctags", "w").write(r["doctags"])
            open(base + ".md", "w").write(r["md"])
            json.dump(r["meta"], open(base + ".json", "w"))
        print(f"unpacked into {cdir}")
        return

    if not a.manifest:
        todo = [p for p in pages if not os.path.exists(os.path.join(cdir, f"p{p:04d}.json"))]
        print(f"{os.path.basename(pdf)} sha256 {digest[:12]} pages {n}; {len(pages) - len(todo)} cached, {len(todo)} to run ({a.backend})", flush=True)
        if todo:
            conv = converter(a.backend)
            with tempfile.TemporaryDirectory() as tmp:
                for p in todo:
                    subprocess.run(["pdftoppm", "-r", str(a.dpi), "-f", str(p), "-l", str(p), "-png", "-singlefile", pdf, os.path.join(tmp, "pg")], check=True)
                    img = os.path.join(tmp, "pg.png")
                    t = time.time()
                    res = conv.convert(img)
                    secs = time.time() - t
                    doc = res.document
                    base = os.path.join(cdir, f"p{p:04d}")
                    md = doc.export_to_markdown()
                    dt = doc.export_to_doctags()
                    open(base + ".md", "w").write(md)
                    open(base + ".doctags", "w").write(dt)
                    # json last: its presence marks the page done
                    json.dump({"page": p, "secs": round(secs, 1), "backend": a.backend, "dpi": a.dpi, "model": MODEL,
                               "md_sha256": hashlib.sha256(md.encode()).hexdigest(),
                               "doctags_sha256": hashlib.sha256(dt.encode()).hexdigest()}, open(base + ".json", "w"))
                    print(f"p{p} {secs:.1f}s", flush=True)

    # manifest from whatever is cached
    recs = []
    for p in range(1, n + 1):
        f = os.path.join(cdir, f"p{p:04d}.json")
        if os.path.exists(f):
            recs.append(json.load(open(f)))
    out = os.path.join(repo, "reference", "vision")
    os.makedirs(out, exist_ok=True)
    man = {"pdf": os.path.relpath(pdf, repo), "pdf_sha256": digest, "pdf_pages": n, "model": MODEL, "backend": a.backend,
           "dpi": a.dpi, "docling": versions("docling"), "mlx_vlm": versions("mlx-vlm"), "model_snapshots": snapshots(),
           "pages_done": len(recs), "total_secs": round(sum(r["secs"] for r in recs), 1), "pages": recs}
    json.dump(man, open(os.path.join(out, f"manifest{suffix}.json"), "w"), indent=1)
    import gzip
    with gzip.open(packf, "wt", compresslevel=9) as z:
        for r in recs:
            base = os.path.join(cdir, f"p{r['page']:04d}")
            z.write(json.dumps({"page": r["page"], "meta": r, "doctags": open(base + ".doctags").read(), "md": open(base + ".md").read()}) + "\n")
    print(f"manifest: {len(recs)}/{n} pages")


if __name__ == "__main__":
    main()
