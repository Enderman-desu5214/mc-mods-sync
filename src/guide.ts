import type { BuiltPack } from "./types";

/** https://mc-mods.enderman-desu.org/guide で表示するプレイヤー向け設定手順 */
export function renderGuide(pack: BuiltPack | null, origin: string, mc: string, neoforge: string): string {
  const count = pack ? pack.mods.filter((m) => m.source !== "unresolved" && m.side !== "server").length : null;
  const command = `"$INST_JAVA" -jar packwiz-installer-bootstrap.jar ${origin}/pack.toml`;

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mod 同期の設定手順</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--sub:#666;--line:#ddd;--code:#f3f4f6;--accent:#067647;--warn:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--sub:#999;--line:#333;--code:#1f2937;--accent:#47cd89;--warn:#f97066}}
body{background:var(--bg);color:var(--fg);font:15px/1.7 system-ui,sans-serif;margin:0 auto;max-width:760px;padding:16px}
h1{font-size:22px;margin:8px 0 16px}h2{border-top:1px solid var(--line);font-size:18px;margin:32px 0 8px;padding-top:16px}
a{color:var(--accent)}code{background:var(--code);border-radius:4px;font-size:13px;padding:1px 4px;overflow-wrap:anywhere}
pre{background:var(--code);border-radius:6px;overflow-x:auto;padding:12px}pre code{padding:0}
li{margin:4px 0}.note{color:var(--sub)}.warn{color:var(--warn)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
button{background:var(--accent);border:0;border-radius:4px;color:var(--bg);cursor:pointer;font:inherit;margin-top:4px;padding:2px 10px}
</style></head><body>
<h1>ModdedMC-Onsengai Mod 自動同期の設定手順</h1>

<h2>このページでできること</h2>
<p>一度だけ設定すれば、Prism Launcher でゲームを起動するたびに、サーバーと同じ Mod が自動でそろいます。サーバーで Mod が追加・更新・削除されると、次の起動時に自分の Mod も同じように入れ替わります。</p>
<p>設定は 4 手順、10〜15 分ほどです。${count !== null ? `いま配布している Mod は ${count} 個で、` : ""}初回はダウンロードに数分かかります。</p>
<p>配布中の Mod 一覧は <a href="${origin}/">状況ページ</a> で見られます。</p>

<h2>用意するもの</h2>
<div class="scroll"><table>
<thead><tr><th>もの</th><th>入手先</th><th>メモ</th></tr></thead>
<tbody>
<tr><td>Prism Launcher</td><td><a href="https://prismlauncher.org/">prismlauncher.org</a></td><td>インストールして、Minecraft（Java 版）を購入した Microsoft アカウントでログインしておく</td></tr>
<tr><td>packwiz-installer-bootstrap.jar</td><td><a href="https://github.com/packwiz/packwiz-installer-bootstrap/releases">GitHub のリリースページ</a></td><td>最新版の Assets から <code>packwiz-installer-bootstrap.jar</code> をダウンロード。Mod を同期する小さなツール</td></tr>
</tbody></table></div>
<p>Java は Prism Launcher が自動で用意するので、自分で入れる必要はありません。</p>

<h2>手順 1: インスタンスを作る</h2>
<p>サーバー専用の「インスタンス」（Minecraft の環境ひとつ分）を、Minecraft ${esc(mc)} + NeoForge ${esc(neoforge)} で作ります。</p>
<ol>
<li>Prism Launcher 左上の「インスタンスを追加」を押す</li>
<li>「カスタム」を選び、バージョン一覧から <b>${esc(mc)}</b> を選ぶ</li>
<li>右下の「Mod ローダー」で <b>NeoForge</b> を選び、バージョン <b>${esc(neoforge)}</b> を選ぶ</li>
<li>名前を <code>ModdedMC-Onsengai</code> など分かりやすいものにして「OK」</li>
</ol>
<p>この時点ではまだ起動しないでください。</p>

<h2>手順 2: packwiz-installer-bootstrap.jar を置く</h2>
<p>インスタンスのフォルダの中に <code>minecraft</code> フォルダを<b>自分で作り</b>、その中に jar をそのままの名前で置きます。</p>
<ol>
<li>手順 1 で作ったインスタンスを右クリック →「フォルダ」を押す。<br>
<span class="note">開くのはインスタンスのフォルダです。Prism Launcher の設定を変えていなければ <code>C:\\Users\\&lt;ユーザー名&gt;\\AppData\\Roaming\\PrismLauncher\\instances\\&lt;インスタンス名&gt;</code> です。</span></li>
<li>そのフォルダの中に、<code>minecraft</code> という名前のフォルダを新しく作る（最初は無いのが普通です。すでにあればそれを使う）</li>
<li>作った <code>minecraft</code> フォルダに入り、<code>packwiz-installer-bootstrap.jar</code> をコピーする</li>
</ol>
<p>置き終わると、次の場所に jar がある状態になります。</p>
<pre><code>instances\\&lt;インスタンス名&gt;\\minecraft\\packwiz-installer-bootstrap.jar</code></pre>
<p class="warn">ファイル名は変えないでください。<code>mods</code> フォルダ（初回起動後に <code>minecraft</code> の中にできます）の中には入れないでください。</p>

<h2>手順 3: 起動前コマンドを設定する</h2>
<p>ゲーム起動の直前に Mod の同期が動くように、次の 1 行を登録します。</p>
<ol>
<li>インスタンスを右クリック →「編集」</li>
<li>左の一覧から「設定」→ 上のタブで「カスタムコマンド」を開く</li>
<li>「カスタムコマンド」にチェックを入れる</li>
<li>「起動前コマンド」欄に、下の 1 行を<b>そのまま</b>貼り付ける</li>
<li>「閉じる」を押す</li>
</ol>
<pre><code id="cmd">${esc(command)}</code></pre>
<button type="button" onclick="navigator.clipboard.writeText(document.getElementById('cmd').textContent).then(()=>{this.textContent='コピーしました'})">コピー</button>
<p><code>$INST_JAVA</code> は「このインスタンスが使う Java」を指す合言葉です。Prism Launcher が自動で置き換えるので、書き換えないでください。</p>

<h2>手順 4: 起動してサーバーに入る</h2>
<p>インスタンスを起動すると、Minecraft の前に同期の小さなウィンドウが出て Mod をダウンロードします。</p>
<ol>
<li>インスタンスをダブルクリックして起動する</li>
<li>同期ウィンドウが閉じるまで待つ（初回は数分。次回からは変更分だけなので数秒）</li>
<li>Minecraft が立ち上がったら「マルチプレイ」→「サーバーを追加」で、管理者から教わったアドレスを入れて接続する</li>
</ol>
<p>2 回目以降も、普通に起動するだけで毎回自動で同期されます。</p>

<h2>困ったとき</h2>
<div class="scroll"><table>
<thead><tr><th>症状</th><th>対処</th></tr></thead>
<tbody>
<tr><td>「Unable to access jarfile」と出て起動しない</td><td>jar の置き場所か名前が違います。手順 2 をやり直してください</td></tr>
<tr><td>同期ウィンドウがエラーになる、起動前コマンドが失敗したと出る</td><td>ネットにつながっているか確かめ、もう一度起動。続くようならエラー画面の写真を管理者へ</td></tr>
<tr><td>サーバー接続時に「Mod が足りない」「バージョンが違う」と弾かれる</td><td>一度ゲームを終了して起動し直す（最新に同期されます）。それでも弾かれるときは、画面に出た Mod 名を管理者へ</td></tr>
<tr><td>CurseForge から手動でダウンロードするよう求められる</td><td>配布制限のある Mod です。画面の案内に従ってダウンロードし、指定の場所に置きます</td></tr>
<tr><td>自分で追加した Mod（ミニマップなど）はどうなる？</td><td>同期で消されることはありません。ただし弾かれる原因になることがあるので、困ったら外して試してください</td></tr>
</tbody></table></div>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
