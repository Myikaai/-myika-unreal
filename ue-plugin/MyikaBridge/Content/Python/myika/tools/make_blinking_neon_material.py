"""High-level skill: build a 'blinking neon' material in one tool call.

Wraps the create_material / add_material_expression / connect_material_expressions /
connect_material_property primitives into a single recipe so the agent doesn't
have to orchestrate 19 calls.

Graph (left to right):

  Time --------\\
                Multiply -> Frac -> Round ------\\
  ScalarParam --/                                 \\
  "BlinkSpeed"                                     Multiply -> EmissiveColor
                                                  /
  VectorParam --\\                                /
  "Color"        Multiply -----------------------
  ScalarParam --/
  "Intensity"

  VectorParam "Color" -> BaseColor

Exposed material parameters (live-tweakable on instances):
  - BlinkSpeed (scalar, Hz-ish)
  - Color      (vector, RGB+A)
  - Intensity  (scalar, brightness multiplier)

Returns the created node names so the agent can do follow-up tweaks if it wants.
"""

from myika.tools import (
    create_material,
    add_material_expression,
    connect_material_expressions,
    connect_material_property,
)

TOOL_NAME = "make_blinking_neon_material"


def _add(asset_path, expression_type, x, y, **extra):
    args = {
        "asset_path": asset_path,
        "expression_type": expression_type,
        "node_pos_x": x,
        "node_pos_y": y,
    }
    args.update(extra)
    r = add_material_expression.handle(args)
    return r["expression_name"]


def _wire(asset_path, from_node, to_node, to_pin):
    connect_material_expressions.handle({
        "asset_path": asset_path,
        "from_node": from_node,
        "to_node": to_node,
        "to_pin": to_pin,
    })


def _wire_property(asset_path, from_node, prop):
    connect_material_property.handle({
        "asset_path": asset_path,
        "from_node": from_node,
        "property": prop,
    })


def handle(args: dict) -> dict:
    asset_path = args.get("asset_path", "/Game/Materials/M_BlinkingNeon")
    overwrite = bool(args.get("overwrite", True))
    blink_speed = float(args.get("blink_speed", 5.0))
    intensity = float(args.get("intensity", 10.0))
    color = args.get("color", {"r": 1.0, "g": 0.2, "b": 0.0, "a": 1.0})

    create_material.handle({"asset_path": asset_path, "overwrite": overwrite})

    time_node = _add(asset_path, "Time", -800, 0)
    blink_speed_node = _add(
        asset_path, "ScalarParameter", -800, 150,
        parameter_name="BlinkSpeed", default_scalar=blink_speed,
    )
    mul_time_speed = _add(asset_path, "Multiply", -550, 75)
    frac = _add(asset_path, "Frac", -350, 75)
    round_node = _add(asset_path, "Round", -200, 75)

    color_node = _add(
        asset_path, "VectorParameter", -800, 350,
        parameter_name="Color", default_vector=color,
    )
    intensity_node = _add(
        asset_path, "ScalarParameter", -800, 500,
        parameter_name="Intensity", default_scalar=intensity,
    )
    mul_color_intensity = _add(asset_path, "Multiply", -550, 425)
    mul_final = _add(asset_path, "Multiply", -300, 300)

    _wire(asset_path, time_node, mul_time_speed, "A")
    _wire(asset_path, blink_speed_node, mul_time_speed, "B")
    _wire(asset_path, mul_time_speed, frac, "")
    _wire(asset_path, frac, round_node, "")
    _wire(asset_path, color_node, mul_color_intensity, "A")
    _wire(asset_path, intensity_node, mul_color_intensity, "B")
    _wire(asset_path, mul_color_intensity, mul_final, "A")
    _wire(asset_path, round_node, mul_final, "B")

    _wire_property(asset_path, mul_final, "EmissiveColor")
    _wire_property(asset_path, color_node, "BaseColor")

    return {
        "success": True,
        "asset_path": asset_path,
        "parameters": {
            "BlinkSpeed": blink_speed,
            "Intensity": intensity,
            "Color": color,
        },
        "nodes": {
            "Time": time_node,
            "BlinkSpeed": blink_speed_node,
            "Color": color_node,
            "Intensity": intensity_node,
            "Multiply_TimeSpeed": mul_time_speed,
            "Frac": frac,
            "Round": round_node,
            "Multiply_ColorIntensity": mul_color_intensity,
            "Multiply_Final": mul_final,
        },
        "next_step": (
            f"Apply {asset_path} to a mesh in the level. The mesh will blink at "
            f"BlinkSpeed Hz with Color * Intensity emissive. Tweak parameters live "
            f"by creating a Material Instance."
        ),
    }
