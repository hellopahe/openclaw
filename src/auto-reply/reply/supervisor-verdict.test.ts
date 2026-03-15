// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { describe, it, expect } from "vitest";
import type { SupervisorVerdictReject } from "./supervisor-types.js";
import { parseSupervisorVerdict, runDeterministicChecks } from "./supervisor-verdict.js";
import type { DeterministicCheckResult } from "./supervisor-verdict.js";

describe("parseSupervisorVerdict", () => {
  it("parses accept JSON correctly", () => {
    const output = '{"decision": "accept", "summary": "Looks good"}';
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("accept");
    expect(result.summary).toBe("Looks good");
    expect(result.source).toBe("reviewer");
  });

  it("parses reject JSON correctly", () => {
    const output = `{"decision": "reject", "summary": "Needs work", "reasons": ["Missing detail"], "revisionInstructions": ["Add more info"], "severity": "medium"}`;
    const result = parseSupervisorVerdict(output) as SupervisorVerdictReject;

    expect(result.decision).toBe("reject");
    expect(result.summary).toBe("Needs work");
    expect(result.reasons).toEqual(["Missing detail"]);
    expect(result.revisionInstructions).toEqual(["Add more info"]);
    expect(result.severity).toBe("medium");
    expect(result.source).toBe("reviewer");
  });

  it("returns reject when no JSON found", () => {
    const output = "This is just some text without JSON";
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("reject");
    expect(result.source).toBe("parser");
  });

  it("returns reject when decision is missing", () => {
    const output = '{"summary": "No decision"}';
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("reject");
    expect(result.source).toBe("parser");
  });

  it("returns reject when reject has empty reasons", () => {
    const output = '{"decision": "reject", "summary": "Bad", "reasons": []}';
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("reject");
    expect(result.source).toBe("parser");
  });

  it("returns reject for invalid JSON", () => {
    const output = '{"decision": "accept",';
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("reject");
    expect(result.source).toBe("parser");
  });
});

describe("runDeterministicChecks", () => {
  it("returns ok for valid draft", () => {
    const draft = {
      draftText: "This is a valid response with actual content.",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft });
    expect(result.ok).toBe(true);
  });

  it("rejects empty draft", () => {
    const draft = {
      draftText: "",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft }) as DeterministicCheckResult & { ok: false };
    expect(result.ok).toBe(false);
    expect(result.verdict.reasons).toContain("Draft is empty");
  });

  it("rejects whitespace-only draft", () => {
    const draft = {
      draftText: "   \n\t  ",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft });
    expect(result.ok).toBe(false);
  });

  it("rejects template placeholder text", () => {
    const draft = {
      draftText: "I am sorry, I cannot help with that.",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft }) as DeterministicCheckResult & { ok: false };
    expect(result.ok).toBe(false);
    expect(result.verdict.summary).toBe("Template Response");
  });

  it("rejects when final tag is required but missing", () => {
    const draft = {
      draftText: "This is a response without final tag",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({
      draft,
      enforceFinalTag: true,
    }) as DeterministicCheckResult & { ok: false };
    expect(result.ok).toBe(false);
    expect(result.verdict.summary).toBe("Missing Final Tag");
  });

  it("passes when final tag is present", () => {
    const draft = {
      draftText: "<final>This is the final response</final>",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft, enforceFinalTag: true });
    expect(result.ok).toBe(true);
  });
});

