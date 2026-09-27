export function isWebsocketRecoveryError(error) {
  const errorText = `${error?.message || ""} ${error?.cause?.message || ""}`;
  return (
    error?.code === "websocket_connection_limit_reached" ||
    errorText.includes("websocket_connection_limit_reached") ||
    errorText.includes("cannot send on a closed WebSocket")
  );
}

export function decideRequestFailure(
  error,
  {
    oneShot = false,
    recoveryAttempts = 0,
    previousResponseId = "",
    websocketRetryAvailable = false,
  } = {},
) {
  const websocketExpired = isWebsocketRecoveryError(error);
  if (websocketExpired && websocketRetryAvailable) return { action: "reconnect", recoveryAttempts };

  let nextRecoveryAttempts = websocketExpired ? Math.max(recoveryAttempts, 1) : recoveryAttempts;
  if (
    error?.code === "previous_response_not_found" &&
    previousResponseId &&
    nextRecoveryAttempts < 1
  )
    return { action: "new-chain", recoveryAttempts: nextRecoveryAttempts + 1 };

  if (oneShot) {
    if (nextRecoveryAttempts < 1)
      return { action: "retry-pending", recoveryAttempts: nextRecoveryAttempts + 1 };
    return { action: "fail", recoveryAttempts: nextRecoveryAttempts };
  }
  return { action: "prompt", recoveryAttempts: nextRecoveryAttempts };
}

export function decideRecoveryMenuChoice(choice, recoveryAttempts = 0) {
  if (choice === "retry" || choice === "debug-retry")
    return { action: choice, recoveryAttempts: recoveryAttempts + 1 };
  if (choice === "new-chain" && recoveryAttempts < 2)
    return { action: "new-chain", recoveryAttempts: recoveryAttempts + 1 };
  if (choice === "rollback" || choice === "clear") return { action: choice, recoveryAttempts };
  return { action: "dismiss", recoveryAttempts };
}
