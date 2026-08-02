function clean(value, max = 180) {
  if (value == null || value === '') return '';
  return String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').slice(0, max);
}

export function describeOpenAIError(error) {
  const details = [];
  const code = clean(error?.code || error?.type);
  const status = error?.status == null ? '' : clean(error.status, 20);
  const param = clean(error?.param, 80);
  const requestId = clean(error?.request_id || error?.requestId || error?.event?.request_id || error?.event?.requestId, 100);
  if (code) details.push(`code=${code}`);
  if (status) details.push(`status=${status}`);
  if (param) details.push(`param=${param}`);
  if (requestId) details.push(`request_id=${requestId}`);
  const cause = clean(error?.cause?.message);
  if (cause && cause !== clean(error?.message)) details.push(`cause=${cause}`);
  return details;
}

export function formatOpenAIError(error) {
  const message = clean(error?.message || error);
  const details = describeOpenAIError(error);
  return details.length ? `${message} [${details.join(', ')}]` : message;
}
