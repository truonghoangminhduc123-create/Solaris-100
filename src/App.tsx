import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Bolt,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Gauge,
  LogOut,
  Magnet,
  Map as MapIcon,
  Orbit,
  Pause,
  Play,
  RefreshCw,
  Shield,
  Smartphone,
  Sparkles,
  Swords,
  Target,
  Trash2,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import {
  ARSENAL_LADDER,
  EVENT_INTERVAL_SECONDS,
  HULL_PALETTE,
  MAP_DEFS,
  MATCH_DURATION_SECONDS,
  MAX_PLAYERS,
  MAX_SKILL_SLOTS,
  MAX_WEAPON_SLOTS,
  NORMAL_MODES,
  SKILL_DEFS,
  getSkillDef,
  getWeaponDef,
  isValidSkillId,
} from '../shared/world';
import type { MapId, SkillId } from '../shared/world';
import { SolarisEngine } from './game/engine';
import type { GraphicsQualitySetting, HudSnapshot } from './game/engine';
import { RadarMinimap } from './components/RadarMinimap';
import { TouchControls } from './components/TouchControls';
import { MyPhotosStudio } from './components/MyPhotosStudio';

const QUALITY_OPTIONS: Array<{ id: GraphicsQualitySetting; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Med' },
  { id: 'high', label: 'High' },
  { id: 'ultra', label: 'Ultra' },
];

const INITIAL_HUD: HudSnapshot = {
  connected: false,
  mode: 'title',
  matchPhase: 'active',
  mapId: 'metro_city',
  mapName: 'Skyline Metropolis',
  terrainSeed: 1,
  matchNumber: 1,
  normalMode: NORMAL_MODES[0],
  specialMode: null,
  modeHud: { normalModeId: 'team_clash', specialModeId: 'none' },
  roleBanner: null,
  matchTimeRemaining: MATCH_DURATION_SECONDS,
  activeEvent: null,
  activeEventTimer: 0,
  nextEventIn: EVENT_INTERVAL_SECONDS,
  onlinePlayers: 0,
  botCount: 0,
  totalPilots: 0,
  maxPlayers: MAX_PLAYERS,
  pingMs: 0,
  localSlotId: null,
  alive: true,
  respawnSeconds: 0,
  shield: 100,
  boost: 100,
  score: 0,
  kills: 0,
  rank: 0,
  speed: 0,
  skills: [],
  starterSkill: 'nova_blast',
  starterCooldown: 0,
  nextReplaceSlot: 0,
  weapons: [],
  equippedWeaponSlot: 0,
  weaponCooldownRatio: 0,
  throwChargeRatio: 0,
  superWeaponAlert: null,
  superWeaponBeacon: null,
  sovereignName: '',
  sovereignScore: 0,
  sovereignIsBot: false,
  isSovereign: false,
  winningTeam: 0,
  solarKills: 0,
  eclipseKills: 0,
  spectateActive: false,
  spectatingName: '',
  spectatingIsBot: false,
  guiHidden: false,
  leaderboard: [],
  radarBlips: [],
  radarNextbots: [],
  radarSuperWeapons: [],
  nameplates: [],
  nextbotNameplates: [],
  pylons: [],
  feed: [],
  postMatchScores: [],
  mapVotes: {
    metro_city: 0,
    neon_citadel: 0,
    coastal_resort: 0,
    deep_space: 0,
    voxel_lands: 0,
    solaris_stadium: 0,
    sky_pitch: 0,
    solaris_basin: 0,
    obsidian_caldera: 0,
    glacier_atoll: 0,
    jade_terraces: 0,
  },
  myVote: null,
  modeVoteOptions: [],
  modeVotes: {},
  myModeVote: null,
  hitmarkerActive: false,
  floatingDmgs: [],
  comboToast: null,
  localSpecialRole: 0,
  localTeamId: 0,
  allyEspEnabled: true,
  arsenalTier: 0,
  lowHpIntensity: 0,
  damageIndicators: [],
  photoToast: null,
  muted: false,
  webglLost: false,
  pointerLocked: false,
  pointerLockBlocked: false,
  graphicsBackend: 'WebGL2',
  qualitySetting: 'auto',
  activeQualityTier: 'high',
  fps: 60,
};

type ScoreFilter = 'all' | 'players' | 'bots';

function detectTouchCapability(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window
  );
}

