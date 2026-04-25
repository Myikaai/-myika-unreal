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

void UMyikaInteractionComponent::TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
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
