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

/** 구슬 색 → 작은 아이콘. 이미지 우선. */
export function ballIcon(color: BallColor, size = 16): HTMLElement {
  const src = ballImg(BALL_ROMAN[color]);
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
  for (const c of COLORS) {
    const n = card.cost[c];
    if (!n) continue;
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
  for (const c of COLORS) {
    const n = card.evoCost[c];
    if (!n) continue;
    costEls.push(String(n), ballIcon(c, 14));
  }
  const nextName = ROMAN_TO_KR[card.evolvesTo] ?? card.evolvesTo;
  return el("div", { class: "pc-evo", title: `변신 → ${nextName} (필요: 위 색 보너스)` }, [
    el("img", { src: cardImg(nextTier, card.evolvesTo), alt: nextName, class: "pc-evo-img" }),
    el("i", { class: "fa-solid fa-angles-down pc-evo-arr" }),
    el("div", { class: "pc-evo-cost" }, costEls),
  ]);
}

/** 카드가 주는 보너스 구슬 아이콘들(보너스 색 × 개수). 실물 카드 우상단 스타일. */
function bonusIcons(card: CardDef): HTMLElement {
  const wrap = el("div", { class: "pc-bonus" });
  for (const c of COLORS) {
    const n = card.bonus[c];
    if (!n) continue;
    for (let i = 0; i < n; i++) wrap.append(ballIcon(c, 22));
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

  // Stage/등급 라벨
  const stage = stageOf(card.tier);
  const stageText = stage > 0 ? `${stage}단계` : card.tier === "rare" ? "희귀" : "전설";

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
    el("span", { class: "pc-stage" }, [stageText]),
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
}

/** 작은 카드 썸네일. */
export function makeMiniCard(card: CardDef, opts: MiniCardOpts = {}): HTMLElement {
  const cls = ["mini-card"];
  if (opts.affordable) cls.push("affordable");
  if (opts.onclick) cls.push("clickable");
  // Add bonus color class for background tinting (same as poke-card)
  const bonusClr = cardBonusColor(card);
  if (bonusClr) cls.push(`card-bg-${COLOR_CLASS[bonusClr]}`);

  const children: (Node | string)[] = [
    el("img", { src: cardImg(card.tier, card.romanized), alt: card.name }),
  ];
  if (opts.label) {
    children.push(el("div", { class: "mini-name" }, [card.name]));
  }

  const node = el("div", { class: cls.join(" "), dataset: { id: card.id } }, children);

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

export function showTooltip(anchor: HTMLElement, card: CardDef): void {
  hideTooltip();
  const tip = el("div", { class: "card-tooltip" }, [
    el("img", { src: cardImg(card.tier, card.romanized), alt: card.name }),
    el("div", { class: "tt-name" }, [card.name]),
    card.points ? el("div", { class: "tt-pts" }, [`${card.points}점`]) : "",
    el("div", { class: "tt-cost" }, [
      "비용: ",
      ...Object.entries(card.cost)
        .filter(([, v]) => v && v > 0)
        .map(([k, v]) => `${COLOR_LABEL[k as Color]}${v}`)
        .join(" "),
    ]),
    card.evolvesTo ? el("div", { class: "tt-evo" }, [`변신→${ROMAN_TO_KR[card.evolvesTo] ?? card.evolvesTo} (${evoCostSummary(card)})`]) : "",
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

/** 전설 획득 토스트. */
export function showCaptureToast(characterName: string): void {
  showToast(`${characterName} 획득!`, "fa-trophy", 3000);
}
