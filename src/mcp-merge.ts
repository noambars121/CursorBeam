// Pure logic for assembling the MCP server list shown in the PWA.
//
// Keeping this separate from relay-server.ts lets us unit-test the rules
// (settings-only fallback, UI overlay, implicit error detection) without
// spinning up CDP or hitting the filesystem.

export type McpServerType = 'user' | 'plugin' | 'builtin' | 'other' | 'unknown';

export type McpServerEntry = {
  name: string;
  enabled: boolean;
  type: McpServerType;
  toolsCount?: number;
  resourcesCount?: number;
  promptsCount?: number;
  needsAuth?: boolean;
  hasError?: boolean;
  errorMessage?: string;
};

export type McpSettings = Record<string, { enabled?: boolean } | undefined>;

export type DirInfo = {
  name: string;
  toolsCount: number;
  resourcesCount: number;
  promptsCount: number;
  needsAuth: boolean;
  hasError: boolean;
  errorMessage: string;
};

export type UiServer = { name: string; enabled: boolean };

function classifyType(name: string): McpServerType {
  if (name.startsWith('user-')) return 'user';
  if (name.startsWith('plugin-')) return 'plugin';
  if (name.startsWith('cursor-ide-')) return 'builtin';
  return 'other';
}

function baseKey(name: string): string {
  return name.replace(/^(user-|plugin-|cursor-ide-)/, '').toLowerCase();
}

export function buildMcpServerList(
  dirs: DirInfo[],
  settings: McpSettings,
  uiServers?: UiServer[],
): McpServerEntry[] {
  const out: McpServerEntry[] = [];
  const covered = new Set<string>();

  for (const d of dirs) {
    const key = baseKey(d.name);
    covered.add(key);

    let enabled = true;
    const cfg = settings[key];
    if (cfg && cfg.enabled === false) enabled = false;

    let hasError = d.hasError;
    let errorMessage = d.errorMessage;
    if (enabled && d.toolsCount === 0 && d.resourcesCount === 0 && d.promptsCount === 0 && !hasError) {
      hasError = true;
      errorMessage = 'Show Output';
    }

    out.push({
      name: d.name,
      enabled,
      type: classifyType(d.name),
      toolsCount: d.toolsCount,
      resourcesCount: d.resourcesCount,
      promptsCount: d.promptsCount,
      needsAuth: d.needsAuth,
      hasError,
      errorMessage,
    });
  }

  // Surface settings.json entries that have no directory yet (e.g. `firebase`
  // configured but never installed). Without this they're invisible in the
  // picker and the user can't toggle them back on.
  for (const settingsKey of Object.keys(settings)) {
    if (covered.has(settingsKey.toLowerCase())) continue;
    const cfg = settings[settingsKey] || {};
    const enabled = cfg.enabled !== false;
    out.push({
      name: settingsKey,
      enabled,
      type: 'user',
      toolsCount: 0,
      resourcesCount: 0,
      promptsCount: 0,
      needsAuth: false,
      hasError: enabled,
      errorMessage: enabled ? 'Not installed (no server folder)' : '',
    });
  }

  // Overlay Cursor UI state on `enabled` only — settings.json is the
  // *requested* state but the UI is what's actually running. We never let UI
  // overlay touch hasError/toolsCount because those come from filesystem
  // scan and the UI doesn't expose them.
  if (uiServers && uiServers.length) {
    const uiByBase: Record<string, boolean> = {};
    for (const s of uiServers) uiByBase[baseKey(s.name)] = s.enabled;
    for (const srv of out) {
      const k = baseKey(srv.name);
      if (uiByBase[k] !== undefined) srv.enabled = uiByBase[k];
    }
  }

  return out;
}
