import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../types/game";
import { GENRES } from "./settings";
import {
  applyHomeSelection,
  HOME_SELECTIONS,
  selectedHomeSelection,
} from "./selections";

describe("home selections", () => {
  it.each(HOME_SELECTIONS)(
    "connects $name to supported settings and clears private source identifiers",
    (selection) => {
      const previous = {
        ...DEFAULT_SETTINGS,
        rounds: 7,
        timeLimit: 30,
        answerMode: "input" as const,
        pulsePlaylistId: "private-id",
        customPlaylistUrl: "123",
      };
      const settings = applyHomeSelection(previous, selection.id);
      expect(settings).toMatchObject({
        rounds: 7,
        timeLimit: 30,
        answerMode: "input",
        pulsePlaylistId: "",
        customPlaylistUrl: "",
      });
      expect(GENRES.some(([id]) => id === settings.genre)).toBe(true);
      expect(selectedHomeSelection(settings)?.id).toBe(selection.id);
      expect(previous.pulsePlaylistId).toBe("private-id");
    },
  );

  it("uses classic for cinema but preserves progressive for a music selection", () => {
    const progressive = { ...DEFAULT_SETTINGS, mode: "progressive" as const };
    expect(applyHomeSelection(progressive, "films").mode).toBe("classic");
    expect(applyHomeSelection(progressive, "rap").mode).toBe("progressive");
  });

  it("does not claim a preset is selected for a personal playlist", () => {
    expect(
      selectedHomeSelection({ ...DEFAULT_SETTINGS, genre: "pulse" }),
    ).toBeUndefined();
  });
});
