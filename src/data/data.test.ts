import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARDS, CARDS_BY_ID, ROMAN, DECK_SIZES, deckOf, cardsByRomanized,
} from "@/data/cards";
import { BALLS, INITIAL_BALL_SUPPLY } from "@/data/balls";
import type { Tier } from "@/game/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** tier → 에셋 디렉토리. 희귀·전설 모두 rare/ 에 존재. */
function assetDir(tier: Tier): string {
  if (tier === 1) return "stage1";
  if (tier === 2) return "stage2";
  if (tier === 3) return "stage3";
  return "rare";
}

function assetList(dir: string): Set<string> {
  const p = resolve(root, "assets", dir);
  return new Set(readdirSync(p).map((f) => f.replace(/\.(png|jpe?g|webp|svg)$/, "")));
}

describe("data integrity", () => {
  it("총 카드 수 = 90", () => {
    expect(CARDS.length).toBe(90);
  });

  it("단계별 덱 크기 = 35/30/15/5/5", () => {
    for (const tier of [1, 2, 3, "rare", "legendary"] as Tier[]) {
      expect(deckOf(tier).length).toBe(DECK_SIZES[tier]);
    }
  });

  it("known card costs are encoded (라인5 2단계·라인9 3단계)", () => {
    const friezaFinal = deckOf(2).filter((c) => c.name === "최종형태 프리저");
    expect(friezaFinal).toHaveLength(2);
    expect(friezaFinal.map((c) => c.cost)).toContainEqual({ blue: 4, pink: 4, yellow: 1 });
    expect(friezaFinal.map((c) => c.cost)).toContainEqual({ black: 6 });

    const legendarySaiyan = deckOf(3).find((c) => c.name === "전설의 초사이어인");
    expect(legendarySaiyan?.cost).toEqual({ blue: 6, black: 4 });
  });

  it("모든 id 고유", () => {
    const ids = CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("CARDS_BY_ID 가 모든 카드 포함", () => {
    for (const c of CARDS) expect(CARDS_BY_ID[c.id]).toBe(c);
  });

  it("모든 카드 romanized 가 에셋 파일과 1:1 대응", () => {
    const byDir = new Map<string, Set<string>>();
    for (const c of CARDS) {
      const dir = assetDir(c.tier);
      if (!byDir.has(dir)) byDir.set(dir, assetList(dir));
      const files = byDir.get(dir)!;
      expect(files.has(c.romanized), `${dir}/${c.romanized}.(png|svg) 누락`).toBe(true);
    }
  });

  it("ROMAN 맵이 모든 카드 이름 커버", () => {
    for (const c of CARDS) expect(ROMAN[c.name]).toBe(c.romanized);
  });

  it("단계 카드 보너스 = 1, 희귀·전설 보너스 = 2", () => {
    for (const c of CARDS) {
      const total = Object.values(c.bonus).reduce((a, b) => a! + b!, 0)!;
      const expected = c.tier === "rare" || c.tier === "legendary" ? 2 : 1;
      expect(total).toBe(expected);
    }
  });

  it("점수는 단계별 허용 범위(1단계 0·1 / 2단계 1·2·3 / 3단계 3·4·5 / 희귀 0 / 전설 2)", () => {
    for (const c of CARDS) {
      const ok =
        c.tier === "rare" ? c.points === 0
        : c.tier === "legendary" ? c.points === 2
        : c.tier === 1 ? c.points === 0 || c.points === 1
        : c.tier === 2 ? c.points >= 1 && c.points <= 3
        : c.points >= 3 && c.points <= 5;
      expect(ok, `${c.name}(${c.tier}) 점수 ${c.points} 범위 위반`).toBe(true);
    }
  });

  it("1·2단계 카드는 evolvesTo·evoCost 보유, 3단계·희귀·전설은 미보유", () => {
    for (const c of CARDS) {
      const has = c.tier === 1 || c.tier === 2;
      expect(!!c.evolvesTo).toBe(has);
      expect(!!c.evoCost).toBe(has);
    }
  });

  it("모든 evolvesTo 대상 romanized 가 실제 카드로 존재(다음 단계)", () => {
    for (const c of CARDS) {
      if (!c.evolvesTo) continue;
      const targets = cardsByRomanized(c.evolvesTo);
      expect(targets.length, `${c.name}→${c.evolvesTo} 대상 없음`).toBeGreaterThan(0);
      const nextTier = c.tier === 1 ? 2 : 3;
      for (const t of targets) {
        expect(t.tier).toBe(nextTier);
        // 진화 대상은 동일 라인 보너스색 공유
        expect(Object.keys(t.bonus)).toEqual(Object.keys(c.bonus));
      }
    }
  });

  it("진화 라인은 1→2→3 으로 이름이 일관 연결", () => {
    // 1단계 카드의 evolvesTo 대상(2단계)은 다시 동일 라인 3단계로 evolvesTo 가져야 함
    const s1 = CARDS.filter((c) => c.tier === 1);
    const seen = new Set<string>();
    for (const c of s1) {
      if (seen.has(c.romanized)) continue;
      seen.add(c.romanized);
      const s2 = cardsByRomanized(c.evolvesTo!);
      const s3 = s2[0]?.evolvesTo;
      expect(s3, `${c.name} 라인의 3단계 진화 누락`).toBeTruthy();
      expect(cardsByRomanized(s3!).length).toBeGreaterThan(0);
    }
  });

  it("희귀·전설 카드 수 합 = 10, assets/rare 파일 수 = 10", () => {
    const noble = CARDS.filter((c) => c.tier === "rare" || c.tier === "legendary");
    expect(noble.length).toBe(10);
    expect(assetList("rare").size).toBe(10);
  });

  it("볼 6종 + 초기 공급량 합 = 40(7×5 + 5)", () => {
    expect(BALLS.length).toBe(6);
    const sum = Object.values(INITIAL_BALL_SUPPLY).reduce((a, b) => a + b, 0);
    expect(sum).toBe(40);
    expect(INITIAL_BALL_SUPPLY.gold).toBe(5);
  });

  it("에셋 디렉토리 파일 수 = 예상", () => {
    expect(assetList("balls").size).toBe(6);
    expect(assetList("stage1").size).toBe(15);
    expect(assetList("stage2").size).toBe(15);
    expect(assetList("stage3").size).toBe(15);
  });
});
