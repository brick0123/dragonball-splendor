// LAN 대전 클라이언트: 릴레이 서버(server/relay.mjs)와 WebSocket 통신.
// 다중 방 + 방 목록 구독 + 방 생성/참가/관전. 호스트(좌석 0)가 게임 권위를 가진다.

export interface RoomInfo {
  readonly code: string;
  readonly name: string;
  readonly players: number;
  readonly max: number;
  readonly status: string; // "waiting" | "playing"
  readonly spectators: number;
}

export interface RosterEntry {
  readonly seat: number;
  readonly name: string;
}

export interface LanHandlers {
  onRooms(rooms: RoomInfo[]): void;
  onJoined(code: string, seat: number, isHost: boolean, roster: RosterEntry[], token: string): void;
  onSpectating(code: string, roster: RosterEntry[]): void;
  onPromote(hostSeat: number, roster: RosterEntry[]): void;
  onRoster(roster: RosterEntry[]): void;
  onRelay(fromSeat: number, payload: unknown): void;
  onResend(): void;
  onReconnectFail(): void;
  onError(msg: string): void;
  onClose(reason: string): void;
}

export class LanClient {
  private ws: WebSocket | null = null;
  seat = -1;
  isHost = false;
  code = "";
  hostSeat = 0;

  /** 서버 접속 + 방 목록 구독. */
  connect(url: string, h: LanHandlers): void {
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener("open", () => this.raw({ t: "watch-lobby" }));
    ws.addEventListener("message", (ev) => {
      let m: any;
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      switch (m.t) {
        case "rooms": h.onRooms(m.rooms ?? []); break;
        case "joined":
          this.code = m.code; this.seat = m.seat; this.isHost = m.isHost;
          if (typeof m.hostSeat === "number") this.hostSeat = m.hostSeat;
          h.onJoined(m.code, m.seat, m.isHost, m.roster ?? [], m.token ?? "");
          break;
        case "spectating":
          this.code = m.code; this.seat = -1; this.isHost = false;
          if (typeof m.hostSeat === "number") this.hostSeat = m.hostSeat;
          h.onSpectating(m.code, m.roster ?? []);
          break;
        case "promote":
          this.isHost = true;
          if (typeof m.hostSeat === "number") { this.hostSeat = m.hostSeat; this.seat = m.hostSeat; }
          h.onPromote(m.hostSeat ?? this.seat, m.roster ?? []);
          break;
        case "roster":
          if (typeof m.hostSeat === "number") this.hostSeat = m.hostSeat;
          h.onRoster(m.roster ?? []);
          break;
        case "relay": h.onRelay(m.fromSeat, m.payload); break;
        case "resend": h.onResend(); break;
        case "reconnect-fail": h.onReconnectFail(); break;
        case "err": h.onError(m.msg ?? "오류"); break;
        case "full": h.onError("방이 가득 찼습니다 (최대 4명)."); break;
        case "host-left": h.onClose("호스트가 나가 방이 종료되었습니다."); break;
      }
    });
    ws.addEventListener("close", () => h.onClose("연결이 끊어졌습니다."));
    ws.addEventListener("error", () => h.onClose("서버에 연결할 수 없습니다."));
  }

  createRoom(roomName: string, name: string): void { this.raw({ t: "create", roomName, name }); }
  joinRoom(code: string, name: string): void { this.raw({ t: "join", code, name }); }
  reconnect(code: string, token: string): void { this.raw({ t: "reconnect", code, token }); }
  spectate(code: string): void { this.raw({ t: "spectate", code }); }
  leave(): void { this.raw({ t: "leave" }); }
  setStatus(status: string): void { this.raw({ t: "status", status }); }
  relay(payload: unknown): void { this.raw({ t: "relay", payload }); }

  private raw(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  close(): void { this.ws?.close(); this.ws = null; }
}
