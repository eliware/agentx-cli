export async function confirmSetup({
  isTest,
  isTty,
  configured,
  hasApiKey,
  ask,
  runSetup,
  reloadConfiguration,
}) {
  if (isTest || !isTty || (configured && hasApiKey())) return false;
  const answer = (await ask()).trim().toLowerCase();
  if (answer && answer !== "y" && answer !== "yes") return false;
  await runSetup();
  await reloadConfiguration();
  return hasApiKey();
}
