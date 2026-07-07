// 합법 행동 생성. 현재 플레이어 기준.
import type { BallColor, CardDef, Color, Tier } from "./types";
import { COLORS, isNoble } from "./types";
import type { GameState, PlayerState } from "./state";
import { boardCardIds, canAfford, canReserveMore, cardOf, discountedCost, withinBallLimit } from "./state";
import { STAGE_TIERS } from "./state";

export type MainAction =
  | { type: "take3"; colors: Color[] }
  | { type: "take2"; color: Color }
  | { type: "reserve"; cardId: string }
  | { type: "acquire"; cardId: string; pay: Record<BallColor, number> }
  | { type: "reserveBlind"; tier: 1 | 2 | 3 };

export interface Evolution {
  sourceId: string;
  targetId: string;
}

/** combinations: 배열에서 k 개를 고르는 조합. */
function combos<T>(arr: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const n = arr.length;
  if (k > n) return out;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map((i) => arr[i]!));
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;
    idx[i]!++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
  return out;
}

function legalTake3(s: GameState, p: PlayerState): MainAction[] {
  const avail = COLORS.filter((c) => s.supply[c] > 0);
  const out: MainAction[] = [];
  if (avail.length >= 3) {
    if (withinBallLimit(p, 3)) {
      for (const c of combos(avail, 3)) out.push({ type: "take3", colors: c });
    }
  } else if (avail.length >= 1) {
    // 남은 종류 ≤ 2: 전부 가져간다(2 or 1).
    if (withinBallLimit(p, avail.length)) out.push({ type: "take3", colors: avail.slice() });
  }
  return out;
}

function legalTake2(s: GameState, p: PlayerState): MainAction[] {
  if (!withinBallLimit(p, 2)) return [];
  const out: MainAction[] = [];
  for (const c of COLORS) if (s.supply[c] >= 4) out.push({ type: "take2", color: c });
  return out;
}

function legalReserve(s: GameState, p: PlayerState): MainAction[] {
  if (!canReserveMore(p)) return [];
  const out: MainAction[] = [];
  for (const t of STAGE_TIERS) for (const id of s.board[t]) out.push({ type: "reserve", cardId: id });
  return out;
}

function legalReserveBlind(s: GameState, p: PlayerState): MainAction[] {
  if (!canReserveMore(p)) return [];
  const out: MainAction[] = [];
  for (const t of STAGE_TIERS) if (s.decks[t].length > 0) out.push({ type: "reserveBlind", tier: t });
  return out;
}

/** 카드 획득 정규 지불(컬러 우선, 부족분 궁극의 드래곤볼). 불가 시 null. */
export function computePay(p: PlayerState, card: CardDef): Record<BallColor, number> | null {
  const cost = discountedCost(card, p.bonus);
  const pay: Record<BallColor, number> = { red: 0, blue: 0, black: 0, pink: 0, yellow: 0, gold: 0 };
  let goldShort = 0;
  for (const c of COLORS) {
    const req = cost[c] ?? 0;
    const use = Math.min(req, p.balls[c]);
    pay[c] = use;
    goldShort += req - use;
  }
  if (isNoble(card.tier)) goldShort += 1;
  if (p.balls.gold < goldShort) return null;
  pay.gold = goldShort;
  return pay;
}

function legalAcquire(s: GameState, p: PlayerState): MainAction[] {
  const out: MainAction[] = [];
  const candidates: string[] = [];
  for (const id of boardCardIds(s)) candidates.push(id);
  for (const id of p.reserved) candidates.push(id);
  for (const id of candidates) {
    const card = cardOf(id);
    if (!canAfford(p, card)) continue;
    const pay = computePay(p, card);
    if (!pay) continue;
    out.push({ type: "acquire", cardId: id, pay });
  }
  return out;
}

export function legalMainActions(s: GameState): MainAction[] {
  const p = s.players[s.currentPlayer]!;
  if (s.ended) return [];
  return [
    ...legalTake3(s, p),
    ...legalTake2(s, p),
    ...legalReserve(s, p),
    ...legalReserveBlind(s, p),
    ...legalAcquire(s, p),
  ];
}

/** 진화 후보(턴당 1회). source=내 타일 카드, target=보관 or 보드. targetId 기준 중복제거. */
export function legalEvolutions(s: GameState): Evolution[] {
  const p = s.players[s.currentPlayer]!;
  if (s.ended || s.evolvedThisTurn) return [];
  const out: Evolution[] = [];
  const seen = new Set<string>();
  for (const sourceId of p.scored) {
    const source = cardOf(sourceId);
    if (!source.evolvesTo || !source.evoCost) continue;
    let ok = true;
    for (const c of COLORS) {
      if ((source.evoCost[c] ?? 0) > p.bonus[c]) { ok = false; break; }
    }
    if (!ok) continue;
    // 보관 중
    for (const rid of p.reserved) {
      if (cardOf(rid).romanized === source.evolvesTo && !seen.has(rid)) {
        seen.add(rid);
        out.push({ sourceId, targetId: rid });
      }
    }
    // 보드
    for (const id of boardCardIds(s)) {
      if (cardOf(id).romanized === source.evolvesTo && !seen.has(id)) {
        seen.add(id);
        out.push({ sourceId, targetId: id });
      }
    }
  }
  return out;
}

export type { Tier };
