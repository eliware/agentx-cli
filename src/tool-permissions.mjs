import { permissionAllowsRequired } from "./permission-policy.mjs";

function normalizeCommandList(commands) {
  if (Array.isArray(commands)) return commands.map((command) => String(command ?? ""));
  if (typeof commands === "string") return [commands];
  return [];
}

function commandText(call) {
  return normalizeCommandList(call?.action?.commands).join(" && ").toLowerCase().trim();
}

export function commandPermission(call) {
  if (call?.type !== "shell_call") return "execute";
  const commands = commandText(call);
  if (!commands) return "read";
  if (
    commands.includes(">") ||
    /\b(sed|perl|ruby|python|python3)\s+[^;&|]*\s-i(?:\s|$)/.test(commands)
  )
    return "write";
  if (
    /(^|[;&|\s])(rm|mv|cp|mkdir|rmdir|touch|tee|chmod|chown|truncate|dd|install|shutdown|reboot|poweroff|systemctl|apt|dnf|yum|npm\s+(install|uninstall|update|ci)|git\s+(commit|push|reset)|terraform|kubectl|ssh)(\s|$)/.test(
      commands,
    )
  )
    return "write";
  if (
    !/(^|[;&|\s])(cat|cut|diff|du|env|file|find|git\s+(branch|diff|log|show|status)|grep|head|less|ls|printf|pwd|rg|sed|sort|stat|tail|tree|uniq| wc)(\s|$)/.test(
      commands,
    )
  )
    return "execute";
  if (
    /(^|[;&|\s])(node|python|python3|perl|ruby|bash|sh|zsh|make|cargo|gradle|mvn|pytest|npx)(\s|$)/.test(
      commands,
    )
  )
    return "execute";
  return "read";
}

export function permissionAllows(permission, call) {
  return permissionAllowsRequired(permission, commandPermission(call));
}
