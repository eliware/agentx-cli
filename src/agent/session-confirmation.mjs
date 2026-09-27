import {
  confirmationKey as confirmationKeyDefault,
  saveGlobalConfirmations as saveGlobalConfirmationsDefault,
} from "../confirmation-policy.mjs";

export function createSessionToolConfirmer({
  oneShot,
  isTTY,
  getReadline,
  sessionConfirmations,
  globalConfirmations,
  globalConfirmationPath,
  getConfirmationKey = confirmationKeyDefault,
  saveGlobalConfirmations = saveGlobalConfirmationsDefault,
}) {
  return async (call, cwd) => {
    const key = getConfirmationKey(call, cwd);
    if (sessionConfirmations.has(key) || globalConfirmations.has(key)) return true;
    if (oneShot || !isTTY) return false;

    const summary = String(call?.action?.commands ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const answer = await getReadline().question(
      `Allow state-changing command: ${summary} [y]es/[n]o/[s]ession/[g]lobal: `,
    );
    const choice = answer.trim().toLowerCase();
    if (choice === "s" || choice === "session") {
      sessionConfirmations.add(key);
      return true;
    }
    if (choice === "g" || choice === "global") {
      globalConfirmations.add(key);
      await saveGlobalConfirmations(globalConfirmations, globalConfirmationPath);
      return true;
    }
    return choice === "y" || choice === "yes";
  };
}
