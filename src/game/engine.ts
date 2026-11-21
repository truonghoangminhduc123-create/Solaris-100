import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { WebGPURenderer } from 'three/webgpu';
import {
  ARENA_RADIUS,
  ARSENAL_LADDER,
  CRYSTAL_COUNT,
  EVENT_INTERVAL_SECONDS,
  MATCH_DURATION_SECONDS,
  MAX_PLAYERS,
  MAX_WEAPON_SLOTS,
  POWER_ORB_COUNT,
  RESPAWN_DURATION_SECONDS,
  SENTINEL_COUNT,
  STARTER_RECHARGE_SECONDS,
  decodeSnapshot,
  generateCrystalLayout,
  getApartmentSupportY,
  getEventByIndex,
  getEventDef,
  getMapByIndex,
  getMapDef,
  getMapPylons,
  getNextbotDef,
  getNormalModeByIndex,
  getNormalModeDef,
  getSkillDef,
  getSpecialModeByIndex,
  getSpecialModeDef,
  getWeaponDef,
  groundHeightAt,
  isSpaceMap,
  isStadiumMap,
  raycastApartments,
} from '../../shared/world';
import type {
  CrystalSpawn,
  DisasterPillarSync,
  EventDef,
  EventId,
  FireZoneSync,
  GroundWeaponSync,
  MapId,
  MatchPhase,
  ModeHudPayload,
  ModeVoteOption,
  NormalModeDef,
  NormalModeId,
  SkillId,
  SnapshotNextbot,
  SnapshotPlayer,
  SnapshotSentinel,
  SolarBallSync,
  SpecialModeDef,
  SpecialModeId,
  ThrownProjectileSync,
  WeaponId,
  WeaponSlotState,
} from '../../shared/world';
import { SolarisAudio } from './audio';
import { createMaterialBank } from './materials';
import type { MaterialBank } from './materials';
import {
  createArenaEnvironment,
  createDisasterPillarMesh,
  createFireZoneVisual,
  createGroundWeaponRig,
  createNextbotRig,
  createSentinelRig,
  createSkimmerRig,
  createSolarBallRig,
  createWeaponMesh,
  getPaletteColorHex,
} from './models';
import type {
  ArenaEnvironment,
  GroundWeaponRig,
  NextbotRig,
  SentinelRig,
  SkimmerRig,
} from './models';
import { saveNewPhoto } from './photoStorage';
import type { FrozenSceneSnapshot } from './photoStorage';

export type GameMode = 'title' | 'playing' | 'paused' | 'postmatch' | 'server_full';
export type GraphicsBackend = 'WebGPU' | 'WebGL2' | 'Software';
export type GraphicsQualitySetting = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export type GraphicsQualityTier = 'low' | 'medium' | 'high' | 'ultra';

interface QualityProfile {
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  transmission: boolean;
  ultraPbr: boolean;
  bloom: boolean;
  godRays: boolean;
  filmicGrade: boolean;
  msaa: boolean;
  envIntensity: number;
  cameraFar: number;
  fogMul: number;
  maxSparks: number;
  maxNameplates: number;
  nameplateDistSq: number;
  fullRigDistSq: number;
  shadowCastDistSq: number;
}

const QUALITY_TIERS: GraphicsQualityTier[] = ['low', 'medium', 'high', 'ultra'];

const QUALITY_PROFILES: Record<GraphicsQualityTier, QualityProfile> = {
  low: {
    maxPixelRatio: 4.0, // Never reduce screen resolution
    shadows: false,
    shadowMapSize: 512,
    transmission: false,
    ultraPbr: false,
    bloom: false,
    godRays: false,
    filmicGrade: false,
    msaa: false,
    envIntensity: 0,
    cameraFar: 560,
    fogMul: 1.15,
    maxSparks: 24,
    maxNameplates: 5,
    nameplateDistSq: 56 * 56,
    fullRigDistSq: 48 * 48,
    shadowCastDistSq: 0,
  },
  medium: {
    maxPixelRatio: 4.0, // Never reduce screen resolution
    shadows: false,
    shadowMapSize: 1024,
    transmission: false,
    ultraPbr: true,
    bloom: false,
    godRays: false,
    filmicGrade: false,
    msaa: false,
    envIntensity: 0.72,
    cameraFar: 720,
    fogMul: 1.0,
    maxSparks: 120,
    maxNameplates: 7,
    nameplateDistSq: 78 * 78,
    fullRigDistSq: 85 * 85,
    shadowCastDistSq: 0,
  },
  high: {
    maxPixelRatio: 4.0, // Never reduce screen resolution
    shadows: true,
    shadowMapSize: 1024,
    transmission: false,
    ultraPbr: true,
    bloom: true,
    godRays: false,
    filmicGrade: true,
    msaa: true,
    envIntensity: 0.68,
    cameraFar: 900,
    fogMul: 0.92,
    maxSparks: 180,
    maxNameplates: 9,
    nameplateDistSq: 92 * 92,
    fullRigDistSq: 120 * 120,
    shadowCastDistSq: 64 * 64,
  },
  ultra: {
    maxPixelRatio: 4.0, // True 1:1 native screen pixel ratio without cap
    shadows: true,
    shadowMapSize: 2048,
    transmission: true,
    ultraPbr: true,
    bloom: true,
    godRays: true,
    filmicGrade: true,
    msaa: true,
    envIntensity: 0.74,
    cameraFar: 1060,
    fogMul: 0.84,
    maxSparks: 240,
    maxNameplates: 11,
    nameplateDistSq: 110 * 110,
    fullRigDistSq: 175 * 175,
    shadowCastDistSq: 96 * 96,
  },
};

const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.7) },
    uSunVisible: { value: 1.0 },
    uIntensity: { value: 0.10 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunScreen;
    uniform float uSunVisible;
    uniform float uIntensity;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uSunVisible <= 0.001 || uIntensity <= 0.001) {
        gl_FragColor = base;
        return;
      }
      float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 0.08;
      vec2 delta = (vUv - uSunScreen) * (0.52 / 18.0);
      vec2 coord = vUv - delta * dither;
      float illumDecay = 1.0;
      float shafts = 0.0;
      for (int i = 0; i < 18; i++) {
        coord -= delta;
        vec3 s = texture2D(tDiffuse, clamp(coord, 0.001, 0.999)).rgb;
        float lum = dot(s, vec3(0.299, 0.587, 0.114));
        float bright = smoothstep(0.88, 1.25, lum);
        shafts += bright * illumDecay * 0.048;
        illumDecay *= 0.93;
      }
      float sunDist = length(vUv - uSunScreen);
      float radial = max(0.0, 1.0 - sunDist * 0.95);
      float corona = exp(-sunDist * 7.8) * 0.13;
      vec3 sunTint = vec3(1.0, 0.90, 0.74);
      gl_FragColor = vec4(base.rgb + sunTint * (shafts * radial + corona) * uSunVisible * uIntensity, base.a);
    }
  `,
};

// Runs AFTER OutputPass (in tone-mapped perceptual sRGB [0..1] space) for true cinematic contrast & rich shadows.
const FilmicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1.16 },
    uShadowDepth: { value: 0.15 },
    uSaturation: { value: 1.11 },
    uVignette: { value: 0.20 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uShadowDepth;
    uniform float uSaturation;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = clamp(tex.rgb, 0.0, 1.0);

      // 1) Cinematic shadow toe: deepens dark tones cleanly without lifting dark scenes
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float toe = smoothstep(0.0, 0.36, luma);
      vec3 graded = mix(col * (1.0 - uShadowDepth * (1.0 - toe)), col, toe);

      // 2) Perceptual mid-pivot contrast + soft highlight rolloff
      graded = clamp((graded - 0.52) * uContrast + 0.52, 0.0, 1.0);

      // 3) Subtle film split-tone (cool steel shadows -> warm sunlit highlights)
      float outLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.95, 0.98, 1.04);
      vec3 highlightTint = vec3(1.03, 1.00, 0.96);
      graded *= mix(shadowTint, highlightTint, smoothstep(0.18, 0.84, outLuma));

      // 4) Controlled cinema saturation
      outLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      graded = mix(vec3(outLuma), graded, uSaturation);

      // 5) Subtle peripheral vignette for focus
      float dist = length(vUv - vec2(0.5));
      float vig = 1.0 - smoothstep(0.45, 0.90, dist) * uVignette;

      gl_FragColor = vec4(clamp(graded * vig, 0.0, 1.0), tex.a);
    }
  `,
};

/**
 * One-way center-weighted HDR Auto-Exposure pass ("Light Focus / Lấy nét sáng").
 * Bright views smoothly dim highlights back into crisp detail; dark views NEVER brighten above 1.0x.
 */
class AutoExposurePass extends Pass {
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private pingPong = 0;
  private hasHistory = false;
  private meterMat: THREE.ShaderMaterial;
  private applyMat: THREE.ShaderMaterial;
  private meterQuad: FullScreenQuad;
  private applyQuad: FullScreenQuad;

  constructor() {
    super();
    const rtOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);

    this.meterMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tPrevExp: { value: null },
        uHasHistory: { value: 0.0 },
        uDt: { value: 0.016 },
        uThreshold: { value: 0.32 },
        uMinExposure: { value: 0.46 },
        uAdaptDownRate: { value: 4.2 },
        uAdaptUpRate: { value: 1.6 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform sampler2D tPrevExp;
        uniform float uHasHistory;
        uniform float uDt;
        uniform float uThreshold;
        uniform float uMinExposure;
        uniform float uAdaptDownRate;
        uniform float uAdaptUpRate;
        varying vec2 vUv;

        void main() {
          float sumLuma = 0.0;
          float sumWeight = 0.0;
          float maxLuma = 0.0;

          for (int y = 0; y < 5; y++) {
            float fy = 0.14 + float(y) * 0.18;
            for (int x = 0; x < 5; x++) {
              float fx = 0.14 + float(x) * 0.18;
              vec2 sampleUv = vec2(fx, fy);
              vec3 s = max(vec3(0.0), texture2D(tScene, sampleUv).rgb);
              float luma = min(dot(s, vec3(0.2126, 0.7152, 0.0722)), 6.0);
              vec2 d = sampleUv - vec2(0.5);
              float w = exp(-dot(d, d) * 4.2);
              sumLuma += luma * w;
              sumWeight += w;
              maxLuma = max(maxLuma, luma);
            }
          }

          float avgLuma = sumLuma / max(sumWeight, 0.001);
          float meteredLuma = mix(avgLuma, maxLuma, 0.22);

          // Strict one-way cap at 1.0: bright scenes pull exposure down; dark scenes stay <= 1.0
          float excess = max(0.0, meteredLuma - uThreshold);
          float targetExp = clamp(1.0 / (1.0 + excess * 0.65), uMinExposure, 1.0);

          float prevExp = uHasHistory > 0.5
            ? clamp(texture2D(tPrevExp, vec2(0.5)).r, uMinExposure, 1.0)
            : targetExp;

          float rate = targetExp < prevExp ? uAdaptDownRate : uAdaptUpRate;
          float nextExp = clamp(mix(prevExp, targetExp, 1.0 - exp(-rate * uDt)), uMinExposure, 1.0);

          gl_FragColor = vec4(nextExp, meteredLuma, targetExp, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.applyMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tExposure: { value: null },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tExposure;
        varying vec2 vUv;
        void main() {
          vec4 col = texture2D(tDiffuse, vUv);
          float expMul = clamp(texture2D(tExposure, vec2(0.5)).r, 0.35, 1.0);
          gl_FragColor = vec4(col.rgb * expMul, col.a);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.meterQuad = new FullScreenQuad(this.meterMat);
    this.applyQuad = new FullScreenQuad(this.applyMat);
    this.needsSwap = true;
  }

  public resetHistory(): void {
    this.hasHistory = false;
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
  ): void {
    const prevRt = this.pingPong === 0 ? this.rtA : this.rtB;
    const nextRt = this.pingPong === 0 ? this.rtB : this.rtA;

    this.meterMat.uniforms.tScene.value = readBuffer.texture;
    this.meterMat.uniforms.tPrevExp.value = prevRt.texture;
    this.meterMat.uniforms.uHasHistory.value = this.hasHistory ? 1.0 : 0.0;
    this.meterMat.uniforms.uDt.value = Math.min(0.1, Math.max(0.001, Number.isFinite(deltaTime) ? deltaTime : 0.016));

    renderer.setRenderTarget(nextRt);
    this.meterQuad.render(renderer);

    this.hasHistory = true;
    this.pingPong = 1 - this.pingPong;

    this.applyMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.applyMat.uniforms.tExposure.value = nextRt.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) {
        renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      }
    }
    this.applyQuad.render(renderer);
  }

  public override dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    this.meterMat.dispose();
    this.applyMat.dispose();
  }
}

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: (options?: {
      powerPreference?: 'high-performance' | 'low-power';
    }) => Promise<{ info?: { isFallbackAdapter?: boolean } } | null>;
  };
};

type AnyRenderer = THREE.WebGLRenderer | WebGPURenderer;

export interface PlayerMeta {
  slotId: number;
  name: string;
  colorIndex: number;
  isBot: boolean;
}

export interface KillFeedItem {
  id: number;
  text: string;
  accent: string;
  createdAt: number;
}

export interface PylonHudState {
  id: number;
  name: string;
  ownerSlotId: number | null;
  ownerName: string;
  ownerColor: number;
  progress: number;
}

export interface PostMatchRow {
  slotId: number;
  name: string;
  score: number;
  kills: number;
  colorIndex: number;
  isBot: boolean;
  rank: number;
  team?: number;
}

export interface RoleBannerHud {
  id: number;
  modeName: string;
  headline: string;
  rankLine: string;
  tutorialLine: string;
  accent: string;
  startedAt: number;
}

export interface SuperWeaponAlertHud {
  uid: number;
  weaponId: WeaponId;
  name: string;
  shortName: string;
  x: number;
  z: number;
  durability: number;
  maxDurability: number;
  color: string;
  startedAt: number;
}

export interface SuperWeaponBeaconHud {
  uid: number;
  name: string;
  shortName: string;
  x: number;
  z: number;
  durability: number;
  maxDurability: number;
  distance: number;
  compassDir: string;
  color: string;
}

export interface FloatingDmgHud {
  id: number;
  dmg: number;
  x: number;
  y: number;
  alpha: number;
  crit: boolean;
}

export interface ComboToastHud {
  id: number;
  label: string;
  sub: string;
  accent: string;
}

export interface HudSnapshot {
  connected: boolean;
  mode: GameMode;
  matchPhase: MatchPhase;
  mapId: MapId;
  mapName: string;
  terrainSeed: number;
  matchNumber: number;
  normalMode: NormalModeDef;
  specialMode: SpecialModeDef | null;
  modeHud: ModeHudPayload;
  roleBanner: RoleBannerHud | null;
  matchTimeRemaining: number;
  activeEvent: EventDef | null;
  activeEventTimer: number;
  nextEventIn: number;
  onlinePlayers: number;
  botCount: number;
  totalPilots: number;
  maxPlayers: number;
  pingMs: number;
  localSlotId: number | null;
  alive: boolean;
  respawnSeconds: number;
  shield: number;
  boost: number;
  score: number;
  kills: number;
  rank: number;
  speed: number;
  skills: SkillId[];
  starterSkill: SkillId;
  starterCooldown: number;
  nextReplaceSlot: number;
  weapons: WeaponSlotState[];
  equippedWeaponSlot: number;
  weaponCooldownRatio: number;
  throwChargeRatio: number;
  superWeaponAlert: SuperWeaponAlertHud | null;
  superWeaponBeacon: SuperWeaponBeaconHud | null;
  sovereignName: string;
  sovereignScore: number;
  sovereignIsBot: boolean;
  isSovereign: boolean;
  winningTeam: number;
  solarKills: number;
  eclipseKills: number;
  spectateActive: boolean;
  spectatingName: string;
  spectatingIsBot: boolean;
  guiHidden: boolean;
  leaderboard: Array<{
    slotId: number;
    name: string;
    score: number;
    colorIndex: number;
    isSelf: boolean;
    isSovereign: boolean;
    isBot: boolean;
  }>;
  radarBlips: Array<{
    x: number;
    z: number;
    isSelf: boolean;
    isSovereign: boolean;
    isBot: boolean;
    specialRole: number;
    teamId: 0 | 5 | 6;
    colorHex: string;
  }>;
  radarNextbots: Array<{
    x: number;
    z: number;
    slowed: boolean;
  }>;
  radarSuperWeapons: Array<{
    x: number;
    z: number;
    color: string;
  }>;
  nameplates: Array<{
    slotId: number;
    name: string;
    x: number;
    y: number;
    shield: number;
    isSovereign: boolean;
    isBot: boolean;
    specialRole: number;
    colorHex: string;
  }>;
  nextbotNameplates: Array<{
    id: number;
    name: string;
    x: number;
    y: number;
    slowed: boolean;
    accent: string;
  }>;
  pylons: PylonHudState[];
  feed: KillFeedItem[];
  postMatchScores: PostMatchRow[];
  mapVotes: Record<MapId, number>;
  myVote: MapId | null;
  modeVoteOptions: ModeVoteOption[];
  modeVotes: Record<string, number>;
  myModeVote: string | null;
  hitmarkerActive: boolean;
  floatingDmgs: FloatingDmgHud[];
  comboToast: ComboToastHud | null;
  localSpecialRole: number;
  localTeamId: 0 | 5 | 6;
  allyEspEnabled: boolean;
  arsenalTier: number;
  lowHpIntensity: number;
  damageIndicators: Array<{ id: number; angleDeg: number; opacity: number }>;
  photoToast: string | null;
  muted: boolean;
  webglLost: boolean;
  pointerLocked: boolean;
  pointerLockBlocked: boolean;
  graphicsBackend: GraphicsBackend;
  qualitySetting: GraphicsQualitySetting;
  activeQualityTier: GraphicsQualityTier;
  fps: number;
}

interface TrackedPlayer {
  slotId: number;
  rig: SkimmerRig;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  targetRoll: number;
  targetPitch: number;
  targetScale: number;
  renderX: number;
  renderY: number;
  renderZ: number;
  renderYaw: number;
  renderRoll: number;
  renderPitch: number;
  renderScale: number;
  shield: number;
  boost: number;
  score: number;
  alive: boolean;
  dashing: boolean;
  pulsing: boolean;
  sovereign: boolean;
  grounded: boolean;
  isBot: boolean;
  shielded: boolean;
  overdrive: boolean;
  specialRole: number;
  teamId: 0 | 5 | 6;
  weaponKindIndex: number;
  attacking: boolean;
  colorIndex: number;
  lastPulseFlag: boolean;
  lastDashFlag: boolean;
}

interface TrackedSentinel {
  id: number;
  rig: SentinelRig;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  state: number;
  hp: number;
}

interface TrackedNextbot {
  id: number;
  variant: number;
  rig: NextbotRig;
  targetX: number;
  targetY: number;
  targetZ: number;
  renderX: number;
  renderY: number;
  renderZ: number;
  slowed: boolean;
  banished: boolean;
}

interface SparkParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

interface SmokePuffVfx {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  baseOpacity: number;
}

interface DynamicPointLightSlot {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  peakIntensity: number;
}

interface TransientRingVfx {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface TransientBeamVfx {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  length: number;
  colorHex: number;
}

interface TransientBulletVfx {
  group: THREE.Group;
  headMat: THREE.MeshStandardMaterial;
  tailMat: THREE.MeshStandardMaterial;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  speed: number;
  traveled: number;
  totalDist: number;
  length: number;
  colorHex: number;
  mythic: boolean;
  splashRadius: number;
}

interface FallingMeteorVfx {
  meteorMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  x: number;
  groundY: number;
  z: number;
  delay: number;
  elapsed: number;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _dummy = new THREE.Object3D();

const THROW_CHARGE_SECONDS = 3.0;

function lerpAngle(current: number, target: number, t: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

function shortestAngleDelta(current: number, target: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function emptyMapVotes(): Record<MapId, number> {
  return {
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
  };
}

function detectMobilePhone(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
    Boolean(
      window.matchMedia?.('(pointer: coarse)').matches &&
        !window.matchMedia?.('(any-pointer: fine)').matches &&
        navigator.maxTouchPoints > 0,
    )
  );
}

export class SolarisEngine {
  private container: HTMLElement;
  private onHudUpdate: (hud: HudSnapshot) => void;
  private audio = new SolarisAudio();

  private renderer!: AnyRenderer;
  private rendererReady = false;
  private composer: EffectComposer | null = null;
  private composerRt: THREE.WebGLRenderTarget | null = null;
  private godRaysPass: ShaderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private autoExposurePass: AutoExposurePass | null = null;
  private gradePass: ShaderPass | null = null;
  private fallbackExpMul = 1;
  private pendingSnapshot: Parameters<SolarisEngine['applySnapshot']>[0] | null = null;
  private isWebGPU = false;
  private graphicsBackend: GraphicsBackend = 'WebGL2';
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private hemiLight!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private envTexture: THREE.Texture | null = null;
  private materials!: MaterialBank;
  private arena!: ArenaEnvironment;
  private isSoftwareGl = false;
  private readonly isMobileDevice: boolean;
  private viewWidth = 1280;
  private viewHeight = 720;

  private allyEspEnabled = true;
  private overlayLayer: HTMLElement | null = null;
  private nameplateNodes = new Map<
    number,
    { el: HTMLDivElement; badgeEl: HTMLDivElement; barFill: HTMLDivElement; sig: string; lastPct: number }
  >();
  private allyEspNodes = new Map<
    number,
    {
      el: HTMLDivElement;
      arrowEl: HTMLSpanElement;
      distEl: HTMLSpanElement;
      sig: string;
    }
  >();
  private nextbotOverlayNodes = new Map<
    number,
    { el: HTMLDivElement; pillEl: HTMLDivElement; sig: string }
  >();
  private floatDmgNodes = new Map<number, { el: HTMLDivElement; crit: boolean }>();

  private qualitySetting: GraphicsQualitySetting = 'auto';
  private activeQualityTier: GraphicsQualityTier = 'high';
  private smoothedFps = 60;
  private lastPerfNow = performance.now();
  private autoEvalAccum = 0;
  private lowFpsStreak = 0;
  private highFpsStreak = 0;
  private lastQualitySwitchAt = 0;
  private activeSparkLimit = 180;

  private touchEnabled = false;
  private pointerLocked = false;
  private pointerLockBlocked = false;
  private draggingSteer = false;

  private activeMapId: MapId = 'metro_city';
  private terrainSeed = 1;
  private matchNumber = 1;
  private activeNormalModeId: NormalModeId = 'team_clash';
  private activeSpecialModeId: SpecialModeId = 'none';
  private modeHud: ModeHudPayload = { normalModeId: 'team_clash', specialModeId: 'none' };
  private roleBanner: RoleBannerHud | null = null;
  private nextBannerId = 1;
  private matchPhase: MatchPhase = 'active';
  private matchTimeRemaining = MATCH_DURATION_SECONDS;
  private activeEventId: EventId = 'none';
  private activeEventTimer = 0;
  private nextEventIn = EVENT_INTERVAL_SECONDS;
  private solarZoneGroup: THREE.Group | null = null;
  private solarZoneRingMat: THREE.MeshBasicMaterial | null = null;
  private solarZonePillarMat: THREE.MeshBasicMaterial | null = null;
  private solarZoneGeos: THREE.BufferGeometry[] = [];
  private lavaVisualActive = false;

  private crystalLayouts: CrystalSpawn[] = generateCrystalLayout('metro_city', 1);
  private crystalActive: boolean[] = new Array(CRYSTAL_COUNT).fill(true);
  private orbActive: boolean[] = new Array(POWER_ORB_COUNT).fill(true);
  private standardCrystalMesh!: THREE.InstancedMesh;
  private coreCrystalMesh!: THREE.InstancedMesh;
  private standardCrystalIndices: number[] = [];
  private coreCrystalIndices: number[] = [];

  private readonly MAX_SPARKS = 240;
  private sparks: SparkParticle[] = [];
  private sparkMesh!: THREE.InstancedMesh;
  private smokeVfx: SmokePuffVfx[] = [];
  private dynamicLights: DynamicPointLightSlot[] = [];

  private ringVfx: TransientRingVfx[] = [];
  private beamVfx: TransientBeamVfx[] = [];
  private bulletVfx: TransientBulletVfx[] = [];
  private meteorVfx: FallingMeteorVfx[] = [];
  private sharedRingGeo = new THREE.RingGeometry(0.85, 1.0, 32);
  private sharedBeamGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 10);
  private sharedBulletHeadGeo = new THREE.SphereGeometry(0.15, 8, 6);
  private sharedBulletTailGeo = (() => {
    const g = new THREE.CylinderGeometry(0.035, 0.125, 1, 8, 1, false);
    g.rotateX(Math.PI / 2);
    return g;
  })();
  private sharedMeteorGeo = new THREE.DodecahedronGeometry(1.5, 0);
  private sharedMeteorMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xdc2626,
    emissiveIntensity: 1.4,
    roughness: 0.35,
  });

  // Dynamic World Entities (Thrown Projectiles, Fire/Cryo Zones, Disaster Pillars, Solar Ball, 3D Throw Trajectory)
  private trackedThrown = new Map<
    number,
    { data: ThrownProjectileSync; group: THREE.Group; renderPos: THREE.Vector3; dispose: () => void }
  >();
  private trackedFireZones = new Map<
    number,
    {
      data: FireZoneSync;
      visual: ReturnType<typeof createFireZoneVisual>;
      flames: THREE.Sprite[];
      flameMats: THREE.SpriteMaterial[];
    }
  >();
  private disasterPillarMeshes: Array<{ group: THREE.Group; dispose: () => void }> = [];
  private pendingDisasterPillars: DisasterPillarSync[] | null = null;
  private solarBallRig: ReturnType<typeof createSolarBallRig> | null = null;
  private solarBallTarget: SolarBallSync | null = null;

  private trajectoryPoints: THREE.Points | null = null;
  private trajectoryPositions = new Float32Array(26 * 3);

  private trackedPlayers = new Map<number, TrackedPlayer>();
  private playerMeta = new Map<number, PlayerMeta>();
  private sentinels: TrackedSentinel[] = [];
  private trackedNextbots = new Map<number, TrackedNextbot>();
  private groundWeaponRigs = new Map<
    number,
    {
      data: GroundWeaponSync;
      rig: GroundWeaponRig & { isThrowable: boolean; isSuper: boolean };
      spinY: number;
      airSpinX: number;
      cachedX: number;
      cachedZ: number;
      cachedGy: number;
    }
  >();
  private pendingGroundWeapons: GroundWeaponSync[] | null = null;
  private pylonStates: PylonHudState[] = getMapPylons('metro_city').map((p) => ({
    id: p.id,
    name: p.name,
    ownerSlotId: null,
    ownerName: '',
    ownerColor: 0,
    progress: 0,
  }));

  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private inputInterval: number | null = null;
  private connected = false;
  private mode: GameMode = 'title';
  private localSlotId: number | null = null;
  private localTeamId: 0 | 5 | 6 = 0;
  private lastJoinParams: { name: string; colorIndex: number; starterSkill: SkillId } | null = null;
  private missingLocalSince: number | null = null;
  private lastAutoRejoinAt = 0;
  private onlinePlayers = 0;
  private botCount = 0;
  private pingMs = 0;
  private sovereignSlotId = 0xffff;
  private beamAngle = 0;

  // Title Spectate & Hide GUI (Title screen only)
  private spectateActive = false;
  private spectatingSlotId: number | null = null;
  private guiHidden = false;

