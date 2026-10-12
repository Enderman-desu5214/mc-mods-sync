import { CLIENT_EXTRAS } from "./extras";
import { findOverride } from "./overrides";
import type { ResolvedMod, Side, UploadedMod } from "./types";

const MODRINTH_API = "https://api.modrinth.com/v2";
const CURSEFORGE_API = "https://api.curseforge.com/v1";
const MINECRAFT_GAME_ID = 432;
const USER_AGENT = "enderman-desu/mc-mods-sync (https://mc-mods.enderman-desu.org)";

/**
 * サーバーのjar一覧を、Modrinth → CurseForge の順に照合して
 * 「何のModか」「プレイヤーに配る必要があるか」「どこから落とせるか」を決める。
 * そのあと、プレイヤー専用 Mod（extras.ts）を Modrinth で探して加える。
 */
export async function resolveMods(
  mods: UploadedMod[],
  curseforgeApiKey: string,
  minecraft: string,
): Promise<ResolvedMod[]> {
  const fromModrinth = await resolveOnModrinth(mods);
  const rest = mods.filter((m) => !fromModrinth.has(m.sha512));
  const fromCurseforge = rest.length > 0 ? await resolveOnCurseforge(rest, curseforgeApiKey) : new Map();

  const serverMods = mods.map((file) => {
    const found = fromModrinth.get(file.sha512) ?? fromCurseforge.get(file.fingerprint);
    const resolved: ResolvedMod = found ?? {
      file,
      source: "unresolved",
      title: file.name,
      side: "both",
      sideReason: "Modrinth / CurseForge のどちらにも見つからない",
    };
    const override = findOverride(resolved.slug, file.name);
    if (override) {
      resolved.side = override;
      resolved.sideReason = "overrides.ts で指定";
      // サーバー専用なら配らないので、どこにも見つからなくても問題にしない
      if (override === "server" && resolved.source === "unresolved") resolved.source = "local";
    }
    return resolved;
  });

  // サーバーにも同じ Mod が入っているなら、サーバーの版をそのまま使う
  const onServer = new Set(serverMods.map((m) => m.slug).filter(Boolean));
  const extras = await resolveClientExtras(CLIENT_EXTRAS.filter((slug) => !onServer.has(slug)), minecraft);
  return [...serverMods, ...extras];
}

interface ModrinthProjectVersion {
  id: string;
  project_id: string;
  version_type: "release" | "beta" | "alpha";
  files: { url: string; filename: string; primary: boolean; size: number; hashes: { sha1: string; sha512: string } }[];
}

