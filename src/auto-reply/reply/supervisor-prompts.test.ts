/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  buildSupervisorPrompt,
  buildRevisionPrompt,
  extractDraftTextFromPayloads,
} from "./supervisor-prompts.js";
import type { ResolvedSupervisorConfig } from "./supervisor-types.js";

describe("buildSupervisorPrompt", () => {
  const defaultConfig: ResolvedSupervisorConfig = {
    enabled: false,
    maxPasses: 3,
    workerToolDeny: ["message", "sessions_send"],
    maxRejectHistory: 3,
    suppressVisibleDrafts: true,
    reviewerDisableTools: true,
  };

  it("includes original task in prompt", () => {
    const prompt = buildSupervisorPrompt({
      originalTask: "Tell me a joke",
      draft: {
        draftText: "Why did the chicken cross the road?",
        payloads: [],
        provider: "openai",
        model: "gpt-4o",
      },
      rejectHistory: [],
      config: defaultConfig,
    });

    expect(prompt).toContain("Tell me a joke");
    expect(prompt).toContain("Why did the chicken cross the road?");
  });

  it("includes rejection history when present", () => {
    const prompt = buildSupervisorPrompt({
      originalTask: "Test task",
      draft: {
        draftText: "Draft response",
        payloads: [],
        provider: "openai",
        model: "gpt-4o",
      },
      rejectHistory: [
        {
          decision: "reject",
          summary: "Too short",
          reasons: ["Response was too brief"],
          revisionInstructions: ["Add more details"],
          source: "reviewer",
        },
      ],
      config: defaultConfig,
    });

    expect(prompt).toContain("Previous Rejection History");
    expect(prompt).toContain("Too short");
  });

  it("includes extra reviewer prompt when configured", () => {
    const configWithExtra: ResolvedSupervisorConfig = {
      ...defaultConfig,
      extraReviewerPrompt: "Also check for spelling errors",
    };

    const prompt = buildSupervisorPrompt({
      originalTask: "Test task",
      draft: {
        draftText: "Draft response",
        payloads: [],
        provider: "openai",
        model: "gpt-4o",
      },
      rejectHistory: [],
      config: configWithExtra,
    });

    expect(prompt).toContain("Also check for spelling errors");
  });
});

describe("buildRevisionPrompt", () => {
  it("includes revision instructions for rejected draft", () => {
    const prompt = buildRevisionPrompt({
      originalTask: "Original task",
      latestVerdict: {
        decision: "reject",
        summary: "Too short",
        reasons: ["Response was too brief"],
        revisionInstructions: ["Add more details", "Be more specific"],
        source: "reviewer",
      },
      rejectHistory: [],
    });

    expect(prompt).toContain("Revision Required");
    expect(prompt).toContain("Too short");
    expect(prompt).toContain("Add more details");
    expect(prompt).toContain("Original task");
  });

  it("includes previous rejection history", () => {
    const prompt = buildRevisionPrompt({
      originalTask: "Original task",
      latestVerdict: {
        decision: "reject",
        summary: "Still needs work",
        reasons: ["Still too brief"],
        revisionInstructions: ["Try again"],
        source: "reviewer",
      },
      rejectHistory: [
        {
          decision: "reject",
          summary: "First rejection",
          reasons: [],
          revisionInstructions: [],
          source: "reviewer",
        },
      ],
    });

    expect(prompt).toContain("Full History");
    expect(prompt).toContain("First rejection");
  });
});

describe("extractDraftTextFromPayloads", () => {
  it("extracts text from text payload", () => {
    const payloads = [{ text: "Hello world" }];
    expect(extractDraftTextFromPayloads(payloads)).toBe("Hello world");
  });

  it("returns empty string for empty array", () => {
    expect(extractDraftTextFromPayloads([])).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(extractDraftTextFromPayloads(undefined as any)).toBe("");
  });

  it("extracts from first payload with text property", () => {
    const payloads = [{}, { text: "First text" }, { text: "Second text" }];
    expect(extractDraftTextFromPayloads(payloads)).toBe("First text");
  });

  it("stringifies when no text property found", () => {
    const payloads = [{ type: "image", url: "http://example.com/image.png" }] as const;
    const result = extractDraftTextFromPayloads(payloads as any);
    expect(result).toContain("image");
    expect(result).toContain("example.com");
  });
});

