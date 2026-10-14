import { redactText } from "@eliware/common";

export function redactWorkerLog(
  text,
  secrets = [process.env.AGENTX_API_KEY, process.env.agentx_api_key],
) {
  return redactText(String(text), { secrets: secrets.filter(Boolean) });
}
