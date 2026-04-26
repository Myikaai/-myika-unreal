#!/usr/bin/env node
/**
 * MCP Bridge Server - stdio transport
 * Exposes UE tools to Claude Code CLI via MCP protocol.
 * Routes tool calls to the Myika desktop app's tool proxy (TCP localhost:17646).
 */
import { createConnection } from 'net';
import { createInterface } from 'readline';

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 17646;

// Tool definitions matching SPEC.md §7
const TOOLS = [
  {
    name: 'propose_plan',
    description: 'Propose a multi-step plan for user approval before executing. MUST be called before any request needing more than 2 tool calls or any write_file call.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what the plan will accomplish' },
        steps: { type: 'array', items: { type: 'string' }, description: 'Ordered list of steps to execute' }
      },
      required: ['summary', 'steps']
    }
  },
  {
    name: 'list_assets',
    description: 'List UAssets in the Unreal Engine project, optionally filtered by path prefix and/or class name.',
    inputSchema: {
      type: 'object',
      properties: {
        path_filter: { type: 'string', description: 'Optional /Game/... path prefix. Defaults to all assets.', default: '/Game' },
        class_filter: { type: 'string', description: "Optional UClass name (e.g. 'Blueprint', 'Material'). Defaults to all classes." },
        limit: { type: 'integer', description: 'Max assets to return.', default: 200, maximum: 1000 }
      }
    }
  },
  {
    name: 'read_file',
    description: 'Read a text file from the UE project. Refuses binary/UAsset files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: "Project-relative path, e.g. 'Source/MyProject/MyClass.cpp'" }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a text file in the UE project. Auto-creates git checkpoint before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project-relative path' },
        content: { type: 'string', description: 'File content to write' },
        create_dirs: { type: 'boolean', description: 'Create parent directories if needed', default: true }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'run_python',
    description: "Execute arbitrary Python code in the Unreal Editor. Has access to the 'unreal' module for editor automation.",
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: "Python source code. Has access to 'unreal' module." },
        capture_output: { type: 'boolean', description: 'Capture stdout/stderr', default: true }
      },
      required: ['code']
    }
  },
  {
    name: 'get_compile_errors',
    description: 'Return current Blueprint and C++ compile errors from the Unreal Editor.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'read_blueprint_summary',
    description: 'Return a structured summary of a Blueprint asset — components, variables, functions, and events.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "e.g. '/Game/BP_Door'" }
      },
      required: ['asset_path']
    }
  },
  {
    name: 'paste_bp_nodes',
    description: 'Paste Blueprint graph nodes from T3D text into a Blueprint graph. Uses FEdGraphUtilities::ImportNodesFromText internally.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Blueprint asset path, e.g. '/Game/Blueprints/BP_Door'" },
        graph_name: { type: 'string', description: "Target graph name: 'EventGraph', 'ConstructionScript', or a function name" },
        t3d_text: { type: 'string', description: 'T3D text containing Begin Object/End Object node definitions' }
      },
      required: ['asset_path', 'graph_name', 't3d_text']
    }
  },
  {
    name: 'connect_pins',
    description: 'Connect Blueprint graph pins by node name and pin name. Supports batch connections — compiles and saves once after all wires are made.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Blueprint asset path, e.g. '/Game/Blueprints/BP_Door'" },
        graph_name: { type: 'string', description: "Target graph name: 'EventGraph', 'ConstructionScript', or a function name" },
        connections: {
          type: 'array',
          description: 'Array of connections to make',
          items: {
            type: 'object',
            properties: {
              source_node: { type: 'string', description: "Source node name, e.g. 'K2Node_CustomEvent_0'" },
              source_pin: { type: 'string', description: "Source pin name, e.g. 'then'" },
              target_node: { type: 'string', description: "Target node name, e.g. 'K2Node_Timeline_0'" },
              target_pin: { type: 'string', description: "Target pin name, e.g. 'Play'" }
            },
            required: ['source_node', 'source_pin', 'target_node', 'target_pin']
          }
        }
      },
      required: ['asset_path', 'graph_name', 'connections']
    }
  },
  {
    name: 'set_pin_default',
    description: 'Set a pin\'s default value on a Blueprint graph node by node name and pin name. Needed because ReconstructNode clobbers DefaultValue from T3D during paste.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Blueprint asset path, e.g. '/Game/Blueprints/BP_Door'" },
        graph_name: { type: 'string', description: "Target graph name: 'EventGraph', 'ConstructionScript', or a function name" },
        node_name: { type: 'string', description: "Node name, e.g. 'K2Node_CallFunction_0'" },
        pin_name: { type: 'string', description: "Pin name, e.g. 'InString' or 'B'" },
        default_value: { type: 'string', description: "Default value string, e.g. '0, 90, 0' for a rotator" }
      },
      required: ['asset_path', 'graph_name', 'node_name', 'pin_name', 'default_value']
    }
  },
  {
    name: 'create_timeline',
    description: 'Create a working K2Node_Timeline in a Blueprint graph. This is the only reliable way to make a timeline - paste_bp_nodes does NOT create a backing UTimelineTemplate, leaving the K2Node unable to receive track output pins. Use this BEFORE add_timeline_track. Returns the created node_name and final timeline_name (may have a numeric suffix if there was a naming collision).',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Blueprint asset path, e.g. '/Game/Blueprints/BP_PulsingLight'" },
        graph_name: { type: 'string', description: "Target graph name: usually 'EventGraph'" },
        timeline_name: { type: 'string', description: "Desired variable name for the timeline, e.g. 'PulseTimeline'. Will be made unique if it conflicts." },
        auto_play: { type: 'boolean', description: 'If true, the timeline plays as soon as the actor is created.', default: false },
        loop: { type: 'boolean', description: 'If true, the timeline loops when it reaches the end.', default: true },
        node_pos_x: { type: 'number', description: 'X coordinate of the node in the graph editor.', default: 0 },
        node_pos_y: { type: 'number', description: 'Y coordinate of the node in the graph editor.', default: 0 }
      },
      required: ['asset_path', 'graph_name', 'timeline_name']
    }
  },
  {
    name: 'create_material',
    description: 'Create a new UMaterial asset. Use this BEFORE add_material_expression / connect_material_expressions / connect_material_property when building shaders. Reach for materials when the request is a pure visual effect (blinking neon, pulsing emissive, animated UVs); use a Blueprint+Timeline instead when the effect is gameplay-driven.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Material asset path under /Game/, e.g. '/Game/Materials/M_BlinkingNeon'" },
        overwrite: { type: 'boolean', description: 'If true, delete an existing asset at this path before creating. Default false (returns existing).', default: false }
      },
      required: ['asset_path']
    }
  },
  {
    name: 'add_material_expression',
    description: 'Add an expression node (Time, Multiply, Frac, Round, ScalarParameter, VectorParameter, Constant, etc.) to a Material. Returns the auto-named node so you can reference it in connect_material_expressions calls. For ScalarParameter/VectorParameter, supply parameter_name + default_scalar/default_vector to expose runtime parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Material asset path, e.g. '/Game/Materials/M_BlinkingNeon'" },
        expression_type: { type: 'string', description: "Short name like 'Time', 'Multiply', 'Frac', 'Round', 'ScalarParameter', 'VectorParameter', 'Constant', 'TextureSample', 'Lerp'. Or full UE class name like 'MaterialExpressionMultiply'." },
        node_pos_x: { type: 'number', description: 'X position in the material editor canvas.', default: 0 },
        node_pos_y: { type: 'number', description: 'Y position in the material editor canvas.', default: 0 },
        parameter_name: { type: 'string', description: "For ScalarParameter/VectorParameter: the runtime parameter name (e.g. 'BlinkSpeed', 'Color')." },
        default_scalar: { type: 'number', description: 'Default value for ScalarParameter or Constant.' },
        default_vector: { type: 'object', description: 'Default value for VectorParameter, as {r, g, b, a}.', properties: { r: {type:'number'}, g: {type:'number'}, b: {type:'number'}, a: {type:'number'} } }
      },
      required: ['asset_path', 'expression_type']
    }
  },
  {
    name: 'connect_material_expressions',
    description: 'Wire one material-expression node\'s output to another\'s input. Use empty string for from_pin to use the default output (most expressions have only one). Common to_pin names: A, B (Multiply/Add/Subtract), Alpha (Lerp), X (Frac/Round/Sin/Cos).',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Material asset path" },
        from_node: { type: 'string', description: "Source expression node name returned by add_material_expression, e.g. 'MaterialExpressionTime_0'" },
        from_pin: { type: 'string', description: "Source output name, or empty string for the default output.", default: '' },
        to_node: { type: 'string', description: "Target expression node name" },
        to_pin: { type: 'string', description: "Target input name, e.g. 'A', 'B', 'Alpha'" }
      },
      required: ['asset_path', 'from_node', 'to_node', 'to_pin']
    }
  },
  {
    name: 'connect_material_property',
    description: 'Wire a material-expression node\'s output to a final material property (BaseColor, EmissiveColor, Metallic, Roughness, Normal, Opacity, etc.). Call this last to drive the actual material output channels.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Material asset path" },
        from_node: { type: 'string', description: "Source expression node name" },
        from_pin: { type: 'string', description: "Source output name, or empty string for default.", default: '' },
        property: { type: 'string', enum: ['BaseColor','EmissiveColor','Metallic','Roughness','Specular','Normal','Opacity','OpacityMask','WorldPositionOffset','AmbientOcclusion','Refraction','PixelDepthOffset','SubsurfaceColor'], description: 'Material property channel to drive.' }
      },
      required: ['asset_path', 'from_node', 'property']
    }
  },
  {
    name: 'list_node_pins',
    description: 'Return each node\'s pins (name, direction, category, default) for a Blueprint graph. Use after connect_pins or set_pin_default fails - the failure message lists pin names but list_node_pins gives full pin metadata. Optionally scoped to a single node_name. Cheaper than introspecting via run_python (which UE 5.7 does not expose for K2Node pins).',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Blueprint asset path, e.g. '/Game/Blueprints/BP_Door'" },
        graph_name: { type: 'string', description: "Target graph name: 'EventGraph', 'ConstructionScript', or a function name" },
        node_name: { type: 'string', description: "Optional - scope the result to a single node (e.g. 'K2Node_Timeline_PulseTimeline'). Omit to list all nodes in the graph." }
      },
      required: ['asset_path', 'graph_name']
    }
  },
  {
    name: 'add_timeline_track',
    description: 'Add a float or vector track with keyframes to a K2Node_Timeline in a Blueprint. NOTE: this only works on timeline nodes that have a backing UTimelineTemplate. paste_bp_nodes does NOT create one - if you pasted a K2Node_Timeline via T3D, you must call FBlueprintEditorUtils::AddNewTimeline via run_python first, or the track will fail with a clear error listing the available templates.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Blueprint asset path, e.g. '/Game/Blueprints/BP_Door'" },
        timeline_node_name: { type: 'string', description: "Timeline node name, e.g. 'K2Node_Timeline_0'" },
        track_name: { type: 'string', description: "Name for the new track, e.g. 'Rotation'" },
        track_type: { type: 'string', enum: ['float', 'vector'], description: "Track type: 'float' or 'vector'" },
        keyframes: {
          type: 'array',
          description: 'Keyframes for the track curve',
          items: {
            type: 'object',
            properties: {
              time: { type: 'number', description: 'Time in seconds' },
              value: { description: 'Float value for float tracks, or {x, y, z} object for vector tracks' }
            },
            required: ['time', 'value']
          }
        }
      },
      required: ['asset_path', 'timeline_node_name', 'track_name', 'track_type']
    }
  },
  {
    name: 'make_blinking_neon_material',
    description: 'High-level skill: build a complete "blinking neon" material in one call. Wraps the create_material / add_material_expression / connect_material_expressions / connect_material_property primitives into a single recipe. Produces a material that blinks at BlinkSpeed Hz with Color * Intensity emissive, with all three exposed as live-tweakable parameters. Use this when the user says "make a blinking light/neon/sign" and wants a visual effect (not gameplay-driven). For gameplay-driven pulse behavior tied to a PointLight component, use the Blueprint+Timeline path instead.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_path: { type: 'string', description: "Material asset path. Defaults to '/Game/Materials/M_BlinkingNeon'.", default: '/Game/Materials/M_BlinkingNeon' },
        overwrite: { type: 'boolean', description: 'If true (default), recreate the asset if it exists.', default: true },
        blink_speed: { type: 'number', description: 'Default blink rate (BlinkSpeed parameter). 5.0 = ~5Hz strobe.', default: 5.0 },
        intensity: { type: 'number', description: 'Default emissive multiplier (Intensity parameter).', default: 10.0 },
        color: {
          type: 'object',
          description: 'Default color (Color parameter) as RGBA 0..1.',
          properties: {
            r: { type: 'number' }, g: { type: 'number' },
            b: { type: 'number' }, a: { type: 'number' }
          }
        }
      }
    }
  }
];

