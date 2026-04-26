<#
.SYNOPSIS
    Drives the blinking-light scenario 5x reliability gate. Mirrors the door
    gate but exercises the graph-tools path: paste_bp_nodes, connect_pins,
    set_pin_default (optional), add_timeline_track. None of those tools have
    end-to-end production runs in the journal; this gate produces them.

.DESCRIPTION
    For each iteration:
      1. Snapshot existing journal files.
      2. (iter 1 only) Run reset-blink-baseline.ps1 to clear BP_BlinkLight
         and verify the captured T3D snippet exists. Iterations 2-5 rely on
         the agent's own delete-and-recreate (same pattern as the door gate).
      3. Read the captured blink_light.t3d snippet from disk and embed it
         in the operator prompt (so the agent doesn't need a separate read_file
         call).
      4. Print the prompt for the operator to paste into a new Myika chat.
      5. Wait for a new completed JSONL in the journal directory.
      6. Verify the tool sequence:
           propose_plan -> run_python -> paste_bp_nodes -> connect_pins
           -> [set_pin_default] -> add_timeline_track
           -> read_blueprint_summary -> get_compile_errors
         set_pin_default is optional (depends on whether ReconstructNode
         clobbered any T3D defaults). All other tools must appear in order.
      7. PASS the iteration or HALT and report the variance.

    After all iterations PASS, prompts for one in-editor PIE check (drag the
    BP into the level, hit Play, watch the light pulse).

.PARAMETER Iterations
    How many iterations to run. Default: 5.

.PARAMETER JournalDir
    Override the journal directory. Default: %APPDATA%\ai.myika.desktop\runs.

.PARAMETER WaitTimeoutSec
    Max seconds to wait per iteration for the new journal to complete.
    Default: 600.

.PARAMETER SkipPie
    Skip the final in-editor PIE prompt.

.EXAMPLE
    .\run-blink-gate.ps1
#>
[CmdletBinding()]
param(
    [int]$Iterations = 5,
    [string]$JournalDir = (Join-Path $env:APPDATA "ai.myika.desktop\runs"),
    [int]$WaitTimeoutSec = 600,
    [switch]$SkipPie
)

$ErrorActionPreference = "Stop"

# Required tools, in order. set_pin_default is optional.
$REQUIRED_TOOLS = @("propose_plan", "run_python", "paste_bp_nodes", "connect_pins", "add_timeline_track", "read_blueprint_summary", "get_compile_errors")
$OPTIONAL_TOOLS = @("set_pin_default")
$ALL_VALID_TOOLS = $REQUIRED_TOOLS + $OPTIONAL_TOOLS

$SNIPPET_PATH = Join-Path (Split-Path $PSScriptRoot) "ue-plugin\MyikaBridge\Content\Myika\Snippets\blink_light.t3d"

function Write-H($text, $color = "Cyan") {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor $color
    Write-Host " $text" -ForegroundColor $color
    Write-Host "================================================================" -ForegroundColor $color
}

function Get-JournalEntries($path) {
    Get-Content $path -Encoding UTF8 |
        Where-Object { $_.Trim() -ne "" } |
        ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
        Where-Object { $_ -ne $null }
}

function Get-JournalSnapshot($dir) {
    $set = @{}
    Get-ChildItem (Join-Path $dir "*.jsonl") -ErrorAction SilentlyContinue |
        ForEach-Object { $set[$_.Name] = $true }
    return $set
}

function Wait-NewCompletedJournal($dir, $preSnapshot, $timeoutSec) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    $announced = $null
    while ((Get-Date) -lt $deadline) {
        $candidates = Get-ChildItem (Join-Path $dir "*.jsonl") -ErrorAction SilentlyContinue |
            Where-Object { -not $preSnapshot.ContainsKey($_.Name) } |
            Sort-Object LastWriteTime -Descending
        foreach ($c in $candidates) {
            $entries = Get-JournalEntries $c.FullName
            $hasRunEnd = $entries | Where-Object { $_.phase -eq "run_end" } | Select-Object -First 1
            if ($hasRunEnd) { return $c }
            if ($announced -ne $c.Name) {
                Write-Host "  ... new journal $($c.Name) detected, waiting for run_end" -ForegroundColor Gray
                $announced = $c.Name
            }
        }
        Start-Sleep -Seconds 1
    }
    return $null
}

