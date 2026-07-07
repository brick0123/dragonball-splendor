// 도메인 공유 타입. data·game·strategy·simulator 모두 사용.
// ui 는 이 타입들을 렌더링에 참조 가능하나, game 의 규칙 함수만이 상태를 변경한다.

/** 컬러 볼 5색. 보너스 색과 동일. */
export type Color = "red" | "blue" | "black" | "pink" | "yellow";
export const COLORS: readonly Color[] = ["red", "blue", "black", "pink", "yellow"];
/** 볼 색 = 5컬러 + gold(궁극의 드래곤볼, 와일드카드). */
export type BallColor = Color | "gold";

export type Stage = 1 | 2 | 3;
/** 카드 등급. 희귀(rare)와 전설/환상(legendary)은 별개 덱이지만 규칙상 동일 취급(궁극의 드래곤볼 필수·보관불가). */
export type Tier = Stage | "rare" | "legendary";

/** 컬러→수량 맵. 0 인 항목은 생략한다(부분 레코드). */
export type ColorMap = Readonly<Partial<Record<Color, number>>>;

/** 카드 정의(정적). 덱·보드·보관 더미는 id 로 카드를 참조한다. */
export interface CardDef {
  /** 고유 덱 id, 예: "s1-001" · "rare-01" · "leg-03" */
  readonly id: string;
  /** 한글 이름(동일 이름의 변형 카드가 여러 장일 수 있음). */
  readonly name: string;
  /** 에셋 파일명 키(romanized). 동일 진화 라인은 단계별로 서로 다른 romanized. */
  readonly romanized: string;
  readonly tier: Tier;
  readonly points: number;
  /** 획득 시 제공하는 컬러 보너스(비용 할인). 1단계·2단계·3단계=1, 희귀·전설=2. */
  readonly bonus: ColorMap;
  /** 획득 비용(컬러 볼). 보너스 할인 적용 전 원가. */
  readonly cost: ColorMap;
  /** 1·2단계만: 진화 대상 romanized. */
  readonly evolvesTo?: string;
  /** 1·2단계만: 진화에 필요한 컬러 보너스(획득 카드 보너스 합계로 충족). */
  readonly evoCost?: ColorMap;
}

/** 볼 정의(정적). */
export interface BallDef {
  readonly id: BallColor;
  readonly name: string;
  readonly romanized: string;
  readonly color: BallColor;
  readonly isMaster: boolean;
}

/** 카드가 희귀/전설/환상 등급(궁극의 드래곤볼 필수·보관불가)인지. */
export function isNoble(tier: Tier): tier is "rare" | "legendary" {
  return tier === "rare" || tier === "legendary";
}

/** 카드의 단계(희귀/전설은 0 으로 취급 — 진화 대상 아님). */
export function stageOf(tier: Tier): 0 | 1 | 2 | 3 {
  if (tier === "rare" || tier === "legendary") return 0;
  return tier;
}
