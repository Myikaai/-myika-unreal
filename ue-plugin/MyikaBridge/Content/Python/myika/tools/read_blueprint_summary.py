"""Return a structured summary of a Blueprint asset."""

TOOL_NAME = "read_blueprint_summary"


def handle(args: dict) -> dict:
    import unreal

    asset_path = args["asset_path"]
    bp = unreal.EditorAssetLibrary.load_asset(asset_path)
    if bp is None:
        raise ValueError(f"Asset not found: {asset_path}")

    result = {
        "name": bp.get_name(),
        "parent_class": None,
        "components": [],
        "variables": [],
        "functions": [],
        "events": [],
        "warnings": [],
    }

    gc = bp.generated_class() if hasattr(bp, "generated_class") else None
    if gc is None:
        result["warnings"].append("No generated class found — asset may not be a Blueprint")
        return result

    cdo = unreal.get_default_object(gc)
    if cdo is None:
        result["warnings"].append("Could not get class default object")
        return result

    # --- Parent class ---
    try:
        parent_type = type(cdo).__bases__[0] if type(cdo).__bases__ else None
        if parent_type:
            result["parent_class"] = parent_type.__name__
    except Exception as e:
        result["warnings"].append(f"Could not determine parent class: {e}")

    # --- Components ---
    try:
        comps = cdo.get_components_by_class(unreal.ActorComponent)
        for comp in comps:
            result["components"].append({
                "name": comp.get_name(),
                "class": comp.get_class().get_name(),
            })
    except Exception as e:
        result["warnings"].append(f"Could not enumerate components: {e}")

    # --- Variables & Functions ---
    # BP-defined attrs = attrs on CDO that aren't on the native parent class
    try:
        parent_type = type(cdo).__bases__[0] if type(cdo).__bases__ else None
        if parent_type:
            parent_attrs = set(dir(parent_type))
            unique_attrs = sorted(set(dir(cdo)) - parent_attrs)
            for attr_name in unique_attrs:
                try:
                    val = getattr(cdo, attr_name, None)
                    if callable(val):
                        result["functions"].append(attr_name)
                    else:
                        var_info = {
                            "name": attr_name,
                            "type": type(val).__name__,
                        }
                        result["variables"].append(var_info)
                except Exception:
                    pass
        else:
            result["warnings"].append("No parent type found for variable/function diff")
    except Exception as e:
        result["warnings"].append(f"Could not enumerate variables/functions: {e}")

    # --- Events (from EventGraph) ---
    try:
        eg = unreal.BlueprintEditorLibrary.find_event_graph(bp)
        if eg:
            result["events"].append(eg.get_name())
    except Exception as e:
        result["warnings"].append(f"Could not read event graph: {e}")

    return result
