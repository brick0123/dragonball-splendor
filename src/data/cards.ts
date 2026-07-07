// 정적 카드 데이터 — GAME.md 카드 목록을 인코딩.
// 변신 라인별로 보너스색·변신 대상을 공유하므로 라인 스펙을 기준으로 전개.
// 각 라인 = 한 캐릭터의 3단계 변신(1→2→3). 라인 색·수치는 룰이라 원본 유지.
import type { CardDef, Color, ColorMap, Tier } from "@/game/types";

/** 한글 이름 → romanized(에셋 파일명). 라인 1~8=변신 진행, 9~15=약→강 다른 캐릭터. */
export const ROMAN: Record<string, string> = {
  // 1단계 (기본형)
  손오공: "goku", 베지터: "vegeta", "소년 오반": "gohan", 트랭크스: "trunks", 프리저: "frieza",
  "불완전체 셀": "cell", "뚱보 부우": "buu_fat", 피콜로: "piccolo", 도도리아: "dodoria", "인조인간 19호": "android19",
  야무치: "yamcha", "인조인간 17호": "android17", 손오천: "goten", 북계왕: "kaio_north", 부르마: "bulma",
  // 2단계 (첫 변신/중급)
  "초사이어인 손오공": "goku_ss", "초사이어인 베지터": "vegeta_ss", "초사이어인2 오반": "gohan_ss2", "초사이어인 트랭크스": "trunks_ss", "최종형태 프리저": "frieza_final",
  "준완전체 셀": "cell_semi", "사악한 부우": "buu_evil", "합체 피콜로": "piccolo_fused", 자봉: "zarbon", "닥터 게로": "gero",
  천진반: "tenshinhan", "인조인간 18호": "android18", 오천크스: "gotenks", 계왕신: "kaioshin", 치치: "chichi",
  // 3단계 (상위)
  "초사이어인3 손오공": "goku_ss3", "초사이어인2 베지터": "vegeta_ss2", "궁극의 오반": "gohan_ultimate", "초사이어인2 트랭크스": "trunks_ss2", "풀파워 프리저": "frieza_full",
  "완전체 셀": "cell_perfect", "키드 부우": "buu_kid", "잠재능력 피콜로": "piccolo_kami", "기뉴 대장": "ginyu", "인조인간 16호": "android16",
  크리링: "krillin", "인조인간 13호": "android13", "초사이어인 오천크스": "gotenks_ss", 대계왕신: "grand_kaioshin", 런치: "launch",
  // 희귀
  우브: "uub", 무천도사: "roshi", "미스터 사탄": "hercule", 덴데: "dende", 바비디: "babidi",
  // 전설 (유니크)
  신룡: "shenron", 폴룽가: "porunga", "오메가 흑성룡": "omega_shenron", 브로리: "broly", 자네바: "janemba",
};

/** 변신 라인: 세 단계 이름 + 라인 보너스색(3단계 모두 동일). */
interface LineSpec {
  readonly color: Color;
  readonly s1: string;
  readonly s2: string;
  readonly s3: string;
}

// 라인 1~8: 한 캐릭터의 변신 진행(약→강). 라인 9~15: 서로 다른 캐릭터 약→강 배치.
const LINES: readonly LineSpec[] = [
  { color: "blue", s1: "손오공", s2: "초사이어인 손오공", s3: "초사이어인3 손오공" },
  { color: "yellow", s1: "베지터", s2: "초사이어인 베지터", s3: "초사이어인2 베지터" },
  { color: "red", s1: "소년 오반", s2: "초사이어인2 오반", s3: "궁극의 오반" },
  { color: "pink", s1: "트랭크스", s2: "초사이어인 트랭크스", s3: "초사이어인2 트랭크스" },
  { color: "black", s1: "프리저", s2: "최종형태 프리저", s3: "풀파워 프리저" },
  { color: "blue", s1: "불완전체 셀", s2: "준완전체 셀", s3: "완전체 셀" },
  { color: "yellow", s1: "뚱보 부우", s2: "사악한 부우", s3: "키드 부우" },
  { color: "red", s1: "피콜로", s2: "합체 피콜로", s3: "잠재능력 피콜로" },
  { color: "pink", s1: "도도리아", s2: "자봉", s3: "기뉴 대장" },
  { color: "black", s1: "인조인간 19호", s2: "닥터 게로", s3: "인조인간 16호" },
  { color: "blue", s1: "야무치", s2: "천진반", s3: "크리링" },
  { color: "yellow", s1: "인조인간 17호", s2: "인조인간 18호", s3: "인조인간 13호" },
  { color: "red", s1: "손오천", s2: "오천크스", s3: "초사이어인 오천크스" },
  { color: "pink", s1: "북계왕", s2: "계왕신", s3: "대계왕신" },
  { color: "black", s1: "부르마", s2: "치치", s3: "런치" },
];

