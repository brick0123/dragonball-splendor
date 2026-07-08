// LAN 대전 릴레이 서버.
// - 빌드된 단일 HTML(dist/dragonball-splendor.html)을 HTTP 로 서빙
// - WebSocket 으로 같은 방(room) 참가자끼리 메시지를 릴레이(중계)
// 게임 규칙은 브라우저(호스트 권위)에서 처리한다. 서버는 좌석 배정 + 중계만 담당.
//
// 실행: npm run lan  (먼저 npm run build 로 dist 생성)
// 같은 공유기의 다른 기기는 http://<호스트-랜IP>:<PORT> 로 접속.

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 5178);
const MAX_SEATS = 4;
const HTML_PATH = resolve(__dirname, "../dist/dragonball-splendor.html");

if (!existsSync(HTML_PATH)) {
  console.error(`[lan] 빌드 결과가 없습니다: ${HTML_PATH}\n먼저 'npm run build' 를 실행하세요.`);
  process.exit(1);
}

// ── HTTP: 단일 HTML 서빙 ─────────────────────────────────────────────
const server = createServer((req, res) => {
  // 어떤 경로든 게임 페이지 반환(SPA 단일 파일).
  try {
    const html = readFileSync(HTML_PATH);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch {
    res.writeHead(500);
    res.end("build not found");
  }
});

// ── WebSocket 릴레이 ─────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

/** roomCode -> { members: Map<seat, {ws, name}> } */
const rooms = new Map();

function roomOf(code) {
  let r = rooms.get(code);
  if (!r) { r = { members: new Map() }; rooms.set(code, r); }
  return r;
}

function rosterOf(room) {
  return [...room.members.entries()]
    .map(([seat, m]) => ({ seat, name: m.name }))
    .sort((a, b) => a.seat - b.seat);
}

function firstFreeSeat(room) {
  for (let s = 0; s < MAX_SEATS; s++) if (!room.members.has(s)) return s;
  return -1;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastRoster(room) {
  const roster = rosterOf(room);
  for (const m of room.members.values()) send(m.ws, { t: "roster", roster });
}

wss.on("connection", (ws) => {
  ws.meta = { room: null, seat: -1 };

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.t === "join") {
      const code = String(msg.room ?? "main");
      const room = roomOf(code);
      const seat = firstFreeSeat(room);
      if (seat < 0) { send(ws, { t: "full" }); return; }
      const name = String(msg.name ?? `P${seat + 1}`).slice(0, 20);
      room.members.set(seat, { ws, name });
      ws.meta = { room: code, seat };
      const isHost = seat === 0; // 좌석 0(첫 참가자) = 호스트
      send(ws, { t: "joined", seat, isHost, roster: rosterOf(room) });
      broadcastRoster(room);
      console.log(`[lan] join room=${code} seat=${seat} name=${name}`);
      return;
    }

    if (msg.t === "relay") {
      const { room: code, seat } = ws.meta;
      if (code == null) return;
      const room = rooms.get(code);
      if (!room) return;
      // 호스트(좌석 0) 발신 → 나머지 전원. 게스트 발신 → 호스트에게만.
      if (seat === 0) {
        for (const [s, m] of room.members) if (s !== 0) send(m.ws, { t: "relay", fromSeat: 0, payload: msg.payload });
      } else {
        const host = room.members.get(0);
        if (host) send(host.ws, { t: "relay", fromSeat: seat, payload: msg.payload });
      }
      return;
    }
  });

  ws.on("close", () => {
    const { room: code, seat } = ws.meta;
    if (code == null) return;
    const room = rooms.get(code);
    if (!room) return;
    room.members.delete(seat);
    console.log(`[lan] leave room=${code} seat=${seat}`);
    if (seat === 0) {
      // 호스트 이탈 → 방 종료 안내 후 정리
      for (const m of room.members.values()) send(m.ws, { t: "host-left" });
      room.members.clear();
      rooms.delete(code);
    } else {
      broadcastRoster(room);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === "IPv4" && !ni.internal) ips.push(ni.address);
  }
  console.log(`\n🐉 드래곤볼 스플렌더 LAN 서버 실행 중 (포트 ${PORT})`);
  console.log(`   이 기기:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`   같은 랜:   http://${ip}:${PORT}   ← 다른 기기는 이 주소로 접속`);
  console.log("");
});
