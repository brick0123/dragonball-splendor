// 순수 DOM 빌더. 상태 변경 없음 — controller 가 이벤트를 소유한다.
// Tailwind CSS + DaisyUI 클래스를 적극 활용. Font Awesome 아이콘으로 토큰/보너스 표현.
import type { BallColor, CardDef, Color, Tier } from "@/game/types";
import { COLORS, stageOf, isNoble } from "@/game/types";
import { ROMAN } from "@/data/cards";
import { cardImg, ballImg } from "./assets";

/** romanized → 한글 이름 역조회 (evolvesTo 표시용). */
const ROMAN_TO_KR: Record<string, string> = {};
for (const [kr, rom] of Object.entries(ROMAN)) ROMAN_TO_KR[rom] = kr;

/** 카드의 첫 번째 보너스 색상(카드 배경색 결정용). */
function cardBonusColor(card: CardDef): Color | undefined {
  return COLORS.find((c) => (card.bonus[c] ?? 0) > 0);
}

// ── Helpers ──────────────────────────────────────────────────────────

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { dataset, class: cls, style, ...rest } = props;
  if (typeof style === "string") node.setAttribute("style", style);
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== null) {
      (node as Record<string, unknown>)[k] = v;
    }
  }
  if (dataset && typeof dataset === "object") for (const [k, v] of Object.entries(dataset as Record<string, string>)) node.dataset[k] = v;
  if (typeof cls === "string") node.className = cls;
  node.append(...children);
  return node;
}

// ── Color → FA icon mapping ──────────────────────────────────────────

const COLOR_FA: Record<Color, string> = {
  red: "fa-fire",
  blue: "fa-droplet",
  black: "fa-moon",
  pink: "fa-heart",
  yellow: "fa-bolt",
};

const COLOR_CLASS: Record<Color, string> = {
  red: "red", blue: "blue", black: "black", pink: "pink", yellow: "yellow",
};

// ── Ball icon ────────────────────────────────────────────────────────

const BALL_ROMAN: Record<BallColor, string> = {
  red: "red_orb", blue: "blue_orb", black: "black_orb",
  pink: "pink_orb", yellow: "yellow_orb", gold: "dragon_ball",
};

const COLOR_LABEL: Record<BallColor, string> = {
  red: "빨강", blue: "파랑", black: "검정", pink: "분홍", yellow: "노랑", gold: "궁극의 드래곤볼",
};

/** 구슬 색 → 작은 아이콘. 이미지 우선.
 *  stars 지정 시 레벨별 별 개수 변형(`{color}_orb_s{n}`)을 사용(카드 보너스용). */
export function ballIcon(color: BallColor, size = 16, stars?: number): HTMLElement {
  const key = stars && color !== "gold" ? `${BALL_ROMAN[color]}_s${stars}` : BALL_ROMAN[color];
  const src = ballImg(key);
  if (src) {
    return el("img", { src, alt: COLOR_LABEL[color], width: size, height: size, class: "inline-block" });
  }
  const fa = color === "gold" ? "fa-star" : COLOR_FA[color as Color] ?? "fa-circle";
  return el("i", { class: `fa-solid ${fa}` });
}

// ── Ball chip (DaisyUI badge style) ──────────────────────────────────

/** 컬러 구슬 칩: 배경색 + FA 아이콘 + 수량. */
export function ballChip(color: BallColor, count: number): HTMLElement {
  const cls = ["ball-chip"];
  if (color === "gold") cls.push("gold");
  else cls.push(COLOR_CLASS[color as Color] ?? "");
  const fa = color === "gold" ? "fa-star" : COLOR_FA[color as Color] ?? "fa-circle";
  return el("span", { class: cls.join(" "), title: COLOR_LABEL[color] }, [
    el("i", { class: `fa-solid ${fa} text-xs` }),
    `${COLOR_LABEL[color]} ${count}`,
  ]);
}

