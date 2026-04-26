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
#include "Misc/FileHelper.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformMisc.h"

// paste_bp_nodes / connect_pins / set_pin_default support
#include "EdGraphUtilities.h"
#include "EdGraph/EdGraph.h"
#include "EdGraph/EdGraphNode.h"
#include "Engine/Blueprint.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "EditorAssetLibrary.h"

// add_timeline_track support
#include "K2Node_Timeline.h"
#include "Engine/TimelineTemplate.h"
#include "Curves/CurveFloat.h"
#include "Curves/CurveVector.h"
#include "Curves/RichCurve.h"

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

	// Bind to 127.0.0.1:Port — loopback only.
	// We deliberately do NOT bind to 0.0.0.0; the bridge has no auth at the
	// transport layer, so exposing it on any non-loopback interface (LAN, VPN,
	// public Wi-Fi) would allow unauthenticated remote code execution inside
	// the Unreal Editor via run_python.
	TSharedRef<FInternetAddr> BindAddr = SocketSub->CreateInternetAddr();
	bool bIsValidIp = false;
	BindAddr->SetIp(TEXT("127.0.0.1"), bIsValidIp);
	if (!bIsValidIp)
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to set loopback bind address."));
		SocketSub->DestroySocket(ListenSocket);
		ListenSocket = nullptr;
		return;
	}
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

	// Load or create the shared-secret token used to authenticate the desktop app.
	AuthToken = LoadOrCreateAuthToken();
	if (AuthToken.IsEmpty())
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to load/create auth token; refusing to start."));
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

// ============================================================================
// C++ Tool Handlers (bypass Python for direct editor API access)
// ============================================================================

FString FMyikaBridgeServer::HandlePasteBpNodes(const FString& ArgsJson)
{
	// Parse args
	TSharedPtr<FJsonObject> Args;
	TSharedRef<TJsonReader<>> ArgsReader = TJsonReaderFactory<>::Create(ArgsJson);
	if (!FJsonSerializer::Deserialize(ArgsReader, Args) || !Args.IsValid())
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"nodes_added\":0,\"error\":\"Failed to parse args JSON\"}}");
	}

	FString AssetPath = Args->GetStringField(TEXT("asset_path"));
	FString GraphName = Args->GetStringField(TEXT("graph_name"));
	FString T3dText = Args->GetStringField(TEXT("t3d_text"));

	if (AssetPath.IsEmpty() || GraphName.IsEmpty() || T3dText.IsEmpty())
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"nodes_added\":0,\"error\":\"Missing required args: asset_path, graph_name, t3d_text\"}}");
	}

	// Load the Blueprint asset
	UObject* Asset = UEditorAssetLibrary::LoadAsset(AssetPath);
	if (!Asset)
	{
		FString Err = FString::Printf(TEXT("Blueprint not found: %s"), *AssetPath);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"nodes_added\":0,\"error\":\"%s\"}}"), *Err);
	}

	UBlueprint* BP = Cast<UBlueprint>(Asset);
	if (!BP)
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"nodes_added\":0,\"error\":\"Asset is not a Blueprint\"}}");
	}

	// Find the target graph by name
	UEdGraph* TargetGraph = nullptr;
	for (UEdGraph* Graph : BP->UbergraphPages)
	{
		if (Graph && Graph->GetName() == GraphName)
		{
			TargetGraph = Graph;
			break;
		}
	}
	if (!TargetGraph)
	{
		for (UEdGraph* Graph : BP->FunctionGraphs)
		{
			if (Graph && Graph->GetName() == GraphName)
			{
				TargetGraph = Graph;
				break;
			}
		}
	}

	if (!TargetGraph)
	{
		FString Err = FString::Printf(TEXT("Graph '%s' not found in Blueprint '%s'"), *GraphName, *AssetPath);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"nodes_added\":0,\"error\":\"%s\"}}"), *Err);
	}

	// Count nodes before paste
	int32 NodesBefore = TargetGraph->Nodes.Num();

	// Import nodes from T3D text — this is how UE itself implements paste
	TSet<UEdGraphNode*> PastedNodes;
	FEdGraphUtilities::ImportNodesFromText(TargetGraph, T3dText, PastedNodes);

	int32 NodesAdded = PastedNodes.Num();

	if (NodesAdded == 0)
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"nodes_added\":0,\"error\":\"ImportNodesFromText added 0 nodes — T3D text may be invalid or incompatible\"}}");
	}

	// Notify the graph that nodes were added
	for (UEdGraphNode* Node : PastedNodes)
	{
		Node->GetGraph()->NotifyGraphChanged();
	}

	// Mark BP dirty, recompile, save
	FBlueprintEditorUtils::MarkBlueprintAsModified(BP);
	FKismetEditorUtilities::CompileBlueprint(BP);
	UEditorAssetLibrary::SaveAsset(AssetPath, false);

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] paste_bp_nodes: Added %d nodes to %s::%s"), NodesAdded, *AssetPath, *GraphName);

	return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":true,\"nodes_added\":%d,\"error\":\"\"}}"), NodesAdded);
}

