"""Diagnostic for read_blueprint_summary parent_class lookup — round 2.

Run from UE Python console as a single line:
    exec(open(r"C:/Users/jgrif/Documents/MyikaAI/myika-unreal/tests/python/diag_rbs.py").read())
"""
import unreal, traceback

asset_path = "/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter"
bp = unreal.EditorAssetLibrary.load_asset(asset_path)
gc = bp.generated_class() if hasattr(bp, "generated_class") else None
print("bp:", bp, "type:", type(bp).__name__)
print("gc:", gc, "type:", type(gc).__name__ if gc else "None")

print("\n--- dir(bp) filtered for parent/class/super ---")
print([a for a in dir(bp) if any(k in a.lower() for k in ("parent", "super"))])

print("\n--- dir(gc) filtered for parent/class/super ---")
print([a for a in dir(gc) if any(k in a.lower() for k in ("parent", "super"))])

probes = [
    ("bp.get_editor_property('ParentClass')",       lambda: bp.get_editor_property("ParentClass")),
    ("bp.get_editor_property('parent_class')",      lambda: bp.get_editor_property("parent_class")),
    ("getattr(bp, 'ParentClass')",                  lambda: getattr(bp, "ParentClass", "<NO_ATTR>")),
    ("getattr(bp, 'parent_class')",                 lambda: getattr(bp, "parent_class", "<NO_ATTR>")),
    ("bp.parent_class (call)",                      lambda: bp.parent_class()),
    ("gc.get_class()",                              lambda: gc.get_class()),
    ("getattr(gc, 'super_class')",                  lambda: getattr(gc, "super_class", "<NO_ATTR>")),
    ("getattr(gc, '_super_struct')",                lambda: getattr(gc, "_super_struct", "<NO_ATTR>")),
    ("gc.get_class_path_name()",                    lambda: gc.get_class_path_name()),
]

print("\n--- direct probes ---")
for label, fn in probes:
    try:
        v = fn()
        print(f"{label} -> {v!r}  (type={type(v).__name__})")
        if v is not None and v != "<NO_ATTR>":
            try:
                print(f"  .get_name() -> {v.get_name()!r}")
            except Exception:
                pass
    except BaseException as e:
        print(f"{label} raised: {type(e).__name__}: {e}")

print("\n--- AssetRegistry tags ---")
try:
    ar = unreal.AssetRegistryHelpers.get_asset_registry()
    asset_data = ar.get_asset_by_object_path(asset_path + "." + asset_path.rsplit("/", 1)[-1])
    print("asset_data:", asset_data)
    for tag in ("ParentClass", "NativeParentClass", "BlueprintType", "GeneratedClass"):
        try:
            v = asset_data.get_tag_value(tag)
            print(f"  tag {tag!r} -> {v!r}")
        except Exception as e:
            print(f"  tag {tag!r} raised: {e}")
except BaseException as e:
    print("AssetRegistry probe failed:", type(e).__name__, e)
    traceback.print_exc()

print("\n--- BlueprintEditorLibrary parent helpers ---")
bel = unreal.BlueprintEditorLibrary
print([a for a in dir(bel) if any(k in a.lower() for k in ("parent", "class"))])
