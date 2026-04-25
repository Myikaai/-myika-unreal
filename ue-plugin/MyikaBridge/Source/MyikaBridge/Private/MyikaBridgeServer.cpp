#include "MyikaBridgeServer.h"
#include "IPythonScriptPlugin.h"

#include "Sockets.h"
#include "SocketSubsystem.h"
#include "IPAddress.h"
#include "Misc/Base64.h"
#include "Misc/Guid.h"
#include "Misc/SecureHash.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"
#include "Misc/App.h"
#include "Misc/Paths.h"

DEFINE_LOG_CATEGORY_STATIC(LogMyikaBridge, Log, All);

// Magic GUID from RFC 6455
static const FString WebSocketMagicGuid = TEXT("258EAFA5-E914-47DA-95CA-5AB5DC76B45B");

// ============================================================================
// Construction / Destruction
// ============================================================================

FMyikaBridgeServer::FMyikaBridgeServer()
{
}

FMyikaBridgeServer::~FMyikaBridgeServer()
{
	Stop();
}

// ============================================================================
// Start / Stop
// ============================================================================

void FMyikaBridgeServer::Start(uint16 Port)
{
	if (bIsRunning)
	{
		UE_LOG(LogMyikaBridge, Warning, TEXT("[Myika] Server already running."));
		return;
	}

	ListenPort = Port;
	bStopRequested = false;

	// Create a raw TCP listen socket
	ISocketSubsystem* SocketSub = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM);
	if (!SocketSub)
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to get socket subsystem."));
		return;
	}

	ListenSocket = SocketSub->CreateSocket(NAME_Stream, TEXT("MyikaBridgeListener"), false);
	if (!ListenSocket)
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to create listen socket."));
		return;
	}

	ListenSocket->SetReuseAddr(true);
	ListenSocket->SetNonBlocking(true);

	// Bind to 0.0.0.0:Port
	TSharedRef<FInternetAddr> BindAddr = SocketSub->CreateInternetAddr();
	BindAddr->SetAnyAddress();
	BindAddr->SetPort(ListenPort);

	if (!ListenSocket->Bind(*BindAddr))
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to bind to port %d."), ListenPort);
		SocketSub->DestroySocket(ListenSocket);
		ListenSocket = nullptr;
		return;
	}

	if (!ListenSocket->Listen(1))
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to listen on port %d."), ListenPort);
		SocketSub->DestroySocket(ListenSocket);
		ListenSocket = nullptr;
		return;
	}

	bIsRunning = true;

	// Start network thread
	Runnable = new FNetworkRunnable(this);
	NetworkThread = FRunnableThread::Create(Runnable, TEXT("MyikaBridgeNetwork"), 0, TPri_Normal);

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] WebSocket server started on port %d."), ListenPort);
}

void FMyikaBridgeServer::Stop()
{
	if (!bIsRunning)
	{
		return;
	}

	bStopRequested = true;
	bIsRunning = false;

	// Disconnect client first
	DisconnectClient();

	// Stop and destroy the network thread
	if (NetworkThread)
	{
		NetworkThread->Kill(true);
		delete NetworkThread;
		NetworkThread = nullptr;
	}

	if (Runnable)
	{
		delete Runnable;
		Runnable = nullptr;
	}

	// Destroy the listen socket
	if (ListenSocket)
	{
		ListenSocket->Close();
		ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(ListenSocket);
		ListenSocket = nullptr;
	}

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] WebSocket server stopped."));
}

// ============================================================================
// Tick (game thread)
// ============================================================================

void FMyikaBridgeServer::Tick()
{
	// Process incoming messages on the game thread
	FString Message;
	while (IncomingQueue.Dequeue(Message))
	{
		HandleIncomingMessage(Message);
	}
}

