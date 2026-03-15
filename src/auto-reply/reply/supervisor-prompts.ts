import type { ReplyPayload } from "../types.js";
import type {
  ResolvedSupervisorConfig,
  SupervisorDraftMaterial,
  SupervisorVerdict,
} from "./supervisor-types.js";

/**
 * Build supervisor review prompt
 */
export function buildSupervisorPrompt(params: {
  originalTask: string;
  draft: SupervisorDraftMaterial;
  rejectHistory: SupervisorVerdict[];
  config: ResolvedSupervisorConfig;
}): string {
  const { originalTask, draft, rejectHistory, config } = params;

  let prompt = `You are a supervisor reviewing a draft response before it is sent to the user.

Your job is to evaluate whether the draft meets quality standards and is ready for delivery.

## Original Task
${originalTask}

## Draft Response
${draft.draftText}

## Evaluation Criteria

1. **Accuracy**: Does the response correctly answer the user's request?
2. **Completeness**: Does it address all parts of the request?
3. **Tone**: Is the tone appropriate?
4. **Safety**: Are there any problematic content or safety concerns?
5. **Format**: Is the response well-formatted and readable?
`;

  // Add extra reviewer prompt if configured
  if (config.extraReviewerPrompt) {
    prompt += `\n## Additional Criteria\n${config.extraReviewerPrompt}\n`;
  }

  // Add reject history context if available
  if (rejectHistory.length > 0) {
    prompt += `\n## Previous Rejection History\n`;
    for (const verdict of rejectHistory) {
      prompt += `\n- Pass ${verdict.source}: ${verdict.summary}\n`;
      if (verdict.reasons) {
        prompt += `  Reasons: ${verdict.reasons.join(", ")}\n`;
      }
      if (verdict.decision === "reject" && verdict.revisionInstructions) {
        prompt += `  Instructions: ${verdict.revisionInstructions.join(", ")}\n`;
      }
    }
  }

  prompt += `

## Output Format

You must respond with a JSON object in the following format:

**If the draft is acceptable:**
{
  "decision": "accept",
  "summary": "Brief summary of why it's acceptable"
}

**If the draft needs revision:**
{
  "decision": "reject",
  "summary": "Brief summary of the issue",
  "reasons": ["Reason 1", "Reason 2", ...],
  "revisionInstructions": ["Instruction 1", "Instruction 2", ...],
  "severity": "low" | "medium" | "high"
}

IMPORTANT: Your response must be valid JSON only. Do not include any other text.`;

  return prompt;
}

/**
 * Build revision prompt for worker
 */
export function buildRevisionPrompt(params: {
  originalTask: string;
  latestVerdict: SupervisorVerdict;
  rejectHistory: SupervisorVerdict[];
}): string {
  const { originalTask, latestVerdict, rejectHistory } = params;

  if (latestVerdict.decision !== "reject") {
    // If not a reject, just return original task
    return originalTask;
  }

  let prompt = `## Revision Required

Your previous response was rejected by the supervisor.

### Summary
${latestVerdict.summary}

### Reasons for Rejection
`;

  for (const reason of latestVerdict.reasons) {
    prompt += `- ${reason}\n`;
  }

  prompt += `\n### Revision Instructions\n`;

  if (latestVerdict.revisionInstructions.length > 0) {
    for (const instruction of latestVerdict.revisionInstructions) {
      prompt += `- ${instruction}\n`;
    }
  } else {
    prompt += `- Please address the reasons above and provide an improved response.\n`;
  }

  // Add previous rejection history if available
  if (rejectHistory.length > 0) {
    prompt += `\n### Full History\n`;
    for (const verdict of rejectHistory) {
      prompt += `- ${verdict.summary}\n`;
    }
  }

  prompt += `\n---\n\n## Original Task\n${originalTask}

Please provide an improved response that addresses the supervisor's feedback.`;

  return prompt;
}

/**
 * Build supervisor draft material from worker outcome
 */
export function buildSupervisorDraftMaterial(params: {
  draftText: string;
  payloads: ReplyPayload[];
  provider: string;
  model: string;
  authProfileId?: string;
}): SupervisorDraftMaterial {
  return {
    draftText: params.draftText,
    payloads: params.payloads,
    provider: params.provider,
    model: params.model,
    authProfileId: params.authProfileId,
  };
}

/**
 * Extract text from payloads for review
 */
export function extractDraftTextFromPayloads(payloads: ReplyPayload[]): string {
  if (!payloads || payloads.length === 0) {
    return "";
  }

  // Prefer text payload
  const textPayload = payloads.find((p) => p.text);
  if (textPayload?.text) {
    return textPayload.text;
  }

  // Fallback to first payload's text
  const firstWithText = payloads.find((p) => p && typeof p === "object" && "text" in p);
  if (firstWithText?.text) {
    return firstWithText.text;
  }

  // Last resort: stringify
  return JSON.stringify(payloads);
}
