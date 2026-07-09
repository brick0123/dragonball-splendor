// 효과음 — 외부 파일 없이 Web Audio API 로 합성(단일 HTML 빌드 유지).
// AudioContext 는 자동재생 정책상 첫 사용자 입력 이후에 소리가 난다.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => { /* noop */ });
  return ctx;
}

/** 첫 입력에서 오디오 컨텍스트를 미리 깨워둔다(끊김 방지). */
export function primeSfx(): void { ac(); }
export function setSfxEnabled(on: boolean): void { enabled = on; }

/** 단일 톤. start/dur 초, type 파형, gain 0~1. */
function tone(freq: number, start: number, dur: number, type: OscillatorType = "triangle", gain = 0.8): void {
  const c = ac();
  if (!c || !master || !enabled) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

/** 구슬 하나 선택(집기): 짧고 가벼운 클릭. */
export function sfxPick(): void {
  tone(680, 0, 0.06, "square", 0.35);
}

/** 구슬 가져오기 확정: 동전 줍는 듯한 2음. */
export function sfxTake(): void {
  tone(587, 0, 0.07, "triangle", 0.6);
  tone(880, 0.06, 0.12, "triangle", 0.6);
}

/** 카드 구매: 상승 아르페지오(성취감). */
export function sfxBuy(): void {
  tone(523, 0, 0.1, "triangle", 0.7);
  tone(659, 0.07, 0.1, "triangle", 0.7);
  tone(784, 0.14, 0.18, "triangle", 0.7);
}

/** 보관(예약): 부드러운 낮은 2음. */
export function sfxReserve(): void {
  tone(440, 0, 0.09, "sine", 0.6);
  tone(330, 0.07, 0.14, "sine", 0.6);
}

/** 변신(진화): 상승 스윕 + 반짝임(파워업). */
export function sfxEvolve(): void {
  const c = ac();
  if (!c || !master || !enabled) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(220, t0);
  o.frequency.exponentialRampToValueAtTime(1320, t0 + 0.32);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.45, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + 0.55);
  // 반짝임
  tone(1568, 0.28, 0.18, "triangle", 0.4);
  tone(2093, 0.36, 0.16, "triangle", 0.3);
}

/** 채팅 도착: 짧고 부드러운 알림음. */
export function sfxChat(): void {
  tone(988, 0, 0.06, "sine", 0.5);
  tone(1319, 0.05, 0.1, "sine", 0.45);
}

/** 승리/게임 종료 팡파르. */
export function sfxWin(): void {
  tone(523, 0, 0.14, "triangle", 0.7);
  tone(659, 0.12, 0.14, "triangle", 0.7);
  tone(784, 0.24, 0.14, "triangle", 0.7);
  tone(1047, 0.36, 0.3, "triangle", 0.7);
}