describe("buildSupervisorPrompt edge cases", () => {
  const defaultConfig: ResolvedSupervisorConfig = {
    enabled: false,
    maxPasses: 3,
    workerToolDeny: [],
    maxRejectHistory: 3,
    suppressVisibleDrafts: true,
    reviewerDisableTools: true,
  };

  it("includes evaluation criteria in prompt", () => {
    const prompt = buildSupervisorPrompt({
      originalTask: "Test",
      draft: { draftText: "Test response", payloads: [], provider: "openai", model: "gpt-4o" },
      rejectHistory: [],
      config: defaultConfig,
    });

    expect(prompt).toContain("Accuracy");
    expect(prompt).toContain("Completeness");
    expect(prompt).toContain("Tone");
    expect(prompt).toContain("Safety");
    expect(prompt).toContain("Format");
  });

  it("includes output format instructions", () => {
    const prompt = buildSupervisorPrompt({
      originalTask: "Test",
      draft: { draftText: "Test response", payloads: [], provider: "openai", model: "gpt-4o" },
      rejectHistory: [],
      config: defaultConfig,
    });

    expect(prompt).toContain("decision");
    expect(prompt).toContain("accept");
    expect(prompt).toContain("reject");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("JSON");
  });

  it("limits reject history based on maxRejectHistory", () => {
    const configWithLowLimit: ResolvedSupervisorConfig = {
      ...defaultConfig,
      maxRejectHistory: 1,
    };

    const prompt = buildSupervisorPrompt({
      originalTask: "Test",
      draft: { draftText: "Test response", payloads: [], provider: "openai", model: "gpt-4o" },
      rejectHistory: [
        {
          decision: "reject",
          summary: "First",
          reasons: [],
          revisionInstructions: [],
          source: "reviewer",
        },
        {
          decision: "reject",
          summary: "Second",
          reasons: [],
          revisionInstructions: [],
          source: "reviewer",
        },
        {
          decision: "reject",
          summary: "Third",
          reasons: [],
          revisionInstructions: [],
          source: "reviewer",
        },
      ],
      config: configWithLowLimit,
    });

    // All should be included in the prompt (the function passes them all, the slicing happens in controller)
    expect(prompt).toContain("First");
    expect(prompt).toContain("Second");
    expect(prompt).toContain("Third");
  });
});

describe("buildRevisionPrompt edge cases", () => {
  it("returns original task for accept verdict", () => {
    const prompt = buildRevisionPrompt({
      originalTask: "Original task",
      latestVerdict: {
        decision: "accept",
        summary: "Looks good",
        source: "reviewer",
      },
      rejectHistory: [],
    });

    expect(prompt).toContain("Original task");
  });

  it("handles empty revision instructions", () => {
    const prompt = buildRevisionPrompt({
      originalTask: "Original task",
      latestVerdict: {
        decision: "reject",
        summary: "Bad response",
        reasons: ["Too short"],
        revisionInstructions: [],
        source: "reviewer",
      },
      rejectHistory: [],
    });

    expect(prompt).toContain("Please address the reasons above");
  });

  it("handles multiple reasons and instructions", () => {
    const prompt = buildRevisionPrompt({
      originalTask: "Original task",
      latestVerdict: {
        decision: "reject",
        summary: "Multiple issues",
        reasons: ["Too short", "Incorrect facts", "Poor tone"],
        revisionInstructions: ["Add more details", "Verify facts", "Be more polite"],
        source: "reviewer",
      },
      rejectHistory: [],
    });

    expect(prompt).toContain("Too short");
    expect(prompt).toContain("Incorrect facts");
    expect(prompt).toContain("Poor tone");
    expect(prompt).toContain("Add more details");
    expect(prompt).toContain("Verify facts");
    expect(prompt).toContain("Be more polite");
  });
});
