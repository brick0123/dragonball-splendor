// 게임 상태 모델 + 팩토리 + 조회 헬퍼.
// 상태는 가변(mutable). 몬테카를로는 cloneGame 으로 복제 후 분기한다.
import type { BallColor, CardDef, Color, Tier } from "./types";
import { COLORS, isNoble } from "./types";
import { CARDS_BY_ID, deckOf } from "@/data/cards";
import { INITIAL_BALL_SUPPLY, MAX_BALLS_IN_HAND, MAX_RESERVED, REVEAL_PER_STAGE } from "@/data/balls";
import { Rng } from "./rng";

export interface PlayerState {
  readonly id: number;
  readonly isHuman: boolean;
  /** 보유 구슬(컬러 5색 + gold 궁극의 드래곤볼). */
  balls: Record<BallColor, number>;
  /** 누적 컬러 보너스. 획득(액션4) 시 증가, 진화 시 불변, 감소 없음. */
  bonus: Record<Color, number>;
  /** 보관(예약) 카드 id. 최대 MAX_RESERVED. */
  reserved: string[];
  /** 타일 위 점수 카드 id(진화 시 하위는 제거·상위 추가). */
  scored: string[];
  /** 진화 횟수(tie-breaker 1순위). */
  evolutions: number;
}

export interface GameState {
  readonly rng: Rng;
  readonly numPlayers: number;
  supply: Record<BallColor, number>;
  /** 단계별 남은 덱(top = 배열 끝). */
  decks: Record<Tier, string[]>;
  /** 공개 카드(stage: 최대 REVEAL_PER_STAGE, rare/legendary: 최대 1). */
  board: Record<Tier, string[]>;
  players: PlayerState[];
  currentPlayer: number;
  startingPlayer: number;
  /** 누군가 18점 도달 → 현재 라운드 종료 시 게임 종료. */
  triggeredEnd: boolean;
  ended: boolean;
  /** 이번 턴 진화 사용 여부(턴당 1회). */
  evolvedThisTurn: boolean;
}

const TIERS: readonly Tier[] = [1, 2, 3, "rare", "legendary"];
export const STAGE_TIERS: readonly (1 | 2 | 3)[] = [1, 2, 3];

export function emptyBallMap(): Record<BallColor, number> {
  return { red: 0, blue: 0, black: 0, pink: 0, yellow: 0, gold: 0 };
}

export function emptyColorMap(): Record<Color, number> {
  return { red: 0, blue: 0, black: 0, pink: 0, yellow: 0 };
}

export function cardOf(id: string): CardDef {
  const c = CARDS_BY_ID[id];
  if (!c) throw new Error(`unknown card id: ${id}`);
  return c;
}

/** 보유 볼 총합(컬러 + 마스터). 10 한도 검사용. */
export function handBallCount(p: PlayerState): number {
  let n = 0;
  for (const c of COLORS) n += p.balls[c];
  return n + p.balls.gold;
}

/** 할인 후 비용(컬러별). 보너스가 초과해도 0 이하로 내려가지 않는다. */
export function discountedCost(card: CardDef, bonus: Record<Color, number>): Partial<Record<Color, number>> {
  const out: Partial<Record<Color, number>> = {};
  for (const c of COLORS) {
    const raw = card.cost[c] ?? 0;
    const after = Math.max(0, raw - bonus[c]);
    if (after > 0) out[c] = after;
  }
  return out;
}

/** 컬러별 요구량에 대해, 부족분을 궁극의 드래곤볼로 보충해야 하는 개수. */
export function goldNeeded(cost: Partial<Record<Color, number>>, p: PlayerState): number {
  let need = 0;
  for (const c of COLORS) {
    const req = cost[c] ?? 0;
    const have = p.balls[c];
    if (req > have) need += req - have;
  }
  return need;
}

/** 플레이어가 카드를 획득 가능한지(비용 관점). 희귀/전설은 궁극의 드래곤볼 1개 추가 필요. */
export function canAfford(p: PlayerState, card: CardDef): boolean {
  const cost = discountedCost(card, p.bonus);
  let gold = goldNeeded(cost, p);
  if (isNoble(card.tier)) gold += 1; // 희귀/전설: 궁극의 드래곤볼 1개 필수
  return p.balls.gold >= gold;
}

