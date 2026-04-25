#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"
#include "Containers/Ticker.h"
#include "MyikaBridgeServer.h"

class FMyikaBridgeModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

private:
	TSharedPtr<FMyikaBridgeServer> Server;
	FTSTicker::FDelegateHandle TickHandle;
};
