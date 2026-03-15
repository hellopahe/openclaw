import type { ReplyPayload } from "../types.js";

/**
 * Supervisor decision types
 */
export type SupervisorDecision = "accept" | "reject";

/**
 * Source of the verdict
 */
export type SupervisorVerdictSource = "reviewer" | "deterministic" | "parser";

/**
 * Verdict when supervisor accepts the draft
 */
export type SupervisorVerdictAccept = {
  decision: "accept";
  summary: string;
  reasons?: string[];
  rawText?: string;
  source: "reviewer" | "deterministic";
};

/**
 * Verdict when supervisor rejects the draft
 */
export type SupervisorVerdictReject = {
  decision: "reject";
  summary: string;
  reasons: string[];
  revisionInstructions: string[];
  severity?: "low" | "medium" | "high";
  rawText?: string;
  source: "reviewer" | "deterministic" | "parser";
};

/**
 * Supervisor verdict - result of draft review
 */
export type SupervisorVerdict = SupervisorVerdictAccept | SupervisorVerdictReject;

/**
 * Supervisor configuration (config-facing)
 */
export type SupervisorConfig = {
  /** Enable supervisor (default: false) */
  enabled?: boolean;
  /** Maximum number of review passes (default: 3) */
  maxPasses?: number;
  /** Tools to deny in worker draft mode */
  workerToolDeny?: string[];
  /** Extra prompt to add to reviewer */
  extraReviewerPrompt?: string;
  /** Maximum reject history to pass to reviewer (default: 3) */
  maxRejectHistory?: number;
};

/**
 * Resolved supervisor configuration (runtime)
 */
export type ResolvedSupervisorConfig = {
  enabled: boolean;
  maxPasses: number;
  workerToolDeny: string[];
  extraReviewerPrompt?: string;
  maxRejectHistory: number;
  suppressVisibleDrafts: true;
  reviewerDisableTools: true;
};

/**
 * Draft material for supervisor review
 */
export type SupervisorDraftMaterial = {
  draftText: string;
  payloads: ReplyPayload[];
  provider: string;
  model: string;
  authProfileId?: string;
};

/**
 * Record of a single supervisor pass
 */
export type SupervisorPassRecord = {
  pass: number;
  workerPrompt: string;
  draft: SupervisorDraftMaterial;
  verdict: SupervisorVerdict;
};

/**
 * Result when supervisor accepts a draft
 */
export type SupervisedRunResultAccepted = {
  kind: "accepted";
  acceptedPass: number;
  workerOutcome: {
    kind: "success";
    finalPayload?: ReplyPayload;
    payloads?: ReplyPayload[];
  };
  history: SupervisorPassRecord[];
};

/**
 * Result when supervisor reaches terminal state (max passes or error)
 */
export type SupervisedRunResultFinal = {
  kind: "final";
  payload: ReplyPayload;
  history: SupervisorPassRecord[];
};

/**
 * Final result of supervised run
 */
export type SupervisedRunResult = SupervisedRunResultAccepted | SupervisedRunResultFinal;

/**
 * Default supervisor configuration
 */
export const DEFAULT_SUPERVISOR_CONFIG: ResolvedSupervisorConfig = {
  enabled: false,
  maxPasses: 3,
  workerToolDeny: ["message", "sessions_send", "cron", "gateway", "nodes", "canvas"],
  maxRejectHistory: 3,
  suppressVisibleDrafts: true,
  reviewerDisableTools: true,
};
