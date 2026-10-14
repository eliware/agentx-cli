export function permissionAllowsRequired(permission, required) {
  const level =
    permission === "read" || permission === "write" || permission === "execute"
      ? permission
      : "execute";
  return (
    level === "execute" ||
    (level === "write" && required !== "execute") ||
    (level === "read" && required === "read")
  );
}
