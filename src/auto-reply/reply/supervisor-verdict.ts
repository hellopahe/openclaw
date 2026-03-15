import type {
  SupervisorDraftMaterial,
  SupervisorVerdict,
  SupervisorVerdictAccept,
  SupervisorVerdictReject,
} from "./supervisor-types.js";

/**
 * Parse supervisor verdict from reviewer output
 */
export function parseSupervisorVerdict(output: string): SupervisorVerdict {
  // Try to extract JSON from the output
  const jsonMatch = output.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return createParserReject("No JSON found in reviewer output");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate decision field
    if (!parsed.decision) {
      return createParserReject("Missing 'decision' field in verdict");
    }

    if (parsed.decision === "accept") {
      const accept: SupervisorVerdictAccept = {
        decision: "accept",
        summary: parsed.summary ?? "Accepted",
        reasons: parsed.reasons,
        rawText: output,
        source: "reviewer",
      };
      return accept;
    }

    if (parsed.decision === "reject") {
      if (!parsed.reasons || !Array.isArray(parsed.reasons) || parsed.reasons.length === 0) {
        return createParserReject("Reject verdict must have non-empty reasons array");
      }

      const reject: SupervisorVerdictReject = {
        decision: "reject",
        summary: parsed.summary ?? "Rejected",
        reasons: parsed.reasons,
        revisionInstructions: parsed.revisionInstructions ?? [],
        severity: parsed.severity,
        rawText: output,
        source: "reviewer",
      };
      return reject;
    }

    return createParserReject(`Invalid decision value: ${parsed.decision}`);
  } catch (e) {
    return createParserReject(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Create a parser rejection verdict
 */
function createParserReject(reason: string): SupervisorVerdictReject {
  return {
    decision: "reject",
    summary: "Parser Error",
    reasons: [reason],
    revisionInstructions: [],
    source: "parser",
  };
}

/**
 * Deterministic check result
 */
export type DeterministicCheckResult =
  | { ok: true }
  | { ok: false; verdict: SupervisorVerdictReject };

/**
 * Run deterministic checks on draft
 */
export function runDeterministicChecks(params: {
  draft: SupervisorDraftMaterial;
  enforceFinalTag?: boolean;
}): DeterministicCheckResult {
  const { draft, enforceFinalTag } = params;

  // Check 1: draft cannot be empty
  if (!draft.draftText || draft.draftText.trim().length === 0) {
    return {
      ok: false,
      verdict: {
        decision: "reject",
        summary: "Empty Draft",
        reasons: ["Draft is empty"],
        revisionInstructions: ["Provide a non-empty response"],
        severity: "high",
        source: "deterministic",
      },
    };
  }

  // Check 2: draft cannot be only template/placeholder text
  // Note: "tbd" and "to be determined" removed as they may appear in legitimate technical context
  const emptyPhrases = [
    "i'm sorry",
    "i cannot",
    "i'm unable",
    "no response",
    "placeholder",
    "under development",
    "coming soon",
  ];

  const lowerText = draft.draftText.toLowerCase();
  if (emptyPhrases.some((phrase) => lowerText.includes(phrase))) {
    return {
      ok: false,
      verdict: {
        decision: "reject",
        summary: "Template Response",
        reasons: ["Draft appears to be a template or placeholder response"],
        revisionInstructions: ["Provide an actual response, not a template"],
        severity: "medium",
        source: "deterministic",
      },
    };
  }

  // Check 3: if enforceFinalTag is required, verify it exists (case-insensitive)
  if (enforceFinalTag) {
    const upperText = draft.draftText.toUpperCase();
    const hasFinalTag =
      upperText.includes("<FINAL>") ||
      upperText.includes("</FINAL>") ||
      upperText.includes("<FINAL/>");

    if (!hasFinalTag) {
      return {
        ok: false,
        verdict: {
          decision: "reject",
          summary: "Missing Final Tag",
          reasons: ["Draft must include <final> tag"],
          revisionInstructions: ["Wrap your final response in <final>...</final> tags"],
          severity: "high",
          source: "deterministic",
        },
      };
    }
  }

  return { ok: true };
}
