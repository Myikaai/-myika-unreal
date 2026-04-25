# Day 9: Door Scenario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship UMyikaInteractionComponent as the first Myika primitive, update the system prompt, and verify the door scenario works end-to-end.

**Architecture:** The MyikaBridge plugin gains a new C++ component (UMyikaInteractionComponent) that handles overlap detection, Enhanced Input binding, and door rotation animation via properties. The agent composes this component into BPs via run_python. Enhanced Input assets (IA_Interact, IMC_Myika) ship with the plugin content.

**Tech Stack:** UE 5.7 C++ (Enhanced Input, ActorComponent), Rust (system prompt in claude.rs), UE Content (InputAction, InputMappingContext data assets)

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `ue-plugin/MyikaBridge/Source/MyikaBridge/Public/MyikaInteractionComponent.h` | Component header — UPROPERTYs, delegates, public API |
| Create | `ue-plugin/MyikaBridge/Source/MyikaBridge/Private/MyikaInteractionComponent.cpp` | Component implementation — overlap, input binding, rotation |
| Modify | `ue-plugin/MyikaBridge/Source/MyikaBridge/MyikaBridge.Build.cs` | Add EnhancedInput module dependency |
| Modify | `ue-plugin/MyikaBridge/MyikaBridge.uplugin` | Add EnhancedInput plugin dependency |
| Create | `ue-plugin/MyikaBridge/Content/Input/IA_Interact.uasset` | InputAction asset (created via UE editor) |
| Create | `ue-plugin/MyikaBridge/Content/Input/IMC_Myika.uasset` | InputMappingContext asset (created via UE editor) |
| Modify | `desktop/src-tauri/src/claude.rs` | Add Myika Primitives Library section to SYSTEM_PROMPT |

---

### Task 1: Add EnhancedInput Dependencies to Build Files

**Files:**
- Modify: `ue-plugin/MyikaBridge/Source/MyikaBridge/MyikaBridge.Build.cs`
- Modify: `ue-plugin/MyikaBridge/MyikaBridge.uplugin`

- [ ] **Step 1: Add EnhancedInput to Build.cs**

In `MyikaBridge.Build.cs`, add `"EnhancedInput"` to `PublicDependencyModuleNames`:

```csharp
using UnrealBuildTool;

public class MyikaBridge : ModuleRules
{
    public MyikaBridge(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "Networking",
            "Sockets",
            "Json",
            "JsonUtilities",
            "HTTP",
            "EnhancedInput"
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "PythonScriptPlugin"
        });
    }
}
```

- [ ] **Step 2: Add EnhancedInput plugin dependency to .uplugin**

In `MyikaBridge.uplugin`, add to the `"Plugins"` array:

```json
{
  "FileVersion": 3,
  "Version": 1,
  "VersionName": "0.1.0",
  "FriendlyName": "Myika Bridge",
  "Description": "WebSocket bridge and AI primitives for Myika AI assistant",
  "Category": "AI",
  "CreatedBy": "Myika AI",
  "CreatedByURL": "https://myika.ai",
  "DocsURL": "",
  "MarketplaceURL": "",
  "CanContainContent": true,
  "IsBetaVersion": true,
  "IsExperimentalVersion": false,
  "Installed": false,
  "Modules": [
    {
      "Name": "MyikaBridge",
      "Type": "Editor",
      "LoadingPhase": "PostEngineInit"
    }
  ],
  "Plugins": [
    {
      "Name": "PythonScriptPlugin",
      "Enabled": true
    },
    {
      "Name": "EnhancedInput",
      "Enabled": true
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add ue-plugin/MyikaBridge/Source/MyikaBridge/MyikaBridge.Build.cs ue-plugin/MyikaBridge/MyikaBridge.uplugin
git commit -m "build: add EnhancedInput dependency to MyikaBridge plugin"
```

---

### Task 2: Create UMyikaInteractionComponent Header

**Files:**
- Create: `ue-plugin/MyikaBridge/Source/MyikaBridge/Public/MyikaInteractionComponent.h`

- [ ] **Step 1: Write the component header**

