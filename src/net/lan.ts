// LAN 대전 클라이언트: 릴레이 서버(server/relay.mjs)와 WebSocket 통신.
// 호스트(좌석 0)가 게임 권위를 가지며, 게스트는 상태를 받아 렌더하고 행동 의도를 보낸다.

export interface RosterEntry {
  readonly seat: number;
  readonly name: string;
}

export interface LanHandlers {
  onJoined(seat: number, isHost: boolean, roster: RosterEntry[]): void;
  onRoster(roster: RosterEntry[]): void;
  onRelay(fromSeat: number, payload: unknown): void;
  onClose(reason: string): void;
}

export class LanClient {
  private ws: WebSocket | null = null;
  private room = "main";
  seat = -1;
  isHost = false;

  /** 서버 접속 + 대기실 구독(관전). 아직 좌석을 차지하지 않는다. join() 으로 착석.
   *  url 예: `ws://localhost:5178`. */
  connect(url: string, room: string, h: LanHandlers): void {
    this.room = room;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ t: "watch", room }));
    });
    ws.addEventListener("message", (ev) => {
      let m: any;
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      switch (m.t) {
        case "joined":
          this.seat = m.seat;
          this.isHost = m.isHost;
          h.onJoined(m.seat, m.isHost, m.roster ?? []);
          break;
        case "roster":
          h.onRoster(m.roster ?? []);
          break;
        case "relay":
          h.onRelay(m.fromSeat, m.payload);
          break;
        case "full":
          h.onClose("방이 가득 찼습니다 (최대 4명).");
          break;
        case "host-left":
          h.onClose("호스트가 나가 게임이 종료되었습니다.");
          break;
      }
    });
    ws.addEventListener("close", () => h.onClose("연결이 끊어졌습니다."));
    ws.addEventListener("error", () => h.onClose("서버에 연결할 수 없습니다."));
  }

  /** 닉네임으로 착석(좌석 배정 요청). onJoined 로 결과 수신. */
  join(name: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "join", room: this.room, name }));
    }
  }

  /** 앱 레벨 메시지 릴레이(호스트→전원 / 게스트→호스트). */
  relay(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "relay", payload }));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