/** 플레이어 점수 = 타일 위(scored) 카드 점수 합. */
export function playerPoints(p: PlayerState): number {
  let n = 0;
  for (const id of p.scored) n += cardOf(id).points;
  return n;
}

/** 보드 전체 카드 id 순회(legal action 탐색용). */
export function boardCardIds(s: GameState): string[] {
  const out: string[] = [];
  for (const t of TIERS) for (const id of s.board[t]) out.push(id);
  return out;
}

/** 특정 tier 보드에서 해당 id 의 인덱스. 없으면 -1. */
export function boardIndex(s: GameState, tier: Tier, id: string): number {
  return s.board[tier].indexOf(id);
}

function reveal(state: GameState, tier: Tier, n: number): void {
  const deck = state.decks[tier];
  for (let i = 0; i < n && deck.length > 0; i++) {
    state.board[tier].push(deck.pop()!);
  }
}

export function createGame(seed: number, numPlayers = 4, humanIndex = 0): GameState {
  const rng = new Rng(seed);
  const decks = {} as Record<Tier, string[]>;
  const board = {} as Record<Tier, string[]>;
  for (const t of TIERS) {
    const ids = rng.shuffle(deckOf(t).map((c) => c.id));
    decks[t] = ids;
    board[t] = [];
  }
  const players: PlayerState[] = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      id: i,
      isHuman: i === humanIndex,
      balls: emptyBallMap(),
      bonus: emptyColorMap(),
      reserved: [],
      scored: [],
      evolutions: 0,
    });
  }
  const state: GameState = {
    rng,
    numPlayers,
    supply: { ...INITIAL_BALL_SUPPLY },
    decks,
    board,
    players,
    currentPlayer: rng.int(numPlayers),
    startingPlayer: 0, // 임시 — 아래에서 갱신
    triggeredEnd: false,
    ended: false,
    evolvedThisTurn: false,
  };
  state.startingPlayer = state.currentPlayer;
  for (const t of STAGE_TIERS) reveal(state, t, REVEAL_PER_STAGE);
  reveal(state, "rare", 1);
  reveal(state, "legendary", 1);
  return state;
}

/** 깊은 복제(몬테카를로 분기용). RNG 도 독립 복제. */
export function cloneGame(s: GameState): GameState {
  const decks = {} as Record<Tier, string[]>;
  const board = {} as Record<Tier, string[]>;
  for (const t of TIERS) {
    decks[t] = s.decks[t].slice();
    board[t] = s.board[t].slice();
  }
  const players = s.players.map((p) => ({
    id: p.id,
    isHuman: p.isHuman,
    balls: { ...p.balls },
    bonus: { ...p.bonus },
    reserved: p.reserved.slice(),
    scored: p.scored.slice(),
    evolutions: p.evolutions,
  }));
  return {
    rng: s.rng.clone(),
    numPlayers: s.numPlayers,
    supply: { ...s.supply },
    decks,
    board,
    players,
    currentPlayer: s.currentPlayer,
    startingPlayer: s.startingPlayer,
    triggeredEnd: s.triggeredEnd,
    ended: s.ended,
    evolvedThisTurn: s.evolvedThisTurn,
  };
}

/** 보드에서 카드 제거 후 덱에서 보충. */
export function refillBoard(state: GameState, tier: Tier, id: string): void {
  const arr = state.board[tier];
  const idx = arr.indexOf(id);
  if (idx >= 0) arr.splice(idx, 1);
  const limit = tier === "rare" || tier === "legendary" ? 1 : REVEAL_PER_STAGE;
  while (arr.length < limit && state.decks[tier].length > 0) {
    arr.push(state.decks[tier].pop()!);
  }
}

/** 최대 보관 가능 여부. */
export function canReserveMore(p: PlayerState): boolean {
  return p.reserved.length < MAX_RESERVED;
}

/** 핸드 볼 한도. */
export function withinBallLimit(p: PlayerState, add: number): boolean {
  return handBallCount(p) + add <= MAX_BALLS_IN_HAND;
}
