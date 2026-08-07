function parseNestedError(error) {
  if (typeof error?.message !== 'string') return null;
  try {
    const parsed = JSON.parse(error.message);
    return parsed?.error && typeof parsed.error === 'object' ? parsed.error : null;
  } catch { return null; }
}

function clean(value, max = 180) {
  if (value == null || value === '') return '';
  return String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').slice(0, max);
}

export function describeOpenAIError(error) {
  const nested = parseNestedError(error);
  const source = nested || error;
  const details = [];
  const code = clean(source?.code || source?.type);
  const status = source?.status == null ? '' : clean(source.status, 20);
  const param = clean(source?.param, 80);
  const requestId = clean(source?.request_id || source?.requestId || error?.request_id || error?.requestId || error?.event?.request_id || error?.event?.requestId, 100);
  if (code) details.push(`code=${code}`);
  if (status) details.push(`status=${status}`);
  if (param) details.push(`param=${param}`);
  if (requestId) details.push(`request_id=${requestId}`);
  const cause = clean(error?.cause?.message);
  if (cause && cause !== clean(error?.message)) details.push(`cause=${cause}`);
  return details;
}

export function formatOpenAIError(error) {
  const nested = parseNestedError(error);
  const message = clean(nested?.message || error?.message || error);
  const details = describeOpenAIError(error);
  return details.length ? `${message} [${details.join(', ')}]` : message;
}