function formatClock(secondsRaw: number): string {
  const s = Math.max(0, Math.ceil(secondsRaw));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function SkillIcon({ id, className }: { id: SkillId; className?: string }) {
  switch (id) {
    case 'nova_blast':
      return <Flame className={className} />;
    case 'phase_blink':
      return <Wind className={className} />;
    case 'aegis_dome':
      return <Shield className={className} />;
    case 'vortex_snare':
      return <Orbit className={className} />;
    case 'solar_lance':
      return <Crosshair className={className} />;
    case 'overdrive':
      return <Gauge className={className} />;
    case 'emp_shock':
      return <Bolt className={className} />;
    case 'shard_magnet':
      return <Magnet className={className} />;
  }
}

class SolarisErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#12141a] p-6 text-center text-[#f4efe6]">
          <div className="max-w-sm rounded-2xl border border-white/15 bg-[#161922] p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold">Interface Interrupted</h2>
            <p className="mt-2 text-xs text-[#b8b1a4]">
              A display error occurred during the arena transition.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ios-btn mt-4 w-full rounded-xl bg-[#e68a1e] px-4 py-2.5 font-display text-sm font-bold text-[#12141a] cursor-pointer"
            >
              Reload Arena
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const overlayLayerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SolarisEngine | null>(null);
  const weaponDragRef = useRef<{ pointerId: number; slotIdx: number; x: number; y: number } | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [showMyPhotos, setShowMyPhotos] = useState<boolean>(false);
  const [touchEnabled, setTouchEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('solaris100_touch');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return detectTouchCapability();
  });

  const [pilotName, setPilotName] = useState<string>(() => {
    const saved = localStorage.getItem('solaris100_name');
    return saved || `Skimmer-${Math.floor(100 + Math.random() * 899)}`;
  });
  const [colorIndex, setColorIndex] = useState<number>(() => {
    const saved = Number(localStorage.getItem('solaris100_color'));
    return Number.isFinite(saved) && saved >= 0 && saved < HULL_PALETTE.length ? saved : 0;
  });
  const [starterSkill, setStarterSkill] = useState<SkillId>(() => {
    const saved = localStorage.getItem('solaris100_starter_skill');
    return isValidSkillId(saved) ? saved : 'nova_blast';
  });

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;
    const engine = new SolarisEngine(mount, (snapshot) => {
      setHud(snapshot);
    });
    engine.setOverlayElement(overlayLayerRef.current);
    engineRef.current = engine;
    return () => {
      engine.setOverlayElement(null);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setTouchMode(touchEnabled);
  }, [touchEnabled]);

  useEffect(() => {
    const clearDrag = () => {
      weaponDragRef.current = null;
    };
    window.addEventListener('blur', clearDrag);
    window.addEventListener('pointercancel', clearDrag, { passive: true });
    return () => {
      window.removeEventListener('blur', clearDrag);
      window.removeEventListener('pointercancel', clearDrag);
    };
  }, []);

  useEffect(() => {
    if (hud.mode !== 'playing') {
      weaponDragRef.current = null;
    }
  }, [hud.mode]);

  useEffect(() => {
    const onFirstTouch = () => {
      if (localStorage.getItem('solaris100_touch') === null) {
        setTouchEnabled(true);
      }
    };
    window.addEventListener('touchstart', onFirstTouch, { passive: true, once: true });
    return () => window.removeEventListener('touchstart', onFirstTouch);
  }, []);

  const handleToggleTouch = () => {
    setTouchEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('solaris100_touch', String(next));
      if (!next) engineRef.current?.setTouchMove(0, 0);
      return next;
    });
  };

  const handleEnterArena = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = pilotName.trim() || 'Skimmer';
    localStorage.setItem('solaris100_name', trimmed);
    localStorage.setItem('solaris100_color', String(colorIndex));
    localStorage.setItem('solaris100_starter_skill', starterSkill);
    engineRef.current?.joinArena(trimmed, colorIndex, starterSkill);
  };

  const handleColorSelect = (idx: number) => {
    setColorIndex(idx);
    localStorage.setItem('solaris100_color', String(idx));
    if (hud.mode === 'paused' || hud.mode === 'playing') {
      engineRef.current?.updateMeta(pilotName.trim() || 'Skimmer', idx);
    }
  };

  const handleTouchMove = useCallback((x: number, z: number) => {
    engineRef.current?.setTouchMove(x, z);
  }, []);

  const handleTouchSteer = useCallback((dx: number, dy: number) => {
    engineRef.current?.addTouchSteerDelta(dx, dy);
  }, []);

  const handleTouchDash = useCallback(() => {
    engineRef.current?.triggerDash();
  }, []);

  const handleTouchJump = useCallback(() => {
    engineRef.current?.triggerJump();
  }, []);

  const handleTouchPulse = useCallback(() => {
    engineRef.current?.triggerPulse();
  }, []);

  const handleFireStart = useCallback(() => {
    engineRef.current?.beginFireHold(true);
  }, []);

  const handleFireMove = useCallback((stickX: number, stickY: number) => {
    engineRef.current?.steerFireHold(stickX, stickY);
  }, []);

  const handleFireEnd = useCallback(() => {
    engineRef.current?.endFireHold();
  }, []);

  const filteredScores = useMemo(() => {
    if (scoreFilter === 'players') return hud.postMatchScores.filter((r) => !r.isBot);
    if (scoreFilter === 'bots') return hud.postMatchScores.filter((r) => r.isBot);
    return hud.postMatchScores;
  }, [hud.postMatchScores, scoreFilter]);

  const humanScoreCount = useMemo(
    () => hud.postMatchScores.filter((r) => !r.isBot).length,
    [hud.postMatchScores],
  );
  const botScoreCount = hud.postMatchScores.length - humanScoreCount;

  const myPostRow = useMemo(
    () => (hud.localSlotId !== null ? hud.postMatchScores.find((r) => r.slotId === hud.localSlotId) : undefined),
    [hud.postMatchScores, hud.localSlotId],
  );
  const mvpRow = hud.postMatchScores[0];

  const equippedWeaponSlot = hud.weapons[hud.equippedWeaponSlot];
  const equippedWeaponDef = equippedWeaponSlot ? getWeaponDef(equippedWeaponSlot.id) : null;
  const isTeamClash =
    Boolean(hud.modeHud.isTeamMatch) ||
    (!hud.specialMode && hud.normalMode.id === 'team_clash');
  const myTeamId: 0 | 5 | 6 =
    hud.localTeamId ||
    (hud.localSpecialRole === 5 || hud.localSpecialRole === 6 ? hud.localSpecialRole : 0);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#12141a]">
      {/* Isolated 3D WebGPU/WebGL2 Canvas Mount */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />
      {/* 60fps Imperative Screen-Projected Nameplates, Ally ESP, Nextbot Tags & Floating Damage */}
      <div ref={overlayLayerRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />

      {/* WebGL Context Lost Fallback */}
      {hud.webglLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#12141a] p-6">
          <div className="max-w-md rounded-2xl border border-white/15 bg-[#181b23]/95 p-6 text-center backdrop-blur-md">
            <h2 className="font-display text-xl font-bold text-[#f4efe6]">Graphics Context Interrupted</h2>
            <p className="mt-2 text-sm text-[#b8b1a4]">
              Restoring 3D graphics pipeline for the Solaris arena.
            </p>
          </div>
        </div>
      )}

      {/* Low-HP Pulsing Red Border Vignette */}
      {hud.mode === 'playing' && hud.lowHpIntensity > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-[15] low-hp-vignette"
          style={{
            background: `radial-gradient(ellipse at center, rgba(220,38,38,0) 56%, rgba(220,38,38,${(0.42 * hud.lowHpIntensity).toFixed(3)}) 100%)`,
            boxShadow: `inset 0 0 ${Math.round(48 + 44 * hud.lowHpIntensity)}px rgba(239,68,68,${(0.65 * hud.lowHpIntensity).toFixed(3)})`,
          }}
        />
      )}

      {/* Centered Invert-Color Hollow Circle Crosshair + Tight Directional Damage Arcs + 3.0s Throwable Ring + Hitmarker */}
      {hud.mode === 'playing' && (
        <>
          {/* Hollow Circle (O) Crosshair directly inverting canvas colors */}
          <div className="pointer-events-none fixed left-1/2 top-[46%] z-20 -translate-x-1/2 -translate-y-1/2 mix-blend-difference">
            <div className="h-[15px] w-[15px] rounded-full border-[2px] border-white" />
          </div>

          <div className="pointer-events-none fixed left-1/2 top-[46%] z-20 -translate-x-1/2 -translate-y-1/2">
            {/* Tight Directional Damage Arcs orbiting closely around crosshair */}
            {hud.damageIndicators.map((ind) => (
              <svg
                key={ind.id}
                viewBox="0 0 60 60"
                className="absolute left-1/2 top-1/2 h-[54px] w-[54px] -translate-x-1/2 -translate-y-1/2"
                style={{
                  opacity: ind.opacity,
                  transform: `rotate(${ind.angleDeg}deg)`,
                }}
              >
                <path
                  d="M 20 11.5 A 21 21 0 0 1 40 11.5"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </svg>
            ))}

            {/* Strict 3.0s Throwable Charge Arc Indicator */}
            {hud.throwChargeRatio > 0 && (
              <svg
                viewBox="0 0 44 44"
                className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 -rotate-90 drop-shadow"
              >
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2.5" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="3"
                  strokeDasharray={113.1}
                  strokeDashoffset={113.1 * (1 - hud.throwChargeRatio)}
                  strokeLinecap="round"
                />
              </svg>
            )}

            {hud.hitmarkerActive && (
              <svg
                viewBox="0 0 28 28"
                className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 drop-shadow"
              >
                <g stroke="#facc15" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="4" y1="4" x2="10" y2="10" />
                  <line x1="24" y1="4" x2="18" y2="10" />
                  <line x1="4" y1="24" x2="10" y2="18" />
                  <line x1="24" y1="24" x2="18" y2="18" />
                </g>
              </svg>
            )}
          </div>
        </>
      )}

      {/* 3D Snapshot Saved Toast */}
      {hud.mode === 'playing' && hud.photoToast && (
        <div className="pointer-events-none fixed left-1/2 top-[9%] z-40 -translate-x-1/2 ios-spring">
          <div className="flex items-center gap-2 rounded-full border border-[#fbbf24]/60 bg-[#12141a]/92 px-4 py-1.5 text-xs font-semibold text-[#fbbf24] shadow-xl backdrop-blur-md">
            <Camera className="h-3.5 w-3.5" />
            <span>{hud.photoToast}</span>
          </div>
        </div>
      )}

      {/* Multi-Kill Combo / Elimination Toast */}
      {hud.mode === 'playing' && hud.comboToast && (
        <div
          key={hud.comboToast.id}
          className="pointer-events-none fixed left-1/2 top-[13%] sm:top-[15%] z-30 -translate-x-1/2 text-center ios-spring"
        >
          <div
            className="rounded-2xl border bg-[#12141a]/90 px-4 py-1.5 shadow-xl backdrop-blur-md"
            style={{ borderColor: hud.comboToast.accent }}
          >
            <div
              className="font-display text-sm sm:text-base font-bold tracking-wider uppercase"
              style={{ color: hud.comboToast.accent }}
            >
              {hud.comboToast.label}
            </div>
            <div className="font-mono-tabular text-[11px] font-medium text-[#f4efe6]">
              {hud.comboToast.sub}
            </div>
          </div>
        </div>
      )}

      {/* Screen-projected Nameplates, Ally ESP, Nextbot Tags & Damage run directly in overlayLayerRef at 60fps */}

      {/* Multi-Touch Controls Layer (Phone / Tablet) */}
      {hud.mode === 'playing' && touchEnabled && (
        <TouchControls
          boost={hud.boost}
          equippedWeaponName={equippedWeaponDef ? equippedWeaponDef.shortName : null}
          weaponFireMode={equippedWeaponDef?.fireMode || null}
          isThrowable={equippedWeaponDef?.fireMode === 'throw'}
          throwChargeRatio={hud.throwChargeRatio}
          onMove={handleTouchMove}
          onSteerDelta={handleTouchSteer}
          onDash={handleTouchDash}
          onJump={handleTouchJump}
          onPulse={handleTouchPulse}
          onFireStart={handleFireStart}
          onFireMove={handleFireMove}
          onFireEnd={handleFireEnd}
        />
      )}

      {/* TITLE SCREEN OVERLAY ONLY: Hide GUI / Spectate / Join Form */}
      {(hud.mode === 'title' || hud.mode === 'server_full') && (
        <>
          {hud.mode === 'title' && hud.guiHidden ? (
            /* Pure Scenic World View — Tap anywhere or Show UI pill to restore Title GUI */
            <div
              onClick={() => engineRef.current?.setGuiHidden(false)}
              className="pointer-events-auto absolute inset-0 z-30 p-3 sm:p-5 flex justify-end items-start cursor-pointer"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  engineRef.current?.setGuiHidden(false);
                }}
                className="pointer-events-auto ios-btn ios-spring flex h-10 px-3.5 items-center justify-center gap-1.5 rounded-full border border-white/25 bg-[#12141a]/88 text-xs font-semibold text-[#f4efe6] shadow-xl backdrop-blur-md cursor-pointer"
                aria-label="Show UI"
                title="Show UI"
              >
                <Eye className="h-4 w-4 text-[#fbbf24]" />
                <span>Show UI</span>
              </button>
            </div>
          ) : (
            <div className="absolute inset-0 z-20 flex flex-col gap-2 p-2.5 sm:p-5 md:p-8 pointer-events-none overflow-hidden">
              <div className="flex items-start justify-between gap-1.5 sm:gap-2 shrink-0 home-top-enter">
                <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5 text-[10px] sm:text-xs font-medium text-[#181a1f] bg-[#f4efe6]/90 backdrop-blur-md px-2.5 sm:px-3 py-1.5 rounded-full border border-[#181a1f]/15 pointer-events-auto min-w-0 max-w-[44vw] sm:max-w-none shadow">
                  <span className="font-mono-tabular font-bold shrink-0">
                    {hud.totalPilots || hud.maxPlayers}/{hud.maxPlayers}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="hidden sm:inline font-mono-tabular">
                    {hud.onlinePlayers}P · {hud.botCount}B
                  </span>
                  <span className="hidden sm:inline" aria-hidden="true">·</span>
                  <span className="font-semibold truncate">{hud.mapName}</span>
                  <span className="hidden sm:inline" aria-hidden="true">·</span>
                  {hud.specialMode ? (
                    <span className="hidden sm:inline font-bold uppercase tracking-wide" style={{ color: '#991b1b' }}>
                      {hud.specialMode.name}
                    </span>
                  ) : (
                    <span className="hidden sm:inline font-bold text-[#9a3412] truncate">{hud.normalMode.name}</span>
                  )}
                  <span className="hidden md:inline" aria-hidden="true">·</span>
                  <span className="hidden md:inline font-mono-tabular">
                    {hud.connected ? `${hud.pingMs}ms` : '...'}
                  </span>
                </div>

                <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
                  {hud.mode === 'title' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowMyPhotos(true)}
                        className="ios-btn flex h-9 w-9 sm:h-11 sm:w-auto sm:px-3 items-center justify-center gap-1.5 rounded-full border border-[#e68a1e]/60 bg-[#12141a]/88 text-xs font-semibold text-[#fbbf24] hover:bg-[#e68a1e]/20 backdrop-blur-md cursor-pointer"
                        aria-label="My Photos"
                        title="Open saved 3D Photos & Raytrace Studio"
                      >
                        <Camera className="h-4 w-4 shrink-0" />
                        <span className="hidden sm:inline">My Photos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          hud.spectateActive
                            ? engineRef.current?.stopSpectate()
                            : engineRef.current?.startSpectate()
                        }
                        className={`ios-btn flex h-9 w-9 sm:h-11 sm:w-auto sm:px-3 items-center justify-center gap-1.5 rounded-full border text-xs font-semibold backdrop-blur-md cursor-pointer ${
                          hud.spectateActive
                            ? 'border-[#38bdf8] bg-[#38bdf8]/25 text-[#38bdf8]'
                            : 'border-white/20 bg-[#12141a]/85 text-[#f4efe6]'
                        }`}
                        aria-label={hud.spectateActive ? 'Exit Spectate' : 'Spectate Match'}
                        title="Spectate live pilots"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="hidden sm:inline">
                          {hud.spectateActive ? 'Exit' : 'Spectate'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => engineRef.current?.setGuiHidden(true)}
                        className="ios-btn flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-white/20 bg-[#12141a]/85 text-[#b8b1a4] hover:text-[#f4efe6] backdrop-blur-md cursor-pointer"
                        aria-label="Hide GUI"
                        title="Hide Title GUI"
                      >
                        <EyeOff className="h-4 w-4" />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleTouch}
                    className={`ios-btn flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border backdrop-blur-md cursor-pointer ${
                      touchEnabled
                        ? 'border-[#e68a1e]/75 bg-[#12141a]/90 text-[#fbbf24]'
                        : 'border-white/20 bg-[#12141a]/85 text-[#b8b1a4]'
                    }`}
                    aria-label="Toggle touch controls"
                    title={touchEnabled ? 'Touch Controls: On' : 'Touch Controls: Off'}
                  >
                    <Smartphone className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleMute()}
                    className="ios-btn flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-white/20 bg-[#12141a]/85 text-[#f4efe6] backdrop-blur-md cursor-pointer"
                    aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                    title={hud.muted ? 'Muted' : 'Audio On'}
                  >
                    {hud.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {hud.spectateActive ? (
                /* Title Screen Spectate Controls Pill */
                <div className="mt-auto mb-3 flex justify-center pointer-events-auto">
                  <div className="ios-spring flex items-center gap-2 rounded-full border border-white/20 bg-[#12141a]/90 px-3 py-1.5 shadow-2xl backdrop-blur-md">
                    <button
                      type="button"
                      onClick={() => engineRef.current?.cycleSpectate(-1)}
                      className="ios-btn flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#f4efe6] hover:bg-white/15 cursor-pointer"
                      aria-label="Previous pilot"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-1.5 px-2 text-xs sm:text-sm font-semibold text-[#f4efe6]">
                      {!hud.spectatingIsBot ? (
                        <User className="h-3.5 w-3.5 text-[#34d399]" />
                      ) : (
                        <span className="font-mono-tabular text-[10px] text-[#94a3b8]">[BOT]</span>
                      )}
                      <span className="max-w-[140px] truncate">{hud.spectatingName || 'Arena Cam'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => engineRef.current?.cycleSpectate(1)}
                      className="ios-btn flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#f4efe6] hover:bg-white/15 cursor-pointer"
                      aria-label="Next pilot"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => engineRef.current?.stopSpectate()}
                      className="ios-btn flex h-9 w-9 items-center justify-center rounded-full border border-[#ef4444]/40 bg-[#ef4444]/20 text-[#fca5a5] hover:bg-[#ef4444]/35 cursor-pointer"
                      aria-label="Exit Spectate"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-h-0 flex-1 flex items-center w-full max-w-md pointer-events-auto home-panel-enter">
                    <div className="max-h-full w-full overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y rounded-2xl border border-white/15 bg-[#12141a]/90 p-3 sm:p-6 shadow-2xl backdrop-blur-md">
                      <div className="mb-3 sm:mb-4">
                        <svg viewBox="0 0 340 68" className="h-10 sm:h-13 w-auto" role="img" aria-label="SOLARIS 100">
                          <g fill="none" stroke="#e68a1e" strokeWidth="2.5" className="home-crest-pulse">
                            <circle cx="28" cy="34" r="18" />
                            <polygon
                              points="28,10 35,28 52,34 35,40 28,58 21,40 4,34 21,28"
                              fill="#e68a1e"
                              fillOpacity="0.22"
                            />
                            <circle cx="28" cy="34" r="5" fill="#fbbf24" stroke="none" />
                          </g>
                          <text
                            x="66"
                            y="38"
                            fill="#f4efe6"
                            fontFamily="Chakra Petch, sans-serif"
                            fontWeight="700"
                            fontSize="30"
                            letterSpacing="2"
                          >
                            SOLARIS 100
                          </text>
                          <text
                            x="67"
                            y="56"
                            fill="#b8b1a4"
                            fontFamily="Plus Jakarta Sans, sans-serif"
                            fontWeight="500"
                            fontSize="12"
                            letterSpacing="0.5"
                          >
                            3D Photorealistic Kinetic Arena
                          </text>
                        </svg>
                      </div>

                      {hud.mode === 'server_full' && (
                        <div className="mb-3 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/15 p-3 text-sm text-[#fecaca]">
                          Arena capacity reached ({hud.maxPlayers}/{hud.maxPlayers} pilots active). Retry in a moment.
                        </div>
                      )}

                      <form onSubmit={handleEnterArena} className="space-y-3 sm:space-y-3.5">
                        <div>
                          <label htmlFor="pilot-callsign" className="block text-xs font-medium text-[#b8b1a4] mb-1">
                            Pilot Callsign
                          </label>
                          <input
                            id="pilot-callsign"
                            type="text"
                            maxLength={14}
                            value={pilotName}
                            onChange={(e) => setPilotName(e.target.value)}
                            placeholder="Enter callsign"
                            className="w-full min-h-[42px] rounded-xl border border-white/15 bg-[#1b1f29] px-3.5 py-2 text-sm font-medium text-[#f4efe6] placeholder-[#6b7280] focus:border-[#e68a1e] focus:outline-none"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs text-[#b8b1a4] mb-1.5">
                            <span>Hull Finish</span>
                            <span className="text-[#f4efe6] font-medium">{HULL_PALETTE[colorIndex].name}</span>
                          </div>
                          <div className="grid grid-cols-8 gap-1.5">
                            {HULL_PALETTE.map((swatch, idx) => (
                              <button
                                key={swatch.name}
                                type="button"
                                onClick={() => handleColorSelect(idx)}
                                title={swatch.name}
                                aria-label={swatch.name}
                                className={`ios-btn min-h-[32px] sm:h-8 rounded-lg border cursor-pointer ${
                                  colorIndex === idx
                                    ? 'border-white scale-105 ring-2 ring-[#e68a1e]/60'
                                    : 'border-white/15 hover:scale-105'
                                }`}
                                style={{ backgroundColor: swatch.hex }}
                              />
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs text-[#b8b1a4] mb-1">
                            <span>Starter Skill</span>
                            <span className="font-semibold text-[#fbbf24]">
                              {getSkillDef(starterSkill).name}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                            {SKILL_DEFS.map((sk) => {
                              const active = starterSkill === sk.id;
                              return (
                                <button
                                  key={sk.id}
                                  type="button"
                                  onClick={() => {
                                    setStarterSkill(sk.id);
                                    localStorage.setItem('solaris100_starter_skill', sk.id);
                                  }}
                                  title={`${sk.name}: ${sk.description}`}
                                  className={`ios-btn flex flex-col items-center justify-center rounded-xl border py-1.5 px-1 cursor-pointer ${
                                    active
                                      ? 'bg-[#1f2430] ring-1 ring-[#fbbf24]/60'
                                      : 'border-white/12 bg-[#101218] hover:border-white/30'
                                  }`}
                                  style={{ borderColor: active ? sk.color : undefined }}
                                >
                                  <span style={{ color: sk.color }}>
                                    <SkillIcon id={sk.id} className="h-3.5 w-3.5" />
                                  </span>
                                  <span className="mt-0.5 text-[9px] font-medium text-[#f4efe6] truncate max-w-full">
                                    {sk.shortName}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-1 text-[11px] text-[#9ca3af] truncate">
                            {getSkillDef(starterSkill).description} · 7s Recharge
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs text-[#b8b1a4] mb-1">
                            <span>Graphics</span>
                            <span className="font-mono-tabular text-[#f4efe6]">
                              {hud.qualitySetting === 'auto'
                                ? `Auto (${hud.activeQualityTier.toUpperCase()} · ${hud.graphicsBackend})`
                                : `${hud.activeQualityTier.toUpperCase()} · ${hud.graphicsBackend}`}
                            </span>
                          </div>
                          <div className="grid grid-cols-5 gap-1 rounded-xl border border-white/10 bg-[#101218] p-1">
                            {QUALITY_OPTIONS.map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => engineRef.current?.setQualitySetting(opt.id)}
                                className={`ios-btn min-h-[32px] rounded-lg text-xs font-medium cursor-pointer ${
                                  hud.qualitySetting === opt.id
                                    ? 'bg-[#e68a1e] text-[#12141a] font-bold'
                                    : 'text-[#b8b1a4] hover:text-[#f4efe6]'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={!hud.connected}
                          className="ios-btn w-full min-h-[46px] rounded-xl bg-[#e68a1e] px-5 py-2.5 font-display text-base font-bold tracking-wide text-[#12141a] hover:bg-[#f59e0b] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Play className="h-4 w-4 fill-current" />
                          <span>{hud.connected ? 'Enter Arena' : 'Connecting...'}</span>
                        </button>
                      </form>

                      {hud.sovereignName && (
                        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-[#b8b1a4]">
                          <span className="flex items-center gap-1.5">
                            <Crown className="h-3.5 w-3.5 text-[#fbbf24]" />
                            <span>Sovereign</span>
                          </span>
                          <span className="font-mono-tabular font-semibold text-[#f4efe6] truncate ml-2">
                            {hud.sovereignIsBot && <span className="text-[#94a3b8] mr-1">[BOT]</span>}
                            {hud.sovereignName} · {hud.sovereignScore}
                          </span>
                        </div>
                      )}
                      <div className="mt-2 rounded-xl border border-white/10 bg-[#101218] px-3 py-1.5 text-[11px] text-[#d6cfc2]">
                        <span className="font-bold" style={{ color: hud.specialMode ? hud.specialMode.accent : hud.normalMode.accent }}>
                          {hud.specialMode ? `SPECIAL: ${hud.specialMode.name}` : hud.normalMode.name}
                        </span>
                        <span className="mx-1.5 text-white/30">·</span>
                        <span className="text-[#9ca3af]">
                          {hud.specialMode ? hud.specialMode.summary : hud.normalMode.summary}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 hidden [@media(min-height:540px)]:flex justify-center">
                    <div className="rounded-full border border-white/15 bg-[#12141a]/82 backdrop-blur-md px-4 py-1.5 text-center text-[11px] font-medium text-[#d6cfc2]">
                      {touchEnabled
                        ? 'Left Move · Fire Pad 360 Aim & Hold · Top-Right Camera · Drag Weapon Out to Drop · 1-5 Skills'
                        : 'WASD Move · LMB/F Hold Fire · S (Tap)/P 3D Photo · Backspace/G Drop · Space Dash · Shift Jump · E Pulse'}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ROUND-START 3-LINE "YOU ARE ... / RANDOM RANK / TUTORIAL" BANNER */}
      {hud.mode === 'playing' && hud.roleBanner && (
        <div
          key={hud.roleBanner.id}
          className="pointer-events-none fixed left-1/2 top-[16%] sm:top-[19%] z-[35] w-[min(92vw,540px)] text-center animate-banner-3s"
        >
          <div
            className="rounded-2xl border-2 bg-[#12141a]/92 px-4 py-3 sm:px-7 sm:py-4 shadow-2xl backdrop-blur-md"
            style={{ borderColor: hud.roleBanner.accent }}
          >
            <div
              className="font-mono-tabular text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: hud.roleBanner.accent }}
            >
              {hud.specialMode ? 'Special Round' : 'Arena Mode'} · {hud.roleBanner.modeName}
            </div>
            <div className="mt-1 font-display text-2xl sm:text-4xl font-bold tracking-wide text-[#f4efe6]">
              YOU ARE{' '}
              <span style={{ color: hud.roleBanner.accent }}>{hud.roleBanner.headline}</span>
            </div>
            <div className="mt-1 font-mono-tabular text-xs sm:text-sm font-bold uppercase tracking-wider text-[#fbbf24]">
              {hud.roleBanner.rankLine}
            </div>
            <div className="mt-1 text-xs sm:text-sm font-medium text-[#d6cfc2]">
              {hud.roleBanner.tutorialLine}
            </div>
          </div>
        </div>
      )}

      {/* IN-GAME HUD */}
      {(hud.mode === 'playing' || hud.mode === 'paused') && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between p-2 sm:p-4 md:p-5 overflow-hidden">
          {/* Top Row */}
          <div className="flex items-start justify-between gap-1.5 sm:gap-3 min-w-0">
            {/* Top-Left: Pilot Telemetry */}
            <div className="shrink-0 rounded-2xl border border-white/15 bg-[#12141a]/84 backdrop-blur-md px-2 py-1 sm:px-4 sm:py-2.5 min-w-[82px] max-w-[27vw] sm:min-w-[216px] sm:max-w-none shadow-lg">
              <div className="flex items-baseline justify-between gap-1.5 sm:gap-4">
                <div className="min-w-0">
                  <div className="text-[9px] sm:text-[11px] font-medium text-[#b8b1a4] truncate">
                    <span className="sm:hidden">Shards</span>
                    <span className="hidden sm:inline">Shards · {hud.kills} KOs</span>
                  </div>
                  <div className="font-mono-tabular text-sm sm:text-2xl font-bold leading-tight text-[#fbbf24]">
                    {hud.score}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9px] sm:text-[11px] font-medium text-[#b8b1a4]">Rank</div>
                  <div className="font-mono-tabular text-[11px] sm:text-lg font-bold text-[#f4efe6]">
                    #{hud.rank || 1}
                    <span className="hidden sm:inline text-[11px] font-normal text-[#9ca3af]">
                      {' '}/{hud.totalPilots || hud.maxPlayers}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-1 sm:mt-2 space-y-1">
                <div>
                  <div className="flex justify-between text-[9px] sm:text-[11px] text-[#b8b1a4] mb-0.5">
                    <span className="flex items-center gap-1">
                      <Shield className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-[#2dd4bf]" />
                    </span>
                    <span className="font-mono-tabular text-[#f4efe6]">{hud.shield}%</span>
                  </div>
                  <div className="h-1 sm:h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full transition-all duration-100 ${
                        hud.shield < 30 ? 'bg-[#ef4444]' : 'bg-[#2dd4bf]'
                      }`}
                      style={{ width: `${hud.shield}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[9px] sm:text-[11px] text-[#b8b1a4] mb-0.5">
                    <span className="flex items-center gap-1">
                      <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-[#f59e0b]" />
                    </span>
                    <span className="font-mono-tabular text-[#f4efe6]">{hud.boost}%</span>
                  </div>
                  <div className="h-1 sm:h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-[#f59e0b] transition-all duration-100"
                      style={{ width: `${hud.boost}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Top-Center: Match Clock, Prominent Team Bossbar (All Viewports!) & Mode Alerts */}
            <div className="flex flex-col items-center gap-1 text-center min-w-0 flex-1 max-w-[46vw] sm:max-w-[430px]">
              <div className="rounded-2xl border border-white/15 bg-[#12141a]/88 backdrop-blur-md px-2 py-0.5 sm:px-4 sm:py-1.5 shadow-lg max-w-full">
                <div className="flex flex-wrap items-center justify-center gap-x-1.5 sm:gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-medium text-[#f4efe6]">
                  <span className="hidden sm:inline text-[#b8b1a4] truncate max-w-[140px]">
                    M#{hud.matchNumber} · {hud.mapName}
                  </span>
                  <span className="hidden sm:inline text-white/25">·</span>
                  <span
                    className={`font-mono-tabular text-[11px] sm:text-sm font-bold ${
                      hud.matchTimeRemaining <= 15 ? 'text-[#ef4444]' : 'text-[#fbbf24]'
                    }`}
                  >
                    {formatClock(hud.matchTimeRemaining)}
                  </span>
                  <span className="hidden sm:inline text-white/25">·</span>
                  {hud.activeEvent ? (
                    <span className="hidden sm:inline font-semibold" style={{ color: hud.activeEvent.accent }}>
                      {hud.activeEvent.name} ({Math.ceil(hud.activeEventTimer)}s)
                    </span>
                  ) : (
                    <span className="hidden sm:inline font-mono-tabular text-[#b8b1a4]">
                      Disaster {Math.ceil(hud.nextEventIn)}s
                    </span>
                  )}
                </div>
                {hud.activeEvent && (
                  <div className="hidden sm:block text-[11px] text-[#d6cfc2] mt-0.5">{hud.activeEvent.summary}</div>
                )}
              </div>

              {/* Prominent Team Score Bossbar (Your Team vs Enemy Team) */}
              {isTeamClash && hud.modeHud.solarScore !== undefined && hud.modeHud.eclipseScore !== undefined && (() => {
                const solar = hud.modeHud.solarScore || 0;
                const eclipse = hud.modeHud.eclipseScore || 0;
                const sKills = hud.modeHud.solarKills ?? hud.solarKills;
                const eKills = hud.modeHud.eclipseKills ?? hud.eclipseKills;
                const sPrimary = sKills > 0 || eKills > 0 ? sKills : solar;
                const ePrimary = sKills > 0 || eKills > 0 ? eKills : eclipse;
                const total = sPrimary + ePrimary;
                const solarPct = total > 0 ? Math.max(8, Math.min(92, Math.round((sPrimary / total) * 100))) : 50;
                const isSolarMine = myTeamId === 5;
                const isEclipseMine = myTeamId === 6;
                return (
                  <div className="w-full max-w-[180px] sm:max-w-[360px] rounded-xl border border-white/20 bg-[#12141a]/92 backdrop-blur-md px-1.5 py-1 sm:px-3 sm:py-1.5 shadow-xl">
                    <div className="flex items-center justify-between gap-1 font-mono-tabular text-[9px] sm:text-xs font-bold mb-1">
                      <div
                        className={`flex items-center gap-0.5 sm:gap-1 rounded-md px-1 sm:px-1.5 py-0.5 truncate ${
                          isSolarMine
                            ? 'bg-[#f59e0b]/22 text-[#fbbf24] ring-1 ring-[#f59e0b]/60'
                            : 'text-[#f59e0b]'
                        }`}
                      >
                        <span className="sm:hidden">{isSolarMine ? 'YOU' : 'SOL'}</span>
                        <span className="hidden sm:inline">{isSolarMine ? 'YOU SOLAR' : 'SOLAR'}</span>
                        <span className="text-[#f4efe6]">{sKills}</span>
                        <span className="hidden sm:inline text-[10px] text-[#fbbf24]/80">({solar})</span>
                      </div>
                      <span className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af] shrink-0">
                        VS
                      </span>
                      <div
                        className={`flex items-center gap-0.5 sm:gap-1 rounded-md px-1 sm:px-1.5 py-0.5 truncate ${
                          isEclipseMine
                            ? 'bg-[#38bdf8]/22 text-[#7dd3fc] ring-1 ring-[#38bdf8]/60'
                            : 'text-[#38bdf8]'
                        }`}
                      >
                        <span className="hidden sm:inline text-[10px] text-[#7dd3fc]/80">({eclipse})</span>
                        <span className="text-[#f4efe6]">{eKills}</span>
                        <span className="sm:hidden">{isEclipseMine ? 'YOU' : 'ECL'}</span>
                        <span className="hidden sm:inline">{isEclipseMine ? 'ECLIPSE YOU' : 'ECLIPSE'}</span>
                      </div>
                    </div>
                    <div className="flex h-1.5 sm:h-2 w-full overflow-hidden rounded-full bg-[#38bdf8]/90 ring-1 ring-white/15">
                      <div className="h-full bg-[#f59e0b] transition-all duration-200" style={{ width: `${solarPct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {!hud.specialMode && hud.normalMode.id === 'king_of_hill' && hud.modeHud.zoneTimer !== undefined && (
                <div className="flex items-center gap-1 rounded-full border border-[#facc15]/50 bg-[#12141a]/90 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-[#facc15] shadow backdrop-blur-md">
                  <Target className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>Zone {Math.ceil(hud.modeHud.zoneTimer)}s</span>
                </div>
              )}

              {!hud.specialMode && hud.normalMode.id === 'bounty_hunters' && hud.modeHud.bountyName && (
                <div className="flex items-center gap-1 rounded-full border border-[#facc15]/50 bg-[#12141a]/90 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-[#facc15] shadow backdrop-blur-md max-w-full">
                  <Target className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  <span className="truncate max-w-[110px] sm:max-w-[150px]">Bounty: {hud.modeHud.bountyName}</span>
                </div>
              )}

              {!hud.specialMode && hud.normalMode.id === 'arsenal_escalate' && (
                <div className="flex items-center gap-1 rounded-full border border-[#a855f7]/50 bg-[#12141a]/90 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-[#c084fc] shadow backdrop-blur-md">
                  <Swords className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>Tier {Math.max(1, hud.arsenalTier)}/{ARSENAL_LADDER.length}</span>
                </div>
              )}

              {(hud.specialMode?.id === 'lava_rising' || hud.activeEvent?.id === 'magma_flood') && hud.modeHud.lavaLevel !== undefined && (
                <div className="flex items-center gap-1 rounded-full border border-[#ea580c]/60 bg-[#12141a]/90 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-[#fb923c] shadow backdrop-blur-md">
                  <Flame className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>Magma {hud.modeHud.lavaLevel.toFixed(1)}m</span>
                </div>
              )}

              {/* 30s Global Mythic Super Weapon Spawn Beacon Alert */}
              {hud.superWeaponBeacon && (
                <div
                  className="hidden sm:flex items-center gap-1.5 rounded-full border bg-[#12141a]/90 backdrop-blur-md px-3 py-1 text-[11px] font-bold shadow-lg"
                  style={{
                    borderColor: hud.superWeaponBeacon.color,
                    color: hud.superWeaponBeacon.color,
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[180px]">{hud.superWeaponBeacon.name}</span>
                  <span className="font-mono-tabular text-[#f4efe6]">
                    {hud.superWeaponBeacon.distance}m {hud.superWeaponBeacon.compassDir}
                  </span>
                </div>
              )}
            </div>

            {/* Top-Right: Controls + Radar/Leaderboard */}
            <div className="flex flex-col items-end gap-1 sm:gap-2 shrink-0">
              <div className="pointer-events-auto relative z-[35] flex items-center gap-1.5">
                <div className="hidden sm:block rounded-full border border-white/15 bg-[#12141a]/84 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-[#f4efe6]">
                  <span className="font-mono-tabular">
                    {hud.onlinePlayers}P · {hud.botCount}B
                  </span>
                  <span className="hidden lg:inline mx-1 text-white/30">·</span>
                  <span className="hidden lg:inline font-mono-tabular text-[#b8b1a4]">{hud.pingMs}ms</span>
                </div>
                {hud.mode === 'playing' && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={() => engineRef.current?.capturePhoto()}
                    className="ios-btn flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-[#e68a1e]/60 bg-[#12141a]/88 backdrop-blur-md text-[#fbbf24] hover:bg-[#e68a1e]/25 cursor-pointer"
                    aria-label="Capture 3D Photo"
                    title="Capture 3D Snapshot"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={() => engineRef.current?.toggleMute()}
                  className="ios-btn flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-white/15 bg-[#12141a]/84 backdrop-blur-md text-[#f4efe6] hover:bg-[#1e222b] cursor-pointer"
                  aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                >
                  {hud.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={() => engineRef.current?.setPaused(hud.mode !== 'paused')}
                  className="ios-btn flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-white/15 bg-[#12141a]/84 backdrop-blur-md text-[#f4efe6] hover:bg-[#1e222b] cursor-pointer"
                  aria-label="Pause menu"
                >
                  <Pause className="h-4 w-4" />
                </button>
              </div>

              {hud.superWeaponBeacon && (
                <div
                  className="sm:hidden flex items-center gap-1 rounded-full border bg-[#12141a]/90 px-2 py-0.5 text-right text-[9px] font-bold max-w-[118px] truncate"
                  style={{ borderColor: hud.superWeaponBeacon.color, color: hud.superWeaponBeacon.color }}
                >
                  <Sparkles className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{hud.superWeaponBeacon.shortName}</span>
                  <span className="font-mono-tabular text-[#f4efe6] shrink-0">
                    {hud.superWeaponBeacon.distance}m
                  </span>
                </div>
              )}
              {hud.activeEvent && (
                <div
                  className="sm:hidden rounded-full border border-white/15 bg-[#12141a]/90 px-2 py-0.5 text-right text-[9px] font-semibold max-w-[118px] truncate"
                  style={{ color: hud.activeEvent.accent }}
                >
                  {hud.activeEvent.name} · {Math.ceil(hud.activeEventTimer)}s
                </div>
              )}

              {touchEnabled && (
                <div className="hidden [@media(min-height:460px)]:block md:hidden">
                  <RadarMinimap
                    blips={hud.radarBlips}
                    pylons={hud.pylons}
                    nextbots={hud.radarNextbots}
                    superWeapons={hud.radarSuperWeapons}
                    modeHud={hud.modeHud}
                    mapId={hud.mapId}
                    terrainSeed={hud.terrainSeed}
                    localTeamId={myTeamId}
                    size={64}
                  />
                </div>
              )}

              {hud.leaderboard.length > 0 && (
                <div className="hidden md:[@media(min-height:540px)]:block rounded-2xl border border-white/15 bg-[#12141a]/84 backdrop-blur-md px-3.5 py-2.5 w-56 shadow-lg">
                  <div className="text-[11px] font-semibold text-[#b8b1a4] mb-1.5">Top Pilots</div>
                  <div className="space-y-1">
                    {hud.leaderboard.map((row, idx) => (
                      <div
                        key={row.slotId}
                        className={`flex items-center justify-between text-xs ${
                          row.isSelf ? 'font-bold text-[#fbbf24]' : row.isBot ? 'text-[#9ca3af]' : 'text-[#ffffff]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate pr-2">
                          <span className="font-mono-tabular text-[11px] text-[#9ca3af] w-3">{idx + 1}</span>
                          {row.isSovereign && <Crown className="h-3 w-3 shrink-0 text-[#fbbf24]" />}
                          {!row.isBot && <User className="h-3 w-3 shrink-0 text-[#34d399]" />}
                          {row.isBot && (
                            <span className="font-mono-tabular text-[9px] text-[#64748b] shrink-0">[BOT]</span>
                          )}
                          <span className="truncate">{row.name}</span>
                        </div>
                        <span className="font-mono-tabular">{row.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center-Top Respawn Banner (Universal 30s Respawn Lock) */}
          {!hud.alive && hud.mode === 'playing' && (
            <div className="mx-auto rounded-2xl border border-[#ef4444]/40 bg-[#12141a]/92 backdrop-blur-md px-5 py-2.5 text-center shadow-xl ios-spring">
              <div className="font-display text-sm font-bold text-[#fca5a5]">Skimmer Shattered</div>
              <div className="font-mono-tabular text-xs text-[#e5e0d5] mt-0.5">
                Reforming in {hud.respawnSeconds.toFixed(1)}s
              </div>
            </div>
          )}

          {/* Bottom Row */}
          <div className="flex items-end justify-between gap-2 sm:gap-4 min-w-0">
            {!touchEnabled ? (
              <div className="hidden sm:block shrink-0">
                <RadarMinimap
                  blips={hud.radarBlips}
                  pylons={hud.pylons}
                  nextbots={hud.radarNextbots}
                  superWeapons={hud.radarSuperWeapons}
                  modeHud={hud.modeHud}
                  mapId={hud.mapId}
                  terrainSeed={hud.terrainSeed}
                  localTeamId={myTeamId}
                  size={118}
                />
              </div>
            ) : (
              <div className="hidden md:[@media(min-height:520px)]:block shrink-0">
                <RadarMinimap
                  blips={hud.radarBlips}
                  pylons={hud.pylons}
                  nextbots={hud.radarNextbots}
                  superWeapons={hud.radarSuperWeapons}
                  modeHud={hud.modeHud}
                  mapId={hud.mapId}
                  terrainSeed={hud.terrainSeed}
                  localTeamId={myTeamId}
                  size={104}
                />
              </div>
            )}

            <div className="flex flex-col items-center gap-1 sm:gap-1.5 mx-auto min-w-0 max-w-[96vw] sm:max-w-[78vw]">
              {hud.feed.length > 0 && (
                <div className="hidden [@media(min-height:430px)]:flex flex-col items-center gap-1 max-w-full">
                  {hud.feed.slice(0, touchEnabled ? 2 : 3).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-full border border-white/10 bg-[#12141a]/82 backdrop-blur-sm px-3 py-0.5 text-[10px] sm:text-xs font-medium text-[#f4efe6] truncate max-w-full"
                    >
                      {item.text}
                    </div>
                  ))}
                </div>
              )}

              {/* Dual Inventory Dock: Skills [1-5] + Weapons [6-0] (Clean stacked touch fit without overlapping joysticks) */}
              {hud.mode === 'playing' && (
                <div
                  className={`pointer-events-auto flex items-center justify-center max-w-full ${
                    touchEnabled
                      ? 'flex-col gap-1 mb-[148px] min-[600px]:mb-1 min-[600px]:max-w-[calc(100vw-260px)]'
                      : 'flex-wrap gap-1.5 sm:gap-2.5'
                  }`}
                >
                  {/* Group 1: Skills */}
                  <div className="flex items-center gap-1 rounded-2xl border border-white/12 bg-[#12141a]/78 backdrop-blur-md p-1 max-w-full overflow-x-auto">
                    {hud.skills.length === 0 ? (
                      <div
                        className={`flex items-center gap-1.5 rounded-xl px-2.5 text-[10px] sm:text-[11px] text-[#b8b1a4] ${
                          touchEnabled ? 'h-8 sm:h-10' : 'h-9 sm:h-11'
                        }`}
                        title="Starter skill automatically recharges when slots are empty"
                      >
                        <span className="opacity-65" style={{ color: getSkillDef(hud.starterSkill).color }}>
                          <SkillIcon id={hud.starterSkill} className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-mono-tabular font-semibold text-[#f4efe6] whitespace-nowrap">
                          {hud.starterCooldown > 0
                            ? `${getSkillDef(hud.starterSkill).shortName} ${Math.ceil(hud.starterCooldown)}s`
                            : 'Ready'}
                        </span>
                      </div>
                    ) : (
                      hud.skills.map((skillId, idx) => {
                        const def = getSkillDef(skillId);
                        const isNextReplace =
                          hud.skills.length >= MAX_SKILL_SLOTS && hud.nextReplaceSlot === idx;
                        return (
                          <button
                            key={`${skillId}-${idx}`}
                            type="button"
                            title={`${def.name}: ${def.description}`}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              engineRef.current?.triggerSkill(idx);
                            }}
                            onClick={(e) => {
                              if (e.detail === 0) engineRef.current?.triggerSkill(idx);
                            }}
                            className={`ios-btn relative flex flex-col items-center justify-center rounded-xl border bg-[#12141a]/92 text-[#f4efe6] shadow cursor-pointer touch-none shrink-0 ${
                              touchEnabled ? 'h-8 w-8 sm:h-10 sm:w-10' : 'h-9 w-9 sm:h-11 sm:w-11'
                            }`}
                            style={{ borderColor: def.color }}
                            aria-label={`Activate ${def.name}`}
                          >
                            <span className="absolute left-1 top-0.5 font-mono-tabular text-[7px] sm:text-[8px] text-[#9ca3af]">
                              {idx + 1}
                            </span>
                            {isNextReplace && (
                              <RefreshCw
                                className="absolute right-0.5 top-0.5 h-2 w-2 text-[#fbbf24]"
                                aria-label="Next slot to be replaced"
                              />
                            )}
                            <span style={{ color: def.color }}>
                              <SkillIcon id={skillId} className="h-3 w-3 sm:h-4 sm:w-4" />
                            </span>
                            <span className="mt-0.5 text-[7px] sm:text-[9px] font-semibold leading-none truncate max-w-[28px] sm:max-w-[40px]">
                              {def.shortName}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Group 2: Weapons (Tap to select, Drag >44px outward on Touch OR Backspace/G on Desktop to drop) */}
                  <div className="flex items-center gap-1 rounded-2xl border border-white/12 bg-[#12141a]/78 backdrop-blur-md p-1 max-w-full overflow-x-auto">
                    {Array.from({ length: MAX_WEAPON_SLOTS }, (_, wIdx) => {
                      const slot = hud.weapons[wIdx];
                      const hotkey = wIdx === 4 ? '0' : String(6 + wIdx);
                      if (!slot) {
                        return (
                          <div
                            key={`w-empty-${wIdx}`}
                            className={`relative flex items-center justify-center rounded-xl border border-white/10 bg-[#0d0f14]/65 text-[9px] text-[#4b5563] shrink-0 ${
                              touchEnabled ? 'h-8 w-8 sm:h-10 sm:w-10' : 'h-9 w-9 sm:h-11 sm:w-11'
                            }`}
                            title={`Weapon Slot ${wIdx + 1} (Empty)`}
                          >
                            <span className="absolute left-1 top-0.5 font-mono-tabular text-[7px] sm:text-[8px]">
                              {hotkey}
                            </span>
                            <span className="font-mono-tabular">W{wIdx + 1}</span>
                          </div>
                        );
                      }

                      const def = getWeaponDef(slot.id);
                      const isEquipped = hud.equippedWeaponSlot === wIdx;
                      const durPct = Math.max(
                        0,
                        Math.min(100, (slot.durability / Math.max(1, slot.maxDurability)) * 100),
                      );

                      return (
                        <button
                          key={`w-${slot.id}-${wIdx}`}
                          type="button"
                          title={`${def.name} (${slot.durability}/${slot.maxDurability}) — Drag out or Backspace to drop`}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              e.currentTarget.setPointerCapture(e.pointerId);
                            } catch {
                              // ignore synthetic touch capture errors
                            }
                            weaponDragRef.current = {
                              pointerId: e.pointerId,
                              slotIdx: wIdx,
                              x: e.clientX,
                              y: e.clientY,
                            };
                          }}
                          onPointerUp={(e) => {
                            e.stopPropagation();
                            try {
                              if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                                e.currentTarget.releasePointerCapture(e.pointerId);
                              }
                            } catch {
                              // ignore
                            }
                            const drag = weaponDragRef.current;
                            if (!drag || drag.pointerId !== e.pointerId) return;
                            weaponDragRef.current = null;
                            if (drag.slotIdx === wIdx) {
                              const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
                              if (moved > 44) {
                                engineRef.current?.dropWeaponSlot(wIdx);
                                return;
                              }
                            }
                            engineRef.current?.selectWeaponSlot(wIdx);
                          }}
                          onPointerCancel={(e) => {
                            if (weaponDragRef.current?.pointerId === e.pointerId) {
                              weaponDragRef.current = null;
                            }
                          }}
                          onLostPointerCapture={(e) => {
                            if (weaponDragRef.current?.pointerId === e.pointerId) {
                              weaponDragRef.current = null;
                            }
                          }}
                          onClick={(e) => {
                            if (e.detail === 0) engineRef.current?.selectWeaponSlot(wIdx);
                          }}
                          className={`ios-btn relative flex flex-col items-center justify-center overflow-hidden rounded-xl border bg-[#141720]/95 text-[#f4efe6] cursor-pointer touch-none shrink-0 ${
                            touchEnabled ? 'h-8 w-9 sm:h-10 sm:w-11' : 'h-9 w-10 sm:h-11 sm:w-12'
                          } ${
                            isEquipped ? 'ring-2 ring-white/85 scale-[1.04]' : 'opacity-80 hover:opacity-100'
                          }`}
                          style={{ borderColor: def.color }}
                          aria-label={`Select ${def.name}`}
                        >
                          <span className="absolute left-1 top-0.5 font-mono-tabular text-[7px] sm:text-[8px] text-[#9ca3af]">
                            {hotkey}
                          </span>
                          <span
                            className="absolute right-1 top-0.5 font-mono-tabular text-[7px] sm:text-[8px] font-bold"
                            style={{ color: durPct <= 25 ? '#ef4444' : '#d6cfc2' }}
                          >
                            {slot.durability}
                          </span>
                          <span style={{ color: def.color }} className="mt-1">
                            {def.category === 'melee' ? (
                              <Swords className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            ) : def.category === 'throwable' ? (
                              <Flame className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            ) : (
                              <Crosshair className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            )}
                          </span>
                          <span className="text-[7px] sm:text-[8px] font-semibold leading-none truncate max-w-[32px] sm:max-w-[44px] mb-1">
                            {def.shortName}
                          </span>
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                            <div
                              className="h-full transition-all duration-100"
                              style={{
                                width: `${durPct}%`,
                                backgroundColor: durPct <= 25 ? '#ef4444' : def.color,
                              }}
                            />
                          </div>
                        </button>
                      );
                    })}

                    {hud.weapons.length > 0 && (
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          engineRef.current?.dropEquippedWeapon();
                        }}
                        title="Drop active weapon preserving durability [Backspace / G]"
                        className={`ios-btn flex flex-col items-center justify-center rounded-xl border border-white/15 bg-[#1a1d26]/90 text-[#9ca3af] hover:text-[#fca5a5] hover:border-[#ef4444]/50 cursor-pointer touch-none shrink-0 ${
                          touchEnabled ? 'h-8 w-7 sm:h-10 sm:w-9' : 'h-9 w-8 sm:h-11 sm:w-9'
                        }`}
                        aria-label="Drop active weapon"
                      >
                        <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        <span className="text-[6px] sm:text-[7px] font-mono-tabular mt-0.5">DEL</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!touchEnabled && hud.mode === 'playing' && !hud.pointerLocked && (
                <div className="hidden sm:[@media(min-height:480px)]:block rounded-full border border-[#e68a1e]/45 bg-[#12141a]/88 backdrop-blur-md px-3.5 py-1 text-[11px] font-medium text-[#fbbf24]">
                  {hud.pointerLockBlocked
                    ? 'Hold & drag 360° steer · LMB/F Fire · Backspace Drop · Space Dash'
                    : 'Click arena to lock 360° mouse · Esc Pause'}
                </div>
              )}

              {!touchEnabled && (
                <div className="hidden sm:[@media(min-height:460px)]:flex flex-wrap items-center justify-center gap-2.5 md:gap-3.5 rounded-full border border-white/15 bg-[#12141a]/84 backdrop-blur-md px-4 py-1 text-[11px] text-[#e5e0d5]">
                  <div className="flex items-center gap-1">
                    <Swords className={`h-3.5 w-3.5 ${equippedWeaponDef ? 'text-[#ef4444]' : 'text-[#6b7280]'}`} />
                    <span>{equippedWeaponDef ? `${equippedWeaponDef.shortName} [LMB/F]` : 'Unarmed'}</span>
                  </div>
                  <span className="text-white/20">·</span>
                  <div className="flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5 text-[#9ca3af]" />
                    <span>[Backspace]</span>
                  </div>
                  <span className="text-white/20">·</span>
                  <div className="flex items-center gap-1">
                    <Zap className={`h-3.5 w-3.5 ${hud.boost >= 20 ? 'text-[#f59e0b]' : 'text-[#6b7280]'}`} />
                    <span>[Space]</span>
                  </div>
                  <span className="text-white/20">·</span>
                  <div className="flex items-center gap-1">
                    <ArrowUp className="h-3.5 w-3.5 text-[#38bdf8]" />
                    <span>[Shift]</span>
                  </div>
                  <span className="text-white/20">·</span>
                  <div className="flex items-center gap-1">
                    <span className={`font-bold ${hud.boost >= 32 ? 'text-[#38bdf8]' : 'text-[#6b7280]'}`}>E</span>
                    <span>Pulse</span>
                  </div>
                </div>
              )}
            </div>

            {!touchEnabled && (
              <div className="hidden md:flex items-end justify-end w-[124px]">
                <div className="rounded-2xl border border-white/15 bg-[#12141a]/84 backdrop-blur-md px-3.5 py-2 text-right">
                  <div className="text-[10px] text-[#9ca3af]">Velocity</div>
                  <div className="font-mono-tabular text-sm font-bold text-[#f4efe6]">{hud.speed} m/s</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {hud.mode === 'paused' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#12141a]/65 backdrop-blur-sm p-3 sm:p-6">
          <div className="ios-spring w-full max-w-sm max-h-[94dvh] overflow-y-auto overflow-x-hidden rounded-2xl border border-white/15 bg-[#161922]/95 p-4 sm:p-6 shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-[#f4efe6]">Match Paused</h2>
            <p className="mt-1 text-xs text-[#b8b1a4]">
              Match #{hud.matchNumber} · Seed #{hud.terrainSeed % 10000} · {formatClock(hud.matchTimeRemaining)} left
            </p>

            {hud.leaderboard.length > 0 && (
              <div className="mt-4 md:hidden rounded-xl border border-white/10 bg-[#12141a]/75 p-3">
                <div className="text-[11px] font-semibold text-[#b8b1a4] mb-1.5">Top Pilots</div>
                <div className="space-y-1">
                  {hud.leaderboard.map((row, idx) => (
                    <div
                      key={row.slotId}
                      className={`flex items-center justify-between text-xs ${
                        row.isSelf ? 'font-bold text-[#fbbf24]' : row.isBot ? 'text-[#9ca3af]' : 'text-[#ffffff]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <span className="font-mono-tabular text-[11px] text-[#9ca3af] w-3">{idx + 1}</span>
                        {row.isSovereign && <Crown className="h-3 w-3 shrink-0 text-[#fbbf24]" />}
                        {!row.isBot && <User className="h-3 w-3 shrink-0 text-[#34d399]" />}
                        {row.isBot && (
                          <span className="font-mono-tabular text-[9px] text-[#64748b] shrink-0">[BOT]</span>
                        )}
                        <span className="truncate">{row.name}</span>
                      </div>
                      <span className="font-mono-tabular">{row.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-medium text-[#b8b1a4] mb-2">
                <span>Graphics Quality</span>
                <span className="font-mono-tabular text-[#f4efe6]">
                  {hud.qualitySetting === 'auto'
                    ? `Auto (${hud.activeQualityTier.toUpperCase()})`
                    : hud.activeQualityTier.toUpperCase()}{' '}
                  · {hud.graphicsBackend} · {hud.fps} FPS
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 rounded-xl border border-white/10 bg-[#101218] p-1">
                {QUALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => engineRef.current?.setQualitySetting(opt.id)}
                    className={`ios-btn min-h-[34px] rounded-lg text-xs font-medium cursor-pointer ${
                      hud.qualitySetting === opt.id
                        ? 'bg-[#e68a1e] text-[#12141a] font-bold'
                        : 'text-[#b8b1a4] hover:text-[#f4efe6]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-medium text-[#b8b1a4] mb-2">Hull Finish</div>
              <div className="grid grid-cols-8 gap-1.5">
                {HULL_PALETTE.map((swatch, idx) => (
                  <button
                    key={swatch.name}
                    type="button"
                    onClick={() => handleColorSelect(idx)}
                    title={swatch.name}
                    className={`ios-btn min-h-[32px] rounded-lg border cursor-pointer ${
                      colorIndex === idx ? 'border-white ring-2 ring-[#e68a1e]/60' : 'border-white/15'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={() => engineRef.current?.setPaused(false)}
                className="ios-btn flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#e68a1e] px-4 py-2.5 font-display text-sm font-bold text-[#12141a] hover:bg-[#f59e0b] cursor-pointer"
              >
                <Play className="h-4 w-4" />
                Resume Flight
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.toggleAllyEsp()}
                className={`ios-btn flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium cursor-pointer ${
                  hud.allyEspEnabled
                    ? 'border-[#34d399]/60 bg-[#064e3b]/45 text-[#ecfdf5]'
                    : 'border-white/15 bg-[#1e222b] text-[#b8b1a4]'
                }`}
              >
                <Users className="h-4 w-4 text-[#34d399]" />
                {hud.allyEspEnabled ? 'Ally ESP: On' : 'Ally ESP: Off'}
              </button>

              <button
                type="button"
                onClick={handleToggleTouch}
                className="ios-btn flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#1e222b] px-4 py-2.5 text-sm font-medium text-[#f4efe6] hover:bg-[#272c38] cursor-pointer"
              >
                <Smartphone className="h-4 w-4" />
                {touchEnabled ? 'Touch Controls: On' : 'Touch Controls: Off'}
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.toggleMute()}
                className="ios-btn flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#1e222b] px-4 py-2.5 text-sm font-medium text-[#f4efe6] hover:bg-[#272c38] cursor-pointer"
              >
                {hud.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {hud.muted ? 'Unmute Audio' : 'Mute Audio'}
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.leaveToTitle()}
                className="ios-btn flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm font-medium text-[#fca5a5] hover:bg-[#ef4444]/15 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Leave Arena
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POST-MATCH WINNER-ONLY SCOREBOARD & NEXT ARENA VOTE */}
      {hud.mode === 'postmatch' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#12141a]/75 backdrop-blur-sm p-2 sm:p-5">
          <div className="ios-spring flex w-full max-w-[96vw] sm:max-w-4xl max-h-[94dvh] flex-col overflow-y-auto overflow-x-hidden rounded-2xl border border-white/15 bg-[#161922]/96 p-3 sm:p-6 shadow-2xl">
            {/* Header + Winning Team Trophy */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Trophy
                    className="h-5 w-5"
                    style={{
                      color:
                        hud.winningTeam === 5 ? '#F59E0B' : hud.winningTeam === 6 ? '#38BDF8' : '#FACC15',
                    }}
                  />
                  <h2 className="font-display text-lg sm:text-2xl font-bold text-[#f4efe6]">
                    {hud.winningTeam === 5
                      ? 'TEAM SOLAR VICTORY'
                      : hud.winningTeam === 6
                      ? 'TEAM ECLIPSE VICTORY'
                      : `Match #${hud.matchNumber} Complete`}
                  </h2>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#b8b1a4]">
                  <span>{hud.mapName}</span>
                  <span aria-hidden="true">·</span>
                  {hud.specialMode ? (
                    <span className="font-semibold" style={{ color: hud.specialMode.accent }}>
                      SPECIAL: {hud.specialMode.name}
                    </span>
                  ) : (
                    <span className="font-semibold" style={{ color: hud.normalMode.accent }}>
                      {hud.normalMode.name}
                    </span>
                  )}
                  {(hud.winningTeam === 5 || hud.winningTeam === 6) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        <span className="text-[#f59e0b] font-bold">Solar {hud.solarKills} KOs</span>
                        {' vs '}
                        <span className="text-[#38bdf8] font-bold">Eclipse {hud.eclipseKills} KOs</span>
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular text-[#fbbf24] font-semibold">
                    Next match {Math.max(0, Math.ceil(hud.matchTimeRemaining))}s
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {mvpRow && (
                  <div className="text-right text-xs">
                    <div className="text-[#b8b1a4]">Match MVP</div>
                    <div className="font-mono-tabular font-bold text-[#fbbf24]">
                      {mvpRow.isBot && <span className="text-[#94a3b8] mr-1">[BOT]</span>}
                      {mvpRow.name} · {mvpRow.score}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {myPostRow && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e68a1e]/40 bg-[#e68a1e]/10 px-3 py-2 text-xs sm:text-sm">
                <div className="flex items-center gap-2 font-semibold text-[#fbbf24]">
                  <span>Your Finish: #{myPostRow.rank}</span>
                  <span className="text-white/30">·</span>
                  <span>{myPostRow.name}</span>
                </div>
                <div className="font-mono-tabular text-[#f4efe6]">
                  {myPostRow.score} Shards · {myPostRow.kills} KOs
                </div>
              </div>
            )}

            {/* Winner-Only Scoreboard Filter */}
            <div className="mt-3 sm:mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[#f4efe6]">
                {hud.winningTeam === 5 || hud.winningTeam === 6
                  ? 'Winning Team Standings (Losing Team Omitted)'
                  : 'Final Standings'}
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-[#101218] p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => setScoreFilter('all')}
                  className={`ios-btn min-h-[30px] rounded-lg px-2.5 py-1 text-[11px] sm:text-xs font-medium cursor-pointer whitespace-nowrap ${
                    scoreFilter === 'all'
                      ? 'bg-[#e68a1e] text-[#12141a] font-bold'
                      : 'text-[#b8b1a4] hover:text-[#f4efe6]'
                  }`}
                >
                  All ({hud.postMatchScores.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScoreFilter('players')}
                  className={`ios-btn min-h-[30px] rounded-lg px-2.5 py-1 text-[11px] sm:text-xs font-medium cursor-pointer whitespace-nowrap ${
                    scoreFilter === 'players'
                      ? 'bg-[#e68a1e] text-[#12141a] font-bold'
                      : 'text-[#b8b1a4] hover:text-[#f4efe6]'
                  }`}
                >
                  Players ({humanScoreCount})
                </button>
                <button
                  type="button"
                  onClick={() => setScoreFilter('bots')}
                  className={`ios-btn min-h-[30px] rounded-lg px-2.5 py-1 text-[11px] sm:text-xs font-medium cursor-pointer whitespace-nowrap ${
                    scoreFilter === 'bots'
                      ? 'bg-[#e68a1e] text-[#12141a] font-bold'
                      : 'text-[#b8b1a4] hover:text-[#f4efe6]'
                  }`}
                >
                  Bots ({botScoreCount})
                </button>
              </div>
            </div>

            {/* Scrollable Winner-Only Table */}
            <div className="mt-2 min-h-[110px] max-h-[30dvh] flex-1 overflow-y-auto rounded-xl border border-white/10 bg-[#12141a]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#181b24] text-[#9ca3af] border-b border-white/10">
                  <tr>
                    <th className="px-3 py-2 font-medium w-14">Rank</th>
                    <th className="px-3 py-2 font-medium">Pilot</th>
                    <th className="px-3 py-2 font-medium text-right w-20">KOs</th>
                    <th className="px-3 py-2 font-medium text-right w-24">Shards</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredScores.map((row) => {
                    const isSelf = row.slotId === hud.localSlotId;
                    return (
                      <tr
                        key={row.slotId}
                        className={
                          isSelf
                            ? 'bg-[#e68a1e]/12 text-[#fbbf24] font-semibold'
                            : row.isBot
                            ? 'text-[#9ca3af]'
                            : 'text-[#ffffff]'
                        }
                      >
                        <td className="px-3 py-1.5 font-mono-tabular">#{row.rank}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            {row.rank === 1 && <Crown className="h-3.5 w-3.5 text-[#fbbf24] shrink-0" />}
                            {!row.isBot && <User className="h-3.5 w-3.5 text-[#34d399] shrink-0" />}
                            {row.isBot && (
                              <span className="font-mono-tabular text-[10px] text-[#64748b] shrink-0">[BOT]</span>
                            )}
                            <span className="truncate">{row.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono-tabular">{row.kills}</td>
                        <td className="px-3 py-1.5 text-right font-mono-tabular">{row.score}</td>
                      </tr>
                    );
                  })}
                  {filteredScores.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-[#9ca3af]">
                        No pilots match the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mode Voting Grid */}
            {hud.modeVoteOptions.length > 0 && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#f4efe6]">
                    <Swords className="h-3.5 w-3.5 text-[#fbbf24]" />
                    <span>Vote Next Gamemode</span>
                  </div>
                  <span className="text-[11px] text-[#9ca3af]">Vote standard or special match</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {hud.modeVoteOptions.map((opt) => {
                    const selected = hud.myModeVote === opt.key;
                    const votes = hud.modeVotes[opt.key] || 0;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => engineRef.current?.voteMode(opt.key)}
                        className={`ios-btn flex flex-col justify-between rounded-xl border p-2.5 text-left cursor-pointer min-h-[72px] ${
                          selected
                            ? 'border-[#fbbf24] bg-[#fbbf24]/15'
                            : 'border-white/12 bg-[#12141a] hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="font-mono-tabular text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-[#12141a]"
                            style={{ backgroundColor: opt.accent }}
                          >
                            {opt.kind === 'special' ? 'SPECIAL' : 'MODE'}
                          </span>
                          {selected && <Check className="h-3.5 w-3.5 text-[#fbbf24] shrink-0" />}
                        </div>
                        <div className="mt-1 text-xs font-bold text-[#f4efe6] truncate">{opt.name}</div>
                        <p className="mt-0.5 text-[10px] leading-snug text-[#9ca3af] line-clamp-2">{opt.subtitle}</p>
                        <div className="mt-1.5 text-right font-mono-tabular text-[11px] font-semibold text-[#f4efe6]">
                          {votes} {votes === 1 ? 'vote' : 'votes'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 11-World Arena Voting Grid */}
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#f4efe6]">
                  <MapIcon className="h-3.5 w-3.5 text-[#e68a1e]" />
                  <span>Vote Next Arena World</span>
                </div>
                <span className="text-[11px] text-[#9ca3af]">
                  Random seed every round · 11 distinct worlds
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {MAP_DEFS.map((m) => {
                  const selected = hud.myVote === m.id;
                  const votes = hud.mapVotes[m.id as MapId] || 0;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => engineRef.current?.voteMap(m.id)}
                      className={`ios-btn flex flex-col justify-between rounded-xl border p-2.5 text-left cursor-pointer min-h-[76px] ${
                        selected
                          ? 'border-[#e68a1e] bg-[#e68a1e]/15'
                          : 'border-white/12 bg-[#12141a] hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-[#f4efe6] truncate">{m.name}</span>
                        {selected && <Check className="h-3.5 w-3.5 text-[#fbbf24] shrink-0" />}
                      </div>
                      <p className="mt-1 text-[10px] leading-snug text-[#9ca3af] line-clamp-2">{m.subtitle}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span
                          className="h-1.5 w-5 rounded-full"
                          style={{ backgroundColor: m.uiAccent }}
                        />
                        <span className="font-mono-tabular font-semibold text-[#f4efe6]">
                          {votes}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MY PHOTOS GALLERY & 3D RAYTRACE STUDIO (Home Screen PC) */}
      {showMyPhotos && hud.mode === 'title' && (
        <MyPhotosStudio onClose={() => setShowMyPhotos(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <SolarisErrorBoundary>
      <AppContent />
    </SolarisErrorBoundary>
  );
}
