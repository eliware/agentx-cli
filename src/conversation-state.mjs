import { deleteOptional, readOptionalText } from "./runtime.mjs";
import { fs } from "@eliware/common";
import { normalizeSessionState } from "./conversation-state-normalization.mjs";

export async function persistResponseState(statePath, state) {
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(
      tempPath,
      `${JSON.stringify(normalizeSessionState(state), null, 2)}\n`,
    );
    await fs.promises.rename(tempPath, statePath);
  } catch (error) {
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      /* cleanup is best effort */
    }
    throw error;
  }
}

export async function clearSession(statePath) {
  await deleteOptional(statePath);
}

export async function readSessionState(statePath) {
  const raw = await readOptionalText(statePath);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return normalizeSessionState(parsed);
  } catch {}
  return normalizeSessionState({ response_id: raw.trim() || "", usage: {} });
}
