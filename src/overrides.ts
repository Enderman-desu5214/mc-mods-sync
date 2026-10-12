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
  // Modrinth では client=unsupported だが、プレイヤー側の Mod が前提にしている
  "smartbrainlib": "both", // occultism が必要とする

  // どこにも公開していない自作 Mod（seed-mod/）。サーバーだけで動く
  "file:dimseeds-": "server",

  // 1.21.1 サーバーの mod 選定（親フォルダの final-mods.tsv）で「サーバーだけ」と決めたもの。
  // プレイヤー側に無くても接続できるので、Modrinth が optional としていても配らない
  "chunky": "server", // Chunky
  "chunkyborder": "server", // Chunky Border
  "ftb-ranks-forge": "server", // FTB Ranks
  "multiworld": "server", // Multiworld
  "neruina": "server", // Neruina
  "create-liquid-fuel": "server", // Create: Liquid Fuel
  "towns-and-towers": "server", // Towns and Towers
  "yungs-better-desert-temples": "server", // YUNG's Better Desert Temples
  "yungs-better-dungeons": "server", // YUNG's Better Dungeons
  "yungs-better-end-island": "server", // YUNG's Better End Island
  "yungs-better-jungle-temples": "server", // YUNG's Better Jungle Temples
  "yungs-better-mineshafts": "server", // YUNG's Better Mineshafts
  "yungs-better-nether-fortresses": "server", // YUNG's Better Nether Fortresses
  "yungs-better-ocean-monuments": "server", // YUNG's Better Ocean Monuments
  "yungs-better-strongholds": "server", // YUNG's Better Strongholds
  "yungs-better-witch-huts": "server", // YUNG's Better Witch Huts
  "yungs-bridges": "server", // YUNG's Bridges
  "yungs-extras": "server", // YUNG's Extras
  "ai-improvements": "server", // AI Improvements: Performance Tuning
  "audrops": "server", // AlmostUnifiedDrops
  "noisiumforked": "server", // NoisiumForked
  "configurable": "server", // Configurable
  "cristel-lib": "server", // Cristel Lib
};

export function findOverride(slug: string | undefined, fileName: string): Side | undefined {
  if (slug && slug in SIDE_OVERRIDES) return SIDE_OVERRIDES[slug];
  for (const [key, side] of Object.entries(SIDE_OVERRIDES)) {
    if (key.startsWith("file:") && fileName.startsWith(key.slice(5))) return side;
  }
  return undefined;
}
