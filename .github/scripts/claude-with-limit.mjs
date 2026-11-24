// Runs Claude Code headless and stops it once Claude subscription usage reaches a limit.
//
//   node claude-with-limit.mjs check          → one tiny call, only reads current usage
//   node claude-with-limit.mjs run <args...>  → claude -p <args...>, stopped at the limit
//
// Usage comes from the `rate_limit_event` in Claude Code's stream-json output
// (5-hour and weekly window, 0–1). It is not a documented API: if it is missing,
// `check` reports "stopped" so the pipeline never runs without knowing the usage.
//
// Env: USAGE_LIMIT (default 0.75). Writes `stopped` and `usage` to $GITHUB_OUTPUT.

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const LIMIT = Number(process.env.USAGE_LIMIT ?? '0.75');
const [mode, ...rest] = process.argv.slice(2);
if (mode !== 'check' && mode !== 'run') {
  console.error('usage: claude-with-limit.mjs check | run <claude args>');
  process.exit(2);
}

const pct = (x) => `${Math.round(x * 100)}%`;
const output = (key, value) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
};

const args =
  mode === 'check'
    ? ['-p', 'Reply with just OK', '--model', 'claude-haiku-5-5', '--max-turns', '1']
    : ['-p', ...rest];
const child = spawn('claude', [...args, '--output-format', 'stream-json', '--verbose'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  detached: true, // own process group, so stopping also ends test runs Claude started
});

let usage; // highest utilization seen, 0–1
let stopped = false;
let result;

for await (const line of createInterface({ input: child.stdout })) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  if (e.type === 'rate_limit_event') {
    const w = e.rate_limit_info?.unifiedWindows ?? {};
    const five = w.five_hour?.utilization ?? 0;
    const week = w.seven_day?.utilization ?? 0;
    usage = Math.max(five, week);
    console.log(`Claude usage: 5-hour window ${pct(five)} · week ${pct(week)} (limit ${pct(LIMIT)})`);
    if (usage >= LIMIT && !stopped) {
      stopped = true;
      console.log(`::warning::Claude usage reached ${pct(usage)} – stopping, limit is ${pct(LIMIT)}.`);
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  } else if (e.type === 'assistant') {
    for (const c of e.message?.content ?? []) {
      if (c.type === 'text' && c.text.trim()) console.log(`[claude] ${c.text.trim().slice(0, 500)}`);
      if (c.type === 'tool_use') console.log(`[tool] ${c.name} ${JSON.stringify(c.input).slice(0, 200)}`);
    }
  } else if (e.type === 'result') {
    result = e;
  }
}

const code = await new Promise((resolve) => {
  if (child.exitCode !== null) resolve(child.exitCode);
  else child.on('exit', (c) => resolve(c ?? 1));
});

if (mode === 'check' && usage === undefined) {
  stopped = true;
  console.log('::warning::Could not read Claude usage (no rate_limit_event) – not starting, to be safe.');
}
output('stopped', stopped);
output('usage', usage === undefined ? 'unknown' : pct(usage));

if (stopped) process.exit(0);
if (result) console.log(`Result: ${result.subtype}, ${result.num_turns} turns`);
process.exit(code === 0 && !result?.is_error ? 0 : 1);
