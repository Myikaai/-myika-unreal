#!/usr/bin/env node
/**
 * Myika Bridge Stress Test Suite
 *
 * Tests all 6 UE tools through the TCP tool proxy on localhost:17646.
 * Requires: UE editor running with MyikaBridge plugin, Tauri dev server running.
 *
 * Usage:
 *   node tests/stress-test.mjs
 *   node tests/stress-test.mjs --proxy-port 17646
 */
import { createConnection } from 'net';

const PROXY_PORT = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--proxy-port') || '17646');
const TIMEOUT_MS = 60000;

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
    client.on('error', e => reject(new Error(`Connection failed: ${e.message}. Is the tool proxy running?`)));
  });
}

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ── Test Suite ──────────────────────────────────────────────────

console.log('\n=== Myika Bridge Stress Tests ===\n');
console.log(`Tool proxy: 127.0.0.1:${PROXY_PORT}\n`);

// ── list_assets ──

await test('list_assets: 500 limit with truncation', async () => {
  const r = await call('list_assets', { path_filter: '/Game', limit: 500 });
  assert(r.ok, `Expected ok, got error: ${r.error?.message}`);
  assert(r.result.assets.length === 500, `Expected 500 assets, got ${r.result.assets.length}`);
  assert(r.result.truncated === true, 'Expected truncated=true');
});

// ── read_file ──

await test('read_file: large C++ file (29KB)', async () => {
  const r = await call('read_file', { path: 'Plugins/MyikaBridge/Source/MyikaBridge/Private/MyikaBridgeServer.cpp' });
  assert(r.ok, `Expected ok, got error: ${r.error?.message}`);
  assert(r.result.size_bytes > 25000, `Expected >25KB, got ${r.result.size_bytes}`);
  assert(r.result.content.includes('#include'), 'Content should contain #include');
});

await test('read_file: JSON with quotes/newlines', async () => {
  const r = await call('read_file', { path: 'myika_plugin.uproject' });
  assert(r.ok, `Expected ok, got error: ${r.error?.message}`);
  assert(r.result.content.includes('FileVersion'), 'Content should contain FileVersion');
});

await test('read_file: missing file rejected', async () => {
  const r = await call('read_file', { path: 'does_not_exist.txt' });
  assert(!r.ok, 'Expected error for missing file');
});

await test('read_file: path traversal rejected', async () => {
  const r = await call('read_file', { path: '../../etc/passwd' });
  assert(!r.ok, 'Expected error for path traversal');
});

await test('read_file: binary extension rejected', async () => {
  const r = await call('read_file', { path: 'Content/test.uasset' });
  assert(!r.ok, 'Expected error for binary file');
});

// ── write_file ──

await test('write_file: disallowed extension rejected', async () => {
  const r = await call('write_file', { path: 'test.exe', content: 'bad' });
  assert(!r.ok, 'Expected error for .exe');
});

await test('write_file: path traversal rejected', async () => {
  const r = await call('write_file', { path: '../../evil.txt', content: 'bad' });
  assert(!r.ok, 'Expected error for path traversal');
});

// ── run_python ──

await test('run_python: UE API call', async () => {
  const r = await call('run_python', { code: 'print(unreal.SystemLibrary.get_engine_version())' });
  assert(r.ok, `Expected ok, got error: ${r.error?.message}`);
  assert(r.result.stdout.includes('5.'), `Expected engine version in stdout, got: ${r.result.stdout}`);
});

await test('run_python: exception propagated', async () => {
  const r = await call('run_python', { code: 'raise ValueError("boom")' });
  assert(!r.ok, 'Expected error for exception');
  assert(r.error?.message === 'boom', `Expected 'boom', got '${r.error?.message}'`);
});

await test('run_python: large stdout (500 lines)', async () => {
  const r = await call('run_python', { code: 'for i in range(500): print(f"line {i}")' });
  assert(r.ok, `Expected ok, got error: ${r.error?.message}`);
  assert(r.result.stdout.length > 3000, `Expected >3000 chars, got ${r.result.stdout.length}`);
});

// ── get_compile_errors ──

await test('get_compile_errors: returns quickly', async () => {
  const t0 = Date.now();
  const r = await call('get_compile_errors', {});
  const ms = Date.now() - t0;
  assert(r.ok, `Expected ok, got error: ${r.error?.message}`);
  assert(ms < 15000, `Expected <15s, took ${ms}ms`);
  assert(Array.isArray(r.result.blueprint_errors), 'Expected blueprint_errors array');
  assert(Array.isArray(r.result.cpp_errors), 'Expected cpp_errors array');
});

// ── read_blueprint_summary ──

await test('read_blueprint_summary: valid BP', async () => {
  const r = await call('read_blueprint_summary', { asset_path: '/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter' });
  assert(r.ok, `Expected ok, got error: ${r.error?.message}`);
  assert(r.result.parent_class === 'Character', `Expected parent_class=Character, got ${r.result.parent_class}`);
  assert(r.result.components.length >= 5, `Expected >=5 components, got ${r.result.components.length}`);
  assert(r.result.functions.length > 0, 'Expected at least 1 function');
});

await test('read_blueprint_summary: non-BP asset graceful', async () => {
  const r = await call('read_blueprint_summary', { asset_path: '/Game/Characters/Mannequins/Meshes/SK_Mannequin' });
  assert(r.ok, 'Expected ok (graceful degradation)');
  assert(r.result.warnings.length > 0, 'Expected warnings for non-BP asset');
});

await test('read_blueprint_summary: missing asset rejected', async () => {
  const r = await call('read_blueprint_summary', { asset_path: '/Game/Nope/DoesNotExist' });
  assert(!r.ok, 'Expected error for missing asset');
});

// ── Results ──

console.log(`\n=== Results: ${pass}/${pass + fail} passed ===`);
if (fail > 0) {
  console.log(`\n${fail} test(s) FAILED`);
  process.exit(1);
}
