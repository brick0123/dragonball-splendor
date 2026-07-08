import type { CardDef, Color, Tier } from "@/game/types";
import { COLORS, isNoble } from "@/game/types";
import type { GameState, PlayerState } from "@/game/state";
import {
  createGame, playerPoints, handBallCount, canAfford, cardOf, discountedCost,
} from "@/game/state";
import { legalEvolutions, legalMainActions, type MainAction, type Evolution } from "@/game/actions";
import { applyMainAction, applyEvolution, finishTurn, winnerId, rankPlayers } from "@/game/engine";
import { chooseStrongTurn } from "@/strategy/policy";
import { serialize, deserialize, type Snapshot } from "@/game/snapshot";
import { LanClient, type RosterEntry } from "@/net/lan";
import type { SimResponse } from "@/simulator/worker";
import { Rng } from "@/game/rng";
import { COLOR_DISPLAY, MAX_RESERVED } from "@/data/balls";
import { FUSIONS, FUSION_BY_ROMANIZED } from "@/data/cards";
import { fusionImg, cardImg } from "./assets";
import SimWorker from "@/simulator/worker?worker&inline";
import {
  el, ballIcon, ballChip, makeCardEl, makeMiniCard, colorCountBadge,
  showTooltip, hideTooltip, aiLogEl,
  showEvolutionToast, showCaptureToast, showEvolveAvailableToast,
} from "./view";

const DEFAULT_SEAT = 0;
const MC_N = 200;
const AI_DELAY_MS = 450;
const MASTER_BALL_SPEND_CONFIRM = "이 카드를 구입하면 궁극의 드래곤볼이 소모됩니다. 계속하시겠습니까?";
const AI_NAME_CANDIDATES = [
  "레드", "그린", "블루", "옐로", "실버", "크리스", "하루", "빛나",
  "투희", "체렌", "벨", "칼름", "세레나", "릴리에", "단델", "난천",
] as const;

type Phase = "human-action" | "human-evolve" | "ai" | "ended" | "remote-wait";
type NetMode = "local" | "host" | "guest";

interface UIMsg { kind: "info" | "ok" | "bad"; text: string }

export class Controller {
  private root: HTMLElement;
  private state!: GameState;
  private worker: Worker;
  private phase: Phase = "human-action";
  private msg: UIMsg = { kind: "info", text: "" };
  private winRates: number[] = [];
  private winRatesStale = true;
  private winRateRequestSeq = 0;
  private activeWinRateRequestId = 0;
  private aiRng = new Rng(98765);
  private probSeed = 1;
  private aiLog: string[] = [];
  private ballPickColors: Color[] = [];
  private ballPickActive = false;
  private endOverlayOpen = true; // 게임 종료 시 순위/새 게임 질문 오버레이 표시 여부
  private playerNames: string[] = ["나", "AI 1", "AI 2", "AI 3"];
  // ── LAN 대전 상태 ──
  private mySeat = DEFAULT_SEAT;
  private netMode: NetMode = "local";
  private lan: LanClient | null = null;
  private humanSeats: Set<number> = new Set([DEFAULT_SEAT]); // 사람이 앉은 좌석(나머지는 AI)
  private lanRoster: RosterEntry[] = [];
  private lanError = "";
  private lanLobbyOpen = false;
  private lanJoined = false; // 대기실에서 좌석 착석 여부(false=관전 상태)
  private lanName = ""; // 대기실 닉네임 입력값
  private pendingAction: MainAction | null = null; // 게스트: 변신 선택 중 보류된 메인 액션

  constructor(root: HTMLElement) {
    this.root = root;
    this.worker = new SimWorker();
    this.worker.onmessage = (e: MessageEvent<SimResponse>) => {
      if (e.data.requestId !== this.activeWinRateRequestId) return;
      this.winRates = e.data.rates;
      this.winRatesStale = false;
      this.renderProbs();
    };
    this.mountMusicPlayer();
  }

  /** 우측 하단 BGM 유튜브 플레이어(자동 재생). root 재렌더와 무관하게 body 에 1회만 마운트. */
  private mountMusicPlayer(): void {
    if (document.querySelector(".yt-player")) return;
    const VIDEO_ID = "uC8sc0cQa9M";
    const iframe = document.createElement("iframe");
    // 브라우저 자동재생 정책상 소리 켠 자동재생은 차단되므로, 음소거로 자동재생 후 첫 입력 때 소리를 켠다.
    iframe.src = `https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&mute=1&loop=1&playlist=${VIDEO_ID}&controls=1&rel=0&playsinline=1&enablejsapi=1`;
    iframe.title = "BGM";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.setAttribute("frameborder", "0");
    iframe.allowFullscreen = true;

    const toggle = el("button", { class: "yt-toggle", title: "접기/펼치기" }, [
      el("i", { class: "fa-solid fa-chevron-down" }),
    ]);
    const bar = el("div", { class: "yt-bar" }, [
      el("span", { class: "yt-title" }, [
        el("i", { class: "fa-solid fa-music mr-1" }),
        "BGM",
      ]),
      toggle,
    ]);
    const wrap = el("div", { class: "yt-player" }, [bar, iframe]);
    toggle.addEventListener("click", () => {
      wrap.classList.toggle("min");
      const icon = toggle.querySelector("i");
      if (icon) icon.className = wrap.classList.contains("min")
        ? "fa-solid fa-chevron-up"
        : "fa-solid fa-chevron-down";
    });
    document.body.append(wrap);

    // 첫 사용자 입력(클릭/키) 시 음소거 해제 + 최대 볼륨 재생 (자동재생 정책 우회)
    const enableSound = () => {
      const cw = iframe.contentWindow;
      if (!cw) return;
      for (const [func, args] of [["unMute", []], ["setVolume", [100]], ["playVideo", []]] as const) {
        cw.postMessage(JSON.stringify({ event: "command", func, args }), "*");
      }
    };
    window.addEventListener("pointerdown", enableSound, { once: true });
    window.addEventListener("keydown", enableSound, { once: true });
  }

  newGame(seed = (Math.random() * 1e9) | 0): void {
    this.state = createGame(seed, 4, this.mySeat);
    this.assignPlayerNames(seed);
    this.phase = "human-action";
    this.msg = { kind: "info", text: `새 게임 시작 (시드 ${seed}). 선공: ${this.playerName(this.state.startingPlayer)}.` };
    this.winRates = new Array(4).fill(0.25);
    this.winRatesStale = true;
    this.activeWinRateRequestId = ++this.winRateRequestSeq;
    this.probSeed = (Math.random() * 1e9) | 0;
    this.aiLog = [];
    this.ballPickColors = [];
    this.ballPickActive = false;
    this.endOverlayOpen = true;
    this.render();
    this.startTurn();
  }

  /** 새 게임 전 확인. LAN 모드별 분기. */
  private promptNewGame(): void {
    if (this.netMode === "guest") {
      this.setMsg({ kind: "info", text: "새 게임은 호스트만 시작할 수 있습니다." });
      this.render();
      return;
    }
    if (!this.state.ended) {
      if (!window.confirm("진행 중인 게임을 종료하고 새 게임을 시작할까요?")) return;
    }
    if (this.netMode === "host") { this.startLanGame(); return; }
    this.newGame();
  }

