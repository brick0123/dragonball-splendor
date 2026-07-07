// 규칙 엔진: 행동 적용, 보드 보충, 종료 감지, 승자 판정.
import type { BallColor, Color, Tier } from "./types";
import { COLORS } from "./types";
import type { GameState, PlayerState } from "./state";
import { cardOf, playerPoints, refillBoard, withinBallLimit } from "./state";
import type { Evolution, MainAction } from "./actions";
import { legalEvolutions, legalMainActions } from "./actions";

export const WIN_THRESHOLD = 18;
const BALL_COLORS: readonly BallColor[] = [...COLORS, "gold"];

function sameColorSet(a: readonly Color[], b: readonly Color[]): boolean {
  if (a.length !== b.length) return false;
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.every((c, i) => c === bb[i]);
}

function samePay(a: Record<BallColor, number>, b: Record<BallColor, number>): boolean {
  return BALL_COLORS.every((c) => a[c] === b[c]);
}

function sameMainAction(a: MainAction, b: MainAction): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "take3": return b.type === "take3" && sameColorSet(a.colors, b.colors);
    case "take2": return b.type === "take2" && a.color === b.color;
    case "reserve": return b.type === "reserve" && a.cardId === b.cardId;
    case "reserveBlind": return b.type === "reserveBlind" && a.tier === b.tier;
    case "acquire": return b.type === "acquire" && a.cardId === b.cardId && samePay(a.pay, b.pay);
  }
}

export function canApplyMainAction(s: GameState, a: MainAction): boolean {
  return legalMainActions(s).some((legal) => sameMainAction(a, legal));
}

export function canApplyEvolution(s: GameState, e: Evolution): boolean {
  return legalEvolutions(s).some((legal) => legal.sourceId === e.sourceId && legal.targetId === e.targetId);
}

function gainBalls(s: GameState, p: PlayerState, color: BallColor, n: number): void {
  s.supply[color] -= n;
  p.balls[color] += n;
}

function applyTake3(s: GameState, colors: Color[]): void {
  const p = s.players[s.currentPlayer]!;
  for (const c of colors) gainBalls(s, p, c, 1);
}

function applyTake2(s: GameState, color: Color): void {
  const p = s.players[s.currentPlayer]!;
  gainBalls(s, p, color, 2);
}

function tryGainMaster(s: GameState, p: PlayerState): void {
  if (s.supply.gold > 0 && withinBallLimit(p, 1)) {
    s.supply.gold -= 1;
    p.balls.gold += 1;
  }
}

function applyReserve(s: GameState, cardId: string): void {
  const p = s.players[s.currentPlayer]!;
  const card = cardOf(cardId);
  refillBoard(s, card.tier, cardId);
  p.reserved.push(cardId);
  tryGainMaster(s, p);
}

function applyReserveBlind(s: GameState, tier: 1 | 2 | 3): void {
  const p = s.players[s.currentPlayer]!;
  const id = s.decks[tier].pop();
  if (id) p.reserved.push(id);
  tryGainMaster(s, p);
}

function applyAcquire(s: GameState, cardId: string, pay: Record<BallColor, number>): void {
  const p = s.players[s.currentPlayer]!;
  const card = cardOf(cardId);
  // 지불
  for (const c of COLORS) {
    if (pay[c] > 0) {
      s.supply[c] += pay[c];
      p.balls[c] -= pay[c];
    }
  }
  if (pay.gold > 0) {
    s.supply.gold += pay.gold;
    p.balls.gold -= pay.gold;
  }
  // 출처 제거
  const ridx = p.reserved.indexOf(cardId);
  if (ridx >= 0) p.reserved.splice(ridx, 1);
  else refillBoard(s, card.tier, cardId);
  // 타일에 적재 + 보너스 누적
  p.scored.push(cardId);
  for (const c of COLORS) {
    const b = card.bonus[c] ?? 0;
    if (b > 0) p.bonus[c] += b;
  }
}

export function applyMainAction(s: GameState, a: MainAction): void {
  if (!canApplyMainAction(s, a)) {
    throw new Error(`illegal main action: ${a.type}`);
  }
  switch (a.type) {
    case "take3": applyTake3(s, a.colors); break;
    case "take2": applyTake2(s, a.color); break;
    case "reserve": applyReserve(s, a.cardId); break;
    case "reserveBlind": applyReserveBlind(s, a.tier); break;
    case "acquire": applyAcquire(s, a.cardId, a.pay); break;
  }
}

export function applyEvolution(s: GameState, e: Evolution): void {
  if (!canApplyEvolution(s, e)) {
    throw new Error("illegal evolution");
  }
  const p = s.players[s.currentPlayer]!;
  const target = cardOf(e.targetId);
  // source 타일 아래로(점수 제거, 보너스 유지는 bonus 불변으로 보장)
  const sidx = p.scored.indexOf(e.sourceId);
  if (sidx >= 0) p.scored.splice(sidx, 1);
  // target 출처 제거
  const ridx = p.reserved.indexOf(e.targetId);
  if (ridx >= 0) p.reserved.splice(ridx, 1);
  else refillBoard(s, target.tier, e.targetId);
  // target 타일 적재. 보너스는 진화 시 증가 없음(GAME.md 32행 "그대로").
  p.scored.push(e.targetId);
  p.evolutions += 1;
  s.evolvedThisTurn = true;
}

/** 턴 종료: 18점 임계점 체크, 진화 플래그 리셋, 다음 플레이어로, 종료 감지. */
export function finishTurn(s: GameState): void {
  const justPlayed = s.currentPlayer;
  if (playerPoints(s.players[justPlayed]!) >= WIN_THRESHOLD) s.triggeredEnd = true;
  s.evolvedThisTurn = false;
  const next = (s.currentPlayer + 1) % s.numPlayers;
  s.currentPlayer = next;
  if (s.triggeredEnd && next === s.startingPlayer) s.ended = true;
}

/** 플레이어 순위 배열(내림차순). tie-breaker: 점수 → 진화 수 → 획득 카드 수. */
export function rankPlayers(s: GameState): number[] {
  const order = s.players
    .map((p) => ({
      id: p.id,
      pts: playerPoints(p),
      evo: p.evolutions,
      cards: p.scored.length,
    }))
    .sort((a, b) => b.pts - a.pts || b.evo - a.evo || b.cards - a.cards);
  return order.map((o) => o.id);
}

/** 1위 플레이어 id(동점 시 rankPlayers 순서상 최상위). */
export function winnerId(s: GameState): number {
  return rankPlayers(s)[0]!;
}

/** 메인 액션 + (선택)진화 + 턴 종료까지 한 번에 수행(AI/MC 용). */
export function takeTurn(s: GameState, action: MainAction, evolution: Evolution | null): void {
  applyMainAction(s, action);
  if (evolution) applyEvolution(s, evolution);
  finishTurn(s);
}

/** 합법 행동이 없는 경우(볼 한도·자원 고갈) → 강제 패스(No-op 턴). 드문 예외. */
export function hasAnyAction(s: GameState): boolean {
  return legalMainActions(s).length > 0;
}

export type { Tier };