  // Player progression, weapons & post-match
  private skills: SkillId[] = [];
  private starterSkill: SkillId = 'nova_blast';
  private starterCooldown = 0;
  private nextReplaceSlot = 0;
  private weapons: WeaponSlotState[] = [];
  private equippedWeaponSlot = 0;
  private weaponCooldownTimer = 0;
  private weaponCooldownDuration = 0.35;
  private fireHeld = false;
  private fireFromTouch = false;
  private lastTouchAimAt = 0;
  private aimAssistTargetKey: string | null = null;
  private aimAssistFriction = 1;
  private fireStickX = 0;
  private fireStickY = 0;
  private throwChargeTimer = 0;
  private superWeaponAlert: SuperWeaponAlertHud | null = null;
  private kills = 0;
  private winningTeam = 0;
  private solarKills = 0;
  private eclipseKills = 0;
  private postMatchScores: PostMatchRow[] = [];
  private mapVotes: Record<MapId, number> = emptyMapVotes();
  private myVote: MapId | null = null;
  private modeVoteOptions: ModeVoteOption[] = [];
  private modeVotes: Record<string, number> = {};
  private myModeVote: string | null = null;
  private hitmarkerUntil = 0;
  private floatingDmgs: Array<{ id: number; dmg: number; x: number; y: number; z: number; bornAt: number }> = [];
  private nextFloatDmgId = 1;
  private comboToast: { id: number; label: string; sub: string; accent: string; until: number } | null = null;
  private nextComboToastId = 1;
  private damageIndicators: Array<{ id: number; fromX: number; fromZ: number; bornAt: number; duration: number }> = [];
  private nextDmgIndicatorId = 1;
  private spawnIntroElapsed = 0;
  private spawnIntroDuration = 0;
  private spawnIntroStartPos = new THREE.Vector3(0, 42, 95);
  private spawnIntroStartLook = new THREE.Vector3(0, 7, 0);
  private spawnIntroStartFov = 78;
  private pendingKeySCapture: { snapshot: FrozenSceneSnapshot; pressedAt: number } | null = null;
  private photoToastText: string | null = null;
  private photoToastUntil = 0;

  private heldKeys = new Set<string>();
  private touchMoveX = 0;
  private touchMoveZ = 0;
  private dashBufferedUntil = 0;
  private pulseBufferedUntil = 0;
  private jumpBufferedUntil = 0;
  private mouseSteerNormX = 0;
  private localYaw = 0;
  private localPitch = 0;
  private localSpeed = 0;
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private respawnCountdown = 0;
  private lastAlive = true;

  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private hudEmitAccum = 0;
  private webglLost = false;
  private feed: KillFeedItem[] = [];
  private nextFeedId = 1;

