export type PickTier = "free" | "pro" | "elite";

export type Pick = {
  id: string;
  tier: PickTier;
  competition: string;
  event: string;
  market: string;
  price: string;
  minimum: string;
  implied: number;
  model: number;
  range: string;
  edge: number;
  ev: number;
  stake: string;
  thesis: string;
  risk: string;
  bookmaker: "Bet365";
  capturedAt: string;
};

export type ArchiveEntry = {
  id: string;
  date: string;
  event: string;
  market: string;
  price: string;
  edge: string;
  clv: string;
  result: "WIN" | "LOSS" | "PUSH" | "OPEN" | "DEMO";
  pnl: string;
};

export type Matchday = {
  label: string;
  slug: string;
  date: string;
  picks: Pick[];
  archivePreview: Array<{ id: string; edge: string; clv: string; status: string }>;
};
