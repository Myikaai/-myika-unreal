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

    # --- Parent class ---
    # Read via AssetRegistry tag. UBlueprint::ParentClass is marked `protected` in C++, so
    # bp.get_editor_property("ParentClass") raises; UBlueprint Python wrapper does not expose
    # parent_class as an attribute; BlueprintGeneratedClass Python wrapper has no
    # get_super_class(). The AssetRegistry "ParentClass" tag is the reliable path
    # (also used by the editor's class-picker UI).
    try:
        ar = unreal.AssetRegistryHelpers.get_asset_registry()
        object_path = asset_path + "." + asset_path.rsplit("/", 1)[-1]
        asset_data = ar.get_asset_by_object_path(object_path)
        tag_val = asset_data.get_tag_value("ParentClass") if asset_data is not None else None
        # Tag format: "/Script/CoreUObject.Class'/Script/Engine.Actor'"
        # We want just the trailing class name ("Actor").
        if tag_val:
            inner = tag_val.split("'", 2)[1] if "'" in tag_val else tag_val
            result["parent_class"] = inner.rsplit(".", 1)[-1]
        else:
            result["warnings"].append("AssetRegistry ParentClass tag missing or empty")
    except Exception as e:
        result["warnings"].append(f"AssetRegistry parent_class lookup raised: {e}")

    # --- Components ---
    # Walk SubobjectData (the same path the agent uses to add components).
    # Previous impl called cdo.get_components_by_class, which only sees native UPROPERTY
    # default components on the parent class — SCS-added templates are invisible to the CDO.
    try:
        ss = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
        handles = ss.k2_gather_subobject_data_for_blueprint(bp)
        for h in handles:
            data = ss.k2_find_subobject_data_from_handle(h)
            if data is None:
                continue
            obj = unreal.SubobjectDataBlueprintFunctionLibrary.get_object(data, False)
            if obj is None or not isinstance(obj, unreal.ActorComponent):
                continue
            result["components"].append({
                "name": obj.get_name(),
                "class": obj.get_class().get_name(),
            })
    except Exception as e:
        result["warnings"].append(f"Could not enumerate components: {e}")

    cdo = unreal.get_default_object(gc)
    if cdo is None:
        result["warnings"].append("Could not get class default object")
        return result

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
