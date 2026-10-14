function preview(value) {
  return String(value ?? "")
    .replaceAll(/\s+/g, " ")
    .slice(0, 20);
}

export function getRollbackMenuLines(history, selected) {
  const rows = ["Rollback to a successful response checkpoint:", ""];
  history.forEach((entry, index) => {
    const marker = index === selected ? ">" : " ";
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "unknown time";
    rows.push(
      `${marker} ${index + 1}. ${time}  ${JSON.stringify(preview(entry.user_preview))}  ->  ${JSON.stringify(preview(entry.assistant_preview))}`,
    );
  });
  rows.push(`${selected === history.length ? ">" : " "} ${history.length + 1}. Cancel`);
  rows.push("", `Use 1-${history.length + 1}, ↑/↓, or Enter.`);
  return rows;
}
