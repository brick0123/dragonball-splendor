// 결정론적 시드 RNG(mulberry32). 같은 시드 → 같은 게임 결과(재현/디버깅).
// 몬테카를로 플레이아웃은 상태 복제와 함께 이 RNG 를 복제해 분기한다.

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** 현재 내부 상태(복제용). */
  get state(): number {
    return this.s;
  }
  /** [0,1) 의사난수. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** [0, max) 정수. */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }
  /** [min, max] 정수(닫힌 구간). */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)]!;
  }
  /** Fisher-Yates. 입력 배열을 그대로 뒤섞어 반환. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }
  /** 동일 상태를 갖는 복제본(몬테카를로 분기용). */
  clone(): Rng {
    return new Rng(this.s);
  }
}