function Test-Iteration($journalFile) {
    $entries = Get-JournalEntries $journalFile.FullName
    $issues = New-Object System.Collections.Generic.List[string]

    $runStart = $entries | Where-Object { $_.phase -eq "run_start" } | Select-Object -First 1
    if (-not $runStart) { $issues.Add("missing run_start") }

    $prompt = $runStart.prompt
    if ($prompt -notlike "*blinking*" -and $prompt -notlike "*BP_BlinkLight*") {
        $issues.Add("prompt not the blink scenario: '$($prompt.Substring(0, [Math]::Min(120, $prompt.Length)))...'")
    }

    if ($entries | Where-Object { $_.phase -eq "plan_cancelled" }) {
        $issues.Add("plan was cancelled - run did not execute")
    }
    if (-not ($entries | Where-Object { $_.phase -eq "plan_approved" })) {
        $issues.Add("no plan_approved phase")
    }

    $toolCalls = @($entries | Where-Object { $_.phase -eq "tool_call" } | ForEach-Object { $_.tool })
    $toolResults = @($entries | Where-Object { $_.phase -eq "tool_result" })

    # Check every required tool appears at least once and in order, allowing optional tools interleaved.
    $reqIdx = 0
    $orderProblem = $false
    foreach ($t in $toolCalls) {
        if ($reqIdx -lt $REQUIRED_TOOLS.Count -and $t -eq $REQUIRED_TOOLS[$reqIdx]) {
            $reqIdx++
        } elseif ($ALL_VALID_TOOLS -notcontains $t) {
            $issues.Add("unexpected tool in sequence: '$t'")
            $orderProblem = $true
        }
        # Optional tools are silently allowed; out-of-order required tools fall through to the count check below.
    }
    if ($reqIdx -lt $REQUIRED_TOOLS.Count) {
        $missing = $REQUIRED_TOOLS[$reqIdx..($REQUIRED_TOOLS.Count - 1)]
        $issues.Add("missing required tools (in order): $($missing -join ', ')")
    }

    foreach ($tr in $toolResults) {
        if ($tr.ok -ne $true) {
            $issues.Add("tool_result not ok: $($tr.tool) - $($tr.error)")
        }
    }

    # Verify each graph-tool's success payload.
    $pasteRes = $toolResults | Where-Object { $_.tool -eq "paste_bp_nodes" } | Select-Object -First 1
    if ($pasteRes) {
        $r = $pasteRes.result.result
        if ($r.success -ne $true) { $issues.Add("paste_bp_nodes success=false: $($r.error)") }
        elseif ($r.nodes_added -lt 1) { $issues.Add("paste_bp_nodes added 0 nodes") }
    }
    $connectRes = $toolResults | Where-Object { $_.tool -eq "connect_pins" } | Select-Object -First 1
    if ($connectRes) {
        $r = $connectRes.result.result
        if ($r.connected -lt 1) { $issues.Add("connect_pins connected=0 (errors: $($r.errors -join ', '))") }
    }
    $timelineRes = $toolResults | Where-Object { $_.tool -eq "add_timeline_track" } | Select-Object -First 1
    if ($timelineRes) {
        $r = $timelineRes.result.result
        if ($r.success -ne $true) { $issues.Add("add_timeline_track success=false: $($r.error)") }
    }

    # Verify the BP exists with the right shape.
    $rbs = $toolResults | Where-Object { $_.tool -eq "read_blueprint_summary" } | Select-Object -Last 1
    $rbsResult = if ($rbs) { $rbs.result.result } else { $null }
    $parent = $null
    $compClasses = @()
    if ($rbsResult) {
        $parent = $rbsResult.parent_class
        $compClasses = @($rbsResult.components | ForEach-Object { $_.class })
        if ($parent -ne "Actor") {
            $issues.Add("read_blueprint_summary parent_class: expected 'Actor', got '$parent'")
        }
        if ($compClasses -notcontains "PointLightComponent") {
            $issues.Add("read_blueprint_summary missing PointLightComponent in components")
        }
    }

    $compileErrs = $toolResults | Where-Object { $_.tool -eq "get_compile_errors" } | Select-Object -Last 1
    $bpErrs = if ($compileErrs) { @($compileErrs.result.result.blueprint_errors) } else { @() }
    $cppErrs = if ($compileErrs) { @($compileErrs.result.result.cpp_errors) } else { @() }
    if ($bpErrs.Count -gt 0) { $issues.Add("blueprint_errors: $($bpErrs.Count)") }
    if ($cppErrs.Count -gt 0) { $issues.Add("cpp_errors: $($cppErrs.Count)") }

    $startTs = if ($runStart) { [datetime]$runStart.ts } else { $null }
    $endEntry = $entries | Where-Object { $_.phase -eq "run_end" } | Select-Object -First 1
    $endTs = if ($endEntry) { [datetime]$endEntry.ts } else { $null }
    $wallMs = if ($startTs -and $endTs) { [int]($endTs - $startTs).TotalMilliseconds } else { $null }

    return [pscustomobject]@{
        Pass         = ($issues.Count -eq 0)
        Issues       = $issues
        Prompt       = $prompt
        Journal      = $journalFile.Name
        ToolCalls    = $toolCalls
        ParentClass  = $parent
        Components   = $compClasses
        WallTimeMs   = $wallMs
    }
}

