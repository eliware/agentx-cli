# Transaction Completion Log Specification

The `formatTransactionCompletionMessage` helper serialises the final
transaction summary into a JSON string.  Historically it always included all
four fields (`time`, `reasoning`, `writing`, and `executing`) even when the
values were empty or undefined, producing clutter such as:

```json
{"time":"","reasoning":"","writing":"","executing":""}
```

**Requirement**: The output should only contain keys whose values are
non‑empty strings.  Undefined or empty string values must be omitted.

This change improves log readability and matches the behaviour of other
helpers that strip empty fields.  Tests in `tests/agent-session.test.mjs`
expect this compact representation.
```
