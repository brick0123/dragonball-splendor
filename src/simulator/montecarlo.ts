// 몬테카를로 승리 확률. game+strategy 에만 의존(ui 미의존 — AGENTS.md 모듈 분리).
// 각 플레이아웃: 현재 상태 복제 → 종료까지 시뮬레이션 → 승자 기록.
// AI 3인 = ai 정책(argmax), 사용자 = user 정책(소프트, 미래 행동 가정).
import type { GameState } from "@/game/state";
import { cloneGame } from "@/game/state";
import { applyEvolution, applyMainAction, finishTurn, winnerId } from "@/game/engine";
import { chooseTurn, type PolicyMode } from "@/strategy/policy";
import { Rng } from "@/game/rng";

/** 플레이어별 승리 확률(0~1). 합 = 1(종료 상태면 승자 1). */
export interface WinRates {
  rates: number[];
  samples: number;
}

/** 단일 플레이아웃: 복제 상태에서 종료까지 진행. */
function playout(state: GameState, humanIndex: number, rng: Rng, maxTurns: number): number {
  const s = cloneGame(state);
  let turns = 0;
  while (!s.ended && turns < maxTurns) {
    const mode: PolicyMode = s.currentPlayer === humanIndex ? "user" : "ai";
    const pick = chooseTurn(s, mode, rng);
    if (!pick) { finishTurn(s); turns++; continue; }
    applyMainAction(s, pick.action);
    if (pick.evolution) applyEvolution(s, pick.evolution);
    finishTurn(s);
    turns++;
  }
  return winnerId(s);
}

/**
 * 승리 확률 산출.
 * @param state 현재 게임 상태(원본 불변)
 * @param humanIndex 사용자 플레이어 인덱스(user 정책 적용 대상)
 * @param n 플레이아웃 수
 * @param seed 플레이아웃용 RNG 시드(재현)
 */
export function simulateWinRates(
  state: GameState,
  humanIndex: number,
  n: number,
  seed: number,
  maxTurnsPerPlayout = 500,
): WinRates {
  const wins = new Array(state.numPlayers).fill(0);
  for (let i = 0; i < n; i++) {
    const rng = new Rng(seed + i * 2654435761);
    const w = playout(state, humanIndex, rng, maxTurnsPerPlayout);
    wins[w]! += 1;
  }
  const rates = wins.map((w) => w / n);
  return { rates, samples: n };
}