function Test-BridgeReachable {
    param([int]$Port = 17646, [int]$ConnectTimeoutMs = 1500)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($ConnectTimeoutMs)) { return $false }
        $client.EndConnect($iar)
        return $true
    } catch { return $false } finally { $client.Close() }
}

# --- Preflight ---------------------------------------------------------------

Write-H "Blink Scenario Reliability Gate"
Write-Host "Iterations:        $Iterations"
Write-Host "Journal directory: $JournalDir"
Write-Host "T3D snippet:       $SNIPPET_PATH"

if (-not (Test-Path $JournalDir)) {
    Write-Host "[ERR] Journal directory does not exist." -ForegroundColor Red
    exit 1
}
$resetScript = Join-Path $PSScriptRoot "reset-blink-baseline.ps1"
if (-not (Test-Path $resetScript)) {
    Write-Host "[ERR] reset-blink-baseline.ps1 not found." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $SNIPPET_PATH)) {
    Write-Host ""
    Write-Host "[ERR] Captured T3D not found at:" -ForegroundColor Red
    Write-Host "      $SNIPPET_PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Capture it first:" -ForegroundColor Yellow
    Write-Host "    1. Build BP_BlinkLight manually in UE (Actor + PointLight + Timeline graph)" -ForegroundColor Yellow
    Write-Host "    2. PIE-verify it pulses" -ForegroundColor Yellow
    Write-Host "    3. Open BP, in EventGraph: click empty area, Ctrl+A, Ctrl+C" -ForegroundColor Yellow
    Write-Host "    4. UE Python console:" -ForegroundColor Yellow
    Write-Host "       exec(open(r'C:/Users/jgrif/Documents/MyikaAI/myika-unreal/ue-plugin/MyikaBridge/Content/Python/myika/capture_snippet.py').read()); capture('blink_light')" -ForegroundColor Yellow
    Write-Host "    5. Delete BP_BlinkLight (agent will recreate it)" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-BridgeReachable)) {
    Write-Host ""
    Write-Host "[ERR] Bridge proxy on 127.0.0.1:17646 unreachable. Restart Myika." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Bridge proxy reachable" -ForegroundColor Green

$claudeMdLocations = @(
    (Join-Path (Split-Path $PSScriptRoot) "CLAUDE.md"),
    (Join-Path (Split-Path (Split-Path $PSScriptRoot)) "CLAUDE.md"),
    (Join-Path (Split-Path $PSScriptRoot) "desktop\CLAUDE.md")
)
$found = $claudeMdLocations | Where-Object { Test-Path $_ }
if ($found) {
    Write-Host "[ERR] CLAUDE.md present in Claude-CLI-discoverable location:" -ForegroundColor Red
    foreach ($p in $found) { Write-Host "      $p" -ForegroundColor Red }
    Write-Host "      Rename to CLAUDE-DEV.md to keep it out of the runtime agent's context." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] No auto-loadable CLAUDE.md" -ForegroundColor Green

# Read the captured T3D once.
$T3D = Get-Content $SNIPPET_PATH -Raw -Encoding UTF8
$nodeCount = ($T3D | Select-String "Begin Object" -AllMatches).Matches.Count
Write-Host "[OK] T3D snippet loaded ($([int]($T3D.Length)) chars, $nodeCount nodes)" -ForegroundColor Green

# --- Pre-iteration reset (run once) ------------------------------------------

Write-H "Pre-iteration reset"
& $resetScript
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERR] reset-blink-baseline.ps1 failed with exit $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

