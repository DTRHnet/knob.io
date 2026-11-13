import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { BUILTIN_MAPS, getDailyChallengeMap, getWeeklyRankedMap } from './src/game/maps';
import { computeRankTier, filterProfanity } from './src/game/physics';
import { ArenaMap, LobbyRoomSummary, PlayerProfile, ReplayClip } from './src/game/types';

const PORT = 3000;
const DATA_FILE = path.resolve(process.cwd(), '.knob_store.json');

interface StoreData {
  maps: ArenaMap[];
  profiles: Record<string, PlayerProfile>;
  replays: ReplayClip[];
  reports: Array<{ id: string; target: string; reason: string; createdAt: string }>;
}

function loadStore(): StoreData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw) as StoreData;
    }
  } catch {
    // Fallback to clean initial store
  }
  return {
    maps: [],
    profiles: {},
    replays: [],
    reports: [],
  };
}

function saveStore(data: StoreData): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Ignore disk write issues in read-only environments
  }
}

const store = loadStore();

function getOrCreateProfile(handle: string, region = 'NA-West'): PlayerProfile {
  const key = handle.trim() || 'Pilot';
  if (!store.profiles[key]) {
    store.profiles[key] = {
      id: `usr-${key.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pilot'}`,
      handle: key,
      region,
      mmr: 1200,
      tier: computeRankTier(1200),
      season: 'Season 1',
      matchesPlayed: 0,
      wins: 0,
      totalKnockouts: 0,
      comebackWins: 0,
      trailblazes: 0,
      rankedWins: 0,
      casualWins: 0,
      loadout: {
        color: '#F59E0B',
        skin: 'ring',
        trail: 'ribbon',
        impactFx: 'shockwave',
        deathFx: 'pixel',
        emote: 'BONK!',
      },
      mapStats: {},
    };
    saveStore(store);
  }
  return store.profiles[key];
}

// Live in-memory lobbies backed by WebSocket server
const lobbies = new Map<string, LobbyRoomSummary>();

// Seed 2 open regional lobbies so the lobby browser is alive immediately
lobbies.set('KNOB-1042', {
  code: 'KNOB-1042',
  name: 'West Coast Ranked Rotation',
  host: 'Kestrel',
  region: 'NA-West',
  skillRange: '1100–1450 MMR',
  mode: 'classic',
  mapId: 'glacier-spire',
  mapName: 'Glacier Spire',
  advancedPhysics: false,
  ranked: true,
  playerCount: 2,
  maxPlayers: 4,
  isPrivate: false,
  players: [
    { id: 'seed-1', name: 'Kestrel', color: '#06B6D4', ready: true },
    { id: 'seed-2', name: 'Vortex', color: '#EC4899', ready: true },
  ],
  chat: [
    { id: 'c1', sender: 'Kestrel', text: 'Glacier Spire up next. Watch the side updrafts!', time: '17:52' },
  ],
});

lobbies.set('KNOB-7719', {
  code: 'KNOB-7719',
  name: 'Pendulum Chaos Lab',
  host: 'Torque',
  region: 'EU-Central',
  skillRange: 'Open / Casual',
  mode: 'arcade',
  mapId: 'pendulum-forge',
  mapName: 'Pendulum Forge',
  advancedPhysics: true,
  ranked: false,
  playerCount: 1,
  maxPlayers: 4,
  isPrivate: false,
  players: [{ id: 'seed-3', name: 'Torque', color: '#10B981', ready: true }],
  chat: [
    { id: 'c2', sender: 'Torque', text: 'Advanced physics + explosive bumpers enabled.', time: '17:55' },
  ],
});

interface ClientMeta {
  ws: WebSocket;
  roomCode: string | null;
  playerId: string;
  playerName: string;
  lastMsgTime: number;
}

const wsClients = new Map<WebSocket, ClientMeta>();

