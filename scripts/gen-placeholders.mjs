// 캐릭터 엠블럼(오리지널 SVG) 생성기 — 무의존성 Node ESM.
// 공식 아트를 복제하지 않고, 게임 톤앤매너에 맞춘 기하학적 오리지널 엠블럼을 그린다.
//   - 사이어인: 오라 + 얼굴 + 변신 단계별 색(어둠→골드→SS4 레드)의 스파이크 헤어 실루엣
//   - 빌런/기타: 오라 + 각진 헤드 + 뿔/에너지 모티프
// 실제 아트로 교체 시 같은 romanized 파일명(.png/.svg)으로 덮어쓰면 코드 수정 불필요.
//   실행: node scripts/gen-placeholders.mjs
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "assets");

const HEX = { red: "#e23636", blue: "#2f6fed", black: "#33363d", pink: "#ec5aa0", yellow: "#f2c53d", gold: "#8b5cf6" };
const INK = { red: "#ffffff", blue: "#ffffff", black: "#ffffff", pink: "#ffffff", yellow: "#232323", gold: "#ffffff" };
const AURA = { red: "#ff8a5c", blue: "#7db4ff", black: "#8a8fb0", pink: "#ffa8d4", yellow: "#ffe27a", gold: "#c4b5fd" };

// [color, kind, [s1kr,s1rom],[s2kr,s2rom],[s3kr,s3rom]]  — kind: saiyan | villain
const LINES = [
  ["blue", "saiyan", ["손오공", "goku"], ["초사이어인 오공", "goku_ss"], ["초사이어인4 오공", "goku_ss4"]],
  ["yellow", "saiyan", ["베지터", "vegeta"], ["초사이어인 베지터", "vegeta_ss"], ["초사이어인4 베지터", "vegeta_ss4"]],
  ["red", "saiyan", ["소년 오반", "gohan"], ["초사이어인2 오반", "gohan_ss2"], ["궁극의 오반", "gohan_ultimate"]],
  ["pink", "saiyan", ["트랭크스", "trunks"], ["초사이어인 트랭크스", "trunks_ss"], ["분노의 트랭크스", "trunks_rage"]],
  ["black", "villain", ["프리저", "frieza"], ["최종형태 프리저", "frieza_final"], ["풀파워 프리저", "frieza_full"]],
  ["blue", "villain", ["불완전체 셀", "cell"], ["준완전체 셀", "cell_semi"], ["완전체 셀", "cell_perfect"]],
  ["yellow", "villain", ["뚱보 부우", "buu_fat"], ["사악한 부우", "buu_evil"], ["키드 부우", "buu_kid"]],
  ["red", "villain", ["피콜로", "piccolo"], ["합체 피콜로", "piccolo_fused"], ["신 합체 피콜로", "piccolo_kami"]],
  ["pink", "saiyan", ["브로리", "broly"], ["초사이어인 브로리", "broly_ss"], ["전설의 초사이어인", "broly_legendary"]],
  ["black", "villain", ["베이비", "baby"], ["슈퍼 베이비", "baby_super"], ["슈퍼 베이비2", "baby_super2"]],
  ["blue", "saiyan", ["베지트", "vegito"], ["초사이어인 베지트", "vegito_ss"], ["슈퍼 베지트", "vegito_super"]],
  ["yellow", "saiyan", ["고구스", "gogeta"], ["초사이어인 고구스", "gogeta_ss"], ["초사이어인4 고구스", "gogeta_ss4"]],
  ["red", "saiyan", ["오천크스", "gotenks"], ["초사이어인 오천크스", "gotenks_ss"], ["초사이어인3 오천크스", "gotenks_ss3"]],
  ["pink", "saiyan", ["손오천", "goten"], ["초사이어인 손오천", "goten_ss"], ["초사이어인2 손오천", "goten_ss2"]],
  ["black", "villain", ["천진반", "tenshinhan"], ["사공권 천진반", "tenshinhan_4arms"], ["신기공포 천진반", "tenshinhan_max"]],
];

// rare/ 에 모두 배치. [kr, rom, color, gradeLabel, kind]
const RARE = [
  ["크리링", "krillin", "red", "희귀", "saiyan"], ["덴데", "dende", "blue", "희귀", "villain"],
  ["무천도사", "roshi", "yellow", "희귀", "saiyan"], ["미스터 사탄", "hercule", "pink", "희귀", "saiyan"],
  ["계왕", "kingkai", "black", "희귀", "villain"],
];
const LEGENDARY = [
  ["신룡", "shenron", "red", "전설", "villain"], ["폴룽가", "porunga", "blue", "전설", "villain"],
  ["오메가 흑성룡", "omega_shenron", "yellow", "전설", "villain"], ["우브", "uub", "pink", "전설", "saiyan"],
  ["바독", "bardock", "black", "전설", "saiyan"],
];

