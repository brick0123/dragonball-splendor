// 에셋 이미지 → 인라인 데이터 URL 매핑. Vite 가 import 시 assetsInlineLimit=MAX 로 base64 인라인.
// 단일 HTML 빌드에서 모든 이미지가 HTML 내장된다. placeholder 는 SVG(텍스트+색).
import type { Tier } from "@/game/types";

const modules = import.meta.glob("/assets/**/*.{png,jpg,jpeg,webp,svg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** "stage1/goku" 형태 키 → URL. 래스터(실제 아트)가 SVG placeholder 를 덮어쓴다. */
const byKey: Record<string, string> = {};
const keyIsSvg: Record<string, boolean> = {};
for (const [path, url] of Object.entries(modules)) {
  // "/assets/stage1/goku.svg" -> "stage1/goku"
  const m = path.replace(/^\/assets\//, "").replace(/\.[^.]+$/, "");
  const isSvg = path.toLowerCase().endsWith(".svg");
  // 같은 이름의 실제 이미지(png/jpg/webp)가 있으면 그것을 우선. svg 는 fallback.
  if (m in byKey && isSvg && !keyIsSvg[m]) continue;
  byKey[m] = url;
  keyIsSvg[m] = isSvg;
}

function dirOf(tier: Tier): string {
  if (tier === 1) return "stage1";
  if (tier === 2) return "stage2";
  if (tier === 3) return "stage3";
  return "rare"; // 희귀·전설 모두 rare/
}

/** 캐릭터 카드 이미지 URL. */
export function cardImg(tier: Tier, romanized: string): string {
  return byKey[`${dirOf(tier)}/${romanized}`] ?? "";
}

/** 구슬 이미지 URL. */
export function ballImg(romanized: string): string {
  return byKey[`balls/${romanized}`] ?? "";
}

/** 퓨전 캐릭터 이미지 URL. */
export function fusionImg(romanized: string): string {
  return byKey[`fusion/${romanized}`] ?? "";
}

export const HAS_ASSETS = Object.keys(byKey).length > 0;
