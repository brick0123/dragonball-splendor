// 실제 캐릭터 이미지 일괄 적용기 — 무의존성 Node ESM.
// 사용법:
//   1) 이미지 파일을 romanized 파일명으로 준비 (예: goku.png, frieza_full.jpg, dragon_ball.png)
//      → 어떤 파일명이 어디에 해당하는지는 `node scripts/import-images.mjs --list` 로 확인
//   2) 그 파일들을 아무 폴더(기본 ./incoming)에 모아두고:
//        node scripts/import-images.mjs [소스폴더]
//      → 파일명(romanized)으로 자동 매칭해 올바른 assets/<dir>/ 로 복사하고,
//        같은 이름의 placeholder(.svg)는 제거한다. (png/jpg/jpeg/webp 지원)
//   3) 남은 슬롯(아직 placeholder)도 리포트한다.
import { readdirSync, copyFileSync, rmSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "assets");
const DIRS = ["stage1", "stage2", "stage3", "rare", "balls"];
const RASTER = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// 현재 placeholder(.svg/기존 이미지)로부터 romanized → dir 슬롯 맵을 구성.
const slot = new Map(); // romanized -> dir
for (const d of DIRS) {
  const p = resolve(assets, d);
  if (!existsSync(p)) continue;
  for (const f of readdirSync(p)) {
    const name = basename(f, extname(f));
    if (!slot.has(name)) slot.set(name, d);
  }
}

const args = process.argv.slice(2);
if (args.includes("--list")) {
  const byDir = {};
  for (const [name, d] of slot) (byDir[d] ??= []).push(name);
  for (const d of DIRS) console.log(`\n[${d}] (${byDir[d]?.length ?? 0})\n  ${(byDir[d] ?? []).sort().join(", ")}`);
  console.log(`\n총 ${slot.size} 슬롯. 위 이름 + 확장자(.png/.jpg/...)로 이미지를 준비하세요.`);
  process.exit(0);
}

const src = resolve(root, args[0] ?? "incoming");
if (!existsSync(src)) {
  console.error(`소스 폴더가 없습니다: ${src}\n이미지를 이 폴더에 romanized 파일명으로 넣거나, 경로를 인자로 주세요.\n슬롯 목록: node scripts/import-images.mjs --list`);
  process.exit(1);
}

let applied = 0;
const matchedRoman = new Set();
for (const f of readdirSync(src)) {
  const full = resolve(src, f);
  if (!statSync(full).isFile()) continue;
  const ext = extname(f).toLowerCase();
  if (!RASTER.has(ext)) continue;
  const name = basename(f, ext);
  const dir = slot.get(name);
  if (!dir) { console.warn(`  · 매칭 슬롯 없음(건너뜀): ${f}`); continue; }
  const dest = resolve(assets, dir, `${name}${ext}`);
  copyFileSync(full, dest);
  const ph = resolve(assets, dir, `${name}.svg`);
  if (existsSync(ph)) rmSync(ph); // placeholder 제거 → 실제 이미지만 남김
  matchedRoman.add(name);
  applied++;
  console.log(`  ✓ ${dir}/${name}${ext}`);
}

const missing = [...slot.keys()].filter((n) => !matchedRoman.has(n));
console.log(`\n적용 ${applied}개. 아직 placeholder 인 슬롯 ${missing.length}개:`);
if (missing.length) console.log("  " + missing.sort().join(", "));
console.log("\n적용 후: npm run dev / npm run build 로 확인. 코드 수정 불필요.");
