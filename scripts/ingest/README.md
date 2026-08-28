# `pnpm ingest` — running the library over this corpus

The pipeline itself lives in **[`@rtm/ingest`](https://github.com/reportsthatmatter/ingest)**,
pinned in `package.json`. This directory holds only `cli.ts`, which runs it
over the reports in `reports/`.

```bash
pnpm ingest run <id>        # rebuild one report from reports/<id>/ingest.ts
pnpm ingest verify          # fidelity gates against the real source PDFs
pnpm ingest check           # has any report's output moved?
pnpm ingest baseline <id>   # accept a move, after reading the diff
```

## Where a fix goes

| | |
| --- | --- |
| Holds for every document in the corpus | a shared pass, in `@rtm/ingest` |
| A property of *this source* the parser cannot infer | a pass declared in `reports/<id>/ingest.ts` |
| A judgement about *this document's text* | `reports/<id>/corrections.yaml` |

If you are writing a correction to undo something the parser did, you needed a
different pass or a bug fix. The library's own README has the detail, including
the promotion rule for passes.

## Changing the library

It is a separate repo, pinned by tag. A pipeline fix is therefore two steps:
release it there, then bump the pin here and re-run `pnpm ingest check`. That
friction is deliberate — it is what makes each report adopt improvements
knowingly rather than having them arrive unannounced, which is the failure
that motivated the split.