void FMyikaBridgeServer::HandleIncomingMessage(const FString& Message)
{
	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Received: %s"), *Message);

	// Parse JSON envelope
	TSharedPtr<FJsonObject> JsonObj;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
	if (!FJsonSerializer::Deserialize(Reader, JsonObj) || !JsonObj.IsValid())
	{
		UE_LOG(LogMyikaBridge, Warning, TEXT("[Myika] Failed to parse incoming JSON."));
		return;
	}

	FString Id = JsonObj->GetStringField(TEXT("id"));
	FString Type = JsonObj->GetStringField(TEXT("type"));

	if (Type == TEXT("request"))
	{
		const TSharedPtr<FJsonObject>* PayloadObj = nullptr;
		FString ToolName;
		FString ArgsJson = TEXT("{}");

		if (JsonObj->TryGetObjectField(TEXT("payload"), PayloadObj))
		{
			ToolName = (*PayloadObj)->GetStringField(TEXT("tool"));

			const TSharedPtr<FJsonObject>* ArgsObj = nullptr;
			if ((*PayloadObj)->TryGetObjectField(TEXT("args"), ArgsObj))
			{
				TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> ArgsWriter =
					TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&ArgsJson);
				FJsonSerializer::Serialize((*ArgsObj).ToSharedRef(), ArgsWriter);
			}
		}

		UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Dispatching tool '%s' (id=%s)"), *ToolName, *Id);

		FString ResultJson = DispatchToolRequest(ToolName, ArgsJson);

		UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Tool '%s' result: %s"), *ToolName, *ResultJson);

		TSharedPtr<FJsonObject> ResultObj;
		TSharedRef<TJsonReader<>> ResultReader = TJsonReaderFactory<>::Create(ResultJson);
		if (!FJsonSerializer::Deserialize(ResultReader, ResultObj) || !ResultObj.IsValid())
		{
			ResultObj = MakeShared<FJsonObject>();
			ResultObj->SetBoolField(TEXT("ok"), false);
			TSharedPtr<FJsonObject> ErrObj = MakeShared<FJsonObject>();
			ErrObj->SetStringField(TEXT("code"), TEXT("INTERNAL_ERROR"));
			ErrObj->SetStringField(TEXT("message"), TEXT("Failed to parse Python dispatch result"));
			ResultObj->SetObjectField(TEXT("error"), ErrObj);
		}

		TSharedPtr<FJsonObject> Response = MakeShared<FJsonObject>();
		Response->SetStringField(TEXT("id"), Id);
		Response->SetStringField(TEXT("type"), TEXT("response"));
		Response->SetObjectField(TEXT("payload"), ResultObj);

		FString ResponseStr;
		TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> Writer =
			TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&ResponseStr);
		FJsonSerializer::Serialize(Response.ToSharedRef(), Writer);

		SendMessage(ResponseStr);
	}
	else if (Type == TEXT("event"))
	{
		UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Received event (id=%s)."), *Id);
	}
	else
	{
		UE_LOG(LogMyikaBridge, Warning, TEXT("[Myika] Unknown message type: %s"), *Type);
	}
}

// ============================================================================
// Python Dispatch
// ============================================================================

