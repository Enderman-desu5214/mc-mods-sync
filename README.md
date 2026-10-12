# mc-mods-sync

Keeps the client-side mods of the players on my self-hosted NeoForge server
(Minecraft 1.21.1) in sync with the mods that the server is actually running.

```
NeoForge server (Ubuntu + Docker, itzg/minecraft-server)
  server/sync-mods.py, run on the host after the server has started
  sends name, size, SHA-1, SHA-512 and the CurseForge fingerprint of every jar in mods/
        │  POST /api/server/<server>/mods (bearer token)
        ▼
Cloudflare Worker (this repo, https://mc-mods.enderman-desu.org)
  1. identifies each jar on Modrinth   (POST /v2/version_files, sha512)
  2. identifies the rest on CurseForge (POST /v1/fingerprints/432, POST /v1/mods)
  3. decides which mods players need (Modrinth side info + manual overrides)
  4. adds client-only mods that the server does not run (src/extras.ts, latest Modrinth version)
  5. publishes a packwiz pack per server: /<server>/pack.toml, index.toml, mods/*.pw.toml
        │
        ▼
Players: Prism Launcher pre-launch command runs packwiz-installer,
which adds, updates and removes mods to match the pack.
```

Each server (`SERVERS` in `wrangler.jsonc`, e.g. `nightfall`) has its own pack, so the
servers can run different mod sets. URLs use the server name, never the port. `src/extras.ts` and `src/overrides.ts`
apply to every server.

## Use of the CurseForge API

- Called only when the server reports its mod list, which happens once per server start
  (a few times a day at most). Each report makes 2 requests: `fingerprints` and `mods`.
- Mod files are **not re-hosted**. Download URLs point to CurseForge's own CDN.
  When a project disables third-party distribution (`downloadUrl` is null), the pack
  uses packwiz's `mode = "metadata:curseforge"`, so the player downloads that file manually from CurseForge.
- The API key is stored as a Cloudflare secret and never leaves the Worker.

## Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | HTTP routes: upload, rebuild, packwiz files, status pages (per server) |
| `src/resolve.ts` | Modrinth / CurseForge lookup and side detection |
| `src/packwiz.ts` | packwiz file generation |
| `src/overrides.ts` | Manual side overrides |
| `src/extras.ts` | Client-only mods to distribute in addition to the server's mods |
| `server/sync-mods.py` | Script run on the server host after the server has started |

## Development

```sh
npm install
# .env: CURSEFORGE_API_KEY='...'  UPLOAD_TOKEN=...
npm run dev
npm run typecheck
```
