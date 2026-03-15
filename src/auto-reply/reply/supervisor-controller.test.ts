// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { describe, it, expect, beforeEach } from "vitest";
import type { OpenClawConfig } from "../../config/types.js";
import { createWorkerConfigWithToolDeny } from "./supervisor-controller.js";

describe("createWorkerConfigWithToolDeny", () => {
  let baseConfig: OpenClawConfig;

  beforeEach(() => {
    baseConfig = {
      agents: {
        defaults: {},
      },
    } as OpenClawConfig;
  });

  it("adds tool deny list to empty config", () => {
    const result = createWorkerConfigWithToolDeny(baseConfig, ["message", "sessions_send"]);

    expect(result.tools?.sandbox?.tools?.deny).toContain("message");
    expect(result.tools?.sandbox?.tools?.deny).toContain("sessions_send");
  });

  it("merges with existing deny list", () => {
    const configWithExisting: OpenClawConfig = {
      agents: { defaults: {} },
      tools: {
        sandbox: {
          tools: {
            deny: ["existing_tool"],
          },
        },
      },
    } as OpenClawConfig;

    const result = createWorkerConfigWithToolDeny(configWithExisting, ["message"]);

    expect(result.tools?.sandbox?.tools?.deny).toContain("existing_tool");
    expect(result.tools?.sandbox?.tools?.deny).toContain("message");
  });

  it("does not duplicate entries", () => {
    const result = createWorkerConfigWithToolDeny(baseConfig, [
      "message",
      "message",
      "sessions_send",
    ]);

    const denyList = result.tools?.sandbox?.tools?.deny ?? [];
    expect(denyList.filter((t) => t === "message").length).toBe(1);
  });

  it("preserves other config fields", () => {
    const configWithOtherFields: OpenClawConfig = {
      agents: {
        defaults: {
          model: "openai/gpt-4o",
        },
      },
      tools: {
        sandbox: {
          mode: "all",
        },
      },
    } as OpenClawConfig;

    const result = createWorkerConfigWithToolDeny(configWithOtherFields, ["message"]);

    expect(result.agents?.defaults?.model).toBe("openai/gpt-4o");
    // @ts-expect-error - mode property exists at runtime but not in type
    expect(result.tools?.sandbox?.mode).toBe("all");
    expect(result.tools?.sandbox?.tools?.deny).toContain("message");
  });

  it("handles undefined existing config.tools", () => {
    const result = createWorkerConfigWithToolDeny(baseConfig, ["cron"]);

    expect(result.tools).toBeDefined();
    expect(result.tools?.sandbox).toBeDefined();
    expect(result.tools?.sandbox?.tools?.deny).toContain("cron");
  });

  it("handles partial existing config", () => {
    const configWithPartial: OpenClawConfig = {
      agents: { defaults: {} },
      tools: {},
    } as OpenClawConfig;

    const result = createWorkerConfigWithToolDeny(configWithPartial, ["gateway"]);

    expect(result.tools?.sandbox?.tools?.deny).toContain("gateway");
  });
});

describe("workerToolDeny default list", () => {
  it("includes message tool", () => {
    const baseConfig = {} as OpenClawConfig;
    const result = createWorkerConfigWithToolDeny(baseConfig, ["message"]);
    expect(result.tools?.sandbox?.tools?.deny).toContain("message");
  });

  it("includes sessions_send tool", () => {
    const baseConfig = {} as OpenClawConfig;
    const result = createWorkerConfigWithToolDeny(baseConfig, ["sessions_send"]);
    expect(result.tools?.sandbox?.tools?.deny).toContain("sessions_send");
  });

  it("includes cron tool", () => {
    const baseConfig = {} as OpenClawConfig;
    const result = createWorkerConfigWithToolDeny(baseConfig, ["cron"]);
    expect(result.tools?.sandbox?.tools?.deny).toContain("cron");
  });

  it("includes gateway tool", () => {
    const baseConfig = {} as OpenClawConfig;
    const result = createWorkerConfigWithToolDeny(baseConfig, ["gateway"]);
    expect(result.tools?.sandbox?.tools?.deny).toContain("gateway");
  });

  it("includes nodes tool", () => {
    const baseConfig = {} as OpenClawConfig;
    const result = createWorkerConfigWithToolDeny(baseConfig, ["nodes"]);
    expect(result.tools?.sandbox?.tools?.deny).toContain("nodes");
  });

  it("includes canvas tool", () => {
    const baseConfig = {} as OpenClawConfig;
    const result = createWorkerConfigWithToolDeny(baseConfig, ["canvas"]);
    expect(result.tools?.sandbox?.tools?.deny).toContain("canvas");
  });
});
