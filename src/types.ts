/** サーバーの sync-mods.py が送ってくる、jar 1個分の情報 */
export interface UploadedMod {
  name: string;
  size: number;
  sha1: string;
  sha512: string;
  /** CurseForge の照合用ハッシュ (MurmurHash2) */
  fingerprint: number;
}

/** KV に保存する「最後に届いたMod一覧」 */
export interface StoredUpload {
  receivedAt: string;
  mods: UploadedMod[];
}

/**
 * packwiz の side と同じ意味。
 * both = サーバーとプレイヤー両方 / client = プレイヤーのみ / server = サーバーのみ（配布しない）
 */
export type Side = "both" | "client" | "server";

export interface ResolvedMod {
  file: UploadedMod;
  /** local = どこにも公開していないが、overrides.ts でサーバー専用と指定した Mod */
  source: "modrinth" | "curseforge" | "local" | "unresolved";
  title: string;
  slug?: string;
  side: Side;
  /** その side になった理由（状況ページに表示する） */
  sideReason: string;
  /** 直接ダウンロードできるURL。CurseForge で配布が制限されているModは無い */
  url?: string;
  modrinth?: { projectId: string; versionId: string };
  curseforge?: { projectId: number; fileId: number };
}

/** KV に保存する「生成済みのパック」 */
export interface BuiltPack {
  builtAt: string;
  mods: ResolvedMod[];
  /** 公開パス (例: "pack.toml", "mods/jei.pw.toml") → ファイルの中身 */
  files: Record<string, string>;
}

export interface BuildSummary {
  client: number;
  serverOnly: number;
  unresolved: number;
}