// ── Color count chip ─────────────────────────────────────────────────

/** 컬러별 수량 표시(색 배경 + 숫자). */
export function colorCountBadge(c: Color, n: number, title: string): HTMLElement {
  return el("span", { class: `bonus-chip bonus-count-chip ${COLOR_CLASS[c]}`, title }, [
    el("span", { class: "bonus-count" }, [String(n)]),
  ]);
}

// ── Cost chips (색별 필요 수 + 구슬 아이콘, 세로 스택) ─────────────────

/** 카드 비용 칩들(원가): 색별 [숫자 + 구슬 아이콘]. 실물 카드의 '잡기' 열 스타일.
 *  희귀/전설 카드는 드래곤볼(마스터) 1개가 추가로 필요하므로 보라색 드래곤볼 칩을 표시한다. */
export function costPips(card: CardDef): HTMLElement {
  const wrap = el("div", { class: "pc-cost" });
  // 필요 개수 내림차순(많은 색 먼저). 동수는 컬러 기본 순서 유지.
  const entries = COLORS
    .map((c) => ({ c, n: card.cost[c] ?? 0 }))
    .filter((e) => e.n > 0)
    .sort((a, b) => b.n - a.n);
  for (const { c, n } of entries) {
    wrap.append(el("div", { class: `pc-chip ${COLOR_CLASS[c]}` }, [
      el("span", { class: "pc-chip-n" }, [String(n)]),
      ballIcon(c, 15),
    ]));
  }
  if (isNoble(card.tier)) {
    wrap.append(el("div", { class: "pc-chip gold", title: "궁극의 드래곤볼 1개 필요" }, [
      el("span", { class: "pc-chip-n" }, ["1"]),
      ballIcon("gold", 15),
    ]));
  }
  return wrap;
}

/** 다음 변신(진화) 미리보기(상단 가운데): 다음 단계 이미지 ↓ 필요한 보너스 구슬(개수+색). 1·2단계만. */
function evoPreview(card: CardDef): HTMLElement | null {
  if (!card.evolvesTo || !card.evoCost) return null;
  const nextTier: Tier = card.tier === 1 ? 2 : 3;
  const costEls: (Node | string)[] = [];
  let evoColor: Color | undefined;
  for (const c of COLORS) {
    const n = card.evoCost[c];
    if (!n) continue;
    if (!evoColor) evoColor = c;
    costEls.push(String(n), ballIcon(c, 14));
  }
  const nextName = ROMAN_TO_KR[card.evolvesTo] ?? card.evolvesTo;
  const colorCls = evoColor ? COLOR_CLASS[evoColor] : "";
  return el("div", { class: `pc-evo ${colorCls}`, title: `변신 → ${nextName} (필요: 위 색 보너스)` }, [
    el("img", { src: cardImg(nextTier, card.evolvesTo), alt: nextName, class: "pc-evo-img" }),
    el("i", { class: "fa-solid fa-angles-down pc-evo-arr" }),
    el("div", { class: "pc-evo-cost" }, costEls),
  ]);
}

/** 카드가 주는 보너스 구슬 아이콘들(보너스 색 × 개수). 실물 카드 우상단 스타일. */
function bonusIcons(card: CardDef): HTMLElement {
  const wrap = el("div", { class: "pc-bonus" });
  // 별 개수 = 카드 레벨. 1/2/3단계 → 1/2/3성, 희귀 → 4성, 전설 → 5성.
  const stage = stageOf(card.tier);
  const stars = stage > 0 ? stage : card.tier === "rare" ? 4 : 5;
  for (const c of COLORS) {
    const n = card.bonus[c];
    if (!n) continue;
    for (let i = 0; i < n; i++) wrap.append(ballIcon(c, 44, stars));
  }
  return wrap;
}

// ── Card element (DaisyUI card style) ────────────────────────────────

