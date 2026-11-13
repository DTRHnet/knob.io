import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud, HudSnapshot } from './components/GameHud';
import { LobbyModal } from './components/LobbyModal';
import {
  MatchResultSummary,
  OutcomeModal,
  PauseModal,
} from './components/PauseAndOutcomeModals';
import {
  StudioAndProfileModal,
  StudioTab,
} from './components/StudioAndProfileModal';
import { TitleScreen } from './components/TitleScreen';
import { computeAiInput } from './game/ai';
import { soundEngine } from './game/audio';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BUILTIN_MAPS,
  getDailyChallengeMap,
  getWeeklyRankedMap,
} from './game/maps';
import {
  computeRankTier,
  createMatchState,
  PlayerSeed,
  stepMatchFixed,
  updateMmr,
} from './game/physics';
import { CameraView, renderMatchCanvas } from './game/renderer';
import {
  ArcadeModifier,
  ArenaMap,
  GameMode,
  LobbyRoomSummary,
  MatchState,
  PhysicsPresetId,
  PlayerInput,
  PlayerProfile,
  ReplayClip,
  ReplayFrame,
} from './game/types';

type ShellState = 'title' | 'playing' | 'paused' | 'gameover';

const DEFAULT_PROFILE: PlayerProfile = {
  id: 'usr-pilot',
  handle: 'Pilot',
  region: 'NA-West',
  mmr: 1200,
  tier: 'Gold',
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

const BOT_SEEDS: Omit<PlayerSeed, 'isHuman'>[] = [
  {
    id: 'bot-brawler',
    name: 'Anvil',
    aiPolicy: 'brawler',
    team: 2,
    loadout: {
      color: '#06B6D4',
      skin: 'target',
      trail: 'sparks',
      impactFx: 'shatter',
      deathFx: 'implode',
      emote: 'TOO HEAVY',
    },
  },
  {
    id: 'bot-acrobat',
    name: 'Zephyr',
    aiPolicy: 'acrobat',
    team: 1,
    loadout: {
      color: '#EC4899',
      skin: 'crescent',
      trail: 'frost',
      impactFx: 'starburst',
      deathFx: 'confetti',
      emote: 'NICE TRY',
    },
  },
  {
    id: 'bot-tactician',
    name: 'Prism',
    aiPolicy: 'tactician',
    team: 2,
    loadout: {
      color: '#10B981',
      skin: 'prism',
      trail: 'plasma',
      impactFx: 'shockwave',
      deathFx: 'pixel',
      emote: 'CLUTCH!',
    },
  },
];

export default function App() {
  const [shellState, setShellState] = useState<ShellState>('title');
  const [profile, setProfile] = useState<PlayerProfile>(DEFAULT_PROFILE);
  const [maps, setMaps] = useState<ArenaMap[]>(() => [
    ...BUILTIN_MAPS,
    getDailyChallengeMap(),
    getWeeklyRankedMap(),
  ]);
  const [selectedMap, setSelectedMap] = useState<ArenaMap>(BUILTIN_MAPS[0]);
  const [selectedMode, setSelectedMode] = useState<GameMode>('classic');
  const [advancedPhysics, setAdvancedPhysics] = useState<boolean>(false);
  const [physicsPreset, setPhysicsPreset] = useState<PhysicsPresetId>('map_default');
  const [rankedQueue, setRankedQueue] = useState<boolean>(false);
  const [arcadeModifier, setArcadeModifier] = useState<ArcadeModifier>('low_g');

  const [muted, setMuted] = useState(false);
  const [spectatorMode, setSpectatorMode] = useState(false);
  const [touchControlsEnabled, setTouchControlsEnabled] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)').matches : false
  );

  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>('editor');
  const [activeRoom, setActiveRoom] = useState<LobbyRoomSummary | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [replays, setReplays] = useState<ReplayClip[]>([]);
  const [latestReplayId, setLatestReplayId] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResultSummary | null>(null);

  const [hud, setHud] = useState<HudSnapshot>({
    timeRemaining: 120,
    mode: 'classic',
    mapName: BUILTIN_MAPS[0].name,
    arcadeModifier: 'none',
    advancedPhysics: false,
    players: [],
    humanAlive: true,
    humanSpeed: 0,
    humanBounceChain: 0,
  });

  // Simulation refs decoupled from React 60Hz loop
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const matchRef = useRef<MatchState | null>(null);
  const shellRef = useRef<ShellState>('title');
  const keysRef = useRef<Set<string>>(new Set());
  const touchInputRef = useRef<PlayerInput>({
    left: false,
    right: false,
    up: false,
    down: false,
    heavy: false,
    emote: false,
  });
  const camRef = useRef<CameraView>({ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, zoom: 1 });
  const replayFramesRef = useRef<ReplayFrame[]>([]);
  const replaySampleAccumRef = useRef<number>(0);
  const hudSyncAccumRef = useRef<number>(0);
  const physicsAccumRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const spectatorRef = useRef<boolean>(false);
  const modalOpenRef = useRef<boolean>(false);
  const profileRef = useRef<PlayerProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    shellRef.current = shellState;
    document.body.dataset.state = shellState;
  }, [shellState]);

  useEffect(() => {
    spectatorRef.current = spectatorMode;
  }, [spectatorMode]);

  useEffect(() => {
    modalOpenRef.current = lobbyOpen || studioOpen;
  }, [lobbyOpen, studioOpen]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Load initial profile, maps, and replays from backend
  useEffect(() => {
    fetch('/api/maps')
      .then((r) => r.json())
      .then((data) => {
        if (data?.builtin) {
          const all = [
            ...(data.builtin as ArenaMap[]),
            ...(data.featured as ArenaMap[]),
            ...(data.community as ArenaMap[]),
          ];
          setMaps(all);
        }
      })
      .catch(() => {});

    fetch('/api/profile/Pilot')
      .then((r) => r.json())
      .then((p) => {
        if (p?.handle) setProfile(p);
      })
      .catch(() => {});

    fetch('/api/replays')
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setReplays(list);
      })
      .catch(() => {});
  }, []);

  const buildSnapshot = useCallback((st: MatchState): HudSnapshot => {
    const human = st.players.find((p) => p.isHuman);
    return {
      timeRemaining: st.timeRemaining,
      mode: st.config.mode,
      mapName: st.map.name,
      arcadeModifier: st.config.arcadeModifier,
      advancedPhysics: st.config.advancedPhysics,
      players: st.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.loadout.color,
        stocks: p.stocks,
        alive: p.alive,
        knockouts: p.knockouts,
        objectiveScore: p.objectiveScore,
        isHuman: p.isHuman,
        hasFlag: p.hasFlag,
      })),
      humanAlive: human ? human.alive || human.stocks > 0 : false,
      humanSpeed: human ? Math.round(Math.hypot(human.vx, human.vy)) : 0,
      humanBounceChain: human ? human.bounceChain : 0,
    };
  }, []);

  const startShowcaseMatch = useCallback(
    (mapToUse: ArenaMap) => {
      physicsAccumRef.current = 0;
      const bots: PlayerSeed[] = [
        {
          id: 'show-1',
          name: profileRef.current.handle,
          isHuman: false,
          aiPolicy: 'brawler',
          team: 1,
          loadout: profileRef.current.loadout,
        },
        ...BOT_SEEDS.map((b) => ({ ...b, isHuman: false })),
      ];
      matchRef.current = createMatchState(
        mapToUse,
        {
          mode: 'classic',
          advancedPhysics: mapToUse.advancedPhysics,
          arcadeModifier: 'none',
          physicsPreset: 'map_default',
          ranked: false,
          stocks: 99,
          timeLimitSec: 999,
          region: profileRef.current.region,
        },
        bots
      );
    },
    []
  );

  const startPlayMatch = useCallback(
    (overrideMap?: ArenaMap, overrideMode?: GameMode, overrideAdv?: boolean) => {
      const mapUse = overrideMap ?? selectedMap;
      const modeUse = overrideMode ?? selectedMode;
      const advUse = overrideAdv ?? advancedPhysics;

      keysRef.current.clear();
      touchInputRef.current = {
        left: false,
        right: false,
        up: false,
        down: false,
        heavy: false,
        emote: false,
      };
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      canvasRef.current?.focus();

      const humanSeed: PlayerSeed = {
        id: 'human-1',
        name: profileRef.current.handle,
        isHuman: true,
        aiPolicy: 'brawler',
        team: modeUse === 'ctf' ? 1 : 0,
        loadout: profileRef.current.loadout,
      };

      const seeds: PlayerSeed[] = [
        humanSeed,
        ...BOT_SEEDS.map((b) => ({
          ...b,
          isHuman: false,
          team: (modeUse === 'ctf' ? b.team : 0) as 0 | 1 | 2,
        })),
      ];

      const st = createMatchState(
        mapUse,
        {
          mode: modeUse,
          advancedPhysics: advUse,
          arcadeModifier: modeUse === 'arcade' ? arcadeModifier : 'none',
          physicsPreset,
          ranked: rankedQueue,
          stocks: modeUse === 'arcade' ? 2 : 3,
          timeLimitSec: modeUse === 'arcade' ? 75 : 120,
          region: profileRef.current.region,
        },
        seeds
      );

      physicsAccumRef.current = 0;
      matchRef.current = st;
      replayFramesRef.current = [];
      replaySampleAccumRef.current = 0;
      camRef.current = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, zoom: 1 };
      setSpectatorMode(false);
      setMatchResult(null);
      setLobbyOpen(false);
      setStudioOpen(false);
      setHud(buildSnapshot(st));
      setShellState('playing');
    },
    [selectedMap, selectedMode, advancedPhysics, physicsPreset, arcadeModifier, rankedQueue, buildSnapshot]
  );

  // Initialize showcase match + check ?autostart=1
  useEffect(() => {
    startShowcaseMatch(BUILTIN_MAPS[0]);
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startPlayMatch(BUILTIN_MAPS[0], 'classic', false);
    }
  }, [startShowcaseMatch, startPlayMatch]);

  // Finalize match stats, MMR, and save replay clip
  const finalizeMatch = useCallback(
    async (st: MatchState) => {
      const human = st.players.find((p) => p.isHuman);
      const won = st.winnerId === human?.id;
      const knockouts = human?.knockouts ?? 0;
      const damageDealt = human?.damageDealt ?? 0;

      const prevProf = profileRef.current;
      const nextMmr = st.config.ranked
        ? updateMmr(prevProf.mmr, won, knockouts)
        : prevProf.mmr;
      const mmrDelta = nextMmr - prevProf.mmr;
      const nextTier = computeRankTier(nextMmr);

      const wasBehind = human ? Boolean(st.wasBehindAtHalfway[human.id]) : false;
      const prevMapStat = prevProf.mapStats[st.map.name] ?? {
        played: 0,
        wins: 0,
        knockouts: 0,
      };

      const clip: ReplayClip = {
        id: `rep-${Date.now()}`,
        title: `${st.map.name} · ${st.config.mode.toUpperCase()}`,
        mapName: st.map.name,
        mode: st.config.mode,
        createdAt: new Date().toISOString(),
        durationSec: Math.round(st.timeElapsed),
        winnerName: st.winnerName ?? 'Draw',
        playerMeta: st.players.map((p) => ({
          id: p.id,
          name: p.name,
          loadout: p.loadout,
          team: p.team,
        })),
        frames: replayFramesRef.current.slice(-450),
      };

      if (clip.frames.length > 0) {
        setReplays((prev) => [clip, ...prev].slice(0, 20));
        setLatestReplayId(clip.id);
        fetch('/api/replays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clip),
        }).catch(() => {});
      }

      const updatedProfile: PlayerProfile = {
        ...prevProf,
        mmr: nextMmr,
        tier: nextTier,
        matchesPlayed: prevProf.matchesPlayed + 1,
        wins: prevProf.wins + (won ? 1 : 0),
        totalKnockouts: prevProf.totalKnockouts + knockouts,
        comebackWins: prevProf.comebackWins + (won && wasBehind ? 1 : 0),
        rankedWins: prevProf.rankedWins + (won && st.config.ranked ? 1 : 0),
        casualWins: prevProf.casualWins + (won && !st.config.ranked ? 1 : 0),
        mapStats: {
          ...prevProf.mapStats,
          [st.map.name]: {
            played: prevMapStat.played + 1,
            wins: prevMapStat.wins + (won ? 1 : 0),
            knockouts: prevMapStat.knockouts + knockouts,
          },
        },
      };

      setProfile(updatedProfile);
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile),
      }).catch(() => {});

      setMatchResult({
        won,
        winnerName: st.winnerName ?? 'Pilot',
        reason: st.winReason ?? 'Match Complete',
        mode: st.config.mode,
        mapName: st.map.name,
        knockouts,
        damageDealt,
        mmrDelta,
        newMmr: nextMmr,
        newTier: nextTier,
        ranked: st.config.ranked,
        hasReplay: clip.frames.length > 0,
      });
      setShellState('gameover');
    },
    []
  );

  // Canvas resize observer + 60 FPS loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(document.body);

    let rafId = 0;
    let lastTime = performance.now();
    let drawnWhileFrozen = false;

    const frame = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const st = matchRef.current;
      const currentShell = shellRef.current;
      const isFrozen =
        currentShell === 'paused' ||
        currentShell === 'gameover' ||
        modalOpenRef.current;

      if (st && !isFrozen && (currentShell === 'title' || currentShell === 'playing')) {
        drawnWhileFrozen = false;
        const inputs: Record<string, PlayerInput> = {};

        for (const p of st.players) {
          if (p.isHuman && currentShell === 'playing') {
            const ks = keysRef.current;
            const ti = touchInputRef.current;
            let gpLeft = false;
            let gpRight = false;
            let gpJump = false;
            let gpHeavy = false;
            const gps = navigator.getGamepads ? navigator.getGamepads() : [];
            const gp = gps?.[0];
            if (gp) {
              gpLeft = gp.axes[0] < -0.35 || Boolean(gp.buttons[14]?.pressed);
              gpRight = gp.axes[0] > 0.35 || Boolean(gp.buttons[15]?.pressed);
              gpJump = Boolean(gp.buttons[0]?.pressed || gp.buttons[12]?.pressed);
              gpHeavy = Boolean(gp.buttons[2]?.pressed || gp.buttons[7]?.pressed);
            }

            inputs[p.id] = {
              left: ks.has('ArrowLeft') || ks.has('KeyA') || ti.left || gpLeft,
              right: ks.has('ArrowRight') || ks.has('KeyD') || ti.right || gpRight,
              up:
                ks.has('ArrowUp') ||
                ks.has('KeyW') ||
                ks.has('Space') ||
                ti.up ||
                gpJump,
              down: ks.has('ArrowDown') || ks.has('KeyS') || ti.down,
              heavy:
                ks.has('ShiftLeft') ||
                ks.has('ShiftRight') ||
                ks.has('KeyX') ||
                ti.heavy ||
                gpHeavy,
              emote: ks.has('KeyE') || ti.emote,
            };
          } else {
            inputs[p.id] = computeAiInput(st, p);
          }
        }

        const events = stepMatchFixed(st, dt, inputs, physicsAccumRef);

        if (currentShell === 'playing') {
          if (events.bounceBoosts > 0) soundEngine.playBounceBoost();
          else if (events.jumps > 0) soundEngine.playJump();
          if (events.shatters > 0) soundEngine.playShatter();
          if (events.captures > 0) soundEngine.playCapture();
          if (events.emotesFired > 0) soundEngine.playEmote();
          for (const col of events.collisions) {
            soundEngine.playBounce(col.intensity, col.heavy);
          }
          if (events.koEvents.length > 0) {
            soundEngine.playKO();
            setHud(buildSnapshot(st));
          }

          // Record replay frame at ~20 Hz
          replaySampleAccumRef.current += dt;
          if (replaySampleAccumRef.current >= 0.05) {
            replaySampleAccumRef.current = 0;
            replayFramesRef.current.push({
              time: st.timeElapsed,
              hazardLevel: st.hazardRiseY,
              survivalRadius: st.survivalRadius,
              flagX: st.flagX,
              flagY: st.flagY,
              players: st.players.map((pl) => ({
                id: pl.id,
                x: Math.round(pl.x),
                y: Math.round(pl.y),
                vx: Math.round(pl.vx),
                vy: Math.round(pl.vy),
                isHeavy: pl.isHeavy,
                alive: pl.alive,
                stocks: pl.stocks,
                angle: Number(pl.angle.toFixed(2)),
                objectiveScore: Number(pl.objectiveScore.toFixed(1)),
                hasFlag: pl.hasFlag,
                calloutText: pl.calloutText,
              })),
            });
          }

          // Spectator camera follow / pan
          if (spectatorRef.current) {
            const target = st.players.find((pl) => pl.alive);
            if (target) {
              camRef.current.x += (target.x - camRef.current.x) * Math.min(1, dt * 4);
              camRef.current.y += (target.y - camRef.current.y) * Math.min(1, dt * 4);
              camRef.current.zoom = 1.18;
            }
          } else {
            camRef.current = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, zoom: 1 };
          }

          // Throttle React HUD updates to meaningful state changes
          hudSyncAccumRef.current += dt;
          if (hudSyncAccumRef.current >= 0.18) {
            hudSyncAccumRef.current = 0;
            const nextSnap = buildSnapshot(st);
            setHud((prev) => {
              const prevSec = Math.floor(prev.timeRemaining);
              const nextSec = Math.floor(nextSnap.timeRemaining);
              const speedBandChanged =
                Math.round(prev.humanSpeed / 25) !== Math.round(nextSnap.humanSpeed / 25);
              const changed =
                prevSec !== nextSec ||
                prev.humanAlive !== nextSnap.humanAlive ||
                prev.humanBounceChain !== nextSnap.humanBounceChain ||
                speedBandChanged ||
                prev.players.length !== nextSnap.players.length ||
                prev.players.some(
                  (pp, idx) =>
                    pp.stocks !== nextSnap.players[idx]?.stocks ||
                    pp.knockouts !== nextSnap.players[idx]?.knockouts ||
                    Math.round(pp.objectiveScore) !==
                      Math.round(nextSnap.players[idx]?.objectiveScore ?? 0)
                );
              return changed ? nextSnap : prev;
            });
          }

          if (st.finished) {
            finalizeMatch(st);
          }
        }
      }

      if (st && (!isFrozen || !drawnWhileFrozen)) {
        renderMatchCanvas(
          ctx,
          window.innerWidth,
          window.innerHeight,
          st,
          camRef.current
        );
        if (isFrozen) drawnWhileFrozen = true;
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, [buildSnapshot, finalizeMatch]);

  // Unified Keyboard Input + Focus Hygiene
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (shellRef.current === 'title' && !lobbyOpen && !studioOpen) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startPlayMatch();
          return;
        }
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (lobbyOpen) {
          setLobbyOpen(false);
          return;
        }
        if (studioOpen) {
          setStudioOpen(false);
          return;
        }
        if (shellRef.current === 'playing') {
          keysRef.current.clear();
          setShellState('paused');
          return;
        }
        if (shellRef.current === 'paused') {
          setShellState('playing');
          return;
        }
      }

      if (e.code === 'KeyM' && shellRef.current === 'playing') {
        setMuted((prev) => {
          soundEngine.muted = !prev;
          return !prev;
        });
      }

      if (e.code === 'KeyR' && shellRef.current === 'playing') {
        startPlayMatch();
      }

      if (e.code === 'KeyV' && shellRef.current === 'playing') {
        setSpectatorMode((s) => !s);
      }

      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) &&
        shellRef.current === 'playing'
      ) {
        e.preventDefault();
      }
      keysRef.current.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };

    const clearKeys = () => {
      keysRef.current.clear();
      touchInputRef.current = {
        left: false,
        right: false,
        up: false,
        down: false,
        heavy: false,
        emote: false,
      };
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
    };
  }, [lobbyOpen, studioOpen, startPlayMatch]);

  // WebSocket Room Connector
  const connectToRoomWs = useCallback((code: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(
        JSON.stringify({
          type: 'lobby:join',
          code,
          name: profileRef.current.handle,
          color: profileRef.current.loadout.color,
        })
      );
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'lobby:state' && msg.room) {
          setActiveRoom(msg.room);
        } else if (msg.type === 'lobby:started') {
          startPlayMatch();
        }
      } catch {
        // Ignore malformed frame
      }
    };
    ws.onclose = () => {
      setWsConnected(false);
    };
  }, [startPlayMatch]);

  const handleCreateLobby = async (opts: { isPrivate: boolean; name: string }) => {
    const res = await fetch('/api/lobbies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: opts.name,
        host: profile.handle,
        region: profile.region,
        mode: selectedMode,
        mapId: selectedMap.id,
        mapName: selectedMap.name,
        advancedPhysics,
        ranked: rankedQueue,
        isPrivate: opts.isPrivate,
      }),
    });
    const room = (await res.json()) as LobbyRoomSummary;
    setActiveRoom(room);
    connectToRoomWs(room.code);
  };

  const handleMatchmake = async () => {
    const res = await fetch('/api/matchmake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: profile.region,
        mmr: profile.mmr,
        ranked: rankedQueue,
        handle: profile.handle,
      }),
    });
    const data = await res.json();
    if (data?.room) {
      setActiveRoom(data.room);
      connectToRoomWs(data.room.code);
    }
  };

  const handleSaveProfile = async (patch: Partial<PlayerProfile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    const saved = await res.json();
    if (saved?.handle) setProfile(saved);
  };

  const handleSaveMap = async (map: ArenaMap) => {
    const res = await fetch('/api/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(map),
    });
    const data = await res.json();
    if (data?.map) {
      setMaps((prev) => [data.map, ...prev.filter((m) => m.id !== data.map.id)]);
      setSelectedMap(data.map);
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0E121B]">
      {/* Isolated Full-Viewport Game Canvas */}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        data-testid="arena-canvas"
        aria-label="Knob.io Physics Arena"
        className="block w-full h-full outline-none"
      />

      {shellState === 'title' && !lobbyOpen && !studioOpen && (
        <TitleScreen
          profile={profile}
          selectedMapName={selectedMap.name}
          selectedMode={selectedMode}
          advancedPhysics={advancedPhysics}
          onStartPlay={() => startPlayMatch()}
          onOpenLobbies={() => setLobbyOpen(true)}
          onOpenStudio={() => {
            setStudioTab('editor');
            setStudioOpen(true);
          }}
        />
      )}

      {shellState === 'playing' && (
        <GameHud
          hud={hud}
          muted={muted}
          spectatorMode={spectatorMode}
          touchControlsEnabled={touchControlsEnabled}
          onToggleMute={() =>
            setMuted((prev) => {
              soundEngine.muted = !prev;
              return !prev;
            })
          }
          onTogglePause={() => setShellState('paused')}
          onRestart={() => startPlayMatch()}
          onToggleSpectatorCam={() => setSpectatorMode((s) => !s)}
          onToggleTouchControls={() => setTouchControlsEnabled((t) => !t)}
          onTouchInput={(key, pressed) => {
            touchInputRef.current[key] = pressed;
          }}
        />
      )}

      {shellState === 'paused' && !lobbyOpen && !studioOpen && (
        <PauseModal
          onResume={() => setShellState('playing')}
          onRestart={() => startPlayMatch()}
          onOpenLobbies={() => setLobbyOpen(true)}
          onExitToTitle={() => {
            startShowcaseMatch(selectedMap);
            setShellState('title');
          }}
        />
      )}

      {shellState === 'gameover' && matchResult && !studioOpen && !lobbyOpen && (
        <OutcomeModal
          result={matchResult}
          onPlayAgain={() => startPlayMatch()}
          onWatchReplay={() => {
            setStudioTab('replays');
            setStudioOpen(true);
          }}
          onExitToTitle={() => {
            startShowcaseMatch(selectedMap);
            setShellState('title');
          }}
        />
      )}

      {lobbyOpen && (
        <LobbyModal
          profile={profile}
          maps={maps}
          selectedMapId={selectedMap.id}
          selectedMode={selectedMode}
          advancedPhysics={advancedPhysics}
          physicsPreset={physicsPreset}
          rankedQueue={rankedQueue}
          arcadeModifier={arcadeModifier}
          activeRoom={activeRoom}
          wsConnected={wsConnected}
          onSelectMap={(m) => {
            setSelectedMap(m);
            setAdvancedPhysics(m.advancedPhysics);
            if (shellState === 'title') startShowcaseMatch(m);
            wsRef.current?.send(
              JSON.stringify({
                type: 'lobby:update',
                mapId: m.id,
                mapName: m.name,
                advancedPhysics: m.advancedPhysics,
              })
            );
          }}
          onSelectMode={(m) => {
            setSelectedMode(m);
            wsRef.current?.send(JSON.stringify({ type: 'lobby:update', mode: m }));
          }}
          onToggleAdvancedPhysics={(val) => {
            setAdvancedPhysics(val);
            wsRef.current?.send(
              JSON.stringify({ type: 'lobby:update', advancedPhysics: val })
            );
          }}
          onSelectPhysicsPreset={setPhysicsPreset}
          onToggleRanked={setRankedQueue}
          onSelectArcadeModifier={setArcadeModifier}
          onCreateLobby={handleCreateLobby}
          onJoinLobby={(code) => connectToRoomWs(code)}
          onMatchmake={handleMatchmake}
          onSendChat={(text) =>
            wsRef.current?.send(JSON.stringify({ type: 'lobby:chat', text }))
          }
          onKickPlayer={(targetId) =>
            wsRef.current?.send(JSON.stringify({ type: 'lobby:kick', targetId }))
          }
          onReportPlayer={async (target) => {
            await fetch('/api/moderation/report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ target, reason: 'Reported from lobby' }),
            });
          }}
          onLaunchMatch={() => {
            wsRef.current?.send(JSON.stringify({ type: 'lobby:start' }));
            startPlayMatch();
          }}
          onClose={() => setLobbyOpen(false)}
        />
      )}

      {studioOpen && (
        <StudioAndProfileModal
          initialTab={studioTab}
          profile={profile}
          maps={maps}
          replays={replays}
          activeReplayId={latestReplayId}
          onSaveProfile={handleSaveProfile}
          onSaveMap={handleSaveMap}
          onTestMap={(customMap) => {
            setSelectedMap(customMap);
            setAdvancedPhysics(customMap.advancedPhysics);
            startPlayMatch(customMap, customMap.recommendedMode, customMap.advancedPhysics);
          }}
          onClose={() => setStudioOpen(false)}
        />
      )}
    </main>
  );
}
