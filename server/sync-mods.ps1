# ===================================================================
#  sync-mods.ps1 - report this server's mod list to the mods-sync Worker
#
#  Called from start-server.bat before each server launch.
#  For every jar in mods\ it sends: file name, size, SHA-1, SHA-512 and
#  the CurseForge fingerprint (MurmurHash2 of the jar without whitespace
#  bytes). The Worker matches them against Modrinth / CurseForge and
#  rebuilds the packwiz pack that players' Prism Launcher syncs from.
#
#  This script NEVER stops the server from starting: every failure only
#  prints a warning and exits with code 0.
#
#  The upload token is read from sync-mods.token (same folder, one line).
#
#  NOTE: Keep this file ASCII only (Windows PowerShell 5.1 reads files
#        without a BOM using the system codepage).
# ===================================================================

$Endpoint  = 'https://mc-mods.enderman-desu.org/api/server/mods'
$TimeoutSec = 30

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

try {
  $here = Split-Path -Parent $MyInvocation.MyCommand.Path
  $tokenFile = Join-Path $here 'sync-mods.token'
  if (-not (Test-Path $tokenFile)) {
    Write-Host "[WARN] mods-sync: $tokenFile not found. Skipping mod list upload."
    exit 0
  }
  $token = (Get-Content $tokenFile -TotalCount 1).Trim()

  Add-Type -TypeDefinition @'
public static class CurseFingerprint {
  // CurseForge fingerprint: MurmurHash2 (seed 1) over the file bytes
  // with tab, LF, CR and space removed.
  public static uint Compute(byte[] data) {
    byte[] buf = new byte[data.Length];
    int len = 0;
    foreach (byte b in data) {
      if (b != 9 && b != 10 && b != 13 && b != 32) buf[len++] = b;
    }
    const uint m = 0x5bd1e995;
    uint h = 1u ^ (uint)len;
    int i = 0;
    while (len - i >= 4) {
      uint k = (uint)(buf[i] | buf[i + 1] << 8 | buf[i + 2] << 16 | buf[i + 3] << 24);
      k *= m; k ^= k >> 24; k *= m;
      h *= m; h ^= k;
      i += 4;
    }
    switch (len - i) {
      case 3: h ^= (uint)buf[i + 2] << 16; goto case 2;
      case 2: h ^= (uint)buf[i + 1] << 8; goto case 1;
      case 1: h ^= buf[i]; h *= m; break;
    }
    h ^= h >> 13; h *= m; h ^= h >> 15;
    return h;
  }
}
'@ -ErrorAction SilentlyContinue

  $sha1 = [Security.Cryptography.SHA1]::Create()
  $sha512 = [Security.Cryptography.SHA512]::Create()
  $toHex = { param($bytes) -join ($bytes | ForEach-Object { $_.ToString('x2') }) }

  $mods = @(Get-ChildItem (Join-Path $here 'mods') -Filter *.jar | Sort-Object Name | ForEach-Object {
    $bytes = [IO.File]::ReadAllBytes($_.FullName)
    [ordered]@{
      name        = $_.Name
      size        = $bytes.Length
      sha1        = & $toHex $sha1.ComputeHash($bytes)
      sha512      = & $toHex $sha512.ComputeHash($bytes)
      fingerprint = [CurseFingerprint]::Compute($bytes)
    }
  })

  $body = @{ mods = $mods } | ConvertTo-Json -Depth 4 -Compress
  Write-Host "[INFO] mods-sync: uploading $($mods.Count) mods..."
  $res = Invoke-RestMethod -Uri $Endpoint -Method Post -TimeoutSec $TimeoutSec `
    -Headers @{ Authorization = "Bearer $token" } `
    -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body))

  Write-Host "[INFO] mods-sync: client mods $($res.client), server-only $($res.serverOnly), unresolved $($res.unresolved)"
  if ($res.unresolved -gt 0) {
    Write-Host "[WARN] mods-sync: some mods could not be identified. Check the admin page."
  }
} catch {
  Write-Host "[WARN] mods-sync: upload failed ($($_.Exception.Message)). Server starts anyway."
}
exit 0