/** 1·2단계 카드 스펙: [점수, 비용, 진화비용]. 진화비용은 단계 상승 시 필요한 컬러 보너스. */
type EvoCardSpec = [points: number, cost: ColorMap, evoCost: ColorMap];
/** 3단계 카드 스펙: [점수, 비용]. 진화 없음. */
type LeafCardSpec = [points: number, cost: ColorMap];

// 라인 순서는 LINES 와 동일. 각 라인의 1·2·3단계 카드들을 GAME.md 표 순서대로.
const STAGE1: readonly (readonly EvoCardSpec[])[] = [
  // 손오공
  [[1, { black: 3, pink: 2 }, { yellow: 3 }], [1, { blue: 4 }, { yellow: 3 }]],
  // 베지터
  [[1, { red: 3, black: 2 }, { pink: 3 }], [1, { yellow: 4 }, { pink: 3 }]],
  // 소년 오반
  [[1, { pink: 3, blue: 2 }, { black: 3 }], [1, { red: 4 }, { black: 3 }]],
  // 트랭크스
  [[1, { blue: 3, yellow: 2 }, { red: 3 }], [1, { pink: 4 }, { red: 3 }]],
  // 프리저
  [[1, { yellow: 3, red: 2 }, { blue: 3 }], [1, { black: 4 }, { blue: 3 }]],
  // 불완전체 셀
  [[0, { black: 1, yellow: 1, pink: 1, red: 1 }, { pink: 3 }], [0, { red: 2, yellow: 1, blue: 1 }, { pink: 3 }]],
  // 뚱보 부우
  [[0, { blue: 1, red: 1, pink: 1, black: 1 }, { black: 3 }], [0, { pink: 2, black: 1, red: 1 }, { black: 3 }]],
  // 피콜로
  [[0, { blue: 1, yellow: 1, pink: 1, black: 1 }, { yellow: 3 }], [0, { yellow: 2, pink: 1, black: 1 }, { yellow: 3 }]],
  // 브로리
  [[0, { blue: 1, yellow: 1, red: 1, black: 1 }, { blue: 3 }], [0, { black: 2, blue: 1, yellow: 1 }, { blue: 3 }]],
  // 베이비
  [[0, { red: 1, yellow: 1, pink: 1, blue: 1 }, { red: 3 }], [0, { blue: 2, red: 1, pink: 1 }, { red: 3 }]],
  // 베지트
  [[0, { yellow: 2, black: 1 }, { red: 2 }], [0, { blue: 2, red: 2 }, { red: 2 }], [0, { pink: 3 }, { red: 2 }]],
  // 고구스
  [[0, { red: 2, pink: 1 }, { blue: 2 }], [0, { blue: 2, yellow: 2 }, { blue: 2 }], [0, { black: 3 }, { blue: 2 }]],
  // 오천크스
  [[0, { black: 2, blue: 1 }, { pink: 2 }], [0, { pink: 2, red: 2 }, { pink: 2 }], [0, { yellow: 3 }, { pink: 2 }]],
  // 손오천
  [[0, { blue: 2, yellow: 1 }, { black: 2 }], [0, { pink: 2, black: 2 }, { black: 2 }], [0, { red: 3 }, { black: 2 }]],
  // 천진반
  [[0, { pink: 2, red: 1 }, { yellow: 2 }], [0, { yellow: 2, black: 2 }, { yellow: 2 }], [0, { blue: 3 }, { yellow: 2 }]],
];

