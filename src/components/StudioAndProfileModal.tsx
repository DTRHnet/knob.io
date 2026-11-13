import React, { useEffect, useRef, useState } from 'react';
import { ARENA_HEIGHT, ARENA_WIDTH, BUILTIN_MAPS } from '../game/maps';
import { createMatchState } from '../game/physics';
import { applyReplayFrame, CameraView, renderMatchCanvas } from '../game/renderer';
import {
  ArenaMap,
  CosmeticLoadout,
  DeathFxStyle,
  ImpactFxStyle,
  PlayerProfile,
  ReplayClip,
  SkinStyle,
  TrailStyle,
} from '../game/types';
import { MapEditor } from './MapEditor';

export type StudioTab = 'editor' | 'profile' | 'replays';

interface StudioAndProfileModalProps {
  initialTab: StudioTab;
  profile: PlayerProfile;
  maps: ArenaMap[];
  replays: ReplayClip[];
  activeReplayId: string | null;
  onSaveProfile: (patch: Partial<PlayerProfile>) => Promise<void>;
  onSaveMap: (map: ArenaMap) => Promise<void>;
  onTestMap: (map: ArenaMap) => void;
  onClose: () => void;
}

const COLORS = ['#F59E0B', '#06B6D4', '#EC4899', '#10B981', '#8B5CF6', '#FF4D3D'];
const SKINS: SkinStyle[] = ['ring', 'prism', 'target', 'crescent', 'checker', 'crown'];
const TRAILS: TrailStyle[] = ['ribbon', 'sparks', 'frost', 'plasma'];
const IMPACTS: ImpactFxStyle[] = ['shockwave', 'shatter', 'starburst'];
const DEATHS: DeathFxStyle[] = ['pixel', 'implode', 'confetti'];
const EMOTES = ['BONK!', 'CLUTCH!', 'NICE TRY', 'NOPE!', 'TOO HEAVY'];

