/**
 * Shared mode mapping between Cursor's internal values and public UI values.
 *
 * Cursor uses "chat" internally for what the UI displays as "Ask".
 * All other modes (agent, plan, debug) match between internal and public.
 */

export type PublicMode = 'ask' | 'agent' | 'plan' | 'debug';

const INTERNAL_TO_PUBLIC: Record<string, PublicMode> = {
  chat: 'ask',
  agent: 'agent',
  plan: 'plan',
  debug: 'debug',
};

const PUBLIC_TO_INTERNAL: Record<string, string> = {
  ask: 'chat',
  agent: 'agent',
  plan: 'plan',
  debug: 'debug',
};

export const VALID_PUBLIC_MODES: readonly PublicMode[] = ['ask', 'agent', 'plan', 'debug'];

export function internalToPublic(raw: string | null | undefined): PublicMode | null {
  if (!raw) return null;
  return INTERNAL_TO_PUBLIC[raw.toLowerCase()] ?? null;
}

export function publicToInternal(mode: string): string | null {
  return PUBLIC_TO_INTERNAL[mode.toLowerCase()] ?? null;
}