FString FMyikaBridgeServer::DispatchToolRequest(const FString& ToolName, const FString& ArgsJson)
{
	// Build the payload JSON that dispatch_json expects
	FString PayloadJson = FString::Printf(TEXT("{\"tool\":\"%s\",\"args\":%s}"), *ToolName, *ArgsJson);

	// Check Python subsystem availability
	IPythonScriptPlugin* PythonPlugin = IPythonScriptPlugin::Get();
	if (!PythonPlugin || !PythonPlugin->IsPythonAvailable())
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Python subsystem not available."));
		return TEXT("{\"ok\":false,\"error\":{\"code\":\"INTERNAL_ERROR\",\"message\":\"Python subsystem not available\"}}");
	}

	// Escape the payload for embedding in a Python string literal
	FString Escaped = PayloadJson;
	Escaped = Escaped.Replace(TEXT("\\"), TEXT("\\\\"));
	Escaped = Escaped.Replace(TEXT("'"), TEXT("\\'"));
	Escaped = Escaped.Replace(TEXT("\n"), TEXT("\\n"));
	Escaped = Escaped.Replace(TEXT("\r"), TEXT(""));

	FString PythonExpr = FString::Printf(
		TEXT("myika.dispatcher.dispatch_json('%s')"),
		*Escaped
	);

	FPythonCommandEx PythonCmd;
	PythonCmd.Command = PythonExpr;
	PythonCmd.ExecutionMode = EPythonCommandExecutionMode::EvaluateStatement;
	PythonCmd.FileExecutionScope = EPythonFileExecutionScope::Public;

	bool bSuccess = PythonPlugin->ExecPythonCommandEx(PythonCmd);

	if (!bSuccess)
	{
		FString ErrorMsg = TEXT("Python execution failed");
		for (const FPythonLogOutputEntry& Entry : PythonCmd.LogOutput)
		{
			if (Entry.Type == EPythonLogOutputType::Error)
			{
				ErrorMsg = Entry.Output;
				break;
			}
		}
		ErrorMsg = ErrorMsg.Replace(TEXT("\\"), TEXT("\\\\"));
		ErrorMsg = ErrorMsg.Replace(TEXT("\""), TEXT("\\\""));
		ErrorMsg = ErrorMsg.Replace(TEXT("\n"), TEXT("\\n"));
		ErrorMsg = ErrorMsg.Replace(TEXT("\r"), TEXT(""));

		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Python dispatch failed: %s"), *ErrorMsg);
		return FString::Printf(TEXT("{\"ok\":false,\"error\":{\"code\":\"INTERNAL_ERROR\",\"message\":\"%s\"}}"), *ErrorMsg);
	}

	FString Result = PythonCmd.CommandResult;

	// Log Python output to UE log
	for (const FPythonLogOutputEntry& Entry : PythonCmd.LogOutput)
	{
		switch (Entry.Type)
		{
		case EPythonLogOutputType::Info:
			UE_LOG(LogMyikaBridge, Log, TEXT("[Myika/Python] %s"), *Entry.Output);
			break;
		case EPythonLogOutputType::Warning:
			UE_LOG(LogMyikaBridge, Warning, TEXT("[Myika/Python] %s"), *Entry.Output);
			break;
		case EPythonLogOutputType::Error:
			UE_LOG(LogMyikaBridge, Error, TEXT("[Myika/Python] %s"), *Entry.Output);
			break;
		}
	}

	// EvaluateStatement may return string with surrounding quotes — strip them
	if (Result.Len() >= 2 && Result.StartsWith(TEXT("'")) && Result.EndsWith(TEXT("'")))
	{
		Result = Result.Mid(1, Result.Len() - 2);
		Result = Result.Replace(TEXT("\\'"), TEXT("'"));
	}
	else if (Result.Len() >= 2 && Result.StartsWith(TEXT("\"")) && Result.EndsWith(TEXT("\"")))
	{
		Result = Result.Mid(1, Result.Len() - 2);
		Result = Result.Replace(TEXT("\\\""), TEXT("\""));
	}

	// Validate JSON before returning
	TSharedPtr<FJsonObject> TestParse;
	TSharedRef<TJsonReader<>> TestReader = TJsonReaderFactory<>::Create(Result);
	if (!FJsonSerializer::Deserialize(TestReader, TestParse) || !TestParse.IsValid())
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Python returned invalid JSON: %s"), *Result);
		return TEXT("{\"ok\":false,\"error\":{\"code\":\"INTERNAL_ERROR\",\"message\":\"Python returned invalid JSON\"}}");
	}

	return Result;
}

// ============================================================================
// SendMessage / SendEvent
// ============================================================================

void FMyikaBridgeServer::SendMessage(const FString& JsonString)
{
	OutgoingQueue.Enqueue(JsonString);
}

void FMyikaBridgeServer::SendEvent(const FString& EventName, const TSharedPtr<FJsonObject>& Data)
{
	TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetStringField(TEXT("name"), EventName);
	if (Data.IsValid())
	{
		Payload->SetObjectField(TEXT("data"), Data);
	}

	TSharedPtr<FJsonObject> Envelope = MakeShared<FJsonObject>();
	Envelope->SetStringField(TEXT("id"), NewUUID());
	Envelope->SetStringField(TEXT("type"), TEXT("event"));
	Envelope->SetObjectField(TEXT("payload"), Payload);

	FString JsonStr;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&JsonStr, 0);
	FJsonSerializer::Serialize(Envelope.ToSharedRef(), Writer);

	SendMessage(JsonStr);
}

