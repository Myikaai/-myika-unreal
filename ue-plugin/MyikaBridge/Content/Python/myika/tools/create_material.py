"""Create a new UMaterial asset.

The agent should reach for materials when the request is about pure visual
effects (blinking neon, animated emissive, scrolling UVs). For gameplay-driven
behavior (door opens on E, light fades when player picks something up), use a
Blueprint with a Timeline instead - see create_timeline / add_timeline_track.
"""

TOOL_NAME = "create_material"


def handle(args: dict) -> dict:
    import unreal

    asset_path = args["asset_path"]            # e.g. "/Game/Materials/M_BlinkingNeon"
    overwrite = bool(args.get("overwrite", False))

    if "/" not in asset_path or not asset_path.startswith("/Game/"):
        raise ValueError(f"asset_path must start with /Game/, got: {asset_path!r}")

    package_path, asset_name = asset_path.rsplit("/", 1)

    # If exists, either delete (when overwrite=True) or return early.
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        if not overwrite:
            return {
                "success": True,
                "asset_path": asset_path,
                "created": False,
                "note": "asset already existed, returned existing (pass overwrite=true to recreate)",
            }
        unreal.EditorAssetLibrary.delete_asset(asset_path)

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.MaterialFactoryNew()
    material = asset_tools.create_asset(asset_name, package_path, unreal.Material, factory)
    if material is None:
        raise RuntimeError(f"create_asset returned None for {asset_path}")

    unreal.EditorAssetLibrary.save_asset(asset_path)

    return {
        "success": True,
        "asset_path": asset_path,
        "created": True,
    }