```cpp
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Components/BoxComponent.h"
#include "InputAction.h"
#include "MyikaInteractionComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FMyikaInteractSignature, AActor*, Interactor);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FMyikaDoorStateSignature, bool, bOpening);

/**
 * Myika Primitives Library — Interaction Component
 *
 * Detects player overlap + Enhanced Input action, fires OnInteract delegate.
 * Optionally handles door-style rotation animation via properties.
 * Designed for AI assembly: the agent adds this component to a BP and
 * configures UPROPERTYs — no node graph wiring needed.
 */
UCLASS(ClassGroup=(Myika), meta=(BlueprintSpawnableComponent))
class MYIKABRIDGE_API UMyikaInteractionComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UMyikaInteractionComponent();

	// --- Configuration ---

	/** Half-extent of the overlap detection box. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Myika|Interaction")
	FVector InteractionExtent = FVector(150.f, 150.f, 150.f);

	/** Enhanced Input action that triggers interaction. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Myika|Interaction")
	TObjectPtr<UInputAction> InputAction;

	/** If true, the component rotates the owning actor on interaction (door behavior). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Myika|DoorRotation")
	bool bAutoRotate = false;

	/** Axis to rotate around when bAutoRotate is true. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Myika|DoorRotation", meta = (EditCondition = "bAutoRotate"))
	TEnumAsByte<EAxis::Type> RotationAxis = EAxis::Z;

	/** Degrees to rotate when opening. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Myika|DoorRotation", meta = (EditCondition = "bAutoRotate"))
	float RotationAngle = 90.f;

	/** Duration of the open/close animation in seconds. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Myika|DoorRotation", meta = (EditCondition = "bAutoRotate"))
	float RotationDuration = 0.5f;

	/** Current open/close state. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Myika|DoorRotation")
	bool bIsOpen = false;

	// --- Delegates ---

	/** Fired when the player triggers the input action while overlapping. */
	UPROPERTY(BlueprintAssignable, Category = "Myika|Interaction")
	FMyikaInteractSignature OnInteract;

	/** Fired when auto-rotate starts an open or close animation. */
	UPROPERTY(BlueprintAssignable, Category = "Myika|DoorRotation")
	FMyikaDoorStateSignature OnDoorStateChanged;

protected:
	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelComponentTickType TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	/** The overlap trigger volume, created at runtime. */
	UPROPERTY()
	TObjectPtr<UBoxComponent> TriggerBox;

	/** Is a player pawn currently overlapping? */
	bool bPlayerInRange = false;

	/** Rotation animation state. */
	bool bIsAnimating = false;
	FRotator InitialRotation;
	FRotator TargetRotation;
	float AnimationElapsed = 0.f;

	UFUNCTION()
	void OnTriggerBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	UFUNCTION()
	void OnTriggerEndOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex);

	void HandleInteraction();
	void StartRotation(bool bOpening);
};
```

- [ ] **Step 2: Commit**

```bash
git add ue-plugin/MyikaBridge/Source/MyikaBridge/Public/MyikaInteractionComponent.h
git commit -m "feat: add UMyikaInteractionComponent header — first Myika primitive"
```

---

### Task 3: Implement UMyikaInteractionComponent

**Files:**
- Create: `ue-plugin/MyikaBridge/Source/MyikaBridge/Private/MyikaInteractionComponent.cpp`

- [ ] **Step 1: Write the component implementation**

