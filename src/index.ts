import { renderGuide } from "./guide";
import { buildPackFiles } from "./packwiz";
import { resolveMods } from "./resolve";
import { renderPortList, renderStatus } from "./status";
import type { BuildSummary, BuiltPack, StoredUpload, UploadedMod } from "./types";

const MAX_MODS = 2000;

/** KV のキー。パックはサーバーのポートごとに別々に持つ */
const kvUpload = (port: string) => `upload:${port}`;
const kvPack = (port: string) => `pack:${port}`;

/**
 * URL ごとの役割（<port> は wrangler.jsonc の PORTS にあるポート番号）:
 *   POST /api/server/<port>/mods     サーバーが Mod 一覧を送ってくる（要トークン）→ そのポートのパックを作り直す
 *   POST /api/server/<port>/rebuild  最後に届いた一覧でパックを作り直す（overrides.ts 変更後など。要トークン）
 *   GET  /<port>/pack.toml ほか      プレイヤーの packwiz-installer が読むファイル
 *   GET  /<port>/                    そのポートの状況ページ
 *   GET  /<port>/guide               そのポートのプレイヤー向け設定手順
 *   GET  /                           ポートの一覧
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const ports = env.PORTS.split(",").map((p) => p.trim());
    try {
      const api = url.pathname.match(/^\/api\/server\/(\d+)\/(mods|rebuild)$/);
      if (request.method === "POST" && api) {
        const [, port, action] = api;
        if (!ports.includes(port)) return json({ error: "unknown port" }, 404);
        if (!(await isAuthorized(request, env))) return json({ error: "unauthorized" }, 401);

        let upload: StoredUpload | null;
        if (action === "mods") {
          const mods = parseUpload(await request.json());
          if (!mods) return json({ error: "invalid body" }, 400);
          upload = { receivedAt: new Date().toISOString(), mods };
          await env.PACK.put(kvUpload(port), JSON.stringify(upload));
        } else {
          upload = await env.PACK.get<StoredUpload>(kvUpload(port), "json");
          if (!upload) return json({ error: "no upload yet" }, 404);
        }
        return json(await rebuild(port, upload, env));
      }

      if (request.method === "GET" || request.method === "HEAD") {
        if (url.pathname === "/") {
          const packs = await Promise.all(ports.map((p) => env.PACK.get<BuiltPack>(kvPack(p), "json")));
          return html(renderPortList(ports.map((port, i) => ({ port, pack: packs[i] })), url.origin));
        }

        const page = url.pathname.match(/^\/(\d+)(?:\/(.*))?$/);
        if (page && ports.includes(page[1])) {
          const [, port, rest = ""] = page;
          const base = `${url.origin}/${port}`;
          // "/25564" は "/25564/" に揃える（状況ページ内の相対的な案内がずれないように）
          if (url.pathname === `/${port}`) return Response.redirect(`${base}/`, 301);

          const pack = await env.PACK.get<BuiltPack>(kvPack(port), "json");
          if (rest === "") return html(renderStatus(pack, port, url.origin));
          if (rest === "guide" || rest === "guide/") {
            return html(renderGuide(pack, base, packName(env, port), env.MC_VERSION, env.NEOFORGE_VERSION));
          }
          const content = pack?.files[rest];
          if (content !== undefined) {
            return new Response(content, { headers: { "Content-Type": "application/toml; charset=utf-8", "Cache-Control": "no-cache" } });
          }
        }
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

/** パックの名前。ポートごとに見分けがつくよう番号を付ける（例: ModdedMC-Onsengai-25564） */
function packName(env: Env, port: string): string {
  return `${env.PACK_NAME}-${port}`;
}

async function rebuild(port: string, upload: StoredUpload, env: Env): Promise<BuildSummary> {
  const mods = await resolveMods(upload.mods, env.CURSEFORGE_API_KEY, env.MC_VERSION);
  const builtAt = new Date().toISOString();
  const files = await buildPackFiles(mods, {
    name: packName(env, port),
    version: builtAt,
    minecraft: env.MC_VERSION,
    neoforge: env.NEOFORGE_VERSION,
  });
  const pack: BuiltPack = { builtAt, mods, files };
  await env.PACK.put(kvPack(port), JSON.stringify(pack));

  return {
    client: mods.filter((m) => m.source !== "unresolved" && m.side !== "server").length,
    serverOnly: mods.filter((m) => m.source !== "unresolved" && m.side === "server").length,
    unresolved: mods.filter((m) => m.source === "unresolved").length,
  };
}

/** Authorization: Bearer <UPLOAD_TOKEN> を、時間差で推測されない方法で比較する */
async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  const given = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.UPLOAD_TOKEN || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(env.UPLOAD_TOKEN)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** 送られてきた JSON が想定どおりの形かを確かめる。おかしければ null */
function parseUpload(body: unknown): UploadedMod[] | null {
  const mods = (body as { mods?: unknown })?.mods;
  if (!Array.isArray(mods) || mods.length === 0 || mods.length > MAX_MODS) return null;
  const ok = mods.every(
    (m: UploadedMod) =>
      typeof m?.name === "string" &&
      /^[^\\/]+\.jar$/i.test(m.name) &&
      Number.isInteger(m.size) &&
      /^[0-9a-f]{40}$/.test(m.sha1) &&
      /^[0-9a-f]{128}$/.test(m.sha512) &&
      Number.isInteger(m.fingerprint) &&
      m.fingerprint >= 0,
  );
  return ok ? mods.map(({ name, size, sha1, sha512, fingerprint }: UploadedMod) => ({ name, size, sha1, sha512, fingerprint })) : null;
}

function html(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}