void FMyikaBridgeServer::SendBridgeReady()
{
	TSharedPtr<FJsonObject> Data = MakeShared<FJsonObject>();
	Data->SetStringField(TEXT("ueVersion"), TEXT("5.7"));

	// Get the project name
	FString ProjectName = FApp::GetProjectName();
	if (ProjectName.IsEmpty())
	{
		ProjectName = FPaths::GetBaseFilename(FPaths::GetProjectFilePath());
	}
	Data->SetStringField(TEXT("projectName"), ProjectName);

	SendEvent(TEXT("bridge.ready"), Data);
	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Queued bridge.ready event (project: %s)."), *ProjectName);
}

// ============================================================================
// Network Thread (FRunnable)
// ============================================================================

uint32 FMyikaBridgeServer::FNetworkRunnable::Run()
{
	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Network thread started."));

	while (!Owner->bStopRequested)
	{
		// If no client is connected, try to accept one
		if (!Owner->bClientConnected && Owner->ListenSocket)
		{
			bool bHasPending = false;
			if (Owner->ListenSocket->HasPendingConnection(bHasPending) && bHasPending)
			{
				TSharedRef<FInternetAddr> RemoteAddr = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->CreateInternetAddr();
				FSocket* NewSocket = Owner->ListenSocket->Accept(*RemoteAddr, TEXT("MyikaClient"));
				if (NewSocket)
				{
					UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Incoming connection from %s"), *RemoteAddr->ToString(true));

					// Set the client socket to blocking for the handshake
					NewSocket->SetNonBlocking(false);
					NewSocket->SetRecvErr(true);

					// Perform WebSocket handshake
					if (Owner->PerformWebSocketHandshake(NewSocket))
					{
						Owner->ClientSocket = NewSocket;
						Owner->bClientConnected = true;

						// Switch to non-blocking for the main loop
						NewSocket->SetNonBlocking(true);

						UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] WebSocket handshake successful."));

						// Reset activity timer
						Owner->LastClientActivityTime = FPlatformTime::Seconds();

						// Queue bridge.ready event to be sent
						Owner->SendBridgeReady();
					}
					else
					{
						UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] WebSocket handshake failed."));
						NewSocket->Close();
						ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(NewSocket);
					}
				}
			}

			if (!Owner->bClientConnected)
			{
				FPlatformProcess::Sleep(0.1f);
				continue;
			}
		}

		// Client is connected — do I/O
		if (Owner->bClientConnected && Owner->ClientSocket)
		{
			// Check for dead connection via ping timeout
			double Now = FPlatformTime::Seconds();
			double TimeSinceActivity = Now - Owner->LastClientActivityTime;

			if (TimeSinceActivity >= FMyikaBridgeServer::PingTimeoutSecs)
			{
				UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Client ping timeout (%.1fs without activity). Disconnecting."), TimeSinceActivity);
				Owner->DisconnectClient();
				continue;
			}

			// Send a ping periodically to detect dead connections
			if (TimeSinceActivity >= FMyikaBridgeServer::PingIntervalSecs)
			{
				Owner->ClientSocket->SetNonBlocking(false);
				if (!Owner->WritePingFrame(Owner->ClientSocket))
				{
					UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Ping write failed. Client disconnected."));
					Owner->DisconnectClient();
					continue;
				}
				Owner->ClientSocket->SetNonBlocking(true);
				// Don't update LastClientActivityTime here — we want pong to do that
			}

			// Send any queued outgoing messages
			FString OutMsg;
			while (Owner->OutgoingQueue.Dequeue(OutMsg))
			{
				// Need blocking mode for reliable sends
				Owner->ClientSocket->SetNonBlocking(false);
				if (!Owner->WriteTextFrame(Owner->ClientSocket, OutMsg))
				{
					UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to send frame, disconnecting."));
					Owner->DisconnectClient();
					break;
				}
				Owner->ClientSocket->SetNonBlocking(true);
			}

			if (!Owner->bClientConnected)
			{
				continue;
			}

			// Check if there's data to read (non-blocking poll)
			uint32 PendingDataSize = 0;
			if (Owner->ClientSocket->HasPendingData(PendingDataSize))
			{
				// Switch to blocking for reading the full frame
				Owner->ClientSocket->SetNonBlocking(false);

				FString FramePayload;
				EFrameResult Result = Owner->ReadFrame(Owner->ClientSocket, FramePayload);

				// Back to non-blocking
				if (Owner->ClientSocket)
				{
					Owner->ClientSocket->SetNonBlocking(true);
				}

				// Any successful frame read means the client is alive
				if (Result != EFrameResult::Error)
				{
					Owner->LastClientActivityTime = FPlatformTime::Seconds();
				}

				switch (Result)
				{
				case EFrameResult::Text:
					Owner->IncomingQueue.Enqueue(FramePayload);
					break;
				case EFrameResult::Ping:
					{
						TArray<uint8> Empty;
						Owner->ClientSocket->SetNonBlocking(false);
						Owner->WritePongFrame(Owner->ClientSocket, Empty);
						Owner->ClientSocket->SetNonBlocking(true);
					}
					break;
				case EFrameResult::Pong:
					// Ignore
					break;
				case EFrameResult::Close:
					UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Client sent close frame."));
					Owner->ClientSocket->SetNonBlocking(false);
					Owner->WriteCloseFrame(Owner->ClientSocket);
					Owner->DisconnectClient();
					break;
				case EFrameResult::Error:
					UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Frame read error, disconnecting."));
					Owner->DisconnectClient();
					break;
				}
			}
			else
			{
				// No data available, sleep briefly to avoid busy-spinning
				FPlatformProcess::Sleep(0.01f);
			}
		}
	}

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Network thread exiting."));
	return 0;
}

