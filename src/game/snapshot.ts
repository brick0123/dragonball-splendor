// 게임 상태 직렬화(plain data). Web Worker 전달용 — Rng 인스턴스는 구조적 복제 불가.
import type { BallColor, Color, Tier } from "./types";
import type { GameState, PlayerState } from "./state";
import { Rng } from "./rng";


export interface SnapshotPlayer {
  id: number;
  isHuman: boolean;
  balls: Record<BallColor, number>;
  bonus: Record<Color, number>;
  reserved: string[];
  scored: string[];
  evolutions: number;
}

export interface Snapshot {
  rngState: number;
  numPlayers: number;
  supply: Record<BallColor, number>;
  decks: Record<Tier, string[]>;
  board: Record<Tier, string[]>;
  players: SnapshotPlayer[];
  currentPlayer: number;
  startingPlayer: number;
  triggeredEnd: boolean;
  ended: boolean;
  evolvedThisTurn: boolean;
}

const TIERS: readonly Tier[] = [1, 2, 3, "rare", "legendary"];

export function serialize(s: GameState): Snapshot {
  const decks = {} as Record<Tier, string[]>;
  const board = {} as Record<Tier, string[]>;
  for (const t of TIERS) {
    decks[t] = s.decks[t].slice();
    board[t] = s.board[t].slice();
  }
  return {
    rngState: s.rng.state,
    numPlayers: s.numPlayers,
    supply: { ...s.supply },
    decks,
    board,
    players: s.players.map((p) => ({
      id: p.id,
      isHuman: p.isHuman,
      balls: { ...p.balls },
      bonus: { ...p.bonus },
      reserved: p.reserved.slice(),
      scored: p.scored.slice(),
      evolutions: p.evolutions,
    })),
    currentPlayer: s.currentPlayer,
    startingPlayer: s.startingPlayer,
    triggeredEnd: s.triggeredEnd,
    ended: s.ended,
    evolvedThisTurn: s.evolvedThisTurn,
  };
}

/** Snapshot → 가변 GameState. 카드 id 는 CARDS_BY_ID 로 검증된다. */
export function deserialize(snap: Snapshot): GameState {
  const decks = {} as Record<Tier, string[]>;
  const board = {} as Record<Tier, string[]>;
  for (const t of TIERS) {
    decks[t] = snap.decks[t].slice();
    board[t] = snap.board[t].slice();
  }
  const players: PlayerState[] = snap.players.map((p) => ({
    id: p.id,
    isHuman: p.isHuman,
    balls: { ...p.balls },
    bonus: { ...p.bonus },
    reserved: p.reserved.slice(),
    scored: p.scored.slice(),
    evolutions: p.evolutions,
  }));
  return {
    rng: new Rng(snap.rngState),
    numPlayers: snap.numPlayers,
    supply: { ...snap.supply },
    decks,
    board,
    players,
    currentPlayer: snap.currentPlayer,
    startingPlayer: snap.startingPlayer,
    triggeredEnd: snap.triggeredEnd,
    ended: snap.ended,
    evolvedThisTurn: snap.evolvedThisTurn,
  };
}
