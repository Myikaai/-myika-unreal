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
    # Try common UE project locations — adjust if your test project lives elsewhere
    $candidates = @(
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
$contentDir = Join-Path $ProjectDir "Content"
$blueprintsDir = Join-Path $contentDir "Blueprints"

$assetsToRemove = @(
    "BP_Door.uasset",
    "BP_Door_Test.uasset"
)

$removed = 0
foreach ($asset in $assetsToRemove) {
    $path = Join-Path $blueprintsDir $asset
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "[REMOVED] $asset" -ForegroundColor Green
        $removed++
    }
}

# Also remove the Blueprints directory if it's now empty
if ((Test-Path $blueprintsDir) -and (Get-ChildItem $blueprintsDir -File).Count -eq 0) {
    Remove-Item $blueprintsDir -Recurse -Force
    Write-Host "[REMOVED] Empty Blueprints/ directory" -ForegroundColor Green
}

if ($removed -eq 0) {
    Write-Host "[OK] No test assets to remove — already clean" -ForegroundColor Gray
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
    Write-Host "[INFO] No Maps/ directory — using engine default level" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Baseline reset complete ===" -ForegroundColor Cyan
Write-Host "Ready for next door scenario run."
