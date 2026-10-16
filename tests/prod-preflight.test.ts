import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { cfErrorCode, isCfErrorPage, productionPreflight } from "../scripts/lib/prod-preflight";

const CF_1016 = '<!DOCTYPE html><html><head><title>Origin DNS error | x | Cloudflare</title></head><body><div id="cf-wrapper"><span class="cf-error-code">1016</span><h1>Error code 1016</h1> Cloudflare Ray ID: abc</div></body></html>';

let server: Server | undefined;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

async function serve(routes: Record<string, [number, string]>): Promise<string> {
  server = createServer((req, res) => {
    const [status, body] = routes[req.url ?? "/"] ?? [404, "no"];
    res.writeHead(status, { "content-type": "text/html" }).end(body);
  });
  await new Promise<void>((ok) => server!.listen(0, "127.0.0.1", ok));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("production preflight", () => {
  it("passes when / and /health answer 200", async () => {
    const base = await serve({ "/": [200, "<h1>Reports that Matter</h1>"], "/health": [200, "ok"] });
    expect(await productionPreflight(base)).toEqual({ ok: true });
  });

  it("names the status and no code for a plain 503", async () => {
    const base = await serve({ "/": [200, "ok"], "/health": [503, "unavailable"] });
    const r = await productionPreflight(base);
    expect(r).toMatchObject({ ok: false });
    expect((r as { message: string }).message).toMatch(/^production not reachable: 503 none /);
  });

  it("names the Cloudflare error code from an error page", async () => {
    const base = await serve({ "/": [530, CF_1016], "/health": [530, CF_1016] });
    const r = await productionPreflight(base);
    expect((r as { message: string }).message).toMatch(/^production not reachable: 530 1016 /);
  });

  it("catches a Cloudflare error page served with a 200", async () => {
    const base = await serve({ "/": [200, CF_1016], "/health": [200, "ok"] });
    expect((await productionPreflight(base)) as { ok: boolean }).toMatchObject({ ok: false });
  });

  it("reports a refused connection as one line", async () => {
    const base = await serve({});
    await new Promise<void>((done) => server!.close(() => done()));
    server = undefined;
    const r = await productionPreflight(base);
    expect((r as { message: string }).message).toMatch(/^production not reachable: no response ECONNREFUSED /);
  });

  it("does not take a page that merely mentions an error for a Cloudflare page", () => {
    expect(cfErrorCode("<p>A 404 error happened</p>")).toBeNull();
    expect(isCfErrorPage("<p>see error code 1016 in the docs</p>")).toBe(false);
    expect(cfErrorCode(CF_1016)).toBe("1016");
  });
});
