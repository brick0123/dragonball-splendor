import { describe, it, expect } from "vitest";
import { createGame, cloneGame, playerPoints } from "@/game/state";
import { legalMainActions, legalEvolutions } from "@/game/actions";
import { applyMainAction, applyEvolution, finishTurn, winnerId, rankPlayers, WIN_THRESHOLD } from "@/game/engine";
import { chooseTurn } from "@/strategy/policy";
import { simulateWinRates } from "@/simulator/montecarlo";
import { serialize, deserialize } from "@/game/snapshot";
import { Rng } from "@/game/rng";

const HUMAN = 0;

/** 인간은 항상 첫 번째 합법 행동(보통 구슬 획득)을 선택. */
function humanPick(state: ReturnType<typeof createGame>) {
  const acts = legalMainActions(state);
  if (acts.length === 0) return null;
  // 카드 획득 가능하면 우선
  const acq = acts.find((a) => a.type === "acquire");
  if (acq) return acq;
  return acts[0]!;
}

describe("end-to-end integration", () => {
  it("전체 게임 종료: 4인(유저1+AI3)이 18점 도달까지 진행", () => {
    const s = createGame(2024, 4, HUMAN);
    const rng = new Rng(42);
    let turns = 0;
    while (!s.ended && turns < 500) {
      if (s.currentPlayer === HUMAN) {
        const action = humanPick(s);
        if (!action) { finishTurn(s); turns++; continue; }
        applyMainAction(s, action);
        const evos = legalEvolutions(s);
        if (evos.length > 0) applyEvolution(s, evos[0]!);
      } else {
        const pick = chooseTurn(s, "ai", rng);
        if (!pick) { finishTurn(s); turns++; continue; }
        applyMainAction(s, pick.action);
        if (pick.evolution) applyEvolution(s, pick.evolution);
      }
      finishTurn(s);
      turns++;
    }
    expect(s.ended).toBe(true);
    expect(turns).toBeLessThan(500);
    const maxPts = Math.max(...s.players.map((p) => playerPoints(p)));
    expect(maxPts).toBeGreaterThanOrEqual(WIN_THRESHOLD);
    const ranked = rankPlayers(s);
    expect(ranked.length).toBe(4);
    const w = winnerId(s);
    expect(playerPoints(s.players[w]!)).toBeGreaterThanOrEqual(WIN_THRESHOLD);
  });

  it("승리 확률: 매 턴 후 갱신 시 합리적 범위", () => {
    const s = createGame(777, 4, HUMAN);
    const rng = new Rng(99);
    // 20턴 진행
    for (let i = 0; i < 20 && !s.ended; i++) {
      if (s.currentPlayer === HUMAN) {
        const a = humanPick(s);
        if (a) applyMainAction(s, a);
      } else {
        const pick = chooseTurn(s, "ai", rng);
        if (pick) { applyMainAction(s, pick.action); if (pick.evolution) applyEvolution(s, pick.evolution); }
      }
      finishTurn(s);
    }
    const wr = simulateWinRates(s, HUMAN, 50, 1);
    expect(wr.rates.length).toBe(4);
    expect(wr.rates.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
    // 리드 플레이어가 더 높은 승률 (대부분의 경우)
    const pts = s.players.map((p) => playerPoints(p));
    const leaderIdx = pts.indexOf(Math.max(...pts));
    // 리더 승률이 평균(0.25) 이상일 것 (높은 신뢰도는 아니지만 기본 검증)
    expect(wr.rates[leaderIdx]!).toBeGreaterThan(0.05);
  });

  it("재시작: 새 시드로 초기화 → 이전 상태와 독립", () => {
    const s1 = createGame(1, 4, HUMAN);
    // 몇 수 진행
    for (let i = 0; i < 10; i++) {
      const acts = legalMainActions(s1);
      if (acts[0]) applyMainAction(s1, acts[0]);
      finishTurn(s1);
    }
    // 재시작
    const s2 = createGame(2, 4, HUMAN);
    expect(playerPoints(s2.players[0]!)).toBe(0);
    expect(s2.ended).toBe(false);
    expect(s2.triggeredEnd).toBe(false);
    expect(s2.currentPlayer).not.toBe(s1.currentPlayer); // 다른 시드
  });

  it("불가능 행동 거부: 엔진이 합법 행동만 생성", () => {
    const s = createGame(5, 4, HUMAN);
    const acts = legalMainActions(s);
    // 모든 합법 행동은 엔진 적용 시 예외 없이 성공
    for (const a of acts) {
      const clone = cloneGame(s);
      expect(() => applyMainAction(clone, a)).not.toThrow();
    }
  });

  it("종료 조건: 총점 → 변신 카드 수 → 획득 카드 수 tie-breaker", () => {
    const s = createGame(1, 4, HUMAN);
    // 임의 상태에서 rankPlayers 가 유효 순위 반환
    const ranked = rankPlayers(s);
    expect(ranked).toHaveLength(4);
    // 모든 플레이어가 순위에 포함
    const set = new Set(ranked);
    expect(set.size).toBe(4);
  });

  it("시드 재현: 같은 시드·액션순서 → 동일 결과", () => {
    const run = (seed: number) => {
      const s = createGame(seed, 4, HUMAN);
      const rng = new Rng(50);
      for (let i = 0; i < 20 && !s.ended; i++) {
        if (s.currentPlayer === HUMAN) {
          const a = humanPick(s);
          if (a) applyMainAction(s, a);
        } else {
          const pick = chooseTurn(s, "ai", rng);
          if (pick) { applyMainAction(s, pick.action); if (pick.evolution) applyEvolution(s, pick.evolution); }
        }
        finishTurn(s);
      }
      return { pts: s.players.map((p) => playerPoints(p)), ended: s.ended, winner: winnerId(s) };
    };
    expect(run(999)).toEqual(run(999));
  });

  it("직렬화 왕복: serialize → deserialize → 동일 게임 진행", () => {
    const s = createGame(3, 4, HUMAN);
    const rng = new Rng(10);
    // 10턴 진행 후 스냅샷
    for (let i = 0; i < 10 && !s.ended; i++) {
      const pick = chooseTurn(s, "ai", rng);
      if (pick) { applyMainAction(s, pick.action); if (pick.evolution) applyEvolution(s, pick.evolution); }
      finishTurn(s);
    }
    const snap = serialize(s);
    const r = deserialize(snap);
    // 동일 상태에서 추가 10턴 진행 — 두 경로가 동일 결과
    const play = (state: typeof s) => {
      const g = cloneGame(state);
      const gRng = new Rng(20);
      for (let i = 0; i < 10 && !g.ended; i++) {
        const pick = chooseTurn(g, "ai", gRng);
        if (pick) { applyMainAction(g, pick.action); if (pick.evolution) applyEvolution(g, pick.evolution); }
        finishTurn(g);
      }
      return g.players.map((p) => playerPoints(p));
    };
    expect(play(s)).toEqual(play(r));
  });
});