FString FMyikaBridgeServer::HandleConnectPins(const FString& ArgsJson)
{
	// Parse args
	TSharedPtr<FJsonObject> Args;
	TSharedRef<TJsonReader<>> ArgsReader = TJsonReaderFactory<>::Create(ArgsJson);
	if (!FJsonSerializer::Deserialize(ArgsReader, Args) || !Args.IsValid())
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"connected\":0,\"errors\":[\"Failed to parse args JSON\"]}}");
	}

	FString AssetPath = Args->GetStringField(TEXT("asset_path"));
	FString GraphName = Args->GetStringField(TEXT("graph_name"));

	if (AssetPath.IsEmpty() || GraphName.IsEmpty())
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"connected\":0,\"errors\":[\"Missing asset_path or graph_name\"]}}");
	}

	// Load Blueprint
	UObject* Asset = UEditorAssetLibrary::LoadAsset(AssetPath);
	UBlueprint* BP = Asset ? Cast<UBlueprint>(Asset) : nullptr;
	if (!BP)
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"connected\":0,\"errors\":[\"Blueprint not found or not a Blueprint\"]}}");
	}

	// Find graph
	UEdGraph* TargetGraph = nullptr;
	for (UEdGraph* Graph : BP->UbergraphPages)
	{
		if (Graph && Graph->GetName() == GraphName) { TargetGraph = Graph; break; }
	}
	if (!TargetGraph)
	{
		for (UEdGraph* Graph : BP->FunctionGraphs)
		{
			if (Graph && Graph->GetName() == GraphName) { TargetGraph = Graph; break; }
		}
	}
	if (!TargetGraph)
	{
		FString Err = FString::Printf(TEXT("Graph '%s' not found"), *GraphName);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"connected\":0,\"errors\":[\"%s\"]}}"), *Err);
	}

	// Build node name → node map
	TMap<FString, UEdGraphNode*> NodeMap;
	for (UEdGraphNode* Node : TargetGraph->Nodes)
	{
		if (Node)
		{
			NodeMap.Add(Node->GetName(), Node);
		}
	}

	// Parse connections array
	const TArray<TSharedPtr<FJsonValue>>* ConnectionsArray = nullptr;
	if (!Args->TryGetArrayField(TEXT("connections"), ConnectionsArray) || !ConnectionsArray)
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"connected\":0,\"errors\":[\"Missing connections array\"]}}");
	}

	const UEdGraphSchema* Schema = TargetGraph->GetSchema();
	int32 Connected = 0;
	TArray<FString> Errors;

	for (const TSharedPtr<FJsonValue>& ConnVal : *ConnectionsArray)
	{
		const TSharedPtr<FJsonObject>* ConnObj = nullptr;
		if (!ConnVal.IsValid() || !ConnVal->TryGetObject(ConnObj) || !ConnObj || !(*ConnObj).IsValid())
		{
			Errors.Add(TEXT("Invalid connection entry"));
			continue;
		}

		FString SrcNode = (*ConnObj)->GetStringField(TEXT("source_node"));
		FString SrcPin = (*ConnObj)->GetStringField(TEXT("source_pin"));
		FString TgtNode = (*ConnObj)->GetStringField(TEXT("target_node"));
		FString TgtPin = (*ConnObj)->GetStringField(TEXT("target_pin"));

		// Find source node and pin
		UEdGraphNode** SrcNodePtr = NodeMap.Find(SrcNode);
		if (!SrcNodePtr)
		{
			Errors.Add(FString::Printf(TEXT("Source node '%s' not found"), *SrcNode));
			continue;
		}

		UEdGraphPin* SrcPinPtr = nullptr;
		for (UEdGraphPin* Pin : (*SrcNodePtr)->Pins)
		{
			if (Pin && Pin->PinName == *SrcPin)
			{
				// For output pins, prefer EGPD_Output direction
				if (Pin->Direction == EGPD_Output)
				{
					SrcPinPtr = Pin;
					break;
				}
				if (!SrcPinPtr) SrcPinPtr = Pin; // fallback
			}
		}
		if (!SrcPinPtr)
		{
			Errors.Add(FString::Printf(TEXT("Source pin '%s' not found on '%s'"), *SrcPin, *SrcNode));
			continue;
		}

		// Find target node and pin
		UEdGraphNode** TgtNodePtr = NodeMap.Find(TgtNode);
		if (!TgtNodePtr)
		{
			Errors.Add(FString::Printf(TEXT("Target node '%s' not found"), *TgtNode));
			continue;
		}

		UEdGraphPin* TgtPinPtr = nullptr;
		for (UEdGraphPin* Pin : (*TgtNodePtr)->Pins)
		{
			if (Pin && Pin->PinName == *TgtPin)
			{
				// For input pins, prefer EGPD_Input direction
				if (Pin->Direction == EGPD_Input)
				{
					TgtPinPtr = Pin;
					break;
				}
				if (!TgtPinPtr) TgtPinPtr = Pin; // fallback
			}
		}
		if (!TgtPinPtr)
		{
			Errors.Add(FString::Printf(TEXT("Target pin '%s' not found on '%s'"), *TgtPin, *TgtNode));
			continue;
		}

		// Try to connect
		if (Schema->TryCreateConnection(SrcPinPtr, TgtPinPtr))
		{
			Connected++;
			UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Connected %s.%s -> %s.%s"), *SrcNode, *SrcPin, *TgtNode, *TgtPin);
		}
		else
		{
			Errors.Add(FString::Printf(TEXT("TryCreateConnection failed: %s.%s -> %s.%s"), *SrcNode, *SrcPin, *TgtNode, *TgtPin));
		}
	}

	// Compile and save if any connections were made
	if (Connected > 0)
	{
		FBlueprintEditorUtils::MarkBlueprintAsModified(BP);
		FKismetEditorUtilities::CompileBlueprint(BP);
		UEditorAssetLibrary::SaveAsset(AssetPath, false);
	}

	// Build result JSON
	FString ErrorsJson = TEXT("[");
	for (int32 i = 0; i < Errors.Num(); i++)
	{
		FString Escaped = Errors[i].Replace(TEXT("\""), TEXT("\\\""));
		if (i > 0) ErrorsJson += TEXT(",");
		ErrorsJson += FString::Printf(TEXT("\"%s\""), *Escaped);
	}
	ErrorsJson += TEXT("]");

	bool bSuccess = Connected > 0 && Errors.Num() == 0;
	return FString::Printf(
		TEXT("{\"ok\":true,\"result\":{\"success\":%s,\"connected\":%d,\"errors\":%s}}"),
		bSuccess ? TEXT("true") : TEXT("false"),
		Connected,
		*ErrorsJson
	);
}

