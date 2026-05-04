import { describe, expect, it } from "vitest";
import {
  STATIC_QUALITY_RULES,
  USER_BANNED_WORDS_RULE_ID,
  USER_NOTES_RULE_ID,
  buildBlocklistPromptSection,
  buildUserOverridesPromptSection,
  getActiveQualityRules,
  pickPromptInstruction,
  type QualityRule,
  type RuleContext,
} from "@/lib/ai/quality-rules";

describe("getActiveQualityRules", () => {
  it("returns just the static rules when no user input", () => {
    const rules = getActiveQualityRules({});
    const ids = rules.map((r) => r.id);
    expect(ids).not.toContain(USER_BANNED_WORDS_RULE_ID);
    expect(ids).not.toContain(USER_NOTES_RULE_ID);
    expect(rules.length).toBe(STATIC_QUALITY_RULES.length);
  });

  it("prepends a user_banned_words rule when banned words are supplied", () => {
    const rules = getActiveQualityRules({ userBannedWords: ["delve", "leverage"] });
    const ubw = rules.find((r) => r.id === USER_BANNED_WORDS_RULE_ID);
    expect(ubw).toBeDefined();
    expect(ubw!.promptInstructionDefault).toContain("delve, leverage");
    expect(ubw!.promptInstructionDefault).toContain("Not once. Zero.");
    expect(ubw!.action).toBe("flag");
    expect(ubw!.defaultThreshold).toBe(0);
  });

  it("prepends a user_notes rule when notes are supplied", () => {
    const rules = getActiveQualityRules({ userNotes: "Never end with a question." });
    const un = rules.find((r) => r.id === USER_NOTES_RULE_ID);
    expect(un).toBeDefined();
    expect(un!.promptInstructionDefault).toContain("Never end with a question.");
  });

  it("strips empty banned words and skips the rule when nothing remains", () => {
    const rules = getActiveQualityRules({ userBannedWords: ["", "   "] });
    expect(rules.find((r) => r.id === USER_BANNED_WORDS_RULE_ID)).toBeUndefined();
  });
});

describe("pickPromptInstruction", () => {
  const emDashRule = STATIC_QUALITY_RULES.find((r) => r.id === "struct_em_dash") as QualityRule;

  it("returns default when userSettingsFlag is false/undefined", () => {
    expect(pickPromptInstruction(emDashRule, {})).toBe(emDashRule.promptInstructionDefault);
    expect(pickPromptInstruction(emDashRule, { tellFlagEmDash: false })).toBe(
      emDashRule.promptInstructionDefault,
    );
  });

  it("returns strict when userSettingsFlag is true", () => {
    expect(pickPromptInstruction(emDashRule, { tellFlagEmDash: true })).toBe(
      emDashRule.promptInstructionStrict,
    );
  });

  it("returns default when rule has no strict version", () => {
    const noStrict = STATIC_QUALITY_RULES.find((r) => r.id === "struct_no_caps") as QualityRule;
    expect(pickPromptInstruction(noStrict, {})).toBe(noStrict.promptInstructionDefault);
  });

  it("user-derived rules render strict text directly via promptInstructionDefault", () => {
    const ctx: RuleContext = { userBannedWords: ["delve"] };
    const ubw = getActiveQualityRules(ctx).find((r) => r.id === USER_BANNED_WORDS_RULE_ID)!;
    expect(ubw.userSettingsFlag).toBeUndefined();
    expect(pickPromptInstruction(ubw, ctx)).toBe(ubw.promptInstructionDefault);
    expect(pickPromptInstruction(ubw, ctx)).toContain("Not once. Zero.");
  });
});

describe("buildBlocklistPromptSection", () => {
  it("includes WORD CHOICES + STRUCTURAL RULES", () => {
    const section = buildBlocklistPromptSection({});
    expect(section).toContain("WORD CHOICES");
    expect(section).toContain("STRUCTURAL RULES:");
    expect(section).toContain('"use" not "leverage"');
  });

  it("uses the strict em-dash line when tellFlagEmDash=true", () => {
    const section = buildBlocklistPromptSection({ tellFlagEmDash: true });
    expect(section).toContain(
      "Do NOT use em dashes (—) at all. Zero. The user has explicitly banned them.",
    );
    expect(section).not.toContain(
      "Do NOT use em dashes — in more than one sentence per post",
    );
  });

  it("uses the default em-dash line when tellFlagEmDash is unset/false", () => {
    const section = buildBlocklistPromptSection({});
    expect(section).toContain("Do NOT use em dashes — in more than one sentence per post");
    expect(section).not.toContain(
      "Do NOT use em dashes (—) at all. Zero. The user has explicitly banned them.",
    );
  });

  it("does NOT include the user_banned_words / user_notes rules — those go in the overrides block", () => {
    const section = buildBlocklistPromptSection({
      userBannedWords: ["delve"],
      userNotes: "Never end with a question.",
    });
    expect(section).not.toContain("USER PREFERENCES");
    expect(section).not.toContain("Never use these words or characters: delve");
    expect(section).not.toContain("Additional notes from the user");
  });
});

describe("buildUserOverridesPromptSection", () => {
  it("returns empty string when no user input", () => {
    expect(buildUserOverridesPromptSection({})).toBe("");
  });

  it("renders the strict banned-words instruction when banned words present", () => {
    const section = buildUserOverridesPromptSection({ userBannedWords: ["delve"] });
    expect(section).toContain("USER PREFERENCES (HARD RULES, NO EXCEPTIONS):");
    expect(section).toContain("Never use these words or characters: delve");
    expect(section).toContain("This is a hard rule that overrides any other guidance below.");
  });

  it("renders user notes when provided", () => {
    const section = buildUserOverridesPromptSection({
      userNotes: "Never end with a question.",
    });
    expect(section).toContain("USER PREFERENCES (HARD RULES, NO EXCEPTIONS):");
    expect(section).toContain("Additional notes from the user: Never end with a question.");
  });

  it("renders both banned words and user notes together", () => {
    const section = buildUserOverridesPromptSection({
      userBannedWords: ["synergy", "leverage"],
      userNotes: "Never end with a question.",
    });
    expect(section).toContain("Never use these words or characters: synergy, leverage");
    expect(section).toContain("Additional notes from the user: Never end with a question.");
  });
});
