#include "MyikaBridge.h"
#include "Containers/Ticker.h"
#include "IPythonScriptPlugin.h"

#define LOCTEXT_NAMESPACE "FMyikaBridgeModule"

void FMyikaBridgeModule::StartupModule()
{
	UE_LOG(LogTemp, Log, TEXT("[Myika] MyikaBridge plugin loaded. Starting WebSocket server..."));

	Server = MakeShared<FMyikaBridgeServer>();
	Server->Start(17645);

	// Import the Python dispatcher module (deferred until Python is ready)
	if (IPythonScriptPlugin* PythonPlugin = IPythonScriptPlugin::Get())
	{
		PythonPlugin->RegisterOnPythonInitialized(FSimpleDelegate::CreateLambda([this]()
		{
			if (IPythonScriptPlugin* PP = IPythonScriptPlugin::Get())
			{
				bool bOk = PP->ExecPythonCommand(TEXT("import myika.dispatcher"));
				if (bOk)
				{
					UE_LOG(LogTemp, Log, TEXT("[Myika] Python dispatcher loaded successfully."));
				}
				else
				{
					UE_LOG(LogTemp, Error, TEXT("[Myika] Failed to import myika.dispatcher!"));
				}
			}
		}));
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("[Myika] PythonScriptPlugin not available — tool dispatch will not work."));
	}

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
