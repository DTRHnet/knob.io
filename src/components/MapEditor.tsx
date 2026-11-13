import React, { useEffect, useRef, useState } from 'react';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../game/maps';
import { createMatchState } from '../game/physics';
import { renderMatchCanvas } from '../game/renderer';
import {
  ArenaMap,
  DEFAULT_PHYSICS_CVARS,
  MapLayerVisibility,
  MapPlatform,
  MapTrigger,
  MapZone,
  PHYSICS_PRESETS,
  PhysicsCVars,
  SurfaceMaterial,
} from '../game/types';

interface MapEditorProps {
  initialMap: ArenaMap;
  onSaveMap: (map: ArenaMap) => Promise<void>;
  onTestMap: (map: ArenaMap) => void;
}

type ToolMode = 'select' | 'platform' | 'zone' | 'bumper' | 'joint';

const MATERIALS: SurfaceMaterial[] = [
  'standard',
  'ice',
  'bouncy',
  'super_bounce',
  'sticky',
  'boost',
  'conveyor',
  'breakable',
  'soft',
];

function bumpPatchVersion(ver: string): string {
  const parts = ver.split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export const MapEditor: React.FC<MapEditorProps> = ({
  initialMap,
  onSaveMap,
  onTestMap,
}) => {
  const [draft, setDraft] = useState<ArenaMap>(() => JSON.parse(JSON.stringify(initialMap)));
  const [tool, setTool] = useState<ToolMode>('select');
  const [newMaterial, setNewMaterial] = useState<SurfaceMaterial>('bouncy');
  const [selectedPlatId, setSelectedPlatId] = useState<string | null>(
    initialMap.platforms[0]?.id ?? null
  );
  const [layers, setLayers] = useState<MapLayerVisibility>({
    background: true,
    zones: true,
    platforms: true,
    hazards: true,
    spawns: true,
  });
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedPlat = draft.platforms.find((p) => p.id === selectedPlatId) ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewMap: ArenaMap = {
      ...draft,
      platforms: layers.platforms ? draft.platforms : [],
      zones: layers.zones ? draft.zones : [],
      bumpers: layers.hazards ? draft.bumpers : [],
      joints: layers.hazards ? draft.joints : [],
    };
    const previewState = createMatchState(
      previewMap,
      {
        mode: draft.recommendedMode,
        advancedPhysics: draft.advancedPhysics,
        arcadeModifier: 'none',
        physicsPreset: 'map_default',
        ranked: false,
        stocks: 3,
        timeLimitSec: 120,
        region: 'NA-West',
      },
      []
    );
    renderMatchCanvas(ctx, canvas.width, canvas.height, previewState);

    // Highlight selected platform and spawn points
    const scale = Math.min(canvas.width / ARENA_WIDTH, canvas.height / ARENA_HEIGHT);
    const ox = (canvas.width - ARENA_WIDTH * scale) * 0.5;
    const oy = (canvas.height - ARENA_HEIGHT * scale) * 0.5;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    if (selectedPlat && layers.platforms) {
      ctx.strokeStyle = '#FF4D3D';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        selectedPlat.x - selectedPlat.w / 2 - 4,
        selectedPlat.y - selectedPlat.h / 2 - 4,
        selectedPlat.w + 8,
        selectedPlat.h + 8
      );
    }

    if (layers.spawns) {
      for (const sp of draft.spawns) {
        ctx.fillStyle = sp.team === 2 ? '#06B6D4' : '#F59E0B';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }, [draft, layers, selectedPlat]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const scale = Math.min(canvas.width / ARENA_WIDTH, canvas.height / ARENA_HEIGHT);
    const ax = Math.round((px - (canvas.width - ARENA_WIDTH * scale) * 0.5) / scale);
    const ay = Math.round((py - (canvas.height - ARENA_HEIGHT * scale) * 0.5) / scale);

    if (tool === 'select') {
      const hit = draft.platforms.find(
        (p) => Math.abs(ax - p.x) <= p.w * 0.5 + 10 && Math.abs(ay - p.y) <= p.h * 0.5 + 12
      );
      setSelectedPlatId(hit?.id ?? null);
    } else if (tool === 'platform') {
      const newPlat: MapPlatform = {
        id: `ed-p-${Date.now()}`,
        x: ax,
        y: ay,
        w: 190,
        h: 24,
        angle: 0,
        material: newMaterial,
        conveyorSpeed: newMaterial === 'conveyor' ? 210 : undefined,
        bounciness:
          newMaterial === 'bouncy'
            ? 1.18
            : newMaterial === 'super_bounce'
            ? 1.25
            : undefined,
        friction: newMaterial === 'ice' ? 0.02 : undefined,
        boostImpulse: newMaterial === 'boost' ? 320 : undefined,
        breakableHp: newMaterial === 'breakable' ? 85 : undefined,
        active: true,
        tag: `plat-${draft.platforms.length + 1}`,
      };
      setDraft((prev) => ({ ...prev, platforms: [...prev.platforms, newPlat] }));
      setSelectedPlatId(newPlat.id);
      setTool('select');
    } else if (tool === 'zone') {
      const newZone: MapZone = {
        id: `ed-z-${Date.now()}`,
        type: 'wind',
        x: ax,
        y: ay,
        w: 150,
        h: 180,
        fx: 0,
        fy: -720,
        strength: 1,
        active: true,
        tag: `zone-${draft.zones.length + 1}`,
      };
      setDraft((prev) => ({ ...prev, zones: [...prev.zones, newZone] }));
      setTool('select');
    } else if (tool === 'bumper') {
      setDraft((prev) => ({
        ...prev,
        bumpers: [
          ...prev.bumpers,
          {
            id: `ed-b-${Date.now()}`,
            x: ax,
            y: ay,
            radius: 22,
            impulse: 720,
            explosive: prev.advancedPhysics,
            cooldown: prev.advancedPhysics ? 3.0 : 0.4,
          },
        ],
      }));
      setTool('select');
    } else if (tool === 'joint') {
      setDraft((prev) => ({
        ...prev,
        advancedPhysics: true,
        joints: [
          ...prev.joints,
          {
            id: `ed-j-${Date.now()}`,
            x: ax,
            y: ay,
            length: 135,
            thickness: 18,
            angularSpeed: 1.5,
            angle: 0,
            material: 'standard',
          },
        ],
      }));
      setTool('select');
    }
  };

  const updateSelectedPlat = (patch: Partial<MapPlatform>) => {
    if (!selectedPlatId) return;
    setDraft((prev) => ({
      ...prev,
      platforms: prev.platforms.map((p) => (p.id === selectedPlatId ? { ...p, ...patch } : p)),
    }));
  };

  const addVisualScriptTrigger = () => {
    const firstZone = draft.zones[0]?.tag || draft.zones[0]?.id || 'zone-1';
    const firstPlat = draft.platforms[0]?.tag || draft.platforms[0]?.id || 'plat-1';
    const trig: MapTrigger = {
      id: `trig-${Date.now()}`,
      name: `Trigger #${draft.triggers.length + 1}`,
      event: 'enter_zone',
      sourceTag: firstZone,
      action: 'toggle_platform',
      targetTag: firstPlat,
      cooldownSec: 2.5,
    };
    setDraft((prev) => ({ ...prev, triggers: [...prev.triggers, trig] }));
  };

  const handleSave = async () => {
    const versioned: ArenaMap = {
      ...draft,
      id: draft.id.startsWith('custom-') ? draft.id : `custom-${Date.now()}`,
      pool: 'community',
      version: bumpPatchVersion(draft.version),
    };
    setDraft(versioned);
    await onSaveMap(versioned);
    setSaveStatus(`Saved ${versioned.name} v${versioned.version} to library`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left: Canvas + Layer & Tool Bar */}
      <div className="lg:col-span-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0E131E] border border-white/10 rounded-lg p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['select', 'Select'],
                ['platform', '+ Platform'],
                ['zone', '+ Force Zone'],
                ['bumper', '+ Bumper'],
                ['joint', '+ Joint'],
              ] as const
            ).map(([tId, tLabel]) => (
              <button
                key={tId}
                type="button"
                onClick={() => setTool(tId)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  tool === tId
                    ? 'bg-[#FF4D3D] text-white'
                    : 'bg-[#1A2233] text-slate-300 hover:text-white'
                }`}
              >
                {tLabel}
              </button>
            ))}

            {tool === 'platform' && (
              <select
                aria-label="New Platform Material"
                value={newMaterial}
                onChange={(e) => setNewMaterial(e.target.value as SurfaceMaterial)}
                className="bg-[#1A2233] border border-white/15 rounded-md px-2 py-1.5 text-xs text-white"
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    Material: {m}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-300">
            {(['platforms', 'zones', 'hazards', 'spawns'] as const).map((lk) => (
              <label key={lk} className="flex items-center gap-1 cursor-pointer capitalize">
                <input
                  type="checkbox"
                  checked={layers[lk]}
                  onChange={(e) => setLayers((prev) => ({ ...prev, [lk]: e.target.checked }))}
                  className="accent-[#FF4D3D]"
                />
                {lk}
              </label>
            ))}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          onClick={handleCanvasClick}
          className="w-full rounded-xl border border-white/12 bg-[#0E121B] cursor-crosshair"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>Click canvas to place selected element or click any platform to edit properties.</span>
          {saveStatus && <span className="text-emerald-400 font-medium">{saveStatus}</span>}
        </div>
      </div>

      {/* Right: Inspector, Visual Scripting Triggers, Versioning */}
      <div className="lg:col-span-4 flex flex-col gap-4 max-h-[64vh] overflow-y-auto pr-1">
        {/* Map Metadata & Versioning */}
        <div className="rounded-lg bg-[#0E131E] border border-white/10 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Map Version & Info
            </h4>
            <span className="text-xs font-mono text-amber-300">v{draft.version}</span>
          </div>
          <input
            type="text"
            aria-label="Map Name"
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            className="w-full bg-[#141B29] border border-white/12 rounded-md px-2.5 py-1.5 text-xs text-white"
          />
          <input
            type="text"
            aria-label="Version Changelog"
            value={draft.changelog}
            onChange={(e) => setDraft((p) => ({ ...p, changelog: e.target.value }))}
            placeholder="Changelog note..."
            className="w-full bg-[#141B29] border border-white/12 rounded-md px-2.5 py-1.5 text-xs text-slate-300"
          />
          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.advancedPhysics}
              onChange={(e) => setDraft((p) => ({ ...p, advancedPhysics: e.target.checked }))}
              className="accent-[#FF4D3D]"
            />
            Recommend Advanced Physics
          </label>
        </div>

        {/* Physics CVars & Momentum Presets */}
        <div className="rounded-lg bg-[#0E131E] border border-white/10 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Physics CVars
            </h4>
            <div className="flex flex-wrap items-center gap-1">
              {(['standard', 'moon', 'bouncy', 'heavy', 'high_momentum'] as const).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      physicsOverrides: {
                        ...DEFAULT_PHYSICS_CVARS,
                        ...PHYSICS_PRESETS[pid],
                      },
                    }))
                  }
                  className="px-2 py-0.5 rounded bg-[#1A2233] hover:bg-[#253047] text-[10px] font-semibold text-cyan-200 cursor-pointer whitespace-nowrap"
                >
                  {pid === 'standard'
                    ? 'Std'
                    : pid === 'moon'
                    ? 'Moon'
                    : pid === 'bouncy'
                    ? 'Bouncy'
                    : pid === 'heavy'
                    ? 'Heavy'
                    : 'Hyper'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {(
              [
                ['sv_gravity', 'Gravity', 100, 2000, 20],
                ['sv_air_gravity_mult', 'Air Grav x', 0.4, 2.5, 0.05],
                ['sv_jump_impulse', 'Jump Imp', 120, 900, 10],
                ['sv_air_jumps', 'Air Jumps', 0, 3, 1],
                ['sv_bounce', 'Bounce (e)', 0, 1.5, 0.05],
                ['sv_bounce_weight_gain', 'Bounce Wt+', 0, 0.5, 0.02],
                ['sv_bounce_accel_gain', 'Bounce Acc+', 0, 0.5, 0.02],
                ['sv_fastfall_multiplier', 'Fast-Fall x', 1, 4, 0.1],
                ['sv_air_control', 'Air Control', 0.1, 1.5, 0.05],
                ['sv_linear_damping', 'Damping', 0, 1, 0.02],
                ['sv_heavy_mass_mult', 'Heavy Mass', 1, 4, 0.1],
                ['sv_heavy_accel_mult', 'Heavy Accel', 0.1, 1.2, 0.05],
                ['sv_max_speed', 'Max Speed', 150, 1400, 20],
                ['sv_knob_spin_speed', 'Knob Spin', 2, 24, 0.5],
                ['sv_knob_hit_mult', 'Knob Power', 1, 2.5, 0.05],
                ['sv_jump_buffer', 'Jump Buf ms', 0, 300, 10],
                ['sv_coyote_time', 'Coyote ms', 0, 300, 10],
              ] as Array<[keyof PhysicsCVars, string, number, number, number]>
            ).map(([key, label, min, max, step]) => {
              const val = draft.physicsOverrides?.[key] ?? DEFAULT_PHYSICS_CVARS[key];
              return (
                <label key={key} className="flex flex-col gap-0.5 text-slate-400">
                  {label}
                  <input
                    type="number"
                    aria-label={label}
                    value={val}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      if (Number.isNaN(num)) return;
                      setDraft((p) => ({
                        ...p,
                        physicsOverrides: {
                          ...p.physicsOverrides,
                          [key]: num,
                        },
                      }));
                    }}
                    className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-white font-mono"
                  />
                </label>
              );
            })}
          </div>
        </div>

        {/* Selected Platform Inspector */}
        {selectedPlat && (
          <div className="rounded-lg bg-[#0E131E] border border-white/10 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Selected Surface
              </h4>
              <button
                type="button"
                onClick={() => {
                  setDraft((p) => ({
                    ...p,
                    platforms: p.platforms.filter((pl) => pl.id !== selectedPlat.id),
                  }));
                  setSelectedPlatId(null);
                }}
                className="text-xs text-rose-400 hover:underline cursor-pointer"
              >
                Delete
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex flex-col gap-1 text-slate-400">
                Material
                <select
                  value={selectedPlat.material}
                  onChange={(e) =>
                    updateSelectedPlat({ material: e.target.value as SurfaceMaterial })
                  }
                  className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-white"
                >
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-slate-400">
                Width
                <input
                  type="number"
                  value={selectedPlat.w}
                  min={40}
                  max={900}
                  onChange={(e) => updateSelectedPlat({ w: Number(e.target.value) || 120 })}
                  className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1 text-slate-400">
                Tilt (deg)
                <input
                  type="number"
                  value={Math.round((selectedPlat.angle * 180) / Math.PI)}
                  min={-60}
                  max={60}
                  onChange={(e) =>
                    updateSelectedPlat({ angle: ((Number(e.target.value) || 0) * Math.PI) / 180 })
                  }
                  className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1 text-slate-400">
                Tag (for Triggers)
                <input
                  type="text"
                  value={selectedPlat.tag || ''}
                  onChange={(e) => updateSelectedPlat({ tag: e.target.value })}
                  className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1 text-slate-400">
                Bounciness
                <input
                  type="number"
                  aria-label="Surface Bounciness"
                  step={0.05}
                  min={0}
                  max={2}
                  placeholder="Auto"
                  value={selectedPlat.bounciness ?? ''}
                  onChange={(e) =>
                    updateSelectedPlat({
                      bounciness: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1 text-slate-400">
                Friction
                <input
                  type="number"
                  aria-label="Surface Friction"
                  step={0.02}
                  min={0}
                  max={1.5}
                  placeholder="Auto"
                  value={selectedPlat.friction ?? ''}
                  onChange={(e) =>
                    updateSelectedPlat({
                      friction: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-white font-mono"
                />
              </label>

              {selectedPlat.material === 'boost' && (
                <label className="flex flex-col gap-1 text-slate-400 col-span-2">
                  Boost Impulse (px/s)
                  <input
                    type="number"
                    aria-label="Boost Impulse"
                    step={20}
                    min={-1200}
                    max={1200}
                    value={selectedPlat.boostImpulse ?? 560}
                    onChange={(e) =>
                      updateSelectedPlat({ boostImpulse: Number(e.target.value) || 560 })
                    }
                    className="bg-[#141B29] border border-white/12 rounded px-2 py-1 text-white font-mono"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Visual Scripting Hooks / Triggers */}
        <div className="rounded-lg bg-[#0E131E] border border-white/10 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Visual Script Triggers ({draft.triggers.length})
            </h4>
            <button
              type="button"
              onClick={addVisualScriptTrigger}
              className="px-2.5 py-1 rounded bg-[#1F293D] hover:bg-[#2a3752] text-[11px] font-semibold text-cyan-200 cursor-pointer"
            >
              + Add Trigger
            </button>
          </div>
          {draft.triggers.length === 0 ? (
            <p className="text-xs text-slate-500">
              No scripting hooks yet. Add a trigger to toggle bridges or pulse gravity on events.
            </p>
          ) : (
            <div className="space-y-2">
              {draft.triggers.map((tr) => (
                <div key={tr.id} className="p-2 rounded bg-[#141B29] text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{tr.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((p) => ({
                          ...p,
                          triggers: p.triggers.filter((x) => x.id !== tr.id),
                        }))
                      }
                      className="text-rose-400 text-[11px] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      aria-label="Trigger Event"
                      value={tr.event}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          triggers: p.triggers.map((x) =>
                            x.id === tr.id
                              ? { ...x, event: e.target.value as MapTrigger['event'] }
                              : x
                          ),
                        }))
                      }
                      className="bg-[#0E131E] border border-white/10 rounded px-1.5 py-1 text-slate-200"
                    >
                      <option value="enter_zone">When Enter Zone</option>
                      <option value="timer">On Timer Loop</option>
                      <option value="on_break">When Surface Breaks</option>
                    </select>
                    <select
                      aria-label="Trigger Action"
                      value={tr.action}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          triggers: p.triggers.map((x) =>
                            x.id === tr.id
                              ? { ...x, action: e.target.value as MapTrigger['action'] }
                              : x
                          ),
                        }))
                      }
                      className="bg-[#0E131E] border border-white/10 rounded px-1.5 py-1 text-slate-200"
                    >
                      <option value="toggle_platform">Toggle Platform</option>
                      <option value="reverse_wind">Reverse Wind</option>
                      <option value="pulse_gravity">Invert Gravity</option>
                      <option value="detonate_bumpers">Pulse Bumpers</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save & Test Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 px-4 rounded-lg bg-[#1F293D] hover:bg-[#2a3752] text-white font-semibold text-xs border border-white/15 cursor-pointer whitespace-nowrap"
          >
            Save & Bump Version
          </button>
          <button
            type="button"
            onClick={() => onTestMap(draft)}
            className="flex-1 py-2.5 px-4 rounded-lg bg-[#FF4D3D] hover:bg-[#ff6152] text-white font-bold text-xs cursor-pointer whitespace-nowrap"
          >
            Test Map
          </button>
        </div>
      </div>
    </div>
  );
};
