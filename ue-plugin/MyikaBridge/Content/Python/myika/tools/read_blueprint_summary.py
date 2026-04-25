"""Return a structured summary of a Blueprint asset."""

TOOL_NAME = "read_blueprint_summary"


def handle(args: dict) -> dict:
    import unreal

    asset_path = args["asset_path"]
    asset = unreal.EditorAssetLibrary.load_asset(asset_path)
    if asset is None:
        raise ValueError(f"Asset not found: {asset_path}")

    bp = unreal.EditorAssetLibrary.load_blueprint_class(asset_path) if hasattr(unreal.EditorAssetLibrary, 'load_blueprint_class') else None

    result = {
        "name": asset.get_name(),
        "parent_class": "",
        "components": [],
        "variables": [],
        "functions": [],
        "events": [],
        "warnings": [],
    }

    try:
        bp_gc = unreal.Engine.get_engine_subsystem(unreal.AssetEditorSubsystem) if False else None
        generated_class = asset.generated_class() if hasattr(asset, 'generated_class') else None

        if generated_class:
            parent = generated_class.get_super_class()
            result["parent_class"] = parent.get_name() if parent else "Unknown"

        cdo = generated_class.get_default_object() if generated_class else None
        if cdo:
            components = cdo.get_components_by_class(unreal.ActorComponent)
            for comp in components:
                result["components"].append({
                    "name": comp.get_name(),
                    "class": comp.get_class().get_name(),
                })
    except Exception as e:
        result["warnings"].append(f"Partial parse: {str(e)}")

    return result
