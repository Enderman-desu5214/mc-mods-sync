#!/usr/bin/env python3
"""Report the server's mod list to the mods-sync Worker.

Run on the Ubuntu server host after the Minecraft container has started
(the itzg image downloads the mods during startup):

    python3 sync-mods.py --server nightfall /srv/minecraft/<server>/data/mods

--server is the server name used in the Worker URLs (SERVERS in wrangler.jsonc);
each server has its own pack.

For every jar it sends: file name, size, SHA-1, SHA-512 and the CurseForge
fingerprint. The Worker matches them against Modrinth / CurseForge and
rebuilds the packwiz pack that players' Prism Launcher syncs from.

The upload token is read from sync-mods.token next to this script (one line).
CurseForge fingerprints are slow to compute in pure Python, so they are cached
by SHA-512 in sync-mods.cache.json next to this script.

Standard library only.
"""

import argparse
import hashlib
import json
import struct
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENDPOINT = "https://mc-mods.enderman-desu.org/api/server/{server}/mods"
HERE = Path(__file__).resolve().parent
TOKEN_FILE = HERE / "sync-mods.token"
CACHE_FILE = HERE / "sync-mods.cache.json"


def curse_fingerprint(data: bytes) -> int:
    """MurmurHash2 (seed 1) over the bytes with tab, LF, CR and space removed."""
    buf = data.translate(None, b"\t\n\r ")
    n = len(buf)
    m = 0x5BD1E995
    mask = 0xFFFFFFFF
    h = (1 ^ n) & mask
    end = n - n % 4
    for (k,) in struct.iter_unpack("<I", buf[:end]):
        k = (k * m) & mask
        k ^= k >> 24
        k = (k * m) & mask
        h = ((h * m) & mask) ^ k
    tail = n - end
    if tail == 3:
        h ^= buf[end + 2] << 16
    if tail >= 2:
        h ^= buf[end + 1] << 8
    if tail >= 1:
        h ^= buf[end]
        h = (h * m) & mask
    h ^= h >> 13
    h = (h * m) & mask
    h ^= h >> 15
    return h


def load_cache() -> dict:
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def collect(mods_dir: Path) -> list:
    cache = load_cache()
    mods = []
    for jar in sorted(mods_dir.glob("*.jar"), key=lambda p: p.name):
        data = jar.read_bytes()
        sha512 = hashlib.sha512(data).hexdigest()
        if sha512 not in cache:
            print(f"[INFO] mods-sync: computing CurseForge fingerprint of {jar.name}", flush=True)
            cache[sha512] = curse_fingerprint(data)
        mods.append({
            "name": jar.name,
            "size": len(data),
            "sha1": hashlib.sha1(data).hexdigest(),
            "sha512": sha512,
            "fingerprint": cache[sha512],
        })
    # Keep only the jars that are still installed
    current = {m["sha512"] for m in mods}
    CACHE_FILE.write_text(json.dumps({k: v for k, v in cache.items() if k in current}), encoding="utf-8")
    return mods


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("mods_dir", type=Path, help="the server's mods folder")
    parser.add_argument("--server", required=True, help="server name, e.g. nightfall (selects the pack)")
    parser.add_argument("--endpoint", default=ENDPOINT,
                        help="upload URL, {server} is replaced (default: production Worker)")
    parser.add_argument("--output", type=Path, help="write the request body to this file instead of uploading")
    args = parser.parse_args()

    if not args.mods_dir.is_dir():
        print(f"[ERROR] mods-sync: {args.mods_dir} is not a folder", file=sys.stderr)
        return 1

    mods = collect(args.mods_dir)
    if not mods:
        print(f"[ERROR] mods-sync: no jar files in {args.mods_dir}", file=sys.stderr)
        return 1
    body = json.dumps({"mods": mods}).encode("utf-8")

    if args.output:
        args.output.write_bytes(body)
        print(f"[INFO] mods-sync: wrote {len(mods)} mods to {args.output}")
        return 0

    try:
        token = TOKEN_FILE.read_text(encoding="utf-8").splitlines()[0].strip()
    except (OSError, IndexError):
        print(f"[ERROR] mods-sync: {TOKEN_FILE} not found or empty", file=sys.stderr)
        return 1

    print(f"[INFO] mods-sync: uploading {len(mods)} mods for {args.server}...", flush=True)
    request = urllib.request.Request(
        args.endpoint.format(server=args.server),
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "mc-mods-sync-server",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as res:
            result = json.load(res)
    except urllib.error.HTTPError as e:
        print(f"[ERROR] mods-sync: HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"[ERROR] mods-sync: upload failed ({e})", file=sys.stderr)
        return 1

    print(f"[INFO] mods-sync: client mods {result['client']}, server-only {result['serverOnly']}, "
          f"unresolved {result['unresolved']}")
    if result["unresolved"] > 0:
        print("[WARN] mods-sync: some mods could not be identified. Check the status page.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