  constructor(container: HTMLElement, onHudUpdate: (hud: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.isMobileDevice = detectMobilePhone();
    document.documentElement.classList.toggle('is-mobile', this.isMobileDevice);
    this.viewWidth = this.container.clientWidth || window.innerWidth || 1280;
    this.viewHeight = this.container.clientHeight || window.innerHeight || 720;

    const savedQuality = localStorage.getItem('solaris100_quality');
    if (
      savedQuality === 'auto' ||
      savedQuality === 'low' ||
      savedQuality === 'medium' ||
      savedQuality === 'high' ||
      savedQuality === 'ultra'
    ) {
      this.qualitySetting = savedQuality;
    }
    const savedEsp = localStorage.getItem('solaris100_ally_esp');
    this.allyEspEnabled = savedEsp !== 'false';

    this.sharedRingGeo.rotateX(-Math.PI / 2);
    this.sharedBeamGeo.rotateX(Math.PI / 2);

    this.initScene();
    this.bindWindowEvents();
    this.connectWebSocket();
    void this.initRendererAsync();
  }

  public setOverlayElement(el: HTMLElement | null): void {
    if (this.overlayLayer === el) return;
    this.clearOverlayNodes();
    this.overlayLayer = el;
  }

  public setAllyEspEnabled(enabled: boolean): void {
    if (this.allyEspEnabled === enabled) return;
    this.allyEspEnabled = enabled;
    localStorage.setItem('solaris100_ally_esp', String(enabled));
    if (!enabled) {
      for (const node of this.allyEspNodes.values()) {
        node.el.remove();
      }
      this.allyEspNodes.clear();
    }
    this.emitHud();
  }

  public toggleAllyEsp(): void {
    this.setAllyEspEnabled(!this.allyEspEnabled);
  }

  private clearOverlayNodes(): void {
    for (const n of this.nameplateNodes.values()) n.el.remove();
    this.nameplateNodes.clear();
    for (const n of this.allyEspNodes.values()) n.el.remove();
    this.allyEspNodes.clear();
    for (const n of this.nextbotOverlayNodes.values()) n.el.remove();
    this.nextbotOverlayNodes.clear();
    for (const n of this.floatDmgNodes.values()) n.el.remove();
    this.floatDmgNodes.clear();
  }

  private clampPitch(p: number): number {
    const limit = isSpaceMap(this.activeMapId) ? 1.48 : 1.28;
    return Math.max(-limit, Math.min(limit, p));
  }

  private detectSoftwareGl(): boolean {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  }

  private pickInitialAutoTier(): GraphicsQualityTier {
    if (this.isSoftwareGl || this.isMobileDevice) return 'low';
    const cores = navigator.hardwareConcurrency || 4;
    if (this.isWebGPU || cores >= 8) return 'ultra';
    return 'high';
  }

  private initScene(): void {
    const w = this.container.clientWidth || window.innerWidth || 1280;
    const h = this.container.clientHeight || window.innerHeight || 720;
    this.viewWidth = w;
    this.viewHeight = h;

    this.scene = new THREE.Scene();
    const mapDef = getMapDef(this.activeMapId);
    this.scene.background = new THREE.Color(mapDef.skyHex);
    this.scene.fog = new THREE.FogExp2(mapDef.skyHex, mapDef.fogDensity);

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.2, 820);
    this.camera.position.set(0, 42, 115);

    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0xb48a5a, 0.48);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff1d6, 1.92);
    this.keyLight.position.set(85, 130, 65);
    this.keyLight.castShadow = false;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 280;
    const d = 72;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.024;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.64);
    rimLight.position.set(-90, 55, -110);
    this.scene.add(rimLight);
    this.rimLight = rimLight;

    // Pooled dynamic point lights for PC explosion flashes, fire glow & mythic beacons
    // Skipped on mobile phones so GPU shaders compile without 6 dynamic point-light loops
    if (!this.isMobileDevice) {
      for (let i = 0; i < 6; i++) {
        const light = new THREE.PointLight(0xffaa44, 0, 48, 1.5);
        light.position.set(0, -999, 0);
        this.scene.add(light);
        this.dynamicLights.push({ light, life: 0, maxLife: 0.4, peakIntensity: 0 });
      }
    }

    this.initSolarZone();
    this.initTrajectoryPreview();
  }

  private initTrajectoryPreview(): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trajectoryPositions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfacc15,
      size: 0.72,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.trajectoryPoints = pts;
  }

  private initSolarZone(): void {
    const group = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(22.6, 24.2, 56);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    group.add(ringMesh);

    const pillarGeo = new THREE.CylinderGeometry(23.8, 23.8, 26, 40, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xfb923c,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
    pillarMesh.position.y = 13;
    group.add(pillarMesh);

    group.visible = false;
    this.scene.add(group);
    this.solarZoneGroup = group;
    this.solarZoneRingMat = ringMat;
    this.solarZonePillarMat = pillarMat;
    this.solarZoneGeos = [ringGeo, pillarGeo];
  }

  private async initRendererAsync(): Promise<void> {
    this.isSoftwareGl = this.detectSoftwareGl();
    const w = this.container.clientWidth || window.innerWidth || 1280;
    const h = this.container.clientHeight || window.innerHeight || 720;
    this.viewWidth = w;
    this.viewHeight = h;

    let createdRenderer: AnyRenderer | null = null;
    let useWebGPU = false;
    let webgpuMod: typeof import('three/webgpu') | null = null;

    const gpuNav = navigator as GpuNavigator;
    if (typeof gpuNav.gpu !== 'undefined' && !this.isSoftwareGl && !this.isMobileDevice) {
      try {
        const adapter = await gpuNav.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (this.disposed) return;
        if (adapter && !adapter.info?.isFallbackAdapter) {
          const loaded = await import('three/webgpu');
          if (this.disposed) return;
          const gpuRenderer = new loaded.WebGPURenderer({
            antialias: true,
            powerPreference: 'high-performance',
            forceWebGL: false,
          });
          await gpuRenderer.init();
          if (this.disposed) {
            void gpuRenderer.dispose();
            return;
          }
          const backend = gpuRenderer.backend as { isWebGPUBackend?: boolean } | undefined;
          if (backend?.isWebGPUBackend) {
            createdRenderer = gpuRenderer;
            useWebGPU = true;
            webgpuMod = loaded;
          } else {
            void gpuRenderer.dispose();
          }
        }
      } catch {
        createdRenderer = null;
        useWebGPU = false;
        webgpuMod = null;
      }
    }

    if (!createdRenderer) {
      createdRenderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl && !this.isMobileDevice,
        powerPreference: 'high-performance',
        stencil: !this.isMobileDevice,
      });
      useWebGPU = false;
    }

    if (this.disposed) {
      createdRenderer.dispose();
      return;
    }

    this.renderer = createdRenderer;
    this.isWebGPU = useWebGPU;
    this.graphicsBackend = useWebGPU ? 'WebGPU' : this.isSoftwareGl ? 'Software' : 'WebGL2';

    const initialTier =
      this.qualitySetting === 'auto' ? this.pickInitialAutoTier() : this.qualitySetting;
    this.activeQualityTier = initialTier;
    const profile = QUALITY_PROFILES[initialTier];
    const shadowsEnabled = profile.shadows && !this.isSoftwareGl;

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = initialTier === 'high' || initialTier === 'ultra' ? 0.92 : 0.96;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
    this.renderer.shadowMap.enabled = shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    if (this.isWebGPU) {
      const gpuRenderer = this.renderer as WebGPURenderer;
      gpuRenderer.onDeviceLost = () => {
        this.webglLost = true;
        this.emitHud();
      };
      if (webgpuMod) {
        try {
          const pmrem = new webgpuMod.PMREMGenerator(gpuRenderer);
          this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          this.scene.environment = this.envTexture;
          pmrem.dispose();
        } catch {
          // Optional if WebGPU PMREM fails
        }
      }
    } else {
      const glRenderer = this.renderer as THREE.WebGLRenderer;
      const canvas = glRenderer.domElement;
      canvas.addEventListener('webglcontextlost', this.onContextLost);
      canvas.addEventListener('webglcontextrestored', this.onContextRestored);
      if (!(this.isMobileDevice && initialTier === 'low')) {
        this.ensureEnvTexture();
      }
    }

    const maxAniso = this.isWebGPU
      ? (this.renderer as WebGPURenderer).getMaxAnisotropy()
      : (this.renderer as THREE.WebGLRenderer).capabilities.getMaxAnisotropy();

    this.materials = createMaterialBank(maxAniso, profile.transmission && !this.isSoftwareGl);
    this.arena = createArenaEnvironment(
      this.materials,
      shadowsEnabled,
      this.activeMapId,
      this.terrainSeed,
      { isMobile: this.isMobileDevice },
    );
    this.scene.add(this.arena.group);

    this.solarBallRig = createSolarBallRig();
    this.solarBallRig.group.visible = false;
    this.scene.add(this.solarBallRig.group);

    this.initCrystals();
    this.initSparks();
    this.initSentinels();

    this.applyQualityTier(initialTier, true);

    if (this.isWebGPU) {
      try {
        await (this.renderer as WebGPURenderer).compileAsync(this.scene, this.camera);
      } catch {
        // Ignore
      }
    } else if (!this.isSoftwareGl) {
      (this.renderer as THREE.WebGLRenderer).compile(this.scene, this.camera);
    }

    if (this.disposed) return;

    this.rendererReady = true;
    this.refreshAllPylonVisuals();
    if (this.pendingGroundWeapons) {
      const gwList = this.pendingGroundWeapons;
      this.pendingGroundWeapons = null;
      this.syncAllGroundWeapons(gwList);
    }
    if (this.pendingDisasterPillars) {
      const dp = this.pendingDisasterPillars;
      this.pendingDisasterPillars = null;
      this.syncDisasterPillars(dp);
    }
    if (this.pendingSnapshot) {
      const snap = this.pendingSnapshot;
      this.pendingSnapshot = null;
      this.applySnapshot(snap);
    }
    this.emitHud();
    this.startLoop();
  }

  private ensureComposer(samples = 4): void {
    if (this.isWebGPU || this.isSoftwareGl || !this.renderer || this.composer) return;
    const glRenderer = this.renderer as THREE.WebGLRenderer;
    const w = this.container.clientWidth || window.innerWidth || 1280;
    const h = this.container.clientHeight || window.innerHeight || 720;
    const ratio = glRenderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(
      Math.max(1, Math.round(w * ratio)),
      Math.max(1, Math.round(h * ratio)),
      {
        type: THREE.HalfFloatType,
        samples,
      },
    );
    const composer = new EffectComposer(glRenderer, rt);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);

    composer.addPass(new RenderPass(this.scene, this.camera));

    const godRaysPass = new ShaderPass(GodRaysShader);
    composer.addPass(godRaysPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.19, 0.30, 1.12);
    composer.addPass(bloomPass);

    const autoExposurePass = new AutoExposurePass();
    composer.addPass(autoExposurePass);

    composer.addPass(new OutputPass());

    // Place FilmicGrade AFTER OutputPass so contrast & shadow toe operate in perceptual sRGB space
    const gradePass = new ShaderPass(FilmicGradeShader);
    composer.addPass(gradePass);

    this.composerRt = rt;
    this.composer = composer;
    this.godRaysPass = godRaysPass;
    this.bloomPass = bloomPass;
    this.autoExposurePass = autoExposurePass;
    this.gradePass = gradePass;
  }

  private ensureEnvTexture(): void {
    if (this.envTexture || this.isWebGPU || this.isSoftwareGl || !this.renderer) return;
    const pmrem = new THREE.PMREMGenerator(this.renderer as THREE.WebGLRenderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();
  }

  private applyQualityTier(tier: GraphicsQualityTier, force = false): void {
    if (!force && this.activeQualityTier === tier) return;
    this.activeQualityTier = tier;
    const profile = QUALITY_PROFILES[tier];
    const isLow = tier === 'low';
    const useMobileLambert = this.isMobileDevice && isLow;
    this.activeSparkLimit = useMobileLambert ? 14 : profile.maxSparks;

    if (!this.renderer) return;

    const dpr = window.devicePixelRatio || 1;
    const targetRatio = this.isSoftwareGl
      ? Math.min(dpr, 1.0)
      : Math.min(dpr, profile.maxPixelRatio);
    this.renderer.setPixelRatio(targetRatio);

    const composerEligible =
      (profile.bloom || profile.godRays || profile.filmicGrade) && !this.isWebGPU && !this.isSoftwareGl;
    if (composerEligible) {
      this.ensureComposer(profile.msaa ? 4 : 0);
    }
    if (this.godRaysPass) this.godRaysPass.enabled = profile.godRays;
    if (this.bloomPass) {
      this.bloomPass.enabled = profile.bloom;
      this.bloomPass.strength = tier === 'ultra' ? 0.21 : 0.17;
      this.bloomPass.radius = 0.30;
      this.bloomPass.threshold = 1.12;
    }
    if (this.autoExposurePass) {
      this.autoExposurePass.enabled = composerEligible;
      this.autoExposurePass.resetHistory();
    }
    if (this.gradePass) {
      this.gradePass.enabled = profile.filmicGrade;
      this.gradePass.uniforms.uContrast.value = tier === 'ultra' ? 1.20 : 1.15;
      this.gradePass.uniforms.uShadowDepth.value = tier === 'ultra' ? 0.17 : 0.14;
      this.gradePass.uniforms.uSaturation.value = tier === 'ultra' ? 1.13 : 1.10;
      this.gradePass.uniforms.uVignette.value = tier === 'ultra' ? 0.22 : 0.18;
    }
    this.renderer.toneMappingExposure = tier === 'high' || tier === 'ultra' ? 0.92 : 0.96;

    this.onResize();

    const shadows = profile.shadows && !this.isSoftwareGl;
    this.renderer.shadowMap.enabled = shadows;
    this.keyLight.castShadow = shadows;
    if (shadows && this.keyLight.shadow.mapSize.x !== profile.shadowMapSize) {
      this.keyLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      this.keyLight.shadow.radius = profile.shadowMapSize >= 2048 ? 2.4 : 1.5;
      if (this.keyLight.shadow.map) {
        this.keyLight.shadow.map.dispose();
        this.keyLight.shadow.map = null;
      }
    }
    this.arena?.setShadowsEnabled(shadows);
    this.arena?.setMobileLowMode(useMobileLambert);
    for (let i = 0; i < this.sentinels.length; i++) {
      this.sentinels[i].rig.setShadowsEnabled(shadows);
    }

    if (this.materials) {
      this.materials.setQualityOptions({
        transmission: profile.transmission && !this.isSoftwareGl,
        ultraPbr: profile.ultraPbr && !this.isSoftwareGl,
        lowSpec: isLow,
      });
      for (const p of this.trackedPlayers.values()) {
        p.rig.setLodMode(useMobileLambert, this.materials);
        p.rig.setWeaponIndex(p.weaponKindIndex, this.materials, useMobileLambert);
      }
    }

    if (!isLow && !this.isSoftwareGl) {
      this.ensureEnvTexture();
    }
    if (this.hemiLight) this.hemiLight.intensity = useMobileLambert ? 0.92 : 0.48;
    if (this.rimLight) this.rimLight.visible = !isLow;
    if (this.arena?.ambientPoints) this.arena.ambientPoints.visible = !isLow;
    this.scene.environment = isLow ? null : this.envTexture;
    this.scene.environmentIntensity = isLow ? 0 : profile.envIntensity;

    const mapDef = getMapDef(this.activeMapId);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = mapDef.fogDensity * profile.fogMul;
    }

    const targetFar = useMobileLambert ? 420 : profile.cameraFar;
    if (Math.abs(this.camera.far - targetFar) > 1) {
      this.camera.far = targetFar;
      this.camera.updateProjectionMatrix();
    }
  }

  private switchMap(newMapId: MapId, newSeed?: number): void {
    const targetSeed = newSeed !== undefined ? (newSeed >>> 0) || 1 : this.terrainSeed;
    if (this.activeMapId === newMapId && this.terrainSeed === targetSeed) return;
    this.activeMapId = newMapId;
    this.terrainSeed = targetSeed;
    this.lavaVisualActive = false;
    this.fallbackExpMul = 1;
    this.autoExposurePass?.resetHistory();

    const mapDef = getMapDef(newMapId);
    const profile = QUALITY_PROFILES[this.activeQualityTier];
    this.scene.background = new THREE.Color(mapDef.skyHex);
    this.scene.fog = new THREE.FogExp2(mapDef.skyHex, mapDef.fogDensity * profile.fogMul);

    if (this.arena && this.materials) {
      try {
        this.scene.remove(this.arena.group);
        this.arena.dispose();
      } catch {
        // Ignore disposal errors so new arena creation still proceeds cleanly
      }
      try {
        this.arena = createArenaEnvironment(
          this.materials,
          profile.shadows && !this.isSoftwareGl,
          newMapId,
          targetSeed,
          { isMobile: this.isMobileDevice },
        );
        this.arena.setMobileLowMode(this.isMobileDevice && this.activeQualityTier === 'low');
        this.arena.ambientPoints.visible = this.activeQualityTier !== 'low';
        this.scene.add(this.arena.group);
      } catch {
        // Fallback: keep scene alive even if arena build throws
      }
    }

    this.crystalLayouts = generateCrystalLayout(newMapId, targetSeed);
    this.crystalActive.fill(true);
    this.orbActive.fill(true);
    this.pylonStates = getMapPylons(newMapId, targetSeed).map((p) => ({
      id: p.id,
      name: p.name,
      ownerSlotId: null,
      ownerName: '',
      ownerColor: 0,
      progress: 0,
    }));
    this.clearGroundWeapons();
    this.clearNextbots();
    this.clearDisasterPillars();
    this.clearDynamicWorldFX();
    this.clearTransientVfx();
    if (this.solarBallRig) {
      this.solarBallRig.group.visible = isStadiumMap(newMapId);
    }
  }

  private clearGroundWeapons(): void {
    for (const entry of this.groundWeaponRigs.values()) {
      this.scene.remove(entry.rig.root);
      entry.rig.dispose();
    }
    this.groundWeaponRigs.clear();
  }

  private clearNextbots(): void {
    for (const nb of this.trackedNextbots.values()) {
      this.scene.remove(nb.rig.root);
      nb.rig.dispose();
    }
    this.trackedNextbots.clear();
  }

  private clearDisasterPillars(): void {
    for (let i = 0; i < this.disasterPillarMeshes.length; i++) {
      this.scene.remove(this.disasterPillarMeshes[i].group);
      this.disasterPillarMeshes[i].dispose();
    }
    this.disasterPillarMeshes = [];
  }

  private syncDisasterPillars(list: DisasterPillarSync[]): void {
    if (!this.rendererReady || !this.materials) {
      this.pendingDisasterPillars = list;
      return;
    }
    this.clearDisasterPillars();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const built = createDisasterPillarMesh(p.radius, p.height, p.kind, this.materials);
      built.group.position.set(p.x, p.y, p.z);
      this.scene.add(built.group);
      this.disasterPillarMeshes.push(built);
    }
  }

  private clearDynamicWorldFX(): void {
    for (const tp of this.trackedThrown.values()) {
      this.scene.remove(tp.group);
      tp.dispose();
    }
    this.trackedThrown.clear();

    for (const fz of this.trackedFireZones.values()) {
      this.scene.remove(fz.visual.group);
      fz.visual.dispose();
      for (let i = 0; i < fz.flameMats.length; i++) fz.flameMats[i].dispose();
    }
    this.trackedFireZones.clear();
  }

  private syncWorldDynamics(msg: Record<string, unknown>): void {
    // 1) Thrown projectiles
    if (Array.isArray(msg.thrownProjectiles)) {
      const list = msg.thrownProjectiles as ThrownProjectileSync[];
      const seen = new Set<number>();
      for (let i = 0; i < list.length; i++) {
        const tp = list[i];
        seen.add(tp.uid);
        const existing = this.trackedThrown.get(tp.uid);
        if (!existing && this.materials) {
          const built = createWeaponMesh(this.materials, tp.weaponId);
          built.group.scale.setScalar(1.45);
          built.group.position.set(tp.x, tp.y, tp.z);
          this.scene.add(built.group);
          this.trackedThrown.set(tp.uid, {
            data: tp,
            group: built.group,
            renderPos: new THREE.Vector3(tp.x, tp.y, tp.z),
            dispose: built.dispose,
          });
        } else if (existing) {
          existing.data = tp;
        }
      }
      for (const [uid, obj] of this.trackedThrown.entries()) {
        if (!seen.has(uid)) {
          this.scene.remove(obj.group);
          obj.dispose();
          this.trackedThrown.delete(uid);
        }
      }
    }

    // 2) Active Fire/Cryo ground zones
    if (Array.isArray(msg.fireZones)) {
      const list = msg.fireZones as FireZoneSync[];
      const seen = new Set<number>();
      for (let i = 0; i < list.length; i++) {
        const fz = list[i];
        seen.add(fz.uid);
        const existing = this.trackedFireZones.get(fz.uid);
        if (!existing && this.materials) {
          const visual = createFireZoneVisual(fz.kind, fz.radius);
          visual.group.position.set(fz.x, fz.y + 0.08, fz.z);
          const flames: THREE.Sprite[] = [];
          const flameMats: THREE.SpriteMaterial[] = [];
          const count = 6;
          for (let k = 0; k < count; k++) {
            const ang = (k / count) * Math.PI * 2;
            const r = fz.radius * (0.25 + (k % 2) * 0.35);
            const mat = new THREE.SpriteMaterial({
              map: this.materials.flameTex,
              color: fz.kind === 'molotov' ? 0xf97316 : 0x38bdf8,
              transparent: true,
              opacity: 0.78,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            });
            const sp = new THREE.Sprite(mat);
            sp.position.set(Math.cos(ang) * r, 1.4, Math.sin(ang) * r);
            sp.scale.setScalar(3.4);
            visual.group.add(sp);
            flames.push(sp);
            flameMats.push(mat);
          }
          this.scene.add(visual.group);
          this.trackedFireZones.set(fz.uid, { data: fz, visual, flames, flameMats });
        } else if (existing) {
          existing.data = fz;
        }
      }
      for (const [uid, obj] of this.trackedFireZones.entries()) {
        if (!seen.has(uid)) {
          this.scene.remove(obj.visual.group);
          obj.visual.dispose();
          for (let i = 0; i < obj.flameMats.length; i++) obj.flameMats[i].dispose();
          this.trackedFireZones.delete(uid);
        }
      }
    }

    // 3) Moving dropped weapons (server sends pure XYZ; client rotates!)
    if (Array.isArray(msg.movedGroundWeapons)) {
      const moved = msg.movedGroundWeapons as GroundWeaponSync[];
      for (let i = 0; i < moved.length; i++) {
        const gw = moved[i];
        const entry = this.groundWeaponRigs.get(gw.uid);
        if (entry) {
          entry.data = gw;
        } else {
          this.addGroundWeapon(gw);
        }
      }
    }

    // 4) Stadium Solar Ball
    if (msg.solarBall !== undefined) {
      this.solarBallTarget = (msg.solarBall as SolarBallSync | null) ?? null;
    }
  }

  private addGroundWeapon(gw: GroundWeaponSync): void {
    if (!this.rendererReady || !this.materials) return;
    if (this.groundWeaponRigs.has(gw.uid)) {
      this.removeGroundWeapon(gw.uid);
    }
    const rig = createGroundWeaponRig(this.materials, gw.weaponId, gw.isSuper);
    rig.root.position.set(gw.x, gw.y, gw.z);
    this.scene.add(rig.root);
    this.groundWeaponRigs.set(gw.uid, {
      data: gw,
      rig,
      spinY: (gw.uid * 1.37) % (Math.PI * 2),
      airSpinX: 0,
      cachedX: gw.x,
      cachedZ: gw.z,
      cachedGy: groundHeightAt(gw.x, gw.z, this.activeMapId, this.terrainSeed),
    });
  }

  private removeGroundWeapon(uid: number): void {
    const existing = this.groundWeaponRigs.get(uid);
    if (!existing) return;
    this.scene.remove(existing.rig.root);
    existing.rig.dispose();
    this.groundWeaponRigs.delete(uid);
  }

  private syncAllGroundWeapons(list: GroundWeaponSync[]): void {
    if (!this.rendererReady || !this.materials) {
      this.pendingGroundWeapons = list;
      return;
    }
    this.clearGroundWeapons();
    for (let i = 0; i < list.length; i++) {
      this.addGroundWeapon(list[i]);
    }
  }

  private clearTransientVfx(): void {
    for (const r of this.ringVfx) {
      this.scene.remove(r.mesh);
      r.mat.dispose();
    }
    this.ringVfx = [];

    for (const b of this.beamVfx) {
      this.scene.remove(b.mesh);
      b.mat.dispose();
    }
    this.beamVfx = [];

    for (const bl of this.bulletVfx) {
      this.scene.remove(bl.group);
      bl.headMat.dispose();
      bl.tailMat.dispose();
    }
    this.bulletVfx = [];

    for (const m of this.meteorVfx) {
      this.scene.remove(m.meteorMesh);
      this.scene.remove(m.ringMesh);
      m.ringMat.dispose();
    }
    this.meteorVfx = [];

    for (const sm of this.smokeVfx) {
      this.scene.remove(sm.sprite);
      sm.mat.dispose();
    }
    this.smokeVfx = [];
  }

  private spawnDynamicLight(
    x: number,
    y: number,
    z: number,
    hexColor: number,
    intensity: number,
    distance: number,
    duration = 0.45,
  ): void {
    if (this.activeQualityTier === 'low' || this.dynamicLights.length === 0) return;
    let best = this.dynamicLights[0];
    for (let i = 1; i < this.dynamicLights.length; i++) {
      if (this.dynamicLights[i].life < best.life) best = this.dynamicLights[i];
    }
    best.light.color.setHex(hexColor);
    best.light.position.set(x, y, z);
    best.light.distance = distance;
    best.light.intensity = intensity;
    best.peakIntensity = intensity;
    best.maxLife = duration;
    best.life = duration;
  }

  private spawnExplosionVfx(
    x: number,
    y: number,
    z: number,
    radius: number,
    hexColor: number,
    withSmoke = true,
  ): void {
    if (!this.rendererReady || !this.materials) return;

    // Shockwave ring & bright sparks
    this.spawnRingVfx(x, y + 0.18, z, 1.4, Math.max(6, radius * 1.1), hexColor, 0.48);
    this.spawnSparks(x, y + 1.0, z, Math.min(44, Math.round(radius * 2.8)), hexColor, Math.min(28, radius * 2.1));
    this.spawnDynamicLight(x, y + 2.2, z, hexColor, radius >= 10 ? 16 : 10, Math.max(24, radius * 2.6), 0.55);

    // Additive fire flash core sprite
    const flashMat = new THREE.SpriteMaterial({
      map: this.materials.flameTex,
      color: hexColor,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flashSprite = new THREE.Sprite(flashMat);
    flashSprite.position.set(x, y + 1.2, z);
    flashSprite.scale.setScalar(Math.max(3, radius * 0.45));
    this.scene.add(flashSprite);
    this.smokeVfx.push({
      sprite: flashSprite,
      mat: flashMat,
      vx: 0,
      vy: 2.5,
      vz: 0,
      life: 0.3,
      maxLife: 0.3,
      startScale: Math.max(3, radius * 0.45),
      endScale: Math.max(8, radius * 1.35),
      baseOpacity: 0.95,
    });

    // Billowing realistic dark charcoal/ash smoke clouds
    if (withSmoke) {
      const count = this.activeQualityTier === 'low' ? 4 : this.activeQualityTier === 'medium' ? 6 : 10;
      const smokePalette = [0x1f2228, 0x363a42, 0x525763, 0x2b2d34];
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const spd = (1.8 + Math.random() * 4.5) * (radius / 10);
        const sMat = new THREE.SpriteMaterial({
          map: this.materials.smokeTex,
          color: smokePalette[i % smokePalette.length],
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        });
        const sp = new THREE.Sprite(sMat);
        sp.position.set(x + Math.cos(ang) * 1.2, y + 0.9 + Math.random() * 1.2, z + Math.sin(ang) * 1.2);
        const s0 = Math.max(2.6, radius * 0.32);
        sp.scale.setScalar(s0);
        this.scene.add(sp);
        const maxLife = 1.25 + Math.random() * 0.75;
        this.smokeVfx.push({
          sprite: sp,
          mat: sMat,
          vx: Math.cos(ang) * spd,
          vy: 4.5 + Math.random() * 5.2,
          vz: Math.sin(ang) * spd,
          life: maxLife,
          maxLife,
          startScale: s0,
          endScale: s0 * (2.6 + Math.random() * 1.2),
          baseOpacity: 0.68,
        });
      }
    }

    const distToCam = Math.hypot(x - this.camera.position.x, z - this.camera.position.z);
    if (distToCam < 105) {
      this.audio.playExplosion(radius >= 10);
      const falloff = Math.max(0.1, 1 - distToCam / 105);
      this.shakeIntensity = Math.max(this.shakeIntensity, (radius >= 10 ? 0.9 : 0.55) * falloff);
    }
  }

  private initCrystals(): void {
    this.standardCrystalIndices = [];
    this.coreCrystalIndices = [];
    for (let i = 0; i < this.crystalLayouts.length; i++) {
      if (this.crystalLayouts[i].kind === 1) {
        this.coreCrystalIndices.push(i);
      } else {
        this.standardCrystalIndices.push(i);
      }
    }

    const stdGeo = new THREE.OctahedronGeometry(0.9, 0);
    this.standardCrystalMesh = new THREE.InstancedMesh(
      stdGeo,
      this.materials.crystalStandard,
      Math.max(1, this.standardCrystalIndices.length),
    );
    this.standardCrystalMesh.frustumCulled = false;
    this.scene.add(this.standardCrystalMesh);

    const coreGeo = new THREE.OctahedronGeometry(1.45, 0);
    this.coreCrystalMesh = new THREE.InstancedMesh(
      coreGeo,
      this.materials.crystalCore,
      Math.max(1, this.coreCrystalIndices.length),
    );
    this.coreCrystalMesh.frustumCulled = false;
    this.scene.add(this.coreCrystalMesh);
  }

  private initSparks(): void {
    const geo = new THREE.OctahedronGeometry(0.24, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.sparkMesh = new THREE.InstancedMesh(geo, mat, this.MAX_SPARKS);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.MAX_SPARKS * 3),
      3,
    );

    for (let i = 0; i < this.MAX_SPARKS; i++) {
      this.sparks.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        scale: 1,
        color: new THREE.Color(0xfbbf24),
      });
      _dummy.position.set(0, -999, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.sparkMesh);
  }

  private initSentinels(): void {
    const shadowsEnabled = QUALITY_PROFILES[this.activeQualityTier].shadows && !this.isSoftwareGl;
    for (let i = 0; i < SENTINEL_COUNT; i++) {
      const rig = createSentinelRig(this.materials, shadowsEnabled);
      rig.root.visible = false;
      this.scene.add(rig.root);
      this.sentinels.push({
        id: i,
        rig,
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        targetYaw: 0,
        state: 0,
        hp: 100,
      });
    }
  }

  private spawnSparks(x: number, y: number, z: number, count: number, hexColor: number, speed = 14): void {
    if (this.sparks.length === 0) return;
    const budget = Math.min(this.MAX_SPARKS, this.activeSparkLimit, this.sparks.length);
    let spawned = 0;
    for (let i = 0; i < budget && spawned < count; i++) {
      const s = this.sparks[i];
      if (s.active) continue;
      s.active = true;
      s.x = x;
      s.y = y;
      s.z = z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.7;
      const mag = speed * (0.45 + Math.random() * 0.8);
      s.vx = Math.cos(theta) * Math.sin(phi) * mag;
      s.vy = Math.cos(phi) * mag + 3;
      s.vz = Math.sin(theta) * Math.sin(phi) * mag;
      s.maxLife = 0.35 + Math.random() * 0.35;
      s.life = s.maxLife;
      s.scale = 0.8 + Math.random() * 1.1;
      s.color.setHex(hexColor);
      spawned++;
    }
  }

  private spawnRingVfx(x: number, y: number, z: number, startScale: number, endScale: number, hexColor: number, maxLife = 0.45): void {
    const mat = new THREE.MeshBasicMaterial({
      color: hexColor,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.sharedRingGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(startScale);
    this.scene.add(mesh);
    this.ringVfx.push({ mesh, mat, life: maxLife, maxLife, startScale, endScale });
  }

  private spawnBeamVfx(x: number, y: number, z: number, yaw: number, pitch: number, length: number, hexColor: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: hexColor,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.sharedBeamGeo, mat);
    const cosP = Math.cos(pitch);
    const fx = Math.sin(yaw) * cosP;
    const fy = Math.sin(pitch);
    const fz = Math.cos(yaw) * cosP;
    mesh.position.set(x + fx * (length * 0.5), y + fy * (length * 0.5), z + fz * (length * 0.5));
    mesh.lookAt(x + fx * length, y + fy * length, z + fz * length);
    mesh.scale.set(1, 1, length);
    this.scene.add(mesh);
    this.beamVfx.push({ mesh, mat, life: 0.32, maxLife: 0.32, x, y, z, yaw, pitch, length, colorHex: hexColor });
  }

  private spawnBulletVfx(
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    hexColor: number,
    mythic: boolean,
    splashRadius = 0,
  ): void {
    const dx = tx - x;
    const dy = ty - y;
    const dz = tz - z;
    const totalDist = Math.max(0.5, Math.hypot(dx, dy, dz));
    const dirX = dx / totalDist;
    const dirY = dy / totalDist;
    const dirZ = dz / totalDist;
    const tailLen = mythic ? 4.4 : 3.0;

    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: hexColor,
      emissiveIntensity: mythic ? 3.5 : 2.5,
      roughness: 0.12,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: hexColor,
      emissive: hexColor,
      emissiveIntensity: mythic ? 2.4 : 1.7,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    const group = new THREE.Group();
    const head = new THREE.Mesh(this.sharedBulletHeadGeo, headMat);
    head.scale.setScalar(mythic ? 1.5 : 1.0);
    const tail = new THREE.Mesh(this.sharedBulletTailGeo, tailMat);
    tail.scale.set(mythic ? 1.45 : 1.0, mythic ? 1.45 : 1.0, tailLen);
    tail.position.set(0, 0, -tailLen * 0.5);
    group.add(head, tail);

    const startOffset = Math.min(1.6, totalDist * 0.15);
    const sx = x + dirX * startOffset;
    const sy = y + dirY * startOffset;
    const sz = z + dirZ * startOffset;
    group.position.set(sx, sy, sz);
    group.lookAt(tx, ty, tz);
    this.scene.add(group);

    // Muzzle flash sparks at barrel tip
    this.spawnSparks(sx, sy, sz, mythic ? 9 : 4, hexColor, 10);

    this.bulletVfx.push({
      group,
      headMat,
      tailMat,
      x: sx,
      y: sy,
      z: sz,
      tx,
      ty,
      tz,
      dirX,
      dirY,
      dirZ,
      speed: mythic ? 225 : 185,
      traveled: startOffset,
      totalDist,
      length: tailLen,
      colorHex: hexColor,
      mythic,
      splashRadius,
    });
  }

  private spawnMeteorVfx(x: number, z: number, radius: number, delay: number): void {
    const groundY = groundHeightAt(x, z, this.activeMapId, this.terrainSeed) + 0.15;
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.sharedRingGeo, ringMat);
    ringMesh.position.set(x, groundY, z);
    ringMesh.scale.setScalar(radius);
    this.scene.add(ringMesh);

    const meteorMesh = new THREE.Mesh(this.sharedMeteorGeo, this.sharedMeteorMat);
    meteorMesh.position.set(x, groundY + 65, z);
    this.scene.add(meteorMesh);

    this.meteorVfx.push({ meteorMesh, ringMesh, ringMat, x, groundY, z, delay, elapsed: 0 });
  }

  private spawnLightningVfx(x: number, y: number, z: number, radius: number): void {
    const boltMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const boltMesh = new THREE.Mesh(this.sharedBeamGeo, boltMat);
    boltMesh.position.set(x, y + 38, z);
    boltMesh.rotation.x = Math.PI / 2;
    boltMesh.scale.set(1.65, 1.65, 76);
    this.scene.add(boltMesh);
    this.beamVfx.push({
      mesh: boltMesh,
      mat: boltMat,
      life: 0.28,
      maxLife: 0.28,
      x,
      y: y + 38,
      z,
      yaw: 0,
      pitch: -Math.PI / 2,
      length: 76,
      colorHex: 0x93c5fd,
    });

    this.spawnRingVfx(x, y + 0.15, z, 1.6, radius, 0x60a5fa, 0.45);
    this.spawnSparks(x, y + 0.8, z, 28, 0x93c5fd, 24);
    this.spawnDynamicLight(x, y + 4, z, 0x93c5fd, 12, 36, 0.32);
    if (Math.hypot(x - this.camera.position.x, z - this.camera.position.z) < 75) {
      this.audio.playMeteor();
      this.shakeIntensity = Math.max(this.shakeIntensity, 0.38);
    }
  }

  private pushFeed(text: string, accent: string): void {
    this.feed.unshift({
      id: this.nextFeedId++,
      text,
      accent,
      createdAt: performance.now(),
    });
    if (this.feed.length > 4) this.feed.length = 4;
  }

  private connectWebSocket(): void {
    if (this.disposed) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.pingInterval = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', t: performance.now() }));
        }
      }, 2000);

      this.inputInterval = window.setInterval(() => {
        this.sendInputFrame();
      }, 50);
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        try {
          const snap = decodeSnapshot(ev.data);
          if (snap) this.applySnapshot(snap);
        } catch {
          // Keep snapshot loop resilient across map swaps
        }
        return;
      }

      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data);
          this.handleJsonMessage(msg);
        } catch {
          // ignore
        }
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.cleanupSocketTimers();
      if (!this.disposed) {
        this.reconnectTimer = window.setTimeout(() => this.connectWebSocket(), 1500);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private cleanupSocketTimers(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.inputInterval !== null) {
      clearInterval(this.inputInterval);
      this.inputInterval = null;
    }
  }

  private showRoleBanner(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const obj = raw as Record<string, unknown>;
    const headline = String(obj.headline || '');
    if (!headline) return;
    this.roleBanner = {
      id: this.nextBannerId++,
      modeName: String(obj.modeName || 'Special Match'),
      headline,
      rankLine: String(obj.rankLine || 'Rank: B · Vanguard'),
      tutorialLine: String(obj.tutorialLine || obj.subline || 'Harvest Shards & dominate the arena!'),
      accent: String(obj.accent || '#FB923C'),
      startedAt: performance.now(),
    };
  }

  private handleJsonMessage(msg: Record<string, unknown>): void {
    const type = msg.type;
    if (type === 'pong' && typeof msg.t === 'number') {
      this.pingMs = Math.round(performance.now() - msg.t);
      return;
    }

    if (type === 'welcome') {
      this.onlinePlayers = Number(msg.onlinePlayers) || 0;
      this.botCount = Number(msg.botCount) || 0;
      this.guiHidden = false;
      this.spectateActive = false;
      this.spectatingSlotId = null;
      this.missingLocalSince = null;
      const incomingSeed = typeof msg.terrainSeed === 'number' ? msg.terrainSeed : this.terrainSeed;
      if (typeof msg.mapId === 'string') {
        this.switchMap(msg.mapId as MapId, incomingSeed);
      }
      if (typeof msg.matchNumber === 'number') this.matchNumber = msg.matchNumber;
      if (typeof msg.normalModeId === 'string') {
        this.activeNormalModeId = msg.normalModeId as NormalModeId;
      }
      if (typeof msg.specialModeId === 'string') {
        this.activeSpecialModeId = msg.specialModeId as SpecialModeId;
      }
      if (msg.modeHud && typeof msg.modeHud === 'object') {
        this.modeHud = msg.modeHud as ModeHudPayload;
      }
      if (msg.matchPhase === 'postmatch' || msg.matchPhase === 'active') {
        this.matchPhase = msg.matchPhase;
      }
      if (typeof msg.matchTimeRemaining === 'number') {
        this.matchTimeRemaining = msg.matchTimeRemaining;
      }
      if (typeof msg.activeEventId === 'string') {
        this.activeEventId = msg.activeEventId as EventId;
        this.activeEventTimer = Number(msg.activeEventTimer) || 0;
        this.nextEventIn = Number(msg.nextEventTimer) || EVENT_INTERVAL_SECONDS;
      }
      if (typeof msg.winningTeam === 'number') this.winningTeam = msg.winningTeam;
      if (typeof msg.solarKills === 'number') this.solarKills = msg.solarKills;
      if (typeof msg.eclipseKills === 'number') this.eclipseKills = msg.eclipseKills;
      if (Array.isArray(msg.scores)) {
        this.postMatchScores = msg.scores as PostMatchRow[];
      }
      if (msg.mapVotes && typeof msg.mapVotes === 'object') {
        this.mapVotes = { ...emptyMapVotes(), ...(msg.mapVotes as Partial<Record<MapId, number>>) };
      }
      if (Array.isArray(msg.modeVoteOptions)) {
        this.modeVoteOptions = msg.modeVoteOptions as ModeVoteOption[];
      }
      if (msg.modeVotes && typeof msg.modeVotes === 'object') {
        this.modeVotes = msg.modeVotes as Record<string, number>;
      }

      const metas = msg.playersMeta as PlayerMeta[] | undefined;
      if (Array.isArray(metas)) {
        this.playerMeta.clear();
        for (const m of metas) {
          this.playerMeta.set(m.slotId, {
            slotId: m.slotId,
            name: m.name,
            colorIndex: m.colorIndex,
            isBot: Boolean(m.isBot),
          });
        }
      }
      this.crystalActive.fill(true);
      const inactive = msg.inactiveCrystals as number[] | undefined;
      if (Array.isArray(inactive)) {
        for (const id of inactive) {
          if (id >= 0 && id < this.crystalActive.length) this.crystalActive[id] = false;
        }
      }
      this.orbActive.fill(true);
      const inactiveOrbs = msg.inactiveOrbs as number[] | undefined;
      if (Array.isArray(inactiveOrbs)) {
        for (const id of inactiveOrbs) {
          if (id >= 0 && id < this.orbActive.length) this.orbActive[id] = false;
        }
      }
      if (Array.isArray(msg.pylons)) {
        this.syncPylons(msg.pylons as Array<Record<string, unknown>>);
      }
      if (Array.isArray(msg.groundWeapons)) {
        this.syncAllGroundWeapons(msg.groundWeapons as GroundWeaponSync[]);
      }
      if (Array.isArray(msg.disasterPillars)) {
        this.syncDisasterPillars(msg.disasterPillars as DisasterPillarSync[]);
      }
      this.syncWorldDynamics(msg);

      // Server deletes player slots on disconnect: if WS reconnected while in a match/postmatch,
      // clear stale slotId and auto-rejoin seamlessly (or fall back cleanly to Title UI).
      if (this.mode !== 'title') {
        this.localSlotId = null;
        this.fireHeld = false;
        this.throwChargeTimer = 0;
        if (this.lastJoinParams && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.lastAutoRejoinAt = performance.now();
          this.ws.send(JSON.stringify({ type: 'join', ...this.lastJoinParams }));
        } else {
          this.mode = 'title';
        }
      }

      this.emitHud();
      return;
    }

    if (type === 'joined') {
      const wasOnTitle = this.mode === 'title';
      if (wasOnTitle && this.matchPhase === 'active') {
        this.spawnIntroStartPos.copy(this.camera.position);
        const curFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).multiplyScalar(28);
        this.spawnIntroStartLook.copy(this.camera.position).add(curFwd);
        this.spawnIntroStartFov = this.camera.fov || 62;
        this.spawnIntroElapsed = 0.0001;
        this.spawnIntroDuration = 1.45;
      } else {
        this.spawnIntroElapsed = 0;
        this.spawnIntroDuration = 0;
      }

      this.spectateActive = false;
      this.spectatingSlotId = null;
      this.guiHidden = false;
      this.missingLocalSince = null;
      this.fireHeld = false;
      this.throwChargeTimer = 0;
      this.localPitch = 0;
      this.damageIndicators = [];

      this.localSlotId = Number(msg.slotId);
      this.onlinePlayers = Number(msg.onlinePlayers) || this.onlinePlayers;
      this.botCount = Number(msg.botCount) ?? this.botCount;
      const incomingSeed = typeof msg.terrainSeed === 'number' ? msg.terrainSeed : this.terrainSeed;
      if (typeof msg.mapId === 'string') this.switchMap(msg.mapId as MapId, incomingSeed);
      if (typeof msg.matchNumber === 'number') this.matchNumber = msg.matchNumber;
      if (typeof msg.normalModeId === 'string') {
        this.activeNormalModeId = msg.normalModeId as NormalModeId;
      }
      if (typeof msg.specialModeId === 'string') {
        this.activeSpecialModeId = msg.specialModeId as SpecialModeId;
      }
      if (msg.modeHud && typeof msg.modeHud === 'object') {
        this.modeHud = msg.modeHud as ModeHudPayload;
      }
      this.localTeamId = msg.teamId === 5 || msg.teamId === 6 ? msg.teamId : 0;
      if (msg.matchPhase === 'postmatch' || msg.matchPhase === 'active') {
        this.matchPhase = msg.matchPhase;
      }
      this.mode = this.matchPhase === 'postmatch' ? 'postmatch' : 'playing';
      this.skills = Array.isArray(msg.skills) ? (msg.skills as SkillId[]) : [];
      if (typeof msg.starterSkill === 'string') this.starterSkill = msg.starterSkill as SkillId;
      this.starterCooldown = 0;
      this.nextReplaceSlot = Number(msg.nextReplaceSlot) || 0;
      this.weapons = Array.isArray(msg.weapons) ? (msg.weapons as WeaponSlotState[]) : [];
      this.equippedWeaponSlot = Math.max(0, Number(msg.equippedSlot) || 0);
      this.weaponCooldownTimer = 0;
      this.superWeaponAlert = null;
      this.floatingDmgs = [];
      this.comboToast = null;
      this.kills = Number(msg.kills) || 0;
      if (Array.isArray(msg.groundWeapons)) {
        this.syncAllGroundWeapons(msg.groundWeapons as GroundWeaponSync[]);
      }
      if (Array.isArray(msg.disasterPillars)) {
        this.syncDisasterPillars(msg.disasterPillars as DisasterPillarSync[]);
      }
      this.syncWorldDynamics(msg);
      if (msg.roleBanner) {
        this.showRoleBanner(msg.roleBanner);
        this.audio.playEventAlert();
      }
      this.playerMeta.set(this.localSlotId, {
        slotId: this.localSlotId,
        name: String(msg.name || 'Skimmer'),
        colorIndex: Number(msg.colorIndex) || 0,
        isBot: false,
      });
      this.emitHud();
      return;
    }

    if (type === 'world_dynamics') {
      this.syncWorldDynamics(msg);
      return;
    }

    if (type === 'explosion') {
      const ex = Number(msg.x) || 0;
      const ey = Number(msg.y) || 0;
      const ez = Number(msg.z) || 0;
      const radius = Number(msg.radius) || 10;
      const colorHex = Number.parseInt(String(msg.color || '#f97316').replace('#', ''), 16) || 0xf97316;
      this.spawnExplosionVfx(ex, ey, ez, radius, colorHex, msg.smoke !== false);
      return;
    }

    if (type === 'role_banner') {
      this.showRoleBanner(msg.banner);
      this.audio.playEventAlert();
      this.emitHud();
      return;
    }

    if (type === 'mode_hud' && msg.hud && typeof msg.hud === 'object') {
      this.modeHud = msg.hud as ModeHudPayload;
      if (typeof this.modeHud.solarKills === 'number') this.solarKills = this.modeHud.solarKills;
      if (typeof this.modeHud.eclipseKills === 'number') this.eclipseKills = this.modeHud.eclipseKills;
      return;
    }

    if (type === 'combat_feedback') {
      const now = performance.now();
      if (msg.kind === 'hit') {
        const dmg = Math.max(1, Math.round(Number(msg.dmg) || 0));
        this.hitmarkerUntil = now + 170;
        this.audio.playHitConfirm(false);
        this.floatingDmgs.push({
          id: this.nextFloatDmgId++,
          dmg,
          x: Number(msg.x) || 0,
          y: Number(msg.y) || 0,
          z: Number(msg.z) || 0,
          bornAt: now,
        });
        if (this.floatingDmgs.length > 14) {
          this.floatingDmgs.shift();
        }
      } else if (msg.kind === 'kill') {
        const bonusShards = Math.round(Number(msg.bonusShards) || 0);
        const combo = Number(msg.comboCount) || 1;
        const streak = Number(msg.streak) || 1;
        const victimName = String(msg.victimName || 'Pilot');
        this.hitmarkerUntil = now + 260;
        this.audio.playHitConfirm(true);
        const label =
          combo >= 5
            ? 'GODLIKE MULTI-KILL!'
            : combo === 4
            ? 'QUADRA KILL!'
            : combo === 3
            ? 'TRIPLE KILL!'
            : combo === 2
            ? 'DOUBLE KILL!'
            : streak >= 3
            ? `${streak}x KILL STREAK!`
            : 'ELIMINATED!';
        const accent = combo >= 3 ? '#FACC15' : combo === 2 ? '#FB923C' : '#38BDF8';
        this.comboToast = {
          id: this.nextComboToastId++,
          label,
          sub: `+${bonusShards} Shards · ${victimName}`,
          accent,
          until: now + 2400,
        };
      } else if (msg.kind === 'damaged') {
        const fromX = Number(msg.fromX) || 0;
        const fromZ = Number(msg.fromZ) || 0;
        this.damageIndicators.push({
          id: this.nextDmgIndicatorId++,
          fromX,
          fromZ,
          bornAt: now,
          duration: 1050,
        });
        if (this.damageIndicators.length > 8) this.damageIndicators.shift();
      }
      this.emitHud();
      return;
    }

    if (type === 'server_full') {
      this.onlinePlayers = Number(msg.onlinePlayers) || MAX_PLAYERS;
      this.botCount = Number(msg.botCount) || 0;
      this.mode = 'server_full';
      this.emitHud();
      return;
    }

    if (type === 'skills_sync') {
      if (Array.isArray(msg.skills)) {
        this.skills = msg.skills as SkillId[];
      }
      if (typeof msg.starterCooldown === 'number') {
        this.starterCooldown = msg.starterCooldown;
      } else if (this.skills.length === 0) {
        this.starterCooldown = STARTER_RECHARGE_SECONDS;
      } else {
        this.starterCooldown = 0;
      }
      this.nextReplaceSlot = Number(msg.nextReplaceSlot) || 0;
      if (typeof msg.kills === 'number') this.kills = msg.kills;
      if (typeof msg.grantedSkill === 'string' && msg.grantedSkill) {
        const def = getSkillDef(msg.grantedSkill as SkillId);
        if (msg.rechargedStarter) {
          this.pushFeed(`${def.name} Ready!`, def.color);
        } else {
          const verb =
            msg.replacedSlot !== null && msg.replacedSlot !== undefined
              ? 'Replaced slot with'
              : 'Unlocked';
          this.pushFeed(`${verb} ${def.name}`, def.color);
        }
        this.audio.playSkillGrant();
      }
      this.emitHud();
      return;
    }

    if (type === 'weapons_sync') {
      if (Array.isArray(msg.weapons)) {
        this.weapons = msg.weapons as WeaponSlotState[];
      }
      if (typeof msg.equippedSlot === 'number') {
        this.equippedWeaponSlot = Math.max(0, Math.min(Math.max(0, this.weapons.length - 1), msg.equippedSlot));
      }
      if (this.weapons.length === 0) {
        this.fireHeld = false;
        this.throwChargeTimer = 0;
      }
      if (typeof msg.pickedUpId === 'string' && msg.pickedUpId) {
        const wDef = getWeaponDef(msg.pickedUpId as WeaponId);
        this.audio.playWeaponPickup(wDef.rarity === 'mythic');
        this.pushFeed(
          wDef.rarity === 'mythic' ? `MYTHIC ACQUIRED: ${wDef.name}!` : `Picked up ${wDef.name}`,
          wDef.color,
        );
      }
      if (typeof msg.brokenWeaponId === 'string' && msg.brokenWeaponId) {
        const wDef = getWeaponDef(msg.brokenWeaponId as WeaponId);
        this.audio.playWeaponBreak();
        this.pushFeed(`${wDef.name} shattered!`, '#EF4444');
      }
      this.emitHud();
      return;
    }

    if (type === 'ground_weapons_delta') {
      const removed = msg.removed as number[] | undefined;
      if (Array.isArray(removed)) {
        for (const uid of removed) {
          this.removeGroundWeapon(uid);
          if (this.superWeaponAlert?.uid === uid) {
            this.superWeaponAlert = null;
          }
        }
      }
      const added = msg.added as GroundWeaponSync[] | undefined;
      if (Array.isArray(added)) {
        for (const gw of added) {
          this.addGroundWeapon(gw);
        }
      }
      this.emitHud();
      return;
    }

    if (type === 'super_weapon_alert') {
      const wId = String(msg.weaponId || 'excalibur_sun') as WeaponId;
      const def = getWeaponDef(wId);
      const wx = Number(msg.x) || 0;
      const wz = Number(msg.z) || 0;
      this.superWeaponAlert = {
        uid: Number(msg.uid) || 0,
        weaponId: wId,
        name: String(msg.name || def.name),
        shortName: String(msg.shortName || def.shortName),
        x: wx,
        z: wz,
        durability: Number(msg.durability) || def.maxDurability,
        maxDurability: Number(msg.maxDurability) || def.maxDurability,
        color: String(msg.color || def.color),
        startedAt: performance.now(),
      };
      const colorHex = Number.parseInt(def.color.replace('#', ''), 16) || 0xfacc15;
      this.spawnDynamicLight(wx, groundHeightAt(wx, wz, this.activeMapId, this.terrainSeed) + 6, wz, colorHex, 12, 42, 1.5);
      this.audio.playSuperWeaponSpawn();
      this.pushFeed(`MYTHIC DROP: ${this.superWeaponAlert.name}!`, this.superWeaponAlert.color);
      this.emitHud();
      return;
    }

    if (type === 'super_weapon_claimed') {
      const uid = Number(msg.uid) || 0;
      if (this.superWeaponAlert?.uid === uid) {
        this.superWeaponAlert = null;
      }
      this.removeGroundWeapon(uid);
      const claimer = String(msg.claimerName || 'Pilot');
      const wName = String(msg.name || 'Mythic Weapon');
      this.pushFeed(`${claimer} claimed ${wName}!`, String(msg.color || '#FACC15'));
      this.emitHud();
      return;
    }

    if (type === 'weapon_fx') {
      const actorId = Number(msg.actorId) || 0;
      const cat = msg.category === 'melee' ? 'melee' : 'ranged';
      const mythic = msg.rarity === 'mythic';
      const x = Number(msg.x) || 0;
      const y = Number(msg.y) || 0;
      const z = Number(msg.z) || 0;
      const tx = Number(msg.tx) || x;
      const ty = Number(msg.ty) || y;
      const tz = Number(msg.tz) || z;
      const yaw = Number(msg.yaw) || 0;
      const pitch = Number(msg.pitch) || 0;
      const splash = Number(msg.splashRadius) || 0;
      const colorHex = Number.parseInt(String(msg.color || '#fbbf24').replace('#', ''), 16) || 0xfbbf24;

      const distToCam = Math.hypot(x - this.camera.position.x, z - this.camera.position.z);
      if (actorId === this.localSlotId) {
        this.audio.playWeaponAttack(cat, mythic);
        this.shakeIntensity = Math.max(this.shakeIntensity, mythic ? 0.52 : 0.16);
      } else if (distToCam < 44) {
        this.audio.playWeaponAttack(cat, mythic);
      }

      if (cat === 'melee') {
        this.spawnRingVfx(x, y, z, 1.4, mythic ? 13 : 8.2, colorHex, 0.28);
        this.spawnSparks(x + Math.sin(yaw) * 3.5, y, z + Math.cos(yaw) * 3.5, mythic ? 24 : 12, colorHex, 15);
        if (msg.weaponId === 'excalibur_sun') {
          this.spawnBeamVfx(x, y, z, yaw, pitch, 26, colorHex);
        }
      } else {
        const dist = Math.max(2.5, Math.hypot(tx - x, ty - y, tz - z));
        this.spawnDynamicLight(x, y + 1, z, colorHex, mythic ? 9 : 5, 22, 0.18);
        if (this.activeQualityTier === 'high' || this.activeQualityTier === 'ultra') {
          this.spawnBulletVfx(x, y, z, tx, ty, tz, colorHex, mythic, splash);
        } else {
          this.spawnBeamVfx(x, y, z, yaw, pitch, dist, colorHex);
          this.spawnSparks(tx, ty, tz, mythic ? 26 : 12, colorHex, 18);
          if (splash > 0) {
            this.spawnRingVfx(tx, ty, tz, 1.2, splash, colorHex, 0.42);
          }
        }
      }
      return;
    }

    if (type === 'event_sync') {
      const evId = String(msg.eventId || 'none') as EventId;
      this.activeEventId = evId;
      this.activeEventTimer = Number(msg.eventTimer) || 0;
      this.nextEventIn = Number(msg.nextEventIn) || EVENT_INTERVAL_SECONDS;
      if (Array.isArray(msg.disasterPillars)) {
        this.syncDisasterPillars(msg.disasterPillars as DisasterPillarSync[]);
      }
      const evDef = getEventDef(evId);
      if (evDef) {
        this.pushFeed(`Disaster (60s): ${evDef.name}`, evDef.accent);
        this.audio.playEventAlert();
      }
      this.emitHud();
      return;
    }

    if (type === 'meteor') {
      this.spawnMeteorVfx(Number(msg.x) || 0, Number(msg.z) || 0, Number(msg.radius) || 9.5, Number(msg.delay) || 1.35);
      return;
    }

    if (type === 'lightning') {
      this.spawnLightningVfx(
        Number(msg.x) || 0,
        Number(msg.y) || 2,
        Number(msg.z) || 0,
        Number(msg.radius) || 11.5,
      );
      return;
    }

    if (type === 'skill_fx') {
      const kind = String(msg.kind || '');
      const x = Number(msg.x) || 0;
      const y = Number(msg.y) || 0;
      const z = Number(msg.z) || 0;
      const actorId = Number(msg.actorId) || 0;
      if (actorId === this.localSlotId) {
        this.audio.playSkill(kind);
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.35);
      }

      if (kind === 'nova_blast') {
        this.spawnRingVfx(x, y, z, 1.5, 18, 0xf59e0b, 0.48);
        this.spawnSparks(x, y, z, 28, 0xfbbf24, 22);
        this.spawnDynamicLight(x, y + 1.5, z, 0xf59e0b, 10, 32, 0.42);
      } else if (kind === 'phase_blink') {
        this.spawnSparks(x, y, z, 16, 0x38bdf8, 16);
        this.spawnSparks(Number(msg.tx) || x, Number(msg.ty) || y, Number(msg.tz) || z, 20, 0x38bdf8, 18);
      } else if (kind === 'aegis_dome') {
        this.spawnRingVfx(x, y, z, 1.2, 5.5, 0x2dd4bf, 0.55);
      } else if (kind === 'vortex_snare') {
        this.spawnRingVfx(x, y, z, 21, 1.8, 0xa855f7, 0.55);
        this.spawnSparks(x, y, z, 22, 0xa855f7, 14);
      } else if (kind === 'solar_lance') {
        this.spawnBeamVfx(x, y, z, Number(msg.yaw) || 0, 0, 42, 0xef4444);
        this.spawnSparks(Number(msg.tx) || x, Number(msg.ty) || y, Number(msg.tz) || z, 18, 0xef4444, 18);
      } else if (kind === 'overdrive') {
        this.spawnRingVfx(x, y, z, 1.2, 6.5, 0xf97316, 0.42);
      } else if (kind === 'emp_shock') {
        this.spawnRingVfx(x, y, z, 1.4, 16, 0x60a5fa, 0.42);
        this.spawnSparks(x, y, z, 24, 0x60a5fa, 18);
      } else if (kind === 'shard_magnet') {
        this.spawnRingVfx(x, y, z, 18, 2.5, 0xfacc15, 0.5);
      }
      return;
    }

    if (type === 'match_end') {
      this.matchPhase = 'postmatch';
      this.activeEventId = 'none';
      this.activeEventTimer = 0;
      this.fireHeld = false;
      this.throwChargeTimer = 0;
      this.roleBanner = null;
      this.superWeaponAlert = null;
      this.comboToast = null;
      this.floatingDmgs = [];
      if (typeof msg.normalModeId === 'string') {
        this.activeNormalModeId = msg.normalModeId as NormalModeId;
      }
      this.winningTeam = Number(msg.winningTeam) || 0;
      this.solarKills = Number(msg.solarKills) || 0;
      this.eclipseKills = Number(msg.eclipseKills) || 0;
      this.postMatchScores = Array.isArray(msg.scores) ? (msg.scores as PostMatchRow[]) : [];
      if (msg.mapVotes && typeof msg.mapVotes === 'object') {
        this.mapVotes = { ...emptyMapVotes(), ...(msg.mapVotes as Partial<Record<MapId, number>>) };
      }
      if (Array.isArray(msg.modeVoteOptions)) {
        this.modeVoteOptions = msg.modeVoteOptions as ModeVoteOption[];
      }
      if (msg.modeVotes && typeof msg.modeVotes === 'object') {
        this.modeVotes = msg.modeVotes as Record<string, number>;
      }
      this.myVote = null;
      this.myModeVote = null;
      if (this.mode === 'playing' || this.mode === 'paused') {
        this.mode = 'postmatch';
        this.heldKeys.clear();
        this.touchMoveX = 0;
        this.touchMoveZ = 0;
        this.exitPointerLock();
      }
      this.audio.playMatchEnd();
      this.emitHud();
      return;
    }

    if (type === 'map_votes' && msg.votes && typeof msg.votes === 'object') {
      this.mapVotes = { ...emptyMapVotes(), ...(msg.votes as Partial<Record<MapId, number>>) };
      this.emitHud();
      return;
    }

    if (type === 'mode_votes' && msg.votes && typeof msg.votes === 'object') {
      this.modeVotes = msg.votes as Record<string, number>;
      this.emitHud();
      return;
    }

    if (type === 'match_start') {
      const incomingSeed = typeof msg.terrainSeed === 'number' ? msg.terrainSeed : this.terrainSeed;
      if (typeof msg.mapId === 'string') {
        this.switchMap(msg.mapId as MapId, incomingSeed);
      }
      if (typeof msg.matchNumber === 'number') this.matchNumber = msg.matchNumber;
      if (typeof msg.normalModeId === 'string') {
        this.activeNormalModeId = msg.normalModeId as NormalModeId;
      }
      if (typeof msg.specialModeId === 'string') {
        this.activeSpecialModeId = msg.specialModeId as SpecialModeId;
      }
      if (msg.modeHud && typeof msg.modeHud === 'object') {
        this.modeHud = msg.modeHud as ModeHudPayload;
      } else {
        this.modeHud = {
          normalModeId: this.activeNormalModeId,
          specialModeId: this.activeSpecialModeId,
        };
      }
      this.localTeamId = msg.teamId === 5 || msg.teamId === 6 ? msg.teamId : 0;
      this.matchPhase = 'active';
      this.matchTimeRemaining = Number(msg.matchDuration) || MATCH_DURATION_SECONDS;
      this.activeEventId = 'none';
      this.activeEventTimer = 0;
      this.nextEventIn = Number(msg.nextEventIn) || EVENT_INTERVAL_SECONDS;
      this.starterCooldown = 0;
      this.nextReplaceSlot = 0;
      this.weaponCooldownTimer = 0;
      this.fireHeld = false;
      this.throwChargeTimer = 0;
      this.localPitch = 0;
      this.winningTeam = 0;
      this.solarKills = 0;
      this.eclipseKills = 0;
      this.superWeaponAlert = null;
      this.comboToast = null;
      this.floatingDmgs = [];
      this.kills = 0;
      this.myVote = null;
      this.myModeVote = null;
      this.modeVoteOptions = [];
      this.modeVotes = {};
      this.postMatchScores = [];
      this.feed = [];
      if (Array.isArray(msg.pylons)) {
        this.syncPylons(msg.pylons as Array<Record<string, unknown>>);
      }
      if (Array.isArray(msg.groundWeapons)) {
        this.syncAllGroundWeapons(msg.groundWeapons as GroundWeaponSync[]);
      }
      if (Array.isArray(msg.disasterPillars)) {
        this.syncDisasterPillars(msg.disasterPillars as DisasterPillarSync[]);
      }
      this.syncWorldDynamics(msg);
      this.missingLocalSince = null;
      if (this.mode === 'title') {
        this.guiHidden = false;
      } else if (this.mode === 'postmatch') {
        if (this.localSlotId !== null) {
          this.mode = 'playing';
          this.heldKeys.clear();
          this.touchMoveX = 0;
          this.touchMoveZ = 0;
          this.endFireHold();
        } else if (this.lastJoinParams && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.lastAutoRejoinAt = performance.now();
          this.ws.send(JSON.stringify({ type: 'join', ...this.lastJoinParams }));
        } else {
          this.mode = 'title';
          this.guiHidden = false;
        }
      }
      if (msg.roleBanner) {
        this.showRoleBanner(msg.roleBanner);
        this.audio.playEventAlert();
      }
      const mapDef = getMapDef(this.activeMapId);
      const specDef = getSpecialModeDef(this.activeSpecialModeId);
      const normDef = getNormalModeDef(this.activeNormalModeId);
      this.pushFeed(
        specDef
          ? `SPECIAL #${this.matchNumber}: ${specDef.name}!`
          : `Match #${this.matchNumber}: ${normDef.name} on ${mapDef.name}`,
        specDef ? specDef.accent : normDef.accent,
      );
      this.emitHud();
      return;
    }

    if (type === 'player_join') {
      const slotId = Number(msg.slotId);
      this.onlinePlayers = Number(msg.onlinePlayers) ?? this.onlinePlayers;
      if (msg.botCount !== undefined) this.botCount = Number(msg.botCount) || 0;
      this.playerMeta.set(slotId, {
        slotId,
        name: String(msg.name || 'Skimmer'),
        colorIndex: Number(msg.colorIndex) || 0,
        isBot: Boolean(msg.isBot),
      });
      return;
    }

    if (type === 'player_meta') {
      const slotId = Number(msg.slotId);
      const colorIndex = Number(msg.colorIndex) || 0;
      const prev = this.playerMeta.get(slotId);
      this.playerMeta.set(slotId, {
        slotId,
        name: String(msg.name || 'Skimmer'),
        colorIndex,
        isBot: msg.isBot !== undefined ? Boolean(msg.isBot) : Boolean(prev?.isBot),
      });
      const tracked = this.trackedPlayers.get(slotId);
      if (tracked) {
        tracked.colorIndex = colorIndex;
        tracked.rig.setColorIndex(colorIndex);
      }
      return;
    }

    if (type === 'player_leave') {
      const slotId = Number(msg.slotId);
      this.onlinePlayers = Number(msg.onlinePlayers) ?? this.onlinePlayers;
      if (msg.botCount !== undefined) this.botCount = Number(msg.botCount) || 0;
      this.playerMeta.delete(slotId);
      const tracked = this.trackedPlayers.get(slotId);
      if (tracked) {
        this.scene.remove(tracked.rig.root);
        this.trackedPlayers.delete(slotId);
      }
      return;
    }

    if (type === 'crystals_sync') {
      const updates = msg.updates as Array<{ id: number; active: boolean }> | undefined;
      if (Array.isArray(updates)) {
        for (const u of updates) {
          if (u.id >= 0 && u.id < this.crystalActive.length) {
            if (this.crystalActive[u.id] && !u.active) {
              const sp = this.crystalLayouts[u.id];
              this.spawnSparks(sp.x, sp.y, sp.z, 8, sp.kind === 1 ? 0xf59e0b : 0x14b8a6, 9);
            }
            this.crystalActive[u.id] = u.active;
          }
        }
      }
      return;
    }

    if (type === 'orbs_sync') {
      const updates = msg.updates as Array<{ id: number; active: boolean }> | undefined;
      if (Array.isArray(updates)) {
        for (const u of updates) {
          if (u.id >= 0 && u.id < this.orbActive.length) {
            this.orbActive[u.id] = u.active;
          }
        }
      }
      return;
    }

    if (type === 'pylons_sync' && Array.isArray(msg.pylons)) {
      this.syncPylons(msg.pylons as Array<Record<string, unknown>>);
      return;
    }

    if (type === 'pickup') {
      this.audio.playCrystal(Number(msg.kind) === 1);
      return;
    }

    if (type === 'fx') {
      const kind = String(msg.kind || '');
      const fx = Number(msg.x) || 0;
      const fy = Number(msg.y) || 0;
      const fz = Number(msg.z) || 0;
      const actorId = Number(msg.actorId) || 0;
      const targetId = Number(msg.targetId) || 0;
      const involvesLocal =
        this.localSlotId !== null && (actorId === this.localSlotId || targetId === this.localSlotId);

      if (kind === 'dash') {
        this.spawnSparks(fx, fy, fz, 10, 0x38bdf8, 12);
        if (actorId === this.localSlotId) this.audio.playDash();
      } else if (kind === 'boost_ring') {
        this.spawnRingVfx(fx, fy, fz, 2.2, 10, 0xfbbf24, 0.42);
        this.spawnSparks(fx, fy, fz, 18, 0xfbbf24, 16);
        if (actorId === this.localSlotId) {
          this.audio.playBoostRing();
          this.pushFeed(`Boost Ring +${Number(msg.amount) || 30}`, '#FBBF24');
        }
      } else if (kind === 'orb_pickup') {
        this.spawnRingVfx(fx, fy, fz, 1.4, 8, 0xc084fc, 0.4);
        this.spawnSparks(fx, fy, fz, 20, 0xc084fc, 16);
        if (actorId === this.localSlotId) {
          this.audio.playSkillGrant();
        }
      } else if (kind === 'pulse') {
        this.spawnSparks(fx, fy, fz, 22, 0x38bdf8, 18);
        const tracked = this.trackedPlayers.get(actorId);
        if (tracked) tracked.rig.triggerPulseVisual();
        if (actorId === this.localSlotId) {
          this.audio.playPulse();
          this.shakeIntensity = Math.max(this.shakeIntensity, 0.35);
        }
      } else if (kind === 'clash') {
        this.spawnSparks(fx, fy, fz, 24, 0xfbbf24, 20);
        if (involvesLocal) {
          this.audio.playClash(false);
          this.hitstopTimer = 0.042;
          this.shakeIntensity = Math.max(this.shakeIntensity, 0.65);
        }
      } else if (kind === 'shatter') {
        this.spawnSparks(fx, fy, fz, 46, 0xef4444, 24);
        const actorName = String(msg.actorName || 'Arena');
        const targetName = String(msg.targetName || 'Skimmer');
        const streak = Number(msg.streak) || 0;
        const streakTag = streak >= 2 ? ` (${streak}x STREAK!)` : '';
        this.pushFeed(`${actorName} shattered ${targetName}${streakTag}`, '#EF4444');
        if (involvesLocal) {
          this.audio.playClash(true);
          if (actorId === this.localSlotId && streak >= 2) {
            this.audio.playStreak(streak);
          }
          this.hitstopTimer = 0.065;
          this.shakeIntensity = Math.max(this.shakeIntensity, 1.05);
        }
      } else if (kind === 'capture') {
        this.spawnSparks(fx, fy, fz, 28, 0xf59e0b, 16);
        const actorName = String(msg.actorName || 'Skimmer');
        const pylonName = String(msg.pylonName || 'Pylon');
        this.pushFeed(`${actorName} claimed ${pylonName}`, '#F59E0B');
        if (actorId === this.localSlotId) this.audio.playCapture();
      } else if (kind === 'vortex_pulse') {
        const pull = Number(msg.amount) === 1;
        this.spawnRingVfx(fx, fy, fz, pull ? 135 : 8, pull ? 8 : 140, 0xc084fc, 0.85);
        this.spawnSparks(fx, fy + 2, fz, 32, 0xc084fc, 22);
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.25);
      } else if (kind === 'quake_wave') {
        this.spawnRingVfx(fx, fy, fz, 10, 155, 0x10b981, 0.72);
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.45);
      } else if (kind === 'flare_wave') {
        this.spawnRingVfx(fx, fy, fz, 92, 165, 0xfb7185, 0.8);
      } else if (kind === 'goal') {
        const scorerTeam = Number(msg.amount) === 5 ? 'SOLAR' : 'ECLIPSE';
        const goalAccent = Number(msg.amount) === 5 ? '#F59E0B' : '#38BDF8';
        this.pushFeed(`GOAL! ${String(msg.actorName || 'Pilot')} scored for ${scorerTeam}!`, goalAccent);
        this.spawnExplosionVfx(fx, fy + 2, fz, 14, Number(msg.amount) === 5 ? 0xf59e0b : 0x38bdf8, true);
        this.audio.playCapture();
      }
    }
  }

  private applyPylonVisual(id: number, target: PylonHudState): void {
    const vis = this.arena?.pylonVisuals[id];
    if (!vis) return;
    if (target.ownerSlotId !== null) {
      const hex = getPaletteColorHex(target.ownerColor);
      vis.ringMat.color.set(hex);
      vis.ringMat.emissive.set(hex);
      vis.beaconMat.color.set(hex);
      vis.beaconMat.emissive.set(hex);
    } else {
      vis.ringMat.color.setHex(0xdca13b);
      vis.ringMat.emissive.setHex(0xb45309);
      vis.beaconMat.color.setHex(0xf59e0b);
      vis.beaconMat.emissive.setHex(0xd97706);
    }
  }

  private refreshAllPylonVisuals(): void {
    for (let i = 0; i < this.pylonStates.length; i++) {
      this.applyPylonVisual(i, this.pylonStates[i]);
    }
  }

  private syncPylons(list: Array<Record<string, unknown>>): void {
    for (const item of list) {
      const id = Number(item.id);
      const target = this.pylonStates[id];
      if (!target) continue;
      target.ownerSlotId = item.ownerSlotId === null ? null : Number(item.ownerSlotId);
      target.ownerName = String(item.ownerName || '');
      target.ownerColor = Number(item.ownerColor) || 0;
      target.progress = Number(item.progress) || 0;
      this.applyPylonVisual(id, target);
    }
  }

  private applySnapshot(snap: {
    serverTime: number;
    sovereignSlotId: number;
    beamAngle: number;
    mapIndex: number;
    terrainSeed: number;
    normalModeIndex: number;
    specialModeIndex: number;
    matchNumber: number;
    matchPhase: MatchPhase;
    eventIndex: number;
    matchTimeRemaining: number;
    players: SnapshotPlayer[];
    sentinels: SnapshotSentinel[];
    nextbots: SnapshotNextbot[];
  }): void {
    let humanCount = 0;
    let botCount = 0;
    this.sovereignSlotId = snap.sovereignSlotId;
    this.beamAngle = snap.beamAngle;
    this.matchTimeRemaining = snap.matchTimeRemaining;
    this.matchNumber = snap.matchNumber;
    this.activeNormalModeId = getNormalModeByIndex(snap.normalModeIndex);
    this.activeSpecialModeId = getSpecialModeByIndex(snap.specialModeIndex);

    const snapMapDef = getMapByIndex(snap.mapIndex);
    if (snapMapDef.id !== this.activeMapId || snap.terrainSeed !== this.terrainSeed) {
      this.switchMap(snapMapDef.id, snap.terrainSeed);
    }

    if (snap.matchPhase !== this.matchPhase) {
      this.matchPhase = snap.matchPhase;
      if (this.matchPhase === 'postmatch' && (this.mode === 'playing' || this.mode === 'paused')) {
        this.mode = 'postmatch';
        this.fireHeld = false;
        this.throwChargeTimer = 0;
        this.exitPointerLock();
      } else if (this.matchPhase === 'active' && this.mode === 'postmatch') {
        if (this.localSlotId !== null) {
          this.mode = 'playing';
        } else if (this.lastJoinParams && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.lastAutoRejoinAt = performance.now();
          this.ws.send(JSON.stringify({ type: 'join', ...this.lastJoinParams }));
        } else {
          this.mode = 'title';
          this.guiHidden = false;
        }
      }
    }

    const snapEvent = getEventByIndex(snap.eventIndex);
    if (snapEvent !== this.activeEventId) {
      this.activeEventId = snapEvent;
    }

    if (!this.rendererReady || !this.materials) {
      for (let i = 0; i < snap.players.length; i++) {
        if (snap.players[i].isBot) botCount++;
        else humanCount++;
      }
      this.onlinePlayers = humanCount;
      this.botCount = botCount;
      this.pendingSnapshot = snap;
      return;
    }

    const shadowsAllowed = QUALITY_PROFILES[this.activeQualityTier].shadows && !this.isSoftwareGl;
    const seenSlots = new Set<number>();
    for (let i = 0; i < snap.players.length; i++) {
      const sp = snap.players[i];
      seenSlots.add(sp.slotId);
      if (sp.isBot) botCount++;
      else humanCount++;

      // Team color tinting whenever player belongs to a team (5=Solar Amber, 6=Eclipse Cobalt)
      const spTeam: 0 | 5 | 6 =
        sp.teamId === 5 || sp.teamId === 6
          ? sp.teamId
          : sp.specialRole === 5 || sp.specialRole === 6
          ? sp.specialRole
          : 0;
      const effectiveColorIndex =
        spTeam === 5 ? 0 : spTeam === 6 ? 2 : sp.colorIndex;

      let tracked = this.trackedPlayers.get(sp.slotId);
      if (!tracked) {
        const useMobileLambert = this.isMobileDevice && this.activeQualityTier === 'low';
        const rig = createSkimmerRig(
          this.materials,
          effectiveColorIndex,
          !shadowsAllowed,
          useMobileLambert,
        );
        rig.root.position.set(sp.x, sp.y, sp.z);
        rig.root.rotation.y = sp.yaw;
        rig.setWeaponIndex(sp.weaponKindIndex || 0, this.materials, useMobileLambert);
        this.scene.add(rig.root);
        tracked = {
          slotId: sp.slotId,
          rig,
          targetX: sp.x,
          targetY: sp.y,
          targetZ: sp.z,
          targetYaw: sp.yaw,
          targetRoll: sp.roll,
          targetPitch: sp.pitch,
          targetScale: sp.scale || 1,
          renderX: sp.x,
          renderY: sp.y,
          renderZ: sp.z,
          renderYaw: sp.yaw,
          renderRoll: sp.roll,
          renderPitch: sp.pitch,
          renderScale: sp.scale || 1,
          shield: sp.shield,
          boost: sp.boost,
          score: sp.score,
          alive: sp.alive,
          dashing: sp.dashing,
          pulsing: sp.pulsing,
          sovereign: sp.sovereign,
          grounded: sp.grounded,
          isBot: sp.isBot,
          shielded: sp.shielded,
          overdrive: sp.overdrive,
          specialRole: sp.specialRole || 0,
          teamId: spTeam,
          weaponKindIndex: sp.weaponKindIndex || 0,
          attacking: Boolean(sp.attacking),
          colorIndex: effectiveColorIndex,
          lastPulseFlag: sp.pulsing,
          lastDashFlag: sp.dashing,
        };
        rig.root.scale.setScalar(tracked.renderScale);
        this.trackedPlayers.set(sp.slotId, tracked);

        if (sp.slotId === this.localSlotId) {
          this.localYaw = sp.yaw;
        }
      } else {
        if (sp.slotId === this.localSlotId) {
          this.localSpeed = Math.hypot(sp.x - tracked.targetX, sp.z - tracked.targetZ) * 20;
          if (this.lastAlive && !sp.alive) {
            this.respawnCountdown = RESPAWN_DURATION_SECONDS;
            this.fireHeld = false;
            this.throwChargeTimer = 0;
          }
          this.lastAlive = sp.alive;
        }

        if (!tracked.lastPulseFlag && sp.pulsing && sp.isBot) {
          tracked.rig.triggerPulseVisual();
        }
        tracked.lastPulseFlag = sp.pulsing;
        tracked.lastDashFlag = sp.dashing;

        tracked.targetX = sp.x;
        tracked.targetY = sp.y;
        tracked.targetZ = sp.z;
        tracked.targetYaw = sp.yaw;
        tracked.targetRoll = sp.roll;
        tracked.targetPitch = sp.pitch;
        tracked.targetScale = sp.scale || 1;
        tracked.shield = sp.shield;
        tracked.boost = sp.boost;
        tracked.score = sp.score;
        tracked.alive = sp.alive;
        tracked.dashing = sp.dashing;
        tracked.pulsing = sp.pulsing;
        tracked.sovereign = sp.sovereign;
        tracked.grounded = sp.grounded;
        tracked.isBot = sp.isBot;
        tracked.shielded = sp.shielded;
        tracked.overdrive = sp.overdrive;
        tracked.specialRole = sp.specialRole || 0;
        tracked.teamId = spTeam;
        tracked.attacking = Boolean(sp.attacking);
        if (tracked.weaponKindIndex !== (sp.weaponKindIndex || 0)) {
          tracked.weaponKindIndex = sp.weaponKindIndex || 0;
          tracked.rig.setWeaponIndex(
            tracked.weaponKindIndex,
            this.materials,
            this.isMobileDevice && this.activeQualityTier === 'low',
          );
        }
        if (tracked.colorIndex !== effectiveColorIndex) {
          tracked.colorIndex = effectiveColorIndex;
          tracked.rig.setColorIndex(effectiveColorIndex);
        }
      }
    }

    this.onlinePlayers = humanCount;
    this.botCount = botCount;

    for (const [slotId, tracked] of this.trackedPlayers.entries()) {
      if (!seenSlots.has(slotId)) {
        this.scene.remove(tracked.rig.root);
        this.trackedPlayers.delete(slotId);
      }
    }

    // Recovery failsafe: prevent ever getting trapped in playing/paused with a missing local avatar (orbiting spire)
    if ((this.mode === 'playing' || this.mode === 'paused') && this.connected && this.matchPhase === 'active') {
      const hasLocal = this.localSlotId !== null && seenSlots.has(this.localSlotId);
      if (hasLocal) {
        this.missingLocalSince = null;
      } else {
        const now = performance.now();
        if (this.missingLocalSince === null) {
          this.missingLocalSince = now;
        } else if (now - this.missingLocalSince > 1500) {
          if (
            this.lastJoinParams &&
            this.ws &&
            this.ws.readyState === WebSocket.OPEN &&
            now - this.lastAutoRejoinAt > 2500
          ) {
            this.lastAutoRejoinAt = now;
            this.ws.send(JSON.stringify({ type: 'join', ...this.lastJoinParams }));
          } else if (now - this.missingLocalSince > 4500) {
            this.missingLocalSince = null;
            this.mode = 'title';
            this.localSlotId = null;
            this.guiHidden = false;
            this.spectateActive = false;
            this.spectatingSlotId = null;
            this.exitPointerLock();
            this.emitHud();
          }
        }
      }
    } else {
      this.missingLocalSince = null;
    }

    const seenSentinels = new Set<number>();
    for (let i = 0; i < snap.sentinels.length; i++) {
      const ss = snap.sentinels[i];
      seenSentinels.add(ss.id);
      while (this.sentinels.length <= ss.id) {
        const rig = createSentinelRig(this.materials, shadowsAllowed);
        rig.root.visible = false;
        this.scene.add(rig.root);
        this.sentinels.push({
          id: this.sentinels.length,
          rig,
          targetX: 0,
          targetY: 0,
          targetZ: 0,
          targetYaw: 0,
          state: 0,
          hp: 100,
        });
      }
      const ts = this.sentinels[ss.id];
      if (!ts) continue;
      ts.targetX = ss.x;
      ts.targetY = ss.y;
      ts.targetZ = ss.z;
      ts.targetYaw = ss.yaw;
      ts.state = ss.state;
      ts.hp = ss.hp;
    }
    for (let i = 0; i < this.sentinels.length; i++) {
      if (!seenSentinels.has(i)) {
        this.sentinels[i].state = 3;
      }
    }

    const seenNbIds = new Set<number>();
    const nbList = snap.nextbots || [];
    for (let i = 0; i < nbList.length; i++) {
      const sn = nbList[i];
      seenNbIds.add(sn.id);
      let trackedNb = this.trackedNextbots.get(sn.id);
      if (!trackedNb) {
        const rig = createNextbotRig(this.materials, sn.variant);
        rig.root.position.set(sn.x, sn.y, sn.z);
        this.scene.add(rig.root);
        trackedNb = {
          id: sn.id,
          variant: sn.variant,
          rig,
          targetX: sn.x,
          targetY: sn.y,
          targetZ: sn.z,
          renderX: sn.x,
          renderY: sn.y,
          renderZ: sn.z,
          slowed: sn.slowed,
          banished: sn.banished,
        };
        this.trackedNextbots.set(sn.id, trackedNb);
      } else {
        trackedNb.targetX = sn.x;
        trackedNb.targetY = sn.y;
        trackedNb.targetZ = sn.z;
        trackedNb.slowed = sn.slowed;
        trackedNb.banished = sn.banished;
      }
    }
    for (const [id, nb] of this.trackedNextbots.entries()) {
      if (!seenNbIds.has(id)) {
        this.scene.remove(nb.rig.root);
        nb.rig.dispose();
        this.trackedNextbots.delete(id);
      }
    }
  }

  private sendInputFrame(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.mode !== 'playing' || this.localSlotId === null) return;

    let moveX = this.touchMoveX;
    let moveZ = this.touchMoveZ;
    if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) moveZ += 1;
    if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) moveZ -= 1;
    if (this.heldKeys.has('KeyD')) moveX += 1;
    if (this.heldKeys.has('KeyA')) moveX -= 1;

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) {
      moveX /= len;
      moveZ /= len;
    }

    const now = performance.now();
    const dash = this.dashBufferedUntil > now;
    const pulse = this.pulseBufferedUntil > now;
    const jump = this.jumpBufferedUntil > now;
    if (dash) this.dashBufferedUntil = 0;
    if (pulse) this.pulseBufferedUntil = 0;
    if (jump) this.jumpBufferedUntil = 0;

    this.ws.send(
      JSON.stringify({
        type: 'input',
        moveX,
        moveZ,
        yaw: this.localYaw,
        pitch: this.localPitch,
        dash,
        pulse,
        jump,
      }),
    );
  }

  // Title Screen Spectate & Hide GUI API (strictly Title Screen only)
  public startSpectate(): void {
    if (this.mode !== 'title') return;
    this.spectateActive = true;
    this.guiHidden = false;
    this.pickValidSpectateTarget(1);
    this.emitHud();
  }

  public stopSpectate(): void {
    if (this.mode !== 'title') return;
    this.spectateActive = false;
    this.spectatingSlotId = null;
    this.emitHud();
  }

  public cycleSpectate(dir: 1 | -1): void {
    if (this.mode !== 'title' || !this.spectateActive) return;
    this.pickValidSpectateTarget(dir);
    this.emitHud();
  }

  public setGuiHidden(hidden: boolean): void {
    if (this.mode !== 'title') return;
    this.guiHidden = hidden;
    if (hidden) this.spectateActive = false;
    this.emitHud();
  }

  private pickValidSpectateTarget(dir: 1 | -1): void {
    const candidates = Array.from(this.trackedPlayers.values()).filter((p) => p.alive);
    if (candidates.length === 0) {
      this.spectatingSlotId = null;
      return;
    }
    candidates.sort((a, b) => {
      if (a.isBot !== b.isBot) return a.isBot ? 1 : -1;
      return b.score - a.score;
    });
    const curIdx = candidates.findIndex((c) => c.slotId === this.spectatingSlotId);
    if (curIdx === -1) {
      this.spectatingSlotId = candidates[0].slotId;
    } else {
      const nextIdx = (curIdx + dir + candidates.length) % candidates.length;
      this.spectatingSlotId = candidates[nextIdx].slotId;
    }
  }

  // Multi-touch, Analog Fire Joystick & Skill API
  public setTouchMove(x: number, z: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveZ = Math.max(-1, Math.min(1, z));
  }

  public addTouchSteerDelta(dxPixels: number, dyPixels = 0): void {
    if (this.mode !== 'playing') return;
    this.mouseSteerNormX = 0;
    if (Math.abs(dxPixels) > 0.05 || Math.abs(dyPixels) > 0.05) {
      this.lastTouchAimAt = performance.now();
    }
    // Mobile touch manual aim is 50% slower than legacy touch sensitivity (0.0028/0.0020 vs 0.0056/0.0040)
    // with gentle sticky dampening near an enemy so aim assist smoothly completes tracking to 100%.
    const stickiness = this.aimAssistFriction;
    this.localYaw -= dxPixels * 0.0028 * stickiness;
    this.localPitch = this.clampPitch(this.localPitch - dyPixels * 0.0020 * stickiness);
  }

  public beginFireHold(fromGamepadStick = false): void {
    if (this.mode !== 'playing' || this.matchPhase !== 'active') return;
    if (this.weapons.length === 0) {
      this.triggerDash();
      return;
    }
    this.audio.unlock();
    this.fireHeld = true;
    this.fireFromTouch = fromGamepadStick;
    if (fromGamepadStick) {
      this.fireStickX = 0;
      this.fireStickY = 0;
      this.lastTouchAimAt = performance.now();
    }
    const equipped = this.weapons[this.equippedWeaponSlot];
    if (!equipped) return;
    const def = getWeaponDef(equipped.id);
    const localPlayer = this.localSlotId !== null ? this.trackedPlayers.get(this.localSlotId) : undefined;
    if (!localPlayer || !localPlayer.alive) return;
    if (def.fireMode === 'auto' || def.fireMode === 'semi') {
      if (this.weaponCooldownTimer <= 0 && this.hasCrosshairEnemyTarget(localPlayer, def.range)) {
        this.executeEquippedWeaponFire();
      }
    } else if (def.fireMode === 'melee') {
      if (this.weaponCooldownTimer <= 0) {
        const reach = def.range * Math.max(1, localPlayer.renderScale * 0.65) + 0.8;
        if (this.hasMeleeTargetInRange(localPlayer, reach)) {
          this.executeEquippedWeaponFire();
        }
      }
    }
  }

  public steerFireHold(stickNormX: number, stickNormY: number): void {
    if (this.mode !== 'playing') return;
    this.fireStickX = Math.max(-1, Math.min(1, stickNormX));
    this.fireStickY = Math.max(-1, Math.min(1, stickNormY));
    if (this.fireFromTouch || this.isMobileDevice || this.touchEnabled) {
      this.lastTouchAimAt = performance.now();
    }
  }

  public endFireHold(): void {
    this.fireHeld = false;
    this.fireFromTouch = false;
    this.fireStickX = 0;
    this.fireStickY = 0;
    this.throwChargeTimer = 0;
    this.aimAssistTargetKey = null;
    this.aimAssistFriction = 1;
  }

  public triggerDash(): void {
    if (this.mode !== 'playing') return;
    this.audio.unlock();
    this.dashBufferedUntil = performance.now() + 160;
  }

  public triggerJump(): void {
    if (this.mode !== 'playing') return;
    this.audio.unlock();
    this.jumpBufferedUntil = performance.now() + 160;
    this.audio.playJump();
  }

  public triggerPulse(): void {
    if (this.mode !== 'playing') return;
    this.audio.unlock();
    this.pulseBufferedUntil = performance.now() + 160;
  }

  public triggerSkill(slotIndex: number): void {
    if (this.mode !== 'playing' || this.matchPhase !== 'active') return;
    if (slotIndex < 0 || slotIndex >= this.skills.length) return;
    this.audio.unlock();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'use_skill', slotIndex }));
    }
  }

  public selectWeaponSlot(slotIndex: number): void {
    if (this.mode !== 'playing' || slotIndex < 0 || slotIndex >= this.weapons.length) return;
    if (this.equippedWeaponSlot === slotIndex) return;
    this.equippedWeaponSlot = slotIndex;
    this.throwChargeTimer = 0;
    this.audio.unlock();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'select_weapon', slotIndex }));
    }
    this.emitHud();
  }

  private executeEquippedWeaponFire(): void {
    if (this.mode !== 'playing' || this.matchPhase !== 'active') return;
    if (this.weaponCooldownTimer > 0) return;
    const equipped = this.weapons[this.equippedWeaponSlot];
    if (!equipped) return;
    const def = getWeaponDef(equipped.id);
    this.weaponCooldownDuration = def.cooldown;
    this.weaponCooldownTimer = def.cooldown;
    this.audio.unlock();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'use_weapon',
          yaw: this.localYaw,
          pitch: this.localPitch,
        }),
      );
    }
  }

  public triggerWeaponAttack(): void {
    if (this.mode !== 'playing' || this.matchPhase !== 'active') return;
    if (this.weapons.length === 0) {
      this.triggerDash();
      return;
    }
    const equipped = this.weapons[this.equippedWeaponSlot];
    if (!equipped) return;
    const def = getWeaponDef(equipped.id);
    if (def.fireMode === 'throw') {
      // Throwables require strict 3.0s hold! Tap starts hold briefly if invoked programmatically.
      this.beginFireHold();
      return;
    }
    this.executeEquippedWeaponFire();
  }

  public dropEquippedWeapon(): void {
    this.dropWeaponSlot(this.equippedWeaponSlot);
  }

  public dropWeaponSlot(slotIndex: number): void {
    if (this.mode !== 'playing' || this.matchPhase !== 'active') return;
    if (slotIndex < 0 || slotIndex >= this.weapons.length) return;
    this.fireHeld = false;
    this.throwChargeTimer = 0;
    this.audio.unlock();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'drop_weapon', slotIndex }));
    }
  }

  private getEffectiveTeamId(p: Pick<TrackedPlayer, 'teamId' | 'specialRole'>): 0 | 5 | 6 {
    if (p.teamId === 5 || p.teamId === 6) return p.teamId;
    if (p.specialRole === 5 || p.specialRole === 6) return p.specialRole;
    return 0;
  }

  private isAllyPlayer(p: TrackedPlayer, localPlayer: TrackedPlayer): boolean {
    if (p.slotId === localPlayer.slotId) return false;
    const myTeam = this.getEffectiveTeamId(localPlayer);
    const pTeam = this.getEffectiveTeamId(p);
    if (myTeam !== 0 && pTeam !== 0) {
      return myTeam === pTeam;
    }
    if (this.activeSpecialModeId === 'infected_swarm') {
      return (
        (localPlayer.specialRole === 4 && p.specialRole === 4) ||
        (localPlayer.specialRole !== 4 && p.specialRole !== 4)
      );
    }
    if (this.activeSpecialModeId === 'hide_and_seek') {
      return (
        (localPlayer.specialRole === 8 && p.specialRole === 8) ||
        (localPlayer.specialRole === 9 && p.specialRole === 9)
      );
    }
    return false;
  }

  private isAimTargetOnCrosshair(
    localPlayer: TrackedPlayer,
    tx: number,
    ty: number,
    tz: number,
    targetScale: number,
    maxRange: number,
    dirX: number,
    dirY: number,
    dirZ: number,
  ): boolean {
    const dx = tx - localPlayer.renderX;
    const dy = ty - (localPlayer.renderY + 0.8);
    const dz = tz - localPlayer.renderZ;
    const d2 = dx * dx + dy * dy + dz * dz;
    const rangeLim = maxRange + 3.5;
    if (d2 > rangeLim * rangeLim || d2 < 0.09) return false;
    const dist = Math.sqrt(d2);
    const forwardDot = (dx * dirX + dy * dirY + dz * dirZ) / dist;
    if (forwardDot < 0.5) return false;

    let aimed = false;
    // 1) Direct 3D aim ray hit test matching server raycast
    const proj = dx * dirX + dy * dirY + dz * dirZ;
    if (proj > 0.5 && proj <= maxRange + 1.5) {
      const rx = dx - dirX * proj;
      const ry = dy - dirY * proj;
      const rz = dz - dirZ * proj;
      const perp = Math.hypot(rx, ry * 0.65, rz);
      if (perp <= 2.65 * Math.max(1, targetScale * 0.72)) {
        aimed = true;
      }
    }

    // 2) Screen-space crosshair overlap test aligned with visible reticle (top: 46% => NDC y = +0.08)
    if (!aimed) {
      _vec3A.set(tx, ty + 0.55 * targetScale, tz).project(this.camera);
      if (_vec3A.z > 0 && _vec3A.z < 1) {
        const tolX = 0.095 * Math.max(1, targetScale * 0.65);
        const tolY = 0.11 * Math.max(1, targetScale * 0.65);
        if (Math.abs(_vec3A.x) < tolX && Math.abs(_vec3A.y - 0.08) < tolY) {
          aimed = true;
        }
      }
    }
    if (!aimed) return false;

    const wallHit = raycastApartments(
      localPlayer.renderX,
      localPlayer.renderY + 0.8,
      localPlayer.renderZ,
      dx / dist,
      dy / dist,
      dz / dist,
      dist,
      this.activeMapId,
      this.terrainSeed,
    );
    return wallHit === null || wallHit >= dist - 0.8;
  }

  private hasCrosshairEnemyTarget(localPlayer: TrackedPlayer, maxRange: number): boolean {
    const cosP = Math.cos(this.localPitch);
    const dirX = Math.sin(this.localYaw) * cosP;
    const dirY = Math.sin(this.localPitch);
    const dirZ = Math.cos(this.localYaw) * cosP;

    for (const p of this.trackedPlayers.values()) {
      if (p.slotId === localPlayer.slotId || !p.alive) continue;
      if (this.isAllyPlayer(p, localPlayer)) continue;
      if (
        this.isAimTargetOnCrosshair(
          localPlayer,
          p.renderX,
          p.renderY,
          p.renderZ,
          p.renderScale,
          maxRange,
          dirX,
          dirY,
          dirZ,
        )
      ) {
        return true;
      }
    }

    for (const nb of this.trackedNextbots.values()) {
      if (nb.banished) continue;
      if (
        this.isAimTargetOnCrosshair(
          localPlayer,
          nb.renderX,
          nb.renderY + 0.6,
          nb.renderZ,
          1.35,
          maxRange,
          dirX,
          dirY,
          dirZ,
        )
      ) {
        return true;
      }
    }

    for (let i = 0; i < this.sentinels.length; i++) {
      const s = this.sentinels[i];
      if (s.state === 3) continue;
      if (
        this.isAimTargetOnCrosshair(
          localPlayer,
          s.targetX,
          s.targetY,
          s.targetZ,
          1.2,
          maxRange,
          dirX,
          dirY,
          dirZ,
        )
      ) {
        return true;
      }
    }

    if (this.solarBallTarget && isStadiumMap(this.activeMapId)) {
      if (
        this.isAimTargetOnCrosshair(
          localPlayer,
          this.solarBallTarget.x,
          this.solarBallTarget.y,
          this.solarBallTarget.z,
          1.3,
          maxRange,
          dirX,
          dirY,
          dirZ,
        )
      ) {
        return true;
      }
    }

    return false;
  }

  private hasMeleeTargetInRange(localPlayer: TrackedPlayer, maxRange: number): boolean {
    for (const p of this.trackedPlayers.values()) {
      if (p.slotId === localPlayer.slotId || !p.alive) continue;
      if (this.isAllyPlayer(p, localPlayer)) continue;
      const dist = Math.hypot(p.renderX - localPlayer.renderX, p.renderZ - localPlayer.renderZ);
      if (dist <= maxRange && Math.abs(p.renderY - localPlayer.renderY) <= 5.5) return true;
    }
    for (const nb of this.trackedNextbots.values()) {
      if (nb.banished) continue;
      const dist = Math.hypot(nb.renderX - localPlayer.renderX, nb.renderZ - localPlayer.renderZ);
      if (dist <= maxRange + 1.5 && Math.abs(nb.renderY - localPlayer.renderY) <= 6.5) return true;
    }
    for (let i = 0; i < this.sentinels.length; i++) {
      const s = this.sentinels[i];
      if (s.state === 3) continue;
      const dist = Math.hypot(s.targetX - localPlayer.renderX, s.targetZ - localPlayer.renderZ);
      if (dist <= maxRange + 1.2 && Math.abs(s.targetY - localPlayer.renderY) <= 5.5) return true;
    }
    if (this.solarBallTarget && isStadiumMap(this.activeMapId)) {
      const dist = Math.hypot(this.solarBallTarget.x - localPlayer.renderX, this.solarBallTarget.z - localPlayer.renderZ);
      if (dist <= maxRange + 2.0 && Math.abs(this.solarBallTarget.y - localPlayer.renderY) <= 5.5) return true;
    }
    return false;
  }

  private findMobileAimAssistTarget(
    localPlayer: TrackedPlayer,
    maxRange: number,
    maxConeRad: number,
  ): { key: string; yawErr: number; pitchErr: number; angDist: number } | null {
    const ox = localPlayer.renderX;
    const oy = localPlayer.renderY + 0.8;
    const oz = localPlayer.renderZ;
    const maxRangeSq = maxRange * maxRange;

    let bestScore = Infinity;
    let best: { key: string; yawErr: number; pitchErr: number; angDist: number } | null = null;

    const considerCandidate = (key: string, tx: number, ty: number, tz: number, priorityBias: number): void => {
      const dx = tx - ox;
      const dy = ty - oy;
      const dz = tz - oz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 0.25 || d2 > maxRangeSq) return;

      const horiz = Math.hypot(dx, dz);
      if (horiz < 0.05) return;

      const targetYaw = Math.atan2(dx, dz);
      const targetPitch = this.clampPitch(Math.atan2(dy, horiz));
      const yawErr = shortestAngleDelta(this.localYaw, targetYaw);
      const pitchErr = targetPitch - this.localPitch;
      const angDist = Math.hypot(yawErr, pitchErr);

      const isStickyTarget = key === this.aimAssistTargetKey;
      const coneLimit = isStickyTarget ? maxConeRad + 0.05 : maxConeRad;
      if (angDist > coneLimit) return;

      const dist = Math.sqrt(d2);
      const score = angDist + (dist / maxRange) * 0.04 + priorityBias - (isStickyTarget ? 0.055 : 0);
      if (score >= bestScore) return;

      const wallHit = raycastApartments(
        ox,
        oy,
        oz,
        dx / dist,
        dy / dist,
        dz / dist,
        dist,
        this.activeMapId,
        this.terrainSeed,
      );
      if (wallHit !== null && wallHit < dist - 0.8) return;

      bestScore = score;
      best = { key, yawErr, pitchErr, angDist };
    };

    for (const p of this.trackedPlayers.values()) {
      if (p.slotId === localPlayer.slotId || !p.alive) continue;
      if (this.isAllyPlayer(p, localPlayer)) continue;
      considerCandidate(`p:${p.slotId}`, p.renderX, p.renderY + 0.52 * p.renderScale, p.renderZ, p.isBot ? 0.012 : 0);
    }

    for (const nb of this.trackedNextbots.values()) {
      if (nb.banished) continue;
      considerCandidate(`nb:${nb.id}`, nb.renderX, nb.renderY + 0.65, nb.renderZ, 0.02);
    }

    for (let i = 0; i < this.sentinels.length; i++) {
      const s = this.sentinels[i];
      if (s.state === 3) continue;
      considerCandidate(`s:${i}`, s.targetX, s.targetY, s.targetZ, 0.025);
    }

    if (this.solarBallTarget && isStadiumMap(this.activeMapId)) {
      considerCandidate(
        'ball',
        this.solarBallTarget.x,
        this.solarBallTarget.y,
        this.solarBallTarget.z,
        0.04,
      );
    }

    return best;
  }

  public voteMap(mapId: MapId): void {
    this.myVote = mapId;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'vote_map', mapId }));
    }
    this.emitHud();
  }

  public voteMode(key: string): void {
    this.myModeVote = key;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'vote_mode', key }));
    }
    this.emitHud();
  }

  public joinArena(name: string, colorIndex: number, starterSkill: SkillId = 'nova_blast'): void {
    this.starterSkill = starterSkill;
    this.lastJoinParams = { name, colorIndex, starterSkill };
    this.missingLocalSince = null;
    this.spectateActive = false;
    this.guiHidden = false;
    this.spectatingSlotId = null;
    this.audio.unlock();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'join', name, colorIndex, starterSkill }));
    }
  }

  public updateMeta(name: string, colorIndex: number, starterSkill?: SkillId): void {
    if (starterSkill) this.starterSkill = starterSkill;
    if (this.lastJoinParams) {
      this.lastJoinParams = {
        name,
        colorIndex,
        starterSkill: starterSkill || this.lastJoinParams.starterSkill,
      };
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'update_meta', name, colorIndex, starterSkill }));
    }
  }

  public setTouchMode(enabled: boolean): void {
    this.touchEnabled = enabled;
    if (enabled) {
      this.exitPointerLock();
    }
  }

  public setQualitySetting(setting: GraphicsQualitySetting): void {
    this.qualitySetting = setting;
    localStorage.setItem('solaris100_quality', setting);
    this.lowFpsStreak = 0;
    this.highFpsStreak = 0;
    if (setting === 'auto') {
      this.applyQualityTier(this.pickInitialAutoTier(), true);
    } else {
      this.applyQualityTier(setting, true);
    }
    this.emitHud();
  }

  public requestPointerLock(): void {
    if (this.disposed || this.touchEnabled || this.mode !== 'playing') return;
    const canvas = this.renderer?.domElement;
    if (!canvas || document.pointerLockElement === canvas) return;
    try {
      const maybePromise = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {
          this.pointerLockBlocked = true;
          this.emitHud();
        });
      }
    } catch {
      this.pointerLockBlocked = true;
      this.emitHud();
    }
  }

  public exitPointerLock(): void {
    this.draggingSteer = false;
    if (this.renderer && document.pointerLockElement === this.renderer.domElement) {
      try {
        document.exitPointerLock();
      } catch {
        // ignore
      }
    }
    if (this.pointerLocked) {
      this.pointerLocked = false;
    }
  }

  public setPaused(paused: boolean): void {
    if (this.mode === 'playing' && paused) {
      this.mode = 'paused';
      this.heldKeys.clear();
      this.touchMoveX = 0;
      this.touchMoveZ = 0;
      this.endFireHold();
      this.exitPointerLock();
      this.emitHud();
    } else if (this.mode === 'paused' && !paused) {
      this.mode = 'playing';
      this.audio.unlock();
      if (!this.touchEnabled) {
        this.requestPointerLock();
      }
      this.emitHud();
    }
  }

  public leaveToTitle(): void {
    this.heldKeys.clear();
    this.touchMoveX = 0;
    this.touchMoveZ = 0;
    this.endFireHold();
    this.lastTouchAimAt = 0;
    this.lastJoinParams = null;
    this.missingLocalSince = null;
    this.mode = 'title';
    this.localSlotId = null;
    this.localTeamId = 0;
    this.skills = [];
    this.weapons = [];
    this.equippedWeaponSlot = 0;
    this.superWeaponAlert = null;
    this.spectateActive = false;
    this.spectatingSlotId = null;
    this.guiHidden = false;
    this.exitPointerLock();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'leave_arena' }));
    }
    this.emitHud();
  }

  public toggleMute(): boolean {
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    this.emitHud();
    return next;
  }

  private bindWindowEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
  }

  private onPointerLockChange = (): void => {
    const locked = Boolean(this.renderer && document.pointerLockElement === this.renderer.domElement);
    this.pointerLocked = locked;
    if (locked) {
      this.pointerLockBlocked = false;
      this.mouseSteerNormX = 0;
    }
    this.emitHud();
  };

  private onPointerLockError = (): void => {
    this.pointerLocked = false;
    this.pointerLockBlocked = true;
    this.emitHud();
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.webglLost = true;
    this.emitHud();
  };

  private onContextRestored = (): void => {
    this.webglLost = false;
    this.emitHud();
  };

  private onResize = (): void => {
    if (!this.renderer) return;
    const w = this.container.clientWidth || window.innerWidth || 1;
    const h = this.container.clientHeight || window.innerHeight || 1;
    this.viewWidth = w;
    this.viewHeight = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      const ratio = (this.renderer as THREE.WebGLRenderer).getPixelRatio();
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(w, h);
      this.bloomPass?.setSize(w, h);
    }
  };

  private onWindowBlur = (): void => {
    this.heldKeys.clear();
    this.touchMoveX = 0;
    this.touchMoveZ = 0;
    this.mouseSteerNormX = 0;
    this.draggingSteer = false;
    this.endFireHold();
    this.lastTouchAimAt = 0;
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.onWindowBlur();
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (document.activeElement?.tagName === 'INPUT') return;

    if (e.code === 'Escape') {
      if (this.mode === 'playing') {
        this.setPaused(true);
      } else if (this.mode === 'paused') {
        this.setPaused(false);
      }
      return;
    }

    if (e.code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (this.mode !== 'playing') return;

    // Keys 1..5 trigger earned skills!
    if (!e.repeat && e.code >= 'Digit1' && e.code <= 'Digit5') {
      const idx = Number(e.code.replace('Digit', '')) - 1;
      this.triggerSkill(idx);
      return;
    }

    // Keys 6..0 select weapon slots W1..W5!
    if (!e.repeat && ((e.code >= 'Digit6' && e.code <= 'Digit9') || e.code === 'Digit0')) {
      const idx = e.code === 'Digit0' ? MAX_WEAPON_SLOTS - 1 : Number(e.code.replace('Digit', '')) - 6;
      this.selectWeaponSlot(idx);
      return;
    }

    this.heldKeys.add(e.code);

    const now = performance.now();
    if (e.code === 'KeyS' && !e.repeat && !this.isMobileDevice && !this.touchEnabled) {
      const snap = this.captureFrozenSnapshot();
      if (snap) {
        this.pendingKeySCapture = { snapshot: snap, pressedAt: now };
      }
    } else if (e.code === 'KeyP' && !e.repeat && !this.isMobileDevice && !this.touchEnabled) {
      this.commitPhotoCapture(this.captureFrozenSnapshot());
    }

    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      this.dashBufferedUntil = now + 140;
    } else if (e.code === 'KeyE' && !e.repeat) {
      this.pulseBufferedUntil = now + 140;
    } else if (e.code === 'KeyF' && !e.repeat) {
      this.beginFireHold();
    } else if ((e.code === 'Backspace' || e.code === 'KeyG') && !e.repeat) {
      e.preventDefault();
      this.dropEquippedWeapon();
    } else if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
      this.jumpBufferedUntil = now + 140;
      this.audio.playJump();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
    if (e.code === 'KeyS' && this.pendingKeySCapture) {
      const { snapshot, pressedAt } = this.pendingKeySCapture;
      this.pendingKeySCapture = null;
      if (performance.now() - pressedAt < 260) {
        this.commitPhotoCapture(snapshot);
      }
    }
    if (e.code === 'KeyF') {
      this.endFireHold();
    }
  };

  public capturePhoto(): boolean {
    if (this.mode !== 'playing') return false;
    const snap = this.captureFrozenSnapshot();
    if (!snap) return false;
    this.commitPhotoCapture(snap);
    return true;
  }

  private commitPhotoCapture(snap: FrozenSceneSnapshot | null): void {
    if (!snap) return;
    saveNewPhoto(snap);
    this.photoToastText = '3D Snapshot Saved · View in My Photos on Home';
    this.photoToastUntil = performance.now() + 2600;
    this.emitHud();
  }

  private captureFrozenSnapshot(): FrozenSceneSnapshot | null {
    if (!this.scene || !this.camera) return null;
    const now = Date.now();
    const players: FrozenSceneSnapshot['players'] = [];
    for (const p of this.trackedPlayers.values()) {
      if (!p.alive) continue;
      const meta = this.playerMeta.get(p.slotId);
      players.push({
        slotId: p.slotId,
        name: meta?.name || `Pilot #${p.slotId}`,
        isBot: p.isBot,
        teamId: this.getEffectiveTeamId(p),
        colorIndex: p.colorIndex,
        x: p.renderX,
        y: p.renderY,
        z: p.renderZ,
        yaw: p.renderYaw,
        roll: p.renderRoll,
        pitch: p.renderPitch,
        scale: p.renderScale,
        weaponKindIndex: p.weaponKindIndex,
        shield: Math.round(p.shield),
        dashing: p.dashing,
        sovereign: p.sovereign,
        shielded: p.shielded,
        overdrive: p.overdrive,
        attacking: p.attacking,
        specialRole: p.specialRole,
      });
    }

    const nextbots: FrozenSceneSnapshot['nextbots'] = [];
    for (const nb of this.trackedNextbots.values()) {
      if (nb.banished) continue;
      nextbots.push({
        id: nb.id,
        typeIndex: nb.variant,
        x: nb.renderX,
        y: nb.renderY,
        z: nb.renderZ,
        scale: 1,
        slowed: nb.slowed,
        banished: nb.banished,
      });
    }

    const sentinels: FrozenSceneSnapshot['sentinels'] = [];
    for (const s of this.sentinels) {
      if (s.state === 3 || !s.rig.root.visible) continue;
      sentinels.push({
        x: s.rig.root.position.x,
        y: s.rig.root.position.y,
        z: s.rig.root.position.z,
        rotY: s.rig.coreGroup.rotation.y,
        state: s.state,
      });
    }

    const groundWeapons: FrozenSceneSnapshot['groundWeapons'] = [];
    for (const entry of this.groundWeaponRigs.values()) {
      groundWeapons.push({
        uid: entry.data.uid,
        id: entry.data.weaponId,
        x: entry.rig.root.position.x,
        y: entry.rig.root.position.y,
        z: entry.rig.root.position.z,
        spinY: entry.spinY,
      });
    }

    const thrownProjectiles: FrozenSceneSnapshot['thrownProjectiles'] = [];
    for (const tp of this.trackedThrown.values()) {
      const def = getWeaponDef(tp.data.weaponId);
      thrownProjectiles.push({
        uid: tp.data.uid,
        weaponId: tp.data.weaponId,
        x: tp.renderPos.x,
        y: tp.renderPos.y,
        z: tp.renderPos.z,
        color: def.color,
      });
    }

    const sparks: FrozenSceneSnapshot['sparks'] = [];
    for (const sp of this.sparks) {
      if (!sp.active) continue;
      sparks.push({
        x: sp.x,
        y: sp.y,
        z: sp.z,
        scale: sp.scale * Math.max(0.2, sp.life / sp.maxLife),
        colorHex: sp.color.getHex(),
      });
    }

    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    return {
      version: 1,
      id: `snap_${now}_${Math.floor(Math.random() * 10000)}`,
      name: '',
      createdAt: now,
      mapId: this.activeMapId,
      terrainSeed: this.terrainSeed,
      activeEventId: this.activeEventId,
      beamAngle: this.beamAngle,
      localSlotId: this.localSlotId,
      localTeamId: this.localTeamId,
      camera: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
        yaw: euler.y,
        pitch: euler.x,
        fov: this.camera.fov || 62,
      },
      players,
      nextbots,
      sentinels,
      solarBall: this.solarBallRig?.group.visible
        ? {
            x: this.solarBallRig.group.position.x,
            y: this.solarBallRig.group.position.y,
            z: this.solarBallRig.group.position.z,
          }
        : null,
      groundWeapons,
      thrownProjectiles,
      crystals: [...this.crystalActive],
      pylons: this.pylonStates.map((p) => ({
        id: p.id,
        name: p.name,
        ownerSlotId: p.ownerSlotId,
        ownerName: p.ownerName,
        ownerColor: p.ownerColor,
        progress: p.progress,
      })),
      disasterPillars: [...(this.pendingDisasterPillars || [])],
      beams: this.beamVfx.map((b) => ({
        x: b.x,
        y: b.y,
        z: b.z,
        yaw: b.yaw,
        pitch: b.pitch,
        length: b.length,
        colorHex: b.colorHex,
        opacity: b.mat.opacity,
      })),
      bullets: this.bulletVfx.map((bl) => ({
        x: bl.x,
        y: bl.y,
        z: bl.z,
        dirX: bl.dirX,
        dirY: bl.dirY,
        dirZ: bl.dirZ,
        length: bl.length,
        colorHex: bl.colorHex,
        mythic: bl.mythic,
      })),
      rings: this.ringVfx.map((r) => ({
        x: r.mesh.position.x,
        y: r.mesh.position.y,
        z: r.mesh.position.z,
        scale: r.mesh.scale.x,
        colorHex: r.mat.color.getHex(),
        opacity: r.mat.opacity,
      })),
      sparks,
      smoke: this.smokeVfx.map((sm) => ({
        x: sm.sprite.position.x,
        y: sm.sprite.position.y,
        z: sm.sprite.position.z,
        scale: sm.sprite.scale.x,
        colorHex: sm.mat.color.getHex(),
        opacity: sm.mat.opacity,
        additive: sm.mat.blending === THREE.AdditiveBlending,
      })),
      meteors: this.meteorVfx.map((m) => ({
        x: m.x,
        y: m.meteorMesh.position.y,
        groundY: m.groundY,
        z: m.z,
        radius: m.ringMesh.scale.x,
      })),
    };
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.mode !== 'playing' || this.weapons.length <= 1) return;
    if (Math.abs(e.deltaY) < 4) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    const next = (this.equippedWeaponSlot + dir + this.weapons.length) % this.weapons.length;
    this.selectWeaponSlot(next);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'playing' || e.pointerType === 'touch' || this.touchEnabled) return;

    // 1) Locked mouse: 360 horizontal yaw + vertical pitch
    if (this.renderer && document.pointerLockElement === this.renderer.domElement) {
      this.localYaw -= e.movementX * 0.0026;
      this.localPitch = this.clampPitch(this.localPitch - e.movementY * 0.0022);
      this.mouseSteerNormX = 0;
      return;
    }

    // 2) Drag-to-steer fallback while holding mouse button
    if (this.draggingSteer || (e.buttons & 1) !== 0) {
      this.localYaw -= e.movementX * 0.0042;
      this.localPitch = this.clampPitch(this.localPitch - e.movementY * 0.0032);
      this.mouseSteerNormX = 0;
      return;
    }

    // 3) Edge fallback only if pointer lock is blocked
    if (this.pointerLockBlocked) {
      const w = window.innerWidth || 1;
      const norm = (e.clientX / w) * 2 - 1;
      if (Math.abs(norm) < 0.22) {
        this.mouseSteerNormX = 0;
      } else {
        const signed = Math.sign(norm) * ((Math.abs(norm) - 0.22) / 0.78);
        this.mouseSteerNormX = Math.max(-1, Math.min(1, signed));
      }
    } else {
      this.mouseSteerNormX = 0;
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'playing' || e.pointerType === 'touch' || this.touchEnabled) return;
    if ((e.target as HTMLElement)?.closest('button, input, [data-no-lock]')) return;

    const locked = Boolean(this.renderer && document.pointerLockElement === this.renderer.domElement);
    if (!locked) {
      this.requestPointerLock();
      this.draggingSteer = true;
      if (!this.pointerLockBlocked) {
        if (e.button === 0 && this.weapons.length > 0) {
          this.beginFireHold();
        }
        return;
      }
    }

    const now = performance.now();
    if (e.button === 0) {
      if (this.weapons.length > 0) {
        this.beginFireHold();
      } else {
        this.dashBufferedUntil = now + 140;
      }
    } else if (e.button === 2) {
      this.pulseBufferedUntil = now + 140;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.draggingSteer = false;
    if (e.button === 0) {
      this.endFireHold();
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.mode === 'playing') e.preventDefault();
  };

  private startLoop(): void {
    const afterDraw = (cb: () => void) => {
      if (this.isWebGPU) {
        this.frameId = requestAnimationFrame(cb);
        return;
      }
      const gl = (this.renderer as THREE.WebGLRenderer).getContext?.() as WebGL2RenderingContext | undefined;
      if (!gl || typeof gl.fenceSync !== 'function') {
        this.frameId = requestAnimationFrame(cb);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 32);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    this.lastPerfNow = performance.now();

    const tick = () => {
      if (this.disposed || !this.rendererReady) return;

      try {
        const now = performance.now();
        const rawFrameMs = Math.max(1, now - this.lastPerfNow);
        this.lastPerfNow = now;
        if (rawFrameMs < 250) {
          const instFps = Math.min(240, 1000 / rawFrameMs);
          this.smoothedFps = this.smoothedFps * 0.9 + instFps * 0.1;
        }

        const rawDt = this.clock.getDelta();
        const dt = Math.min(rawDt, 0.05);

        if (
          this.qualitySetting === 'auto' &&
          this.mode === 'playing' &&
          !document.hidden &&
          rawFrameMs < 250
        ) {
          this.autoEvalAccum += dt;
          if (this.autoEvalAccum >= 1.5) {
            const stepDt = this.autoEvalAccum;
            this.autoEvalAccum = 0;

            if (this.smoothedFps < 43) {
              this.lowFpsStreak += stepDt;
              this.highFpsStreak = 0;
            } else if (this.smoothedFps >= 57 && !this.isSoftwareGl) {
              this.highFpsStreak += stepDt;
              this.lowFpsStreak = 0;
            } else {
              this.lowFpsStreak = Math.max(0, this.lowFpsStreak - stepDt * 0.5);
              this.highFpsStreak = Math.max(0, this.highFpsStreak - stepDt * 0.5);
            }

            if (now - this.lastQualitySwitchAt >= 4500) {
              const idx = QUALITY_TIERS.indexOf(this.activeQualityTier);
              if (this.lowFpsStreak >= 2.5 && idx > 0) {
                this.lowFpsStreak = 0;
                this.lastQualitySwitchAt = now;
                this.applyQualityTier(QUALITY_TIERS[idx - 1]);
              } else if (!this.isMobileDevice && this.highFpsStreak >= 5.5 && idx < QUALITY_TIERS.length - 1) {
                this.highFpsStreak = 0;
                this.lastQualitySwitchAt = now;
                this.applyQualityTier(QUALITY_TIERS[idx + 1]);
              }
            }
          }
        }

        this.update(dt);

        const profile = QUALITY_PROFILES[this.activeQualityTier];
        const useComposer =
          this.composer !== null &&
          !this.isWebGPU &&
          !this.isSoftwareGl &&
          (profile.bloom || profile.godRays || profile.filmicGrade);

        const baseExposure =
          this.activeQualityTier === 'high' || this.activeQualityTier === 'ultra' ? 0.92 : 0.96;

        if (useComposer && this.composer) {
          this.renderer.toneMappingExposure = baseExposure;
          if (this.godRaysPass?.enabled) {
            _vec3A
              .copy(this.keyLight.target.position)
              .add(_vec3B.set(85, 130, 65))
              .project(this.camera);
            const inFront = _vec3A.z > -1 && _vec3A.z < 1;
            const sunVis = inFront ? Math.max(0, 1 - Math.hypot(_vec3A.x, _vec3A.y) * 0.48) : 0;
            this.godRaysPass.uniforms.uSunScreen.value.set((_vec3A.x + 1) * 0.5, (_vec3A.y + 1) * 0.5);
            this.godRaysPass.uniforms.uSunVisible.value = sunVis;
            this.godRaysPass.uniforms.uIntensity.value = isSpaceMap(this.activeMapId) ? 0.05 : 0.10;
          }
          this.composer.render(dt);
        } else {
          // Fallback one-way auto-exposure for WebGPU / non-composer paths: dims bright sky/sun views, never brightens dark views
          const skyHex = getMapDef(this.activeMapId).skyHex;
          const sr = ((skyHex >> 16) & 255) / 255;
          const sg = ((skyHex >> 8) & 255) / 255;
          const sb = (skyHex & 255) / 255;
          const skyLuma = 0.2126 * sr * sr + 0.7152 * sg * sg + 0.0722 * sb * sb;
          const pitchUp = Math.max(0, Math.sin(this.localPitch));
          this.camera.getWorldDirection(_vec3A);
          _vec3B.set(85, 130, 65).normalize();
          const sunAlign = Math.max(0, _vec3A.dot(_vec3B));
          const estBright = skyLuma * (0.68 + pitchUp * 0.45) + sunAlign * sunAlign * 0.34;
          const excess = Math.max(0, estBright - 0.34);
          const targetMul = Math.max(0.66, Math.min(1.0, 1.0 / (1.0 + excess * 0.58)));
          const rate = targetMul < this.fallbackExpMul ? 4.0 : 1.6;
          this.fallbackExpMul += (targetMul - this.fallbackExpMul) * (1 - Math.exp(-rate * dt));
          this.renderer.toneMappingExposure = baseExposure * this.fallbackExpMul;
          this.renderer.render(this.scene, this.camera);
        }
      } catch {
        // Keep render & HUD loop alive even if a transient frame error occurs
      }

      if (!this.disposed) {
        if (this.isSoftwareGl) {
          afterDraw(tick);
        } else {
          this.frameId = requestAnimationFrame(tick);
        }
      }
    };

    tick();
  }

  private updateTrajectoryPreview(localPlayer: TrackedPlayer, weaponColor: string): void {
    if (!this.trajectoryPoints) return;
    const mat = this.trajectoryPoints.material as THREE.PointsMaterial;
    mat.color.set(weaponColor);
    this.trajectoryPoints.visible = true;

    const speed = 48;
    const g = 30;
    const cosP = Math.cos(this.localPitch);
    const vx = Math.sin(this.localYaw) * cosP * speed;
    const vy = Math.sin(this.localPitch) * speed + 4.5;
    const vz = Math.cos(this.localYaw) * cosP * speed;

    let hitFloor = false;
    let lastX = localPlayer.renderX;
    let lastY = localPlayer.renderY + 1.0;
    let lastZ = localPlayer.renderZ;

    for (let i = 0; i < 26; i++) {
      const t = (i + 1) * 0.085;
      if (!hitFloor) {
        const px = localPlayer.renderX + vx * t;
        const py = localPlayer.renderY + 1.0 + vy * t - 0.5 * g * t * t;
        const pz = localPlayer.renderZ + vz * t;
        const gy = isSpaceMap(this.activeMapId)
          ? -999
          : groundHeightAt(px, pz, this.activeMapId, this.terrainSeed) + 0.15;
        if (py <= gy) {
          hitFloor = true;
          lastX = px;
          lastY = gy;
          lastZ = pz;
        } else {
          lastX = px;
          lastY = py;
          lastZ = pz;
        }
      }
      this.trajectoryPositions[i * 3] = lastX;
      this.trajectoryPositions[i * 3 + 1] = lastY;
      this.trajectoryPositions[i * 3 + 2] = lastZ;
    }
    (this.trajectoryPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private update(dt: number): void {
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    this.elapsed += dt;
    if (this.respawnCountdown > 0) {
      this.respawnCountdown = Math.max(0, this.respawnCountdown - dt);
    }
    if (this.weaponCooldownTimer > 0) {
      this.weaponCooldownTimer = Math.max(0, this.weaponCooldownTimer - dt);
    }

    if (this.matchPhase === 'active') {
      if (this.activeEventTimer > 0) {
        this.activeEventTimer = Math.max(0, this.activeEventTimer - dt);
      }
      if (this.nextEventIn > 0) {
        this.nextEventIn = Math.max(0, this.nextEventIn - dt);
      }
      if (this.skills.length === 0 && this.starterCooldown > 0) {
        this.starterCooldown = Math.max(0, this.starterCooldown - dt);
      }
    }

    const perfNow = performance.now();
    if (this.roleBanner && perfNow - this.roleBanner.startedAt >= 3100) {
      this.roleBanner = null;
    }
    if (this.superWeaponAlert && perfNow - this.superWeaponAlert.startedAt >= 5200) {
      this.superWeaponAlert = null;
    }
    if (this.comboToast && perfNow >= this.comboToast.until) {
      this.comboToast = null;
    }
    if (this.floatingDmgs.length > 0) {
      for (let i = this.floatingDmgs.length - 1; i >= 0; i--) {
        const fd = this.floatingDmgs[i];
        fd.y += dt * 2.5;
        if (perfNow - fd.bornAt >= 850) {
          this.floatingDmgs.splice(i, 1);
        }
      }
    }

    // Moving Solar Zone 3D ring & pillar (king_of_hill)
    if (this.solarZoneGroup) {
      const zoneActive =
        this.activeSpecialModeId === 'none' &&
        this.activeNormalModeId === 'king_of_hill' &&
        this.modeHud.zoneX !== undefined &&
        this.modeHud.zoneZ !== undefined;
      this.solarZoneGroup.visible = zoneActive;
      if (zoneActive && this.modeHud.zoneX !== undefined && this.modeHud.zoneZ !== undefined) {
        const gy = groundHeightAt(this.modeHud.zoneX, this.modeHud.zoneZ, this.activeMapId, this.terrainSeed);
        this.solarZoneGroup.position.set(this.modeHud.zoneX, gy + 0.25, this.modeHud.zoneZ);
        const scale = (this.modeHud.zoneRadius || 24) / 24;
        this.solarZoneGroup.scale.set(scale, 1, scale);
        this.solarZoneGroup.rotation.y += dt * 0.45;
        if (this.solarZoneRingMat) {
          this.solarZoneRingMat.opacity = 0.65 + Math.sin(this.elapsed * 5) * 0.2;
        }
        if (this.solarZonePillarMat) {
          this.solarZonePillarMat.opacity = 0.12 + Math.sin(this.elapsed * 3.5) * 0.05;
        }
      }
    }

    // Rising Molten Magma sea level animation (lava_rising or magma_flood disaster!)
    if (this.arena?.seaMesh && this.arena?.seaMat) {
      const mDef = getMapDef(this.activeMapId);
      const isCaldera = this.activeMapId === 'obsidian_caldera';
      const restingSeaY = mDef.kind === 'space' ? -240 : mDef.kind === 'beach' ? -0.9 : isCaldera ? -18 : -32;
      const lavaActive =
        (this.activeSpecialModeId === 'lava_rising' || this.activeEventId === 'magma_flood') &&
        this.modeHud.lavaLevel !== undefined;
      if (lavaActive && this.modeHud.lavaLevel !== undefined) {
        const targetY = this.modeHud.lavaLevel;
        this.arena.seaMesh.position.y += (targetY - this.arena.seaMesh.position.y) * Math.min(1, dt * 3.5);
        if (!this.lavaVisualActive) {
          this.lavaVisualActive = true;
          this.arena.seaMat.color.setHex(0xea580c);
          this.arena.seaMat.emissive.setHex(0xdc2626);
        }
        this.arena.seaMat.emissiveIntensity = 1.05 + Math.sin(this.elapsed * 4) * 0.22;
      } else {
        if (Math.abs(this.arena.seaMesh.position.y - restingSeaY) > 0.15) {
          this.arena.seaMesh.position.y +=
            (restingSeaY - this.arena.seaMesh.position.y) * Math.min(1, dt * 4);
        }
        if (this.lavaVisualActive) {
          this.lavaVisualActive = false;
          this.arena.seaMat.color.setHex(mDef.seaHex);
          this.arena.seaMat.emissive.setHex(isCaldera ? 0xdc2626 : 0x000000);
          this.arena.seaMat.emissiveIntensity = isCaldera ? 0.65 : 0;
        }
      }
    }

    if (this.mode === 'playing') {
      let yawDelta = 0;
      if (this.heldKeys.has('ArrowLeft') || this.heldKeys.has('KeyQ')) yawDelta += 2.35;
      if (this.heldKeys.has('ArrowRight')) yawDelta -= 2.35;
      yawDelta -= this.mouseSteerNormX * 2.15;
      this.localYaw += yawDelta * dt;

      // Gamepad Analog Fire Joystick continuous camera panning (smooth response curve)
      if (this.fireHeld && (this.fireStickX !== 0 || this.fireStickY !== 0)) {
        const deadzone = 0.1;
        const shapeAxis = (v: number): number => {
          const av = Math.abs(v);
          if (av <= deadzone) return 0;
          const norm = (av - deadzone) / (1 - deadzone);
          return Math.sign(v) * Math.pow(norm, 1.32);
        };
        const sx = shapeAxis(this.fireStickX);
        const sy = shapeAxis(this.fireStickY);
        if (sx !== 0 || sy !== 0) {
          const stickYawRate = this.fireFromTouch ? 1.225 * this.aimAssistFriction : 2.45;
          const stickPitchRate = this.fireFromTouch ? 0.825 * this.aimAssistFriction : 1.65;
          this.localYaw -= sx * stickYawRate * dt;
          this.localPitch = this.clampPitch(this.localPitch - sy * stickPitchRate * dt);
          if (this.fireFromTouch) {
            this.lastTouchAimAt = performance.now();
          }
        }
      }

      // Mobile-only natural Aim Assist: compensates for 50% slower manual touch aiming while actively aiming/firing,
      // smoothly gliding onto visible enemies inside the crosshair cone (PC mouse/keyboard stays 100% untouched).
      const nowPerf = performance.now();
      const isTouchAimActive =
        (this.isMobileDevice || this.touchEnabled) &&
        this.matchPhase === 'active' &&
        (this.fireFromTouch || nowPerf - this.lastTouchAimAt < 280);
      const localAimPlayer = this.localSlotId !== null ? this.trackedPlayers.get(this.localSlotId) : undefined;

      if (isTouchAimActive && localAimPlayer && localAimPlayer.alive && this.weapons.length > 0) {
        const equipped = this.weapons[this.equippedWeaponSlot];
        const def = equipped ? getWeaponDef(equipped.id) : null;
        const maxRange = def
          ? def.fireMode === 'melee'
            ? Math.min(22, def.range * 2.5 + 4)
            : def.fireMode === 'throw'
            ? 38
            : Math.min(75, def.range + 4)
          : 30;
        const maxCone = this.fireFromTouch ? 0.30 : 0.27;
        const assist = this.findMobileAimAssistTarget(localAimPlayer, maxRange, maxCone);
        if (assist) {
          this.aimAssistTargetKey = assist.key;
          this.aimAssistFriction =
            assist.angDist < 0.14 ? 0.65 + 0.35 * (assist.angDist / 0.14) : 1.0;

          const edgeFalloff =
            assist.angDist <= 0.17
              ? 1.0
              : Math.max(0.35, 1.0 - ((assist.angDist - 0.17) / Math.max(0.08, maxCone - 0.17)) * 0.65);
          const pullRate = (this.fireFromTouch ? 7.2 : 4.6) * edgeFalloff;
          const maxAngVel = (this.fireFromTouch ? 1.65 : 1.05) * edgeFalloff;
          const blend = Math.min(1, 1 - Math.exp(-pullRate * dt));

          let stepYaw = assist.yawErr * blend;
          let stepPitch = assist.pitchErr * blend;
          const stepMag = Math.hypot(stepYaw, stepPitch);
          const maxStep = maxAngVel * dt;
          if (stepMag > maxStep && stepMag > 1e-6) {
            const scale = maxStep / stepMag;
            stepYaw *= scale;
            stepPitch *= scale;
          }

          this.localYaw += stepYaw;
          this.localPitch = this.clampPitch(this.localPitch + stepPitch);
        } else {
          this.aimAssistTargetKey = null;
          this.aimAssistFriction = 1.0;
        }
      } else {
        this.aimAssistTargetKey = null;
        this.aimAssistFriction = 1.0;
      }
    }

    // Photorealistic Ocean Ripples, GLSL Water Animation & Atmospheric Disaster Mood
    if (!this.isMobileDevice) {
      this.arena?.updateWaterTime(this.elapsed);
      if (this.materials?.seaNormalMap) {
        this.materials.seaNormalMap.offset.x = (this.materials.seaNormalMap.offset.x + dt * 0.018) % 1;
        this.materials.seaNormalMap.offset.y = (this.materials.seaNormalMap.offset.y + dt * 0.011) % 1;
      }
    }
    if (this.arena?.skyMat) {
      if (this.activeEventId === 'ion_tempest' || this.activeEventId === 'low_gravity') {
        this.arena.skyMat.color.setHex(0x8ba7d9);
      } else if (this.activeEventId === 'sentinel_surge') {
        this.arena.skyMat.color.setHex(0xb39ddb);
      } else if (this.activeEventId === 'solar_storm' || this.activeEventId === 'meteor_shower' || this.activeEventId === 'magma_flood') {
        this.arena.skyMat.color.setHex(0xffc9a6);
      } else if (this.activeEventId === 'glacial_spires') {
        this.arena.skyMat.color.setHex(0xcbe8ff);
      } else {
        this.arena.skyMat.color.setHex(0xffffff);
      }
    }

    this.arena.sweeperGroup.rotation.y = -this.beamAngle;
    this.arena.ambientPoints.rotation.y += dt * 0.015;
    for (let i = 0; i < this.arena.jumpPadRings.length; i++) {
      const ring = this.arena.jumpPadRings[i];
      const baseY = ring.userData.baseY as number;
      const wave = (this.elapsed * 1.8 + i * 0.25) % 1;
      ring.position.y = baseY + wave * 1.4;
      ring.scale.setScalar(1 - wave * 0.25);
    }
    for (let i = 0; i < this.arena.boostRingMeshes.length; i++) {
      const br = this.arena.boostRingMeshes[i];
      const baseY = br.userData.baseY as number;
      br.position.y = baseY + Math.sin(this.elapsed * 2.4 + i) * 0.4;
      const pulse = 1 + Math.sin(this.elapsed * 4 + i) * 0.05;
      br.scale.setScalar(pulse);
    }
    for (let i = 0; i < this.arena.powerOrbMeshes.length; i++) {
      const om = this.arena.powerOrbMeshes[i];
      const active = this.orbActive[i] !== false;
      om.visible = active;
      if (active) {
        const baseY = om.userData.baseY as number;
        om.position.y = baseY + Math.sin(this.elapsed * 3.0 + i) * 0.45;
        om.rotation.y += dt * 2.2;
        om.rotation.x += dt * 1.1;
      }
    }
    for (let i = 0; i < this.arena.pylonVisuals.length; i++) {
      const pv = this.arena.pylonVisuals[i];
      pv.beaconMesh.rotation.y += dt * 1.6;
      pv.beaconMesh.position.y =
        groundHeightAt(pv.beaconMesh.position.x, pv.beaconMesh.position.z, this.activeMapId, this.terrainSeed) +
        9.2 +
        Math.sin(this.elapsed * 2.5 + i) * 0.45;
    }

    // Animate Stadium Solar Ball
    if (this.solarBallRig) {
      if (this.solarBallTarget && isStadiumMap(this.activeMapId)) {
        this.solarBallRig.group.visible = true;
        this.solarBallRig.group.position.lerp(
          _vec3A.set(this.solarBallTarget.x, this.solarBallTarget.y, this.solarBallTarget.z),
          1 - Math.exp(-16 * dt),
        );
        this.solarBallRig.ball.rotation.x += this.solarBallTarget.vz * dt * 0.38;
        this.solarBallRig.ball.rotation.z -= this.solarBallTarget.vx * dt * 0.38;
      } else {
        this.solarBallRig.group.visible = false;
      }
    }

    // Animate Thrown Projectiles (grenades / molotov / cryo spinning cleanly)
    for (const tp of this.trackedThrown.values()) {
      tp.data.x += tp.data.vx * dt;
      tp.data.y += tp.data.vy * dt;
      tp.data.z += tp.data.vz * dt;
      tp.data.vy -= 30 * dt;
      tp.renderPos.lerp(_vec3A.set(tp.data.x, tp.data.y, tp.data.z), 1 - Math.exp(-22 * dt));
      tp.group.position.copy(tp.renderPos);
      tp.group.rotation.x += dt * 12;
      tp.group.rotation.y += dt * 8;
    }

    // Animate Molotov / Cryo Ground Zones
    for (const fz of this.trackedFireZones.values()) {
      fz.visual.ringMat.opacity = 0.55 + Math.sin(this.elapsed * 9) * 0.25;
      for (let i = 0; i < fz.flames.length; i++) {
        const sp = fz.flames[i];
        sp.position.y = 1.2 + Math.abs(Math.sin(this.elapsed * 7 + i * 1.4)) * 1.6;
        const sc = 2.8 + Math.sin(this.elapsed * 11 + i) * 0.7;
        sp.scale.setScalar(sc);
      }
    }

    // Decay Pooled Dynamic PointLights
    for (let i = 0; i < this.dynamicLights.length; i++) {
      const dl = this.dynamicLights[i];
      if (dl.life <= 0) continue;
      dl.life = Math.max(0, dl.life - dt);
      dl.light.intensity = dl.peakIntensity * (dl.life / Math.max(0.01, dl.maxLife));
      if (dl.life <= 0) {
        dl.light.intensity = 0;
        dl.light.position.set(0, -999, 0);
      }
    }

    // Update Instanced Crystals
    let stdPtr = 0;
    let corePtr = 0;
    const spinRate = this.activeEventId === 'solar_storm' ? 4.2 : 1.8;
    for (let i = 0; i < this.crystalLayouts.length; i++) {
      const c = this.crystalLayouts[i];
      const active = this.crystalActive[i];
      if (active) {
        _dummy.position.set(c.x, c.y + Math.sin(this.elapsed * 2.8 + i) * 0.28, c.z);
        _dummy.rotation.set(0.25, this.elapsed * spinRate + i, 0);
        _dummy.scale.setScalar(1);
      } else {
        _dummy.position.set(c.x, -999, c.z);
        _dummy.scale.setScalar(0);
      }
      _dummy.updateMatrix();
      if (c.kind === 1) {
        this.coreCrystalMesh.setMatrixAt(corePtr++, _dummy.matrix);
      } else {
        this.standardCrystalMesh.setMatrixAt(stdPtr++, _dummy.matrix);
      }
    }
    this.standardCrystalMesh.instanceMatrix.needsUpdate = true;
    this.coreCrystalMesh.instanceMatrix.needsUpdate = true;

    // Update Pooled Sparks
    let sparksDirty = false;
    for (let i = 0; i < this.MAX_SPARKS; i++) {
      const s = this.sparks[i];
      if (!s.active) continue;
      sparksDirty = true;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        _dummy.position.set(0, -999, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.sparkMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      s.vy -= 22 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const frac = s.life / s.maxLife;
      _dummy.position.set(s.x, s.y, s.z);
      _dummy.rotation.set(this.elapsed * 8 + i, this.elapsed * 6, 0);
      _dummy.scale.setScalar(s.scale * frac);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummy.matrix);
      this.sparkMesh.setColorAt(i, s.color);
    }
    if (sparksDirty) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
      if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
    }

    // Update Realistic Smoke & Flash Sprites
    for (let i = this.smokeVfx.length - 1; i >= 0; i--) {
      const sm = this.smokeVfx[i];
      sm.life -= dt;
      if (sm.life <= 0) {
        this.scene.remove(sm.sprite);
        sm.mat.dispose();
        this.smokeVfx.splice(i, 1);
      } else {
        const progress = 1 - sm.life / sm.maxLife;
        sm.sprite.position.x += sm.vx * dt;
        sm.sprite.position.y += sm.vy * dt;
        sm.sprite.position.z += sm.vz * dt;
        sm.vx *= Math.exp(-2.2 * dt);
        sm.vz *= Math.exp(-2.2 * dt);
        sm.vy *= Math.exp(-0.9 * dt);
        const sc = sm.startScale + (sm.endScale - sm.startScale) * Math.sqrt(progress);
        sm.sprite.scale.setScalar(sc);
        sm.mat.opacity = sm.baseOpacity * (1 - progress * progress);
      }
    }

    // Update Transient Ring, Beam, and Meteor VFX
    for (let i = this.ringVfx.length - 1; i >= 0; i--) {
      const r = this.ringVfx[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mat.dispose();
        this.ringVfx.splice(i, 1);
      } else {
        const t = 1 - r.life / r.maxLife;
        r.mesh.scale.setScalar(r.startScale + (r.endScale - r.startScale) * t);
        r.mat.opacity = (1 - t) * 0.85;
      }
    }

    for (let i = this.beamVfx.length - 1; i >= 0; i--) {
      const b = this.beamVfx[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mat.dispose();
        this.beamVfx.splice(i, 1);
      } else {
        b.mat.opacity = (b.life / b.maxLife) * 0.9;
      }
    }

    // Animate Flying Ballistic Bullet Projectiles (High & Ultra)
    for (let i = this.bulletVfx.length - 1; i >= 0; i--) {
      const bl = this.bulletVfx[i];
      const step = bl.speed * dt;
      bl.traveled += step;
      if (bl.traveled >= bl.totalDist) {
        this.spawnSparks(bl.tx, bl.ty, bl.tz, bl.mythic ? 24 : 11, bl.colorHex, 18);
        if (bl.splashRadius > 0) {
          this.spawnRingVfx(bl.tx, bl.ty, bl.tz, 1.2, bl.splashRadius, bl.colorHex, 0.4);
        }
        this.scene.remove(bl.group);
        bl.headMat.dispose();
        bl.tailMat.dispose();
        this.bulletVfx.splice(i, 1);
      } else {
        bl.x += bl.dirX * step;
        bl.y += bl.dirY * step;
        bl.z += bl.dirZ * step;
        bl.group.position.set(bl.x, bl.y, bl.z);
        const tailStretch = Math.min(bl.length, Math.max(0.8, bl.traveled));
        bl.group.children[1].scale.set(bl.mythic ? 1.45 : 1.0, bl.mythic ? 1.45 : 1.0, tailStretch);
        bl.group.children[1].position.set(0, 0, -tailStretch * 0.5);
      }
    }

    for (let i = this.meteorVfx.length - 1; i >= 0; i--) {
      const m = this.meteorVfx[i];
      m.elapsed += dt;
      const t = Math.min(1, m.elapsed / m.delay);
      m.meteorMesh.position.y = m.groundY + (1 - t) * 65;
      m.meteorMesh.rotation.x += dt * 4;
      m.meteorMesh.rotation.y += dt * 3;
      m.ringMat.opacity = 0.4 + Math.sin(this.elapsed * 24) * 0.35;
      if (m.elapsed >= m.delay) {
        this.spawnExplosionVfx(m.x, m.groundY + 0.8, m.z, 9.5, 0xf97316, true);
        this.scene.remove(m.meteorMesh);
        this.scene.remove(m.ringMesh);
        m.ringMat.dispose();
        this.meteorVfx.splice(i, 1);
      }
    }

    // Interpolate Tracked Players with Distance LOD
    const profile = QUALITY_PROFILES[this.activeQualityTier];
    const smoothPos = 1 - Math.exp(-16 * dt);
    const smoothRot = 1 - Math.exp(-18 * dt);
    const smoothLocalRot = 1 - Math.exp(-36 * dt);
    const camX = this.camera.position.x;
    const camY = this.camera.position.y;
    const camZ = this.camera.position.z;

    for (const p of this.trackedPlayers.values()) {
      p.rig.root.visible = p.alive;
      if (!p.alive) continue;

      p.renderX += (p.targetX - p.renderX) * smoothPos;
      p.renderY += (p.targetY - p.renderY) * smoothPos;
      p.renderZ += (p.targetZ - p.renderZ) * smoothPos;

      const isLocalActive = p.slotId === this.localSlotId && this.mode === 'playing';
      const desiredYaw = isLocalActive ? this.localYaw : p.targetYaw;
      p.renderYaw = lerpAngle(p.renderYaw, desiredYaw, isLocalActive ? smoothLocalRot : smoothRot);
      p.renderRoll += (p.targetRoll - p.renderRoll) * smoothRot;
      const desiredPitch = isLocalActive ? this.localPitch * 0.65 : p.targetPitch;
      p.renderPitch += (desiredPitch - p.renderPitch) * smoothRot;
      p.renderScale += (p.targetScale - p.renderScale) * smoothPos;

      p.rig.root.position.set(p.renderX, p.renderY, p.renderZ);
      p.rig.root.rotation.y = p.renderYaw;
      p.rig.root.scale.setScalar(p.renderScale);

      const dx = p.renderX - camX;
      const dy = p.renderY - camY;
      const dz = p.renderZ - camZ;
      const distSq = dx * dx + dy * dy + dz * dz;
      const effectiveFullSq =
        this.isMobileDevice && this.activeQualityTier === 'low' ? 22 * 22 : profile.fullRigDistSq;
      const lowDetail = !isLocalActive && distSq >= effectiveFullSq;
      const farDetail = this.isMobileDevice && !isLocalActive && distSq >= 34 * 34;

      const gy = lowDetail
        ? p.renderY - 0.8 * p.renderScale
        : getApartmentSupportY(
            p.renderX,
            p.renderZ,
            p.renderY - 0.9 * p.renderScale,
            this.activeMapId,
            this.terrainSeed,
          );
      const pTeam = this.getEffectiveTeamId(p);
      const markerColorHex = pTeam === 5 ? 0xfbbf24 : pTeam === 6 ? 0x38bdf8 : 0x34d399;
      p.rig.setVisualState({
        shield: p.shield,
        dashing: p.dashing,
        sovereign: p.sovereign,
        shielded: p.shielded,
        overdrive: p.overdrive,
        attacking: p.attacking,
        isHumanMarker: !p.isBot && !isLocalActive,
        markerColorHex,
        groundY: gy,
        roll: p.renderRoll,
        pitch: isSpaceMap(this.activeMapId) ? -p.renderPitch : p.renderPitch * 0.45,
        dt,
        elapsed: this.elapsed,
        lowDetail,
        farDetail,
      });

      if (!lowDetail && (p.dashing || p.overdrive) && Math.random() < (this.isMobileDevice ? 0.25 : 0.55)) {
        this.spawnSparks(p.renderX, p.renderY, p.renderZ, 1, p.overdrive ? 0xf97316 : 0x38bdf8, 4);
      }
    }

    // Client-side Smooth Ballistics + Ground Weapon Rotation (prevents jitter when server updates XYZ)
    for (const [uid, entry] of this.groundWeaponRigs.entries()) {
      const gw = entry.data;
      const rootPos = entry.rig.root.position;
      const vx = gw.vx ?? 0;
      const vy = gw.vy ?? 0;
      const vz = gw.vz ?? 0;
      if (Math.abs(gw.x - entry.cachedX) > 0.25 || Math.abs(gw.z - entry.cachedZ) > 0.25) {
        entry.cachedX = gw.x;
        entry.cachedZ = gw.z;
        entry.cachedGy = groundHeightAt(gw.x, gw.z, this.activeMapId, this.terrainSeed);
      }
      const gy = entry.cachedGy;
      const airborne = Math.abs(vy) > 0.4 || Math.hypot(vx, vz) > 0.6 || gw.y > gy + 0.55;

      rootPos.lerp(_vec3A.set(gw.x, gw.y, gw.z), 1 - Math.exp(-18 * dt));

      if (airborne) {
        entry.airSpinX += dt * 9.5;
        entry.spinY += dt * 7.2;
        entry.rig.modelGroup.rotation.set(entry.airSpinX, entry.spinY, entry.airSpinX * 0.6);
        entry.rig.modelGroup.position.y = 0.5;
      } else {
        entry.spinY += dt * (entry.rig.isSuper ? 2.4 : 1.15);
        entry.rig.root.rotation.y = entry.spinY;
        if (entry.rig.isSuper) {
          entry.rig.modelGroup.rotation.set(-0.25, 0, 0);
          entry.rig.modelGroup.position.y = 0.92 + Math.sin(this.elapsed * 3.0 + uid) * 0.22;
        } else if (entry.rig.isThrowable) {
          entry.rig.modelGroup.rotation.set(0, 0, 0);
          entry.rig.modelGroup.position.y = 0.36 + Math.sin(this.elapsed * 2.5 + uid) * 0.08;
        } else {
          // Guns & blades rest flat sideways on ground!
          entry.rig.modelGroup.rotation.set(0.08, 0, Math.PI / 2);
          entry.rig.modelGroup.position.y = 0.28;
        }
      }

      if (entry.rig.beaconMesh) {
        const mat = entry.rig.beaconMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.22 + Math.sin(this.elapsed * 6.0) * 0.1;
      }
    }

    // Interpolate & Animate Nico's Nextbots
    for (const nb of this.trackedNextbots.values()) {
      nb.renderX += (nb.targetX - nb.renderX) * smoothPos;
      nb.renderY += (nb.targetY - nb.renderY) * smoothPos;
      nb.renderZ += (nb.targetZ - nb.renderZ) * smoothPos;
      nb.rig.root.position.set(nb.renderX, nb.renderY, nb.renderZ);
      nb.rig.root.lookAt(camX, nb.renderY, camZ);
      const gy = groundHeightAt(nb.renderX, nb.renderZ, this.activeMapId, this.terrainSeed);
      nb.rig.setVisualState({
        slowed: nb.slowed,
        banished: nb.banished,
        groundY: gy,
        dt,
        elapsed: this.elapsed,
      });
    }

    // Interpolate Sentinels
    for (let i = 0; i < this.sentinels.length; i++) {
      const s = this.sentinels[i];
      if (s.state === 3) {
        s.rig.root.visible = false;
        continue;
      }
      s.rig.root.visible = true;
      s.rig.root.position.lerp(_vec3A.set(s.targetX, s.targetY, s.targetZ), smoothPos);
      s.rig.coreGroup.rotation.y += dt * (s.state === 1 ? 10 : s.state === 2 ? 14 : 2.5);
      s.rig.blades.rotation.x = s.state === 2 ? 0.35 : 0;

      const gy = groundHeightAt(s.rig.root.position.x, s.rig.root.position.z, this.activeMapId, this.terrainSeed);
      s.rig.shadowPlane.position.y = gy - s.rig.root.position.y + 0.05;
      s.rig.telegraphRing.position.y = gy - s.rig.root.position.y + 0.1;

      const teleMat = s.rig.telegraphRing.material as THREE.MeshBasicMaterial;
      if (s.state === 1) {
        teleMat.opacity = 0.55 + Math.sin(this.elapsed * 24) * 0.35;
        s.rig.telegraphRing.scale.setScalar(1.25 + Math.sin(this.elapsed * 18) * 0.15);
      } else if (s.state === 2) {
        teleMat.opacity = 0.7;
        s.rig.telegraphRing.scale.setScalar(1.3);
      } else {
        teleMat.opacity = 0;
      }
    }

    // Hold-to-Fire, Smart Crosshair Auto-Fire, & Strict 3.0s Throwable Charge + Trajectory Arc
    const localPlayer = this.localSlotId !== null ? this.trackedPlayers.get(this.localSlotId) : undefined;
    let showArc = false;
    if (this.mode === 'playing' && localPlayer && localPlayer.alive && this.matchPhase === 'active' && this.fireHeld) {
      const equipped = this.weapons[this.equippedWeaponSlot];
      if (!equipped) {
        this.endFireHold();
      } else {
        const def = getWeaponDef(equipped.id);
        if (def.fireMode === 'throw') {
          this.throwChargeTimer = Math.min(THROW_CHARGE_SECONDS, this.throwChargeTimer + dt);
          this.updateTrajectoryPreview(localPlayer, def.color);
          showArc = true;
          if (this.throwChargeTimer >= THROW_CHARGE_SECONDS) {
            this.throwChargeTimer = 0;
            this.fireHeld = false;
            this.executeEquippedWeaponFire();
          }
        } else if (def.fireMode === 'auto' || def.fireMode === 'semi') {
          if (this.weaponCooldownTimer <= 0 && this.hasCrosshairEnemyTarget(localPlayer, def.range)) {
            this.executeEquippedWeaponFire();
          }
        } else if (def.fireMode === 'melee') {
          const reach = def.range * Math.max(1, localPlayer.renderScale * 0.65) + 0.8;
          if (this.weaponCooldownTimer <= 0 && this.hasMeleeTargetInRange(localPlayer, reach)) {
            this.executeEquippedWeaponFire();
          }
        }
      }
    } else if (this.throwChargeTimer > 0 && !this.fireHeld) {
      this.throwChargeTimer = 0;
    }
    if (this.trajectoryPoints && !showArc) {
      this.trajectoryPoints.visible = false;
    }

    // 360-degree Camera Rig & Title Spectate Mode
    if (this.mode === 'playing' && localPlayer) {
      this.audio.updateHoverHum(this.localSpeed, localPlayer.alive);

      const camScale = Math.max(0.8, Math.min(2.3, localPlayer.renderScale));
      const chaseDist = (localPlayer.dashing || localPlayer.overdrive ? 11.2 : 9.4) * camScale;
      const chaseHeight = (localPlayer.alive ? 4.2 : 9.5) * camScale;

      const pitchCam = this.localPitch * 0.58;
      const backHoriz = Math.cos(pitchCam) * chaseDist;
      const pitchOffY = Math.sin(pitchCam) * chaseDist * 0.85;

      _camPos.set(
        localPlayer.renderX - Math.sin(localPlayer.renderYaw) * backHoriz,
        localPlayer.renderY + chaseHeight - pitchOffY,
        localPlayer.renderZ - Math.cos(localPlayer.renderYaw) * backHoriz,
      );

      if (!isSpaceMap(this.activeMapId)) {
        const camGround = groundHeightAt(_camPos.x, _camPos.z, this.activeMapId, this.terrainSeed) + 1.8;
        if (_camPos.y < camGround) _camPos.y = camGround;

        const origY = localPlayer.renderY + 1.25 * camScale;
        const cdx = _camPos.x - localPlayer.renderX;
        const cdy = _camPos.y - origY;
        const cdz = _camPos.z - localPlayer.renderZ;
        const cLen = Math.hypot(cdx, cdy, cdz);
        if (cLen > 1.5) {
          const wallT = raycastApartments(
            localPlayer.renderX,
            origY,
            localPlayer.renderZ,
            cdx / cLen,
            cdy / cLen,
            cdz / cLen,
            cLen,
            this.activeMapId,
            this.terrainSeed,
          );
          if (wallT !== null && wallT < cLen) {
            const safeT = Math.max(2.1, wallT - 0.55);
            const ratio = safeT / cLen;
            _camPos.set(
              localPlayer.renderX + cdx * ratio,
              origY + cdy * ratio,
              localPlayer.renderZ + cdz * ratio,
            );
          }
        }
      }

      const lookDist = 14;
      const cosLookP = Math.cos(this.localPitch * 0.78);
      _camTarget.set(
        localPlayer.renderX + Math.sin(localPlayer.renderYaw) * cosLookP * lookDist,
        localPlayer.renderY + 1.45 * camScale + Math.sin(this.localPitch * 0.78) * lookDist,
        localPlayer.renderZ + Math.cos(localPlayer.renderYaw) * cosLookP * lookDist,
      );
      const targetFov = localPlayer.dashing || localPlayer.overdrive ? 74 : 62;

      if (this.spawnIntroElapsed > 0 && this.spawnIntroDuration > 0) {
        this.spawnIntroElapsed += dt;
        const rawT = Math.min(1, this.spawnIntroElapsed / this.spawnIntroDuration);
        const ease = 1 - Math.pow(1 - rawT, 3);
        const arcLift = Math.pow(1 - ease, 2) * 38;
        localPlayer.rig.root.position.y = localPlayer.renderY + arcLift;

        this.camera.position.lerpVectors(this.spawnIntroStartPos, _camPos, ease);
        this.camera.position.y += Math.sin(rawT * Math.PI) * 14;
        _vec3B.lerpVectors(this.spawnIntroStartLook, _camTarget, ease);
        _vec3B.y = Math.max(_vec3B.y, localPlayer.rig.root.position.y * (1 - ease * 0.35));
        this.camera.lookAt(_vec3B);

        const introFov = THREE.MathUtils.lerp(Math.max(this.spawnIntroStartFov, 78), targetFov, ease);
        if (Math.abs(this.camera.fov - introFov) > 0.05) {
          this.camera.fov = introFov;
          this.camera.updateProjectionMatrix();
        }
        if (rawT >= 1) {
          this.spawnIntroElapsed = 0;
          this.spawnIntroDuration = 0;
        }
      } else {
        this.camera.position.lerp(_camPos, 1 - Math.exp(-15 * dt));

        if (this.shakeIntensity > 0.005) {
          this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
          this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.7;
          this.shakeIntensity *= Math.exp(-9 * dt);
        } else {
          this.shakeIntensity = 0;
        }

        this.camera.lookAt(_camTarget);

        if (Math.abs(this.camera.fov - targetFov) > 0.05) {
          this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 9, dt);
          this.camera.updateProjectionMatrix();
        }
      }
    } else if (this.mode === 'title' && this.spectateActive) {
      this.audio.updateHoverHum(0, false);
      let spec = this.spectatingSlotId !== null ? this.trackedPlayers.get(this.spectatingSlotId) : undefined;
      if (!spec || !spec.alive) {
        this.pickValidSpectateTarget(1);
        spec = this.spectatingSlotId !== null ? this.trackedPlayers.get(this.spectatingSlotId) : undefined;
      }
      if (spec) {
        const fwdX = Math.sin(spec.renderYaw);
        const fwdZ = Math.cos(spec.renderYaw);
        const camScale = Math.max(0.8, Math.min(2.2, spec.renderScale));
        _camPos.set(
          spec.renderX - fwdX * 11.5 * camScale,
          spec.renderY + 5.2 * camScale,
          spec.renderZ - fwdZ * 11.5 * camScale,
        );
        if (!isSpaceMap(this.activeMapId)) {
          const gy = groundHeightAt(_camPos.x, _camPos.z, this.activeMapId, this.terrainSeed) + 1.8;
          if (_camPos.y < gy) _camPos.y = gy;
        }
        this.camera.position.lerp(_camPos, 1 - Math.exp(-8 * dt));
        _camTarget.set(spec.renderX + fwdX * 8, spec.renderY + 1.4, spec.renderZ + fwdZ * 8);
        this.camera.lookAt(_camTarget);
      } else {
        const orbitAngle = this.elapsed * 0.14;
        _camPos.set(Math.cos(orbitAngle) * 98, 36 + Math.sin(this.elapsed * 0.3) * 4, Math.sin(orbitAngle) * 98);
        this.camera.position.lerp(_camPos, 1 - Math.exp(-4 * dt));
        this.camera.lookAt(0, 7, 0);
      }
    } else {
      this.audio.updateHoverHum(0, false);
      const orbitAngle = this.elapsed * 0.14;
      const orbitR = this.guiHidden ? 120 : 98;
      _camPos.set(
        Math.cos(orbitAngle) * orbitR,
        (this.guiHidden ? 46 : 36) + Math.sin(this.elapsed * 0.3) * 4,
        Math.sin(orbitAngle) * orbitR,
      );
      this.camera.position.lerp(_camPos, 1 - Math.exp(-4 * dt));
      this.camera.lookAt(0, 7, 0);
    }

    // Track tight texel-snapped directional shadow frustum around active focus for razor-sharp shadows
    if (this.keyLight.castShadow) {
      const focusX =
        this.mode === 'playing' && localPlayer
          ? localPlayer.renderX
          : this.mode === 'title' && this.spectateActive
          ? _camTarget.x
          : 0;
      const focusY =
        this.mode === 'playing' && localPlayer
          ? localPlayer.renderY
          : 0;
      const focusZ =
        this.mode === 'playing' && localPlayer
          ? localPlayer.renderZ
          : this.mode === 'title' && this.spectateActive
          ? _camTarget.z
          : 0;
      const texelStep = (72 * 2) / Math.max(512, this.keyLight.shadow.mapSize.x);
      const sx = Math.round(focusX / texelStep) * texelStep;
      const sz = Math.round(focusZ / texelStep) * texelStep;
      this.keyLight.target.position.set(sx, focusY, sz);
      this.keyLight.position.set(sx + 85, focusY + 130, sz + 65);
      this.keyLight.target.updateMatrixWorld();
    }

    // Update 60fps imperative screen-projected Nameplates, Ally ESP, Nextbot Tags & Floating Damage
    this.updateScreenOverlays(perfNow, localPlayer);

    this.hudEmitAccum += dt;
    const hudInterval = this.mode === 'playing' ? (this.isMobileDevice ? 0.15 : 0.1) : 0.25;
    if (this.hudEmitAccum >= hudInterval) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private getRoleTagInfo(specialRole: number): { label: string; color: string } | null {
    if (specialRole === 0) return null;
    if (specialRole === 5) return { label: 'SOLAR', color: '#F59E0B' };
    if (specialRole === 6) return { label: 'ECLIPSE', color: '#38BDF8' };
    if (specialRole === 7 && this.activeSpecialModeId === 'none' && this.activeNormalModeId === 'bounty_hunters') {
      return { label: 'BOUNTY', color: '#FACC15' };
    }
    if (this.activeSpecialModeId === 'none') return null;
    if (specialRole === 1 && this.activeSpecialModeId === 'titan_boss') return { label: 'TITAN', color: '#ef4444' };
    if (specialRole === 1 && this.activeSpecialModeId === 'juggernaut_tag') return { label: 'JUGG', color: '#f59e0b' };
    if (specialRole === 3 && this.activeSpecialModeId === 'murder_mystery') return { label: 'SHERIFF', color: '#38bdf8' };
    if (specialRole === 4 && this.activeSpecialModeId === 'infected_swarm') return { label: 'INFECTED', color: '#84cc16' };
    if (specialRole === 8 && this.activeSpecialModeId === 'hide_and_seek') return { label: 'PREDATOR', color: '#ef4444' };
    if (specialRole === 9 && this.activeSpecialModeId === 'hide_and_seek') return { label: 'GHOST', color: '#c084fc' };
    return null;
  }

  private updateScreenOverlays(perfNow: number, localPlayer: TrackedPlayer | undefined): void {
    const layer = this.overlayLayer;
    if (!layer) return;

    if (this.mode !== 'playing') {
      for (const n of this.nameplateNodes.values()) n.el.style.display = 'none';
      for (const n of this.allyEspNodes.values()) n.el.style.display = 'none';
      for (const n of this.nextbotOverlayNodes.values()) n.el.style.display = 'none';
      for (const n of this.floatDmgNodes.values()) n.el.style.display = 'none';
      return;
    }

    const w = this.viewWidth;
    const h = this.viewHeight;
    if (w <= 0 || h <= 0) return;

    this.camera.updateMatrixWorld();
    const profile = QUALITY_PROFILES[this.activeQualityTier];
    const shadowsAllowed = profile.shadows && !this.isSoftwareGl;

    // 1) Floating Damage Numbers (60fps smooth)
    const seenDmgIds = new Set<number>();
    for (let i = 0; i < this.floatingDmgs.length; i++) {
      const fd = this.floatingDmgs[i];
      const age = perfNow - fd.bornAt;
      if (age >= 850) continue;
      _vec3B.set(fd.x, fd.y, fd.z).project(this.camera);
      if (_vec3B.z <= 0 || _vec3B.z >= 1) continue;
      const sx = ((_vec3B.x + 1) * 0.5) * w;
      const sy = ((-_vec3B.y + 1) * 0.5) * h;
      if (sx < 16 || sx > w - 16 || sy < 16 || sy > h - 16) continue;

      seenDmgIds.add(fd.id);
      let entry = this.floatDmgNodes.get(fd.id);
      if (!entry) {
        const el = document.createElement('div');
        const crit = fd.dmg >= 55;
        el.className = `absolute left-0 top-0 font-mono-tabular font-bold pointer-events-none select-none ${
          crit ? 'text-base sm:text-lg text-[#fbbf24]' : 'text-xs sm:text-sm text-[#f4efe6]'
        }`;
        el.style.textShadow = '0 2px 4px rgba(0,0,0,0.95)';
        el.style.willChange = 'transform, opacity';
        el.textContent = `-${fd.dmg}`;
        layer.appendChild(el);
        entry = { el, crit };
        this.floatDmgNodes.set(fd.id, entry);
      }
      entry.el.style.display = '';
      entry.el.style.opacity = String(Math.max(0, 1 - age / 850).toFixed(3));
      entry.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
    for (const [id, node] of this.floatDmgNodes.entries()) {
      if (!seenDmgIds.has(id)) {
        node.el.remove();
        this.floatDmgNodes.delete(id);
      }
    }

    // 2) Light Ally ESP (Off-screen: directional arrow ONLY; On-screen: tiny non-blocking chevron) & Nameplates
    const seenAllyIds = new Set<number>();
    const nameplateCandidates: Array<{ p: TrackedPlayer; distSq: number }> = [];
    const allyList: Array<{ p: TrackedPlayer; distSq: number }> = [];
    const myTeam = localPlayer ? this.getEffectiveTeamId(localPlayer) : 0;

    for (const p of this.trackedPlayers.values()) {
      if (!p.alive) continue;
      const distSq = this.camera.position.distanceToSquared(p.rig.root.position);
      p.rig.hullMesh.castShadow =
        shadowsAllowed && (p.slotId === this.localSlotId || distSq < profile.shadowCastDistSq);

      if (p.slotId === this.localSlotId) continue;

      const isAlly = localPlayer ? this.isAllyPlayer(p, localPlayer) : false;
      if (this.allyEspEnabled && isAlly && localPlayer) {
        allyList.push({ p, distSq });
      }
      if ((!isAlly || !p.isBot) && distSq < profile.nameplateDistSq) {
        nameplateCandidates.push({ p, distSq });
      }
    }

    if (allyList.length > 0 && localPlayer) {
      // Prioritize real human teammates first, then nearest bot teammates so screen never gets flooded
      allyList.sort((a, b) => {
        if (a.p.isBot !== b.p.isBot) return a.p.isBot ? 1 : -1;
        return a.distSq - b.distSq;
      });
      let offBotCount = 0;
      let onBotCount = 0;

      for (let i = 0; i < allyList.length; i++) {
        const p = allyList[i].p;
        const pTeam = this.getEffectiveTeamId(p);
        const accentHex = pTeam === 5 ? '#F59E0B' : pTeam === 6 ? '#38BDF8' : '#34D399';
        const distM = Math.round(
          Math.hypot(
            p.renderX - localPlayer.renderX,
            p.renderY - localPlayer.renderY,
            p.renderZ - localPlayer.renderZ,
          ),
        );

        _vec3B.set(p.renderX, p.renderY + 1.85 * p.renderScale, p.renderZ).project(this.camera);
        let ndcX = _vec3B.x;
        let ndcY = _vec3B.y;
        const behind = _vec3B.z > 1 || _vec3B.z < -1;
        if (behind) {
          ndcX = -ndcX;
          ndcY = -ndcY;
        }
        const padX = 24;
        const padTop = 50;
        const padBot = 28;
        let sx = ((ndcX + 1) * 0.5) * w;
        let sy = ((-ndcY + 1) * 0.5) * h;
        const offScreen = behind || sx < padX || sx > w - padX || sy < padTop || sy > h - padBot;

        if (p.isBot) {
          if (offScreen) {
            if (offBotCount >= 5) continue;
            offBotCount++;
          } else {
            if (onBotCount >= 6) continue;
            onBotCount++;
          }
        }

        // Skip on-screen ESP marker if close to crosshair center or close human (nameplate handles close humans cleanly)
        if (!offScreen) {
          if (Math.hypot(sx - w * 0.5, sy - h * 0.46) < 32) continue;
          if (!p.isBot && distM <= 34) continue;
        }

        let edgeAngleDeg = 0;
        if (offScreen) {
          const cx = w * 0.5;
          const cy = h * 0.5;
          let dx = sx - cx;
          let dy = sy - cy;
          const len = Math.hypot(dx, dy) || 1;
          dx /= len;
          dy /= len;
          const maxX = cx - padX;
          const maxTop = cy - padTop;
          const maxBot = h - padBot - cy;
          const scaleX = Math.abs(dx) > 0.0001 ? maxX / Math.abs(dx) : 99999;
          const scaleY = dy > 0.0001 ? maxBot / dy : dy < -0.0001 ? maxTop / -dy : 99999;
          const edgeDist = Math.min(scaleX, scaleY);
          sx = cx + dx * edgeDist;
          sy = cy + dy * edgeDist;
          edgeAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        }

        seenAllyIds.add(p.slotId);
        let esp = this.allyEspNodes.get(p.slotId);
        if (!esp) {
          const el = document.createElement('div');
          el.className = 'absolute left-0 top-0 pointer-events-none select-none flex flex-col items-center leading-none';
          el.style.willChange = 'transform';

          const arrowEl = document.createElement('span');
          arrowEl.className = 'inline-block font-black leading-none';
          arrowEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.85)';

          const distEl = document.createElement('span');
          distEl.className = 'font-mono-tabular text-[8px] font-bold leading-none mt-0.5';
          distEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.9)';

          el.append(arrowEl, distEl);
          layer.appendChild(el);
          esp = { el, arrowEl, distEl, sig: '' };
          this.allyEspNodes.set(p.slotId, esp);
        }

        const sig = `${p.isBot ? 1 : 0}|${offScreen ? 1 : 0}|${accentHex}`;
        if (esp.sig !== sig) {
          esp.sig = sig;
          esp.arrowEl.style.color = accentHex;
          if (offScreen) {
            esp.arrowEl.textContent = '▲';
            esp.arrowEl.style.fontSize = p.isBot ? '10px' : '13px';
            esp.el.style.opacity = p.isBot ? '0.45' : '0.9';
            esp.distEl.style.display = p.isBot ? 'none' : 'block';
            esp.distEl.style.color = accentHex;
          } else {
            esp.arrowEl.textContent = '▾';
            esp.arrowEl.style.fontSize = p.isBot ? '9px' : '12px';
            esp.arrowEl.style.transform = 'none';
            esp.el.style.opacity = p.isBot ? '0.42' : '0.85';
            esp.distEl.style.display = p.isBot ? 'none' : 'block';
            esp.distEl.style.color = '#e2e8f0';
          }
        }
        if (!p.isBot) {
          esp.distEl.textContent = `${distM}m`;
        }
        esp.el.style.display = '';
        if (offScreen) {
          esp.arrowEl.style.transform = `rotate(${edgeAngleDeg.toFixed(0)}deg)`;
          esp.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        } else {
          esp.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
        }
      }
    }

    for (const [slotId, node] of this.allyEspNodes.entries()) {
      if (!seenAllyIds.has(slotId)) {
        node.el.remove();
        this.allyEspNodes.delete(slotId);
      }
    }

    // 3) Compact Nameplates (Real Human Players prioritized; lightweight so screen stays clear)
    const seenNameplateIds = new Set<number>();
    if (nameplateCandidates.length > 0) {
      nameplateCandidates.sort((a, b) => {
        if (a.p.isBot !== b.p.isBot) return a.p.isBot ? 1 : -1;
        return a.distSq - b.distSq;
      });
      const maxNameplates =
        this.isMobileDevice && this.activeQualityTier === 'low'
          ? Math.min(4, profile.maxNameplates)
          : profile.maxNameplates;
      const limit = Math.min(maxNameplates, nameplateCandidates.length);
      for (let i = 0; i < limit; i++) {
        const p = nameplateCandidates[i].p;
        _vec3B.set(p.renderX, p.renderY + 2.4 * p.renderScale, p.renderZ).project(this.camera);
        if (_vec3B.z <= 0 || _vec3B.z >= 1) continue;
        const sx = ((_vec3B.x + 1) * 0.5) * w;
        const sy = ((-_vec3B.y + 1) * 0.5) * h;
        if (sx < 32 || sx > w - 32 || sy < 34 || sy > h - 34) continue;

        seenNameplateIds.add(p.slotId);
        const meta = this.playerMeta.get(p.slotId);
        const name = meta?.name || `Pilot #${p.slotId}`;
        const pTeam = this.getEffectiveTeamId(p);
        const isAlly = myTeam !== 0 && pTeam === myTeam;
        const isEnemy = myTeam !== 0 && pTeam !== 0 && pTeam !== myTeam;
        const roleTag = this.getRoleTagInfo(p.specialRole);
        const sig = `${name}|${p.isBot ? 1 : 0}|${p.sovereign ? 1 : 0}|${p.specialRole}|${isAlly ? 1 : isEnemy ? 2 : 0}|${p.colorIndex}`;

        let node = this.nameplateNodes.get(p.slotId);
        if (!node) {
          const el = document.createElement('div');
          el.className = 'absolute left-0 top-0 pointer-events-none select-none whitespace-nowrap text-center';
          el.style.willChange = 'transform';

          const badgeEl = document.createElement('div');
          const barWrap = document.createElement('div');
          barWrap.className = 'mx-auto mt-0.5 h-1 w-10 overflow-hidden rounded-full bg-[#12141a]/90';
          const barFill = document.createElement('div');
          barFill.className = 'h-full';
          barWrap.appendChild(barFill);

          el.append(badgeEl, barWrap);
          layer.appendChild(el);
          node = { el, badgeEl, barFill, sig: '', lastPct: -1 };
          this.nameplateNodes.set(p.slotId, node);
        }

        if (node.sig !== sig) {
          node.sig = sig;
          const colorHex = getPaletteColorHex(p.colorIndex);
          node.badgeEl.className = isEnemy
            ? 'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] border bg-[#450a0a]/85 border-[#f87171]/70 text-[#fef2f2]'
            : isAlly
            ? 'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] border bg-[#064e3b]/85 border-[#34d399]/75 text-[#ecfdf5]'
            : p.isBot
            ? 'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] border bg-[#12141a]/65 border-white/10 text-[#94a3b8]'
            : 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border-2 bg-[#0b1324]/92 border-[#34d399] text-[#ffffff] font-bold shadow-[0_0_10px_rgba(52,211,153,0.4)]';

          node.badgeEl.replaceChildren();
          if (p.sovereign) {
            const c = document.createElement('span');
            c.textContent = '👑';
            c.className = 'text-[10px]';
            node.badgeEl.appendChild(c);
          }
          if (!p.isBot) {
            const pTag = document.createElement('span');
            pTag.textContent = 'PLAYER';
            pTag.className =
              'font-mono-tabular text-[8px] font-black px-1 rounded-full bg-[#34d399] text-[#091215]';
            node.badgeEl.appendChild(pTag);
          } else {
            const bTag = document.createElement('span');
            bTag.textContent = 'BOT';
            bTag.className = 'font-mono-tabular text-[8px] text-[#64748b]';
            node.badgeEl.appendChild(bTag);
          }
          const dot = document.createElement('span');
          dot.className = 'h-1.5 w-1.5 rounded-full shrink-0';
          dot.style.backgroundColor = colorHex;
          node.badgeEl.appendChild(dot);

          if (roleTag) {
            const rt = document.createElement('span');
            rt.className = 'font-mono-tabular text-[8px] font-bold px-1 rounded-full text-[#12141a]';
            rt.style.backgroundColor = roleTag.color;
            rt.textContent = roleTag.label;
            node.badgeEl.appendChild(rt);
          }

          const nm = document.createElement('span');
          nm.textContent = name;
          node.badgeEl.appendChild(nm);

          node.barFill.className = `h-full ${isEnemy ? 'bg-[#f87171]' : 'bg-[#2dd4bf]'}`;
        }

        const pct = Math.max(0, Math.min(100, Math.round(p.shield)));
        if (node.lastPct !== pct) {
          node.lastPct = pct;
          node.barFill.style.width = `${pct}%`;
        }
        node.el.style.display = '';
        node.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    }

    for (const [slotId, node] of this.nameplateNodes.entries()) {
      if (!seenNameplateIds.has(slotId)) {
        node.el.remove();
        this.nameplateNodes.delete(slotId);
      }
    }

    // 4) Nextbot Tags (60fps smooth)
    const seenNbIds = new Set<number>();
    for (const nb of this.trackedNextbots.values()) {
      if (nb.banished) continue;
      const d2 = this.camera.position.distanceToSquared(nb.rig.root.position);
      if (d2 >= 95 * 95) continue;
      _vec3B.set(nb.renderX, nb.renderY + 3.0, nb.renderZ).project(this.camera);
      if (_vec3B.z <= 0 || _vec3B.z >= 1) continue;
      const sx = ((_vec3B.x + 1) * 0.5) * w;
      const sy = ((-_vec3B.y + 1) * 0.5) * h;
      if (sx < 30 || sx > w - 30 || sy < 30 || sy > h - 30) continue;

      seenNbIds.add(nb.id);
      const nbDef = getNextbotDef(nb.variant);
      const sig = `${nbDef.name}|${nb.slowed ? 1 : 0}|${nbDef.accent}`;
      let node = this.nextbotOverlayNodes.get(nb.id);
      if (!node) {
        const el = document.createElement('div');
        el.className = 'absolute left-0 top-0 pointer-events-none select-none whitespace-nowrap text-center';
        el.style.willChange = 'transform';
        const pillEl = document.createElement('div');
        pillEl.className =
          'inline-flex items-center gap-1 rounded-full border bg-[#12141a]/92 px-2.5 py-0.5 text-[11px] font-bold text-[#f4efe6] shadow';
        el.appendChild(pillEl);
        layer.appendChild(el);
        node = { el, pillEl, sig: '' };
        this.nextbotOverlayNodes.set(nb.id, node);
      }
      if (node.sig !== sig) {
        node.sig = sig;
        const border = nb.slowed ? '#38BDF8' : nbDef.accent;
        node.pillEl.style.borderColor = border;
        node.pillEl.replaceChildren();
        const nm = document.createElement('span');
        nm.style.color = border;
        nm.textContent = nbDef.name;
        node.pillEl.appendChild(nm);
        if (nb.slowed) {
          const sl = document.createElement('span');
          sl.className = 'rounded-full bg-[#38bdf8] px-1.5 text-[9px] font-bold text-[#12141a]';
          sl.textContent = 'SLOWED';
          node.pillEl.appendChild(sl);
        }
      }
      node.el.style.display = '';
      node.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
    for (const [id, node] of this.nextbotOverlayNodes.entries()) {
      if (!seenNbIds.has(id)) {
        node.el.remove();
        this.nextbotOverlayNodes.delete(id);
      }
    }
  }

  private emitHud(): void {
    const allPlayers = Array.from(this.trackedPlayers.values());
    allPlayers.sort((a, b) => b.score - a.score);

    const localPlayer = this.localSlotId !== null ? this.trackedPlayers.get(this.localSlotId) : undefined;
    let rank = 0;
    for (let i = 0; i < allPlayers.length; i++) {
      if (allPlayers[i].slotId === this.localSlotId) {
        rank = i + 1;
        break;
      }
    }

    const leaderboard = allPlayers.slice(0, 5).map((p) => {
      const meta = this.playerMeta.get(p.slotId);
      return {
        slotId: p.slotId,
        name: meta?.name || `Pilot #${p.slotId}`,
        score: p.score,
        colorIndex: p.colorIndex,
        isSelf: p.slotId === this.localSlotId,
        isSovereign: p.sovereign,
        isBot: p.isBot,
      };
    });

    const sovPlayer = this.sovereignSlotId !== 0xffff ? this.trackedPlayers.get(this.sovereignSlotId) : undefined;
    const sovMeta = sovPlayer ? this.playerMeta.get(sovPlayer.slotId) : undefined;

    const radarBlips = allPlayers.map((p) => ({
      x: p.renderX / ARENA_RADIUS,
      z: p.renderZ / ARENA_RADIUS,
      isSelf: p.slotId === this.localSlotId,
      isSovereign: p.sovereign,
      isBot: p.isBot,
      specialRole: p.specialRole,
      teamId: this.getEffectiveTeamId(p),
      colorHex: getPaletteColorHex(p.colorIndex),
    }));

    const now = performance.now();
    this.feed = this.feed.filter((item) => now - item.createdAt < 6500);

    const radarNextbots: HudSnapshot['radarNextbots'] = [];
    for (const nb of this.trackedNextbots.values()) {
      if (nb.banished) continue;
      radarNextbots.push({
        x: nb.renderX / ARENA_RADIUS,
        z: nb.renderZ / ARENA_RADIUS,
        slowed: nb.slowed,
      });
    }

    const radarSuperWeapons: HudSnapshot['radarSuperWeapons'] = [];
    let superWeaponBeacon: SuperWeaponBeaconHud | null = null;
    for (const entry of this.groundWeaponRigs.values()) {
      if (!entry.data.isSuper) continue;
      const wDef = getWeaponDef(entry.data.weaponId);
      radarSuperWeapons.push({
        x: entry.data.x / ARENA_RADIUS,
        z: entry.data.z / ARENA_RADIUS,
        color: wDef.color,
      });
      if (!superWeaponBeacon) {
        const px = localPlayer ? localPlayer.renderX : 0;
        const pz = localPlayer ? localPlayer.renderZ : 0;
        const dx = entry.data.x - px;
        const dz = entry.data.z - pz;
        const distance = Math.round(Math.hypot(dx, dz));
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const ang = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        const compassDir = dirs[Math.round(ang / 45) % 8];
        superWeaponBeacon = {
          uid: entry.data.uid,
          name: wDef.name,
          shortName: wDef.shortName,
          x: entry.data.x,
          z: entry.data.z,
          durability: entry.data.durability,
          maxDurability: entry.data.maxDurability,
          distance,
          compassDir,
          color: wDef.color,
        };
      }
    }

    const equippedId = this.weapons[this.equippedWeaponSlot]?.id;
    const arsenalIdx = equippedId ? ARSENAL_LADDER.indexOf(equippedId) : -1;
    const arsenalTier = arsenalIdx >= 0 ? arsenalIdx + 1 : 0;

    const specMeta = this.spectatingSlotId !== null ? this.playerMeta.get(this.spectatingSlotId) : undefined;
    const mapDef = getMapDef(this.activeMapId);

    this.damageIndicators = this.damageIndicators.filter((d) => now - d.bornAt < d.duration);
    const dmgIndicatorsHud: HudSnapshot['damageIndicators'] = [];
    if (localPlayer && localPlayer.alive && this.mode === 'playing') {
      const camYaw = localPlayer.renderYaw;
      const sinY = Math.sin(camYaw);
      const cosY = Math.cos(camYaw);
      for (const d of this.damageIndicators) {
        const dx = d.fromX - localPlayer.renderX;
        const dz = d.fromZ - localPlayer.renderZ;
        const dotForward = dx * sinY + dz * cosY;
        const dotRight = -dx * cosY + dz * sinY;
        const angleDeg = Math.atan2(dotRight, dotForward) * (180 / Math.PI);
        const age = (now - d.bornAt) / d.duration;
        const opacity = Math.max(0, 1 - age * age);
        dmgIndicatorsHud.push({ id: d.id, angleDeg, opacity });
      }
    }

    const shieldVal = localPlayer ? localPlayer.shield : 100;
    const lowHpIntensity =
      this.mode === 'playing' && localPlayer && localPlayer.alive && shieldVal <= 35
        ? Math.min(1, Math.max(0.15, (35 - shieldVal) / 35))
        : 0;

    if (this.photoToastText && now >= this.photoToastUntil) {
      this.photoToastText = null;
    }

    this.onHudUpdate({
      connected: this.connected,
      mode: this.mode,
      matchPhase: this.matchPhase,
      mapId: this.activeMapId,
      mapName: mapDef.name,
      terrainSeed: this.terrainSeed,
      matchNumber: this.matchNumber,
      normalMode: getNormalModeDef(this.activeNormalModeId),
      specialMode: getSpecialModeDef(this.activeSpecialModeId),
      modeHud: { ...this.modeHud },
      roleBanner: this.roleBanner ? { ...this.roleBanner } : null,
      matchTimeRemaining: this.matchTimeRemaining,
      activeEvent: getEventDef(this.activeEventId),
      activeEventTimer: this.activeEventTimer,
      nextEventIn: this.nextEventIn,
      onlinePlayers: this.onlinePlayers,
      botCount: this.botCount,
      totalPilots: allPlayers.length,
      maxPlayers: MAX_PLAYERS,
      pingMs: this.pingMs,
      localSlotId: this.localSlotId,
      alive: localPlayer ? localPlayer.alive : true,
      respawnSeconds: this.respawnCountdown,
      shield: localPlayer ? Math.round(localPlayer.shield) : 100,
      boost: localPlayer ? Math.round(localPlayer.boost) : 100,
      score: localPlayer ? localPlayer.score : 0,
      kills: this.kills,
      rank,
      speed: Math.round(this.localSpeed),
      skills: [...this.skills],
      starterSkill: this.starterSkill,
      starterCooldown: this.starterCooldown,
      nextReplaceSlot: this.nextReplaceSlot,
      weapons: this.weapons.map((item) => ({ ...item })),
      equippedWeaponSlot: this.equippedWeaponSlot,
      weaponCooldownRatio:
        this.weaponCooldownDuration > 0
          ? Math.min(1, this.weaponCooldownTimer / this.weaponCooldownDuration)
          : 0,
      throwChargeRatio: Math.max(0, Math.min(1, this.throwChargeTimer / THROW_CHARGE_SECONDS)),
      superWeaponAlert: this.superWeaponAlert ? { ...this.superWeaponAlert } : null,
      superWeaponBeacon,
      sovereignName: sovMeta?.name || '',
      sovereignScore: sovPlayer?.score || 0,
      sovereignIsBot: Boolean(sovPlayer?.isBot),
      isSovereign: Boolean(localPlayer?.sovereign),
      winningTeam: this.winningTeam,
      solarKills: this.solarKills,
      eclipseKills: this.eclipseKills,
      spectateActive: this.spectateActive && this.mode === 'title',
      spectatingName: specMeta?.name || '',
      spectatingIsBot: Boolean(specMeta?.isBot),
      guiHidden: this.guiHidden && this.mode === 'title',
      leaderboard,
      radarBlips,
      radarNextbots,
      radarSuperWeapons,
      nameplates: [],
      nextbotNameplates: [],
      pylons: this.pylonStates.map((p) => ({ ...p })),
      feed: [...this.feed],
      postMatchScores: this.postMatchScores,
      mapVotes: { ...this.mapVotes },
      myVote: this.myVote,
      modeVoteOptions: this.modeVoteOptions,
      modeVotes: { ...this.modeVotes },
      myModeVote: this.myModeVote,
      hitmarkerActive: now < this.hitmarkerUntil,
      floatingDmgs: [],
      comboToast: this.comboToast
        ? {
            id: this.comboToast.id,
            label: this.comboToast.label,
            sub: this.comboToast.sub,
            accent: this.comboToast.accent,
          }
        : null,
      localSpecialRole: localPlayer?.specialRole || 0,
      localTeamId: this.localTeamId,
      allyEspEnabled: this.allyEspEnabled,
      arsenalTier,
      lowHpIntensity,
      damageIndicators: dmgIndicatorsHud,
      photoToast: this.photoToastText,
      muted: this.audio.isMuted(),
      webglLost: this.webglLost,
      pointerLocked: this.pointerLocked,
      pointerLockBlocked: this.pointerLockBlocked,
      graphicsBackend: this.graphicsBackend,
      qualitySetting: this.qualitySetting,
      activeQualityTier: this.activeQualityTier,
      fps: Math.round(this.smoothedFps),
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.exitPointerLock();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.cleanupSocketTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);

    this.clearOverlayNodes();
    this.overlayLayer = null;
    this.clearGroundWeapons();
    this.clearNextbots();
    this.clearDisasterPillars();
    this.clearDynamicWorldFX();
    this.clearTransientVfx();
    this.solarBallRig?.dispose();
    if (this.trajectoryPoints) {
      this.trajectoryPoints.geometry.dispose();
      (this.trajectoryPoints.material as THREE.Material).dispose();
    }
    this.sharedRingGeo.dispose();
    this.sharedBeamGeo.dispose();
    this.sharedBulletHeadGeo.dispose();
    this.sharedBulletTailGeo.dispose();
    this.sharedMeteorGeo.dispose();
    this.sharedMeteorMat.dispose();
    for (const geo of this.solarZoneGeos) geo.dispose();
    this.solarZoneRingMat?.dispose();
    this.solarZonePillarMat?.dispose();
    this.envTexture?.dispose();
    this.arena?.dispose();
    this.materials?.dispose();
    this.standardCrystalMesh?.geometry.dispose();
    this.coreCrystalMesh?.geometry.dispose();
    this.sparkMesh?.geometry.dispose();
    (this.sparkMesh?.material as THREE.Material | undefined)?.dispose();
    this.audio.dispose();

    this.godRaysPass?.dispose();
    this.bloomPass?.dispose();
    this.autoExposurePass?.dispose();
    this.gradePass?.dispose();
    this.composerRt?.dispose();
    this.composer?.dispose();

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      if (!this.isWebGPU) {
        canvas.removeEventListener('webglcontextlost', this.onContextLost);
        canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
      }
      this.renderer.dispose();
      if (canvas.parentElement === this.container) {
        this.container.removeChild(canvas);
      }
    }
  }
}