```cpp
#include "MyikaInteractionComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputMappingContext.h"
#include "GameFramework/Character.h"
#include "GameFramework/PlayerController.h"

UMyikaInteractionComponent::UMyikaInteractionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = false; // Only tick during animation
}

void UMyikaInteractionComponent::BeginPlay()
{
	Super::BeginPlay();

	AActor* Owner = GetOwner();
	if (!Owner) return;

	// Create the trigger box as a child of the owner's root
	TriggerBox = NewObject<UBoxComponent>(Owner, TEXT("MyikaInteractionTrigger"));
	TriggerBox->SetupAttachment(Owner->GetRootComponent());
	TriggerBox->RegisterComponent();
	TriggerBox->SetBoxExtent(InteractionExtent);
	TriggerBox->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	TriggerBox->SetGenerateOverlapEvents(true);
	TriggerBox->SetHiddenInGame(true);

	TriggerBox->OnComponentBeginOverlap.AddDynamic(this, &UMyikaInteractionComponent::OnTriggerBeginOverlap);
	TriggerBox->OnComponentEndOverlap.AddDynamic(this, &UMyikaInteractionComponent::OnTriggerEndOverlap);

	// Store the initial rotation for auto-rotate
	InitialRotation = Owner->GetActorRotation();

	// Compute target rotation
	FRotator DeltaRot = FRotator::ZeroRotator;
	switch (RotationAxis)
	{
	case EAxis::X: DeltaRot.Roll = RotationAngle; break;
	case EAxis::Y: DeltaRot.Pitch = RotationAngle; break;
	case EAxis::Z: DeltaRot.Yaw = RotationAngle; break;
	default: DeltaRot.Yaw = RotationAngle; break;
	}
	TargetRotation = InitialRotation + DeltaRot;

	// Bind Enhanced Input action on the first local player
	APlayerController* PC = Owner->GetWorld() ? Owner->GetWorld()->GetFirstPlayerController() : nullptr;
	if (PC && InputAction)
	{
		if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PC->InputComponent))
		{
			EIC->BindAction(InputAction, ETriggerEvent::Started, this, &UMyikaInteractionComponent::HandleInteraction);
		}
	}
}

void UMyikaInteractionComponent::TickComponent(float DeltaTime, ELevelComponentTickType TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (!bIsAnimating) return;

	AActor* Owner = GetOwner();
	if (!Owner) return;

	AnimationElapsed += DeltaTime;
	float Alpha = FMath::Clamp(AnimationElapsed / FMath::Max(RotationDuration, 0.01f), 0.f, 1.f);
	Alpha = FMath::InterpEaseInOut(0.f, 1.f, Alpha, 2.f);

	FRotator From = bIsOpen ? InitialRotation : TargetRotation;
	FRotator To = bIsOpen ? TargetRotation : InitialRotation;
	FRotator Current = FMath::Lerp(From, To, Alpha);
	Owner->SetActorRotation(Current);

	if (Alpha >= 1.f)
	{
		bIsAnimating = false;
		SetComponentTickEnabled(false);
	}
}

void UMyikaInteractionComponent::OnTriggerBeginOverlap(UPrimitiveComponent* OverlappedComponent,
	AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex,
	bool bFromSweep, const FHitResult& SweepResult)
{
	if (Cast<ACharacter>(OtherActor))
	{
		bPlayerInRange = true;
	}
}

void UMyikaInteractionComponent::OnTriggerEndOverlap(UPrimitiveComponent* OverlappedComponent,
	AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex)
{
	if (Cast<ACharacter>(OtherActor))
	{
		bPlayerInRange = false;
	}
}

void UMyikaInteractionComponent::HandleInteraction()
{
	if (!bPlayerInRange) return;
	if (bIsAnimating) return;

	AActor* Owner = GetOwner();
	if (!Owner) return;

	// Find the interacting player
	APlayerController* PC = Owner->GetWorld() ? Owner->GetWorld()->GetFirstPlayerController() : nullptr;
	AActor* Interactor = PC ? PC->GetPawn() : nullptr;

	OnInteract.Broadcast(Interactor);

	if (bAutoRotate)
	{
		StartRotation(!bIsOpen);
	}
}

void UMyikaInteractionComponent::StartRotation(bool bOpening)
{
	bIsOpen = bOpening;
	bIsAnimating = true;
	AnimationElapsed = 0.f;
	SetComponentTickEnabled(true);

	OnDoorStateChanged.Broadcast(bOpening);
}
```

- [ ] **Step 2: Compile in UE editor**

Open the UE project (`myika_plugin.uproject`) and trigger a hot reload, or close the editor and build from command line:

```bash
# If using command line build (adjust path to your UE installation):
"C:/Program Files/Epic Games/UE_5.7/Engine/Build/BatchFiles/Build.bat" myika_pluginEditor Win64 Development -Project="C:/Users/jgrif/Documents/MyikaAI/myika_plugin/myika_plugin.uproject"
```

Expected: Compiles with 0 errors. Warnings about unused variables are acceptable.

- [ ] **Step 3: Commit**

```bash
git add ue-plugin/MyikaBridge/Source/MyikaBridge/Private/MyikaInteractionComponent.cpp
git commit -m "feat: implement UMyikaInteractionComponent — overlap, input, auto-rotate"
```

---

### Task 4: Create Enhanced Input Assets in the Editor

**Files:**
- Create: `ue-plugin/MyikaBridge/Content/Input/IA_Interact.uasset`
- Create: `ue-plugin/MyikaBridge/Content/Input/IMC_Myika.uasset`

These are UE content assets — they must be created in the editor, not as text files.

- [ ] **Step 1: Create IA_Interact InputAction**

1. Open UE editor with myika_plugin project
2. In Content Browser, navigate to `Plugins/MyikaBridge Content/Input/` (create `Input` folder if needed)
3. Right-click → Input → Input Action
4. Name it `IA_Interact`
5. Open it — set Value Type to `Digital (bool)` (default)
6. Save

