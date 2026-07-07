// 몬테카를로 Web Worker. 메인 스레드에서 Snapshot 수신 → 승리 확률 산출 → 반환.
// 비동기로 동작해 본 게임 진행·UI 를 막지 않는다(AGENTS.md).
import type { Snapshot } from "@/game/snapshot";
import { deserialize } from "@/game/snapshot";
import { simulateWinRates, type WinRates } from "./montecarlo";

/** Worker 요청 메시지. */
export interface SimRequest {
  requestId: number;
  snapshot: Snapshot;
  humanIndex: number;
  n: number;
  seed: number;
}

export interface SimResponse extends WinRates {
  requestId: number;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<SimRequest>) => {
  const { requestId, snapshot, humanIndex, n, seed } = e.data;
  const state = deserialize(snapshot);
  const result = simulateWinRates(state, humanIndex, n, seed);
  const msg: SimResponse = { ...result, requestId };
  ctx.postMessage(msg);
};

export {};