void FMyikaBridgeServer::FNetworkRunnable::Stop()
{
	Owner->bStopRequested = true;
}

// ============================================================================
// WebSocket Handshake
// ============================================================================

bool FMyikaBridgeServer::PerformWebSocketHandshake(FSocket* Socket)
{
	// Read HTTP upgrade request byte-by-byte until we hit \r\n\r\n
	FString Request;
	uint8 Byte;
	const int32 MaxRequestSize = 8192;

	while (Request.Len() < MaxRequestSize)
	{
		int32 Received = 0;
		if (!Socket->Recv(&Byte, 1, Received))
		{
			UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Handshake recv failed at byte %d (socket error)."), Request.Len());
			return false;
		}
		if (Received <= 0)
		{
			UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Handshake recv returned 0 at byte %d (timeout or closed)."), Request.Len());
			return false;
		}

		Request.AppendChar(static_cast<TCHAR>(Byte));

		// Check for end of headers: \r\n\r\n
		if (Request.Len() >= 4)
		{
			FString Tail = Request.Right(4);
			if (Tail == TEXT("\r\n\r\n"))
			{
				break;
			}
		}
	}

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] HTTP Upgrade Request (%d bytes):\n%s"), Request.Len(), *Request);

	// Extract Sec-WebSocket-Key header
	FString WebSocketKey;
	TArray<FString> Lines;
	Request.ParseIntoArrayLines(Lines);
	for (const FString& Line : Lines)
	{
		FString Trimmed = Line.TrimStartAndEnd();
		if (Trimmed.StartsWith(TEXT("Sec-WebSocket-Key:"), ESearchCase::IgnoreCase))
		{
			WebSocketKey = Trimmed.Mid(18).TrimStartAndEnd();
			break;
		}
	}

	if (WebSocketKey.IsEmpty())
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] No Sec-WebSocket-Key found in handshake request."));
		return false;
	}

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Sec-WebSocket-Key: %s"), *WebSocketKey);

	// Compute the accept value
	FString AcceptValue = ComputeWebSocketAccept(WebSocketKey);

	// Build HTTP 101 Switching Protocols response
	FString Response = FString::Printf(
		TEXT("HTTP/1.1 101 Switching Protocols\r\n")
		TEXT("Upgrade: websocket\r\n")
		TEXT("Connection: Upgrade\r\n")
		TEXT("Sec-WebSocket-Accept: %s\r\n")
		TEXT("\r\n"),
		*AcceptValue
	);

	// Send the response as UTF-8
	FTCHARToUTF8 ResponseUtf8(*Response);
	if (!SocketSend(Socket, (const uint8*)ResponseUtf8.Get(), ResponseUtf8.Length()))
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to send handshake response."));
		return false;
	}

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Handshake response sent. Accept: %s"), *AcceptValue);
	return true;
}

