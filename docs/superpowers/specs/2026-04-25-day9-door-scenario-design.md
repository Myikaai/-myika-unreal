# Day 9: Door Scenario & Myika Primitives Library

## Overview

Myika ships a library of UE primitives (components, base classes, helpers) optimized for AI assembly. The agent composes these primitives with its own generated configuration to produce working Blueprints. This mirrors how real UE codebases work — Lyra, ALS, GAS all ship composable components. Myika does the same, optimized for AI.

Day 9 proves this architecture with a door: user says "build me a basic interactable door," agent produces a BP_Door that works when placed in a level.

## Architecture: Myika Primitives Library

Components shipped with the MyikaBridge plugin that the agent composes into user features.

**Design principles:**
- Each primitive is a self-contained UE component with UPROPERTY-exposed configuration
- Primitives handle the parts that Python can't do (event wiring, timelines, delegate binding)
- The agent's job is composition: create a BP, add primitives, set properties, compile
- Primitives grow over time — door scenario ships the first one, future scenarios add more

**Day 9 primitive: UMyikaInteractionComponent**

## UMyikaInteractionComponent

### Responsibilities
1. Detect overlap with player pawn (box collision, configurable extent)
2. Listen for an input action (configurable, defaults to IA_Interact)
3. Fire a delegate when the player triggers the action while overlapping
4. For the door use case: handle rotation animation internally (configurable target rotation, axis, duration)

### UPROPERTY Configuration
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| InteractionExtent | FVector | (100, 100, 100) | Half-extent of the overlap box |
| InputAction | UInputAction* | nullptr | Enhanced Input action to listen for (set to IA_Interact) |
| bAutoRotate | bool | true | If true, component handles door rotation internally |
| RotationAxis | EAxis::Type | Z | Axis to rotate around |
| RotationAngle | float | 90.0 | Degrees to rotate when opening |
| RotationDuration | float | 0.5 | Seconds for open/close animation |
| bIsOpen | bool | false | Current state (read-only, toggled internally) |

### Delegates
| Delegate | Signature | Description |
|----------|-----------|-------------|
| OnInteract | FMyikaInteractSignature(AActor* Interactor) | Fired when player triggers action while overlapping |
| OnDoorStateChanged | FMyikaDoorStateSignature(bool bOpening) | Fired when auto-rotate starts open/close |

### Implementation Notes
- Uses Enhanced Input (UE5.7 standard) — binds to InputAction in BeginPlay
- Overlap detection via a UBoxComponent added as a child in the constructor
- Auto-rotate uses FTimerHandle + FMath::InterpEaseInOut for smooth rotation
- Rotates the owning actor's root component (the door mesh)
- Component is ~80-120 lines of C++ (header + source)
- No dependency on any project-specific code — pure engine APIs

### Why the component handles rotation
Python can't wire BP node graphs or timelines. Rather than having the agent produce a half-working BP that needs manual wiring, the component accepts rotation config as properties. The agent sets RotationAngle=90, RotationDuration=0.5, and the door just works. This is configuration, not a workaround — it's how GAS handles abilities (configure, don't code).

## Agent Door Scenario Flow

When the user says "build me a basic interactable door," the agent should:

1. **propose_plan** with steps:
   - Create BP_Door actor
   - Add door mesh component
   - Add MyikaInteractionComponent
   - Configure properties
   - Compile and verify

2. **Execute via run_python:**
   ```
   Step 1: Create BP_Door (Actor base class) via BlueprintFactory + AssetTools
   Step 2: Add StaticMeshComponent as root — set mesh to /Engine/BasicShapes/Cube,
           scale to (1.0, 0.1, 2.0) for door proportions
   Step 3: Add UMyikaInteractionComponent — set:
           - InteractionExtent = (150, 150, 150)
           - bAutoRotate = true
           - RotationAngle = 90.0
           - RotationDuration = 0.5
   Step 4: Add bool variable bIsOpen (default false) for external query
   Step 5: Compile BP
   ```

3. **Verify:** call read_blueprint_summary + get_compile_errors to confirm success

4. **Report:** "Created BP_Door. Drop it in your level — press E near it and the door will open/close."

## System Prompt Updates

The system prompt in claude.rs needs a new section listing available primitives:

```
## Myika Primitives Library
The MyikaBridge plugin ships reusable components optimized for AI assembly.
Compose these via run_python rather than building from raw UE classes.

Available primitives:
- UMyikaInteractionComponent: Overlap detection + input action + auto-rotate.
  Add to any actor BP. Set RotationAngle, RotationDuration, InteractionExtent.
  The component handles player detection and door animation internally.
  Properties: InteractionExtent (FVector), RotationAxis (EAxis), RotationAngle (float),
  RotationDuration (float), bAutoRotate (bool), bIsOpen (bool, read-only).
```

## Enhanced Input Setup

The door requires IA_Interact (an InputAction asset) and an InputMappingContext that maps E key to IA_Interact. Two options:

**Option A (recommended):** Ship IA_Interact and IMC_Myika as assets with the plugin. The agent references them by path. Zero runtime setup needed.

**Option B:** Agent creates them via run_python. More "AI-built" but adds complexity and failure risk.

Going with Option A — these are infrastructure assets, not user content.

## Deliverables

1. `UMyikaInteractionComponent` — C++ header + source in MyikaBridge plugin
2. `IA_Interact` + `IMC_Myika` — Enhanced Input assets shipped with plugin
3. Updated system prompt in `claude.rs` — primitives library section
4. End-to-end test: "build me a basic interactable door" produces working BP_Door

## Scope Boundaries

**In scope:**
- UMyikaInteractionComponent with auto-rotate
- Enhanced Input assets
- System prompt update
- Door scenario verification

**Out of scope (Day 10+):**
- Additional primitives (pickup, save point, dialog)
- SPEC.md "Primitives Library" section (document after Day 9 proves the pattern)
- Prompt tuning and iteration
- Polish passes on component API based on what Claude struggles with

## Risk Assessment

- **Component complexity:** Target 80-120 lines. If it exceeds ~150 lines, scope down — remove OnDoorStateChanged delegate, simplify rotation to instant (no interpolation).
- **Enhanced Input binding in BeginPlay:** May need the player controller to have the IMC added. If the test level doesn't have it, the agent (or the component) needs to add it at runtime.
- **Python adding C++ components:** `simple_construction_script` may not find UMyikaInteractionComponent if the module isn't loaded. Verify this early.
