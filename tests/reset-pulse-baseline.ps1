<#
.SYNOPSIS
    Resets the UE test project to a clean baseline for the pulsing-light
    (NL prompt) reliability gate. Sibling of reset-blink-baseline.ps1, scoped
    to BP_PulsingLight. No captured T3D snippet required - this gate uses
    a raw natural-language prompt (like the door gate).

.DESCRIPTION
    - Deletes BP_PulsingLight via the bridge (handles UE-loaded asset cleanly).
    - Falls back to file-system delete if the bridge is unreachable.
    - Reports git working-tree state.

.PARAMETER ProjectDir
    Path to the UE project directory. Defaults to sibling myika_plugin/ from
    the workspace root.
#>

param(
    [string]$ProjectDir = ""
)

$ErrorActionPreference = "Stop"

# --- Locate project ---
if (-not $ProjectDir) {
    $workspaceRoot = Split-Path (Split-Path $PSScriptRoot)
    $candidates = @(
        (Join-Path $workspaceRoot "myika_plugin"),
        "$env:USERPROFILE\Documents\Unreal Projects\MyikaTestProject"
    )
    foreach ($c in $candidates) {
        if (Test-Path "$c\*.uproject") { $ProjectDir = $c; break }
    }
    if (-not $ProjectDir) {
        Write-Host "[ERR] Could not auto-detect project directory. Pass -ProjectDir." -ForegroundColor Red
        exit 1
    }
}

Write-Host "=== Pulse Scenario Baseline Reset ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectDir"
Write-Host ""

# --- Bridge-first asset cleanup ---

function Invoke-BridgeTool {
    param(
        [string]$Tool,
        [hashtable]$ToolArgs,
        [int]$Port = 17646,
        [int]$ConnectTimeoutMs = 1500,
        [int]$ReadTimeoutMs = 10000
    )
    $client = New-Object System.Net.Sockets.TcpClient
    $client.SendTimeout = $ReadTimeoutMs
    $client.ReceiveTimeout = $ReadTimeoutMs
    $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($ConnectTimeoutMs)) {
        $client.Close()
        throw "bridge proxy unreachable on 127.0.0.1:$Port (connect timeout)"
    }
    $client.EndConnect($iar)
    try {
        $stream = $client.GetStream()
        $writer = New-Object System.IO.StreamWriter($stream)
        $writer.AutoFlush = $true
        $reader = New-Object System.IO.StreamReader($stream)
        $payload = @{ tool = $Tool; args = $ToolArgs } | ConvertTo-Json -Compress -Depth 12
        $writer.WriteLine($payload)
        $line = $reader.ReadLine()
        if (-not $line) { throw "bridge returned empty response" }
        return ($line | ConvertFrom-Json)
    } finally {
        $client.Close()
    }
}

$assetsToDelete = @("/Game/Blueprints/BP_PulsingLight", "/Game/Blueprints/BP_PulsingLight_Test")
$bridgeUsed = $false
try {
    $code = @"
import unreal
deleted = []
for path in $(($assetsToDelete | ConvertTo-Json -Compress)):
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        if unreal.EditorAssetLibrary.delete_asset(path):
            deleted.append(path)
print('deleted=' + ','.join(deleted) if deleted else 'none')
"@
    $resp = Invoke-BridgeTool -Tool "run_python" -ToolArgs @{ code = $code }
    if ($resp.ok) {
        $stdout = $resp.result.stdout.Trim()
        Write-Host "[OK] Bridge cleanup: $stdout" -ForegroundColor Green
        $bridgeUsed = $true
    } else {
        Write-Host "[WARN] Bridge call failed: $($resp.error.message). Falling back to disk delete." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[INFO] Bridge unreachable ($($_.Exception.Message)). Falling back to disk delete." -ForegroundColor Gray
}

if (-not $bridgeUsed) {
    $contentDir = Join-Path $ProjectDir "Content"
    $bpDir = Join-Path $contentDir "Blueprints"
    foreach ($asset in @("BP_PulsingLight.uasset", "BP_PulsingLight_Test.uasset")) {
        $path = Join-Path $bpDir $asset
        if (Test-Path $path) {
            try { Remove-Item $path -Force; Write-Host "[REMOVED] $asset" -ForegroundColor Green }
            catch { Write-Host "[WARN] Could not delete $asset (file lock?)" -ForegroundColor Yellow }
        }
    }
}

# --- Git state ---
Write-Host ""
$repoRoot = Split-Path $PSScriptRoot
Push-Location $repoRoot
try {
    $gitStatus = git status --porcelain 2>&1
    if ($gitStatus) {
        Write-Host "[WARN] Git working tree is not clean:" -ForegroundColor Yellow
        $gitStatus | ForEach-Object { Write-Host "       $_" -ForegroundColor Yellow }
    } else {
        Write-Host "[OK] Git working tree clean" -ForegroundColor Green
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=== Pulse baseline reset complete ===" -ForegroundColor Cyan
