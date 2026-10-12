import { renderGuide } from "./guide";
import { buildPackFiles } from "./packwiz";
import { resolveMods } from "./resolve";
import { renderServerList, renderStatus } from "./status";
import type { BuildSummary, BuiltPack, StoredUpload, UploadedMod } from "./types";

const MAX_MODS = 2000;

/** KV のキー。パックはサーバーごとに別々に持つ */
const kvUpload = (server: string) => `upload:${server}`;
const kvPack = (server: string) => `pack:${server}`;

/**
 * URL ごとの役割（<server> は wrangler.jsonc の SERVERS にあるサーバー名。ポート番号は URL に出さない）:
 *   POST /api/server/<server>/mods     サーバーが Mod 一覧を送ってくる（要トークン）→ そのサーバーのパックを作り直す
 *   POST /api/server/<server>/rebuild  最後に届いた一覧でパックを作り直す（overrides.ts 変更後など。要トークン）
 *   GET  /<server>/pack.toml ほか      プレイヤーの packwiz-installer が読むファイル
 *   GET  /<server>/                    そのサーバーの状況ページ
 *   GET  /<server>/guide               そのサーバーのプレイヤー向け設定手順
 *   GET  /                           サーバーの一覧
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const servers = env.SERVERS.split(",").map((s) => s.trim());
    try {
      const api = url.pathname.match(/^\/api\/server\/([a-z0-9-]+)\/(mods|rebuild)$/);
      if (request.method === "POST" && api) {
        const [, server, action] = api;
        if (!servers.includes(server)) return json({ error: "unknown server" }, 404);
        if (!(await isAuthorized(request, env))) return json({ error: "unauthorized" }, 401);

        let upload: StoredUpload | null;
        if (action === "mods") {
          const mods = parseUpload(await request.json());
          if (!mods) return json({ error: "invalid body" }, 400);
          upload = { receivedAt: new Date().toISOString(), mods };
          await env.PACK.put(kvUpload(server), JSON.stringify(upload));
        } else {
          upload = await env.PACK.get<StoredUpload>(kvUpload(server), "json");
          if (!upload) return json({ error: "no upload yet" }, 404);
        }
        return json(await rebuild(server, upload, env));
      }

      if (request.method === "GET" || request.method === "HEAD") {
        if (url.pathname === "/") {
          const packs = await Promise.all(servers.map((p) => env.PACK.get<BuiltPack>(kvPack(p), "json")));
          return html(renderServerList(servers.map((server, i) => ({ server, pack: packs[i] })), url.origin));
        }

        const page = url.pathname.match(/^\/([a-z0-9-]+)(?:\/(.*))?$/);
        if (page && servers.includes(page[1])) {
          const [, server, rest = ""] = page;
          const base = `${url.origin}/${server}`;
          // "/nightfall" は "/nightfall/" に揃える（状況ページ内の相対的な案内がずれないように）
          if (url.pathname === `/${server}`) return Response.redirect(`${base}/`, 301);

          const pack = await env.PACK.get<BuiltPack>(kvPack(server), "json");
          if (rest === "") return html(renderStatus(pack, server, url.origin));
          if (rest === "guide" || rest === "guide/") {
            return html(renderGuide(pack, base, packName(env, server), env.MC_VERSION, env.NEOFORGE_VERSION));
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

/** パックの名前。サーバーごとに見分けがつくよう名前を付ける（例: ModdedMC-Onsengai-nightfall） */
function packName(env: Env, server: string): string {
  return `${env.PACK_NAME}-${server}`;
}

async function rebuild(server: string, upload: StoredUpload, env: Env): Promise<BuildSummary> {
  const mods = await resolveMods(upload.mods, env.CURSEFORGE_API_KEY, env.MC_VERSION);
  const builtAt = new Date().toISOString();
  const files = await buildPackFiles(mods, {
    name: packName(env, server),
    version: builtAt,
    minecraft: env.MC_VERSION,
    neoforge: env.NEOFORGE_VERSION,
  });
  const pack: BuiltPack = { builtAt, mods, files };
  await env.PACK.put(kvPack(server), JSON.stringify(pack));

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
