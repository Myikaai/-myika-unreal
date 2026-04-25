#include "MyikaBridge.h"

#define LOCTEXT_NAMESPACE "FMyikaBridgeModule"

void FMyikaBridgeModule::StartupModule()
{
    UE_LOG(LogTemp, Log, TEXT("[Myika] MyikaBridge plugin loaded successfully."));
}

void FMyikaBridgeModule::ShutdownModule()
{
    UE_LOG(LogTemp, Log, TEXT("[Myika] MyikaBridge plugin shutting down."));
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FMyikaBridgeModule, MyikaBridge)
