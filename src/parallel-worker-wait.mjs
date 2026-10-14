export async function waitForWorker(waitMs, shouldWait) {
  if (waitMs <= 0) return false;
  const deadline = Date.now() + waitMs;
  let waiting = shouldWait();
  while (waiting && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    waiting = shouldWait();
  }
  return waiting;
}
