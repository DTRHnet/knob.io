import React from 'react';
import { GameMode, RankTier } from '../game/types';

export interface MatchResultSummary {
  won: boolean;
  winnerName: string;
  reason: string;
  mode: GameMode;
  mapName: string;
  knockouts: number;
  damageDealt: number;
  mmrDelta: number;
  newMmr: number;
  newTier: RankTier;
  ranked: boolean;
  hasReplay: boolean;
}

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenLobbies: () => void;
  onExitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onOpenLobbies,
  onExitToTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 14, 22, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Game Paused"
    >
      <div className="w-full max-w-sm rounded-xl border border-white/12 bg-[#141B29] p-6 shadow-2xl">
        <h2
          className="text-2xl font-bold text-white tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Match Paused
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Simulation halted · Press Esc or P to resume
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 px-4 rounded-lg bg-[#FF4D3D] hover:bg-[#ff6152] text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Resume Match
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-lg bg-[#1F293D] hover:bg-[#29364f] text-slate-100 font-semibold text-sm border border-white/10 transition-colors cursor-pointer"
          >
            Restart Arena
          </button>
          <button
            type="button"
            onClick={onOpenLobbies}
            className="w-full py-2.5 px-4 rounded-lg bg-[#1F293D] hover:bg-[#29364f] text-slate-100 font-semibold text-sm border border-white/10 transition-colors cursor-pointer"
          >
            Switch Mode / Lobby
          </button>
          <button
            type="button"
            onClick={onExitToTitle}
            className="w-full py-2.5 px-4 rounded-lg bg-transparent hover:bg-white/5 text-slate-300 font-medium text-sm transition-colors cursor-pointer"
          >
            Back to Title
          </button>
        </div>
      </div>
    </div>
  );
};

interface OutcomeModalProps {
  result: MatchResultSummary;
  onPlayAgain: () => void;
  onWatchReplay: () => void;
  onExitToTitle: () => void;
}

export const OutcomeModal: React.FC<OutcomeModalProps> = ({
  result,
  onPlayAgain,
  onWatchReplay,
  onExitToTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 14, 22, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-label={result.won ? 'Victory' : 'Match Complete'}
    >
      <div className="w-full max-w-md rounded-xl border border-white/12 bg-[#141B29] p-6 shadow-2xl">
        <div className="text-xs font-medium text-slate-400">
          {result.mapName} · {result.reason}
        </div>
        <h2
          className="mt-1 text-3xl font-extrabold tracking-tight text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {result.won ? 'Victory!' : `${result.winnerName} Wins`}
        </h2>

        {/* 3 Mastery Stat Tiles */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[#0E131E] border border-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Knockouts</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
              {result.knockouts}
            </div>
          </div>
          <div className="rounded-lg bg-[#0E131E] border border-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Impact</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
              {result.damageDealt}
            </div>
          </div>
          <div className="rounded-lg bg-[#0E131E] border border-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              {result.ranked ? 'MMR' : 'Tier'}
            </div>
            <div
              className={`mt-1 text-xl font-bold font-mono tabular-nums ${
                result.mmrDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {result.ranked
                ? `${result.mmrDelta >= 0 ? '+' : ''}${result.mmrDelta}`
                : result.newTier}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="w-full py-3 px-4 rounded-lg bg-[#FF4D3D] hover:bg-[#ff6152] text-white font-bold text-sm transition-colors cursor-pointer"
          >
            Play Again
          </button>
          {result.hasReplay && (
            <button
              type="button"
              onClick={onWatchReplay}
              className="w-full py-2.5 px-4 rounded-lg bg-[#1F293D] hover:bg-[#29364f] text-cyan-200 font-semibold text-sm border border-cyan-400/30 transition-colors cursor-pointer"
            >
              Watch Replay & Export Clip
            </button>
          )}
          <button
            type="button"
            onClick={onExitToTitle}
            className="w-full py-2.5 px-4 rounded-lg bg-transparent hover:bg-white/5 text-slate-300 font-medium text-sm transition-colors cursor-pointer"
          >
            Back to Title
          </button>
        </div>
      </div>
    </div>
  );
};
