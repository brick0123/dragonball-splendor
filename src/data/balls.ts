// 정적 구슬 데이터. 색 = 컬러 5종 + gold(궁극의 드래곤볼, 와일드).
import type { BallColor, BallDef } from "@/game/types";

export const BALLS: readonly BallDef[] = [
  { id: "red", name: "붉은 구슬", romanized: "red_orb", color: "red", isMaster: false },
  { id: "blue", name: "푸른 구슬", romanized: "blue_orb", color: "blue", isMaster: false },
  { id: "black", name: "검은 구슬", romanized: "black_orb", color: "black", isMaster: false },
  { id: "pink", name: "분홍 구슬", romanized: "pink_orb", color: "pink", isMaster: false },
  { id: "yellow", name: "노란 구슬", romanized: "yellow_orb", color: "yellow", isMaster: false },
  { id: "gold", name: "궁극의 드래곤볼", romanized: "dragon_ball", color: "gold", isMaster: true },
];

export const BALLS_BY_ID: Readonly<Record<BallColor, BallDef>> = Object.fromEntries(
  BALLS.map((b) => [b.id, b]),
) as Record<BallColor, BallDef>;

/** UI 표시용 컬러명. 궁극의 드래곤볼은 name 그대로 사용. */
export const COLOR_DISPLAY: Readonly<Record<BallColor, string>> = {
  red: "빨강",
  blue: "파랑",
  black: "검정",
  pink: "분홍",
  yellow: "노랑",
  gold: "궁극의 드래곤볼",
};

/** 게임 시작 시 공급 가능한 구슬 수(GAME.md 볼 수). */
export const INITIAL_BALL_SUPPLY: Readonly<Record<BallColor, number>> = {
  red: 7, blue: 7, black: 7, pink: 7, yellow: 7, gold: 5,
};

/** 컬러 구슬 보유 한도. */
export const MAX_BALLS_IN_HAND = 10;
/** 보관(예약) 카드 한도. */
export const MAX_RESERVED = 3;
/** 각 단계 덱에서 공개되는 카드 수. 희귀·전설은 1장씩. */
export const REVEAL_PER_STAGE = 4;
