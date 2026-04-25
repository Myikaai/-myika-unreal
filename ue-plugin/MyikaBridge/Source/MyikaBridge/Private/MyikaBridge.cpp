#include "MyikaBridge.h"
#include "Containers/Ticker.h"

#define LOCTEXT_NAMESPACE "FMyikaBridgeModule"

void FMyikaBridgeModule::StartupModule()
{
	UE_LOG(LogTemp, Log, TEXT("[Myika] MyikaBridge plugin loaded. Starting WebSocket server..."));

	Server = MakeShared<FMyikaBridgeServer>();
	Server->Start(17645);

	// Register a tick delegate on the game thread so we can process messages
	TickHandle = FTSTicker::GetCoreTicker().AddTicker(
		FTickerDelegate::CreateLambda([this](float DeltaTime) -> bool
		{
			if (Server.IsValid())
			{
				Server->Tick();
			}
			return true; // Keep ticking
		}),
		0.0f // Tick every frame
	);

	UE_LOG(LogTemp, Log, TEXT("[Myika] MyikaBridge plugin ready."));
}

void FMyikaBridgeModule::ShutdownModule()
{
	UE_LOG(LogTemp, Log, TEXT("[Myika] MyikaBridge plugin shutting down."));

	// Remove tick delegate
	if (TickHandle.IsValid())
	{
		FTSTicker::GetCoreTicker().RemoveTicker(TickHandle);
		TickHandle.Reset();
	}

	// Stop the server
	if (Server.IsValid())
	{
		Server->Stop();
		Server.Reset();
	}

	UE_LOG(LogTemp, Log, TEXT("[Myika] MyikaBridge plugin shut down."));
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FMyikaBridgeModule, MyikaBridge)
