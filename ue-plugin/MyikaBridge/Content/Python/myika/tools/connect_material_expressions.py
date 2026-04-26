"""Wire one material-expression node's output to another's input.

Pin names: leave empty to use the default output (most expressions have one).
Common input names: 'A', 'B' (Multiply/Add), 'X' (Frac/Round), 'Alpha' (Lerp).
"""

TOOL_NAME = "connect_material_expressions"


def _find_expression(material, name: str):
    """Find a material expression by its UObject name. Material.expressions is
    protected from Python read, so we resolve via sub-object path lookup."""
    import unreal
    asset_path = material.get_path_name()  # "/Game/Materials/M.M"
    return unreal.find_object(None, f"{asset_path}.{name}")


def _all_expression_names(material):
    """Best-effort enumeration. Used only for error messages."""
    import unreal
    pkg = material.get_outermost()
    out = []
    # Walk: try names of common expression classes with auto-numbered suffixes.
    # This is a fallback - if you know the name, _find_expression hits direct.
    candidates = [
        "MaterialExpressionTime", "MaterialExpressionMultiply", "MaterialExpressionFrac",
        "MaterialExpressionRound", "MaterialExpressionScalarParameter",
        "MaterialExpressionVectorParameter", "MaterialExpressionConstant",
        "MaterialExpressionAdd", "MaterialExpressionSubtract",
    ]
    asset_path = material.get_path_name()
    for c in candidates:
        for i in range(0, 10):
            obj = unreal.find_object(None, f"{asset_path}.{c}_{i}")
            if obj:
                out.append(obj.get_name())
    return out


def handle(args: dict) -> dict:
    import unreal

    asset_path = args["asset_path"]
    from_node = args["from_node"]
    to_node = args["to_node"]
    from_pin = args.get("from_pin", "")     # default output
    to_pin = args["to_pin"]                  # required - input name varies

    material = unreal.EditorAssetLibrary.load_asset(asset_path)
    if material is None:
        raise ValueError(f"material not found: {asset_path}")
    if not isinstance(material, unreal.Material):
        raise ValueError(f"asset is not a Material: {asset_path}")

    src = _find_expression(material, from_node)
    if src is None:
        raise ValueError(
            f"from_node {from_node!r} not found. Sample of available: {_all_expression_names(material)}"
        )
    tgt = _find_expression(material, to_node)
    if tgt is None:
        raise ValueError(
            f"to_node {to_node!r} not found. Sample of available: {_all_expression_names(material)}"
        )

    ok = unreal.MaterialEditingLibrary.connect_material_expressions(src, from_pin, tgt, to_pin)
    if not ok:
        raise RuntimeError(
            f"connect_material_expressions returned False for "
            f"{from_node}.{from_pin or '<default>'} -> {to_node}.{to_pin}. "
            f"Likely cause: pin name {to_pin!r} doesn't exist on {tgt.get_class().get_name()}."
        )

    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_asset(asset_path)

    return {
        "success": True,
        "from": f"{from_node}.{from_pin or '<default>'}",
        "to": f"{to_node}.{to_pin}",
    }
