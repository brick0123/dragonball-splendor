// 드래곤볼 스타일 구슬 SVG 생성기 (무의존성 Node).
// 구(球) 색상 = 자원 색 구분 / 별 개수 = 카드 레벨 구분.
//   1단계→1성, 2단계→2성, 3단계→3성, 희귀→4성, 전설→5성.
//   base(별 4개) = 토큰·비용칩용. 궁극의 드래곤볼(gold) = 보라색 7성구.
// 실행: node scripts/gen-orbs.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "balls");

// 색상별: [파일명 prefix, 중간색, 가장자리(어두운)색, 헤일로색]
const ORBS = [
  ["red_orb",    "#e83a3a", "#b81616", "#ff9a9a"],
  ["blue_orb",   "#3a78ec", "#1b4fb8", "#9ab8ff"],
  ["black_orb",  "#40434c", "#23252b", "#8a8d96"],
  ["pink_orb",   "#ec5aa8", "#c22d86", "#ffaad8"],
  ["yellow_orb", "#ecc02a", "#c8930f", "#ffe08a"],
];

// 정오각별 path (중심 cx,cy, 외곽 r). 위 꼭지점부터.
function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
  }
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z";
}

// 별 개수별 배치(구 중심 64,64 기준 오프셋). 실제 드래곤볼 별 배열 모사.
const LAYOUT = {
  1: [[0, 0]],
  2: [[-16, 0], [16, 0]],
  3: [[0, -16], [-15, 12], [15, 12]],
  4: [[-15, -15], [15, -15], [-15, 15], [15, 15]],
  5: [[-16, -16], [16, -16], [0, 0], [-16, 16], [16, 16]],
  6: [[-16, -16], [16, -16], [-16, 0], [16, 0], [-16, 16], [16, 16]],
  7: [[0, -20], [-17, -8], [17, -8], [0, 4], [-17, 16], [17, 16], [0, 22]],
};

// 별: 흰색 채움 + 진홍 테두리 → 어떤 구 색에서도 잘 보이고 드래곤볼 느낌 유지.
function starsSvg(count) {
  const r = count >= 6 ? 8 : count >= 4 ? 9.5 : 12;
  return LAYOUT[count]
    .map(([dx, dy]) => `<path d="${star(64 + dx, 64 + dy, r)}" fill="#fff" stroke="#a80f14" stroke-width="1.6" stroke-linejoin="round"/>`)
    .join("");
}

function orbSvg(mid, dark, halo, count) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs><radialGradient id="g" cx="0.36" cy="0.30" r="0.85">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
    <stop offset="0.38" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/>
  </radialGradient></defs>
  <circle cx="64" cy="64" r="52" fill="${halo}" fill-opacity="0.30"/>
  <circle cx="64" cy="64" r="46" fill="url(#g)" stroke="#fff" stroke-opacity="0.55" stroke-width="4"/>
  ${starsSvg(count)}
  <ellipse cx="50" cy="44" rx="15" ry="9" fill="#fff" fill-opacity="0.4"/>
</svg>
`;
}

let n = 0;
for (const [name, mid, dark, halo] of ORBS) {
  // base(4성) = 토큰/비용칩용
  writeFileSync(join(OUT, `${name}.svg`), orbSvg(mid, dark, halo, 4));
  // 레벨별 변형 s1~s5 (카드 보너스용)
  for (let s = 1; s <= 5; s++) writeFileSync(join(OUT, `${name}_s${s}.svg`), orbSvg(mid, dark, halo, s));
  n += 6;
}
// 궁극의 드래곤볼(gold/찜볼) = 보라색 7성구
writeFileSync(join(OUT, "dragon_ball.svg"), orbSvg("#a855f7", "#7c3aed", "#d8b4fe", 7));
n += 1;
console.log(`✓ ${n} orb SVGs 생성 (색=자원 / 별=레벨, 궁극의 드래곤볼=보라 7성)`);
