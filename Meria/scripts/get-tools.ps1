# Installs the three tools the live harness needs into backend\bin, verifying each against its published SHA-256.
#   promtool 3.2.1  (Prometheus)    - evaluates the candidate rules
#   amtool   0.28.1 (Alertmanager)  - resolves alert routing
#   jq       1.7.1                  - required by the unmodified TTU plugin
# Run from the Meria folder:  powershell -ExecutionPolicy Bypass -File scripts\get-tools.ps1
$ErrorActionPreference = 'Stop'
$bin = Join-Path $PSScriptRoot '..\backend\bin'
New-Item -ItemType Directory -Force $bin | Out-Null
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('gauntlet-tools-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force $tmp | Out-Null

function Get-Verified($url, $sumsUrl, $name, $out) {
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
  $sums = (Invoke-WebRequest -Uri $sumsUrl -UseBasicParsing).Content
  if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
  $line = ($sums -split "`n") | Where-Object { $_ -match [regex]::Escape($name) } | Select-Object -First 1
  if (-not $line) { throw "No checksum listed for $name" }
  $want = ($line -split '\s+')[0].ToLower()
  $got = (Get-FileHash -Algorithm SHA256 $out).Hash.ToLower()
  if ($want -ne $got) { throw "Checksum mismatch for $name" }
  Write-Host "verified $name"
}

$p = 'prometheus-3.2.1.windows-amd64'
Get-Verified "https://github.com/prometheus/prometheus/releases/download/v3.2.1/$p.zip" 'https://github.com/prometheus/prometheus/releases/download/v3.2.1/sha256sums.txt' "$p.zip" "$tmp\p.zip"
Expand-Archive "$tmp\p.zip" $tmp -Force; Copy-Item "$tmp\$p\promtool.exe" $bin -Force

$a = 'alertmanager-0.28.1.windows-amd64'
Get-Verified "https://github.com/prometheus/alertmanager/releases/download/v0.28.1/$a.zip" 'https://github.com/prometheus/alertmanager/releases/download/v0.28.1/sha256sums.txt' "$a.zip" "$tmp\a.zip"
Expand-Archive "$tmp\a.zip" $tmp -Force; Copy-Item "$tmp\$a\amtool.exe" $bin -Force

Get-Verified 'https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-windows-amd64.exe' 'https://github.com/jqlang/jq/releases/download/jq-1.7.1/sha256sum.txt' 'jq-windows-amd64.exe' "$bin\jq.exe"

Remove-Item -Recurse -Force $tmp
& "$bin\promtool.exe" --version | Select-Object -First 1
& "$bin\amtool.exe" --version | Select-Object -First 1
& "$bin\jq.exe" --version
Write-Host "Done. Restart the backend; /api/ttu/status should report the tools as available."