FString FMyikaBridgeServer::HandleSetPinDefault(const FString& ArgsJson)
{
	// Parse args
	TSharedPtr<FJsonObject> Args;
	TSharedRef<TJsonReader<>> ArgsReader = TJsonReaderFactory<>::Create(ArgsJson);
	if (!FJsonSerializer::Deserialize(ArgsReader, Args) || !Args.IsValid())
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"Failed to parse args JSON\"}}");
	}

	FString AssetPath = Args->GetStringField(TEXT("asset_path"));
	FString GraphName = Args->GetStringField(TEXT("graph_name"));
	FString NodeName = Args->GetStringField(TEXT("node_name"));
	FString PinName = Args->GetStringField(TEXT("pin_name"));
	FString DefaultValue = Args->GetStringField(TEXT("default_value"));

	if (AssetPath.IsEmpty() || GraphName.IsEmpty() || NodeName.IsEmpty() || PinName.IsEmpty())
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"Missing required args: asset_path, graph_name, node_name, pin_name\"}}");
	}

	// Load Blueprint
	UObject* Asset = UEditorAssetLibrary::LoadAsset(AssetPath);
	UBlueprint* BP = Asset ? Cast<UBlueprint>(Asset) : nullptr;
	if (!BP)
	{
		FString Err = FString::Printf(TEXT("Blueprint not found: %s"), *AssetPath);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"%s\"}}"), *Err);
	}

	// Find graph
	UEdGraph* TargetGraph = nullptr;
	for (UEdGraph* Graph : BP->UbergraphPages)
	{
		if (Graph && Graph->GetName() == GraphName) { TargetGraph = Graph; break; }
	}
	if (!TargetGraph)
	{
		for (UEdGraph* Graph : BP->FunctionGraphs)
		{
			if (Graph && Graph->GetName() == GraphName) { TargetGraph = Graph; break; }
		}
	}
	if (!TargetGraph)
	{
		FString Err = FString::Printf(TEXT("Graph '%s' not found in Blueprint '%s'"), *GraphName, *AssetPath);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"%s\"}}"), *Err);
	}

	// Find node by name
	UEdGraphNode* TargetNode = nullptr;
	for (UEdGraphNode* Node : TargetGraph->Nodes)
	{
		if (Node && Node->GetName() == NodeName)
		{
			TargetNode = Node;
			break;
		}
	}
	if (!TargetNode)
	{
		FString Err = FString::Printf(TEXT("Node '%s' not found in graph '%s'"), *NodeName, *GraphName);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"%s\"}}"), *Err);
	}

	// Find pin by name
	UEdGraphPin* TargetPin = nullptr;
	for (UEdGraphPin* Pin : TargetNode->Pins)
	{
		if (Pin && Pin->PinName == *PinName)
		{
			TargetPin = Pin;
			break;
		}
	}
	if (!TargetPin)
	{
		FString Err = FString::Printf(TEXT("Pin '%s' not found on node '%s' in graph '%s'"), *PinName, *NodeName, *GraphName);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"%s\"}}"), *Err);
	}

	// Capture previous value
	FString PreviousValue = TargetPin->DefaultValue;

	// Set the new default value
	TargetPin->DefaultValue = DefaultValue;

	// Mark BP dirty, compile, save
	FBlueprintEditorUtils::MarkBlueprintAsModified(BP);
	FKismetEditorUtilities::CompileBlueprint(BP);
	UEditorAssetLibrary::SaveAsset(AssetPath, false);

	FString EscPrev = PreviousValue.Replace(TEXT("\""), TEXT("\\\""));
	FString EscSet = DefaultValue.Replace(TEXT("\""), TEXT("\\\""));

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] set_pin_default: %s.%s.%s.%s = '%s' (was '%s')"),
		*AssetPath, *GraphName, *NodeName, *PinName, *DefaultValue, *PreviousValue);

	return FString::Printf(
		TEXT("{\"ok\":true,\"result\":{\"success\":true,\"set_value\":\"%s\",\"previous_value\":\"%s\"}}"),
		*EscSet, *EscPrev
	);
}