export interface CardOpts {
  clickable?: boolean;
  affordable?: boolean;
  dim?: boolean;
  reserveBtn?: boolean;
  evoBtn?: { sourceId: string; targetName: string; pointsGain: number };
  onclick?: (ev: MouseEvent) => void;
  badge?: string;
}

/** 카드 요소: 이미지, 이름/점수, 비용, 단계. */
export function makeCardEl(card: CardDef, opts: CardOpts = {}): HTMLElement {
  const cls = ["poke-card"];
  if (opts.clickable) cls.push("clickable");
  if (opts.affordable) cls.push("affordable");
  if (opts.dim) cls.push("dim");
  // Add bonus color class for background tinting
  const bonusClr = cardBonusColor(card);
  if (bonusClr) cls.push(`card-bg-${COLOR_CLASS[bonusClr]}`);
  // 희귀·전설 = 초사이어인 같은 레어 반짝임 효과
  if (card.tier === "rare") cls.push("pc-rare");
  else if (card.tier === "legendary") cls.push("pc-legendary");

  // 상단: 점수(좌) + 다음 변신 필요(가운데) + 보너스 구슬(우)
  const evo = evoPreview(card);
  const head = el("div", { class: "pc-head" }, [
    el("div", { class: "pc-pts" }, [card.points ? String(card.points) : ""]),
    evo ?? el("div", { class: "pc-evo-spacer" }),
    bonusIcons(card),
  ]);

  // 아트
  const art = el("div", { class: "pc-art" }, [
    el("img", { src: cardImg(card.tier, card.romanized), alt: card.name, class: "card-img" }),
  ]);

  const node = el("div", { class: cls.join(" "), dataset: { id: card.id } }, [
    head,
    art,
    costPips(card),
    el("div", { class: "pc-name" }, [card.name]),
  ]);

  if (opts.badge) node.append(el("span", { class: "badge badge-sm badge-primary absolute top-1 left-1" }, [opts.badge]));

  if (opts.reserveBtn) {
    const btn = el("button", { class: "reserve-btn", title: "보관" }, [
      el("i", { class: "fa-solid fa-bookmark" }),
    ]);
    btn.addEventListener("click", (e) => { e.stopPropagation(); });
    node.append(btn);
  }

  // 변신 가능 상태면 미리보기 블록을 강조
  if (opts.evoBtn) node.classList.add("evo-ready");

  if (opts.onclick) node.addEventListener("click", opts.onclick);
  return node;
}

// ── MiniCard ──────────────────────────────────────────────────────────

export interface MiniCardOpts {
  size?: number;
  label?: boolean;
  affordable?: boolean;
  onclick?: (ev: MouseEvent) => void;
  reserveBtn?: boolean;
  evoBtn?: { sourceId: string; targetName: string; pointsGain: number };
  /** 진화 필요 조건(색별 개수)을 카드에 표시. */
  evoCost?: boolean;
}

