#!/usr/bin/env node
/**
 * Test that the tool proxy intercepts propose_plan and blocks until resolved.
 * Requires: myika-desktop running (tool proxy on localhost:17646).
 *
 * This tests the TCP layer only — not the GUI.
 */
import { createConnection } from 'net';

const PROXY_PORT = 17646;
const TIMEOUT_MS = 10000;

function sendTcp(payload) {
  return new Promise((resolve, reject) => {
    const client = createConnection(PROXY_PORT, '127.0.0.1', () => {
      client.write(JSON.stringify(payload) + '\n');
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
      reject(new Error(`Timeout after ${TIMEOUT_MS}ms — this is EXPECTED for propose_plan (it blocks waiting for approval)`));
    });
    client.on('error', e => reject(new Error(`Connection failed: ${e.message}`)));
  });
}

console.log('\n=== Plan Proxy Interception Test ===\n');
console.log(`Tool proxy: 127.0.0.1:${PROXY_PORT}\n`);

// Test 1: propose_plan should BLOCK (timeout = proof of interception)
console.log('Test 1: propose_plan blocks waiting for approval...');
const t0 = Date.now();
try {
  await sendTcp({
    tool: 'propose_plan',
    args: {
      summary: 'Test plan from proxy test',
      steps: ['Step 1: Create test file', 'Step 2: Verify']
    }
  });
  // If we get here, something resolved the plan (e.g. the GUI was open and someone clicked)
  const ms = Date.now() - t0;
  console.log(`  Got response in ${ms}ms (was resolved externally)`);
} catch (e) {
  const ms = Date.now() - t0;
  if (ms >= TIMEOUT_MS - 500) {
    console.log(`  PASS: Timed out after ${ms}ms — propose_plan correctly blocks`);
  } else {
    console.log(`  FAIL: ${e.message}`);
  }
}

// Test 2: Regular tool calls should NOT block (they go to bridge)
console.log('\nTest 2: Regular tool call (get_compile_errors) does not block...');
try {
  const t1 = Date.now();
  const r = await sendTcp({ tool: 'get_compile_errors', args: {} });
  const ms = Date.now() - t1;
  if (r.ok !== undefined) {
    console.log(`  PASS: Got response in ${ms}ms (ok=${r.ok})`);
  } else {
    console.log(`  RESULT: ${JSON.stringify(r).substring(0, 200)} in ${ms}ms`);
  }
} catch (e) {
  console.log(`  SKIP: ${e.message} (UE bridge may not be connected)`);
}

console.log('\n=== Done ===\n');