FString FMyikaBridgeServer::HandleAddTimelineTrack(const FString& ArgsJson)
{
	// Parse args
	TSharedPtr<FJsonObject> Args;
	TSharedRef<TJsonReader<>> ArgsReader = TJsonReaderFactory<>::Create(ArgsJson);
	if (!FJsonSerializer::Deserialize(ArgsReader, Args) || !Args.IsValid())
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"Failed to parse args JSON\"}}");
	}

	FString AssetPath = Args->GetStringField(TEXT("asset_path"));
	FString TimelineNodeName = Args->GetStringField(TEXT("timeline_node_name"));
	FString TrackName = Args->GetStringField(TEXT("track_name"));
	FString TrackType = Args->GetStringField(TEXT("track_type"));

	if (AssetPath.IsEmpty() || TimelineNodeName.IsEmpty() || TrackName.IsEmpty() || TrackType.IsEmpty())
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"Missing required args: asset_path, timeline_node_name, track_name, track_type\"}}");
	}

	if (TrackType != TEXT("float") && TrackType != TEXT("vector"))
	{
		return TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"track_type must be 'float' or 'vector'\"}}");
	}

	// Load Blueprint
	UObject* Asset = UEditorAssetLibrary::LoadAsset(AssetPath);
	UBlueprint* BP = Asset ? Cast<UBlueprint>(Asset) : nullptr;
	if (!BP)
	{
		FString Err = FString::Printf(TEXT("Blueprint not found: %s"), *AssetPath);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"%s\"}}"), *Err);
	}

	// Find the K2Node_Timeline by name across all graphs
	UK2Node_Timeline* TimelineNode = nullptr;
	for (UEdGraph* Graph : BP->UbergraphPages)
	{
		if (!Graph) continue;
		for (UEdGraphNode* Node : Graph->Nodes)
		{
			UK2Node_Timeline* TLNode = Cast<UK2Node_Timeline>(Node);
			if (TLNode && TLNode->GetName() == TimelineNodeName)
			{
				TimelineNode = TLNode;
				break;
			}
		}
		if (TimelineNode) break;
	}

	if (!TimelineNode)
	{
		FString Err = FString::Printf(TEXT("Timeline node '%s' not found in Blueprint '%s'"), *TimelineNodeName, *AssetPath);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"%s\"}}"), *Err);
	}

	// Get or verify the UTimelineTemplate
	UTimelineTemplate* TimelineTemplate = BP->FindTimelineTemplateByVariableName(TimelineNode->TimelineName);
	if (!TimelineTemplate)
	{
		FString Err = FString::Printf(TEXT("UTimelineTemplate not found for timeline '%s'"), *TimelineNodeName);
		Err = Err.Replace(TEXT("\""), TEXT("\\\""));
		return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"%s\"}}"), *Err);
	}

	// Check if track name already exists
	FName TrackFName(*TrackName);
	if (TrackType == TEXT("float"))
	{
		for (const FTTFloatTrack& Track : TimelineTemplate->FloatTracks)
		{
			if (Track.GetTrackName() == TrackFName)
			{
				FString Err = FString::Printf(TEXT("Float track '%s' already exists on timeline '%s'"), *TrackName, *TimelineNodeName);
				Err = Err.Replace(TEXT("\""), TEXT("\\\""));
				return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"%s\"}}"), *Err);
			}
		}
	}
	else // vector
	{
		for (const FTTVectorTrack& Track : TimelineTemplate->VectorTracks)
		{
			if (Track.GetTrackName() == TrackFName)
			{
				FString Err = FString::Printf(TEXT("Vector track '%s' already exists on timeline '%s'"), *TrackName, *TimelineNodeName);
				Err = Err.Replace(TEXT("\""), TEXT("\\\""));
				return FString::Printf(TEXT("{\"ok\":true,\"result\":{\"success\":false,\"error\":\"%s\"}}"), *Err);
			}
		}
	}

	// Parse keyframes array
	const TArray<TSharedPtr<FJsonValue>>* KeyframesArray = nullptr;
	Args->TryGetArrayField(TEXT("keyframes"), KeyframesArray);

	// Sort keyframes by time (don't error on unordered)
	struct FKeyframe { float Time; float Value; FVector VecValue; };
	TArray<FKeyframe> Keyframes;
	if (KeyframesArray)
	{
		for (const TSharedPtr<FJsonValue>& KfVal : *KeyframesArray)
		{
			const TSharedPtr<FJsonObject>* KfObj = nullptr;
			if (KfVal.IsValid() && KfVal->TryGetObject(KfObj) && KfObj && (*KfObj).IsValid())
			{
				FKeyframe Kf;
				Kf.Time = static_cast<float>((*KfObj)->GetNumberField(TEXT("time")));
				if (TrackType == TEXT("float"))
				{
					Kf.Value = static_cast<float>((*KfObj)->GetNumberField(TEXT("value")));
				}
				else
				{
					// Vector: expect value as {x, y, z} or as a single number applied to all axes
					const TSharedPtr<FJsonObject>* VecObj = nullptr;
					if ((*KfObj)->TryGetObjectField(TEXT("value"), VecObj))
					{
						Kf.VecValue.X = static_cast<float>((*VecObj)->GetNumberField(TEXT("x")));
						Kf.VecValue.Y = static_cast<float>((*VecObj)->GetNumberField(TEXT("y")));
						Kf.VecValue.Z = static_cast<float>((*VecObj)->GetNumberField(TEXT("z")));
					}
					else
					{
						float V = static_cast<float>((*KfObj)->GetNumberField(TEXT("value")));
						Kf.VecValue = FVector(V, V, V);
					}
				}
				Keyframes.Add(Kf);
			}
		}
	}

	// Sort by time
	Keyframes.Sort([](const FKeyframe& A, const FKeyframe& B) { return A.Time < B.Time; });

	FString OutputPinName;

	if (TrackType == TEXT("float"))
	{
		// Create an internal curve for the float track
		FTTFloatTrack NewTrack;
		NewTrack.SetTrackName(TrackFName, TimelineTemplate);

		// Create the curve as an internal object on the TimelineTemplate
		UCurveFloat* NewCurve = NewObject<UCurveFloat>(TimelineTemplate, *TrackName);
		FRichCurve& RichCurve = NewCurve->FloatCurve;
		for (const FKeyframe& Kf : Keyframes)
		{
			RichCurve.AddKey(Kf.Time, Kf.Value);
		}
		NewTrack.CurveFloat = NewCurve;

		TimelineTemplate->FloatTracks.Add(NewTrack);
		OutputPinName = TrackName;
	}
	else // vector
	{
		FTTVectorTrack NewTrack;
		NewTrack.SetTrackName(TrackFName, TimelineTemplate);

		UCurveVector* NewCurve = NewObject<UCurveVector>(TimelineTemplate, *TrackName);
		for (const FKeyframe& Kf : Keyframes)
		{
			NewCurve->FloatCurves[0].AddKey(Kf.Time, Kf.VecValue.X);
			NewCurve->FloatCurves[1].AddKey(Kf.Time, Kf.VecValue.Y);
			NewCurve->FloatCurves[2].AddKey(Kf.Time, Kf.VecValue.Z);
		}
		NewTrack.CurveVector = NewCurve;

		TimelineTemplate->VectorTracks.Add(NewTrack);
		OutputPinName = TrackName;
	}

	// Reconstruct the timeline node to regenerate output pins
	TimelineNode->ReconstructNode();

	// Mark BP dirty, compile, save
	FBlueprintEditorUtils::MarkBlueprintAsModified(BP);
	FKismetEditorUtilities::CompileBlueprint(BP);
	UEditorAssetLibrary::SaveAsset(AssetPath, false);

	FString EscTrack = TrackName.Replace(TEXT("\""), TEXT("\\\""));
	FString EscPin = OutputPinName.Replace(TEXT("\""), TEXT("\\\""));

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] add_timeline_track: Added %s track '%s' to timeline '%s' in '%s'"),
		*TrackType, *TrackName, *TimelineNodeName, *AssetPath);

	return FString::Printf(
		TEXT("{\"ok\":true,\"result\":{\"success\":true,\"track_added\":\"%s\",\"output_pin_added\":\"%s\"}}"),
		*EscTrack, *EscPin
	);
}