/** 작은 카드 썸네일. */
export function makeMiniCard(card: CardDef, opts: MiniCardOpts = {}): HTMLElement {
  const cls = ["mini-card"];
  if (opts.affordable) cls.push("affordable");
  if (opts.onclick) cls.push("clickable");
  // Add bonus color class for background tinting (same as poke-card)
  const bonusClr = cardBonusColor(card);
  if (bonusClr) cls.push(`card-bg-${COLOR_CLASS[bonusClr]}`);

  const children: (Node | string)[] = [];

  // 상단: [좌] 이 카드 구슬 · [가운데] 진화 필요(진화색) · [우] 다음 진화 썸네일
  //  → 좌/우는 카드 색상 그대로, 가운데만 진화 카드 색상.
  if (opts.evoCost) {
    const topbar = el("div", { class: "mini-topbar" });

    // 좌: 이 카드의 드래곤볼(카드 색상 위)
    if (bonusClr) {
      topbar.append(el("div", { class: "mini-own", title: `이 카드 구슬: ${COLOR_LABEL[bonusClr]}` }, [
        ballIcon(bonusClr, 26),
      ]));
    }

    if (card.evoCost && card.evolvesTo) {
      const primary = COLORS.find((c) => (card.evoCost![c] ?? 0) > 0);
      const primaryCls = primary ? COLOR_CLASS[primary] : "";
      const nextTier: Tier = card.tier === 1 ? 2 : 3;
      const nextName = ROMAN_TO_KR[card.evolvesTo] ?? card.evolvesTo;

      // 가운데: 진화 색상 pill(▲진화 + 필요 구슬)
      const reqs = el("div", { class: "mini-evo-reqs" });
      for (const c of COLORS) {
        const n = card.evoCost[c];
        if (!n) continue;
        reqs.append(el("span", { class: "mini-evo-req" }, [
          ballIcon(c, 18),
          el("span", { class: "mini-evo-x" }, [`×${n}`]),
        ]));
      }
      topbar.append(el("div", { class: `mini-evo-mid mini-evo-c-${primaryCls}`, title: `변신 필요: ${evoCostSummary(card)}` }, [
        el("span", { class: "mini-evo-arrow" }, ["▲ 진화"]),
        reqs,
      ]));

      // 우: 다음 진화 캐릭터 썸네일(카드 색상 위, 흰 박스 없음)
      topbar.append(el("img", { class: "mini-next-img", src: cardImg(nextTier, card.evolvesTo), alt: nextName, title: `다음 변신: ${nextName}` }));
    } else {
      topbar.append(el("div", { class: "mini-evo-mid mini-max" }, [el("span", { class: "mini-max-txt" }, ["최종형태"])]));
    }

    children.push(topbar);
  }

  children.push(el("img", { class: "mini-face", src: cardImg(card.tier, card.romanized), alt: card.name }));
  if (opts.label) {
    children.push(el("div", { class: "mini-name" }, [card.name]));
  }

  const node = el("div", { class: cls.join(" "), dataset: { id: card.id } }, children);

  // evoCost 미표시(보관 등)일 땐 우측 상단 배지로 드래곤볼 표시
  if (!opts.evoCost && bonusClr) {
    node.append(el("div", { class: "mini-ball", title: COLOR_LABEL[bonusClr] }, [ballIcon(bonusClr, 20)]));
  }

  if (opts.onclick) node.addEventListener("click", opts.onclick);
  return node;
}

// ── Tooltip ──────────────────────────────────────────────────────────

let currentTooltip: HTMLElement | null = null;

function evoCostSummary(card: CardDef): string {
  if (!card.evoCost) return "";
  return Object.entries(card.evoCost)
    .filter(([, v]) => v && v > 0)
    .map(([k, v]) => `${COLOR_LABEL[k as Color]} ${v}`)
    .join(" ");
}

/** 비용 툴팁 줄: 색별 [색이름+수]를 해당 색으로 표시. */
function tooltipCostLine(card: CardDef): HTMLElement {
  const parts: (Node | string)[] = ["비용: "];
  const entries = COLORS.filter((c) => (card.cost[c] ?? 0) > 0);
  entries.forEach((c, i) => {
    if (i > 0) parts.push(" ");
    parts.push(el("span", { class: `tt-cost-c tt-cost-${COLOR_CLASS[c]}` }, [`${COLOR_LABEL[c]}${card.cost[c]}`]));
  });
  if (isNoble(card.tier)) {
    parts.push(" ");
    parts.push(el("span", { class: "tt-cost-c tt-cost-gold" }, ["궁극1"]));
  }
  return el("div", { class: "tt-cost" }, parts);
}

