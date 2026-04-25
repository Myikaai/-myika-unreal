#pragma once

#include "CoreMinimal.h"
#include "HAL/Runnable.h"
#include "Containers/Queue.h"
#include "IPythonScriptPlugin.h"

class FSocket;

DECLARE_MULTICAST_DELEGATE(FOnClientConnected);
DECLARE_MULTICAST_DELEGATE(FOnClientDisconnected);

/**
 * Lightweight WebSocket server using raw FSocket listen + manual WS handshake.
 * Accepts a single client connection on a background thread, processes
 * messages on the game thread via Tick().
 */
class FMyikaBridgeServer : public TSharedFromThis<FMyikaBridgeServer>
{
public:
	FMyikaBridgeServer();
	~FMyikaBridgeServer();

	/** Start listening on the given port. */
	void Start(uint16 Port = 17645);

	/** Stop the server, disconnect client, kill threads. */
	void Stop();

	/** Called each game-thread tick to process queued messages. */
	void Tick();

	/** Queue a JSON string to be sent to the connected client. */
	void SendMessage(const FString& JsonString);

	/** Helper: send an event message with the given name and data object. */
	void SendEvent(const FString& EventName, const TSharedPtr<FJsonObject>& Data);

	bool IsRunning() const { return bIsRunning; }
	bool IsClientConnected() const { return bClientConnected; }

	FOnClientConnected OnConnected;
	FOnClientDisconnected OnDisconnected;

private:
	// --- Networking ---
	FSocket* ListenSocket = nullptr;
	FSocket* ClientSocket = nullptr;

	// --- State ---
	TAtomic<bool> bIsRunning{false};
	TAtomic<bool> bClientConnected{false};
	TAtomic<bool> bStopRequested{false};
	uint16 ListenPort = 17645;

	/** Last time we received any data from the client (for dead-connection detection). */
	double LastClientActivityTime = 0.0;
	static constexpr double PingIntervalSecs = 5.0;
	static constexpr double PingTimeoutSecs = 15.0;

	// --- Thread-safe message queues ---
	TQueue<FString, EQueueMode::Mpsc> IncomingQueue;  // network thread -> game thread
	TQueue<FString, EQueueMode::Mpsc> OutgoingQueue;  // game thread -> network thread

	// --- Background network thread ---
	FRunnableThread* NetworkThread = nullptr;

	/** FRunnable implementation for the network I/O thread. */
	class FNetworkRunnable : public FRunnable
	{
	public:
		FNetworkRunnable(FMyikaBridgeServer* InOwner) : Owner(InOwner) {}
		virtual uint32 Run() override;
		virtual void Stop() override;
	private:
		FMyikaBridgeServer* Owner;
	};
	friend class FNetworkRunnable;
	FNetworkRunnable* Runnable = nullptr;

	// --- Auth ---
	/** Shared-secret token loaded from %LOCALAPPDATA%\Myika\bridge-token at Start(). */
	FString AuthToken;

	/** Read the token file, or generate + write a new one if missing. Returns empty on failure. */
	FString LoadOrCreateAuthToken();

	// --- WebSocket handshake ---
	bool PerformWebSocketHandshake(FSocket* Socket);
	FString ComputeWebSocketAccept(const FString& Key);

	// --- WebSocket frame I/O ---

	/** Result of reading a single WS frame. */
	enum class EFrameResult : uint8
	{
		Text,
		Ping,
		Pong,
		Close,
		Error
	};

	/** Read one WebSocket frame from the socket. Blocks until data available or error. */
	EFrameResult ReadFrame(FSocket* Socket, FString& OutPayload);

	/** Write an unmasked text frame to the socket. */
	bool WriteTextFrame(FSocket* Socket, const FString& Payload);

	/** Write a pong frame (echo back ping payload). */
	bool WritePongFrame(FSocket* Socket, const TArray<uint8>& PingPayload);

	/** Write a ping frame to detect dead connections. */
	bool WritePingFrame(FSocket* Socket);

	/** Write a close frame. */
	bool WriteCloseFrame(FSocket* Socket);

	// --- Helpers ---
	bool SocketSend(FSocket* Socket, const uint8* Data, int32 Len);
	bool SocketRecv(FSocket* Socket, uint8* Data, int32 Len);
	void DisconnectClient();

	/** Generate a UUID v4 string. */
	static FString NewUUID();

	/** Send the bridge.ready event after successful handshake. */
	void SendBridgeReady();

	/** Process one incoming message on the game thread. */
	void HandleIncomingMessage(const FString& Message);

	/**
	 * Dispatch a tool request to Python and return the result JSON.
	 * NOTE: Must be called on the game thread (Python requires it).
	 * TODO: If WebSocket I/O moves off game thread, dispatch back before calling this.
	 */
	FString DispatchToolRequest(const FString& ToolName, const FString& ArgsJson);

	/**
	 * C++ handler for paste_bp_nodes tool.
	 * Uses FEdGraphUtilities::ImportNodesFromText to paste T3D text into a BP graph.
	 * Bypasses Python entirely — direct editor API access.
	 */
	FString HandlePasteBpNodes(const FString& ArgsJson);

	/**
	 * C++ handler for connect_pins tool.
	 * Connects Blueprint graph pins by node name + pin name.
	 * Supports batch connections — compiles/saves once after all wires.
	 */
	FString HandleConnectPins(const FString& ArgsJson);
};