- [ ] **Step 2: Create IMC_Myika InputMappingContext**

1. Right-click in the same folder → Input → Input Mapping Context
2. Name it `IMC_Myika`
3. Open it → click `+` to add a mapping
4. Set the Action to `IA_Interact`
5. Click `+` next to the mapping to add a key → set to `E`
6. Save

- [ ] **Step 3: Verify the assets load by path**

Open the UE Python console (Window → Developer Tools → Output Log, switch to Python) and run:

```python
import unreal
ia = unreal.EditorAssetLibrary.load_asset("/MyikaBridge/Input/IA_Interact")
imc = unreal.EditorAssetLibrary.load_asset("/MyikaBridge/Input/IMC_Myika")
print(f"IA_Interact: {ia}")
print(f"IMC_Myika: {imc}")
```

Expected: Both print valid object references, not `None`.

- [ ] **Step 4: Commit the uasset files**

```bash
git add ue-plugin/MyikaBridge/Content/Input/IA_Interact.uasset
git add ue-plugin/MyikaBridge/Content/Input/IMC_Myika.uasset
git commit -m "content: ship IA_Interact and IMC_Myika Enhanced Input assets"
```

---

### Task 5: Update System Prompt with Primitives Library

**Files:**
- Modify: `desktop/src-tauri/src/claude.rs:16-31` (the `SYSTEM_PROMPT` constant)

- [ ] **Step 1: Update the SYSTEM_PROMPT constant**

Replace the `SYSTEM_PROMPT` const in `claude.rs` with this expanded version. The new section is `## Myika Primitives Library` at the end:

```rust
const SYSTEM_PROMPT: &str = r#"You are Myika, an AI assistant specialized in Unreal Engine 5.7. You're connected to a running UE editor via tools.

IMPORTANT: When a request involves 2 or more steps, structural changes, or multi-file operations, you MUST call propose_plan first with a summary and numbered steps. Wait for the user's approval before executing. If the plan is cancelled, acknowledge it and stop — do not execute any steps. Simple single-step tasks (e.g. creating one file, reading a file) can be executed directly without a plan.

Use Python (via run_python) for most editor mutations — UE's Python API is your primary lever. Verify each step succeeded before moving on (get_compile_errors, read_blueprint_summary). If something fails, surface it plainly and propose a fix.

Be concise. Don't lecture. Match the user's pace.

## Tools (MCP)
- propose_plan: Propose a multi-step plan for user approval before executing
- list_assets: List UAssets in the project
- read_file: Read text files from the project
- write_file: Create/overwrite text files (auto git checkpoint)
- run_python: Execute Python in the UE editor (has 'unreal' module)
- get_compile_errors: Get Blueprint and C++ compile errors
- read_blueprint_summary: Get structured Blueprint summary

## Myika Primitives Library
The MyikaBridge plugin ships reusable C++ components optimized for AI assembly. Compose these into Blueprints via run_python rather than trying to build everything from raw UE classes. These components handle the parts that are hard to do via Python (event wiring, input binding, animation) — your job is to create BPs, add these components, and configure their properties.

### UMyikaInteractionComponent
Detects player overlap + responds to an Enhanced Input action. Optionally handles door-style rotation animation entirely through properties.

Add to any Actor Blueprint via run_python:
```python
import unreal
# After creating the BP and getting its SCS (SimpleConstructionScript):
interaction_node = scs.create_node(unreal.MyikaInteractionComponent, "InteractionComponent")
interaction_comp = interaction_node.component_template
interaction_comp.set_editor_property("InteractionExtent", unreal.Vector(150, 150, 150))
interaction_comp.set_editor_property("bAutoRotate", True)
interaction_comp.set_editor_property("RotationAngle", 90.0)
interaction_comp.set_editor_property("RotationDuration", 0.5)
# Set the input action:
ia = unreal.EditorAssetLibrary.load_asset("/MyikaBridge/Input/IA_Interact")
interaction_comp.set_editor_property("InputAction", ia)
```

Properties:
- InteractionExtent (FVector): Half-extent of overlap detection box. Default (150, 150, 150).
- InputAction (UInputAction*): Enhanced Input action to listen for. Use /MyikaBridge/Input/IA_Interact.
- bAutoRotate (bool): If true, component handles rotation animation on interaction. Default false.
- RotationAxis (EAxis): Axis to rotate around (X/Y/Z). Default Z.
- RotationAngle (float): Degrees to rotate when opening. Default 90.
- RotationDuration (float): Seconds for open/close animation. Default 0.5.
- bIsOpen (bool): Current open/close state (read-only).

Delegates (BlueprintAssignable):
- OnInteract(AActor* Interactor): Fired when player presses action while in range.
- OnDoorStateChanged(bool bOpening): Fired when auto-rotate starts.

### Enhanced Input Assets
- /MyikaBridge/Input/IA_Interact: InputAction for player interaction (E key)
- /MyikaBridge/Input/IMC_Myika: InputMappingContext mapping E → IA_Interact

IMPORTANT: When the agent creates a BP that uses UMyikaInteractionComponent, it should also ensure the player controller has IMC_Myika added. Do this via run_python in BeginPlay or by adding a setup snippet:
```python
import unreal
# Add IMC_Myika to the first local player's Enhanced Input subsystem
world = unreal.EditorLevelLibrary.get_editor_world()
pc = unreal.GameplayStatics.get_player_controller(world, 0)
if pc:
    subsystem = unreal.SubsystemBlueprintLibrary.get_local_player_subsystem(
        unreal.EnhancedInputLocalPlayerSubsystem, pc)
    if subsystem:
        imc = unreal.EditorAssetLibrary.load_asset("/MyikaBridge/Input/IMC_Myika")
        subsystem.add_mapping_context(imc, 0)
