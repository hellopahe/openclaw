import { runEmbeddedPiAgent } from "../../agents/pi-embedded.js";
import type { OpenClawConfig } from "../../config/types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { TemplateContext } from "../templating.js";
import type { VerboseLevel } from "../thinking.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import type { FollowupRun } from "./queue/types.js";
import { buildRevisionPrompt } from "./supervisor-prompts.js";
import {
  buildSupervisorDraftMaterial,
  extractDraftTextFromPayloads,
} from "./supervisor-prompts.js";
import { buildSupervisorPrompt } from "./supervisor-prompts.js";
import type {
  ResolvedSupervisorConfig,
  SupervisedRunResult,
  SupervisorDraftMaterial,
  SupervisorPassRecord,
  SupervisorVerdict,
} from "./supervisor-types.js";
import { runDeterministicChecks } from "./supervisor-verdict.js";
import type { TypingSignaler } from "./typing-mode.js";

// Supervisor subsystem logger
const log = createSubsystemLogger("supervisor");

/**
 * Truncate text for safe logging (avoid dumping full prompts/drafts)
 */
function truncateForLog(text: string, maxLen: number = 200): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.slice(0, maxLen) + "...";
}

/**
 * Log a supervisor verdict at info level
 */
function logVerdict(verdict: SupervisorVerdict, pass: number): void {
  if (verdict.decision === "accept") {
    log.info(`[pass ${pass}] Supervisor ${verdict.source} ACCEPTED: ${verdict.summary}`);
  } else {
    const reject = verdict;
    log.info(
      `[pass ${pass}] Supervisor ${verdict.source} REJECTED: ${reject.summary} (severity: ${reject.severity ?? "none"})`,
    );
    if (reject.reasons.length > 0) {
      log.info(`[pass ${pass}] Reasons: ${reject.reasons.join("; ")}`);
    }
    if (reject.revisionInstructions.length > 0) {
      log.info(`[pass ${pass}] Revision instructions: ${reject.revisionInstructions.join("; ")}`);
    }
  }
}

/**
 * Create a config with tool deny list for worker draft mode
 */
export function createWorkerConfigWithToolDeny(
  config: OpenClawConfig,
  toolDenyList: string[],
): OpenClawConfig {
  // Deep clone the config
  const modifiedConfig = JSON.parse(JSON.stringify(config)) as OpenClawConfig;

  // Add tool deny to sandbox tools
  if (!modifiedConfig.tools) {
    modifiedConfig.tools = {};
  }
  if (!modifiedConfig.tools.sandbox) {
    modifiedConfig.tools.sandbox = {};
  }
  if (!modifiedConfig.tools.sandbox.tools) {
    modifiedConfig.tools.sandbox.tools = {};
  } else {
    // Preserve existing tools config (mode, etc)
    modifiedConfig.tools.sandbox = { ...modifiedConfig.tools.sandbox };
  }

  // Merge deny list (existing denies + new denies)
  const sandboxTools = modifiedConfig.tools.sandbox.tools ?? {};
  const existingDeny = sandboxTools.deny ?? [];
  sandboxTools.deny = [...new Set([...existingDeny, ...toolDenyList])];
  modifiedConfig.tools.sandbox.tools = sandboxTools;

  return modifiedConfig;
}

/**
 * Run supervised reply turn - core controller
 */
