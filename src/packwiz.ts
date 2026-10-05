import type { ResolvedMod } from "./types";

/**
 * packwiz 形式のファイル一式を作る。
 * プレイヤーの packwiz-installer は pack.toml → index.toml → mods/*.pw.toml の順に読み、
 * 一覧に無くなったModは自動で削除する。
 *
 * 配布するのは「side が server 以外」かつ「ダウンロード方法が分かる」Modだけ。
 */
export async function buildPackFiles(
  mods: ResolvedMod[],
  meta: { name: string; version: string; minecraft: string; neoforge: string },
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const mod of mods) {
    if (mod.side === "server" || mod.source === "unresolved") continue;
    files[`mods/${metaFileName(mod.file.name)}`] = modToml(mod);
  }

  const indexLines = ['hash-format = "sha256"', ""];
  for (const [path, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    indexLines.push("[[files]]", `file = ${str(path)}`, `hash = ${str(await sha256(content))}`, "metafile = true", "");
  }
  const index = indexLines.join("\n");
  files["index.toml"] = index;

  files["pack.toml"] = [
    `name = ${str(meta.name)}`,
    `version = ${str(meta.version)}`,
    'pack-format = "packwiz:1.1.0"',
    "",
    "[index]",
    'file = "index.toml"',
    'hash-format = "sha256"',
    `hash = ${str(await sha256(index))}`,
    "",
    "[versions]",
    `minecraft = ${str(meta.minecraft)}`,
    `neoforge = ${str(meta.neoforge)}`,
    "",
  ].join("\n");

  return files;
}

function modToml(mod: ResolvedMod): string {
  const lines = [`name = ${str(mod.title)}`, `filename = ${str(mod.file.name)}`, `side = ${str(mod.side)}`, "", "[download]"];
  if (mod.url) {
    lines.push(`url = ${str(mod.url)}`);
  } else {
    // 配布制限のある CurseForge Mod: packwiz-installer がプレイヤーに手動ダウンロードを案内する
    lines.push('mode = "metadata:curseforge"');
  }
  lines.push('hash-format = "sha1"', `hash = ${str(mod.file.sha1)}`, "");

  if (mod.modrinth) {
    lines.push("[update.modrinth]", `mod-id = ${str(mod.modrinth.projectId)}`, `version = ${str(mod.modrinth.versionId)}`, "");
  } else if (mod.curseforge) {
    lines.push("[update.curseforge]", `file-id = ${mod.curseforge.fileId}`, `project-id = ${mod.curseforge.projectId}`, "");
  }
  return lines.join("\n");
}

/** "jei-1.21.1-neoforge-19.21.jar" → "jei-1.21.1-neoforge-19.21.pw.toml"（URLで安全な文字だけにする） */
function metaFileName(jarName: string): string {
  return jarName.replace(/\.jar$/i, "").replace(/[^A-Za-z0-9._+-]/g, "_") + ".pw.toml";
}

/** TOML の文字列。JSON の文字列表記は TOML の basic string としてそのまま使える */
function str(s: string): string {
  return JSON.stringify(s);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
