"""Wire a material-expression node's output to a final material property
(BaseColor, EmissiveColor, Metallic, Roughness, Normal, Opacity, etc.)."""

TOOL_NAME = "connect_material_property"


_PROPERTY_MAP = {
    "BaseColor":            "MP_BASE_COLOR",
    "EmissiveColor":        "MP_EMISSIVE_COLOR",
    "Metallic":             "MP_METALLIC",
    "Roughness":            "MP_ROUGHNESS",
    "Specular":             "MP_SPECULAR",
    "Normal":               "MP_NORMAL",
    "Opacity":              "MP_OPACITY",
    "OpacityMask":          "MP_OPACITY_MASK",
    "WorldPositionOffset":  "MP_WORLD_POSITION_OFFSET",
    "AmbientOcclusion":     "MP_AMBIENT_OCCLUSION",
    "Refraction":           "MP_REFRACTION",
    "PixelDepthOffset":     "MP_PIXEL_DEPTH_OFFSET",
    "SubsurfaceColor":      "MP_SUBSURFACE_COLOR",
}


def _find_expression(material, name: str):
    """Material.expressions is protected; resolve via sub-object path."""
    import unreal
    return unreal.find_object(None, f"{material.get_path_name()}.{name}")


def handle(args: dict) -> dict:
    import unreal

    asset_path = args["asset_path"]
    from_node = args["from_node"]
    from_pin = args.get("from_pin", "")
    property_name = args["property"]   # e.g. "EmissiveColor"

    if property_name not in _PROPERTY_MAP:
        raise ValueError(
            f"unknown material property {property_name!r}. "
            f"Available: {sorted(_PROPERTY_MAP.keys())}"
        )

    material = unreal.EditorAssetLibrary.load_asset(asset_path)
    if material is None:
        raise ValueError(f"material not found: {asset_path}")
    if not isinstance(material, unreal.Material):
        raise ValueError(f"asset is not a Material: {asset_path}")

    src = _find_expression(material, from_node)
    if src is None:
        raise ValueError(f"from_node {from_node!r} not found in {asset_path}")

    prop = getattr(unreal.MaterialProperty, _PROPERTY_MAP[property_name])
    ok = unreal.MaterialEditingLibrary.connect_material_property(src, from_pin, prop)
    if not ok:
        raise RuntimeError(
            f"connect_material_property returned False for "
            f"{from_node}.{from_pin or '<default>'} -> {property_name}"
        )

    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_asset(asset_path)

    return {
        "success": True,
        "from": f"{from_node}.{from_pin or '<default>'}",
        "property": property_name,
    }