export async function runSupervisedReplyTurn(params: {
  config: ResolvedSupervisorConfig;
  commandBody: string;
  followupRun: FollowupRun;
  sessionCtx: TemplateContext;
  typingSignals: TypingSignaler;
  opts?: GetReplyOptions;
  resolvedVerboseLevel: VerboseLevel;
  isHeartbeat: boolean;
}): Promise<SupervisedRunResult> {
  const {
    config,
    commandBody,
    followupRun,
    sessionCtx,
    typingSignals,
    opts,
    resolvedVerboseLevel,
    isHeartbeat,
  } = params;

  const history: SupervisorPassRecord[] = [];
  let workerPrompt = commandBody;

  log.info(`Starting supervised reply with maxPasses=${config.maxPasses}`);

  for (let pass = 1; pass <= config.maxPasses; pass++) {
    // Log worker pass start
    log.info(
      `[pass ${pass}/${config.maxPasses}] Worker starting (prompt: ${truncateForLog(workerPrompt, 100)})`,
    );

    // Run worker
    const workerOutcome = await runWorker({
      prompt: workerPrompt,
      followupRun,
      sessionCtx,
      typingSignals,
      config,
      opts,
      resolvedVerboseLevel,
      isHeartbeat,
      pass,
    });

    // Log worker completion
    log.info(`[pass ${pass}] Worker completed (kind: ${workerOutcome.kind})`);

    // Check for final result (error or explicit final)
    if (workerOutcome.kind === "final") {
      const errorPayload = workerOutcome.payloads?.[0];
      log.error(
        `[pass ${pass}] Worker returned final with error: ${errorPayload?.text ?? "unknown"}`,
      );
      return {
        kind: "final",
        payload: workerOutcome.payloads?.[0] ?? { text: "Error" },
        history,
      };
    }

    // Extract draft material
    const draftText = extractDraftTextFromPayloads(workerOutcome.payloads);
    log.info(`[pass ${pass}] Draft ready (text length: ${draftText.length})`);

    const draft = buildSupervisorDraftMaterial({
      draftText,
      payloads: workerOutcome.payloads ?? [],
      provider: followupRun.run.provider,
      model: followupRun.run.model,
      authProfileId: followupRun.run.authProfileId,
    });

    // Run deterministic checks
    const deterministicResult = runDeterministicChecks({
      draft,
      enforceFinalTag: undefined, // TODO: add to config if needed
    });

    // Log deterministic check result
    if (deterministicResult.ok) {
      log.info(`[pass ${pass}] Deterministic check PASSED`);
    } else {
      log.info(`[pass ${pass}] Deterministic check FAILED: ${deterministicResult.verdict.summary}`);
    }

    // Determine verdict
    let verdict;
    if (deterministicResult.ok) {
      // Run supervisor reviewer
      log.info(`[pass ${pass}] Running reviewer...`);
      verdict = await runSupervisorReview({
        originalTask: commandBody,
        draft,
        rejectHistory: history.map((h) => h.verdict).slice(-config.maxRejectHistory),
        config,
        followupRun,
        sessionCtx,
        resolvedVerboseLevel,
        pass,
      });
    } else {
      verdict = deterministicResult.verdict;
    }

    // Log verdict
    logVerdict(verdict, pass);

    // Record pass
    history.push({
      pass,
      workerPrompt,
      draft,
      verdict,
    });

    // Handle verdict
    if (verdict.decision === "accept") {
      log.info(`[pass ${pass}] Draft ACCEPTED - will send to user`);
      return {
        kind: "accepted",
        acceptedPass: pass,
        workerOutcome: {
          kind: "success",
          finalPayload: workerOutcome.finalPayload,
          payloads: workerOutcome.payloads ?? [],
        },
        history,
      };
    }

    // Check if we've reached max passes
    if (pass >= config.maxPasses) {
      log.warn(`[pass ${pass}] Max passes (${config.maxPasses}) exceeded - returning error`);
      return {
        kind: "final",
        payload: buildMaxPassesExceededPayload(history),
        history,
      };
    }

    // Build revision prompt for next pass
    log.info(`[pass ${pass}] Building revision prompt for next pass...`);
    workerPrompt = buildRevisionPrompt({
      originalTask: commandBody,
      latestVerdict: verdict,
      rejectHistory: history.map((h) => h.verdict),
    });
    log.info(`[pass ${pass}] Revision prompt prepared (length: ${workerPrompt.length})`);
  }

  // Should not reach here, but handle gracefully
  return {
    kind: "final",
    payload: {
      text: "Supervisor terminated unexpectedly.",
    },
    history,
  };
}

/**
 * Run worker (draft mode)
 */
