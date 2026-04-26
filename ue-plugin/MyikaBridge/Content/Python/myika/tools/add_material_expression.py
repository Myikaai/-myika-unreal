"""Add an expression node (Time, Multiply, ScalarParameter, etc.) to a Material.

Returns the created node's name so the agent can reference it in subsequent
connect_material_expressions / set_material_expression_default calls without
guessing UE's auto-naming.
"""

TOOL_NAME = "add_material_expression"


# Map short names (what the agent passes) to unreal.MaterialExpression* classes.
# Add new entries here as needed - any UMaterialExpression subclass works.
_EXPRESSION_TYPES = (
    "Time", "Multiply", "Add", "Subtract", "Divide",
    "Frac", "Round", "Floor", "Ceil", "Abs", "Sine", "Cosine",
    "Constant", "Constant2Vector", "Constant3Vector", "Constant4Vector",
    "ScalarParameter", "VectorParameter",
    "TextureSample", "TextureSampleParameter2D",
    "Power", "Clamp", "Lerp", "Saturate",
    "ComponentMask", "AppendVector",
    "Panner", "Rotator",
    "DynamicParameter", "MaterialFunctionCall",
    "If", "FresnelFunction", "Fresnel",
    "WorldPosition", "ObjectPosition", "CameraPosition",
    "TexCoord", "TextureCoordinate",
)


def _get_expression_class(type_name: str):
    import unreal

    # Allow exact "MaterialExpressionMultiply" or short "Multiply"
    if type_name.startswith("MaterialExpression"):
        attr = type_name
    else:
        attr = "MaterialExpression" + type_name

    cls = getattr(unreal, attr, None)
    if cls is None:
        # Try a couple of common aliases
        aliases = {
            "TextureCoordinate": "MaterialExpressionTextureCoordinate",
            "TexCoord": "MaterialExpressionTextureCoordinate",
        }
        if type_name in aliases:
            cls = getattr(unreal, aliases[type_name], None)

    if cls is None:
        raise ValueError(
            f"unknown material expression type {type_name!r}. "
            f"Try one of: {', '.join(sorted(_EXPRESSION_TYPES))}"
        )
    return cls


def handle(args: dict) -> dict:
    import unreal

    asset_path = args["asset_path"]
    expression_type = args["expression_type"]
    node_pos_x = int(args.get("node_pos_x", 0))
    node_pos_y = int(args.get("node_pos_y", 0))
    parameter_name = args.get("parameter_name")     # for ScalarParameter/VectorParameter
    default_scalar = args.get("default_scalar")     # float, for ScalarParameter / Constant
    default_vector = args.get("default_vector")     # {r,g,b,a}, for VectorParameter / Constant3/4Vector

    material = unreal.EditorAssetLibrary.load_asset(asset_path)
    if material is None:
        raise ValueError(f"material not found: {asset_path}")
    if not isinstance(material, unreal.Material):
        raise ValueError(f"asset is not a Material: {asset_path} (got {type(material).__name__})")

    expr_class = _get_expression_class(expression_type)

    expr = unreal.MaterialEditingLibrary.create_material_expression(
        material, expr_class, node_pos_x, node_pos_y
    )
    if expr is None:
        raise RuntimeError(
            f"create_material_expression returned None for {expression_type} on {asset_path}"
        )

    # Apply parameter/default settings depending on type
    applied = {}
    if isinstance(expr, unreal.MaterialExpressionScalarParameter):
        if parameter_name:
            expr.set_editor_property("ParameterName", parameter_name)
            applied["parameter_name"] = parameter_name
        if default_scalar is not None:
            expr.set_editor_property("DefaultValue", float(default_scalar))
            applied["default_scalar"] = float(default_scalar)
    elif isinstance(expr, unreal.MaterialExpressionVectorParameter):
        if parameter_name:
            expr.set_editor_property("ParameterName", parameter_name)
            applied["parameter_name"] = parameter_name
        if default_vector is not None:
            color = unreal.LinearColor(
                float(default_vector.get("r", 1.0)),
                float(default_vector.get("g", 1.0)),
                float(default_vector.get("b", 1.0)),
                float(default_vector.get("a", 1.0)),
            )
            expr.set_editor_property("DefaultValue", color)
            applied["default_vector"] = default_vector
    elif isinstance(expr, unreal.MaterialExpressionConstant):
        if default_scalar is not None:
            expr.set_editor_property("R", float(default_scalar))
            applied["default_scalar"] = float(default_scalar)

    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_asset(asset_path)

    return {
        "success": True,
        "asset_path": asset_path,
        "expression_name": expr.get_name(),
        "expression_class": expr.get_class().get_name(),
        "applied": applied,
    }