FString FMyikaBridgeServer::DispatchToolRequest(const FString& ToolName, const FString& ArgsJson)
{
	// C++ tool handlers — bypass Python for direct editor API access
	if (ToolName == TEXT("paste_bp_nodes"))
	{
		return HandlePasteBpNodes(ArgsJson);
	}

	if (ToolName == TEXT("connect_pins"))
	{
		return HandleConnectPins(ArgsJson);
	}

	if (ToolName == TEXT("set_pin_default"))
	{
		return HandleSetPinDefault(ArgsJson);
	}

	if (ToolName == TEXT("add_timeline_track"))
	{
		return HandleAddTimelineTrack(ArgsJson);
	}

	// Build the payload JSON that dispatch_json expects
	FString PayloadJson = FString::Printf(TEXT("{\"tool\":\"%s\",\"args\":%s}"), *ToolName, *ArgsJson);

	// Check Python subsystem availability
	IPythonScriptPlugin* PythonPlugin = IPythonScriptPlugin::Get();
	if (!PythonPlugin || !PythonPlugin->IsPythonAvailable())
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Python subsystem not available."));
		return TEXT("{\"ok\":false,\"error\":{\"code\":\"INTERNAL_ERROR\",\"message\":\"Python subsystem not available\"}}");
	}

	// Use a temp file to pass the result, avoiding escaping issues with
	// EvaluateStatement when results contain newlines, quotes, backslashes
	// (e.g. file content from read_file).
	FString TempDir = FPaths::ProjectSavedDir() / TEXT("Myika");
	IFileManager::Get().MakeDirectory(*TempDir, true);
	FString TempPath = TempDir / TEXT("_dispatch_result.json");

	// Convert to forward slashes for Python on Windows
	FString TempPathPy = TempPath.Replace(TEXT("\\"), TEXT("/"));

	// Escape the payload for embedding in a Python string literal
	FString Escaped = PayloadJson;
	Escaped = Escaped.Replace(TEXT("\\"), TEXT("\\\\"));
	Escaped = Escaped.Replace(TEXT("'"), TEXT("\\'"));
	Escaped = Escaped.Replace(TEXT("\n"), TEXT("\\n"));
	Escaped = Escaped.Replace(TEXT("\r"), TEXT(""));

	// Write result to temp file instead of returning through EvaluateStatement
	FString PythonCode = FString::Printf(
		TEXT("open('%s', 'w', encoding='utf-8').write(myika.dispatcher.dispatch_json('%s'))"),
		*TempPathPy,
		*Escaped
	);

	FPythonCommandEx PythonCmd;
	PythonCmd.Command = PythonCode;
	PythonCmd.ExecutionMode = EPythonCommandExecutionMode::EvaluateStatement;
	PythonCmd.FileExecutionScope = EPythonFileExecutionScope::Public;

	bool bSuccess = PythonPlugin->ExecPythonCommandEx(PythonCmd);

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

	// Read result from temp file
	FString Result;
	if (!FFileHelper::LoadFileToString(Result, *TempPath))
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to read dispatch result from %s"), *TempPath);
		return TEXT("{\"ok\":false,\"error\":{\"code\":\"INTERNAL_ERROR\",\"message\":\"Failed to read dispatch result file\"}}");
	}

	// Clean up temp file
	IFileManager::Get().Delete(*TempPath);

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Tool '%s' result length: %d bytes"), *ToolName, Result.Len());

	// Validate JSON before returning
	TSharedPtr<FJsonObject> TestParse;
	TSharedRef<TJsonReader<>> TestReader = TJsonReaderFactory<>::Create(Result);
	if (!FJsonSerializer::Deserialize(TestReader, TestParse) || !TestParse.IsValid())
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Python returned invalid JSON (first 500 chars): %.500s"), *Result);
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

	// Extract Sec-WebSocket-Key and X-Myika-Token headers
	FString WebSocketKey;
	FString PresentedToken;
	TArray<FString> Lines;
	Request.ParseIntoArrayLines(Lines);
	for (const FString& Line : Lines)
	{
		FString Trimmed = Line.TrimStartAndEnd();
		if (Trimmed.StartsWith(TEXT("Sec-WebSocket-Key:"), ESearchCase::IgnoreCase))
		{
			WebSocketKey = Trimmed.Mid(18).TrimStartAndEnd();
		}
		else if (Trimmed.StartsWith(TEXT("X-Myika-Token:"), ESearchCase::IgnoreCase))
		{
			PresentedToken = Trimmed.Mid(14).TrimStartAndEnd();
		}
	}

	if (WebSocketKey.IsEmpty())
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] No Sec-WebSocket-Key found in handshake request."));
		return false;
	}

	// Validate the shared-secret token before doing any further protocol work.
	// Plain != is fine here: this is local IPC, not a network attacker, so a
	// timing side channel against another process running as the same user is
	// not part of our threat model.
	if (PresentedToken != AuthToken)
	{
		const FString Resp = TEXT("HTTP/1.1 401 Unauthorized\r\n\r\n");
		FTCHARToUTF8 RespUtf8(*Resp);
		SocketSend(Socket, (const uint8*)RespUtf8.Get(), RespUtf8.Length());
		UE_LOG(LogMyikaBridge, Warning, TEXT("[Myika] Rejected handshake: bad/missing X-Myika-Token."));
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

// ============================================================================
// Auth Token
// ============================================================================

FString FMyikaBridgeServer::LoadOrCreateAuthToken()
{
	const FString LocalAppData = FPlatformMisc::GetEnvironmentVariable(TEXT("LOCALAPPDATA"));
	if (LocalAppData.IsEmpty())
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] LOCALAPPDATA env var is empty; cannot locate token file."));
		return FString();
	}

	const FString TokenDir = FPaths::Combine(LocalAppData, TEXT("Myika"));
	const FString TokenPath = FPaths::Combine(TokenDir, TEXT("bridge-token"));

	IFileManager& FileMgr = IFileManager::Get();

	if (FileMgr.FileExists(*TokenPath))
	{
		FString Existing;
		if (!FFileHelper::LoadFileToString(Existing, *TokenPath))
		{
			UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Token file exists but failed to read: %s"), *TokenPath);
			return FString();
		}
		Existing = Existing.TrimStartAndEnd();
		if (Existing.IsEmpty())
		{
			UE_LOG(LogMyikaBridge, Warning, TEXT("[Myika] Token file is empty, regenerating: %s"), *TokenPath);
		}
		else
		{
			UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Loaded existing auth token from %s"), *TokenPath);
			return Existing;
		}
	}

	if (!FileMgr.DirectoryExists(*TokenDir) && !FileMgr.MakeDirectory(*TokenDir, true))
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to create token directory: %s"), *TokenDir);
		return FString();
	}

	// 256 bits of entropy: two GUIDs concatenated as 64 hex chars.
	const FString NewToken =
		FGuid::NewGuid().ToString(EGuidFormats::Digits) +
		FGuid::NewGuid().ToString(EGuidFormats::Digits);

	if (!FFileHelper::SaveStringToFile(NewToken, *TokenPath, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM))
	{
		UE_LOG(LogMyikaBridge, Error, TEXT("[Myika] Failed to write new auth token to %s"), *TokenPath);
		return FString();
	}

	UE_LOG(LogMyikaBridge, Log, TEXT("[Myika] Generated new auth token at %s"), *TokenPath);
	return NewToken;
}