describe("parseSupervisorVerdict edge cases", () => {
  it("parses accept with reasons field", () => {
    const output = '{"decision": "accept", "summary": "Good", "reasons": ["Looks fine"]}';
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("accept");
    expect(result.reasons).toEqual(["Looks fine"]);
  });

  it("handles JSON with extra whitespace", () => {
    const output = '  {  "decision"  :  "accept"  ,  "summary"  :  "Test"  }  ';
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("accept");
    expect(result.summary).toBe("Test");
  });

  it("handles JSON with newlines", () => {
    const output = `{
      "decision": "accept",
      "summary": "Test"
    }`;
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("accept");
  });

  it("extracts JSON from text with prefix and suffix", () => {
    const output = 'Here is my response: {"decision": "accept", "summary": "OK"} Thank you.';
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("accept");
    expect(result.summary).toBe("OK");
  });

  it("handles reject without severity", () => {
    const output = '{"decision": "reject", "summary": "Bad", "reasons": ["Error"]}';
    const result = parseSupervisorVerdict(output) as SupervisorVerdictReject;

    expect(result.decision).toBe("reject");
    expect(result.severity).toBeUndefined();
  });

  it("handles reject with all fields", () => {
    const output =
      '{"decision": "reject", "summary": "Failed", "reasons": ["Reason1", "Reason2"], "revisionInstructions": ["Fix1", "Fix2"], "severity": "high"}';
    const result = parseSupervisorVerdict(output) as SupervisorVerdictReject;

    expect(result.decision).toBe("reject");
    expect(result.reasons).toEqual(["Reason1", "Reason2"]);
    expect(result.revisionInstructions).toEqual(["Fix1", "Fix2"]);
    expect(result.severity).toBe("high");
  });

  it("handles undefined revisionInstructions", () => {
    const output = '{"decision": "reject", "summary": "Bad", "reasons": ["Error"]}';
    const result = parseSupervisorVerdict(output) as SupervisorVerdictReject;

    expect(result.decision).toBe("reject");
    expect(result.revisionInstructions).toEqual([]);
  });

  it("returns parser reject for invalid decision value", () => {
    const output = '{"decision": "maybe", "summary": "Test"}';
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("reject");
    expect(result.source).toBe("parser");
  });

  it("returns parser reject for null reasons", () => {
    const output = '{"decision": "reject", "summary": "Bad", "reasons": null}';
    const result = parseSupervisorVerdict(output);

    expect(result.decision).toBe("reject");
    expect(result.source).toBe("parser");
  });
});

describe("runDeterministicChecks edge cases", () => {
  it("rejects multiple template phrases", () => {
    const draft = {
      draftText: "I am unable to help. I cannot process this request.",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft }) as DeterministicCheckResult & { ok: false };
    expect(result.ok).toBe(false);
    expect(result.verdict.summary).toBe("Template Response");
  });

  it("accepts text containing template words in normal context", () => {
    const draft = {
      draftText:
        "I can help you with that. The word 'sorry' appears in this sentence but I'm not actually apologizing.",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft });
    expect(result.ok).toBe(true);
  });

  it("accepts normal use of 'cannot'", () => {
    const draft = {
      draftText: "You cannot proceed without authentication.",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft });
    expect(result.ok).toBe(true);
  });

  it("accepts 'TBD' in technical context", () => {
    const draft = {
      draftText: "The implementation details are TBD after the design review.",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft });
    expect(result.ok).toBe(true);
  });

  it("handles various final tag formats", () => {
    const draft1 = { draftText: "<final/>", payloads: [], provider: "openai", model: "gpt-4o" };
    const draft2 = { draftText: "</final>", payloads: [], provider: "openai", model: "gpt-4o" };
    const draft3 = {
      draftText: "<FINAL>content</FINAL>",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    expect(runDeterministicChecks({ draft: draft1, enforceFinalTag: true }).ok).toBe(true);
    expect(runDeterministicChecks({ draft: draft2, enforceFinalTag: true }).ok).toBe(true);
    expect(runDeterministicChecks({ draft: draft3, enforceFinalTag: true }).ok).toBe(true);
  });

  it("rejects 'coming soon' text", () => {
    const draft = {
      draftText: "This feature is coming soon!",
      payloads: [],
      provider: "openai",
      model: "gpt-4o",
    };

    const result = runDeterministicChecks({ draft }) as DeterministicCheckResult & { ok: false };
    expect(result.ok).toBe(false);
    expect(result.verdict.summary).toBe("Template Response");
  });
});