function broadcastRoom(code: string, payload: unknown, exclude?: WebSocket): void {
  const msg = JSON.stringify(payload);
  for (const meta of wsClients.values()) {
    if (meta.roomCode === code && meta.ws !== exclude && meta.ws.readyState === WebSocket.OPEN) {
      meta.ws.send(msg);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, lobbies: lobbies.size });
  });

  app.get('/api/maps', (_req, res) => {
    const daily = getDailyChallengeMap();
    const weekly = getWeeklyRankedMap();
    res.json({
      builtin: BUILTIN_MAPS,
      featured: [daily, weekly],
      community: store.maps,
    });
  });

  app.post('/api/maps', (req, res) => {
    const map = req.body as ArenaMap;
    if (!map || !map.name || !Array.isArray(map.platforms)) {
      res.status(400).json({ error: 'Invalid map payload' });
      return;
    }
    const existingIdx = store.maps.findIndex((m) => m.id === map.id);
    if (existingIdx >= 0) {
      store.maps[existingIdx] = map;
    } else {
      store.maps.unshift(map);
    }
    saveStore(store);
    res.json({ ok: true, map });
  });

  app.get('/api/profile/:handle', (req, res) => {
    const region = typeof req.query.region === 'string' ? req.query.region : 'NA-West';
    const profile = getOrCreateProfile(req.params.handle, region);
    res.json(profile);
  });

  app.post('/api/profile', (req, res) => {
    const incoming = req.body as Partial<PlayerProfile> & { handle: string };
    if (!incoming?.handle) {
      res.status(400).json({ error: 'Handle required' });
      return;
    }
    const current = getOrCreateProfile(incoming.handle, incoming.region ?? 'NA-West');
    const updated: PlayerProfile = {
      ...current,
      ...incoming,
      tier: computeRankTier(incoming.mmr ?? current.mmr),
      loadout: incoming.loadout ? { ...current.loadout, ...incoming.loadout } : current.loadout,
      mapStats: incoming.mapStats ? { ...current.mapStats, ...incoming.mapStats } : current.mapStats,
    };
    store.profiles[updated.handle] = updated;
    saveStore(store);
    res.json(updated);
  });

  app.get('/api/replays', (_req, res) => {
    res.json(store.replays.slice(0, 20));
  });

  app.post('/api/replays', (req, res) => {
    const clip = req.body as ReplayClip;
    if (!clip || !clip.id || !Array.isArray(clip.frames)) {
      res.status(400).json({ error: 'Invalid replay payload' });
      return;
    }
    store.replays.unshift(clip);
    if (store.replays.length > 20) store.replays.length = 20;
    saveStore(store);
    res.json({ ok: true, id: clip.id });
  });

  app.get('/api/lobbies', (_req, res) => {
    const list = Array.from(lobbies.values()).filter((l) => !l.isPrivate);
    res.json(list);
  });

  app.post('/api/lobbies', (req, res) => {
    const body = req.body as Partial<LobbyRoomSummary>;
    const code = `KNOB-${Math.floor(1000 + Math.random() * 9000)}`;
    const room: LobbyRoomSummary = {
      code,
      name: (body.name || `${body.host || 'Pilot'}'s Room`).slice(0, 40),
      host: body.host || 'Pilot',
      region: body.region || 'NA-West',
      skillRange: body.ranked ? 'Skill Matched' : 'Open / Casual',
      mode: body.mode || 'classic',
      mapId: body.mapId || 'glacier-spire',
      mapName: body.mapName || 'Glacier Spire',
      advancedPhysics: Boolean(body.advancedPhysics),
      ranked: Boolean(body.ranked),
      playerCount: 1,
      maxPlayers: 4,
      isPrivate: Boolean(body.isPrivate),
      players: [{ id: `host-${Date.now()}`, name: body.host || 'Pilot', color: '#F59E0B', ready: true }],
      chat: [{ id: `init-${Date.now()}`, sender: 'System', text: `Room ${code} created.`, time: new Date().toTimeString().slice(0, 5) }],
    };
    lobbies.set(code, room);
    res.json(room);
  });

  app.post('/api/matchmake', (req, res) => {
    const { region = 'NA-West', mmr = 1200, ranked = false, handle = 'Pilot' } = req.body as {
      region?: string;
      mmr?: number;
      ranked?: boolean;
      handle?: string;
    };
    // Match best public lobby by region + ranked flag
    const candidates = Array.from(lobbies.values()).filter(
      (l) => !l.isPrivate && l.playerCount < l.maxPlayers && l.ranked === ranked
    );
    const regional = candidates.find((l) => l.region === region) ?? candidates[0];
    if (regional) {
      res.json({ matched: true, room: regional });
      return;
    }
    const code = `KNOB-${Math.floor(1000 + Math.random() * 9000)}`;
    const tier = computeRankTier(mmr);
    const room: LobbyRoomSummary = {
      code,
      name: `${region} ${ranked ? `${tier} Ranked` : 'Quick Play'}`,
      host: handle,
      region,
      skillRange: ranked ? `${Math.max(600, mmr - 200)}–${mmr + 200} MMR` : 'Open',
      mode: ranked ? 'classic' : 'arcade',
      mapId: ranked ? 'glacier-spire' : 'factory-belts',
      mapName: ranked ? 'Glacier Spire' : 'Factory Belts',
      advancedPhysics: false,
      ranked,
      playerCount: 1,
      maxPlayers: 4,
      isPrivate: false,
      players: [{ id: `mm-${Date.now()}`, name: handle, color: '#F59E0B', ready: true }],
      chat: [],
    };
    lobbies.set(code, room);
    res.json({ matched: true, room });
  });

  app.post('/api/moderation/report', (req, res) => {
    const { target, reason } = req.body as { target: string; reason: string };
    store.reports.unshift({
      id: `rep-${Date.now()}`,
      target: String(target || 'Unknown'),
      reason: String(reason || 'Unsportsmanlike conduct'),
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    res.json({ ok: true });
  });

  const server = http.createServer(app);

  // WebSocket Multiplayer & Lobby Sync
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    wsClients.set(ws, {
      ws,
      roomCode: null,
      playerId: `p-${Math.random().toString(36).slice(2, 8)}`,
      playerName: 'Pilot',
      lastMsgTime: 0,
    });

    ws.on('message', (raw) => {
      const meta = wsClients.get(ws);
      if (!meta) return;
      const now = Date.now();
      // Basic anti-spam rate limit (max 60 msgs/sec for physics, chat limited separately)
      if (now - meta.lastMsgTime < 12) return;
      meta.lastMsgTime = now;

      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'lobby:join') {
        const code = String(msg.code || '').toUpperCase();
        const name = String(msg.name || 'Pilot').slice(0, 20);
        const color = String(msg.color || '#F59E0B');
        meta.roomCode = code;
        meta.playerName = name;

        const room = lobbies.get(code);
        if (room) {
          const placeholderIdx = room.players.findIndex(
            (p) => p.id.startsWith('host-') || p.id.startsWith('mm-')
          );
          if (placeholderIdx >= 0 && room.players[placeholderIdx].name === name) {
            room.players[placeholderIdx] = { id: meta.playerId, name, color, ready: true };
          } else if (!room.players.some((p) => p.id === meta.playerId)) {
            if (room.players.length < room.maxPlayers) {
              room.players.push({ id: meta.playerId, name, color, ready: true });
            }
          }
          room.playerCount = room.players.length;
          ws.send(JSON.stringify({ type: 'lobby:state', room, selfId: meta.playerId }));
          broadcastRoom(code, { type: 'lobby:state', room }, ws);
        } else {
          ws.send(JSON.stringify({ type: 'lobby:error', error: `Room ${code} not found` }));
        }
      } else if (msg.type === 'lobby:chat' && meta.roomCode) {
        const room = lobbies.get(meta.roomCode);
        if (!room) return;
        const { clean, flagged } = filterProfanity(String(msg.text || ''));
        if (!clean) return;
        const entry = {
          id: `c-${Date.now()}`,
          sender: meta.playerName,
          text: flagged ? `${clean} (moderated)` : clean,
          time: new Date().toTimeString().slice(0, 5),
        };
        room.chat.push(entry);
        if (room.chat.length > 30) room.chat.shift();
        broadcastRoom(meta.roomCode, { type: 'lobby:state', room });
      } else if (msg.type === 'lobby:update' && meta.roomCode) {
        const room = lobbies.get(meta.roomCode);
        if (!room) return;
        if (typeof msg.mode === 'string') room.mode = msg.mode as LobbyRoomSummary['mode'];
        if (typeof msg.mapId === 'string') room.mapId = msg.mapId;
        if (typeof msg.mapName === 'string') room.mapName = msg.mapName;
        if (typeof msg.advancedPhysics === 'boolean') room.advancedPhysics = msg.advancedPhysics;
        broadcastRoom(meta.roomCode, { type: 'lobby:state', room });
      } else if (msg.type === 'lobby:kick' && meta.roomCode) {
        const room = lobbies.get(meta.roomCode);
        if (!room) return;
        const targetId = String(msg.targetId || '');
        room.players = room.players.filter((p) => p.id !== targetId);
        room.playerCount = room.players.length;
        broadcastRoom(meta.roomCode, { type: 'lobby:state', room });
      } else if (msg.type === 'lobby:start' && meta.roomCode) {
        const room = lobbies.get(meta.roomCode);
        if (room) {
          broadcastRoom(meta.roomCode, { type: 'lobby:started', room });
        }
      } else if (msg.type === 'match:input' && meta.roomCode) {
        broadcastRoom(
          meta.roomCode,
          { type: 'match:input', playerId: meta.playerId, input: msg.input },
          ws
        );
      }
    });

    ws.on('close', () => {
      const meta = wsClients.get(ws);
      if (meta?.roomCode) {
        const room = lobbies.get(meta.roomCode);
        if (room) {
          room.players = room.players.filter((p) => p.id !== meta.playerId);
          room.playerCount = room.players.length;
          broadcastRoom(meta.roomCode, { type: 'lobby:state', room });
        }
      }
      wsClients.delete(ws);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Knob.io server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