  // ── LAN 대전 ─────────────────────────────────────────────────────
  /** LAN 대기실 열기 + 릴레이 서버에 관전 접속(닉네임은 대기실에서 입력해 입장). */
  private openLanLobby(): void {
    this.lanLobbyOpen = true;
    if (this.lan) { this.render(); return; }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}`;
    this.lanError = "";
    this.lanJoined = false;
    this.lan = new LanClient();
    this.lan.connect(url, "main", {
      onJoined: (seat, isHost, roster) => {
        this.mySeat = seat;
        this.netMode = isHost ? "host" : "guest";
        this.lanRoster = roster;
        this.lanJoined = true;
        this.render();
      },
      onRoster: (roster) => { this.lanRoster = roster; this.onLanRosterChange(); },
      onRelay: (from, payload) => this.handleRelay(from, payload),
      onClose: (reason) => {
        this.lanError = reason;
        this.lan = null;
        this.netMode = "local";
        this.mySeat = DEFAULT_SEAT;
        this.humanSeats = new Set([DEFAULT_SEAT]);
        this.lanJoined = false;
        this.render();
      },
    });
    this.render();
  }

  /** 대기실에서 닉네임으로 착석. */
  private joinLan(): void {
    if (!this.lan || this.lanJoined) return;
    if (this.lanRoster.length >= 4) { this.lanError = "방이 가득 찼습니다 (최대 4명)."; this.render(); return; }
    const name = this.lanName.trim() || "플레이어";
    this.lanName = name;
    this.lanError = "";
    this.lan.join(name);
  }

  /** 로스터 변경(입장/퇴장) 처리. 진행 중 사람 좌석이 빠지면 호스트가 그 좌석을 AI로 전환. */
  private onLanRosterChange(): void {
    if (this.netMode === "host" && this.state && !this.lanLobbyOpen) {
      const connected = new Set(this.lanRoster.map((r) => r.seat));
      let changed = false;
      for (const s of [...this.humanSeats]) {
        if (!connected.has(s)) { this.humanSeats.delete(s); changed = true; }
      }
      if (changed) {
        this.broadcastState();
        if (this.phase === "remote-wait" && this.isAiSeat(this.state.currentPlayer)) this.startTurn();
      }
    }
    this.render();
  }

  private leaveLan(): void {
    this.lan?.close();
    this.lan = null;
    this.netMode = "local";
    this.mySeat = DEFAULT_SEAT;
    this.humanSeats = new Set([DEFAULT_SEAT]);
    this.lanLobbyOpen = false;
    this.lanJoined = false;
    this.newGame();
  }

  /** 호스트: LAN 게임 시작(빈 좌석은 AI). 초기 상태를 전원에게 브로드캐스트. */
  private startLanGame(): void {
    if (this.netMode !== "host") return;
    const seed = (Math.random() * 1e9) | 0;
    this.humanSeats = new Set(this.lanRoster.map((r) => r.seat));
    this.state = createGame(seed, 4, 0);
    this.setLanNames(seed);
    this.phase = "human-action";
    this.aiLog = [];
    this.ballPickColors = [];
    this.ballPickActive = false;
    this.endOverlayOpen = true;
    this.lanLobbyOpen = false;
    this.winRates = new Array(4).fill(0.25);
    this.winRatesStale = true;
    this.activeWinRateRequestId = ++this.winRateRequestSeq;
    this.probSeed = (Math.random() * 1e9) | 0;
    this.broadcastState();
    this.render();
    this.startTurn();
  }

  private setLanNames(seed: number): void {
    const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    const cand = rng.shuffle([...AI_NAME_CANDIDATES]);
    const nameBySeat = new Map(this.lanRoster.map((r) => [r.seat, r.name] as const));
    this.playerNames = [];
    for (let i = 0; i < this.state.numPlayers; i++) {
      this.playerNames[i] = this.humanSeats.has(i)
        ? (nameBySeat.get(i) ?? `P${i + 1}`)
        : (cand.pop() ?? `AI ${i}`);
    }
  }

  private broadcastState(): void {
    if (this.netMode !== "host") return;
    this.lan?.relay({
      k: "state",
      snapshot: serialize(this.state),
      names: this.playerNames,
      humanSeats: [...this.humanSeats],
      aiLog: this.aiLog,
    });
  }

  private handleRelay(fromSeat: number, payload: unknown): void {
    const p = payload as { k?: string; [x: string]: unknown };
    if (!p || typeof p !== "object") return;
    if (this.netMode === "guest" && p.k === "state") this.applyRemoteState(p);
    else if (this.netMode === "host" && p.k === "turn") this.applyGuestTurn(fromSeat, p);
  }

  /** 게스트: 호스트가 보낸 권위 상태로 갱신. */
  private applyRemoteState(p: { [x: string]: unknown }): void {
    this.state = deserialize(p.snapshot as Snapshot);
    if (Array.isArray(p.names)) this.playerNames = p.names as string[];
    if (Array.isArray(p.humanSeats)) this.humanSeats = new Set(p.humanSeats as number[]);
    if (Array.isArray(p.aiLog)) this.aiLog = p.aiLog as string[];
    this.lanLobbyOpen = false;
    if (this.state.ended) {
      this.phase = "ended";
      this.endOverlayOpen = true;
    } else if (this.state.currentPlayer === this.mySeat) {
      this.phase = "human-action";
      this.ballPickActive = false;
      this.ballPickColors = [];
      this.setMsg({ kind: "info", text: "내 차례 — 행동을 선택하세요." });
    } else {
      this.phase = "remote-wait";
      this.setMsg({ kind: "info", text: `${this.playerName(this.state.currentPlayer)} 차례…` });
    }
    this.requestWinProb();
    this.render();
  }

  /** 호스트: 게스트가 보낸 턴을 권위 상태에 적용. */
  private applyGuestTurn(fromSeat: number, p: { [x: string]: unknown }): void {
    if (this.state.ended) return;
    if (this.state.currentPlayer !== fromSeat || !this.humanSeats.has(fromSeat)) return;
    const action = p.action as MainAction | undefined;
    const evolution = (p.evolution ?? null) as Evolution | null;
    if (!action) return;
    try {
      applyMainAction(this.state, action);
      if (evolution) applyEvolution(this.state, evolution);
    } catch {
      this.broadcastState(); // 비합법 → 현재 권위 상태로 되돌림
      return;
    }
    this.pushAiLog(this.describeAction(fromSeat, action));
    this.advance();
  }

  // ── Helpers ──

  private playerName(i: number): string {
    return this.playerNames[i] ?? (i === this.mySeat ? "나" : `AI ${i}`);
  }

  private assignPlayerNames(seed: number): void {
    const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    const candidates = rng.shuffle([...AI_NAME_CANDIDATES]);
    this.playerNames = [];
    for (let i = 0; i < this.state.numPlayers; i++) {
      this.playerNames[i] = i === this.mySeat ? "나" : candidates.pop() ?? `AI ${i}`;
    }
  }

  private isHumanTurn(): boolean {
    return this.state.currentPlayer === this.mySeat;
  }

  private setMsg(m: UIMsg): void {
    this.msg = m;
  }

  // ── Turn flow ──

  private isAiSeat(seat: number): boolean {
    return !this.humanSeats.has(seat);
  }

  private startTurn(): void {
    if (this.state.ended) { this.phase = "ended"; this.render(); return; }
    const cur = this.state.currentPlayer;
    if (cur === this.mySeat) {
      // 내 차례
      this.phase = "human-action";
      this.ballPickColors = [];
      this.ballPickActive = false;
      this.setMsg({ kind: "info", text: "내 차례 — 행동을 선택하세요." });
      this.render();
      return;
    }
    // 남의 차례
    if (this.netMode === "guest") {
      // 게스트는 호스트의 상태 브로드캐스트만 기다린다(로컬 진행 없음).
      this.phase = "remote-wait";
      this.setMsg({ kind: "info", text: `${this.playerName(cur)} 차례…` });
      this.render();
      return;
    }
    if (this.isAiSeat(cur)) {
      // AI 좌석: (로컬/호스트가) AI 실행
      this.phase = "ai";
      this.setMsg({ kind: "info", text: `${this.playerName(cur)} 차례…` });
      this.render();
      setTimeout(() => this.aiMove(), AI_DELAY_MS);
    } else {
      // 호스트인데 원격 사람 좌석 차례 → 그 게스트의 행동을 기다린다
      this.phase = "remote-wait";
      this.setMsg({ kind: "info", text: `${this.playerName(cur)} 차례…` });
      this.render();
    }
  }

  private aiMove(): void {
    if (this.state.ended) { this.startTurn(); return; }
    const pick = chooseStrongTurn(this.state, this.aiRng);
    if (!pick) { this.advance(); return; }
    const aiIdx = this.state.currentPlayer;
    const desc = this.describeAction(aiIdx, pick.action);
    const fusesBefore = this.state.players[aiIdx]!.fusions.slice();
    applyMainAction(this.state, pick.action);
    if (pick.evolution) {
      // 상대(AI) 변신은 화면 토스트 없이 로그로만 처리
      applyEvolution(this.state, pick.evolution);
    }
    this.pushAiLog(desc);
    for (const r of this.state.players[aiIdx]!.fusions) {
      if (fusesBefore.includes(r)) continue;
      const f = FUSION_BY_ROMANIZED[r];
      if (f) this.pushAiLog(`${this.playerName(aiIdx)}: ${f.name} 퓨전 획득!`);
    }
    this.advance();
  }

  private advance(): void {
    finishTurn(this.state);
    if (this.netMode === "host") this.broadcastState();
    this.requestWinProb();
    this.startTurn();
  }

  // ── AI log ──

  private pushAiLog(desc: string): void {
    this.aiLog.push(desc);
    if (this.aiLog.length > 5) this.aiLog.shift();
  }

  private describeAction(playerIdx: number, action: MainAction): string {
    switch (action.type) {
      case "acquire": {
        const card = cardOf(action.cardId);
        return `${this.playerName(playerIdx)}: ${card.name} 획득`;
      }
      case "reserve": {
        const card = cardOf(action.cardId);
        return `${this.playerName(playerIdx)}: ${card.name} 보관`;
      }
      case "take3":
        return `${this.playerName(playerIdx)}: ${action.colors.map((c) => COLOR_DISPLAY[c]).join("+")} 획득`;
      case "take2":
        return `${this.playerName(playerIdx)}: ${COLOR_DISPLAY[action.color]} 2개 획득`;
      case "reserveBlind":
        return `${this.playerName(playerIdx)}: ${action.tier}단계 더미 보관`;
    }
  }

  // ── Human action handling ──

  private humanPlay(action: MainAction): void {
    if (this.phase !== "human-action") return;

    if (action.type === "acquire" && this.needsMasterBallSpendConfirm(action)) {
      if (!window.confirm(MASTER_BALL_SPEND_CONFIRM)) {
        this.setMsg({ kind: "info", text: "카드 구입을 취소했습니다." });
        this.render();
        return;
      }
    }

    // Show toast for special actions before applying
    if (action.type === "acquire") {
      const card = cardOf(action.cardId);
      if (isNoble(card.tier)) {
        showCaptureToast(card.name);
      }
    }

    const fusesBefore = this.state.players[this.mySeat]!.fusions.slice();
    applyMainAction(this.state, action);
    this.notifyHumanFusion(fusesBefore);
    this.ballPickActive = false;
    this.ballPickColors = [];
    this.pendingAction = action;
    const evos = legalEvolutions(this.state);
    if (evos.length > 0) {
      this.phase = "human-evolve";
      this.setMsg({ kind: "ok", text: "변신 가능! 변신하거나 건너뛸 수 있습니다." });
      showEvolveAvailableToast();
      this.render();
    } else {
      this.finishHumanTurn(action, null);
    }
  }

  private humanEvolve(evo: Evolution | null): void {
    if (this.phase !== "human-evolve") return;
    if (evo) {
      const fusesBefore = this.state.players[this.mySeat]!.fusions.slice();
      applyEvolution(this.state, evo);
      const targetCard = cardOf(evo.targetId);
      showEvolutionToast(targetCard.name);
      this.notifyHumanFusion(fusesBefore);
    }
    this.finishHumanTurn(this.pendingAction, evo);
  }

  /** 내 턴 마무리. 로컬/호스트는 즉시 진행, 게스트는 호스트에 의도 전송 후 대기. */
  private finishHumanTurn(action: MainAction | null, evolution: Evolution | null): void {
    this.pendingAction = null;
    if (this.netMode === "guest") {
      // 메인 액션·변신은 이미 낙관적으로 로컬 상태에 적용됨. 호스트가 권위 상태를 재계산·브로드캐스트한다.
      if (action) this.lan?.relay({ k: "turn", action, evolution });
      this.phase = "remote-wait";
      this.setMsg({ kind: "info", text: "내 턴 전송 — 다른 플레이어를 기다리는 중…" });
      this.render();
    } else {
      this.advance();
    }
  }

  /** 이번 액션으로 새로 획득한 퓨전을 토스트로 알린다. */
  private notifyHumanFusion(before: string[]): void {
    const me = this.state.players[this.mySeat]!;
    for (const r of me.fusions) {
      if (before.includes(r)) continue;
      const f = FUSION_BY_ROMANIZED[r];
      if (f) {
        showCaptureToast(`${f.name} 퓨전!`);
        this.setMsg({ kind: "ok", text: `퓨전 성공! ${f.name}을(를) 획득했습니다 (+${f.points}점).` });
      }
    }
  }

  // ── Ball pick flow ──

  private startBallPick(): void {
    this.ballPickActive = true;
    this.ballPickColors = [];
    this.render();
  }

  /** 구슬 칩 클릭 순환: 0 → 1개 → (2개 가능하면 2개, 아니면 취소) → 2개에서 재클릭 시 취소. */
  private toggleBallColor(c: Color): void {
    if (!this.ballPickActive) return;
    const count = this.ballPickColors.filter((x) => x === c).length;
    const pairMode = this.ballPickColors.length === 2 && new Set(this.ballPickColors).size === 1;
    const canTake2 = legalMainActions(this.state).some((a) => a.type === "take2" && a.color === c);

    if (pairMode) {
      // 이미 같은 색 2개 상태: 같은 색 클릭=취소 / 다른 색 클릭=그 색 1개로 새로 시작
      this.ballPickColors = count === 2 ? [] : [c];
    } else if (count === 0) {
      // 새 색 추가 (take3 최대 3색)
      if (this.ballPickColors.length < 3) this.ballPickColors.push(c);
    } else {
      // 이미 1개 잡은 색을 재클릭: 그 색만 있고 2개 가능하면 2개로, 아니면 1개 취소
      if (this.ballPickColors.length === 1 && canTake2) {
        this.ballPickColors = [c, c];
      } else {
        this.ballPickColors.splice(this.ballPickColors.indexOf(c), 1);
      }
    }
    this.render();
  }

  private confirmBallPick(): void {
    if (this.ballPickColors.length === 0) return;
    const legal = legalMainActions(this.state);
    const isPair = this.ballPickColors.length === 2 && new Set(this.ballPickColors).size === 1;
    const match = isPair
      ? legal.find((a) => a.type === "take2" && a.color === this.ballPickColors[0])
      : (() => {
          const picked = [...this.ballPickColors].sort();
          return legal.find((a) => {
            if (a.type !== "take3") return false;
            const ac = [...a.colors].sort();
            return ac.length === picked.length && ac.every((v, i) => v === picked[i]);
          });
        })();
    if (match) {
      this.humanPlay(match);
    } else {
      this.setMsg({ kind: "bad", text: "해당 구슬 조합을 가져올 수 없습니다." });
      this.render();
    }
  }

  // ── Card click ──

  private onCardClick(id: string): void {
    const acts = legalMainActions(this.state).filter((a) => a.type === "acquire" && a.cardId === id);
    const act = acts[0];
    if (act) { this.humanPlay(act); return; }
    const card = cardOf(id);
    const me = this.state.players[this.mySeat]!;
    this.setMsg({ kind: "bad", text: this.whyNotAfford(me, card) });
    this.render();
  }

  private onReserveClick(id: string): void {
    const acts = legalMainActions(this.state).filter((a) => a.type === "reserve" && a.cardId === id);
    const act = acts[0];
    if (act) { this.humanPlay(act); return; }
    const card = cardOf(id);
    const me = this.state.players[this.mySeat]!;
    this.setMsg({ kind: "bad", text: this.whyNotReserve(me, card) });
    this.render();
  }

  private onReservedCardClick(id: string): void {
    const acts = legalMainActions(this.state).filter((a) => a.type === "acquire" && a.cardId === id);
    const act = acts[0];
    if (act) { this.humanPlay(act); return; }
    const card = cardOf(id);
    const me = this.state.players[this.mySeat]!;
    this.setMsg({ kind: "bad", text: this.whyNotAfford(me, card) });
    this.render();
  }

  private whyNotAfford(p: PlayerState, card: CardDef): string {
    if (isNoble(card.tier) && p.balls.gold < 1) return "획득 불가: 희귀/전설 카드는 궁극의 드래곤볼 1개가 필요합니다.";
    const cost = discountedCost(card, p.bonus);
    const parts: string[] = [];
    for (const c of COLORS) {
      const need = cost[c] ?? 0;
      if (need > p.balls[c]) parts.push(`${COLOR_DISPLAY[c]} ${need - p.balls[c]}개`);
    }
    return parts.length ? `획득 불가: ${parts.join(", ")} 부족` : "획득 불가";
  }

  private whyNotReserve(p: PlayerState, card: CardDef): string {
    if (isNoble(card.tier)) return "보관 불가: 희귀/전설/환상 카드는 보관할 수 없습니다.";
    if (p.reserved.length >= MAX_RESERVED) return `보관 불가: 보관 한도(${MAX_RESERVED}장) 초과`;
    return "보관 불가";
  }

  private cardBonusColor(card: CardDef): Color | null {
    return COLORS.find((c) => (card.bonus[c] ?? 0) > 0) ?? null;
  }

  /** 해당 퓨전을 이미 획득한 플레이어 인덱스(없으면 null). */
  private fusionOwner(romanized: string): number | null {
    for (let i = 0; i < this.state.numPlayers; i++) {
      if (this.state.players[i]!.fusions.includes(romanized)) return i;
    }
    return null;
  }

  /** 사람이 해당 퓨전 레시피(scored 카드 조합)를 충족하는지. */
  private humanHasFusionRecipe(romanized: string): boolean {
    const f = FUSION_BY_ROMANIZED[romanized];
    if (!f) return false;
    const me = this.state.players[this.mySeat]!;
    return f.recipe.every((req) =>
      me.scored.some((id) => {
        const c = cardOf(id);
        return c.romanized === req.romanized && c.tier === req.tier;
      }),
    );
  }

  /** 플레이어가 획득한 퓨전 썸네일 행(없으면 null). */
  private renderPlayerFusions(p: PlayerState, size: number): HTMLElement | null {
    if (p.fusions.length === 0) return null;
    const wrap = el("div", { class: "fusion-owned-row" });
    for (const r of p.fusions) {
      const f = FUSION_BY_ROMANIZED[r];
      if (!f) continue;
      wrap.append(el("div", { class: "fusion-owned", title: `${f.name} 퓨전 (+${f.points}점)` }, [
        el("img", { src: fusionImg(f.romanized), alt: f.name, width: size, height: size }),
        el("span", { class: "fusion-owned-pts" }, [`+${f.points}`]),
      ]));
    }
    return wrap;
  }

  private colorTotal(p: PlayerState, c: Color): number {
    return p.bonus[c] + p.balls[c];
  }

  private colorTotalTitle(p: PlayerState, c: Color): string {
    return `${COLOR_DISPLAY[c]} 총점수 ${this.colorTotal(p, c)} (보너스 ${p.bonus[c]} + 보유 구슬 ${p.balls[c]})`;
  }

  private needsMasterBallSpendConfirm(action: MainAction): boolean {
    if (action.type !== "acquire" || isNoble(cardOf(action.cardId).tier)) return false;
    return action.pay.gold > 0;
  }

  private renderScoredStacks(cardIds: string[], size: number, label: boolean): HTMLElement {
    const wrap = el("div", { class: "scored-stacks" });
    const byColor = new Map<Color, string[]>();
    for (const c of COLORS) byColor.set(c, []);

    for (const id of cardIds) {
      const card = cardOf(id);
      const color = this.cardBonusColor(card);
      if (color) byColor.get(color)!.push(id);
    }

    for (const c of COLORS) {
      const ids = byColor.get(c)!;
      if (ids.length === 0) continue;
      const stack = el("div", { class: `card-color-stack stack-${c}` });
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        const card = cardOf(id);
        const mc = makeMiniCard(card, { size, label });
        mc.style.zIndex = String(i + 1);
        mc.addEventListener("mouseenter", () => showTooltip(mc, card));
        mc.addEventListener("mouseleave", () => hideTooltip());
        stack.append(mc);
      }
      wrap.append(stack);
    }

    return wrap;
  }

  // ═══════════════════════════════════════════════════════════════════
  //   RENDER — Left/Right Dashboard Layout
  // ═══════════════════════════════════════════════════════════════════

  render(): void {
    this.root.replaceChildren(
      this.renderGameLayout(),
    );
    if (this.state.ended && this.endOverlayOpen && !this.lanLobbyOpen) {
      this.root.append(this.renderEndOverlay());
    }
    if (this.lanLobbyOpen) {
      this.root.append(this.renderLanOverlay());
    }
  }

  private renderLanOverlay(): HTMLElement {
    const children: (HTMLElement | string)[] = [
      el("h2", { class: "card-title text-xl justify-center text-info mb-2" }, [
        el("i", { class: "fa-solid fa-network-wired mr-2" }),
        "LAN 대전 대기실",
      ]),
    ];
    // 실시간 대기자 목록 — 4개 좌석 슬롯을 카드로 명확히 구분
    children.push(el("div", { class: "text-xs opacity-60 mt-1 mb-1" }, [`대기 중 (${this.lanRoster.length}/4)`]));
    const seatEls: HTMLElement[] = [];
    for (let s = 0; s < 4; s++) {
      const entry = this.lanRoster.find((r) => r.seat === s);
      if (entry) {
        seatEls.push(el("div", { class: "lan-seat" }, [
          el("span", { class: "lan-seat-no" }, [String(s + 1)]),
          el("i", { class: "fa-solid fa-user lan-seat-ic text-info" }),
          el("span", { class: "lan-seat-name" }, [entry.name]),
          s === 0 ? el("span", { class: "badge badge-xs badge-warning" }, ["호스트"]) : "",
          this.lanJoined && s === this.mySeat ? el("span", { class: "badge badge-xs badge-info" }, ["나"]) : "",
        ]));
      } else {
        seatEls.push(el("div", { class: "lan-seat lan-seat--empty" }, [
          el("span", { class: "lan-seat-no" }, [String(s + 1)]),
          el("i", { class: "fa-solid fa-robot lan-seat-ic" }),
          el("span", { class: "lan-seat-name" }, ["빈 자리 · AI"]),
        ]));
      }
    }
    children.push(el("div", { class: "lan-seats" }, seatEls));
    if (this.lanError) children.push(el("div", { class: "alert alert-error py-2 px-3 text-sm my-2" }, [this.lanError]));

    if (!this.lanJoined) {
      // 착석 전: 닉네임 입력 후 입장
      const nameInput = el("input", {
        class: "input input-bordered input-sm w-full",
        type: "text",
        maxLength: 20,
        placeholder: "닉네임 입력",
        value: this.lanName,
        oninput: (e: Event) => { this.lanName = (e.target as HTMLInputElement).value; },
        onkeydown: (e: KeyboardEvent) => { if (e.key === "Enter") this.joinLan(); },
      });
      children.push(el("div", { class: "flex gap-2 mt-2" }, [
        nameInput,
        el("button", {
          class: "btn btn-info btn-sm",
          onclick: () => this.joinLan(),
        }, [el("i", { class: "fa-solid fa-right-to-bracket mr-1" }), "입장"]),
      ]));
      if (this.lanRoster.length >= 4) children.push(el("div", { class: "text-xs text-error mt-1" }, ["방이 가득 찼습니다."]));
    } else if (this.netMode === "host") {
      children.push(el("div", { class: "text-xs opacity-70 my-2" }, ["빈 자리는 AI로 채워집니다. 모두 입장한 뒤 시작하세요."]));
      children.push(el("button", {
        class: "btn btn-warning w-full",
        onclick: () => this.startLanGame(),
      }, [el("i", { class: "fa-solid fa-play mr-1" }), "게임 시작"]));
    } else {
      children.push(el("div", { class: "opacity-70 text-sm my-2" }, ["호스트가 게임을 시작하기를 기다리는 중…"]));
    }
    children.push(el("div", { class: "card-actions justify-center mt-3 gap-2" }, [
      el("button", { class: "btn btn-ghost btn-sm", onclick: () => { this.lanLobbyOpen = false; this.render(); } }, ["숨기기"]),
      el("button", { class: "btn btn-ghost btn-sm text-error", onclick: () => this.leaveLan() }, ["나가기"]),
    ]));

    return el("div", { class: "endgame-overlay" }, [
      el("div", { class: "card bg-base-200 shadow-2xl p-6 max-w-md w-80" }, children),
    ]);
  }

  private renderGameLayout(): HTMLElement {
    return el("div", { class: "game-layout" }, [
      this.renderLeftPanel(),
      this.renderRightPanel(),
    ]);
  }

  // ── Left panel: header + card field ──

  private renderLeftPanel(): HTMLElement {
    const left = el("div", { class: "game-left" });
    left.append(this.renderHeader());
    left.append(this.renderBoard());
    return left;
  }

  private renderHeader(): HTMLElement {
    const turnText = this.state.ended ? "게임 종료" : `${this.playerName(this.state.currentPlayer)} 차례`;

    const logEl = aiLogEl();
    for (const entry of this.aiLog) {
      logEl.append(el("div", {}, [entry]));
    }

    const newGameBtn = el("button", {
      class: "btn btn-sm btn-warning btn-outline",
      onclick: () => this.promptNewGame(),
    }, [
      el("i", { class: "fa-solid fa-rotate-right mr-1" }),
      "새 게임",
    ]);

    const rankBtn = this.state.ended
      ? el("button", {
          class: "btn btn-sm btn-ghost",
          onclick: () => { this.endOverlayOpen = true; this.render(); },
        }, [
          el("i", { class: "fa-solid fa-ranking-star mr-1" }),
          "순위 보기",
        ])
      : "";

    const lanBtn = this.netMode === "local"
      ? el("button", {
          class: "btn btn-sm btn-info btn-outline",
          onclick: () => this.openLanLobby(),
        }, [el("i", { class: "fa-solid fa-network-wired mr-1" }), "LAN 대전"])
      : el("button", {
          class: "btn btn-sm btn-info btn-outline",
          onclick: () => { this.lanLobbyOpen = true; this.render(); },
        }, [
          el("i", { class: "fa-solid fa-network-wired mr-1" }),
          this.netMode === "host" ? "대기실(호스트)" : "대기실",
        ]);

    const children: (HTMLElement | string)[] = [
      el("span", { class: "title" }, [
        el("i", { class: "fa-solid fa-gamepad mr-1" }),
        "드래곤볼 스플렌더",
      ]),
      el("span", { class: "badge badge-ghost" }, [
        el("i", { class: "fa-solid fa-circle-play mr-1" }),
        turnText,
      ]),
      logEl,
      rankBtn,
      lanBtn,
    ];
    // 게스트는 새 게임을 시작할 수 없음(호스트 권한)
    if (this.netMode !== "guest") children.push(newGameBtn);

    return el("div", { class: "game-header" }, children);
  }

  // ── Board (card field) ──

  private renderBoard(): HTMLElement {
    const board = el("div", { class: "flex flex-col gap-2 flex-1" });

    // Tier rows
    const rows: [string, Tier][] = [
      ["1단계", 1], ["2단계", 2], ["3단계", 3],
    ];
    for (const [label, tier] of rows) {
      const rowWrap = el("div", { class: "tier-row" });
      rowWrap.append(el("span", { class: "tier-label" }, [label]));

      const cards = el("div", { class: "tier-cards" });
      for (const id of this.state.board[tier]) cards.append(this.boardCardEl(id));
      rowWrap.append(cards);

      // Blind reserve button
      if (this.isHumanTurn() && this.phase === "human-action") {
        const blinds = legalMainActions(this.state).filter(
          (a): a is Extract<MainAction, { type: "reserveBlind" }> => a.type === "reserveBlind" && a.tier === tier,
        );
        if (blinds.length > 0) {
          rowWrap.append(el("button", {
            class: "blind-reserve-btn",
            onclick: () => this.humanPlay(blinds[0]!),
          }, [
            el("i", { class: "fa-solid fa-eye-slash mr-1" }),
            "더미",
          ]));
        }
      }
      board.append(rowWrap);
    }

    // Noble row
    const nobleRow = el("div", { class: "tier-row" });
    nobleRow.append(el("span", { class: "tier-label" }, ["전설"]));
    const nobleCards = el("div", { class: "tier-cards" });
    for (const id of this.state.board.rare) nobleCards.append(this.boardCardEl(id));
    for (const id of this.state.board.legendary) nobleCards.append(this.boardCardEl(id));
    nobleRow.append(nobleCards);
    board.append(nobleRow);

    // Fusion row — 조건 충족 시 자동 획득(턴/진화 미소모, 단 한 장)
    const fusionRow = el("div", { class: "tier-row" });
    fusionRow.append(el("span", { class: "tier-label" }, ["퓨전"]));
    const fusionCards = el("div", { class: "tier-cards" });
    for (const f of FUSIONS) {
      const owner = this.fusionOwner(f.romanized);
      const humanEligible = owner === null && this.humanHasFusionRecipe(f.romanized);

      const recipe = el("div", { class: "fusion-recipe", title: f.recipe.map((r) => r.label).join(" + ") });
      f.recipe.forEach((r, i) => {
        if (i > 0) recipe.append(el("span", { class: "fusion-plus" }, ["+"]));
        recipe.append(el("div", { class: "fusion-req" }, [
          el("img", { src: cardImg(r.tier, r.romanized), alt: r.label }),
          el("span", { class: "fusion-req-lv" }, [`${r.tier}단계`]),
        ]));
      });

      const cardCls = ["fusion-card"];
      if (owner !== null) cardCls.push("claimed");
      else if (humanEligible) cardCls.push("eligible");
      else cardCls.push("dim"); // 조건 미충족: 구매 가능처럼 보이지 않게 흐리게
      const cardEl = el("div", {
        class: cardCls.join(" "),
        title: `${f.name} (퓨전 — ${f.points}점 / ${f.recipe.map((r) => r.label).join(" + ")})`,
      }, [
        // 일반 카드와 동일한 헤더: 점수(좌, pc-pts 동일). 레시피는 아래 전용 띠에 크게.
        el("div", { class: "pc-head fusion-head" }, [
          el("div", { class: "pc-pts" }, [String(f.points)]),
        ]),
        recipe,
        el("div", { class: "fusion-art" }, [
          el("img", { src: fusionImg(f.romanized), alt: f.name, class: "fusion-img" }),
        ]),
        el("div", { class: "fusion-name" }, [f.name]),
      ]);
      if (owner !== null) {
        cardEl.append(el("div", { class: "fusion-claimed-badge" }, [
          el("i", { class: "fa-solid fa-check mr-1" }),
          `${this.playerName(owner)} 획득`,
        ]));
      }
      fusionCards.append(cardEl);
    }
    fusionRow.append(fusionCards);
    board.append(fusionRow);

    return board;
  }

  private renderSupplyBar(): HTMLElement {
    const wrap = el("div", { class: "supply-bar" });
    const balls = el("div", { class: "supply-balls" });
    const order: Color[] = ["red", "blue", "black", "pink", "yellow"];
    const myTurn = this.isHumanTurn() && this.phase === "human-action";

    for (const c of order) {
      const supply = this.state.supply[c];
      const pickedCount = this.ballPickColors.filter((x) => x === c).length;
      const cls = ["supply-item"];
      if (pickedCount > 0) cls.push("picked");
      if (myTurn && supply > 0) cls.push("pickable");

      const ballEl = el("div", { class: cls.join(" ") }, [
        ballIcon(c, 30),
        el("span", { class: "font-bold" }, [String(supply)]),
        pickedCount > 0 ? el("span", { class: "pick-count" }, [`×${pickedCount}`]) : "",
      ]);

      if (myTurn && supply > 0) {
        ballEl.addEventListener("click", () => {
          if (!this.ballPickActive) this.startBallPick();
          this.toggleBallColor(c);
        });
      }

      balls.append(ballEl);
    }

    // Gold (not pickable via take3)
    const goldSupply = this.state.supply.gold;
    const goldEl = el("div", { class: "supply-item" }, [
      ballIcon("gold", 30),
      el("span", { class: "font-bold" }, [String(goldSupply)]),
    ]);
    balls.append(goldEl);

    wrap.append(balls);

    // 확정(✅) 버튼 — 선택한 구슬을 가져온다. 구슬 아이템과 동일 크기.
    if (myTurn) {
      const canConfirm = this.ballPickActive && this.ballPickColors.length > 0;
      const confirmCls = ["supply-item", "supply-confirm"];
      if (canConfirm) confirmCls.push("ready");
      else confirmCls.push("idle");
      const confirmEl = el("div", {
        class: confirmCls.join(" "),
        title: "선택한 구슬 가져오기",
      }, [
        el("i", { class: "fa-solid fa-check" }),
      ]);
      confirmEl.addEventListener("click", () => {
        if (this.ballPickActive && this.ballPickColors.length > 0) {
          this.confirmBallPick();
        } else {
          this.setMsg({ kind: "bad", text: "먼저 가져올 구슬을 선택하세요." });
          this.render();
        }
      });
      wrap.append(confirmEl);
    }

    return wrap;
  }

  private boardCardEl(id: string): HTMLElement {
    const card = cardOf(id);
    const myTurn = this.isHumanTurn() && this.phase === "human-action";
    const affordable = canAfford(this.state.players[this.mySeat]!, card);
    const isStage = card.tier === 1 || card.tier === 2 || card.tier === 3;
    const me = this.state.players[this.mySeat]!;
    const reserveOk = isStage && me.reserved.length < MAX_RESERVED;

    const clickable = myTurn;
    const dim = myTurn && !affordable;
    const showReserveBtn = myTurn && isStage && reserveOk;

    const node = makeCardEl(card, {
      clickable,
      affordable: myTurn && affordable,
      dim,
      reserveBtn: showReserveBtn,
      onclick: clickable ? () => this.onCardClick(id) : undefined,
    });

    node.addEventListener("mouseenter", () => showTooltip(node, card));
    node.addEventListener("mouseleave", () => hideTooltip());

    if (showReserveBtn) {
      const btn = node.querySelector(".reserve-btn");
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onReserveClick(id);
        });
      }
    }

    return node;
  }

  // ── Right panel: player status + token bank ──

  private renderRightPanel(): HTMLElement {
    const right = el("div", { class: "game-right" });

    // 구슬 칩(공급) — 우측 "나" 플레이 영역 최상단(가로 스크롤)
    const supply = this.renderSupplyBar();
    supply.classList.add("supply-bar--top");
    right.append(supply);

    // Current player info (Me)
    right.append(this.renderMePanel());

    // AI panels
    for (let i = 0; i < this.state.numPlayers; i++) {
      if (i !== this.mySeat) right.append(this.renderAiPanel(i));
    }

    // Action / message area
    right.append(this.renderActionPanel());

    return right;
  }

  private renderMePanel(): HTMLElement {
    const p = this.state.players[this.mySeat]!;
    const cls = ["player-panel"];
    if (this.state.currentPlayer === this.mySeat && !this.state.ended) cls.push("current-turn");

    const panel = el("div", { class: cls.join(" ") });

    // Name + points
    panel.append(el("div", { class: "flex items-center justify-between" }, [
      el("div", { class: "flex items-center gap-2" }, [
        el("div", { class: "avatar placeholder" }, [
          el("div", { class: "bg-warning text-warning-content w-8 rounded-full" }, [
            el("i", { class: "fa-solid fa-user text-sm" }),
          ]),
        ]),
        el("span", { class: "panel-name" }, ["나"]),
      ]),
      el("div", { class: "flex items-center gap-2" }, [
        el("span", { class: "panel-pts text-lg" }, [`${playerPoints(p)}점`]),
        el("span", { class: "badge badge-sm badge-ghost" }, [`변신 ${p.evolutions}`]),
      ]),
    ]));

    // Balls
    const ballsSection = el("div", { class: "panel-section" });
    ballsSection.append(el("div", { class: "text-[9px] opacity-50 mb-1" }, [
      el("i", { class: "fa-solid fa-coins mr-1" }),
      "구슬",
    ]));
    const ballsRow = el("div", { class: "flex flex-wrap gap-1" });
    for (const c of COLORS) {
      if (p.balls[c] > 0) ballsRow.append(ballChip(c, p.balls[c]));
    }
    if (p.balls.gold > 0) ballsRow.append(ballChip("gold", p.balls.gold));
    if (handBallCount(p) === 0) ballsRow.append(el("span", { class: "text-xs opacity-30" }, ["없음"]));
    ballsSection.append(ballsRow);
    panel.append(ballsSection);

    // Color totals: bonus + held colored balls
    const totalSection = el("div", { class: "panel-section" });
    totalSection.append(el("div", { class: "text-[9px] opacity-50 mb-1" }, [
      el("i", { class: "fa-solid fa-shield-halved mr-1" }),
      "총점수",
    ]));
    const totalRow = el("div", { class: "flex flex-wrap gap-1" });
    for (const c of COLORS) {
      const total = this.colorTotal(p, c);
      if (total > 0) totalRow.append(colorCountBadge(c, total, this.colorTotalTitle(p, c)));
    }
    const hasTotal = COLORS.some((c) => this.colorTotal(p, c) > 0);
    if (!hasTotal) totalRow.append(el("span", { class: "text-xs opacity-30" }, ["없음"]));
    totalSection.append(totalRow);
    panel.append(totalSection);

    // Scored cards grouped by bonus color
    const scoredSection = el("div", { class: "panel-section" });
    scoredSection.append(el("div", { class: "text-[9px] opacity-50 mb-1" }, [
      el("i", { class: "fa-solid fa-trophy mr-1" }),
      `획득 (${p.scored.length})`,
    ]));
    scoredSection.append(
      p.scored.length > 0
        ? this.renderScoredStacks(p.scored, 48, true)
        : el("span", { class: "text-xs opacity-30" }, ["없음"]),
    );
    const meFusions = this.renderPlayerFusions(p, 40);
    if (meFusions) scoredSection.append(meFusions);
    panel.append(scoredSection);

    // Reserved cards
    const reservedSection = el("div", { class: "panel-section" });
    reservedSection.append(el("div", { class: "text-[9px] opacity-50 mb-1" }, [
      el("i", { class: "fa-solid fa-bookmark mr-1" }),
      `보관 (${p.reserved.length}/${MAX_RESERVED})`,
    ]));
    const reservedScroll = el("div", { class: "card-scroll" });
    for (const id of p.reserved) {
      const card = cardOf(id);
      const affordable = canAfford(p, card);
      const myTurn = this.isHumanTurn() && this.phase === "human-action";
      const mc = makeMiniCard(card, {
        size: 48,
        label: true,
        affordable: myTurn && affordable,
        onclick: myTurn ? () => this.onReservedCardClick(id) : undefined,
      });
      mc.addEventListener("mouseenter", () => showTooltip(mc, card));
      mc.addEventListener("mouseleave", () => hideTooltip());
      reservedScroll.append(mc);
    }
    if (p.reserved.length === 0) reservedScroll.append(el("span", { class: "text-xs opacity-30" }, ["없음"]));
    reservedSection.append(reservedScroll);
    panel.append(reservedSection);

    return panel;
  }

  private renderAiPanel(index: number): HTMLElement {
    const p = this.state.players[index]!;
    const cls = ["ai-panel"];
    if (index === this.state.currentPlayer && !this.state.ended) cls.push("current-turn");

    const panel = el("div", { class: cls.join(" ") });

    // Name + points. LAN 사람 상대는 사람(🧑) 표시로 AI(🤖)와 구분.
    const isHumanOpp = this.humanSeats.has(index);
    panel.append(el("div", { class: "flex items-center justify-between" }, [
      el("div", { class: "flex items-center gap-2" }, [
        el("div", { class: "avatar placeholder" }, [
          el("div", {
            class: `${isHumanOpp ? "bg-info text-info-content" : "bg-neutral text-neutral-content"} w-6 rounded-full`,
          }, [
            el("i", { class: `fa-solid ${isHumanOpp ? "fa-user" : "fa-robot"} text-xs` }),
          ]),
        ]),
        el("span", { class: "ai-name" }, [this.playerName(index)]),
        isHumanOpp
          ? el("span", { class: "badge badge-xs badge-info" }, ["🧑 사람"])
          : el("span", { class: "badge badge-xs badge-ghost" }, ["🤖 AI"]),
      ]),
      el("div", { class: "flex items-center gap-2" }, [
        el("span", { class: "ai-pts" }, [`${playerPoints(p)}점`]),
        el("span", { class: "badge badge-xs badge-ghost" }, [`변신 ${p.evolutions}`]),
      ]),
    ]));

    // Balls + color totals compact
    const row = el("div", { class: "ai-row" });
    for (const c of COLORS) {
      if (p.balls[c] > 0) row.append(ballChip(c, p.balls[c]));
    }
    if (p.balls.gold > 0) row.append(ballChip("gold", p.balls.gold));
    panel.append(row);

    const totalRow = el("div", { class: "ai-row" });
    const hasTotal = COLORS.some((c) => this.colorTotal(p, c) > 0);
    if (hasTotal) totalRow.append(el("span", { class: "ai-row-label" }, ["총점수"]));
    for (const c of COLORS) {
      const total = this.colorTotal(p, c);
      if (total > 0) totalRow.append(colorCountBadge(c, total, this.colorTotalTitle(p, c)));
    }
    if (hasTotal) panel.append(totalRow);

    // Scored cards grouped by bonus color
    if (p.scored.length > 0) {
      panel.append(this.renderScoredStacks(p.scored, 36, false));
    }
    const aiFusions = this.renderPlayerFusions(p, 32);
    if (aiFusions) panel.append(aiFusions);

    // Reserved cards are public in this simulator so the user can track AI plans.
    if (p.reserved.length > 0) {
      const reservedRow = el("div", { class: "ai-card-row ai-reserved-row" }, [
        el("span", { class: "ai-row-label" }, [`보관 ${p.reserved.length}/${MAX_RESERVED}`]),
      ]);
      for (const id of p.reserved) {
        const card = cardOf(id);
        const mc = makeMiniCard(card, { size: 36 });
        mc.addEventListener("mouseenter", () => showTooltip(mc, card));
        mc.addEventListener("mouseleave", () => hideTooltip());
        reservedRow.append(mc);
      }
      panel.append(reservedRow);
    }

    return panel;
  }

  private renderActionPanel(): HTMLElement {
    const panel = el("div", { class: "player-panel" });

    // Message
    if (this.msg.text) {
      const alertCls = this.msg.kind === "ok" ? "alert-success" :
        this.msg.kind === "bad" ? "alert-error" : "alert-info";
      panel.append(el("div", { class: `alert ${alertCls} py-2 px-3 text-sm` }, [
        el("span", {}, [this.msg.text]),
      ]));
    }

    // Evolve phase
    if (this.phase === "human-evolve") {
      const evos = legalEvolutions(this.state);
      if (evos.length > 0) {
        const evoWrap = el("div", { class: "flex flex-col gap-1" });
        evoWrap.append(el("div", { class: "text-xs opacity-60" }, [
          el("i", { class: "fa-solid fa-wand-magic-sparkles mr-1" }),
          "변신 가능!",
        ]));
        for (const evo of evos) {
          const s = cardOf(evo.sourceId);
          const t = cardOf(evo.targetId);
          evoWrap.append(el("button", {
            class: "btn btn-sm btn-warning",
            onclick: () => this.humanEvolve(evo),
          }, [
            el("i", { class: "fa-solid fa-wand-magic-sparkles mr-1" }),
            `${s.name} → ${t.name} (+${t.points - s.points}점)`,
          ]));
        }
        evoWrap.append(el("button", {
          class: "btn btn-sm btn-ghost",
          onclick: () => this.humanEvolve(null),
        }, ["건너뛰기"]));
        panel.append(evoWrap);
      }
    }

    // AI turn indicator
    if (!this.isHumanTurn() && this.phase === "ai") {
      panel.append(el("div", { class: "alert alert-info py-2 px-3 text-sm" }, [
        el("span", {}, [
          el("i", { class: "fa-solid fa-spinner fa-spin mr-1" }),
          `${this.playerName(this.state.currentPlayer)} 생각 중입니다…`,
        ]),
      ]));
    }

    return panel;
  }

  // ── End game overlay ──

  private renderEndOverlay(): HTMLElement {
    const ranked = rankPlayers(this.state);
    const winner = winnerId(this.state);
    const rows = ranked.map((pid, idx) => {
      const p = this.state.players[pid]!;
      const cls = idx === 0 ? "text-warning font-bold" : "";
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "4위";
      return el("tr", {}, [
        el("td", { class: cls }, [medal]),
        el("td", { class: cls }, [this.playerName(pid)]),
        el("td", { class: cls }, [`${playerPoints(p)}점`]),
        el("td", { class: cls }, [`${p.evolutions}`]),
        el("td", { class: cls }, [`${p.scored.length}`]),
      ]);
    });
    return el("div", { class: "endgame-overlay" }, [
      el("div", { class: "card bg-base-200 shadow-2xl p-6 max-w-md" }, [
        el("h2", { class: "card-title text-2xl justify-center text-warning mb-4" }, [
          el("i", { class: "fa-solid fa-trophy mr-2" }),
          `${this.playerName(winner)} 승리!`,
        ]),
        el("div", { class: "overflow-x-auto" }, [
          el("table", { class: "table table-sm" }, [
            el("thead", {}, [el("tr", {}, [
              el("th", {}, ["순위"]), el("th", {}, ["플레이어"]), el("th", {}, ["점수"]),
              el("th", {}, ["변신"]), el("th", {}, ["카드"]),
            ])]),
            el("tbody", {}, rows),
          ]),
        ]),
        el("div", { class: "text-center mt-4 mb-1 opacity-80" }, ["새 게임을 시작하시겠습니까?"]),
        el("div", { class: "card-actions justify-center mt-1 gap-2" }, [
          el("button", {
            class: "btn btn-warning",
            onclick: () => this.newGame(),
          }, [
            el("i", { class: "fa-solid fa-rotate-right mr-1" }),
            "예, 새 게임",
          ]),
          el("button", {
            class: "btn btn-ghost",
            onclick: () => { this.endOverlayOpen = false; this.render(); },
          }, [
            el("i", { class: "fa-solid fa-xmark mr-1" }),
            "아니요 (결과 보기)",
          ]),
        ]),
      ]),
    ]);
  }

  // ── Win rates ──

  private requestWinProb(): void {
    if (this.state.ended) return;
    const snap: Snapshot = serialize(this.state);
    const requestId = ++this.winRateRequestSeq;
    this.activeWinRateRequestId = requestId;
    this.winRatesStale = true;
    this.worker.postMessage({ requestId, snapshot: snap, humanIndex: this.mySeat, n: MC_N, seed: this.probSeed++ });
  }

  private renderProbs(): void {
    const probsEl = this.root.querySelector(".prob-bars");
    if (!probsEl) return;
    const neu = this.buildProbsBars();
    probsEl.replaceWith(neu);
  }

  private buildProbsBars(): HTMLElement {
    const probs = el("div", { class: "prob-bars" });
    for (let i = 0; i < this.state.numPlayers; i++) {
      const p = this.state.players[i]!;
      const pct = this.winRatesStale ? null : this.winRates[i];
      const cls = ["prob-item"];
      if (i === this.mySeat) cls.push("me");
      if (i === this.state.currentPlayer && !this.state.ended) cls.push("current");
      probs.append(el("div", { class: cls.join(" "), title: `${this.playerName(i)} ${playerPoints(p)}점` }, [
        el("span", { class: "text-xs opacity-70" }, [this.playerName(i)]),
        el("div", { class: "prob-bar-track" }, [
          el("div", { class: "prob-bar-fill", style: pct != null ? `width:${Math.round(pct * 100)}%` : "width:0%" }),
        ]),
        el("span", { class: "text-xs font-bold" }, [pct != null ? `${Math.round(pct * 100)}%` : "…"]),
      ]));
    }
    return probs;
  }
}