# --- Build the operator prompt ------------------------------------------------

$BLINK_PROMPT = @"
Build me a blinking point light: an Actor Blueprint at /Game/Blueprints/BP_BlinkLight with a PointLightComponent whose Intensity oscillates via a Timeline.

Use the Alternative Graph-Wiring pattern from your system prompt. Concretely:

1. propose_plan first (multi-step).
2. run_python: create BP_BlinkLight (parent=Actor) and add a PointLightComponent via SubobjectDataSubsystem; compile + save. Delete any existing BP_BlinkLight first.
3. paste_bp_nodes into the EventGraph using exactly this T3D (4 nodes: BeginPlay, Timeline, PointLight VariableGet, SetIntensity):

---T3D---
$T3D
---END T3D---

4. connect_pins to wire the graph: BeginPlay then -> Timeline Play; Timeline Update -> SetIntensity execute; Timeline Intensity (float output) -> SetIntensity NewIntensity; PointLight reference -> SetIntensity target.
5. set_pin_default only if any pin defaults got clobbered by ReconstructNode (skip if not needed).
6. add_timeline_track: float track named 'Intensity' with keyframes [{time:0, value:0.0}, {time:0.5, value:5000.0}, {time:1.0, value:0.0}], looping=true.
7. read_blueprint_summary on /Game/Blueprints/BP_BlinkLight and get_compile_errors {} to verify.

Do not use the Myika Primitives Library / UMyikaInteractionComponent for this scenario - the whole point is to exercise paste_bp_nodes, connect_pins, set_pin_default, and add_timeline_track.
"@

# --- Iteration loop -----------------------------------------------------------

$results = @()
$haltReason = $null

