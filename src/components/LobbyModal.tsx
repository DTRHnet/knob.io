import React, { useEffect, useState } from 'react';
import {
  ArcadeModifier,
  ArenaMap,
  GameMode,
  LobbyRoomSummary,
  PhysicsPresetId,
  PlayerProfile,
} from '../game/types';
import { generateProceduralMap } from '../game/maps';

interface LobbyModalProps {
  profile: PlayerProfile;
  maps: ArenaMap[];
  selectedMapId: string;
  selectedMode: GameMode;
  advancedPhysics: boolean;
  physicsPreset: PhysicsPresetId;
  rankedQueue: boolean;
  arcadeModifier: ArcadeModifier;
  activeRoom: LobbyRoomSummary | null;
  wsConnected: boolean;
  onSelectMap: (map: ArenaMap) => void;
  onSelectMode: (mode: GameMode) => void;
  onToggleAdvancedPhysics: (val: boolean) => void;
  onSelectPhysicsPreset: (preset: PhysicsPresetId) => void;
  onToggleRanked: (val: boolean) => void;
  onSelectArcadeModifier: (mod: ArcadeModifier) => void;
  onCreateLobby: (opts: { isPrivate: boolean; name: string }) => Promise<void>;
  onJoinLobby: (code: string) => void;
  onMatchmake: () => Promise<void>;
  onSendChat: (text: string) => void;
  onKickPlayer: (playerId: string) => void;
  onReportPlayer: (target: string) => Promise<void>;
  onLaunchMatch: () => void;
  onClose: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({
  profile,
  maps,
  selectedMapId,
  selectedMode,
  advancedPhysics,
  physicsPreset,
  rankedQueue,
  arcadeModifier,
  activeRoom,
  wsConnected,
  onSelectMap,
  onSelectMode,
  onToggleAdvancedPhysics,
  onSelectPhysicsPreset,
  onToggleRanked,
  onSelectArcadeModifier,
  onCreateLobby,
  onJoinLobby,
  onMatchmake,
  onSendChat,
  onKickPlayer,
  onReportPlayer,
  onLaunchMatch,
  onClose,
}) => {
  const [publicLobbies, setPublicLobbies] = useState<LobbyRoomSummary[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState(`${profile.handle}'s Arena`);
  const [chatText, setChatText] = useState('');
  const [customSeed, setCustomSeed] = useState('KINETIC-2026');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [poolFilter, setPoolFilter] = useState<'all' | 'ranked' | 'featured' | 'community'>('all');

  useEffect(() => {
    fetch('/api/lobbies')
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setPublicLobbies(list);
      })
      .catch(() => {});
  }, [activeRoom]);

  const filteredMaps = maps.filter((m) => {
    if (poolFilter === 'ranked') return m.pool === 'ranked';
    if (poolFilter === 'featured') return m.pool === 'daily' || m.pool === 'weekly';
    if (poolFilter === 'community') return m.pool === 'community';
    return true;
  });

