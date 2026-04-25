#include "MyikaBridgeServer.h"

void FMyikaBridgeServer::Start(uint16 Port)
{
    UE_LOG(LogTemp, Log, TEXT("[Myika] WebSocket server starting on port %d..."), Port);
    // Implementation in Day 2
    bIsRunning = false; // Will be true once implemented
}

void FMyikaBridgeServer::Stop()
{
    UE_LOG(LogTemp, Log, TEXT("[Myika] WebSocket server stopped."));
    bIsRunning = false;
}
