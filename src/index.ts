import { renderGuide } from "./guide";
import { buildPackFiles } from "./packwiz";
import { resolveMods } from "./resolve";
import { renderStatus } from "./status";
import type { BuildSummary, BuiltPack, StoredUpload, UploadedMod } from "./types";

const KV_UPLOAD = "upload";
const KV_PACK = "pack";
const MAX_MODS = 2000;

/**
 * URL ごとの役割:
 *   POST /api/server/mods  サーバーが Mod 一覧を送ってくる（要トークン）→ パックを作り直す
 *   POST /api/rebuild      最後に届いた一覧でパックを作り直す（overrides.ts 変更後など。要トークン）
 *   GET  /pack.toml ほか   プレイヤーの packwiz-installer が読むファイル
 *   GET  /                 状況ページ
 *   GET  /guide            プレイヤー向け設定手順
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/api/server/mods") {
        if (!(await isAuthorized(request, env))) return json({ error: "unauthorized" }, 401);
        const mods = parseUpload(await request.json());
        if (!mods) return json({ error: "invalid body" }, 400);
        const upload: StoredUpload = { receivedAt: new Date().toISOString(), mods };
        await env.PACK.put(KV_UPLOAD, JSON.stringify(upload));
        return json(await rebuild(upload, env));
      }

      if (request.method === "POST" && url.pathname === "/api/rebuild") {
        if (!(await isAuthorized(request, env))) return json({ error: "unauthorized" }, 401);
        const upload = await env.PACK.get<StoredUpload>(KV_UPLOAD, "json");
        if (!upload) return json({ error: "no upload yet" }, 404);
        return json(await rebuild(upload, env));
      }

      if (request.method === "GET" || request.method === "HEAD") {
        const pack = await env.PACK.get<BuiltPack>(KV_PACK, "json");
        if (url.pathname === "/") {
          return new Response(renderStatus(pack, url.origin), { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        if (url.pathname === "/guide" || url.pathname === "/guide/") {
          const html = renderGuide(pack, url.origin, env.MC_VERSION, env.NEOFORGE_VERSION);
          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        const content = pack?.files[url.pathname.slice(1)];
        if (content !== undefined) {
          return new Response(content, { headers: { "Content-Type": "application/toml; charset=utf-8", "Cache-Control": "no-cache" } });
        }
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function rebuild(upload: StoredUpload, env: Env): Promise<BuildSummary> {
  const mods = await resolveMods(upload.mods, env.CURSEFORGE_API_KEY);
  const builtAt = new Date().toISOString();
  const files = await buildPackFiles(mods, {
    name: env.PACK_NAME,
    version: builtAt,
    minecraft: env.MC_VERSION,
    neoforge: env.NEOFORGE_VERSION,
  });
  const pack: BuiltPack = { builtAt, mods, files };
  await env.PACK.put(KV_PACK, JSON.stringify(pack));

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

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}