FString FMyikaBridgeServer::ComputeWebSocketAccept(const FString& Key)
{
	// Concatenate key with magic GUID per RFC 6455
	FString Combined = Key + WebSocketMagicGuid;

	// SHA-1 hash
	FTCHARToUTF8 CombinedUtf8(*Combined);
	uint8 Hash[20];
	FSHA1 Sha1;
	Sha1.Update((const uint8*)CombinedUtf8.Get(), CombinedUtf8.Length());
	Sha1.Final();
	Sha1.GetHash(Hash);

	// Base64 encode the raw hash
	return FBase64::Encode(Hash, 20);
}

// ============================================================================
// WebSocket Frame Read/Write
// ============================================================================

FMyikaBridgeServer::EFrameResult FMyikaBridgeServer::ReadFrame(FSocket* Socket, FString& OutPayload)
{
	OutPayload.Empty();

	// Read first 2 bytes of frame header
	uint8 Header[2];
	if (!SocketRecv(Socket, Header, 2))
	{
		return EFrameResult::Error;
	}

	uint8 Opcode = Header[0] & 0x0F;
	// bool bFin = (Header[0] & 0x80) != 0;  // Ignoring fragmentation for demo
	bool bMasked = (Header[1] & 0x80) != 0;
	uint64 PayloadLen = Header[1] & 0x7F;

	// Extended payload length
	if (PayloadLen == 126)
	{
		uint8 ExtLen[2];
		if (!SocketRecv(Socket, ExtLen, 2))
		{
			return EFrameResult::Error;
		}
		PayloadLen = (static_cast<uint64>(ExtLen[0]) << 8) | ExtLen[1];
	}
	else if (PayloadLen == 127)
	{
		uint8 ExtLen[8];
		if (!SocketRecv(Socket, ExtLen, 8))
		{
			return EFrameResult::Error;
		}
		PayloadLen = 0;
		for (int i = 0; i < 8; ++i)
		{
			PayloadLen = (PayloadLen << 8) | ExtLen[i];
		}
	}

	// Sanity limit: 16 MB
	if (PayloadLen > 16 * 1024 * 1024)
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Frame too large: %llu bytes."), PayloadLen);
		return EFrameResult::Error;
	}

	// Read mask key if present (client->server frames are always masked)
	uint8 MaskKey[4] = {0, 0, 0, 0};
	if (bMasked)
	{
		if (!SocketRecv(Socket, MaskKey, 4))
		{
			return EFrameResult::Error;
		}
	}

	// Read payload data
	TArray<uint8> PayloadData;
	if (PayloadLen > 0)
	{
		PayloadData.SetNumUninitialized(static_cast<int32>(PayloadLen));
		if (!SocketRecv(Socket, PayloadData.GetData(), static_cast<int32>(PayloadLen)))
		{
			return EFrameResult::Error;
		}

		// Unmask
		if (bMasked)
		{
			for (int32 i = 0; i < static_cast<int32>(PayloadLen); ++i)
			{
				PayloadData[i] ^= MaskKey[i % 4];
			}
		}
	}

	// Dispatch by opcode
	switch (Opcode)
	{
	case 0x01: // Text frame
		{
			FUTF8ToTCHAR Converter((const ANSICHAR*)PayloadData.GetData(), PayloadData.Num());
			OutPayload = FString(Converter.Length(), Converter.Get());
			return EFrameResult::Text;
		}
	case 0x08: // Close
		return EFrameResult::Close;
	case 0x09: // Ping
		return EFrameResult::Ping;
	case 0x0A: // Pong
		return EFrameResult::Pong;
	default:
		UE_LOG(LogMyikaBridge, Warning, TEXT("[Myika] Unhandled WS opcode: 0x%02X"), Opcode);
		return EFrameResult::Error;
	}
}

