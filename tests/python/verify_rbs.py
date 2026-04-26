"""Priority 1 verification — read_blueprint_summary, in-process.

Calls the live handler directly. No bridge, no node, no TCP. Run from UE Python:
    exec(open(r"C:/Users/jgrif/Documents/MyikaAI/myika-unreal/tests/python/verify_rbs.py").read())
"""
import unreal, json
from myika.tools import read_blueprint_summary
from myika import dispatcher

dispatcher.reload_tools()
handle = dispatcher.TOOL_REGISTRY["read_blueprint_summary"]

results = []

def check(name, fn):
    try:
        fn()
        print(f"  [PASS] {name}")
        results.append((name, True, None))
    except AssertionError as e:
        print(f"  [FAIL] {name}\n         {e}")
        results.append((name, False, str(e)))
    except Exception as e:
        print(f"  [ERR ] {name}\n         {type(e).__name__}: {e}")
        results.append((name, False, f"{type(e).__name__}: {e}"))

print("\n=== Priority 1: read_blueprint_summary ===\n")

# --- Test 1: baseline BP_ThirdPersonCharacter ---
def t1():
    r = handle({"asset_path": "/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter"})
    assert r["parent_class"] == "myika_pluginCharacter", \
        f"parent_class: expected 'myika_pluginCharacter', got {r['parent_class']!r}\n         full: {json.dumps(r, default=str)}"
    assert len(r["components"]) >= 5, \
        f"components: expected >=5, got {len(r['components'])}\n         full: {json.dumps(r['components'], default=str)}"
check("baseline: BP_ThirdPersonCharacter parent_class=myika_pluginCharacter, components>=5", t1)

# --- Test 2: SubobjectData-built BP with two components ---
TEST_PATH = "/Game/__Verify_RBS_Temp"

def setup_test_bp():
    if unreal.EditorAssetLibrary.does_asset_exist(TEST_PATH):
        unreal.EditorAssetLibrary.delete_asset(TEST_PATH)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.BlueprintFactory()
    factory.set_editor_property("ParentClass", unreal.Actor)
    bp = asset_tools.create_asset("__Verify_RBS_Temp", "/Game", unreal.Blueprint, factory)
    if bp is None:
        raise RuntimeError("Failed to create test BP")
    ss = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    handles = ss.k2_gather_subobject_data_for_blueprint(bp)
    root = handles[0]
    for cls in (unreal.StaticMeshComponent, unreal.MyikaInteractionComponent):
        p = unreal.AddNewSubobjectParams()
        p.set_editor_property("parent_handle", root)
        p.set_editor_property("new_class", cls)
        p.set_editor_property("blueprint_context", bp)
        ss.add_new_subobject(p)
    unreal.BlueprintEditorLibrary.compile_blueprint(bp)
    unreal.EditorAssetLibrary.save_asset(TEST_PATH)

def teardown_test_bp():
    if unreal.EditorAssetLibrary.does_asset_exist(TEST_PATH):
        unreal.EditorAssetLibrary.delete_asset(TEST_PATH)

def t2():
    setup_test_bp()
    try:
        r = handle({"asset_path": TEST_PATH})
        assert r["parent_class"] == "Actor", \
            f"parent_class: expected 'Actor', got {r['parent_class']!r}\n         full: {json.dumps(r, default=str)}"
        classes = [c["class"] for c in r["components"]]
        assert "StaticMeshComponent" in classes, \
            f"components: expected 'StaticMeshComponent' in {classes}"
        assert "MyikaInteractionComponent" in classes, \
            f"components: expected 'MyikaInteractionComponent' in {classes}"
        for c in r["components"]:
            assert isinstance(c.get("name"), str) and c["name"], f"missing name: {c}"
            assert isinstance(c.get("class"), str) and c["class"], f"missing class: {c}"
        print(f"         parent_class={r['parent_class']}  components={classes}")
    finally:
        teardown_test_bp()
check("day12 fix: SubobjectData-built BP reports parent_class=Actor and both components", t2)

# --- Summary ---
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n=== {passed}/{total} passed ===")
if passed != total:
    print("FAILURES:")
    for n, ok, err in results:
        if not ok:
            print(f"  - {n}: {err}")