// [kr, rom, color, isMaster]
const BALLS = [
  ["붉은 구슬", "red_orb", "red", false], ["푸른 구슬", "blue_orb", "blue", false],
  ["검은 구슬", "black_orb", "black", false], ["분홍 구슬", "pink_orb", "pink", false],
  ["노란 구슬", "yellow_orb", "yellow", false], ["궁극의 드래곤볼", "dragon_ball", "gold", true],
];

const FONT = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 이름을 최대 2줄로 분할. */
function wrap(name) {
  if (name.length <= 6 && !name.includes(" ")) return [name];
  const parts = name.split(" ");
  if (parts.length >= 2) { const m = Math.ceil(parts.length / 2); return [parts.slice(0, m).join(" "), parts.slice(m).join(" ")]; }
  const m = Math.ceil(name.length / 2); return [name.slice(0, m), name.slice(m)];
}

/** 변신 단계별 헤어/에너지 색: 1단계 어둠 → 2단계 골드 → 3단계 SS4 레드/밝은 골드. */
function hairColor(stage, rom) {
  if (stage === 0) return "#2f2f38";
  if (rom.includes("ss4")) return "#8f2f22";      // SS4: 붉은 체모
  if (stage >= 2) return "#ffd83a";               // 초사이어인 골드
  return "#2f2f38";                                // base
}

/** 사이어인 스파이크 헤어 폴리곤. 단계가 높을수록 길고 많은 스파이크. */
function saiyanHair(stage) {
  const cx = 128, baseY = 96, half = 50;
  const n = stage <= 1 ? 6 : stage === 2 ? 8 : 10;
  const maxH = stage <= 1 ? 26 : stage === 2 ? 52 : 66;
  const step = (half * 2) / n;
  const pts = [`${cx - half},${baseY}`];
  for (let i = 0; i < n; i++) {
    const x0 = cx - half + i * step;
    const center = 1 - Math.abs((i + 0.5) / n - 0.5) * 1.4; // 가운데가 더 김
    const h = maxH * (0.55 + 0.45 * Math.max(0, center));
    const skew = (i - n / 2) * 3;
    pts.push(`${(x0 + step / 2 + skew).toFixed(1)},${(baseY - h).toFixed(1)}`); // 스파이크 정점
    pts.push(`${(x0 + step).toFixed(1)},${(baseY - 6).toFixed(1)}`);            // 골
  }
  pts.push(`${cx + half},${baseY}`);
  return pts.join(" ");
}

function figure(kind, stage, rom) {
  const cx = 128, headCy = 120, headR = 40;
  if (kind === "saiyan") {
    const hc = hairColor(stage, rom);
    return `
  <circle cx="${cx}" cy="${headCy}" r="${headR}" fill="#f3c9a8" stroke="#00000022" stroke-width="2"/>
  <polygon points="${saiyanHair(stage)}" fill="${hc}" stroke="#00000030" stroke-width="1.5"/>
  <circle cx="${cx - 14}" cy="${headCy}" r="3.4" fill="#222"/>
  <circle cx="${cx + 14}" cy="${headCy}" r="3.4" fill="#222"/>`;
  }
  // villain: 각진 헤드 + 뿔 + 에너지
  const hornH = 22 + stage * 8;
  return `
  <polygon points="${cx - 30},${headCy - 26} ${cx - 44},${headCy - 26 - hornH} ${cx - 16},${headCy - 30}" fill="#e9e6df" stroke="#00000030" stroke-width="1.5"/>
  <polygon points="${cx + 30},${headCy - 26} ${cx + 44},${headCy - 26 - hornH} ${cx + 16},${headCy - 30}" fill="#e9e6df" stroke="#00000030" stroke-width="1.5"/>
  <path d="M ${cx - 38} ${headCy - 20} Q ${cx} ${headCy - 46} ${cx + 38} ${headCy - 20} L ${cx + 30} ${headCy + 34} Q ${cx} ${headCy + 50} ${cx - 30} ${headCy + 34} Z" fill="#dfe3ea" stroke="#00000030" stroke-width="2"/>
  <path d="M ${cx - 18} ${headCy - 4} l 12 8 l -12 6 Z" fill="#c0303a"/>
  <path d="M ${cx + 18} ${headCy - 4} l -12 8 l 12 6 Z" fill="#c0303a"/>`;
}

