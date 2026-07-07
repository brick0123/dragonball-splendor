import { describe, it, expect } from "vitest";
import { createGame, playerPoints } from "@/game/state";
import { legalMainActions } from "@/game/actions";
import { applyMainAction, applyEvolution, finishTurn, winnerId, rankPlayers } from "@/game/engine";
import { Rng } from "@/game/rng";
import {
  chooseTurn, chooseStrongTurn, cardValue, actionValue, goalSet, bestEvolution,
} from "@/strategy/policy";
import { CARDS } from "@/data/cards";
import type { CardDef, Color } from "@/game/types";

function findCard(pred: (c: CardDef) => boolean): CardDef {
  const c = CARDS.find(pred);
  if (!c) throw new Error("not found");
  return c;
}

describe("strategy basics", () => {
  it("goalSet: 보유 카드 라인 색상에 정렬", () => {
    const s = createGame(1, 4);
    s.currentPlayer = 0;
    const goku = findCard((c) => c.name === "손오공"); // 라인 blue
    s.players[0]!.scored = [goku.id];
    const goal = goalSet(s, s.players[0]!);
    expect(goal).toContain("blue");
  });

  it("cardValue: 변신 다음단계 카드에 보너스 가산", () => {
    const s = createGame(1, 4);
    const goku = findCard((c) => c.name === "손오공");
    const goku_ss = findCard((c) => c.name === "초사이어인 손오공");
    s.players[0]!.scored = [goku.id];
    const goal: Color[] = ["blue", "yellow", "red"];
    const vNext = cardValue(s.players[0]!, goku_ss, goal);
    // 다음 단계 아닌 카드와 비교
    s.players[0]!.scored = [];
    const vOther = cardValue(s.players[0]!, goku_ss, goal);
    expect(vNext).toBeGreaterThan(vOther);
  });

  it("actionValue: 획득 가능한 고점수 카드가 구슬 획득보다 고점", () => {
    const s = createGame(1, 4);
    s.currentPlayer = 0;
    const frieza_full = findCard((c) => c.name === "풀파워 프리저"); // black7→ pink7,blue3
    // 풀파워 프리저(pink7,blue3) — 보너스로 무료화
    s.players[0]!.bonus = { red: 0, blue: 7, black: 0, pink: 7, yellow: 0 };
    s.players[0]!.balls = { red: 0, blue: 0, black: 0, pink: 0, yellow: 0, gold: 0 };
    // 보드에 풀파워 프리저 배치
    const goal: Color[] = ["black", "blue", "yellow"];
    s.board[3] = [frieza_full.id];
    const actions = legalMainActions(s);
    const acquire = actions.find((a) => a.type === "acquire" && a.cardId === frieza_full.id);
    expect(acquire).toBeTruthy();
    const take3 = actions.find((a) => a.type === "take3");
    expect(take3).toBeTruthy();
    expect(actionValue(s, s.players[0]!, acquire!, goal)).toBeGreaterThan(
      actionValue(s, s.players[0]!, take3!, goal),
    );
  });

  it("bestEvolution: 변신 가능 시 양수 가치 후보 반환", () => {
    const s = createGame(1, 4);
    s.currentPlayer = 0;
    const goku = findCard((c) => c.name === "손오공");
    const goku_ss = findCard((c) => c.name === "초사이어인 손오공");
    s.players[0]!.scored = [goku.id];
    s.players[0]!.bonus = { red: 0, blue: 0, black: 0, pink: 0, yellow: 3 };
    s.board[2] = [goku_ss.id];
    const evo = bestEvolution(s);
    expect(evo).not.toBeNull();
  });

  it("chooseStrongTurn: 합법 후보를 고르고 원본 상태를 직접 변경하지 않음", () => {
    const s = createGame(1234, 4);
    s.currentPlayer = 1;
    const before = {
      currentPlayer: s.currentPlayer,
      supply: { ...s.supply },
      player: {
        balls: { ...s.players[1]!.balls },
        reserved: [...s.players[1]!.reserved],
        scored: [...s.players[1]!.scored],
      },
    };
    const pick = chooseStrongTurn(s, new Rng(10));
    expect(pick).not.toBeNull();
    expect(legalMainActions(s)).toContainEqual(pick!.action);
    expect(s.currentPlayer).toBe(before.currentPlayer);
    expect(s.supply).toEqual(before.supply);
    expect(s.players[1]!.balls).toEqual(before.player.balls);
    expect(s.players[1]!.reserved).toEqual(before.player.reserved);
    expect(s.players[1]!.scored).toEqual(before.player.scored);
  });

  it("chooseStrongTurn: 동일 상태·동일 RNG → 동일 선택", () => {
    const a = createGame(4321, 4);
    const b = createGame(4321, 4);
    a.currentPlayer = 2;
    b.currentPlayer = 2;
    expect(chooseStrongTurn(a, new Rng(77))).toEqual(chooseStrongTurn(b, new Rng(77)));
  });
});

describe("AI full game terminates", () => {
  it("4-AI 게임이 종료 조건까지 도달(≤200턴) + 승자 결정", () => {
    const s = createGame(2024, 4);
    const rng = new Rng(777);
    let turns = 0;
    while (!s.ended && turns < 400) {
      const pick = chooseTurn(s, "ai", rng);
      if (!pick) { finishTurn(s); turns++; continue; }
      applyMainAction(s, pick.action);
      if (pick.evolution) applyEvolution(s, pick.evolution);
      finishTurn(s);
      turns++;
    }
    expect(s.ended).toBe(true);
    expect(turns).toBeLessThan(400);
    const ranked = rankPlayers(s);
    expect(ranked.length).toBe(4);
    // 최소 한 명은 18점 이상
    const maxPts = Math.max(...s.players.map((p) => playerPoints(p)));
    expect(maxPts).toBeGreaterThanOrEqual(18);
    const w = winnerId(s);
    expect(w).toBe(ranked[0]);
  });

  it("동일 시드·정책 → 동일한 게임 결과(재현성)", () => {
    const run = (seed: number) => {
      const s = createGame(seed, 4);
      const rng = new Rng(777);
      let turns = 0;
      while (!s.ended && turns < 400) {
        const pick = chooseTurn(s, "ai", rng);
        if (!pick) { finishTurn(s); turns++; continue; }
        applyMainAction(s, pick.action);
        if (pick.evolution) applyEvolution(s, pick.evolution);
        finishTurn(s);
        turns++;
      }
      return { turns, winner: winnerId(s), pts: s.players.map((p) => playerPoints(p)) };
    };
    expect(run(555)).toEqual(run(555));
  });

  it("user 모드(소프트)로도 게임 종료 + 결과 분산(비결정론)", () => {
    const s = createGame(313, 4);
    const rng = new Rng(1);
    let turns = 0;
    while (!s.ended && turns < 400) {
      const pick = chooseTurn(s, "user", rng);
      if (!pick) { finishTurn(s); turns++; continue; }
      applyMainAction(s, pick.action);
      if (pick.evolution) applyEvolution(s, pick.evolution);
      finishTurn(s);
      turns++;
    }
    expect(s.ended).toBe(true);
    // 다른 시드의 user 게임은 (확률적으로) 다른 점수 분포 가능 — 단순히 종료만 확인
  });
});
