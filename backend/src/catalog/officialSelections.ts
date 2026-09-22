export const OFFICIAL_CATALOG_VERSION = "2026-09-15.1";

export type CatalogSource = {
  id: string;
  label: string;
  genres: string[];
  weight: number;
};
export type OfficialSelection = {
  id: string;
  name: string;
  description: string;
  sources: CatalogSource[];
};

const source = (id: string, label: string, genre: string): CatalogSource => ({
  id,
  label,
  genres: [genre],
  weight: 1,
});
const worldwide = source("3155776842", "Top Worldwide", "hits");
const pop = source("1083902971", "Poptop", "pop");
const popEssentials = source("1036183001", "Pop Essentials", "pop");
const rap = source("3272614282", "Rapstars", "rap");
const rapClassics = source(
  "1999435002",
  "Rap Français - Les Classiques · Digster France",
  "rap",
);
const rapUs = source("1677006641", "Hot Urban", "rapus");
const hipHopEssentials = source(
  "2054469264",
  "Hip Hop : Essentials · Digster ZA",
  "rapus",
);
const eighties = source("1163842311", "En mode 80", "80s");
const eightiesHits = source("867825522", "80s Hits", "80s");
const rock = source("1306931615", "Rock Essentials", "rock");
const rock2000 = source("1419215845", "2000s Rock", "rock");
const electro = source("1902101402", "Electronic Hits", "electro");
const electroEssentials = source(
  "3801761042",
  "Electronic Essentials",
  "electro",
);
const french = source(
  "1420459465",
  "Essentiels variété française",
  "francaise",
);
const frenchCurrent = source(
  "788022051",
  "Les Variétés françaises",
  "francaise",
);

// These are Pulse selections of public sources, not Deezer partnerships.
// Source labels describe provenance, not an individually verified genre/year.
export const OFFICIAL_SELECTIONS: OfficialSelection[] = [
  {
    id: "all",
    name: "Tous les hits",
    description:
      "Le classement mondial, les essentiels pop et la variété française.",
    sources: [worldwide, popEssentials, french],
  },
  {
    id: "all_mix",
    name: "Mix soirée",
    description:
      "Pop, rap français, rock, électro, années 80 et variété réunis.",
    sources: [
      popEssentials,
      rapClassics,
      rock,
      electroEssentials,
      eightiesHits,
      french,
    ],
  },
  {
    id: "rap",
    name: "Rap français",
    description: "Rapstars et classiques du rap français.",
    sources: [rap, rapClassics],
  },
  {
    id: "rapus",
    name: "Rap US",
    description: "Hot Urban et essentiels hip-hop.",
    sources: [rapUs, hipHopEssentials],
  },
  {
    id: "80s",
    name: "Années 80",
    description: "Deux sélections d’essentiels des années 80.",
    sources: [eighties, eightiesHits],
  },
  {
    id: "rock",
    name: "Rock",
    description: "Les essentiels et le rock des années 2000.",
    sources: [rock, rock2000],
  },
  {
    id: "electro",
    name: "Électro",
    description: "Electronic Hits et Electronic Essentials.",
    sources: [electro, electroEssentials],
  },
  {
    id: "pop",
    name: "Pop",
    description: "Poptop et les essentiels pop.",
    sources: [pop, popEssentials],
  },
  {
    id: "francaise",
    name: "Variété française",
    description: "Les nouveautés et les essentiels de la variété française.",
    sources: [french, frenchCurrent],
  },
  {
    id: "rnb",
    name: "R&B",
    description: "La sélection R&B Hits.",
    sources: [source("1999466402", "R&B Hits", "rnb")],
  },
  {
    id: "metal",
    name: "Metal",
    description: "La sélection Metal Hits.",
    sources: [source("1388965575", "Metal Hits", "metal")],
  },
  {
    id: "reggae",
    name: "Reggae",
    description: "Les essentiels reggae.",
    sources: [source("2448918882", "Reggae Essentials", "reggae")],
  },
  {
    id: "jazz",
    name: "Jazz",
    description: "Les essentiels jazz.",
    sources: [source("1615514485", "Jazz Essentials", "jazz")],
  },
];

export function getSelectionInfo(id: string): OfficialSelection | undefined {
  const selection = OFFICIAL_SELECTIONS.find((entry) => entry.id === id);
  return selection
    ? {
        ...selection,
        sources: selection.sources.map((entry) => ({
          ...entry,
          genres: [...entry.genres],
        })),
      }
    : undefined;
}
