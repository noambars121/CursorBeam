// Standalone test for buildMcpServerList. Run with:
//   npx tsx src/mcp-merge.test.ts
//
// Exits non-zero on failure, prints a one-line summary.

import { buildMcpServerList, type DirInfo, type McpSettings, type UiServer } from './mcp-merge.js';

let pass = 0, fail = 0;
const failures: string[] = [];

function assert(cond: any, msg: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS  ${msg}`);
  } else {
    fail++;
    failures.push(msg);
    console.log(`  FAIL  ${msg}`);
  }
}

function dir(name: string, partial: Partial<DirInfo> = {}): DirInfo {
  return {
    name,
    toolsCount: 0, resourcesCount: 0, promptsCount: 0,
    needsAuth: false, hasError: false, errorMessage: '',
    ...partial,
  };
}

// --- Bug #2: settings-only entry (firebase) appears even without a folder ---
{
  console.log('Bug #2 — settings-only entry surfaces:');
  const result = buildMcpServerList(
    [dir('user-paypal', { toolsCount: 3 })],
    { firebase: { enabled: false }, paypal: { enabled: true } },
  );
  const firebase = result.find(s => s.name === 'firebase');
  assert(firebase, 'firebase entry exists in list');
  assert(firebase?.enabled === false, 'firebase enabled flag matches settings (false)');
  assert(firebase?.errorMessage === '', 'disabled settings-only firebase has no error message');
  // A disabled firebase should not be flagged as error
  assert(firebase?.hasError === false, 'disabled settings-only firebase has hasError=false');
}

// --- Bug #3: hasError + toolsCount survive UI overlay ---
{
  console.log('Bug #3 — UI overlay only touches enabled, not hasError/toolsCount:');
  const result = buildMcpServerList(
    [dir('user-broken', { toolsCount: 5, hasError: true, errorMessage: 'crashed at boot' })],
    { broken: { enabled: true } },
    [{ name: 'broken', enabled: false }] as UiServer[],
  );
  const broken = result.find(s => s.name === 'user-broken');
  assert(broken?.enabled === false, 'UI state overrides enabled (UI says off)');
  assert(broken?.hasError === true, 'hasError preserved through UI overlay');
  assert(broken?.errorMessage === 'crashed at boot', 'errorMessage preserved through UI overlay');
  assert(broken?.toolsCount === 5, 'toolsCount preserved through UI overlay');
}

// --- Settings disabled is respected when no UI state available ---
{
  console.log('settings.json `enabled:false` is respected without UI overlay:');
  const result = buildMcpServerList(
    [dir('user-paypal', { toolsCount: 3 })],
    { paypal: { enabled: false } },
  );
  assert(result[0].enabled === false, 'paypal disabled via settings');
}

// --- Cursor UI is the source of truth when settings.json disagrees ---
{
  console.log('UI state wins over settings when they disagree:');
  const result = buildMcpServerList(
    [dir('user-shadcn', { toolsCount: 1 })],
    { shadcn: { enabled: false } },
    [{ name: 'shadcn', enabled: true }] as UiServer[],
  );
  assert(result[0].enabled === true, 'UI overlay flips false→true');
}

// --- Implicit error: enabled server with zero tools/resources/prompts ---
{
  console.log('Implicit hasError when enabled server has no tools/resources/prompts:');
  const result = buildMcpServerList(
    [dir('user-empty')],
    {},
  );
  assert(result[0].hasError === true, 'empty enabled server flagged as error');
  assert(result[0].errorMessage === 'Show Output', 'default error message is "Show Output"');
}

// --- Disabled server with zero tools is NOT flagged as error ---
{
  console.log('Disabled empty server is NOT flagged as error:');
  const result = buildMcpServerList(
    [dir('user-empty')],
    { empty: { enabled: false } },
  );
  assert(result[0].hasError === false, 'disabled empty server has no implicit error');
}

// --- Type classification ---
{
  console.log('Type classification by prefix:');
  const result = buildMcpServerList(
    [dir('user-x'), dir('plugin-y'), dir('cursor-ide-z'), dir('weird')],
    {},
  );
  assert(result.find(s => s.name === 'user-x')?.type === 'user', 'user- → user');
  assert(result.find(s => s.name === 'plugin-y')?.type === 'plugin', 'plugin- → plugin');
  assert(result.find(s => s.name === 'cursor-ide-z')?.type === 'builtin', 'cursor-ide- → builtin');
  assert(result.find(s => s.name === 'weird')?.type === 'other', 'unknown prefix → other');
}

// --- UI overlay matches across prefix differences ---
{
  console.log('UI overlay matches "firebase" against "user-firebase":');
  const result = buildMcpServerList(
    [dir('user-firebase', { toolsCount: 2 })],
    {},
    [{ name: 'firebase', enabled: false }],
  );
  assert(result[0].enabled === false, 'UI base name matches dir prefixed name');
}

// --- Settings-only entry covered by directory does not duplicate ---
{
  console.log('Settings entry with matching directory does not duplicate:');
  const result = buildMcpServerList(
    [dir('user-paypal', { toolsCount: 3 })],
    { paypal: { enabled: true } },
  );
  assert(result.length === 1, 'no duplicate paypal entry');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('Failures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
