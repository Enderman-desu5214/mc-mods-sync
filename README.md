# mc-mods-sync

Keeps the client-side mods of the players on my self-hosted NeoForge server
(Minecraft 1.21.1) in sync with the mods that the server is actually running.

```
NeoForge server (Windows)
  start-server.bat → server/sync-mods.ps1
  sends name, size, SHA-1, SHA-512 and the CurseForge fingerprint of every jar in mods/
        │  POST /api/server/mods (bearer token)
        ▼
Cloudflare Worker (this repo, https://mc-mods.enderman-desu.org)
  1. identifies each jar on Modrinth   (POST /v2/version_files, sha512)
  2. identifies the rest on CurseForge (POST /v1/fingerprints/432, POST /v1/mods)
  3. decides which mods players need (Modrinth side info + manual overrides)
  4. publishes a packwiz pack: pack.toml, index.toml, mods/*.pw.toml
        │
        ▼
Players: Prism Launcher pre-launch command runs packwiz-installer,
which adds, updates and removes mods to match the pack.
```

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
| `src/index.ts` | HTTP routes: upload, rebuild, packwiz files, status page |
| `src/resolve.ts` | Modrinth / CurseForge lookup and side detection |
| `src/packwiz.ts` | packwiz file generation |
| `src/overrides.ts` | Manual side overrides |
| `server/sync-mods.ps1` | Script run on the game server before each launch |

## Development

```sh
npm install
# .env: CURSEFORGE_API_KEY='...'  UPLOAD_TOKEN=...
npm run dev
npm run typecheck
```