bool FMyikaBridgeServer::WriteTextFrame(FSocket* Socket, const FString& Payload)
{
	FTCHARToUTF8 Utf8(*Payload);
	int32 PayloadLen = Utf8.Length();

	TArray<uint8> Frame;
	Frame.Reserve(PayloadLen + 10);

	// Byte 0: FIN bit + text opcode (0x81)
	Frame.Add(0x81);

	// Payload length encoding (server->client is NOT masked, so mask bit = 0)
	if (PayloadLen < 126)
	{
		Frame.Add(static_cast<uint8>(PayloadLen));
	}
	else if (PayloadLen <= 65535)
	{
		Frame.Add(126);
		Frame.Add(static_cast<uint8>((PayloadLen >> 8) & 0xFF));
		Frame.Add(static_cast<uint8>(PayloadLen & 0xFF));
	}
	else
	{
		Frame.Add(127);
		for (int i = 7; i >= 0; --i)
		{
			Frame.Add(static_cast<uint8>((static_cast<uint64>(PayloadLen) >> (8 * i)) & 0xFF));
		}
	}

	// Append payload bytes
	Frame.Append((const uint8*)Utf8.Get(), PayloadLen);

	return SocketSend(Socket, Frame.GetData(), Frame.Num());
}

bool FMyikaBridgeServer::WritePongFrame(FSocket* Socket, const TArray<uint8>& PingPayload)
{
	TArray<uint8> Frame;
	Frame.Add(0x8A); // FIN + pong opcode
	Frame.Add(static_cast<uint8>(FMath::Min(PingPayload.Num(), 125))); // Small payload assumption
	if (PingPayload.Num() > 0)
	{
		Frame.Append(PingPayload.GetData(), FMath::Min(PingPayload.Num(), 125));
	}
	return SocketSend(Socket, Frame.GetData(), Frame.Num());
}

bool FMyikaBridgeServer::WritePingFrame(FSocket* Socket)
{
	uint8 Frame[2] = {0x89, 0x00}; // FIN + ping opcode, zero-length payload
	return SocketSend(Socket, Frame, 2);
}

bool FMyikaBridgeServer::WriteCloseFrame(FSocket* Socket)
{
	uint8 Frame[2] = {0x88, 0x00}; // FIN + close opcode, zero-length payload
	return SocketSend(Socket, Frame, 2);
}

// ============================================================================
// Socket Helpers
// ============================================================================

bool FMyikaBridgeServer::SocketSend(FSocket* Socket, const uint8* Data, int32 Len)
{
	int32 TotalSent = 0;
	while (TotalSent < Len)
	{
		int32 Sent = 0;
		if (!Socket->Send(Data + TotalSent, Len - TotalSent, Sent))
		{
			return false;
		}
		if (Sent <= 0)
		{
			return false;
		}
		TotalSent += Sent;
	}
	return true;
}

bool FMyikaBridgeServer::SocketRecv(FSocket* Socket, uint8* Data, int32 Len)
{
	int32 TotalRecv = 0;
	while (TotalRecv < Len)
	{
		int32 Received = 0;
		if (!Socket->Recv(Data + TotalRecv, Len - TotalRecv, Received))
		{
			return false;
		}
		if (Received <= 0)
		{
			return false;
		}
		TotalRecv += Received;
	}
	return true;
}

void FMyikaBridgeServer::DisconnectClient()
{
	if (ClientSocket)
	{
		ClientSocket->Close();
		ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(ClientSocket);
		ClientSocket = nullptr;
	}
	bClientConnected = false;

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Client disconnected."));
}

FString FMyikaBridgeServer::NewUUID()
{
	return FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower);
}
