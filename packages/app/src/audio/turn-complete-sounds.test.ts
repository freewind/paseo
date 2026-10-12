import { describe, expect, it } from "vitest";
import {
  DEFAULT_TURN_COMPLETE_SOUND,
  TURN_COMPLETE_SOUND_IDS,
  resolveTurnCompleteSoundId,
} from "./turn-complete-sounds";

describe("resolveTurnCompleteSoundId", () => {
  it("falls back to the default sound without a setting", () => {
    expect(resolveTurnCompleteSoundId()).toBe(DEFAULT_TURN_COMPLETE_SOUND);
  });

  it("falls back to the default sound for an id a newer build added", () => {
    expect(resolveTurnCompleteSoundId("gong")).toBe(DEFAULT_TURN_COMPLETE_SOUND);
  });

  it("keeps every id the settings screen can store", () => {
    for (const id of TURN_COMPLETE_SOUND_IDS) {
      expect(resolveTurnCompleteSoundId(id)).toBe(id);
    }
  });
});