/** extras.ts の slug ごとに、MC_VERSION + NeoForge 用の最新版（正式版を優先）を探す */
async function resolveClientExtras(slugs: string[], minecraft: string): Promise<ResolvedMod[]> {
  const query = `loaders=${encodeURIComponent('["neoforge"]')}&game_versions=${encodeURIComponent(JSON.stringify([minecraft]))}`;
  return Promise.all(
    slugs.map(async (slug): Promise<ResolvedMod> => {
      const versions = await fetchJson<ModrinthProjectVersion[]>(
        `${MODRINTH_API}/project/${encodeURIComponent(slug)}/version?${query}`,
        { headers: { "User-Agent": USER_AGENT } },
      );
      const version = versions.find((v) => v.version_type === "release") ?? versions[0];
      const file = version && (version.files.find((f) => f.primary) ?? version.files[0]);
      if (!version || !file) {
        return {
          file: { name: slug, size: 0, sha1: "", sha512: "", fingerprint: 0 },
          source: "unresolved",
          title: slug,
          slug,
          side: "client",
          sideReason: `extras.ts で指定。Modrinth に ${minecraft} / NeoForge 用の版が無い`,
        };
      }
      const project = await fetchJson<ModrinthProject>(`${MODRINTH_API}/project/${version.project_id}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      return {
        file: { name: file.filename, size: file.size, sha1: file.hashes.sha1, sha512: file.hashes.sha512, fingerprint: 0 },
        source: "modrinth",
        title: project.title,
        slug: project.slug,
        side: "client",
        sideReason: "extras.ts でプレイヤー専用に指定",
        url: file.url,
        modrinth: { projectId: project.id, versionId: version.id },
      };
    }),
  );
}

interface ModrinthVersion {
  id: string;
  project_id: string;
  files: { url: string; hashes: { sha512: string } }[];
}

interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  client_side: string;
  server_side: string;
}

async function resolveOnModrinth(mods: UploadedMod[]): Promise<Map<string, ResolvedMod>> {
  const versions = await fetchJson<Record<string, ModrinthVersion>>(`${MODRINTH_API}/version_files`, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json" },
    body: JSON.stringify({ hashes: mods.map((m) => m.sha512), algorithm: "sha512" }),
  });

  const projectIds = [...new Set(Object.values(versions).map((v) => v.project_id))];
  const projects = new Map<string, ModrinthProject>();
  for (let i = 0; i < projectIds.length; i += 100) {
    const ids = encodeURIComponent(JSON.stringify(projectIds.slice(i, i + 100)));
    const batch = await fetchJson<ModrinthProject[]>(`${MODRINTH_API}/projects?ids=${ids}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    for (const p of batch) projects.set(p.id, p);
  }

  const result = new Map<string, ResolvedMod>();
  for (const file of mods) {
    const version = versions[file.sha512];
    const project = version && projects.get(version.project_id);
    if (!version || !project) continue;
    const { side, reason } = sideFromModrinth(project);
    result.set(file.sha512, {
      file,
      source: "modrinth",
      title: project.title,
      slug: project.slug,
      side,
      sideReason: reason,
      url: version.files.find((f) => f.hashes.sha512 === file.sha512)?.url,
      modrinth: { projectId: project.id, versionId: version.id },
    });
  }
  return result;
}

function sideFromModrinth(p: ModrinthProject): { side: Side; reason: string } {
  const reason = `Modrinth: client=${p.client_side}, server=${p.server_side}`;
  if (p.client_side === "unsupported") return { side: "server", reason };
  if (p.server_side === "unsupported") return { side: "client", reason };
  return { side: "both", reason };
}

interface CurseforgeFile {
  id: number;
  modId: number;
  fileName: string;
  downloadUrl: string | null;
}

interface CurseforgeMod {
  id: number;
  name: string;
  slug: string;
}

async function resolveOnCurseforge(mods: UploadedMod[], apiKey: string): Promise<Map<number, ResolvedMod>> {
  if (!apiKey) throw new Error("CURSEFORGE_API_KEY が設定されていません");
  const headers = { "x-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" };

  const matches = await fetchJson<{ data: { exactMatches: { file: CurseforgeFile }[]; exactFingerprints: number[] } }>(
    `${CURSEFORGE_API}/fingerprints/${MINECRAFT_GAME_ID}`,
    { method: "POST", headers, body: JSON.stringify({ fingerprints: mods.map((m) => m.fingerprint) }) },
  );
  const files = matches.data.exactMatches.map((m) => m.file);
  if (files.length === 0) return new Map();

  const modInfo = await fetchJson<{ data: CurseforgeMod[] }>(`${CURSEFORGE_API}/mods`, {
    method: "POST",
    headers,
    body: JSON.stringify({ modIds: [...new Set(files.map((f) => f.modId))] }),
  });
  const modsById = new Map(modInfo.data.map((m) => [m.id, m]));

  const result = new Map<number, ResolvedMod>();
  for (const file of mods) {
    // exactFingerprints[i] が exactMatches[i] (= files[i]) の照合値
    const cf = files[matches.data.exactFingerprints.indexOf(file.fingerprint)];
    const mod = cf && modsById.get(cf.modId);
    if (!cf || !mod) continue;
    result.set(file.fingerprint, {
      file,
      source: "curseforge",
      title: mod.name,
      slug: mod.slug,
      side: "both",
      sideReason: "CurseForge には side 情報が無いため both",
      url: cf.downloadUrl ?? undefined,
      curseforge: { projectId: mod.id, fileId: cf.id },
    });
  }
  return result;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}
