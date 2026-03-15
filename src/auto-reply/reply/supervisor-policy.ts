import type { AgentSupervisorConfig } from "../../config/types.agent-defaults.js";
import type { OpenClawConfig } from "../../config/types.js";
import type { FollowupRun } from "./queue/types.js";
import type { ResolvedSupervisorConfig } from "./supervisor-types.js";
import { DEFAULT_SUPERVISOR_CONFIG } from "./supervisor-types.js";

/**
 * Resolve supervisor config from user config
 */
export function resolveSupervisorConfig(params: {
  config: OpenClawConfig;
  isHeartbeat: boolean;
  isCliProvider: boolean;
}): ResolvedSupervisorConfig {
  const { config, isHeartbeat, isCliProvider } = params;

  // Supervisor config path: agents.defaults.supervisor
  const supervisorCfg = config.agents?.defaults?.supervisor;

  // Build resolved config
  const resolved: ResolvedSupervisorConfig = {
    enabled: supervisorCfg?.enabled ?? DEFAULT_SUPERVISOR_CONFIG.enabled,
    maxPasses: supervisorCfg?.maxPasses ?? DEFAULT_SUPERVISOR_CONFIG.maxPasses,
    workerToolDeny: supervisorCfg?.workerToolDeny ?? DEFAULT_SUPERVISOR_CONFIG.workerToolDeny,
    extraReviewerPrompt: supervisorCfg?.extraReviewerPrompt,
    maxRejectHistory: supervisorCfg?.maxRejectHistory ?? DEFAULT_SUPERVISOR_CONFIG.maxRejectHistory,
    suppressVisibleDrafts: DEFAULT_SUPERVISOR_CONFIG.suppressVisibleDrafts,
    reviewerDisableTools: DEFAULT_SUPERVISOR_CONFIG.reviewerDisableTools,
  };

  // Force bypass for heartbeat runs
  if (isHeartbeat) {
    resolved.enabled = false;
  }

  // Force bypass for CLI provider runs
  // (CLI provider doesn't go through runEmbeddedPiAgent)
  if (isCliProvider) {
    resolved.enabled = false;
  }

  return resolved;
}

/**
 * Check if supervisor should be bypassed for this run
 */
export function shouldBypassSupervisor(params: {
  followupRun: FollowupRun;
  isHeartbeat: boolean;
  isCliProvider: boolean;
}): boolean {
  const { followupRun, isHeartbeat, isCliProvider } = params;

  // Heartbeat always bypasses
  if (isHeartbeat) {
    return true;
  }

  // CLI provider always bypasses
  if (isCliProvider) {
    return true;
  }

  // Check if supervisor is explicitly enabled
  const config = followupRun.run.config;
  const supervisorEnabled = config.agents?.defaults?.supervisor?.enabled;

  // If supervisor is explicitly enabled, don't bypass
  if (supervisorEnabled === true) {
    return false;
  }

  // By default, bypass (supervisor not enabled or not configured)
  return true;
}

/**
 * Create tool deny overlay for worker draft mode
 */
export function createWorkerToolDenyOverlay(toolDenyList: string[]): Record<string, unknown> {
  return {
    deny: toolDenyList,
  };
}

/**
 * Get supervisor config from user config
 */
export function getSupervisorConfig(config: OpenClawConfig): AgentSupervisorConfig | undefined {
  return config.agents?.defaults?.supervisor;
}
