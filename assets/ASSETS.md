# 이미지 리소스 규칙 및 매니페스트

## 디렉토리 구조
```
assets/
├── balls/      # 드래곤볼(구슬) 이미지 (128×128)
├── stage1/     # 1단계 캐릭터 카드 (256×256)
├── stage2/     # 2단계 캐릭터 카드 (256×256)
├── stage3/     # 3단계 캐릭터 카드 (256×256)
└── rare/       # 희귀/전설 캐릭터 (256×256)
```

## 파일명 규칙
 - **포맷**: 현재는 SVG placeholder(텍스트+색). 실제 아트로 교체 시 PNG/SVG 모두 가능.
 - **파일명**: 영문 소문자 romanization (예: `goku_ss4.svg`)
 - **크기**: 카드 256×256, 구슬 128×128 (CSS로 스케일링되므로 비율만 맞으면 됨)
 - **이름 정규화**: 공백 없음, 밑줄로 단어 구분 (`baby`, `omega_shenron`)

> 동일 캐릭터의 변신 단계는 서로 다른 romanized 로 각 단계 디렉토리에 별개 파일 (예: `stage1/goku.svg`, `stage2/goku_ss.svg`, `stage3/goku_ss4.svg`). 충돌 없음.

## 매니페스트 (코드 참조용)
 `data` 모듈에서 `assets/<dir>/<romanized>.(svg|png)` 경로로 직접 참조. 파일명 = 식별자.

### 드래곤볼/구슬 (balls/)
 | 한국어 | 파일명 | 컬러 |
 |---|---|---|
 | 붉은 구슬 | red_orb | 레드 |
 | 푸른 구슬 | blue_orb | 블루 |
 | 검은 구슬 | black_orb | 블랙 |
 | 분홍 구슬 | pink_orb | 핑크 |
 | 노란 구슬 | yellow_orb | 옐로 |
 | 궁극의 드래곤볼 | dragon_ball | (와일드) |

### 희귀/전설 (rare/)
 | 한국어 | 파일명 | 등급 |
 |---|---|---|
 | 크리링 | krillin | 희귀 |
 | 덴데 | dende | 희귀 |
 | 무천도사 | roshi | 희귀 |
 | 미스터 사탄 | hercule | 희귀 |
 | 계왕 | kingkai | 희귀 |
 | 신룡 | shenron | 전설 |
 | 폴룽가 | porunga | 전설 |
 | 오메가 흑성룡 | omega_shenron | 전설 |
 | 우브 | uub | 전설 |
 | 바독 | bardock | 전설 |

### 변신 라인 (stage1 → stage2 → stage3)
 각 라인은 한 캐릭터의 3단계 변신. 라인 보너스색은 3단계 공유.

 | 라인색 | 1단계 (stage1) | 2단계 (stage2) | 3단계 (stage3) |
 |---|---|---|---|
 | 블루 | 손오공 `goku` | 초사이어인 오공 `goku_ss` | 초사이어인4 오공 `goku_ss4` |
 | 옐로 | 베지터 `vegeta` | 초사이어인 베지터 `vegeta_ss` | 초사이어인4 베지터 `vegeta_ss4` |
 | 레드 | 소년 오반 `gohan` | 초사이어인2 오반 `gohan_ss2` | 궁극의 오반 `gohan_ultimate` |
 | 핑크 | 트랭크스 `trunks` | 초사이어인 트랭크스 `trunks_ss` | 분노의 트랭크스 `trunks_rage` |
 | 블랙 | 프리저 `frieza` | 최종형태 프리저 `frieza_final` | 풀파워 프리저 `frieza_full` |
 | 블루 | 불완전체 셀 `cell` | 준완전체 셀 `cell_semi` | 완전체 셀 `cell_perfect` |
 | 옐로 | 뚱보 부우 `buu_fat` | 사악한 부우 `buu_evil` | 키드 부우 `buu_kid` |
 | 레드 | 피콜로 `piccolo` | 합체 피콜로 `piccolo_fused` | 신 합체 피콜로 `piccolo_kami` |
 | 핑크 | 브로리 `broly` | 초사이어인 브로리 `broly_ss` | 전설의 초사이어인 `broly_legendary` |
 | 블랙 | 베이비 `baby` | 슈퍼 베이비 `baby_super` | 슈퍼 베이비2 `baby_super2` |
 | 블루 | 베지트 `vegito` | 초사이어인 베지트 `vegito_ss` | 슈퍼 베지트 `vegito_super` |
 | 옐로 | 고구스 `gogeta` | 초사이어인 고구스 `gogeta_ss` | 초사이어인4 고구스 `gogeta_ss4` |
 | 레드 | 오천크스 `gotenks` | 초사이어인 오천크스 `gotenks_ss` | 초사이어인3 오천크스 `gotenks_ss3` |
 | 핑크 | 손오천 `goten` | 초사이어인 손오천 `goten_ss` | 초사이어인2 손오천 `goten_ss2` |
 | 블랙 | 천진반 `tenshinhan` | 사공권 천진반 `tenshinhan_4arms` | 신기공포 천진반 `tenshinhan_max` |

## 현재 상태
 - **캐릭터 55종 전부 실제 이미지** (개인·비상업 용도):
   - 45종: [Dragon Ball API](https://dragonball-api.com) 캐릭터/변신 렌더(.webp)
   - 10종: [Dragon Ball Fandom](https://dragonball.fandom.com) 이미지 — API 에 없는 베이비/손오천/신룡/폴룽가/오메가 흑성룡/우브. (베이비·손오천 라인은 대표 이미지를 3단계 공유)
   - `scripts/import-images.mjs` 로 배치.
 - **구슬 6종**: `scripts/gen-placeholders.mjs` 로 생성한 색상 구슬 SVG.
 - 이미지 교체: `incoming/` 에 romanized 파일명으로 넣고 `node scripts/import-images.mjs incoming`. placeholder 재생성은 `scripts/gen-placeholders.mjs`.

## 이미지 교체 시 체크리스트
 - [ ] 카드 256×256, 구슬 128×128 권장 (CSS 스케일링되므로 비율만 맞으면 됨)
 - [ ] 파일명 동일 유지 (romanization). PNG 로 교체 시 `assets.ts` 의 glob(`{png,svg}`)이 자동 인식
 - [ ] 저작권/라이선스 확보 (드래곤볼 IP 자산은 비상업적 팬 용도만 허용)
