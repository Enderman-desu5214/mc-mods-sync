/**
 * サーバーには入れず、プレイヤーにだけ配る Mod（Modrinth の slug）。
 *
 * サーバーから届く一覧には載らないので、パックを作るたびに Worker が Modrinth で
 * MC_VERSION / NeoForge 用の最新版（正式版を優先）を探して配布に加える。
 * 前提 Mod があるときは、それもここに書く（例: reeses-sodium-options には sodium が必要）。
 *
 * 書き換えたら `npm run deploy` のあと、/api/rebuild を呼ぶと反映される。
 */
export const CLIENT_EXTRAS: string[] = [
  "sodium",
  "reeses-sodium-options",
  "entityculling",
  "lambdynamiclights",
  "xaeros-minimap",
  "xaeros-world-map",
];