export const StudioAndProfileModal: React.FC<StudioAndProfileModalProps> = ({
  initialTab,
  profile,
  maps,
  replays,
  activeReplayId,
  onSaveProfile,
  onSaveMap,
  onTestMap,
  onClose,
}) => {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const [handleInput, setHandleInput] = useState(profile.handle);
  const [regionInput, setRegionInput] = useState(profile.region);
  const [loadout, setLoadout] = useState<CosmeticLoadout>(profile.loadout);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  // Replay Viewer State
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(
    activeReplayId ?? replays[0]?.id ?? null
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const [playingReplay, setPlayingReplay] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);
  const [camMode, setCamMode] = useState<'free' | 'follow'>('free');
  const [followIndex, setFollowIndex] = useState(0);
  const [camView, setCamView] = useState<CameraView>({
    x: ARENA_WIDTH / 2,
    y: ARENA_HEIGHT / 2,
    zoom: 1,
  });
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const replayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedReplay = replays.find((r) => r.id === selectedReplayId) ?? replays[0] ?? null;

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (activeReplayId) setSelectedReplayId(activeReplayId);
  }, [activeReplayId]);

  useEffect(() => {
    if (tab !== 'replays' || !selectedReplay || !playingReplay) return;
    const id = window.setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + (playbackSpeed >= 2 ? 2 : 1);
        if (next >= selectedReplay.frames.length) {
          setPlayingReplay(false);
          return selectedReplay.frames.length - 1;
        }
        return next;
      });
    }, playbackSpeed === 0.5 ? 66 : 33);
    return () => window.clearInterval(id);
  }, [tab, selectedReplay, playingReplay, playbackSpeed]);

  useEffect(() => {
    if (tab !== 'replays' || !selectedReplay) return;
    const canvas = replayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mapRef = maps.find((m) => m.name === selectedReplay.mapName) ?? BUILTIN_MAPS[0];
    const matchState = createMatchState(
      mapRef,
      {
        mode: selectedReplay.mode,
        advancedPhysics: mapRef.advancedPhysics,
        arcadeModifier: 'none',
        physicsPreset: 'map_default',
        ranked: false,
        stocks: 3,
        timeLimitSec: 120,
        region: profile.region,
      },
      selectedReplay.playerMeta.map((pm) => ({
        id: pm.id,
        name: pm.name,
        isHuman: false,
        aiPolicy: 'brawler',
        team: pm.team,
        loadout: pm.loadout,
      }))
    );

    const frame = selectedReplay.frames[Math.min(frameIndex, selectedReplay.frames.length - 1)];
    if (frame) {
      applyReplayFrame(matchState, frame);
    }

    let effectiveCam = camView;
    if (camMode === 'follow' && matchState.players[followIndex]) {
      const target = matchState.players[followIndex];
      effectiveCam = { x: target.x, y: target.y, zoom: Math.max(1.25, camView.zoom) };
    }

    renderMatchCanvas(ctx, canvas.width, canvas.height, matchState, effectiveCam);
  }, [tab, selectedReplay, frameIndex, camMode, followIndex, camView, maps, profile.region]);

  const handleExportClip = async () => {
    const canvas = replayCanvasRef.current;
    if (!canvas || !selectedReplay) return;

    // Export WebM video if MediaRecorder + captureStream supported, else export JSON replay clip
    if (typeof canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined') {
      setExportNotice('Recording highlight clip...');
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedReplay.id}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setExportNotice('Exported .webm highlight clip!');
      };
      recorder.start();
      setFrameIndex(0);
      setPlayingReplay(true);
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
        setPlayingReplay(false);
      }, Math.min(3500, selectedReplay.frames.length * 34));
    } else {
      const blob = new Blob([JSON.stringify(selectedReplay)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedReplay.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('Exported replay clip JSON.');
    }
  };

  const avgKo =
    profile.matchesPlayed > 0
      ? (profile.totalKnockouts / profile.matchesPlayed).toFixed(1)
      : '0.0';
  const winRate =
    profile.matchesPlayed > 0
      ? Math.round((profile.wins / profile.matchesPlayed) * 100)
      : 0;
  const comebackRate =
    profile.wins > 0 ? Math.round((profile.comebackWins / profile.wins) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 14, 22, 0.84)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Map Studio, Profile and Replays"
    >
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-xl border border-white/12 bg-[#141B29] shadow-2xl overflow-hidden">
        {/* Header + Segmented Tab Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0E131E]">
            {(
              [
                ['editor', 'Map Studio'],
                ['profile', 'Profile & Cosmetics'],
                ['replays', `Replays (${replays.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  tab === id ? 'bg-[#FF4D3D] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Studio"
            className="px-3 py-1.5 rounded-lg bg-[#1F293D] hover:bg-[#2a3752] text-xs font-semibold text-slate-200 cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'editor' && (
            <MapEditor
              initialMap={maps[0] ?? BUILTIN_MAPS[0]}
              onSaveMap={onSaveMap}
              onTestMap={onTestMap}
            />
          )}

          {tab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Identity & Meaningful Career Stats */}
              <div className="lg:col-span-6 space-y-5">
                <div className="rounded-xl bg-[#0E131E] border border-white/10 p-4 space-y-3">
                  <h3 className="text-sm font-bold text-white">Player Identity & Region</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-slate-400">
                      Pilot Handle
                      <input
                        type="text"
                        value={handleInput}
                        onChange={(e) => setHandleInput(e.target.value)}
                        className="bg-[#141B29] border border-white/12 rounded-md px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-400">
                      Matchmaking Region
                      <select
                        value={regionInput}
                        onChange={(e) => setRegionInput(e.target.value)}
                        className="bg-[#141B29] border border-white/12 rounded-md px-3 py-2 text-sm text-white"
                      >
                        <option value="NA-West">NA-West</option>
                        <option value="NA-East">NA-East</option>
                        <option value="EU-Central">EU-Central</option>
                        <option value="AP-East">AP-East</option>
                        <option value="SA-East">SA-East</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs text-slate-300">
                      Rank: <strong className="text-amber-300">{profile.tier}</strong> ·{' '}
                      <span className="font-mono tabular-nums">{profile.mmr} MMR</span> ·{' '}
                      {profile.season}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await onSaveProfile({
                          handle: handleInput.trim() || profile.handle,
                          region: regionInput,
                          loadout,
                        });
                        setProfileNotice('Profile & cosmetics saved.');
                      }}
                      className="px-4 py-2 rounded-lg bg-[#FF4D3D] hover:bg-[#ff6152] text-xs font-bold text-white cursor-pointer"
                    >
                      Save Profile
                    </button>
                  </div>
                  {profileNotice && (
                    <div className="text-xs text-emerald-400">{profileNotice}</div>
                  )}
                </div>

                {/* Meaningful Performance Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-[#0E131E] border border-white/8 p-3">
                    <div className="text-[11px] text-slate-400 uppercase">Matches</div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
                      {profile.matchesPlayed}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#0E131E] border border-white/8 p-3">
                    <div className="text-[11px] text-slate-400 uppercase">Win Rate</div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
                      {winRate}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#0E131E] border border-white/8 p-3">
                    <div className="text-[11px] text-slate-400 uppercase">Avg KO/Game</div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
                      {avgKo}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#0E131E] border border-white/8 p-3">
                    <div className="text-[11px] text-slate-400 uppercase">Comeback %</div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
                      {comebackRate}%
                    </div>
                  </div>
                </div>

                {/* Map-Specific Performance Table */}
                <div className="rounded-xl bg-[#0E131E] border border-white/10 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                    Map-Specific Performance
                  </h4>
                  {Object.keys(profile.mapStats).length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Complete a match to track map win rates and knockouts per arena.
                    </p>
                  ) : (
                    <table className="w-full text-xs text-left">
                      <thead className="text-slate-400 border-b border-white/10">
                        <tr>
                          <th className="py-1.5">Arena</th>
                          <th className="py-1.5 text-right">Played</th>
                          <th className="py-1.5 text-right">Wins</th>
                          <th className="py-1.5 text-right">KOs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono tabular-nums">
                        {Object.entries(profile.mapStats).map(([mapName, st]) => (
                          <tr key={mapName}>
                            <td className="py-1.5 font-sans text-slate-200">{mapName}</td>
                            <td className="py-1.5 text-right text-slate-300">{st.played}</td>
                            <td className="py-1.5 text-right text-emerald-400">{st.wins}</td>
                            <td className="py-1.5 text-right text-amber-300">{st.knockouts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Purely Cosmetic Loadout */}
              <div className="lg:col-span-6 rounded-xl bg-[#0E131E] border border-white/10 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Purely Cosmetic Loadout</h3>
                  <span className="text-xs text-slate-400">Zero gameplay stat impact</span>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-2">Circle Color</div>
                  <div className="flex flex-wrap gap-2.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Color ${c}`}
                        onClick={() => setLoadout((l) => ({ ...l, color: c }))}
                        className={`w-9 h-9 rounded-full border-2 cursor-pointer transition-transform ${
                          loadout.color === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-2">Circle Emblem Skin</div>
                  <div className="grid grid-cols-3 gap-2">
                    {SKINS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setLoadout((l) => ({ ...l, skin: s }))}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold capitalize border cursor-pointer ${
                          loadout.skin === s
                            ? 'bg-[#FF4D3D] border-[#FF4D3D] text-white'
                            : 'bg-[#141B29] border-white/10 text-slate-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1 text-xs text-slate-400">
                    Motion Trail
                    <select
                      value={loadout.trail}
                      onChange={(e) =>
                        setLoadout((l) => ({ ...l, trail: e.target.value as TrailStyle }))
                      }
                      className="bg-[#141B29] border border-white/12 rounded-md px-2.5 py-2 text-xs text-white capitalize"
                    >
                      {TRAILS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-slate-400">
                    Impact FX
                    <select
                      value={loadout.impactFx}
                      onChange={(e) =>
                        setLoadout((l) => ({ ...l, impactFx: e.target.value as ImpactFxStyle }))
                      }
                      className="bg-[#141B29] border border-white/12 rounded-md px-2.5 py-2 text-xs text-white capitalize"
                    >
                      {IMPACTS.map((im) => (
                        <option key={im} value={im}>
                          {im}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-slate-400">
                    KO Burst
                    <select
                      value={loadout.deathFx}
                      onChange={(e) =>
                        setLoadout((l) => ({ ...l, deathFx: e.target.value as DeathFxStyle }))
                      }
                      className="bg-[#141B29] border border-white/12 rounded-md px-2.5 py-2 text-xs text-white capitalize"
                    >
                      {DEATHS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-2">Reactive Callout Emote (Press E)</div>
                  <div className="flex flex-wrap gap-2">
                    {EMOTES.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setLoadout((l) => ({ ...l, emote: em }))}
                        className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold border cursor-pointer ${
                          loadout.emote === em
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-[#141B29] border-white/10 text-slate-300'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'replays' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-4 space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                <h3 className="text-sm font-bold text-white">Recorded Match Replays</h3>
                {replays.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Finish a match to automatically record a replay clip with Free Cam & Follow Cam scrubbing.
                  </p>
                ) : (
                  replays.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedReplayId(r.id);
                        setFrameIndex(0);
                        setPlayingReplay(false);
                      }}
                      className={`w-full text-left p-3 rounded-lg border cursor-pointer ${
                        selectedReplay?.id === r.id
                          ? 'bg-[#1D283E] border-[#FF4D3D]'
                          : 'bg-[#0E131E] border-white/8 hover:border-white/25'
                      }`}
                    >
                      <div className="text-sm font-semibold text-white">{r.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {r.mapName} · {r.mode.toUpperCase()} · Winner: {r.winnerName}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="lg:col-span-8 flex flex-col gap-3">
                {selectedReplay ? (
                  <>
                    <canvas
                      ref={replayCanvasRef}
                      width={800}
                      height={450}
                      className="w-full rounded-xl border border-white/12 bg-[#0E121B]"
                    />

                    {/* Spectator Camera + Timeline Scrub Controls */}
                    <div className="rounded-lg bg-[#0E131E] border border-white/10 p-3.5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPlayingReplay((p) => !p)}
                            className="px-4 py-1.5 rounded-md bg-[#FF4D3D] text-white text-xs font-bold cursor-pointer"
                          >
                            {playingReplay ? 'Pause' : 'Play'}
                          </button>

                          <select
                            aria-label="Playback Speed"
                            value={playbackSpeed}
                            onChange={(e) =>
                              setPlaybackSpeed(Number(e.target.value) as 0.5 | 1 | 2)
                            }
                            className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-xs text-white font-mono"
                          >
                            <option value={0.5}>0.5x</option>
                            <option value={1}>1.0x</option>
                            <option value={2}>2.0x</option>
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              setCamMode((m) => (m === 'free' ? 'follow' : 'free'))
                            }
                            className="px-3 py-1.5 rounded-md bg-[#1F293D] text-xs font-semibold text-cyan-200 cursor-pointer"
                          >
                            Cam: {camMode === 'free' ? 'Free Cam' : 'Follow Player'}
                          </button>

                          {camMode === 'follow' && (
                            <select
                              aria-label="Follow Player"
                              value={followIndex}
                              onChange={(e) => setFollowIndex(Number(e.target.value))}
                              className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-xs text-white"
                            >
                              {selectedReplay.playerMeta.map((pm, idx) => (
                                <option key={pm.id} value={idx}>
                                  {pm.name}
                                </option>
                              ))}
                            </select>
                          )}

                          {camMode === 'free' && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setCamView((c) => ({ ...c, zoom: Math.min(2, c.zoom + 0.2) }))
                                }
                                className="px-2 py-1 rounded bg-[#141B29] text-xs text-slate-200 cursor-pointer"
                              >
                                Zoom +
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setCamView({ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, zoom: 1 })
                                }
                                className="px-2 py-1 rounded bg-[#141B29] text-xs text-slate-200 cursor-pointer"
                              >
                                Reset
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={handleExportClip}
                          className="px-3.5 py-1.5 rounded-md bg-[#1F293D] hover:bg-[#2a3752] text-xs font-semibold text-amber-300 border border-amber-400/25 cursor-pointer"
                        >
                          Export Clip
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          aria-label="Replay Timeline Scrubber"
                          min={0}
                          max={Math.max(0, selectedReplay.frames.length - 1)}
                          value={frameIndex}
                          onChange={(e) => {
                            setPlayingReplay(false);
                            setFrameIndex(Number(e.target.value));
                          }}
                          className="flex-1 accent-[#FF4D3D]"
                        />
                        <span className="text-xs font-mono tabular-nums text-slate-400 w-20 text-right">
                          {frameIndex + 1}/{selectedReplay.frames.length}
                        </span>
                      </div>
                      {exportNotice && (
                        <div className="text-xs text-emerald-400">{exportNotice}</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-64 rounded-xl border border-dashed border-white/15 flex items-center justify-center text-sm text-slate-500">
                    Select or record a match replay to scrub frames and export clips.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