for ($i = 1; $i -le $Iterations; $i++) {
    Write-H "Iteration $i / $Iterations"

    $pre = Get-JournalSnapshot $JournalDir
    Write-Host "Pre-snapshot: $($pre.Count) journal(s)" -ForegroundColor Gray

    Write-Host ""
    Write-Host "--- Send in Myika now ---------------------------------------" -ForegroundColor Yellow
    Write-Host "  * New conversation in Myika" -ForegroundColor Yellow
    Write-Host "  * Paste the prompt below (it includes the captured T3D)" -ForegroundColor Yellow
    Write-Host "  * Click Approve when PlanReview appears" -ForegroundColor Yellow
    if ($i -gt 1) {
        Write-Host ""
        Write-Host "  Note: BP_BlinkLight from iter $($i - 1) is still in Content Browser." -ForegroundColor DarkGray
        Write-Host "        The agent will delete and recreate it - that is expected." -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host "----- BEGIN PROMPT (copy from next line through END PROMPT) -----" -ForegroundColor White
    Write-Host $BLINK_PROMPT -ForegroundColor White
    Write-Host "----- END PROMPT -----" -ForegroundColor White
    Write-Host ""
    Write-Host "--- Auto-detecting completion -------------------------------" -ForegroundColor Yellow
    Write-Host ""

    $newJournal = Wait-NewCompletedJournal $JournalDir $pre $WaitTimeoutSec
    if (-not $newJournal) {
        $haltReason = "no completed journal appeared within $WaitTimeoutSec s"
        break
    }
    Write-Host "Captured: $($newJournal.Name)" -ForegroundColor Green

    $verdict = Test-Iteration $newJournal
    $results += $verdict

    Write-Host ""
    Write-Host "Tool sequence: $($verdict.ToolCalls -join ' -> ')"
    Write-Host "Parent class:  $($verdict.ParentClass)"
    Write-Host "Components:    $($verdict.Components -join ', ')"
    if ($verdict.WallTimeMs) {
        Write-Host "Wall time:     $($verdict.WallTimeMs) ms"
    }

    if ($verdict.Pass) {
        Write-Host ""
        Write-Host "[PASS] Iteration $i" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[FAIL] Iteration $i - variance/failure detected:" -ForegroundColor Red
        foreach ($issue in $verdict.Issues) {
            Write-Host "       - $issue" -ForegroundColor Red
        }
        $haltReason = "iteration $i failed; per the priority directive, halt and analyze before retrying"
        break
    }
}

# --- Summary -----------------------------------------------------------------

Write-H "Gate Summary"
$passCount = ($results | Where-Object { $_.Pass }).Count
$total = $results.Count
Write-Host "Iterations completed: $total / $Iterations"
Write-Host "Pass:                 $passCount"
Write-Host ""

for ($i = 0; $i -lt $results.Count; $i++) {
    $r = $results[$i]
    $status = if ($r.Pass) { "[PASS]" } else { "[FAIL]" }
    $color = if ($r.Pass) { "Green" } else { "Red" }
    Write-Host ("  {0} #{1}  {2}  ({3} ms)" -f $status, ($i + 1), $r.Journal, $r.WallTimeMs) -ForegroundColor $color
    if (-not $r.Pass) {
        foreach ($issue in $r.Issues) { Write-Host "        - $issue" -ForegroundColor Red }
    }
}

if ($haltReason) {
    Write-Host ""
    Write-Host "Gate halted: $haltReason" -ForegroundColor Red
    exit 1
}

# --- Final PIE check ---------------------------------------------------------

if (-not $SkipPie) {
    Write-H "Final PIE Verification" "Yellow"
    Write-Host "All $Iterations iterations PASSed journal verification." -ForegroundColor Green
    Write-Host ""
    Write-Host "Steps:" -ForegroundColor White
    Write-Host "  1. UE Content Browser -> /Game/Blueprints/BP_BlinkLight"
    Write-Host "  2. Drag it into the level"
    Write-Host "  3. Press Play (PIE)"
    Write-Host "  4. Confirm the light pulses on/off (Intensity oscillates)"
    Write-Host "  5. Stop PIE"
    Write-Host ""
    $answer = Read-Host "Did the light pulse correctly? (y/N)"
    if ($answer -ne "y" -and $answer -ne "Y") {
        Write-Host "[FAIL] PIE check did not pass." -ForegroundColor Red
        exit 1
    }
    Write-Host "[PASS] PIE-verified." -ForegroundColor Green
}

Write-H "GATE PASSED" "Green"
Write-Host "$Iterations / $Iterations journal-verified iterations + PIE check." -ForegroundColor Green
Write-Host ""
Write-Host "Journal filenames for follow-up documentation:"
foreach ($r in $results) {
    Write-Host "  - $($r.Journal)"
}
exit 0