  const handleCopyInvite = () => {
    if (!activeRoom) return;
    navigator.clipboard?.writeText(activeRoom.code).catch(() => {});
    setStatusNotice(`Copied invite code ${activeRoom.code}`);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 14, 22, 0.82)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Lobbies, Matchmaking and Modes"
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl border border-white/12 bg-[#141B29] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Lobbies, Modes & Matchmaking
            </h2>
            <p className="text-xs text-slate-400">
              {profile.region} · {profile.tier} ({profile.mmr} MMR) ·{' '}
              {wsConnected ? 'Live Room Socket Connected' : 'Local / Bot Ready'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Lobbies"
            className="px-3 py-1.5 rounded-lg bg-[#1F293D] hover:bg-[#2a3752] text-xs font-semibold text-slate-200 cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Scrollable Two-Column Workspace */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Modes, Physics Toggle & Map Rotation */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Queue & Mode Controls */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-200">Game Mode & Ruleset</h3>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0E131E]">
                  <button
                    type="button"
                    onClick={() => onToggleRanked(false)}
                    className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                      !rankedQueue ? 'bg-[#253047] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Unranked Chaos
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleRanked(true)}
                    className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                      rankedQueue ? 'bg-[#FF4D3D] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Ranked Ladder
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(
                  [
                    ['classic', 'Classic KO'],
                    ['survival', 'Survival'],
                    ['koth', 'King of Hill'],
                    ['ctf', 'Capture Core'],
                    ['arcade', 'Arcade'],
                  ] as const
                ).map(([mId, mLabel]) => (
                  <button
                    key={mId}
                    type="button"
                    onClick={() => onSelectMode(mId)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      selectedMode === mId
                        ? 'bg-[#FF4D3D] border-[#FF4D3D] text-white'
                        : 'bg-[#0E131E] border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {mLabel}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#0E131E] border border-white/8 px-3.5 py-2.5">
                <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedPhysics}
                    onChange={(e) => onToggleAdvancedPhysics(e.target.checked)}
                    className="accent-[#FF4D3D] w-4 h-4"
                  />
                  <span>
                    <strong className="font-semibold">Advanced Physics</strong> — Rotating joints,
                    chain-reaction mines & terrain triggers
                  </span>
                </label>

                {selectedMode === 'arcade' && (
                  <select
                    aria-label="Arcade Modifier"
                    value={arcadeModifier}
                    onChange={(e) => onSelectArcadeModifier(e.target.value as ArcadeModifier)}
                    className="bg-[#1B2335] border border-white/15 rounded-md px-2.5 py-1 text-xs text-slate-100"
                  >
                    <option value="low_g">Modifier: Low Gravity</option>
                    <option value="bumper_chaos">Modifier: Bumper Mania</option>
                    <option value="heavy_clash">Modifier: Heavy Clash</option>
                    <option value="hyper_bounce">Modifier: Hyper Bounce</option>
                  </select>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0E131E] border border-white/8 px-3.5 py-2">
                <span className="text-xs font-semibold text-slate-300">Physics Preset</span>
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      ['map_default', 'Map Default'],
                      ['standard', 'Standard'],
                      ['moon', 'Moon'],
                      ['bouncy', 'Bouncy'],
                      ['heavy', 'Heavy'],
                      ['high_momentum', 'Hyper'],
                    ] as const
                  ).map(([pId, pLabel]) => (
                    <button
                      key={pId}
                      type="button"
                      onClick={() => onSelectPhysicsPreset(pId)}
                      className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer whitespace-nowrap ${
                        physicsPreset === pId
                          ? 'bg-[#FF4D3D] text-white'
                          : 'bg-[#141B29] text-slate-400 hover:text-white'
                      }`}
                    >
                      {pLabel}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Map Pool Selector + Procedural Hybrid Seed */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <h3 className="text-sm font-semibold text-slate-200">Arena Pool</h3>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0E131E]">
                  {(
                    [
                      ['all', 'All'],
                      ['ranked', 'Ranked'],
                      ['featured', 'Daily & Weekly'],
                      ['community', 'Custom'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPoolFilter(id)}
                      className={`px-2.5 py-1 text-xs rounded-md font-medium cursor-pointer ${
                        poolFilter === id ? 'bg-[#253047] text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {filteredMaps.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectMap(m)}
                    className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      selectedMapId === m.id
                        ? 'bg-[#1D283E] border-[#FF4D3D]'
                        : 'bg-[#0E131E] border-white/8 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-white truncate">{m.name}</span>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        v{m.version}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400 truncate">
                      {m.pool} · {m.recommendedMode.toUpperCase()} ·{' '}
                      {m.platforms.length} surfaces
                    </div>
                  </button>
                ))}
              </div>

              {/* Procedural Seed Generator */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  aria-label="Procedural Seed"
                  value={customSeed}
                  onChange={(e) => setCustomSeed(e.target.value)}
                  placeholder="Enter procedural map seed..."
                  className="flex-1 bg-[#0E131E] border border-white/12 rounded-lg px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const proc = generateProceduralMap(
                      customSeed || 'KNOB',
                      'community',
                      selectedMode,
                      advancedPhysics
                    );
                    onSelectMap(proc);
                    setStatusNotice(`Generated procedural arena from seed "${proc.id}"`);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-[#1F293D] hover:bg-[#2a3752] text-xs font-semibold text-cyan-200 border border-cyan-400/25 cursor-pointer whitespace-nowrap"
                >
                  Generate Hybrid Seed
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Matchmaking, Private Lobbies & Moderated Room Chat */}
          <div className="lg:col-span-5 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l border-white/10 pt-4 lg:pt-0 lg:pl-6">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={async () => {
                  await onMatchmake();
                  setStatusNotice(`Matched in ${profile.region} (${profile.tier} queue)`);
                }}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#FF4D3D] hover:bg-[#ff6152] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Find Skill + Region Match
              </button>
            </div>

            {statusNotice && (
              <div className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-500/30 rounded-lg px-3 py-2">
                {statusNotice}
              </div>
            )}

            {/* Create or Join Private Room */}
            <div className="rounded-lg bg-[#0E131E] border border-white/8 p-3.5 flex flex-col gap-2.5">
              <div className="text-xs font-semibold text-slate-200">Private & Public Rooms</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="New Room Name"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="flex-1 bg-[#141B29] border border-white/12 rounded-md px-2.5 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => onCreateLobby({ isPrivate: true, name: roomName })}
                  className="px-3 py-1.5 rounded-md bg-[#1F293D] hover:bg-[#2a3752] text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                >
                  Create Private
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Room Code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Room code (e.g. KNOB-1042)"
                  className="flex-1 bg-[#141B29] border border-white/12 rounded-md px-2.5 py-1.5 text-xs text-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (joinCode.trim()) onJoinLobby(joinCode.trim());
                  }}
                  className="px-3 py-1.5 rounded-md bg-[#1F293D] hover:bg-[#2a3752] text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
                >
                  Join Code
                </button>
              </div>
            </div>

            {/* Active Room Panel OR Public Browser */}
            {activeRoom ? (
              <div className="flex-1 flex flex-col rounded-lg bg-[#0E131E] border border-white/10 p-3.5 gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-white">{activeRoom.name}</div>
                    <div className="text-xs font-mono text-amber-300">
                      {activeRoom.code} · {activeRoom.region} · {activeRoom.skillRange}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="px-2.5 py-1 rounded bg-[#1F293D] hover:bg-[#2a3752] text-[11px] font-semibold text-slate-200 cursor-pointer"
                  >
                    Copy Code
                  </button>
                </div>

                {/* Roster with Anti-Toxicity Moderation Controls */}
                <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto">
                  {activeRoom.players.map((rp) => (
                    <div
                      key={rp.id}
                      className="flex items-center justify-between text-xs px-2 py-1 rounded bg-[#141B29]"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: rp.color }}
                        />
                        <span className="text-slate-100 font-medium">{rp.name}</span>
                      </div>
                      {rp.name !== profile.handle && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onReportPlayer(rp.name)}
                            className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                          >
                            Report
                          </button>
                          <button
                            type="button"
                            onClick={() => onKickPlayer(rp.id)}
                            className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                          >
                            Kick
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Moderated Room Chat */}
                <div className="flex-1 min-h-24 max-h-32 overflow-y-auto rounded bg-[#141B29] p-2 text-xs space-y-1">
                  {activeRoom.chat.map((c) => (
                    <div key={c.id} className="text-slate-300">
                      <span className="text-slate-500 font-mono mr-1.5">{c.time}</span>
                      <strong className="text-white mr-1">{c.sender}:</strong>
                      <span>{c.text}</span>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatText.trim()) return;
                    onSendChat(chatText);
                    setChatText('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    aria-label="Room Chat Message"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Chat (auto-moderated)..."
                    className="flex-1 bg-[#141B29] border border-white/12 rounded-md px-2.5 py-1.5 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-md bg-[#1F293D] text-xs font-semibold text-white cursor-pointer"
                  >
                    Send
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-2">
                <div className="text-xs font-semibold text-slate-300">Open Regional Lobbies</div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {publicLobbies.map((l) => (
                    <div
                      key={l.code}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0E131E] border border-white/8"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{l.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {l.region} · {l.mode.toUpperCase()} · {l.playerCount}/{l.maxPlayers}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onJoinLobby(l.code)}
                        className="px-3 py-1.5 rounded bg-[#1F293D] hover:bg-[#2a3752] text-xs font-semibold text-white cursor-pointer shrink-0"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Launch CTA */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/10 bg-[#0E131E]">
          <div className="text-xs text-slate-400">
            Bot backfill ensures instant start even in solo/private practice
          </div>
          <button
            type="button"
            data-start="true"
            onClick={onLaunchMatch}
            className="px-6 py-2.5 rounded-lg bg-[#FF4D3D] hover:bg-[#ff6152] text-white font-bold text-sm cursor-pointer whitespace-nowrap"
          >
            Launch Match
          </button>
        </div>
      </div>
    </div>
  );
};
