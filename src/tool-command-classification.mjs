import { toolCommandText } from "./tool-command-text.mjs";

export function commandPermission(call) {
  if (call?.type !== "shell_call") return "execute";
  const commands = toolCommandText(call);
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
