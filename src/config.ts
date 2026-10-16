export const ISLANDS = [
  { id: "home", name: "The Home Meadow", x: 0, z: 0, r: 50, seed: 12 },
  {
    id: "dawn",
    name: "The Garden of First Light",
    x: 92,
    z: -10,
    r: 19,
    seed: 24,
  },
  { id: "fern", name: "The Fern Sanctuary", x: -57, z: -83, r: 20, seed: 39 },
  { id: "ember", name: "The Ember Garden", x: -57, z: 83, r: 18, seed: 56 },
] as const;
export const SHRINES = [
  {
    id: "dawn",
    x: 97,
    z: -13,
    name: "First light",
    message: "The first garden remembers the sun.",
    color: 0xffdc8c,
  },
  {
    id: "fern",
    x: -61,
    z: -89,
    name: "Quiet roots",
    message: "Even this high, there is a place to take root.",
    color: 0xc4e8a3,
  },
  {
    id: "ember",
    x: -60,
    z: 89,
    name: "A little warmth",
    message: "Something warm stirs beneath the stone.",
    color: 0xffbb83,
  },
  {
    id: "home",
    x: 0,
    z: -8,
    name: "The heart of the meadow",
    message: "All the gardens are awake. Welcome home.",
    color: 0xffe3aa,
  },
] as const;
export const SPAWN = { x: 0, z: 15 };
export const ASSET_IDS = [
  "lantern",
  "explorer",
  "island",
  "grass",
  "bridge",
  "grass-tall",
  "flowers-white",
  "flowers-purple",
  "fern",
  "rock",
  "volcano",
  "shed",
  "fence",
  "shrine",
  "path",
  "cloud",
] as const;
export type AssetId = (typeof ASSET_IDS)[number];
