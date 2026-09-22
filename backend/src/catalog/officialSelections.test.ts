import { describe, expect, it } from "vitest";
import {
  getSelectionInfo,
  OFFICIAL_CATALOG_VERSION,
  OFFICIAL_SELECTIONS,
} from "./officialSelections";

describe("official music selections", () => {
  it("keeps stable unique selection IDs and validated source descriptors", () => {
    expect(OFFICIAL_CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(OFFICIAL_SELECTIONS.map(({ id }) => id).sort()).toEqual(
      [
        "all",
        "all_mix",
        "rap",
        "rapus",
        "80s",
        "rock",
        "electro",
        "pop",
        "francaise",
        "rnb",
        "metal",
        "reggae",
        "jazz",
      ].sort(),
    );
    for (const selection of OFFICIAL_SELECTIONS) {
      expect(selection.name.length).toBeGreaterThan(0);
      expect(new Set(selection.sources.map(({ id }) => id)).size).toBe(
        selection.sources.length,
      );
      for (const source of selection.sources) {
        expect(source.id).toMatch(/^[1-9]\d{0,15}$/);
        expect(source.genres.length).toBeGreaterThan(0);
        expect(source.weight).toBeGreaterThan(0);
      }
    }
  });

  it("makes Hits and Mix genuinely distinct and returns defensive copies", () => {
    const hits = getSelectionInfo("all")!;
    const mix = getSelectionInfo("all_mix")!;
    expect(mix.sources.map(({ id }) => id)).not.toEqual(
      hits.sources.map(({ id }) => id),
    );
    expect(
      new Set(mix.sources.flatMap(({ genres }) => genres)).size,
    ).toBeGreaterThanOrEqual(6);
    hits.sources[0].genres.push("corrupted");
    hits.sources.pop();
    expect(getSelectionInfo("all")!.sources).toHaveLength(3);
    expect(getSelectionInfo("all")!.sources[0].genres).not.toContain(
      "corrupted",
    );
    expect(getSelectionInfo("missing")).toBeUndefined();
  });
});
