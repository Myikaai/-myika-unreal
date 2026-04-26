// Quick summary of per-run details for the door-scenario journals.
// Prints to stdout; intended to be piped or redirected.
import { readFileSync } from 'fs';

const files = [
  '2026-04-26T17-26-07.300Z.jsonl',
  '2026-04-26T17-27-56.894Z.jsonl',
  '2026-04-26T17-30-11.928Z.jsonl',
  '2026-04-26T17-31-35.678Z.jsonl',
  '2026-04-26T17-32-47.885Z.jsonl',
];
const dir = `${process.env.APPDATA}\\ai.myika.desktop\\runs`;

for (const f of files) {
  const path = `${dir}\\${f}`;
  const lines = readFileSync(path, 'utf8').split('\n').filter(l => l.trim());
  const entries = lines.map(l => JSON.parse(l));
  const rs = entries.find(e => e.phase === 'run_start');
  const re = entries.find(e => e.phase === 'run_end');
  const pp = entries.find(e => e.phase === 'plan_proposed');
  const pa = entries.find(e => e.phase === 'plan_approved');
  const wallMs = rs && re ? new Date(re.ts) - new Date(rs.ts) : null;

  console.log(`=== ${f} ===`);
  console.log(`run_start:     ${rs.ts}`);
  console.log(`plan_proposed: ${pp.ts}  ${pp.result}`);
  console.log(`plan_approved: ${pa.ts}`);
  console.log(`run_end:       ${re.ts}  (wall ${wallMs} ms)`);
  console.log('');
  console.log('Tool calls + results:');

  const calls = entries.filter(e => e.phase === 'tool_call');
  const results = entries.filter(e => e.phase === 'tool_result');
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const r = results.find(rr => rr.tool === c.tool && new Date(rr.ts) >= new Date(c.ts)) || results[i];
    let summary = '';
    if (c.tool === 'propose_plan') {
      summary = `${c.args.steps.length} steps`;
    } else if (c.tool === 'run_python') {
      const code = c.args.code || '';
      const meaningful = code.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#') && !l.startsWith('import '))
        .find(Boolean) || '(empty)';
      summary = meaningful.slice(0, 80);
    } else {
      summary = JSON.stringify(c.args).slice(0, 80);
    }
    const ok = r?.ok ? 'OK ' : 'ERR';
    const ms = r?.duration_ms ?? '?';
    let stdout = '';
    if (r?.result?.result?.stdout) {
      stdout = '  | stdout: ' + r.result.result.stdout.trim().replace(/\n/g, ' | ').slice(0, 60);
    }
    console.log(`  [${ok}] ${c.tool.padEnd(25)} ${String(ms).padStart(5)}ms  ${summary}${stdout}`);
  }
  console.log('');
}
