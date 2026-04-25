"""List UAssets in the project."""

TOOL_NAME = "list_assets"


def handle(args: dict) -> dict:
    import unreal

    path_filter = args.get("path_filter", "/Game")
    class_filter = args.get("class_filter", None)
    limit = min(args.get("limit", 200), 1000)

    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    all_assets = registry.get_assets_by_path(path_filter, recursive=True)

    results = []
    for asset_data in all_assets:
        if class_filter and str(asset_data.asset_class_path.asset_name) != class_filter:
            continue
        results.append({
            "path": str(asset_data.package_name),
            "class": str(asset_data.asset_class_path.asset_name),
            "name": str(asset_data.asset_name),
        })
        if len(results) >= limit:
            break

    return {"assets": results, "truncated": len(results) >= limit}