const STAGE2: readonly (readonly EvoCardSpec[])[] = [
  // 초사이어인 오공
  [[3, { yellow: 4, black: 4, red: 1 }, { red: 4 }], [3, { blue: 6 }, { red: 4 }]],
  // 초사이어인 베지터
  [[3, { red: 4, pink: 4, blue: 1 }, { blue: 4 }], [3, { yellow: 6 }, { blue: 4 }]],
  // 초사이어인2 오반
  [[3, { blue: 4, black: 4, pink: 1 }, { pink: 4 }], [3, { red: 6 }, { pink: 4 }]],
  // 초사이어인 트랭크스
  [[3, { red: 4, yellow: 4, black: 1 }, { black: 4 }], [3, { pink: 6 }, { black: 4 }]],
  // 최종형태 프리저 (대칭 보정)
  [[3, { blue: 4, pink: 4, yellow: 1 }, { yellow: 4 }], [3, { black: 6 }, { yellow: 4 }]],
  // 준완전체 셀
  [[2, { pink: 4, yellow: 2, black: 1 }, { black: 3 }], [2, { blue: 5, red: 2 }, { black: 3 }]],
  // 사악한 부우
  [[2, { black: 4, pink: 2, red: 1 }, { red: 3 }], [2, { yellow: 5, blue: 2 }, { red: 3 }]],
  // 합체 피콜로
  [[2, { yellow: 4, black: 2, blue: 1 }, { blue: 3 }], [2, { red: 5, pink: 2 }, { blue: 3 }]],
  // 초사이어인 브로리
  [[2, { blue: 4, red: 2, yellow: 1 }, { yellow: 3 }], [2, { pink: 5, black: 2 }, { yellow: 3 }]],
  // 슈퍼 베이비
  [[2, { red: 4, blue: 2, pink: 1 }, { pink: 3 }], [2, { black: 5, yellow: 2 }, { pink: 3 }]],
  // 초사이어인 베지트
  [[1, { blue: 3, pink: 2, black: 2 }, { red: 4 }], [1, { red: 3, yellow: 2, pink: 2 }, { red: 4 }]],
  // 초사이어인 고구스
  [[1, { yellow: 3, pink: 2, red: 2 }, { blue: 4 }], [1, { blue: 3, pink: 2, black: 2 }, { blue: 4 }]],
  // 초사이어인 오천크스
  [[1, { red: 3, black: 2, yellow: 2 }, { pink: 4 }], [1, { pink: 3, yellow: 2, black: 2 }, { pink: 4 }]],
  // 초사이어인 손오천
  [[1, { pink: 3, blue: 2, yellow: 2 }, { black: 4 }], [1, { black: 3, blue: 2, red: 2 }, { black: 4 }]],
  // 사공권 천진반
  [[1, { black: 3, blue: 2, red: 2 }, { yellow: 4 }], [1, { yellow: 3, blue: 2, red: 2 }, { yellow: 4 }]],
];

const STAGE3: readonly (readonly LeafCardSpec[])[] = [
  // 초사이어인4 오공
  [[5, { black: 7, yellow: 3 }]],
  // 초사이어인4 베지터
  [[5, { red: 7, pink: 3 }]],
  // 궁극의 오반
  [[5, { blue: 7, black: 3 }]],
  // 분노의 트랭크스
  [[5, { yellow: 7, red: 3 }]],
  // 풀파워 프리저
  [[5, { pink: 7, blue: 3 }]],
  // 완전체 셀
  [[4, { pink: 6, red: 4 }]],
  // 키드 부우
  [[4, { black: 6, blue: 4 }]],
  // 신 합체 피콜로
  [[4, { yellow: 6, pink: 4 }]],
  // 전설의 초사이어인
  [[4, { blue: 6, black: 4 }]],
  // 슈퍼 베이비2
  [[4, { red: 6, yellow: 4 }]],
  // 슈퍼 베지트
  [[3, { blue: 5, black: 2, yellow: 2 }]],
  // 초사이어인4 고구스
  [[3, { yellow: 5, red: 2, pink: 2 }]],
  // 초사이어인3 오천크스
  [[3, { red: 5, black: 2, blue: 2 }]],
  // 초사이어인2 손오천
  [[3, { pink: 5, yellow: 2, red: 2 }]],
  // 신기공포 천진반
  [[3, { black: 5, blue: 2, pink: 2 }]],
];