/** 변신 안내 툴팁 줄: "변신→대상 (색N …)". 줄 전체를 진화 필요 색상(주 색)으로 표시. */
function tooltipEvoLine(card: CardDef): HTMLElement {
  const target = card.evolvesTo ? (ROMAN_TO_KR[card.evolvesTo] ?? card.evolvesTo) : "";
  const entries = COLORS.filter((c) => (card.evoCost?.[c] ?? 0) > 0);
  const primary = entries[0];
  const costTxt = entries.map((c) => `${COLOR_LABEL[c]} ${card.evoCost![c]}`).join(" ");
  const cls = primary ? `tt-evo tt-evo-c tt-evo-${COLOR_CLASS[primary]}` : "tt-evo";
  return el("div", { class: cls }, [`변신→${target} (${costTxt})`]);
}

export function showTooltip(anchor: HTMLElement, card: CardDef): void {
  hideTooltip();
  const tip = el("div", { class: "card-tooltip" }, [
    el("img", { src: cardImg(card.tier, card.romanized), alt: card.name }),
    el("div", { class: "tt-name" }, [card.name]),
    card.points ? el("div", { class: "tt-pts" }, [`${card.points}점`]) : "",
    tooltipCostLine(card),
    card.evolvesTo ? tooltipEvoLine(card) : "",
  ]);
  document.body.append(tip);
  currentTooltip = tip;

  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = rect.right + 8;
  let top = rect.top;
  if (left + tipRect.width > window.innerWidth) left = rect.left - tipRect.width - 8;
  if (top + tipRect.height > window.innerHeight) top = window.innerHeight - tipRect.height - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

export function hideTooltip(): void {
  if (currentTooltip) { currentTooltip.remove(); currentTooltip = null; }
}

// ── AI log ────────────────────────────────────────────────────────────

export function aiLogEl(): HTMLElement {
  return el("div", { class: "ai-log" });
}

// 로그 문자열의 볼 색상 단어를 해당 색 스팬으로 감싸 반환.
const LOG_COLOR_WORDS: readonly (readonly [string, string])[] = [
  ["빨강", "red"], ["파랑", "blue"], ["검정", "black"],
  ["분홍", "pink"], ["노랑", "yellow"], ["궁극", "gold"],
];
export function colorizeLog(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  let i = 0;
  while (i < text.length) {
    const hit = LOG_COLOR_WORDS.find(([w]) => text.startsWith(w, i));
    if (hit) {
      out.push(el("span", { class: `log-c-${hit[1]}` }, [hit[0]]));
      i += hit[0].length;
      continue;
    }
    let j = i + 1;
    while (j < text.length && !LOG_COLOR_WORDS.some(([w]) => text.startsWith(w, j))) j++;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

// ── Toast / Modal helpers ────────────────────────────────────────────

let toastTimeout: ReturnType<typeof setTimeout> | null = null;

/** 중앙 토스트 알림 (변신/획득 등). */
export function showToast(text: string, icon = "fa-star", durationMs = 2500): void {
  const existing = document.querySelector(".toast-container");
  if (existing) existing.remove();
  if (toastTimeout) clearTimeout(toastTimeout);

  const toast = el("div", { class: "toast-container" }, [
    el("div", { class: "alert alert-success shadow-lg flex items-center gap-3 px-6 py-4" }, [
      el("i", { class: `fa-solid ${icon} text-2xl` }),
      el("span", { class: "font-bold text-lg" }, [text]),
    ]),
  ]);
  document.body.append(toast);
  toastTimeout = setTimeout(() => toast.remove(), durationMs);
}

/** 변신 성공 토스트. */
export function showEvolutionToast(characterName: string): void {
  showToast(`${characterName} 변신 성공!`, "fa-wand-magic-sparkles", 3000);
}

/** 내 차례에 변신 가능함을 알리는 토스트. */
export function showEvolveAvailableToast(): void {
  showToast("변신 가능!", "fa-wand-magic-sparkles", 2500);
}

/** 전설 획득 토스트. */
export function showCaptureToast(characterName: string): void {
  showToast(`${characterName} 획득!`, "fa-trophy", 3000);
}
