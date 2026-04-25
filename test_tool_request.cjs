/**
 * End-to-end test: send a tool request over WebSocket to the UE bridge.
 * Tests:
 *  1. list_assets — should return real UE assets
 *  2. nonexistent_tool — should return TOOL_NOT_FOUND error
 */
const net = require('net');
const crypto = require('crypto');

const HOST = '127.0.0.1';
const PORT = 17645;

function wsHandshake(socket) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = [
      `GET / HTTP/1.1`,
      `Host: ${HOST}:${PORT}`,
      `Connection: Upgrade`,
      `Upgrade: websocket`,
      `Sec-WebSocket-Version: 13`,
      `Sec-WebSocket-Key: ${key}`,
      ``, ``
    ].join('\r\n');

    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      if (buf.includes('\r\n\r\n')) {
        socket.removeListener('data', onData);
        if (buf.startsWith('HTTP/1.1 101')) {
          resolve();
        } else {
          reject(new Error('Handshake failed: ' + buf.split('\r\n')[0]));
        }
      }
    };
    socket.on('data', onData);
    socket.write(req);
  });
}

function wsSend(socket, text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];

  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | payload.length;
  } else if (payload.length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, mask, masked]));
}

function wsRead(socket, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeListener('data', onData);
      reject(new Error('Timeout waiting for WS frame'));
    }, timeoutMs);

    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      // Minimal unmasked text frame parser
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0F;
      let payloadLen = buf[1] & 0x7F;
      let offset = 2;
      if (payloadLen === 126) {
        if (buf.length < 4) return;
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buf.length < 10) return;
        payloadLen = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }
      if (buf.length < offset + payloadLen) return;

      clearTimeout(timer);
      socket.removeListener('data', onData);

      if (opcode === 0x01) {
        resolve(buf.slice(offset, offset + payloadLen).toString('utf8'));
      } else if (opcode === 0x09) {
        // Ping — send pong and keep reading
        const pong = Buffer.alloc(2);
        pong[0] = 0x8A; pong[1] = 0x00;
        socket.write(pong);
        buf = buf.slice(offset + payloadLen);
        socket.on('data', onData);
      } else {
        resolve(null); // non-text frame
      }
    };
    socket.on('data', onData);
  });
}

async function readTextFrame(socket) {
  // Skip ping/pong/event frames, return first text frame that's a response
  while (true) {
    const text = await wsRead(socket);
    if (!text) continue;
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'response') return msg;
      // Skip events like bridge.ready
      console.log('  (skipping event:', msg.payload?.name || msg.type, ')');
    } catch {
      return text;
    }
  }
}

async function main() {
  console.log('Connecting to UE bridge...');
  const socket = net.createConnection(PORT, HOST);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  await wsHandshake(socket);
  console.log('WebSocket connected.\n');

  // Skip the bridge.ready event
  const ready = await wsRead(socket);
  console.log('bridge.ready:', ready, '\n');

  // --- Test 1: list_assets ---
  console.log('=== Test 1: list_assets ===');
  const req1 = JSON.stringify({
    id: 'test-1',
    type: 'request',
    payload: { tool: 'list_assets', args: { path_filter: '/Game', limit: 5 } }
  });
  wsSend(socket, req1);
  const resp1 = await readTextFrame(socket);
  console.log('Response:', JSON.stringify(resp1, null, 2));

  if (resp1.payload && resp1.payload.ok === true) {
    console.log('PASS: list_assets returned ok=true');
    const assets = resp1.payload.result?.assets || [];
    console.log(`  Found ${assets.length} asset(s)`);
    assets.forEach(a => console.log(`  - ${a.path} (${a.class})`));
  } else {
    console.log('FAIL: list_assets did not return ok=true');
    console.log('  Error:', JSON.stringify(resp1.payload?.error));
  }

  // --- Test 2: nonexistent tool ---
  console.log('\n=== Test 2: nonexistent_tool ===');
  const req2 = JSON.stringify({
    id: 'test-2',
    type: 'request',
    payload: { tool: 'nonexistent_tool', args: {} }
  });
  wsSend(socket, req2);
  const resp2 = await readTextFrame(socket);
  console.log('Response:', JSON.stringify(resp2, null, 2));

  if (resp2.payload && resp2.payload.ok === false && resp2.payload.error?.code === 'TOOL_NOT_FOUND') {
    console.log('PASS: nonexistent_tool returned TOOL_NOT_FOUND');
  } else {
    console.log('FAIL: expected TOOL_NOT_FOUND error');
  }

  // Clean close
  const close = Buffer.alloc(6);
  close[0] = 0x88; close[1] = 0x80;
  crypto.randomBytes(4).copy(close, 2);
  socket.write(close);
  socket.end();

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
