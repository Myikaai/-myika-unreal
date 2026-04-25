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
