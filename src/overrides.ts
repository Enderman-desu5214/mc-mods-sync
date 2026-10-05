import type { Side } from "./types";

/**
 * 自動判定（Modrinth の client_side など）を手動で上書きするリスト。
 *
 * キーは次のどちらか:
 *   - Modrinth / CurseForge の slug（状況ページの「slug」列に出る値）
 *   - "file:" + jar ファイル名の先頭部分（どこにも見つからないModに使う）
 *
 * 値:
 *   "both"   … プレイヤーにも配布する
 *   "client" … プレイヤーにだけ配布する（サーバーにあっても同じ扱い）
 *   "server" … サーバー専用。プレイヤーには配布しない
 *
 * 書き換えたら `npm run deploy` のあと、/api/rebuild を呼ぶと反映される。
 */
export const SIDE_OVERRIDES: Record<string, Side> = {
  // 例:
  // "smartbrainlib": "both",
  // "file:mob_grinding_utils": "both",
};

export function findOverride(slug: string | undefined, fileName: string): Side | undefined {
  if (slug && slug in SIDE_OVERRIDES) return SIDE_OVERRIDES[slug];
  for (const [key, side] of Object.entries(SIDE_OVERRIDES)) {
    if (key.startsWith("file:") && fileName.startsWith(key.slice(5))) return side;
  }
  return undefined;
}
