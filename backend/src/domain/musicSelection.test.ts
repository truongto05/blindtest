import { describe, expect, it } from "vitest";
import { PublicServiceError } from "../services/http";
import { isCorrectAnswer } from "./answer";
import type { MusicTrack } from "./music";
import {
  answerValue,
  canCreateMusicQuestion,
  createMusicQuestion,
  recordingKey,
  selectNextTrack,
  shuffle,
  uniqueAnswers,
} from "./musicSelection";

const titles = [
  "Nébuleuse",
  "Boussole",
  "Vertige",
  "Oxygène",
  "Horizons",
  "Cathédrale",
  "Orage",
  "Satellites",
  "Papillons",
  "Incendie",
];
const artists = [
  "Clara",
  "Phoenix",
  "Bastille",
  "Nirvana",
  "Stromae",
  "Daft Punk",
  "Adele",
  "Sia",
  "Justice",
  "Muse",
];
function track(index: number, overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: index,
    title: titles[index % titles.length],
    artist: artists[index % artists.length],
    preview: `https://audio.invalid/${index}.mp3`,
    cover: "",
    ...overrides,
  };
}
function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

describe("recording identity and non-repeating selection", () => {
  it("shuffles a copy reproducibly without altering input", () => {
    const original = [1, 2, 3, 4];
    expect(shuffle(original, () => 0)).toEqual([2, 3, 4, 1]);
    expect(original).toEqual([1, 2, 3, 4]);
    expect(shuffle(original, random(21))).toEqual(
      shuffle(original, random(21)),
    );
    expect(shuffle([], random(21))).toEqual([]);
  });

  it("identifies editions by normalized title and artist but keeps live and remix recordings", () => {
    const original = track(0, { title: "L’Été", artist: "Björk" });
    for (const title of [
      "L'Ete (2011 Remastered)",
      "L’Été - 2011 Remaster",
      "L’Été [Deluxe Edition]",
      "L’Été (25th Anniversary Edition)",
    ])
      expect(recordingKey(track(1, { title, artist: "Bjork" }))).toBe(
        recordingKey(original),
      );
    for (const title of [
      "L’Été (Live)",
      "L’Été - Extended Remix",
      "L’Été (Acoustic Version)",
      "L’Été (Live Remastered)",
    ])
      expect(recordingKey(track(1, { title, artist: "Bjork" }))).not.toBe(
        recordingKey(original),
      );
    expect(recordingKey(track(1, { title: "Remastered Love" }))).not.toBe(
      recordingKey(track(1, { title: "Love" })),
    );
  });

  it("normalizes valid ISRC and ignores malformed codes", () => {
    expect(recordingKey(track(0, { isrc: "fr-abc-24-12345" }))).toBe(
      "isrc:FRABC2412345",
    );
    expect(recordingKey(track(0, { isrc: "not-an-isrc" }))).toBe(
      recordingKey(track(0)),
    );
  });

  it("excludes played IDs, ISRC aliases and editions even when metadata is missing on one version", () => {
    const source = [
      track(0, { isrc: "FRABC2412345" }),
      track(1, { title: titles[0] + " (2011 Remaster)", artist: artists[0] }),
      track(2, { title: "Other provider label", isrc: "FRABC2412345" }),
      track(3, { title: titles[0] + " (Live)", artist: artists[0] }),
    ];
    expect(selectNextTrack(source, ["1"], random(3)).id).toBe(3);
    expect(
      selectNextTrack(source, [recordingKey(source[0])], random(3)).id,
    ).toBe(3);
    expect(() => selectNextTrack(source, [0, 3])).toThrow(/déjà été joués/);
    expect(() => selectNextTrack(source, [0, 3])).toThrow(PublicServiceError);
  });

  it("spaces the three recent artists when another artist is available", () => {
    const source = [
      track(0),
      track(1),
      track(2),
      track(3),
      track(4, { artist: artists[0] }),
      track(5, { artist: artists[1] }),
      track(6, { artist: artists[2] }),
    ];
    for (let seed = 0; seed < 20; seed++)
      expect(selectNextTrack(source, [0, 1, 2], random(seed)).id).toBe(3);
  });

  it("relaxes artist spacing in a small pool but never repeats a recording", () => {
    const source = [
      track(0),
      track(1),
      track(2, { artist: artists[0] }),
      track(3, { artist: artists[1] }),
    ];
    expect(selectNextTrack(source, [0, 1], random(8)).id).toBe(2);
    expect(selectNextTrack(source, [0, 1, 2], random(8)).id).toBe(3);
    expect(() => selectNextTrack(source, [0, 1, 2, 3], random(8))).toThrow(
      /déjà été joués/,
    );
  });

  it("balances known genres and source coverage instead of following catalogue order", () => {
    for (const key of ["genres", "sourceIds"] as const) {
      const source = Array.from({ length: 8 }, (_, index) =>
        track(index, { [key]: [index < 4 ? "first" : "second"] }),
      );
      const played: Array<string | number> = [];
      let first = 0;
      let second = 0;
      const rng = random(71);
      for (let round = 0; round < source.length; round++) {
        const next = selectNextTrack(source, played, rng);
        played.push(next.id);
        if (next[key]?.[0] === "first") first++;
        else second++;
        expect(Math.abs(first - second)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("has a simple random fallback with unknown metadata and skips unplayable files", () => {
    const source = [track(0, { preview: "" }), track(1), track(2)];
    const next = selectNextTrack(source, ["absent-from-catalogue"], random(2));
    expect([1, 2]).toContain(next.id);
    expect(() => selectNextTrack([], [])).toThrow(PublicServiceError);
  });

  it("never repeats a recording across deterministic small-pool fuzz runs", () => {
    for (let size = 1; size <= 10; size++) {
      for (let seed = 1; seed <= 12; seed++) {
        const originals = Array.from({ length: size }, (_, index) =>
          track(index),
        );
        const source = [
          ...originals,
          ...originals.map((item) => ({
            ...item,
            id: `${item.id}-edition`,
            title: `${item.title} (2024 Remaster)`,
          })),
        ];
        const played: Array<string | number> = [];
        const identities = new Set<string>();
        const rng = random(seed);
        for (let round = 0; round < size; round++) {
          const next = selectNextTrack(source, played, rng);
          expect(identities.has(recordingKey(next))).toBe(false);
          identities.add(recordingKey(next));
          played.push(next.id);
        }
        expect(() => selectNextTrack(source, played, rng)).toThrow(
          PublicServiceError,
        );
      }
    }
  });
});

describe("unambiguous and related music choices", () => {
  it("formats both answers and deduplicates normalized display labels", () => {
    expect(answerValue(track(0), "both")).toBe("Clara — Nébuleuse");
    expect(
      uniqueAnswers(
        [
          track(0, { title: "L’Été" }),
          track(1, { title: "Ete" }),
          track(2, { title: "The" }),
        ],
        "title",
      ),
    ).toEqual(["L’Été"]);
  });

  it("selects only a feasible random question type for a single-artist catalogue", () => {
    const source = Array.from({ length: 5 }, (_, index) =>
      track(index, { artist: "Phoenix" }),
    );
    expect(canCreateMusicQuestion(source, source[0], "artist")).toBe(false);
    expect(canCreateMusicQuestion(source, source[0], "random")).toBe(true);
    for (let seed = 1; seed <= 20; seed++) {
      const question = createMusicQuestion(
        source,
        source[0],
        "random",
        "choices",
        random(seed),
      );
      expect(question.questionType).toBe("title");
      expect(question.choices).toHaveLength(4);
    }
  });

  it("filters infeasible tracks before selecting the next QCM", () => {
    const source = [
      track(9, { artist: "The" }),
      ...Array.from({ length: 4 }, (_, index) => track(index)),
    ];
    const next = selectNextTrack(source, [], () => 0.999, {
      answerMode: "choices",
      answerType: "artist",
    });
    expect(next.id).not.toBe(9);
    expect(canCreateMusicQuestion(source, next, "artist")).toBe(true);
    expect(() =>
      selectNextTrack(source.slice(0, 3), [], random(1), {
        answerMode: "choices",
        answerType: "artist",
      }),
    ).toThrow(/sans ambiguïté/);
  });

  it("rejects alternative spellings accepted by the real matcher in either direction", () => {
    const source = [
      track(0, { title: "Starship" }),
      track(1, { title: "Starships" }),
      track(2, { title: "STARSHIP" }),
      track(3),
      track(4),
      track(5),
      track(6),
    ];
    const question = createMusicQuestion(
      source,
      source[0],
      "title",
      "choices",
      random(81),
    );
    expect(question.choices).not.toContain("Starships");
    expect(question.choices).not.toContain("STARSHIP");
    expect(
      question.choices.filter((answer) => isCorrectAnswer(answer, question)),
    ).toEqual(["Starship"]);
    for (const first of question.choices)
      for (const second of question.choices)
        if (first !== second)
          expect(
            isCorrectAnswer(first, { ...question, correctAnswer: second }),
          ).toBe(false);
  });

  it("does not use another edition of the correct recording as a wrong answer", () => {
    const source = [
      track(0),
      track(1, { title: `${titles[0]} (Deluxe Edition)`, artist: artists[0] }),
      track(2),
      track(3),
      track(4),
      track(5),
    ];
    const question = createMusicQuestion(
      source,
      source[0],
      "title",
      "choices",
      random(13),
    );
    expect(question.choices).not.toContain(source[1].title);
  });

  it("prefers related genres and sources while varying the neighboring distractors", () => {
    const selected = track(0, { genres: ["rock"], sourceIds: ["rock-source"] });
    const related = Array.from({ length: 5 }, (_, index) =>
      track(index + 1, { genres: ["rock"], sourceIds: ["rock-source"] }),
    );
    const unrelated = [
      track(7, { genres: ["jazz"], sourceIds: ["jazz-source"] }),
      track(8, { genres: ["jazz"] }),
    ];
    const variations = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const question = createMusicQuestion(
        [selected, ...unrelated, ...related],
        selected,
        "title",
        "choices",
        random(seed * 104729),
      );
      const alternatives = question.choices.filter(
        (value) => value !== selected.title,
      );
      for (const value of alternatives)
        expect(related.map((item) => item.title)).toContain(value);
      variations.add(alternatives.sort().join("|"));
    }
    expect(variations.size).toBeGreaterThan(1);
  });

  it("finds a feasible triple beyond an ambiguous greedy first choice", () => {
    const source = [
      "Zèbre",
      "abcdefghij",
      "Xbcdefghij",
      "aXcdefghij",
      "abXdefghij",
    ].map((title, index) => track(index, { title }));
    expect(canCreateMusicQuestion(source, source[0], "title")).toBe(true);
    const question = createMusicQuestion(
      source,
      source[0],
      "title",
      "choices",
      () => 0.999,
    );
    expect(question.choices).not.toContain("abcdefghij");
    expect(question.choices).toEqual(
      expect.arrayContaining(["Xbcdefghij", "aXcdefghij", "abXdefghij"]),
    );
  });

  it("prefers other titles by the same artist when the catalogue permits", () => {
    const source = Array.from({ length: 8 }, (_, index) =>
      track(index, index < 4 ? { artist: "Clara" } : {}),
    );
    const question = createMusicQuestion(
      source,
      source[0],
      "title",
      "choices",
      random(93),
    );
    expect(question.choices.sort()).toEqual(
      source
        .slice(0, 4)
        .map((item) => item.title)
        .sort(),
    );
  });

  it("uses relative catalogue popularity rather than a fabricated difficulty score", () => {
    const source = Array.from({ length: 10 }, (_, index) =>
      track(index, {
        popularity: [100, 101, 103, 105, 110, 800, 1500, 1900, 6000, 9000][
          index
        ],
      }),
    );
    const question = createMusicQuestion(
      source,
      source[0],
      "title",
      "choices",
      random(63),
    );
    for (const value of question.choices.filter(
      (answer) => answer !== source[0].title,
    ))
      expect(source.slice(1, 5).map((item) => item.title)).toContain(value);
  });

  it("allows a single input question, but reports insufficient QCM alternatives", () => {
    const source = [track(0)];
    expect(canCreateMusicQuestion(source, source[0], "title", "input")).toBe(
      true,
    );
    expect(
      createMusicQuestion(source, source[0], "title", "input", random(1))
        .choices,
    ).toEqual([]);
    expect(() => createMusicQuestion(source, source[0], "title")).toThrow(
      /saisie libre/,
    );
    expect(
      canCreateMusicQuestion(
        source,
        track(0, { preview: "" }),
        "title",
        "input",
      ),
    ).toBe(false);
  });

  it("keeps four pairwise-distinct answers or clearly rejects small fuzz catalogues", () => {
    for (let size = 1; size <= 10; size++) {
      const source = Array.from({ length: size }, (_, index) => track(index));
      for (let seed = 1; seed <= 8; seed++) {
        for (const type of ["artist", "title", "both", "random"] as const) {
          if (!canCreateMusicQuestion(source, source[0], type)) {
            expect(() =>
              createMusicQuestion(
                source,
                source[0],
                type,
                "choices",
                random(seed),
              ),
            ).toThrow(PublicServiceError);
            continue;
          }
          const question = createMusicQuestion(
            source,
            source[0],
            type,
            "choices",
            random(seed),
          );
          expect(question.choices).toHaveLength(4);
          expect(new Set(question.choices).size).toBe(4);
          expect(
            question.choices.filter((answer) =>
              isCorrectAnswer(answer, question),
            ),
          ).toEqual([question.correctAnswer]);
          for (const first of question.choices)
            for (const second of question.choices)
              if (first !== second)
                expect(
                  isCorrectAnswer(first, {
                    ...question,
                    correctAnswer: second,
                  }),
                ).toBe(false);
        }
      }
    }
  });
});
