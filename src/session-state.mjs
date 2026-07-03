import { deleteOptional, readOptionalText, writeText } from './runtime.mjs';

export async function persistResponseState(statePath, state) {
  await writeText(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function clearSession(statePath) {
  await deleteOptional(statePath);
}

export async function readSessionState(statePath) {
  const raw = await readOptionalText(statePath);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return { response_id: raw.trim() || '', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 } };
}
