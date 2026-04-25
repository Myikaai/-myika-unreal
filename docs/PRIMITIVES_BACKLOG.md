# Primitives Backlog

Gaps discovered during demo development that should become first-class tools or components in V1. Every entry here came from a real "the agent had to do something hacky" moment. By Day 14, this is the prioritized V1 tool list driven by actual gaps.

## Missing Tools

### `create_asset`

- **Purpose**: First-class tool for creating UAssets of arbitrary class types (Input Actions, Materials, Data Tables, etc.) without falling back to `run_python`
- **Why it's better than run_python**: Typed args, validation, error handling, asset-specific param schemas. The agent doesn't need to guess factory class names or property paths.
- **Why it's V1, not demo**: `run_python` via the agent works for now; `create_asset` is the cleaner long-term API
- **Schema sketch**:
  ```json
  {
    "class_name": "string",
    "asset_name": "string",
    "package_path": "string",
    "properties": "object"
  }
  ```
- **Discovered**: Day 9 -- Task 4 required programmatic creation of InputAction and InputMappingContext assets. Agent can do it via `run_python` + `AssetToolsHelpers.get_asset_tools().create_asset()`, but the factory class names, property paths, and key binding API are non-obvious and fragile.

---

*Add new entries below as gaps surface during development.*
