import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { buildWorkspaceSkillStatus } from "../agents/skills-status.js";
import type { OpenClawConfig } from "../config/config.js";
import { normalizePluginsConfig } from "../plugins/config-state.js";
import { discoverOpenClawPlugins } from "../plugins/discovery.js";
import { note } from "../terminal/note.js";
import { detectLegacyWorkspaceDirs, formatLegacyWorkspaceWarning } from "./doctor-workspace.js";

export function noteWorkspaceStatus(cfg: OpenClawConfig) {
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const legacyWorkspace = detectLegacyWorkspaceDirs({ workspaceDir });
  if (legacyWorkspace.legacyDirs.length > 0) {
    note(formatLegacyWorkspaceWarning(legacyWorkspace), "Extra workspace");
  }

  const skillsReport = buildWorkspaceSkillStatus(workspaceDir, { config: cfg });
  note(
    [
      `Eligible: ${skillsReport.skills.filter((s) => s.eligible).length}`,
      `Missing requirements: ${
        skillsReport.skills.filter((s) => !s.eligible && !s.disabled && !s.blockedByAllowlist)
          .length
      }`,
      `Blocked by allowlist: ${skillsReport.skills.filter((s) => s.blockedByAllowlist).length}`,
    ].join("\n"),
    "Skills status",
  );

  // Use discovery instead of loading to avoid blocking on plugin initialization
  const discovery = discoverOpenClawPlugins({
    workspaceDir,
    cache: false, // Force fresh discovery
  });
  const normalized = normalizePluginsConfig(cfg.plugins);

  if (discovery.candidates.length > 0) {
    const discovered = discovery.candidates.length;
    const enabled = discovery.candidates.filter((c) => {
      const effectiveEnabled = normalized.entries?.[c.idHint]?.enabled ?? false;
      return effectiveEnabled;
    }).length;

    const lines = [`Discovered: ${discovered}`, `Enabled: ${enabled}`];
    note(lines.join("\n"), "Plugins");
  }
  if (discovery.diagnostics.length > 0) {
    const lines = discovery.diagnostics.map((diag) => {
      const prefix = diag.level.toUpperCase();
      const plugin = diag.pluginId ? ` ${diag.pluginId}` : "";
      return `- ${prefix}${plugin}: ${diag.message}`;
    });
    note(lines.join("\n"), "Plugin diagnostics");
  }

  return { workspaceDir };
}
