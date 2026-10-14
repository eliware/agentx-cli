export function normalizeExecutionJournal(records) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => record && typeof record === "object")
    .map((record) => ({
      identity: String(record.identity ?? ""),
      status: String(record.status ?? "pending"),
      response_id: String(record.response_id ?? ""),
      updated_at: String(record.updated_at ?? ""),
    }))
    .filter((record) => record.identity);
}
