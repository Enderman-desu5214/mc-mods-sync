import type { BuiltPack, ResolvedMod } from "./types";

/** https://mc-mods.enderman-desu.org/ で表示する、ポートの一覧 */
export function renderPortList(entries: { port: string; pack: BuiltPack | null }[], origin: string): string {
  const rows = entries
    .map(({ port, pack }) => {
      const count = pack ? pack.mods.filter((m) => m.source !== "unresolved" && m.side !== "server").length : null;
      return `<tr>
  <td><a href="${esc(origin)}/${esc(port)}/">${esc(port)}</a></td>
  <td>${pack ? `${esc(jst(pack.builtAt))}（配布 ${count} 個）` : '<span class="sub">まだ一覧が届いていません</span>'}</td>
  <td><a href="${esc(origin)}/${esc(port)}/guide">設定手順</a></td>
</tr>`;
    })
    .join("");
  return page(
    "Mod同期状況",
    `<p>サーバーのポートごとに、配る Mod の組み合わせ（パック）が分かれています。自分が入るサーバーのポートを選んでください。</p>
<div class="scroll"><table><thead><tr><th>ポート</th><th>最終更新</th><th>手順</th></tr></thead>
<tbody>${rows}</tbody></table></div>`,
  );
}

/** https://mc-mods.enderman-desu.org/<port>/ で表示する、そのポートの状況ページ */
export function renderStatus(pack: BuiltPack | null, port: string, origin: string): string {
  const title = `Mod同期状況（ポート ${port}）`;
  const back = `<p><a href="${esc(origin)}/">← ポートの一覧</a></p>`;
  if (!pack) return page(title, `${back}<p>まだサーバーからMod一覧が届いていません。</p>`);
  const base = `${origin}/${port}`;

  const groups: [string, string, ResolvedMod[]][] = [
    ["unresolved", "特定できなかったMod（配布できません）", pack.mods.filter((m) => m.source === "unresolved")],
    ["server", "サーバー専用と判定（配布しない）", pack.mods.filter((m) => m.source !== "unresolved" && m.side === "server")],
    ["client", "プレイヤーに配布", pack.mods.filter((m) => m.source !== "unresolved" && m.side !== "server")],
  ];

  const sections = groups
    .map(([key, title, mods]) => {
      if (mods.length === 0) return "";
      const rows = mods
        .map(
          (m) => `<tr>
  <td>${esc(m.title)}${m.source !== "unresolved" && m.side !== "server" && !m.url ? ' <span class="tag">手動DL</span>' : ""}</td>
  <td><code>${esc(m.slug ?? "")}</code></td>
  <td>${esc(m.source)}</td>
  <td>${esc(m.side)}</td>
  <td class="sub">${esc(m.sideReason)}</td>
  <td class="sub"><code>${esc(m.file.name)}</code></td>
</tr>`,
        )
        .join("");
      return `<section class="${key}"><h2>${esc(title)}: ${mods.length}</h2>
<div class="scroll"><table><thead><tr><th>Mod</th><th>slug</th><th>入手先</th><th>side</th><th>判定理由</th><th>ファイル</th></tr></thead>
<tbody>${rows}</tbody></table></div></section>`;
    })
    .join("");

  return page(
    title,
    `${back}<p>はじめての人は <a href="${esc(base)}/guide">設定手順</a> を見てください。</p>
<p>最終更新: ${esc(jst(pack.builtAt))}（全 ${pack.mods.length} 個）</p>
<p>Prism Launcher の起動前コマンドに指定するURL: <code>${esc(base)}/pack.toml</code></p>
${sections}`,
  );
}

function jst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--sub:#666;--line:#ddd;--warn:#b42318;--ok:#067647;--muted:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--sub:#999;--line:#333;--warn:#f97066;--ok:#47cd89;--muted:#9ca3af}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
h2{font-size:16px;margin:24px 0 8px}.unresolved h2{color:var(--warn)}.client h2{color:var(--ok)}.server h2{color:var(--muted)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}
.sub{color:var(--sub);font-size:12px}.tag{border:1px solid var(--warn);border-radius:4px;color:var(--warn);font-size:11px;padding:0 4px}
</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
