/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  resolveSupervisorConfig,
  shouldBypassSupervisor,
  createWorkerToolDenyOverlay,
  getSupervisorConfig,
} from "./supervisor-policy.js";

describe("resolveSupervisorConfig", () => {
  const baseConfig = {
    agents: {
      defaults: {},
    },
  } as any;

  it("returns default config when not configured", () => {
    const result = resolveSupervisorConfig({
      config: baseConfig,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result.enabled).toBe(false);
    expect(result.maxPasses).toBe(3);
  });

  it("respects user configuration", () => {
    const config = {
      agents: {
        defaults: {
          supervisor: {
            enabled: true,
            maxPasses: 5,
          },
        },
      },
    } as any;

    const result = resolveSupervisorConfig({
      config,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result.enabled).toBe(true);
    expect(result.maxPasses).toBe(5);
  });

  it("forces bypass for heartbeat", () => {
    const config = {
      agents: {
        defaults: {
          supervisor: {
            enabled: true,
          },
        },
      },
    } as any;

    const result = resolveSupervisorConfig({
      config,
      isHeartbeat: true,
      isCliProvider: false,
    });

    expect(result.enabled).toBe(false);
  });

  it("forces bypass for CLI provider", () => {
    const config = {
      agents: {
        defaults: {
          supervisor: {
            enabled: true,
          },
        },
      },
    } as any;

    const result = resolveSupervisorConfig({
      config,
      isHeartbeat: false,
      isCliProvider: true,
    });

    expect(result.enabled).toBe(false);
  });

  it("respects custom workerToolDeny", () => {
    const config = {
      agents: {
        defaults: {
          supervisor: {
            enabled: true,
            workerToolDeny: ["custom_tool"],
          },
        },
      },
    } as any;

    const result = resolveSupervisorConfig({
      config,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result.workerToolDeny).toContain("custom_tool");
  });

  it("respects extraReviewerPrompt", () => {
    const config = {
      agents: {
        defaults: {
          supervisor: {
            enabled: true,
            extraReviewerPrompt: "Check for specific criteria",
          },
        },
      },
    } as any;

    const result = resolveSupervisorConfig({
      config,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result.extraReviewerPrompt).toBe("Check for specific criteria");
  });

  it("respects maxRejectHistory", () => {
    const config = {
      agents: {
        defaults: {
          supervisor: {
            enabled: true,
            maxRejectHistory: 5,
          },
        },
      },
    } as any;

    const result = resolveSupervisorConfig({
      config,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result.maxRejectHistory).toBe(5);
  });

  it("sets suppressVisibleDrafts to true by default", () => {
    const result = resolveSupervisorConfig({
      config: baseConfig,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result.suppressVisibleDrafts).toBe(true);
  });

  it("sets reviewerDisableTools to true by default", () => {
    const result = resolveSupervisorConfig({
      config: baseConfig,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result.reviewerDisableTools).toBe(true);
  });
});

describe("shouldBypassSupervisor", () => {
  const baseFollowupRun = {
    run: {
      config: {
        agents: {
          defaults: {},
        },
      },
    },
  } as any;

  it("returns true for heartbeat", () => {
    const result = shouldBypassSupervisor({
      followupRun: baseFollowupRun,
      isHeartbeat: true,
      isCliProvider: false,
    });

    expect(result).toBe(true);
  });

  it("returns true for CLI provider", () => {
    const result = shouldBypassSupervisor({
      followupRun: baseFollowupRun,
      isHeartbeat: false,
      isCliProvider: true,
    });

    expect(result).toBe(true);
  });

  it("returns true when explicitly disabled", () => {
    const followupRun = {
      run: {
        config: {
          agents: {
            defaults: {
              supervisor: {
                enabled: false,
              },
            },
          },
        },
      },
    } as any;

    const result = shouldBypassSupervisor({
      followupRun,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result).toBe(true);
  });

  it("returns false when enabled and not heartbeat or CLI", () => {
    const followupRun = {
      run: {
        config: {
          agents: {
            defaults: {
              supervisor: {
                enabled: true,
              },
            },
          },
        },
      },
    } as any;

    const result = shouldBypassSupervisor({
      followupRun,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result).toBe(false);
  });

  it("returns true when config.agents is undefined", () => {
    const followupRun = {
      run: {
        config: {},
      },
    } as any;

    const result = shouldBypassSupervisor({
      followupRun,
      isHeartbeat: false,
      isCliProvider: false,
    });

    expect(result).toBe(true);
  });
});

describe("createWorkerToolDenyOverlay", () => {
  it("creates overlay with deny list", () => {
    const result = createWorkerToolDenyOverlay(["tool1", "tool2"]);

    expect(result.deny).toContain("tool1");
    expect(result.deny).toContain("tool2");
  });

  it("handles empty deny list", () => {
    const result = createWorkerToolDenyOverlay([]);

    expect(result.deny).toEqual([]);
  });
});

describe("getSupervisorConfig", () => {
  it("returns supervisor config when present", () => {
    const config = {
      agents: {
        defaults: {
          supervisor: {
            enabled: true,
            maxPasses: 5,
          },
        },
      },
    } as any;

    const result = getSupervisorConfig(config);

    expect(result?.enabled).toBe(true);
    expect(result?.maxPasses).toBe(5);
  });

  it("returns undefined when supervisor config not present", () => {
    const config = {
      agents: {
        defaults: {},
      },
    } as any;

    const result = getSupervisorConfig(config);

    expect(result).toBeUndefined();
  });

  it("returns undefined when agents not present", () => {
    const config = {} as any;

    const result = getSupervisorConfig(config);

    expect(result).toBeUndefined();
  });
});