/** 희귀 카드 스펙: [이름, 보너스색, 비용]. 점수 0, 보너스 2. */
const RARE: readonly (readonly [name: string, color: Color, cost: ColorMap])[] = [
  ["우브", "red", { black: 3, blue: 2 }],
  ["무천도사", "blue", { pink: 3, yellow: 2 }],
  ["미스터 사탄", "yellow", { blue: 3, pink: 2 }],
  ["덴데", "pink", { red: 3, black: 2 }],
  ["바비디", "black", { yellow: 3, red: 2 }],
];

/** 전설 카드 스펙: [이름, 보너스색, 비용]. 점수 2, 보너스 2. 유니크 존재. */
const LEGENDARY: readonly (readonly [name: string, color: Color, cost: ColorMap])[] = [
  ["신룡", "red", { pink: 3, blue: 3, yellow: 3 }],
  ["폴룽가", "blue", { black: 3, yellow: 3, red: 3 }],
  ["오메가 흑성룡", "yellow", { red: 3, pink: 3, black: 3 }],
  ["브로리", "pink", { blue: 3, yellow: 3, black: 3 }],
  ["자네바", "black", { pink: 3, red: 3, blue: 3 }],
];

/** 퓨전 캐릭터 — 신규 "퓨전" 칸 등록용(현재 덱/게임플레이 미편입, 이미지만 보유). */
export const FUSIONS: readonly { readonly name: string; readonly romanized: string }[] = [
  { name: "베지트", romanized: "vegito" },
];

const counters: Record<string, number> = {};
function nextId(prefix: string): string {
  counters[prefix] = (counters[prefix] ?? 0) + 1;
  return `${prefix}-${String(counters[prefix]).padStart(3, "0")}`;
}

function bonusOf(color: Color, n: number): ColorMap {
  return { [color]: n };
}

function build(): CardDef[] {
  const out: CardDef[] = [];

  for (let i = 0; i < LINES.length; i++) {
    const line = LINES[i]!;
    // 1단계
    for (const [points, cost, evoCost] of STAGE1[i]!) {
      out.push({
        id: nextId("s1"), name: line.s1, romanized: ROMAN[line.s1], tier: 1, points,
        bonus: bonusOf(line.color, 1), cost, evolvesTo: ROMAN[line.s2], evoCost,
      });
    }
    // 2단계
    for (const [points, cost, evoCost] of STAGE2[i]!) {
      out.push({
        id: nextId("s2"), name: line.s2, romanized: ROMAN[line.s2], tier: 2, points,
        bonus: bonusOf(line.color, 1), cost, evolvesTo: ROMAN[line.s3], evoCost,
      });
    }
    // 3단계
    for (const [points, cost] of STAGE3[i]!) {
      out.push({
        id: nextId("s3"), name: line.s3, romanized: ROMAN[line.s3], tier: 3, points,
        bonus: bonusOf(line.color, 1), cost,
      });
    }
  }

  for (const [name, color, cost] of RARE) {
    out.push({
      id: nextId("rare"), name, romanized: ROMAN[name], tier: "rare", points: 0,
      bonus: bonusOf(color, 2), cost,
    });
  }
  for (const [name, color, cost] of LEGENDARY) {
    out.push({
      id: nextId("leg"), name, romanized: ROMAN[name], tier: "legendary", points: 2,
      bonus: bonusOf(color, 2), cost,
    });
  }

  return out;
}

export const CARDS: readonly CardDef[] = build();

export const CARDS_BY_ID: Readonly<Record<string, CardDef>> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
);

/** 모든 카드 id(중복 이름의 변형 포함) 중 romanized 가 일치하는 것들. 진화 대상 검색용. */
export function cardsByRomanized(romanized: string): CardDef[] {
  return CARDS.filter((c) => c.romanized === romanized);
}

/** 단계별 덱 구성(셔플 대상). 각 단계는 동일 이름 변형을 포함한 모든 카드. */
export function deckOf(tier: Tier): CardDef[] {
  return CARDS.filter((c) => c.tier === tier);
}

export const DECK_SIZES: Readonly<Record<Tier, number>> = {
  1: 35, 2: 30, 3: 15, rare: 5, legendary: 5,
};
