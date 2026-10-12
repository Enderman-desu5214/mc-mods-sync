import type { BuiltPack, ResolvedMod } from "./types";

/** https://mc-mods.enderman-desu.org/ で表示する状況ページ */
export function renderStatus(pack: BuiltPack | null, origin: string): string {
  if (!pack) return page("<p>まだサーバーからMod一覧が届いていません。</p>");

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
  <td>${esc(m.title)}${m.source !== "unresolved" && !m.url ? ' <span class="tag">手動DL</span>' : ""}</td>
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

  return page(`<p>はじめての人は <a href="${esc(origin)}/guide">設定手順</a> を見てください。</p>
<p>最終更新: ${esc(new Date(pack.builtAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }))}（全 ${pack.mods.length} 個）</p>
<p>Prism Launcher の起動前コマンドに指定するURL: <code>${esc(origin)}/pack.toml</code></p>
${sections}`);
}

function page(body: string): string {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mod同期状況</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--sub:#666;--line:#ddd;--warn:#b42318;--ok:#067647;--muted:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--sub:#999;--line:#333;--warn:#f97066;--ok:#47cd89;--muted:#9ca3af}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
h2{font-size:16px;margin:24px 0 8px}.unresolved h2{color:var(--warn)}.client h2{color:var(--ok)}.server h2{color:var(--muted)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}
.sub{color:var(--sub);font-size:12px}.tag{border:1px solid var(--warn);border-radius:4px;color:var(--warn);font-size:11px;padding:0 4px}
</style></head><body><h1>Mod同期状況</h1>${body}</body></html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