function auraRays(tint) {
  const cx = 128, cy = 120, out = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r1 = 70, r2 = 104 + (i % 2) * 14;
    const x1 = (cx + Math.cos(a) * r1).toFixed(1), y1 = (cy + Math.sin(a) * r1).toFixed(1);
    const x2 = (cx + Math.cos(a) * r2).toFixed(1), y2 = (cy + Math.sin(a) * r2).toFixed(1);
    const w = 5;
    const px = (-Math.sin(a) * w).toFixed(1), py = (Math.cos(a) * w).toFixed(1);
    out.push(`<polygon points="${x1 - -0},${y1} ${x2},${y2} ${(+x1 + +px).toFixed(1)},${(+y1 + +py).toFixed(1)}" fill="${tint}" fill-opacity="0.28"/>`);
  }
  return out.join("\n  ");
}

function cardSvg(kr, color, label, kind, stage, rom) {
  const bg = HEX[color], ink = INK[color], tint = AURA[color];
  const lines = wrap(kr);
  const fs = lines.some((l) => l.length > 7) ? 22 : 26;
  const nameY = 224 - (lines.length - 1) * (fs / 2 + 2);
  const tspans = lines
    .map((l, i) => `<text x="128" y="${nameY + i * (fs + 4)}" font-size="${fs}" font-weight="800" fill="${ink}" text-anchor="middle" font-family="${FONT}">${esc(l)}</text>`)
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg}" stop-opacity="0.7"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.46" r="0.5">
      <stop offset="0" stop-color="${tint}" stop-opacity="0.85"/><stop offset="1" stop-color="${tint}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="6" y="6" width="244" height="244" rx="22" fill="url(#bg)" stroke="${ink}" stroke-opacity="0.35" stroke-width="3"/>
  ${auraRays(tint)}
  <circle cx="128" cy="120" r="78" fill="url(#glow)"/>
  ${figure(kind, stage, rom)}
  <rect x="6" y="6" width="76" height="34" rx="14" fill="${ink}" fill-opacity="0.16"/>
  <text x="44" y="29" font-size="16" font-weight="700" fill="${ink}" fill-opacity="0.9" text-anchor="middle" font-family="${FONT}">${esc(label)}</text>
  <rect x="6" y="196" width="244" height="54" rx="0" fill="#000000" fill-opacity="0.28"/>
  ${tspans}
</svg>\n`;
}

function ballSvg(kr, color, isMaster) {
  const bg = HEX[color], ink = INK[color], tint = AURA[color];
  const stars = isMaster
    ? `<text x="64" y="58" font-size="30" text-anchor="middle" fill="${ink}">★</text>`
    : `<text x="64" y="58" font-size="26" text-anchor="middle" fill="${ink}" fill-opacity="0.9">✦</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs><radialGradient id="r" cx="0.38" cy="0.32" r="0.8">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
    <stop offset="0.4" stop-color="${bg}"/><stop offset="1" stop-color="${bg}"/>
  </radialGradient></defs>
  <circle cx="64" cy="60" r="46" fill="${tint}" fill-opacity="0.35"/>
  <circle cx="64" cy="60" r="40" fill="url(#r)" stroke="${ink}" stroke-opacity="0.5" stroke-width="4"/>
  ${stars}
  <text x="64" y="118" font-size="14" font-weight="700" fill="${ink}" text-anchor="middle" font-family="${FONT}">${esc(kr)}</text>
</svg>\n`;
}

function freshDir(dir) {
  const p = resolve(assets, dir);
  if (!existsSync(p)) { mkdirSync(p, { recursive: true }); return; }
  for (const f of readdirSync(p)) if (/\.(png|svg)$/.test(f)) rmSync(resolve(p, f));
}

let n = 0;
for (const d of ["stage1", "stage2", "stage3", "rare", "balls"]) freshDir(d);

const stageDir = ["stage1", "stage2", "stage3"];
const stageLabel = ["1단계", "2단계", "3단계"];
for (const [color, kind, ...stages] of LINES) {
  stages.forEach(([kr, rom], i) => {
    writeFileSync(resolve(assets, stageDir[i], `${rom}.svg`), cardSvg(kr, color, stageLabel[i], kind, i + 1, rom));
    n++;
  });
}
for (const [kr, rom, color, label, kind] of [...RARE, ...LEGENDARY]) {
  writeFileSync(resolve(assets, "rare", `${rom}.svg`), cardSvg(kr, color, label, kind, 3, rom));
  n++;
}
for (const [kr, rom, color, isMaster] of BALLS) {
  writeFileSync(resolve(assets, "balls", `${rom}.svg`), ballSvg(kr, color, isMaster));
  n++;
}

console.log(`generated ${n} character emblem SVGs`);
