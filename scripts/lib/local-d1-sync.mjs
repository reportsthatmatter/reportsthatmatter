/**
 * A synchronous `Runner` (scripts/lib/d1.ts) over a scratch local D1 that reports `meta.rows_read`, for measuring
 * what the real scripts read without touching production (reportsthatmatter-t4al).
 *
 * `wrangler d1 execute --local` does not report rows read; the D1 binding miniflare gives `getPlatformProxy` does,
 * counted the way production D1 counts them (both are SQLite in a Durable Object). The binding is async and the
 * scripts' Runner is sync, so the binding lives in a worker thread and the runner blocks on an Atomics.wait.
 */
import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";
import { readFileSync } from "node:fs";

const workerSource = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const { getPlatformProxy } = await import("wrangler");
  const { env, dispose } = await getPlatformProxy({ configPath: workerData.config, persist: { path: workerData.persist } });
  const { port, flag } = workerData;
  const signal = new Int32Array(flag);
  const reply = (msg) => { port.postMessage(msg); Atomics.store(signal, 0, 1); Atomics.notify(signal, 0); };
  reply({ ready: true });
  port.on("message", async (msg) => {
    if (msg.close) { await dispose(); reply({ closed: true }); return; }
    try {
      const results = [];
      if (msg.statements.length === 1) results.push(await env.DB.prepare(msg.statements[0]).all());
      else results.push(...(await env.DB.batch(msg.statements.map((s) => env.DB.prepare(s)))));
      reply({ results: results.map((r) => ({ results: r.results ?? [], meta: r.meta ?? {} })) });
    } catch (e) {
      reply({ error: String(e && e.message || e) });
    }
  });
})();
`;

export function localD1({ config, persist }) {
  const flag = new SharedArrayBuffer(4);
  const signal = new Int32Array(flag);
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(workerSource, { eval: true, workerData: { config, persist, port: port2, flag }, transferList: [port2] });
  const wait = () => {
    Atomics.wait(signal, 0, 0);
    Atomics.store(signal, 0, 0);
    return receiveMessageOnPort(port1).message;
  };
  wait(); // ready
  let total = 0;
  /** Splits a statements file the way scripts/lib/reindex.ts writes one (statements end `;`, joined by a blank line). */
  const split = (sql) => sql.split(/;\n\n/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean);
  const run = (_target, sql) => {
    const statements = "command" in sql ? [sql.command] : split(readFileSync(sql.file, "utf8"));
    port1.postMessage({ statements });
    const msg = wait();
    if (msg.error) throw new Error(msg.error);
    for (const r of msg.results) total += Number(r.meta.rows_read) || 0;
    // wrangler --file answers with one entry for the whole file: sum the batch into one, as it does.
    if (!("command" in sql)) {
      const meta = msg.results.reduce((m, r) => ({ rows_read: m.rows_read + (r.meta.rows_read || 0), rows_written: m.rows_written + (r.meta.rows_written || 0) }), { rows_read: 0, rows_written: 0 });
      return [{ results: [], meta }];
    }
    return msg.results;
  };
  return {
    run,
    get rowsRead() {
      return total;
    },
    close() {
      port1.postMessage({ close: true });
      wait();
      worker.terminate();
    },
  };
}
