const PINK = "\u001b[38;5;213m";
const RESET = "\u001b[0m";

export function formatWebSearchCompletion(item) {
  const queries = Array.isArray(item?.action?.queries)
    ? item.action.queries.filter(Boolean).map(String)
    : [];
  const sources = Array.isArray(item?.action?.sources)
    ? item.action.sources.map((source) => String(source?.url ?? source)).filter(Boolean)
    : [];
  if (queries.length === 0 && sources.length === 0) return "";
  return `${PINK}${JSON.stringify({ web_search: "complete", queries, sources }, null, 2)}${RESET}`;
}
