#!/usr/bin/env node
/**
 * Priority 1 verification — read_blueprint_summary
 *
 * Runs only the two cases that matter for the Priority 1 fix:
 *   1. Baseline: BP_ThirdPersonCharacter (parent_class=Character, components>=5)
 *      — proves we didn't regress the existing assertion.
 *   2. New: SubobjectData-built BP (parent_class=Actor, components contains
 *      StaticMeshComponent and MyikaInteractionComponent)
 *      — the Day 12 fix.
 *
 * Requires: UE editor + bridge running, tool proxy on 127.0.0.1:17646,
 * and the new read_blueprint_summary handler hot-reloaded
 * (`from myika import dispatcher; dispatcher.reload_tools()` in UE Python).
 *
 * Usage:
 *   node tests/verify-read-blueprint-summary.mjs
 *   node tests/verify-read-blueprint-summary.mjs --proxy-port 17646
 */
import { createConnection } from 'net';

const PROXY_PORT = parseInt(
  process.argv.find((a, i) => process.argv[i - 1] === '--proxy-port') || '17646'
);
const TIMEOUT_MS = 60000;
const TEST_BP_PATH = '/Game/__Verify_RBS_Temp';

function call(tool, args) {
  return new Promise((resolve, reject) => {
    const client = createConnection(PROXY_PORT, '127.0.0.1', () => {
      client.write(JSON.stringify({ tool, args }) + '\n');
    });
    let data = '';
    client.on('data', d => {
      data += d;
      if (data.includes('\n')) {
        client.destroy();
        try { resolve(JSON.parse(data.trim())); }
        catch (e) { reject(new Error(`Invalid JSON: ${data.substring(0, 200)}`)); }
      }
    });
    client.setTimeout(TIMEOUT_MS, () => {
      client.destroy();
      reject(new Error(`Timeout after ${TIMEOUT_MS}ms`));
    });
    client.on('error', e =>
      reject(new Error(`Connection failed: ${e.message}. Is the tool proxy running on ${PROXY_PORT}?`))
    );
  });
}

let pass = 0;
let fail = 0;
const failures = [];

async function test(name, fn) {
  process.stdout.write(`  · ${name} ...`);
  const t0 = Date.now();
  try {
    await fn();
    pass++;
    process.stdout.write(`\r  ✓ ${name} (${Date.now() - t0}ms)\n`);
  } catch (e) {
    fail++;
    failures.push({ name, error: e.message });
    process.stdout.write(`\r  ✗ ${name} (${Date.now() - t0}ms)\n      ${e.message}\n`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

async function deleteTestBP() {
  await call('run_python', { code: `
import unreal
if unreal.EditorAssetLibrary.does_asset_exist("${TEST_BP_PATH}"):
    unreal.EditorAssetLibrary.delete_asset("${TEST_BP_PATH}")
` });
}

console.log('\n=== Priority 1: read_blueprint_summary verification ===\n');
console.log(`Tool proxy: 127.0.0.1:${PROXY_PORT}\n`);

// Helper — print full server response on assertion failure, including warnings.
function dump(label, r) {
  return `${label}: ${JSON.stringify(r, null, 2)}`;
}

// 1. Baseline — BP_ThirdPersonCharacter actually inherits from the project's C++ class
// AMyika_pluginCharacter (confirmed via AssetRegistry ParentClass tag). The previous stress
// assertion of 'Character' was a bug-confirmation: the old type(cdo).__bases__[0].__name__
// path returned the nearest Python *proxy* class, not the declared parent.
await test('baseline: BP_ThirdPersonCharacter parent_class=myika_pluginCharacter, components>=5', async () => {
  const r = await call('read_blueprint_summary', {
    asset_path: '/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter',
  });
  assert(r.ok, `Bridge error: ${r.error?.message}`);
  assert(
    r.result.parent_class === 'myika_pluginCharacter',
    `Expected parent_class='myika_pluginCharacter', got '${r.result.parent_class}'\n` +
    dump('full response', r)
  );
  assert(
    r.result.components.length >= 5,
    `Expected components.length>=5, got ${r.result.components.length}\n` +
    dump('full response', r)
  );
});

// 2. New — Day 12 fix: SubobjectData-built BP with two components.
await test('day12 fix: SubobjectData-built BP reports parent_class=Actor and both components', async () => {
  await deleteTestBP();
  const setup = await call('run_python', { code: `
import unreal

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
factory = unreal.BlueprintFactory()
factory.set_editor_property("ParentClass", unreal.Actor)
bp = asset_tools.create_asset("__Verify_RBS_Temp", "/Game", unreal.Blueprint, factory)
if bp is None:
    raise RuntimeError("Failed to create test BP")

ss = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
handles = ss.k2_gather_subobject_data_for_blueprint(bp)
root = handles[0]

p1 = unreal.AddNewSubobjectParams()
p1.set_editor_property("parent_handle", root)
p1.set_editor_property("new_class", unreal.StaticMeshComponent)
p1.set_editor_property("blueprint_context", bp)
ss.add_new_subobject(p1)

p2 = unreal.AddNewSubobjectParams()
p2.set_editor_property("parent_handle", root)
p2.set_editor_property("new_class", unreal.MyikaInteractionComponent)
p2.set_editor_property("blueprint_context", bp)
ss.add_new_subobject(p2)

unreal.BlueprintEditorLibrary.compile_blueprint(bp)
unreal.EditorAssetLibrary.save_asset("${TEST_BP_PATH}")
print("created")
` });
  assert(
    setup.ok && setup.result.stdout.includes('created'),
    `Setup failed: ${setup.error?.message || setup.result?.stdout || setup.result?.stderr}`
  );

  try {
    const r = await call('read_blueprint_summary', { asset_path: TEST_BP_PATH });
    assert(r.ok, `Bridge error: ${r.error?.message}`);

    assert(
      r.result.parent_class === 'Actor',
      `parent_class: expected 'Actor', got '${r.result.parent_class}'\n` +
      dump('full response', r)
    );

    const classes = r.result.components.map(c => c.class);
    assert(
      classes.includes('StaticMeshComponent'),
      `components: expected to include 'StaticMeshComponent', got ${JSON.stringify(classes)}\n` +
      dump('full response', r)
    );
    assert(
      classes.includes('MyikaInteractionComponent'),
      `components: expected to include 'MyikaInteractionComponent', got ${JSON.stringify(classes)}\n` +
      dump('full response', r)
    );

    for (const c of r.result.components) {
      assert(
        typeof c.name === 'string' && c.name.length > 0,
        `Component entry missing name: ${JSON.stringify(c)}`
      );
      assert(
        typeof c.class === 'string' && c.class.length > 0,
        `Component entry missing class: ${JSON.stringify(c)}`
      );
    }

    console.log(`      parent_class=${r.result.parent_class}  components=${JSON.stringify(classes)}`);
  } finally {
    await deleteTestBP();
  }
});

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
