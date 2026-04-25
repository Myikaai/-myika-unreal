#pragma once

#include "CoreMinimal.h"

class FMyikaBridgeServer
{
public:
    void Start(uint16 Port = 17645);
    void Stop();
    bool IsRunning() const { return bIsRunning; }

private:
    bool bIsRunning = false;
    // WebSocket server implementation - Day 2
};
