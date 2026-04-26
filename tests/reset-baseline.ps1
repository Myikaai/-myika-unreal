<#
.SYNOPSIS
    Resets the UE test project to a clean baseline state for door scenario testing.
    Run between each door scenario attempt.

.DESCRIPTION
    - Removes BP_Door asset (and any other test-generated Blueprints)
    - Leaves plugin-shipped assets intact (IA_Interact, IMC_Myika)
    - Verifies git state is clean (warns if not)
    - Verifies no leftover test artifacts in the Content directory

.PARAMETER ProjectDir
    Path to the UE project directory. Defaults to scanning for .uproject files
    in common locations.
#>

param(
    [string]$ProjectDir = ""
)

$ErrorActionPreference = "Stop"

# --- Locate project ---
if (-not $ProjectDir) {
    # Two-tree layout: myika-unreal/ (this repo, holds tests/) and myika_plugin/ (UE project)
    # live as siblings under MyikaAI/. Compute the sibling path from $PSScriptRoot so this
    # works regardless of where the workspace is cloned.
    $workspaceRoot = Split-Path (Split-Path $PSScriptRoot)
    $candidates = @(
        (Join-Path $workspaceRoot "myika_plugin"),
        "$env:USERPROFILE\Documents\Unreal Projects\MyikaTestProject",
        "$env:USERPROFILE\Documents\Unreal Projects\MyikaDemo",
        "C:\UE_Projects\MyikaTestProject"
    )
    foreach ($c in $candidates) {
        if (Test-Path "$c\*.uproject") {
            $ProjectDir = $c
            break
        }
    }
    if (-not $ProjectDir) {
        Write-Host "[WARN] Could not auto-detect project directory." -ForegroundColor Yellow
        Write-Host "       Pass -ProjectDir explicitly, e.g.:"
        Write-Host '       .\reset-baseline.ps1 -ProjectDir "C:\UE_Projects\MyikaTestProject"'
        exit 1
    }
}

Write-Host "=== Door Scenario Baseline Reset ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectDir"
Write-Host ""

# --- Remove test-generated assets ---
# Prefer asking UE to delete the asset via the bridge proxy: that handles the case
# where the editor has BP_Door loaded (which holds an OS file lock that blocks
# Remove-Item). Fall back to file-system Remove-Item only if the bridge is unreachable.

$contentDir = Join-Path $ProjectDir "Content"
$blueprintsDir = Join-Path $contentDir "Blueprints"

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

$bridgeUsed = $false
$assetsToDelete = @("/Game/Blueprints/BP_Door", "/Game/Blueprints/BP_Door_Test")
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
    $assetFiles = @("BP_Door.uasset", "BP_Door_Test.uasset")
    $removed = 0
    foreach ($asset in $assetFiles) {
        $path = Join-Path $blueprintsDir $asset
        if (Test-Path $path) {
            try {
                Remove-Item $path -Force
                Write-Host "[REMOVED] $asset" -ForegroundColor Green
                $removed++
            } catch {
                Write-Host "[WARN] Could not delete $asset (file lock?): $($_.Exception.Message)" -ForegroundColor Yellow
                Write-Host "       The agent's run_python will delete it before recreating, so proceeding." -ForegroundColor Yellow
            }
        }
    }
    if ($removed -eq 0) {
        Write-Host "[OK] No test assets to remove - already clean" -ForegroundColor Gray
    }
}

# Remove the Blueprints directory if it's now empty (best-effort).
if ((Test-Path $blueprintsDir) -and ((Get-ChildItem $blueprintsDir -File -ErrorAction SilentlyContinue).Count -eq 0)) {
    try {
        Remove-Item $blueprintsDir -Recurse -Force
        Write-Host "[REMOVED] Empty Blueprints/ directory" -ForegroundColor Green
    } catch {
        # Don't care -- empty dir cleanup is cosmetic.
    }
}

# --- Verify plugin-shipped assets are still present ---
$pluginInputDir = Join-Path (Split-Path $PSScriptRoot) "ue-plugin\MyikaBridge\Content\Input"
$requiredAssets = @("IA_Interact.uasset", "IMC_Myika.uasset")

foreach ($asset in $requiredAssets) {
    $path = Join-Path $pluginInputDir $asset
    if (Test-Path $path) {
        Write-Host "[OK] Plugin asset present: $asset" -ForegroundColor Gray
    } else {
        Write-Host "[WARN] Missing plugin asset: $asset" -ForegroundColor Yellow
    }
}

# --- Check git state ---
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

# --- Verify default level ---
Write-Host ""
$defaultMapDir = Join-Path $contentDir "Maps"
if (Test-Path $defaultMapDir) {
    $maps = Get-ChildItem $defaultMapDir -Filter "*.umap" -File
    if ($maps.Count -gt 0) {
        Write-Host "[OK] Default maps present: $($maps.Name -join ', ')" -ForegroundColor Gray
    }
} else {
    Write-Host "[INFO] No Maps/ directory - using engine default level" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Baseline reset complete ===" -ForegroundColor Cyan
Write-Host "Ready for next door scenario run."