async function runWorker(params: {
  prompt: string;
  followupRun: FollowupRun;
  sessionCtx: TemplateContext;
  typingSignals: TypingSignaler;
  config: ResolvedSupervisorConfig;
  opts?: GetReplyOptions;
  resolvedVerboseLevel: VerboseLevel;
  isHeartbeat: boolean;
  pass: number;
}): Promise<{
  kind: "success" | "final";
  payloads: ReplyPayload[];
  finalPayload?: ReplyPayload;
}> {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const {
    prompt,
    followupRun,
    sessionCtx,
    typingSignals,
    config,
    opts,
    resolvedVerboseLevel,
    isHeartbeat,
    pass,
  } = params;
  /* eslint-enable @typescript-eslint/no-unused-vars */

  // For MVP, we call runEmbeddedPiAgent directly with suppressed callbacks
  // In a full implementation, we'd use runAgentTurnWithFallback but with shadowed opts

  // Create a shadow opts that suppresses visible callbacks
  const shadowOpts: GetReplyOptions = {
    ...opts,
    // Suppress user-visible outputs
    onPartialReply: undefined,
    onBlockReply: undefined,
    onToolResult: undefined,
    onAssistantMessageStart: undefined,
    onReasoningStream: undefined,
  };

  // Apply tool deny for worker draft mode
  const workerConfig = createWorkerConfigWithToolDeny(
    followupRun.run.config,
    config.workerToolDeny,
  );

  try {
    const result = await runEmbeddedPiAgent({
      prompt,
      ...getEmbeddedContextWithConfig(followupRun, workerConfig),
      trigger: isHeartbeat ? "heartbeat" : "user",
      runId: crypto.randomUUID(),
      groupId: undefined,
      groupChannel: undefined,
      groupSpace: undefined,
      senderId: followupRun.run.senderId,
      senderName: followupRun.run.senderName,
      senderUsername: followupRun.run.senderUsername,
      senderE164: followupRun.run.senderE164,
      senderIsOwner: followupRun.run.senderIsOwner,
      extraSystemPrompt: followupRun.run.extraSystemPrompt,
      toolResultFormat: "markdown",
      suppressToolErrorWarnings: true,
      abortSignal: opts?.abortSignal,
      ...shadowOpts,
      onPartialReply: undefined,
      onBlockReply: undefined,
      onToolResult: undefined,
    });

    // Extract payloads from result
    const payloads = result?.payloads ?? [];
    const finalPayload = payloads[payloads.length - 1];

    return {
      kind: "success",
      payloads,
      finalPayload,
    };
  } catch (error) {
    // Return final with error payload
    return {
      kind: "final",
      payloads: [
        {
          text: `Worker error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

/**
 * Run supervisor reviewer
 */
async function runSupervisorReview(params: {
  originalTask: string;
  draft: SupervisorDraftMaterial;
  rejectHistory: SupervisorVerdict[];
  config: ResolvedSupervisorConfig;
  followupRun: FollowupRun;
  sessionCtx: TemplateContext;
  resolvedVerboseLevel: VerboseLevel;
  pass: number;
}): Promise<SupervisorVerdict> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    originalTask,
    draft,
    rejectHistory,
    config,
    followupRun,
    sessionCtx,
    resolvedVerboseLevel: _resolvedVerboseLevel,
    pass,
  } = params;

  // Build supervisor prompt
  const supervisorPrompt = buildSupervisorPrompt({
    originalTask,
    draft,
    rejectHistory,
    config,
  });

  // Create unique session for reviewer
  const reviewSessionId = `supervisor-${crypto.randomUUID()}`;
  const reviewSessionFile =
    `${followupRun.run.sessionFile.replace(/\.json$/, "")}-review-${pass}.json`.replace(
      ".json",
      `-${pass}.json`,
    );

  try {
    const result = await runEmbeddedPiAgent({
      prompt: supervisorPrompt,
      ...getEmbeddedContext(followupRun, sessionCtx),
      sessionId: reviewSessionId,
      sessionFile: reviewSessionFile,
      trigger: "supervisor",
      runId: crypto.randomUUID(),
      groupId: undefined,
      groupChannel: undefined,
      groupSpace: undefined,
      disableTools: config.reviewerDisableTools,
      suppressToolErrorWarnings: true,
      // Reviewer doesn't need callbacks
      onPartialReply: undefined,
      onBlockReply: undefined,
      onToolResult: undefined,
    });

    // Extract text from result
    const outputText = extractDraftTextFromPayloads(result?.payloads ?? []);

    // Parse verdict
    const { parseSupervisorVerdict } = await import("./supervisor-verdict.js");
    return parseSupervisorVerdict(outputText);
  } catch (error) {
    // Return parser error verdict
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Reviewer failed: ${errorMessage}`);
    return {
      decision: "reject",
      summary: "Supervisor Error",
      reasons: [`Review failed: ${errorMessage}`],
      revisionInstructions: ["Please try again"],
      severity: "high",
      source: "parser",
    };
  }
}

/**
 * Get embedded context from followupRun
 */
function getEmbeddedContext(followupRun: FollowupRun, _sessionCtx: TemplateContext) {
  return getEmbeddedContextWithConfig(followupRun, followupRun.run.config);
}

/**
 * Get embedded context with custom config
 */
function getEmbeddedContextWithConfig(followupRun: FollowupRun, config: OpenClawConfig) {
  return {
    agentId: followupRun.run.agentId,
    agentDir: followupRun.run.agentDir,
    sessionId: followupRun.run.sessionId,
    sessionFile: followupRun.run.sessionFile,
    workspaceDir: followupRun.run.workspaceDir,
    provider: followupRun.run.provider,
    model: followupRun.run.model,
    authProfileId: followupRun.run.authProfileId,
    authProfileIdSource: followupRun.run.authProfileIdSource,
    config,
    timeoutMs: followupRun.run.timeoutMs,
    blockReplyBreak: followupRun.run.blockReplyBreak,
  };
}

/**
 * Build payload for max passes exceeded
 */
function buildMaxPassesExceededPayload(history: SupervisorPassRecord[]): ReplyPayload {
  const lastVerdict = history[history.length - 1]?.verdict;

  let message = "Supervisor: Maximum review passes exceeded. ";
  if (lastVerdict) {
    message += `\nLast feedback: ${lastVerdict.summary}`;
    if (lastVerdict.reasons?.length) {
      message += `\nReasons: ${lastVerdict.reasons.join(", ")}`;
    }
  }

  return {
    text: message,
  };
}
