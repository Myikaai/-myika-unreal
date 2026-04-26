# Door Scenario Hardening — 5-Run Test Log

**Date of verified run:** 2026-04-26
**Prompt (verbatim, copy-pasted into each iteration):** `Build me a basic interactable door - when the player walks up to it and presses E, it opens.`
**Gate:** 5/5 successful runs, each with its own JSONL run journal, each verified against expected tool sequence + Blueprint shape, plus one in-editor PIE check.
**Driver:** `tests/run-door-gate.ps1`
**Reset script:** `tests/reset-baseline.ps1` (runs once before iteration 1; subsequent iterations rely on the agent's own delete-and-recreate at the top of its create script)

## History note (read this if you're reviewing the prior version)

The previous version of this file claimed 5/5 successful runs but only 2 of the 5 had supporting JSONL evidence in `%APPDATA%\ai.myika.desktop\runs\`. "Runs 3-5" was a generalisation of "identical to Runs 1-2", written without separately running them. Priority 0 of the 2026-04-25 audit identified that gap. This file replaces that version with a per-run log backed by 5 distinct journals.

## Pre-existing Day 12 caveats discovered during this re-verification

These were known but not previously documented; they shaped the gate harness:

1. **`read_blueprint_summary` was reporting `parent_class:"Object"` and `components:[]`** on SubobjectData-built Blueprints prior to Priority 1's fix. The agent was being told to verify each step and getting back garbage. The new implementation reads the AssetRegistry `ParentClass` tag and walks `SubobjectDataSubsystem.k2_gather_subobject_data_for_blueprint(bp)`. Verified by `tests/python/verify_rbs.py`.
2. **CLAUDE.md in the workspace root was being auto-loaded by the Claude CLI Myika spawns**, polluting the runtime agent context with `MUST read docs/LESSONS.md first` instructions that the runtime `read_file` tool can't resolve. Renamed to `CLAUDE-DEV.md`. Gate preflight now blocks runs if `CLAUDE.md` reappears in any Claude-CLI-discoverable ancestor.
3. **UE Content Browser does not auto-refresh** when assets are created via Python. The asset is real (registry has it, file is on disk, `read_blueprint_summary` finds it), but the Content Browser tree is stale until manually refreshed (right-click → Refresh, or F5). This caused multiple "the agent didn't really create it" misreads during the harness shakedown. Not blocking the gate — the journal verification is authoritative — but worth knowing as an operator.

## Baseline definition

- No `/Game/Blueprints/BP_Door` asset exists at the start of iteration 1 (the once-at-start reset deletes it via the bridge proxy if present).
- `IA_Interact` + `IMC_Myika` ship with the plugin under `MyikaBridge/Content/Input/`. They are present after `reset-baseline.ps1` and remain present across iterations.
- Default level loaded, no extras.
- Bridge proxy reachable on `127.0.0.1:17646` (gate preflight enforces).
- No `CLAUDE.md` in workspace ancestors (gate preflight enforces).
- Working tree may have uncommitted Day 13 visual-pass changes; reset reports them as a `[WARN]` but does not block.

## Per-run log

Every run used the model `sonnet` (Anthropic routing, default config) and started from a fresh Myika conversation.

Tool sequence is identical for every run: `propose_plan -> run_python -> run_python -> read_blueprint_summary -> get_compile_errors`. Blueprint shape after each run is identical: `parent_class=Actor`, components `[SceneComponent, StaticMeshComponent, StaticMeshComponent, MyikaInteractionComponent]` (the duplicated `StaticMeshComponent` is consistent across all runs — see "Open observations" below).

### Run 1

- **Journal:** `2026-04-26T17-26-07.300Z.jsonl`
- **run_start → run_end:** 17:26:07.300Z → 17:27:02.048Z (54.7s wall)
- **plan_proposed:** 17:26:16.960Z — "Create a basic interactable door Blueprint that opens when the player presses E nearby."
- **plan_approved:** 17:26:23.960Z (7.0s operator approval lag)
- **Tool calls (all OK):**

  | # | Tool | Duration | Notes |
  |---|------|---------:|-------|
  | 1 | `propose_plan` | 7,000ms | 3 steps |
  | 2 | `run_python` | 115ms | input-asset check; stdout: `IA_Interact already exists / IMC_Myika already exists` |
  | 3 | `run_python` | 615ms | BP_Door create (Cube + MyikaInteractionComponent); stdout confirms components added |
  | 4 | `read_blueprint_summary` | 159ms | returned `parent_class=Actor`, components present |
  | 5 | `get_compile_errors` | 841ms | `{blueprint_errors:[], cpp_errors:[]}` |

- **Verdict:** PASS

### Run 2

- **Journal:** `2026-04-26T17-27-56.894Z.jsonl`
- **run_start → run_end:** 17:27:56.894Z → 17:29:40.339Z (103.4s wall — operator paused before approving the plan)
- **plan_proposed:** 17:28:09.057Z — "Build BP_Door — a static mesh actor with a MyikaInteractionComponent that auto-rotates 90° when the player presses E nearby."
- **plan_approved:** 17:29:35.429Z (86.4s operator approval lag)
- **Tool calls (all OK):**

  | # | Tool | Duration | Notes |
  |---|------|---------:|-------|
  | 1 | `propose_plan` | 86,375ms | 3 steps; long approval wait |
  | 2 | `run_python` | 22ms | input-asset check; both already exist |
  | 3 | `run_python` | 387ms | BP_Door rebuild (deleted prior, recreated); stdout: `BP_Door created and saved` |
  | 4 | `read_blueprint_summary` | 89ms | returned `parent_class=Actor`, components present |
  | 5 | `get_compile_errors` | 825ms | clean |

- **Verdict:** PASS

### Run 3

- **Journal:** `2026-04-26T17-30-11.928Z.jsonl`
- **run_start → run_end:** 17:30:11.928Z → 17:30:59.231Z (47.3s wall)
- **plan_proposed:** 17:30:21.114Z — "Build BP_Door — a Static Mesh actor with UMyikaInteractionComponent that auto-rotates 90° when the player presses E nearby."
- **plan_approved:** 17:30:22.528Z (1.4s operator approval lag)
- **Tool calls (all OK):**

  | # | Tool | Duration | Notes |
  |---|------|---------:|-------|
  | 1 | `propose_plan` | 1,413ms | 3 steps |
  | 2 | `run_python` | 138ms | input-asset check; both already exist |
  | 3 | `run_python` | 624ms | BP_Door rebuild |
  | 4 | `read_blueprint_summary` | 266ms | returned `parent_class=Actor`, components present |
  | 5 | `get_compile_errors` | 832ms | clean |

- **Verdict:** PASS

### Run 4

- **Journal:** `2026-04-26T17-31-35.678Z.jsonl`
- **run_start → run_end:** 17:31:35.678Z → 17:32:19.624Z (43.9s wall — fastest)
- **plan_proposed:** 17:31:44.832Z — "Build BP_Door — a static mesh actor with a UMyikaInteractionComponent that opens the door when the player presses E nearby."
- **plan_approved:** 17:31:50.267Z (5.4s operator approval lag)
- **Tool calls (all OK):**

  | # | Tool | Duration | Notes |
  |---|------|---------:|-------|
  | 1 | `propose_plan` | 5,435ms | 3 steps |
  | 2 | `run_python` | 21ms | input-asset check; both already exist |
  | 3 | `run_python` | 667ms | stdout: `Deleted existing BP_Door / ... / BP_Door compiled and saved` |
  | 4 | `read_blueprint_summary` | 156ms | returned `parent_class=Actor`, components present |
  | 5 | `get_compile_errors` | 838ms | clean |

- **Verdict:** PASS

### Run 5

- **Journal:** `2026-04-26T17-32-47.885Z.jsonl`
- **run_start → run_end:** 17:32:47.885Z → 17:34:15.685Z (87.8s wall — operator paused on plan approval)
- **plan_proposed:** 17:33:00.074Z — "Create BP_Door with a static mesh + UMyikaInteractionComponent that opens 90° on E press."
- **plan_approved:** 17:33:39.889Z (39.8s operator approval lag)
- **Tool calls (all OK):**

  | # | Tool | Duration | Notes |
  |---|------|---------:|-------|
  | 1 | `propose_plan` | 39,816ms | 3 steps |
  | 2 | `run_python` | 60ms | input-asset check; both already exist |
  | 3 | `run_python` | 668ms | BP_Door rebuild |
  | 4 | `read_blueprint_summary` | 285ms | returned `parent_class=Actor`, components present |
  | 5 | `get_compile_errors` | 831ms | clean |

- **Verdict:** PASS

## Final in-editor PIE check

After all 5 iterations, the BP_Door from Run 5 was dragged into the level, PIE was started, the player walked up to the door, pressed E. The door rotated ~90° over ~0.5s. Pressed E again, the door closed. Stop PIE. **Verdict: PASS** (operator confirmed `y` to the gate's prompt).

The C++ `UMyikaInteractionComponent` behaviour is unchanged across runs, so a single PIE check + 5 journal-verified BP assemblies is rigorous evidence — strictly stronger than the prior version of this log, which had no JSONLs at all for "Runs 3-5".

## Aggregate analysis

- **Approach consistency:** 100%. All 5 runs used the component-based `UMyikaInteractionComponent` path. None attempted graph wiring (`paste_bp_nodes` / `connect_pins` / `set_pin_default` / `add_timeline_track`). The system prompt's "Example: Door Scenario" and "Alternative: Graph-Wiring Door" sections are working as intended — the agent picks the simpler component path for the simple prompt.
- **Tool sequence consistency:** 100% of runs followed `propose_plan -> run_python -> run_python -> read_blueprint_summary -> get_compile_errors`.
- **Tool-call success rate:** 25/25 `ok=true`.
- **Compile errors:** 0 across all 5 runs.
- **Wall-clock distribution (run_start → run_end):** 43.9s / 47.3s / 54.7s / 87.8s / 103.4s. Median 54.7s. Variance is dominated by operator approval lag on `propose_plan` (1.4s – 86.4s).
- **Agent execution time (plan_approved → run_end):** 5s – 38s. The 5s outlier (Run 2) is explained by the input-asset check returning early (assets already existed) and a small BP — the work itself is fast; the wall time is dominated by Claude streaming + plan approval.

## Open observations (not gate blockers)

1. **Duplicate `StaticMeshComponent` in `read_blueprint_summary` output.** Every run reports 4 components — `[SceneComponent, StaticMeshComponent, StaticMeshComponent, MyikaInteractionComponent]` — when the agent's create script only adds one `StaticMeshComponent` and one `UMyikaInteractionComponent`. The `SceneComponent` is the auto-created `DefaultSceneRoot`; that's expected. The duplicated `StaticMeshComponent` is not. Hypothesis: `SubobjectDataSubsystem.k2_gather_subobject_data_for_blueprint` returns both an inheritable-template handle and an SCS-instance handle for the same component, and our enumeration in `read_blueprint_summary.py` walks both. Worth investigating in a follow-up — does not affect functional correctness (the door opens fine), but would cleanly resolve the count mismatch.
2. **UE Content Browser stale-tree issue.** Operators (and the agent itself, when prompted to "verify") will not see Python-created assets in the Content Browser tree until a manual refresh. The journal verification path is unaffected. A small post-create asset-registry rescan in the system prompt's example would close this gap; queued behind the current Priority work.
3. **`reset-baseline.ps1` removed per-iteration cleanup.** The original Priority 2 spec called for reset between every run. The harness was changed to reset once before iteration 1, then rely on the agent's own delete-and-recreate at the top of its create script (the agent's first action when `BP_Door` already exists). Rationale: every Day 12-style journal already shows the agent doing its own cleanup correctly; running our reset between iterations created a visible-asset gap in the Content Browser that operators were misreading as agent failure. The "clean baseline per iteration" intent is still met — by the agent itself, with journal evidence (`stdout` includes `Deleted existing BP_Door` when it found one) instead of the harness.

## Verdict

**5 / 5** journal-verified iterations + **1 / 1** in-editor PIE check. The Day 12 `v0.1.0-day12-door-reliable` claim is now backed by real evidence for the first time. Tag honesty (Priority 4) to be sequenced next.