// Send a tool call to the Myika tool proxy via TCP
function callToolProxy(tool, args) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(PROXY_PORT, PROXY_HOST, () => {
      const request = JSON.stringify({ tool, args }) + '\n';
      socket.write(request);
    });

    let data = '';
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('\n')) {
        socket.end();
        try {
          resolve(JSON.parse(data.trim()));
        } catch (e) {
          reject(new Error(`Invalid JSON from proxy: ${data}`));
        }
      }
    });

    socket.on('error', (err) => {
      reject(new Error(`Tool proxy connection failed: ${err.message}. Is the Myika desktop app running?`));
    });

    // run_python can take up to 30s (timeout) + git checkpoint can be slow
    socket.setTimeout(60000, () => {
      socket.destroy();
      reject(new Error('Tool proxy timeout (60s)'));
    });
  });
}

// MCP JSON-RPC handler
function handleRequest(request) {
  const { method, params, id } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'myika-bridge', version: '0.1.0' }
        }
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      };

    case 'tools/call':
      // Handled async
      return null;

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notifications don't get responses

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

async function handleToolCall(request) {
  const { params, id } = request;
  const toolName = params?.name;
  const args = params?.arguments || {};

  try {
    const result = await callToolProxy(toolName, args);

    if (result.ok === false) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error: ${result.error?.message || 'Unknown error'} (${result.error?.code || 'UNKNOWN'})` }],
          isError: true
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result.ok !== undefined ? result.result : result, null, 2) }]
      }
    };
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: `Tool proxy error: ${err.message}` }],
        isError: true
      }
    };
  }
}

// Main loop - read JSON-RPC from stdin, write to stdout
const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }

  let response;
  if (request.method === 'tools/call') {
    pendingOps++;
    response = await handleToolCall(request);
    pendingOps--;
  } else {
    response = handleRequest(request);
  }

  if (response) {
    process.stdout.write(JSON.stringify(response) + '\n');
  }
});

let pendingOps = 0;
rl.on('close', () => {
  // Wait for pending async operations before exiting
  const check = () => {
    if (pendingOps <= 0) process.exit(0);
    else setTimeout(check, 50);
  };
  check();
});
