export function isSetupEligible({ isTest, isTty, configured, hasApiKey }) {
  return !isTest && isTty && !(configured && hasApiKey());
}

export function acceptsSetupAnswer(answer) {
  const normalized = answer.trim().toLowerCase();
  return !normalized || normalized === "y" || normalized === "yes";
}
