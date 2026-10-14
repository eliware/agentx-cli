export function selectImageInspectionParent({ previousResponseId, callerResponse, responseId }) {
  return previousResponseId || callerResponse?.previous_response_id || responseId;
}