```
Note: This IMC setup only needs to happen once per play session. For the demo, the agent can include this as a final step after creating the BP."#;
```

- [ ] **Step 2: Verify it compiles**

```bash
cd desktop && cargo check 2>&1 | tail -5
```

Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add desktop/src-tauri/src/claude.rs
git commit -m "feat: add Myika Primitives Library section to system prompt"
```

---

### Task 6: Verify Door Scenario End-to-End

This is a manual verification task — run the full scenario through the Myika desktop app.

- [ ] **Step 1: Start all services**

1. Open UE editor with myika_plugin project (plugin auto-starts WS server on :17645)
2. Start the desktop app: `cd desktop && cargo tauri dev`
3. Verify "Bridge connected" appears in the desktop app

- [ ] **Step 2: Send the door prompt**

Type in the Myika chat:

> Build me a basic interactable door

- [ ] **Step 3: Verify the agent proposes a plan**

Expected: The agent calls `propose_plan` with steps like:
1. Create BP_Door Actor Blueprint
2. Add StaticMeshComponent with door-shaped mesh
3. Add UMyikaInteractionComponent with auto-rotate configured
4. Compile the Blueprint
5. Verify with read_blueprint_summary

Click "Approve & Run".

- [ ] **Step 4: Verify BP_Door is created**

After the agent finishes executing, verify in UE editor:
1. Content Browser → `/Game/` should contain `BP_Door`
2. Double-click to open it — should have:
   - StaticMeshComponent (root, door-shaped)
   - MyikaInteractionComponent (with bAutoRotate=true, RotationAngle=90)
3. No compile errors (check agent output or run get_compile_errors manually)

- [ ] **Step 5: Test in PIE (Play In Editor)**

1. Drag BP_Door into the level
2. Press Play
3. Walk up to the door with the default character
4. Press E
5. Expected: Door rotates 90 degrees over 0.5 seconds
6. Press E again: Door rotates back

**If the door doesn't respond to E:** The IMC might not be added. Check if the agent included the IMC setup step. If not, this is a system prompt tuning issue for Day 10.

- [ ] **Step 6: Tag the release**

```bash
git tag v0.1.0-day9-door-scenario
```

---

## Troubleshooting Notes

**"MyikaInteractionComponent not found" in run_python:**
The component class might not be visible to Python if the module isn't loaded. Check that the plugin compiled successfully and the editor was restarted after compilation. The class should appear as `unreal.MyikaInteractionComponent`.

**Overlap doesn't trigger:**
The TriggerBox is created at runtime in BeginPlay. If the BP is opened in the editor before playing, the box won't be visible in the component list — this is expected. It only exists at runtime.

**Enhanced Input action doesn't fire:**
The component binds to the first player controller's input in BeginPlay. If the player controller doesn't have IMC_Myika added to its Enhanced Input subsystem, the E key won't be recognized. The system prompt instructs the agent to handle this, but it may need Day 10 iteration.

**Rotation animates the wrong axis:**
Check that RotationAxis is set to Z (default). The agent's run_python should set this explicitly.
