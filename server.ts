import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ARENA_RADIUS,
  ARSENAL_LADDER,
  AUTO_WEAPONS,
  EVENT_DEFS,
  EVENT_DURATION_SECONDS,
  EVENT_INTERVAL_SECONDS,
  HULL_PALETTE,
  MAP_DEFS,
  MAP_WEAPON_COUNT,
  MATCH_DURATION_SECONDS,
  MAX_PLAYERS,
  MAX_SKILL_SLOTS,
  MAX_WEAPON_SLOTS,
  MYTHIC_WEAPONS,
  NEXTBOT_DEFS,
  NORMAL_MODES,
  PLAYABLE_RADIUS,
  POSTMATCH_DURATION_SECONDS,
  REGULAR_WEAPONS,
  RESPAWN_DURATION_SECONDS,
  SENTINEL_COUNT,
  SKILL_DEFS,
  SPECIAL_MODES,
  STARTER_RECHARGE_SECONDS,
  SUPER_WEAPON_INTERVAL_SECONDS,
  THROWABLE_WEAPONS,
  TICK_DT,
  TICK_RATE,
  clampApartmentCeiling,
  clampToArena,
  encodeSnapshot,
  generateCrystalLayout,
  getApartmentSupportY,
  getEventIndex,
  getMapBoostRings,
  getMapDef,
  getMapJumpPads,
  getMapPowerOrbs,
  getMapPylons,
  getNormalModeDef,
  getNormalModeIndex,
  getSpecialModeDef,
  getSpecialModeIndex,
  getWeaponDef,
  groundHeightAt,
  isSpaceMap,
  isStadiumMap,
  isValidNormalModeId,
  isValidSkillId,
  isValidSpecialModeId,
  raycastApartments,
} from './shared/world.ts';
import type {
  BoostRingDef,
  CrystalSpawn,
  DisasterPillarSync,
  EventId,
  FireZoneSync,
  GroundWeaponSync,
  MapId,
  MatchPhase,
  ModeHudPayload,
  ModeVoteOption,
  NormalModeId,
  PowerOrbDef,
  SkillId,
  SnapshotNextbot,
  SnapshotPlayer,
  SnapshotSentinel,
  SolarBallSync,
  SpecialModeId,
  ThrownProjectileSync,
  WeaponId,
  WeaponSlotState,
} from './shared/world.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

interface PlayerInputState {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  dashQueued: boolean;
  pulseQueued: boolean;
  jumpQueued: boolean;
}

interface RoleBannerPayload {
  modeId: SpecialModeId;
  normalModeId?: NormalModeId;
  modeName: string;
  headline: string;
  rankLine: string;
  tutorialLine: string;
  accent: string;
}

interface ServerPlayer {
  slotId: number;
  ws: WebSocket | null;
  isBot: boolean;
  name: string;
  colorIndex: number;
  starterSkill: SkillId;
  starterCooldown: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  roll: number;
  pitch: number;
  aimPitch: number;
  shield: number;
  boost: number;
  score: number;
  kills: number;
  streak: number;
  lastKillTime: number;
  comboCount: number;
  comboTimer: number;
  arsenalTier: number;
  hideSurvivalTick: number;
  alive: boolean;
  grounded: boolean;
  respawnTimer: number;
  dashTimer: number;
  dashCooldown: number;
  pulseTimer: number;
  pulseCooldown: number;
  hitCooldown: number;
  invulnTimer: number;
  aegisTimer: number;
  overdriveTimer: number;
  magnetTimer: number;
  empSlowTimer: number;
  turboTimer: number;
  ringCooldownTimer: number;
  scale: number;
  teamId: 5 | 6; // 5 = Team Solar, 6 = Team Eclipse
  specialRole: number; // 0=normal, 1=giant/jugg, 2=murderer, 3=sheriff, 4=infected, 5=solar, 6=eclipse, 7=bounty, 8=predator, 9=ghost
  rankTier: string;
  skills: SkillId[];
  nextReplaceSlot: number;
  weapons: WeaponSlotState[];
  equippedWeaponSlot: number;
  weaponCooldown: number;
  attackAnimTimer: number;
  lastDamagerId: number | null;
  lastDamagerTime: number;
  botThinkTimer: number;
  botTargetX: number;
  botTargetZ: number;
  botStrafe: number;
  botAimTargetId: number | null;
  botAimReactionTimer: number;
  botAimYaw: number;
  botAimPitch: number;
  input: PlayerInputState;
}

interface ServerCrystal {
  spawn: CrystalSpawn;
  active: boolean;
  respawnTimer: number;
}

interface ServerPowerOrb {
  def: PowerOrbDef;
  active: boolean;
  respawnTimer: number;
}

interface ServerPylon {
  id: number;
  name: string;
  x: number;
  z: number;
  radius: number;
  ownerSlotId: number | null;
  ownerName: string;
  ownerColor: number;
  ownerTeam: number;
  progress: number;
  payoutTimer: number;
}

interface ServerSentinel {
  id: number;
  homeX: number;
  homeZ: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  state: number;
  timer: number;
  patrolAngle: number;
}

interface PendingMeteor {
  x: number;
  z: number;
  radius: number;
  timer: number;
}

interface GroundWeaponItem extends GroundWeaponSync {
  age: number;
  vx: number;
  vy: number;
  vz: number;
  dropperSlotId: number;
  pickupLockTimer: number;
  settled: boolean;
}

interface ServerThrownProjectile extends ThrownProjectileSync {
  ownerSlotId: number;
  ownerTeam: number;
  timer: number;
}

interface ServerFireZone extends FireZoneSync {
  ownerSlotId: number;
  ownerTeam: number;
  tickTimer: number;
}

interface ServerNextbot {
  id: number;
  variant: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  slowTimer: number;
  banishTimer: number;
  hitCooldown: number;
}

interface ScoreRow {
  slotId: number;
  name: string;
  score: number;
  kills: number;
  colorIndex: number;
  isBot: boolean;
  teamId: 5 | 6;
  rank: number;
}

interface ClientSession {
  ws: WebSocket;
  role: 'observer' | 'pilot';
  slotId: number | null;
  votedMap: MapId | null;
  votedMode: string | null;
}

function rollTerrainSeed(): number {
  return Math.floor(1 + Math.random() * 0x7fffffff);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const sessions = new Map<WebSocket, ClientSession>();
const players = new Map<number, ServerPlayer>();
let cachedPlayers: ServerPlayer[] = [];

function syncPlayerCache(): void {
  cachedPlayers.length = 0;
  for (const p of players.values()) {
    cachedPlayers.push(p);
  }
}

let activeMapId: MapId = 'metro_city';
let terrainSeed: number = rollTerrainSeed();
let matchNumber = 1;
let activeNormalModeId: NormalModeId = 'team_clash';
let lastNormalModeId: NormalModeId = 'team_clash';
let activeSpecialModeId: SpecialModeId = 'none';
let lastSpecialModeId: SpecialModeId = 'none';
let rouletteTimer = 0;

let solarKills = 0;
let eclipseKills = 0;
let winningTeamId: 5 | 6 | 0 = 0;
let solarZone = { x: 0, z: 0, radius: 24, timer: 35, payoutTick: 0 };
let lavaLevel = -1.2;
let lavaCycleTimer = 0;
let modeHudSyncTimer = 0;
let modeVoteOptions: ModeVoteOption[] = [];

let matchPhase: MatchPhase = 'active';
let matchTimeRemaining = MATCH_DURATION_SECONDS;
let activeEventId: EventId = 'none';
let activeEventTimer = 0;
let nextEventTimer = 2.0; // Disaster triggers right at round start and lasts 60s!
let lastEventId: EventId = 'none';
let meteorSpawnTimer = 0;
let ionStormTimer = 0;
let vortexPulseTimer = 0;
let vortexPullPhase = true;
let seismicTremorTimer = 0;
let flareWaveTimer = 0;
let pendingMeteors: PendingMeteor[] = [];
let disasterPillars: DisasterPillarSync[] = [];
let lastMatchScores: ScoreRow[] = [];

let crystalLayouts = generateCrystalLayout(activeMapId, terrainSeed);
let crystals: ServerCrystal[] = [];
let powerOrbs: ServerPowerOrb[] = [];
let boostRings: BoostRingDef[] = [];
let pylons: ServerPylon[] = [];
let sentinels: ServerSentinel[] = [];
const groundWeapons = new Map<number, GroundWeaponItem>();
let nextGroundWeaponUid = 1;
let superWeaponTimer = SUPER_WEAPON_INTERVAL_SECONDS;
let weaponTopupTimer = 3.0;
let activeSuperWeaponUid: number | null = null;
let serverNextbots: ServerNextbot[] = [];

let thrownProjectiles: ServerThrownProjectile[] = [];
let nextThrownUid = 1;
let fireZones: ServerFireZone[] = [];
let nextZoneUid = 1;
let dynamicSyncTimer = 0;

let solarBall: SolarBallSync | null = null;
let lastBallToucher: ServerPlayer | null = null;

let nextSlotId = 1;
let nextBotNum = 1;
let serverTime = 0;
let beamAngle = 0;
let sovereignSlotId = 0xffff;
let botFxBudget = 0;
const serverStartTime = Date.now();

// Reusable per-tick buffers (Zero GC pressure!)
const snapPlayersBuf: SnapshotPlayer[] = [];
const snapSentinelsBuf: SnapshotSentinel[] = [];
const snapNextbotsBuf: SnapshotNextbot[] = [];
const crystalUpdatesBuf: Array<{ id: number; active: boolean }> = [];
const orbUpdatesBuf: Array<{ id: number; active: boolean }> = [];
const addedGroundWeaponsBuf: GroundWeaponSync[] = [];
const removedGroundWeaponUidsBuf: number[] = [];
const contendersBuf: ServerPlayer[] = [];
const movedGroundWeaponsBuf: GroundWeaponSync[] = [];

const BOT_CALLSIGNS = [
  'Kestrel', 'Vanguard', 'Mirage', 'Zenith', 'Aether', 'Helios', 'Strider', 'Talon',
  'Cipher', 'Nova', 'Drifter', 'Orion', 'Sparrow', 'Vertex', 'Halcyon', 'Nomad',
  'Sirocco', 'Falcon', 'Borealis', 'Solstice', 'Harrier', 'Vortex', 'Comet', 'Nimbus',
];

const MAX_GROUND_WEAPONS = 40;

function isTeamMatch(): boolean {
  return activeSpecialModeId === 'none';
}

function getEffectiveGroundY(x: number, z: number, footY?: number): number {
  let y =
    footY !== undefined
      ? getApartmentSupportY(x, z, footY, activeMapId, terrainSeed)
      : groundHeightAt(x, z, activeMapId, terrainSeed);
  for (let i = 0; i < disasterPillars.length; i++) {
    const dp = disasterPillars[i];
    const dx = x - dp.x;
    const dz = z - dp.z;
    if (dx * dx + dz * dz <= (dp.radius + 0.6) * (dp.radius + 0.6)) {
      const topY = dp.y + dp.height;
      if (topY > y) y = topY;
    }
  }
  return y;
}

function evictOldestGroundWeapons(cap: number): number[] {
  const removed: number[] = [];
  while (groundWeapons.size > cap) {
    let candidate: GroundWeaponItem | null = null;
    for (const gw of groundWeapons.values()) {
      if (gw.isSuper) continue;
      if (!candidate || gw.age > candidate.age || (gw.age === candidate.age && gw.uid < candidate.uid)) {
        candidate = gw;
      }
    }
    if (!candidate) break;
    groundWeapons.delete(candidate.uid);
    removed.push(candidate.uid);
    if (activeSuperWeaponUid === candidate.uid) activeSuperWeaponUid = null;
  }
  return removed;
}

function spawnGroundWeaponAt(
  weaponId: WeaponId,
  x: number,
  z: number,
  durability?: number,
  maxDurability?: number,
  isSuper = false,
  isDrop = false,
  vx = 0,
  vy = 0,
  vz = 0,
  dropperSlotId = 0,
  pickupLockTimer = 0,
  startY?: number,
): GroundWeaponItem {
  const def = getWeaponDef(weaponId);
  const clamped = clampToArena(x, z, 2.5, activeMapId, terrainSeed);
  const gy = getEffectiveGroundY(clamped.x, clamped.z) + 0.45;
  const uid = nextGroundWeaponUid++;
  const maxDur = maxDurability ?? def.maxDurability;
  const dur = Math.max(1, durability ?? maxDur);
  const item: GroundWeaponItem = {
    uid,
    weaponId,
    durability: dur,
    maxDurability: maxDur,
    x: clamped.x,
    y: startY !== undefined ? Math.max(gy, startY) : gy,
    z: clamped.z,
    vx,
    vy,
    vz,
    isSuper,
    isDrop,
    age: 0,
    dropperSlotId,
    pickupLockTimer,
    settled: vx === 0 && vy === 0 && vz === 0,
  };
  groundWeapons.set(uid, item);
  if (isSuper) activeSuperWeaponUid = uid;
  return item;
}

function getGroundWeaponsPayload(): GroundWeaponSync[] {
  const list: GroundWeaponSync[] = [];
  for (const gw of groundWeapons.values()) {
    list.push({
      uid: gw.uid,
      weaponId: gw.weaponId,
      durability: gw.durability,
      maxDurability: gw.maxDurability,
      x: gw.x,
      y: gw.y,
      z: gw.z,
      vx: gw.vx,
      vy: gw.vy,
      vz: gw.vz,
      isSuper: gw.isSuper,
      isDrop: gw.isDrop,
    });
  }
  return list;
}

function pickModeSpecificWeapon(): WeaponId {
  // Contextual Special Mode Items!
  if (activeSpecialModeId === 'nico_nextbots') {
    const r = Math.random();
    if (r < 0.42) return Math.random() < 0.5 ? 'cryo_bomb' : 'emp_grenade';
    if (r < 0.72) return Math.random() < 0.5 ? 'cryo_repeater' : 'cryo_rifle';
    return 'cryo_halberd';
  }
  if (activeSpecialModeId === 'boss_raid_sentinels') {
    const r = Math.random();
    if (r < 0.35) return Math.random() < 0.5 ? 'cluster_bomb' : 'frag_grenade';
    if (r < 0.72) return Math.random() < 0.5 ? 'flak_autocannon' : 'vulcan_rotary';
    return 'arc_lmg';
  }
  if (activeSpecialModeId === 'lava_rising') {
    if (Math.random() < 0.35) return Math.random() < 0.5 ? 'molotov_cocktail' : 'cluster_bomb';
  }
  if (activeSpecialModeId === 'berserk_arena') {
    if (Math.random() < 0.38) return Math.random() < 0.5 ? 'frag_grenade' : 'titan_maul';
  }

  const roll = Math.random();
  if (roll < 0.24) {
    return THROWABLE_WEAPONS[Math.floor(Math.random() * THROWABLE_WEAPONS.length)].id;
  }
  if (roll < 0.72) {
    const nonMythicAuto = AUTO_WEAPONS.filter((w) => w.rarity !== 'mythic');
    return nonMythicAuto[Math.floor(Math.random() * nonMythicAuto.length)].id;
  }
  return REGULAR_WEAPONS[Math.floor(Math.random() * REGULAR_WEAPONS.length)].id;
}

function spawnScatterRegularWeapon(nearTarget?: { x: number; z: number }): GroundWeaponItem {
  const angle = Math.random() * Math.PI * 2;
  const wId = pickModeSpecificWeapon();
  const def = getWeaponDef(wId);
  let x: number;
  let z: number;
  if (nearTarget) {
    const localDist = 18 + Math.random() * 38;
    x = nearTarget.x + Math.cos(angle) * localDist;
    z = nearTarget.z + Math.sin(angle) * localDist;
  } else {
    const radius = 16 + Math.random() * 136;
    x = Math.cos(angle) * radius;
    z = Math.sin(angle) * radius;
  }
  return spawnGroundWeaponAt(
    def.id,
    x,
    z,
    def.maxDurability,
    def.maxDurability,
    false,
    false,
  );
}

function spawnNextbotsForMatch(): void {
  if (activeSpecialModeId !== 'nico_nextbots') {
    serverNextbots = [];
    return;
  }
  serverNextbots = NEXTBOT_DEFS.map((nb, idx) => {
    const angle = (idx * Math.PI * 2) / NEXTBOT_DEFS.length + 0.35;
    const dist = 54 + idx * 14;
    const nx = Math.cos(angle) * dist;
    const nz = Math.sin(angle) * dist;
    return {
      id: idx,
      variant: nb.variant,
      x: nx,
      y: groundHeightAt(nx, nz, activeMapId, terrainSeed) + 2.8,
      z: nz,
      vx: 0,
      vz: 0,
      yaw: angle + Math.PI,
      hp: 260,
      maxHp: 260,
      slowTimer: 0,
      banishTimer: 0,
      hitCooldown: 0,
    };
  });
}

function rebuildMapEntities(mapId: MapId, seed: number): void {
  crystalLayouts = generateCrystalLayout(mapId, seed);
  crystals = crystalLayouts.map((spawn) => ({
    spawn,
    active: true,
    respawnTimer: 0,
  }));

  powerOrbs = getMapPowerOrbs(mapId, seed).map((def) => ({
    def,
    active: true,
    respawnTimer: 0,
  }));

  boostRings = getMapBoostRings(mapId, seed);

  pylons = getMapPylons(mapId, seed).map((p) => ({
    id: p.id,
    name: p.name,
    x: p.x,
    z: p.z,
    radius: p.radius,
    ownerSlotId: null,
    ownerName: '',
    ownerColor: 0,
    ownerTeam: 0,
    progress: 0,
    payoutTimer: 0,
  }));

  const sentinelTotal = activeSpecialModeId === 'boss_raid_sentinels' ? 10 : SENTINEL_COUNT;
  sentinels = Array.from({ length: sentinelTotal }, (_, i) => {
    const isInner = i < 2;
    const angle = isInner ? i * Math.PI : ((i - 2) * Math.PI) / Math.max(1, sentinelTotal - 2) + Math.PI / 4;
    const dist = isInner ? 18 : 66 + (i % 3) * 22;
    const hx = Math.cos(angle) * dist;
    const hz = Math.sin(angle) * dist;
    return {
      id: i,
      homeX: hx,
      homeZ: hz,
      x: hx,
      y: groundHeightAt(hx, hz, mapId, seed) + 2.2,
      z: hz,
      vx: 0,
      vz: 0,
      yaw: angle,
      hp: 100,
      state: 0,
      timer: 0,
      patrolAngle: angle,
    };
  });

  groundWeapons.clear();
  thrownProjectiles = [];
  fireZones = [];
  disasterPillars = [];
  activeSuperWeaponUid = null;
  superWeaponTimer = SUPER_WEAPON_INTERVAL_SECONDS;
  for (let i = 0; i < MAP_WEAPON_COUNT; i++) {
    spawnScatterRegularWeapon();
  }
  spawnNextbotsForMatch();
  solarZone = { x: 0, z: 0, radius: 24, timer: 35, payoutTick: 0 };
  lavaLevel = -1.2;
  lavaCycleTimer = 0;
  solarBall = isStadiumMap(mapId)
    ? { x: 0, y: 2.8, z: 0, vx: 0, vy: 0, vz: 0 }
    : null;
  lastBallToucher = null;
}

rebuildMapEntities(activeMapId, terrainSeed);

function getPilotCounts(): { humans: number; bots: number; total: number } {
  let humans = 0;
  let bots = 0;
  for (let i = 0; i < cachedPlayers.length; i++) {
    if (cachedPlayers[i].isBot) bots++;
    else humans++;
  }
  return { humans, bots, total: humans + bots };
}

function allocateSlotId(): number {
  for (let attempts = 0; attempts < 60000; attempts++) {
    const id = nextSlotId;
    nextSlotId = nextSlotId >= 60000 ? 1 : nextSlotId + 1;
    if (!players.has(id)) return id;
  }
  return 1;
}

function getSpawnPoint(spreadInterior = false, teamId?: 5 | 6): { x: number; y: number; z: number; yaw: number } {
  let angle = Math.random() * Math.PI * 2;
  if (teamId === 5) {
    // Solar spawns mostly on -Z hemisphere
    angle = Math.PI + (Math.random() - 0.5) * 1.9;
  } else if (teamId === 6) {
    // Eclipse spawns mostly on +Z hemisphere
    angle = (Math.random() - 0.5) * 1.9;
  }
  const radius = spreadInterior ? 34 + Math.random() * 105 : 95 + Math.random() * 52;
  const clamped = clampToArena(Math.sin(angle) * radius, Math.cos(angle) * radius, 2.2, activeMapId, terrainSeed);
  const y =
    getEffectiveGroundY(clamped.x, clamped.z) +
    (isSpaceMap(activeMapId) ? 6 + Math.random() * 22 : 1.2);
  const yaw = Math.atan2(-clamped.x, -clamped.z);
  return { x: clamped.x, y, z: clamped.z, yaw };
}

function sendJson(ws: WebSocket | null, payload: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastJson(payload: unknown): void {
  const raw = JSON.stringify(payload);
  for (const session of sessions.values()) {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(raw);
    }
  }
}

function getPlayersMetaList(): Array<{ slotId: number; name: string; colorIndex: number; isBot: boolean }> {
  const list: Array<{ slotId: number; name: string; colorIndex: number; isBot: boolean }> = [];
  for (let i = 0; i < cachedPlayers.length; i++) {
    const p = cachedPlayers[i];
    list.push({ slotId: p.slotId, name: p.name, colorIndex: p.colorIndex, isBot: p.isBot });
  }
  return list;
}

function getActiveCrystalMask(): number[] {
  const inactive: number[] = [];
  for (let i = 0; i < crystals.length; i++) {
    if (!crystals[i].active) inactive.push(i);
  }
  return inactive;
}

function getInactiveOrbMask(): number[] {
  const inactive: number[] = [];
  for (let i = 0; i < powerOrbs.length; i++) {
    if (!powerOrbs[i].active) inactive.push(i);
  }
  return inactive;
}

function getPylonsPayload() {
  return pylons.map((p) => ({
    id: p.id,
    name: p.name,
    ownerSlotId: p.ownerSlotId,
    ownerName: p.ownerName,
    ownerColor: p.ownerColor,
    progress: Math.round(p.progress),
  }));
}

function getMapVotesPayload(): Record<MapId, number> {
  const votes: Record<MapId, number> = {
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
  for (const session of sessions.values()) {
    if (session.votedMap && votes[session.votedMap] !== undefined) {
      votes[session.votedMap] += 1;
    }
  }
  return votes;
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Skimmer';
  const cleaned = raw.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().slice(0, 14);
  return cleaned.length > 0 ? cleaned : 'Skimmer';
}

function sanitizeSkillId(raw: unknown): SkillId {
  return isValidSkillId(raw) ? raw : 'nova_blast';
}

function rollRandomRank(): string {
  const r = Math.random();
  if (r < 0.2) return 'Rank: S · Overcharged';
  if (r < 0.5) return 'Rank: A · Apex Striker';
  if (r < 0.85) return 'Rank: B · Vanguard';
  return 'Rank: C · Wildcard';
}

function getModeVotesPayload(): Record<string, number> {
  const votes: Record<string, number> = {};
  for (const opt of modeVoteOptions) {
    votes[opt.key] = 0;
  }
  for (const session of sessions.values()) {
    if (session.votedMode && votes[session.votedMode] !== undefined) {
      votes[session.votedMode] += 1;
    }
  }
  return votes;
}

function buildModeVoteOptions(nextMatchNum: number): ModeVoteOption[] {
  const options: ModeVoteOption[] = [];
  if (nextMatchNum % 3 === 0) {
    const pool = [...SPECIAL_MODES].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const m of pool) {
      options.push({
        key: `special:${m.id}`,
        kind: 'special',
        id: m.id,
        name: m.name,
        subtitle: m.summary,
        accent: m.accent,
      });
    }
  } else {
    const normals = [...NORMAL_MODES].sort(() => Math.random() - 0.5).slice(0, 2);
    for (const m of normals) {
      options.push({
        key: `normal:${m.id}`,
        kind: 'normal',
        id: m.id,
        name: m.name,
        subtitle: m.summary,
        accent: m.accent,
      });
    }
    const bonusSpecial = SPECIAL_MODES[Math.floor(Math.random() * SPECIAL_MODES.length)];
    options.push({
      key: `special:${bonusSpecial.id}`,
      kind: 'special',
      id: bonusSpecial.id,
      name: `SPECIAL: ${bonusSpecial.name}`,
      subtitle: bonusSpecial.summary,
      accent: bonusSpecial.accent,
    });
  }
  return options;
}

function getModeHudPayload(): ModeHudPayload {
  let solarScore = 0;
  let eclipseScore = 0;
  let bountyName = '';
  let bountyX = 0;
  let bountyZ = 0;
  let bestBountyScore = -1;

  for (let i = 0; i < cachedPlayers.length; i++) {
    const p = cachedPlayers[i];
    if (p.teamId === 5) solarScore += p.score;
    else eclipseScore += p.score;
    if (p.specialRole === 7 && p.alive && p.score > bestBountyScore) {
      bestBountyScore = p.score;
      bountyName = p.isBot ? `[BOT] ${p.name}` : p.name;
      bountyX = Math.round(p.x);
      bountyZ = Math.round(p.z);
    }
  }

  const teamMode = isTeamMatch();
  const hasLava = activeSpecialModeId === 'lava_rising' || activeEventId === 'magma_flood';

  return {
    normalModeId: activeNormalModeId,
    specialModeId: activeSpecialModeId,
    isTeamMatch: teamMode,
    solarScore: teamMode ? solarScore : undefined,
    eclipseScore: teamMode ? eclipseScore : undefined,
    solarKills: teamMode ? solarKills : undefined,
    eclipseKills: teamMode ? eclipseKills : undefined,
    zoneX: teamMode && activeNormalModeId === 'king_of_hill' ? solarZone.x : undefined,
    zoneZ: teamMode && activeNormalModeId === 'king_of_hill' ? solarZone.z : undefined,
    zoneRadius: teamMode && activeNormalModeId === 'king_of_hill' ? solarZone.radius : undefined,
    zoneTimer: teamMode && activeNormalModeId === 'king_of_hill' ? Math.ceil(solarZone.timer) : undefined,
    lavaLevel: hasLava ? Number(lavaLevel.toFixed(1)) : undefined,
    lavaMax: hasLava ? 4.4 : undefined,
    bountyName: teamMode && activeNormalModeId === 'bounty_hunters' ? bountyName : undefined,
    bountyX: teamMode && activeNormalModeId === 'bounty_hunters' ? bountyX : undefined,
    bountyZ: teamMode && activeNormalModeId === 'bounty_hunters' ? bountyZ : undefined,
    ballX: solarBall ? Math.round(solarBall.x) : undefined,
    ballZ: solarBall ? Math.round(solarBall.z) : undefined,
  };
}

function getRoleBannerForPlayer(p: ServerPlayer): RoleBannerPayload {
  const rankLine = p.rankTier || rollRandomRank();
  const def = getSpecialModeDef(activeSpecialModeId);

  if (!def) {
    const nDef = getNormalModeDef(activeNormalModeId);
    const isSolar = p.teamId === 5;
    return {
      modeId: 'none',
      normalModeId: activeNormalModeId,
      modeName: nDef.name,
      headline: isSolar ? 'TEAM SOLAR' : 'TEAM ECLIPSE',
      rankLine,
      tutorialLine: nDef.defaultTutorial,
      accent: isSolar ? '#F59E0B' : '#38BDF8',
    };
  }

  if (activeSpecialModeId === 'titan_boss' && p.specialRole === 1) {
    return {
      modeId: activeSpecialModeId,
      modeName: def.name,
      headline: 'THE COLOSSUS TITAN',
      rankLine,
      tutorialLine: 'Kill all 49 tiny pilots using 2.8x heavy armor & shock slams!',
      accent: '#EF4444',
    };
  }
  if (activeSpecialModeId === 'murder_mystery') {
    if (p.specialRole === 2) {
      return {
        modeId: activeSpecialModeId,
        modeName: def.name,
        headline: 'THE MURDERER',
        rankLine,
        tutorialLine: 'Kill Survivors with lethal crimson blades & evade the Sheriff!',
        accent: '#E11D48',
      };
    }
    if (p.specialRole === 3) {
      return {
        modeId: activeSpecialModeId,
        modeName: def.name,
        headline: 'THE SHERIFF',
        rankLine,
        tutorialLine: 'Kill the secret Murderer using your Railgun & Shield!',
        accent: '#38BDF8',
      };
    }
  }
  if (activeSpecialModeId === 'infected_swarm' && p.specialRole === 4) {
    return {
      modeId: activeSpecialModeId,
      modeName: def.name,
      headline: 'INFECTED',
      rankLine,
      tutorialLine: 'Kill & convert all Survivors at hyper speed to grow the swarm!',
      accent: '#84CC16',
    };
  }
  if (activeSpecialModeId === 'juggernaut_tag' && p.specialRole === 1) {
    return {
      modeId: activeSpecialModeId,
      modeName: def.name,
      headline: 'THE JUGGERNAUT',
      rankLine,
      tutorialLine: 'Kill challengers & harvest 2x Shards to keep your Golden Crown!',
      accent: '#F59E0B',
    };
  }
  if (activeSpecialModeId === 'hide_and_seek' && p.specialRole === 8) {
    return {
      modeId: activeSpecialModeId,
      modeName: def.name,
      headline: 'THE PREDATOR',
      rankLine,
      tutorialLine: 'Hunt down all 46 Ghost Runners with your Railgun & Hyperdrive!',
      accent: '#EF4444',
    };
  }

  return {
    modeId: activeSpecialModeId,
    modeName: def.name,
    headline: def.defaultRoleTitle,
    rankLine,
    tutorialLine: def.defaultTutorial,
    accent: def.accent,
  };
}

function sendPlayerWeapons(
  p: ServerPlayer,
  pickedUpId?: WeaponId,
  brokenWeaponId?: WeaponId,
): void {
  if (!p.ws) return;
  sendJson(p.ws, {
    type: 'weapons_sync',
    weapons: p.weapons,
    equippedSlot: p.equippedWeaponSlot,
    pickedUpId: pickedUpId || null,
    brokenWeaponId: brokenWeaponId || null,
  });
}

function applySpecialModeLoadout(p: ServerPlayer): void {
  p.scale = activeSpecialModeId === 'tiny_giants' ? 0.58 : 1.0;
  p.specialRole = isTeamMatch() ? p.teamId : 0;
  p.rankTier = rollRandomRank();
  p.weapons = [];
  p.equippedWeaponSlot = 0;
  p.weaponCooldown = 0;
  p.attackAnimTimer = 0;
  p.arsenalTier = 0;
  p.comboCount = 0;
  p.comboTimer = 0;
  p.hideSurvivalTick = 0;

  if (activeSpecialModeId === 'skill_roulette') {
    const shuffled = [...SKILL_DEFS].sort(() => Math.random() - 0.5);
    p.skills = [p.starterSkill, ...shuffled.filter((s) => s.id !== p.starterSkill).slice(0, 4).map((s) => s.id)];
    p.starterCooldown = 0;
  } else if (activeSpecialModeId === 'nico_nextbots') {
    p.skills = [p.starterSkill, 'emp_shock'];
    p.starterCooldown = 0;
    const cryoDef = getWeaponDef('cryo_rifle');
    const cryoBomb = getWeaponDef('cryo_bomb');
    p.weapons = [
      { id: cryoDef.id, durability: cryoDef.maxDurability, maxDurability: cryoDef.maxDurability },
      { id: cryoBomb.id, durability: 1, maxDurability: 1 },
    ];
  } else if (activeSpecialModeId === 'sniper_duel') {
    p.skills = p.starterSkill === 'phase_blink' ? ['phase_blink'] : [p.starterSkill, 'phase_blink'];
    p.starterCooldown = 0;
    const railDef = getWeaponDef('rail_sniper');
    p.weapons = [{ id: railDef.id, durability: 99, maxDurability: 99 }];
  } else if (activeSpecialModeId === 'none' && activeNormalModeId === 'arsenal_escalate') {
    p.skills = [p.starterSkill];
    p.starterCooldown = 0;
    const startWep = getWeaponDef(ARSENAL_LADDER[0]);
    p.weapons = [{ id: startWep.id, durability: 99, maxDurability: 99 }];
  } else if (activeSpecialModeId === 'none') {
    // Tactical team matches give pilots a standard starter firearm + random throwable!
    p.skills = [p.starterSkill];
    p.starterCooldown = 0;
    const starterGun = getWeaponDef('pulse_carbine');
    const starterFrag = getWeaponDef('frag_grenade');
    p.weapons = [
      { id: starterGun.id, durability: starterGun.maxDurability, maxDurability: starterGun.maxDurability },
      { id: starterFrag.id, durability: 1, maxDurability: 1 },
    ];
  } else {
    p.skills = [p.starterSkill];
    p.starterCooldown = 0;
  }
}

function assignSpecialRolesForMatch(): void {
  const all = cachedPlayers;
  const humans = all.filter((p) => !p.isBot);
  const bots = all.filter((p) => p.isBot);

  // Assign balanced alternating Solar (5) & Eclipse (6) teams
  const shuffledTeams = [...all].sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffledTeams.length; i++) {
    shuffledTeams[i].teamId = i % 2 === 0 ? 5 : 6;
  }

  for (let i = 0; i < all.length; i++) {
    applySpecialModeLoadout(all[i]);
  }

  const pickCandidate = (excludeSlot?: number): ServerPlayer | undefined => {
    const humanPool = humans.filter((p) => p.slotId !== excludeSlot);
    if (humanPool.length > 0 && Math.random() < 0.85) {
      return humanPool[Math.floor(Math.random() * humanPool.length)];
    }
    const fallbackPool = (humanPool.length > 0 ? humanPool : bots).filter((p) => p.slotId !== excludeSlot);
    return fallbackPool.length > 0 ? fallbackPool[Math.floor(Math.random() * fallbackPool.length)] : all[0];
  };

  if (activeSpecialModeId === 'none') {
    return;
  }

  if (activeSpecialModeId === 'titan_boss') {
    const boss = pickCandidate();
    if (boss) {
      boss.specialRole = 1;
      boss.scale = 2.8;
      boss.shield = 100;
      const exDef = getWeaponDef('titan_maul');
      boss.weapons = [{ id: exDef.id, durability: exDef.maxDurability, maxDurability: exDef.maxDurability }];
    }
  } else if (activeSpecialModeId === 'juggernaut_tag') {
    const jugg = pickCandidate();
    if (jugg) {
      jugg.specialRole = 1;
      jugg.scale = 2.2;
      jugg.shield = 100;
    }
  } else if (activeSpecialModeId === 'murder_mystery') {
    const murderer = pickCandidate();
    if (murderer) {
      murderer.specialRole = 2;
      murderer.skills = (['overdrive', 'phase_blink', murderer.starterSkill] as SkillId[]).slice(
        0,
        MAX_SKILL_SLOTS,
      );
      const bladeDef = getWeaponDef('crimson_odachi');
      murderer.weapons = [{ id: bladeDef.id, durability: bladeDef.maxDurability, maxDurability: bladeDef.maxDurability }];
    }
    const sheriff = pickCandidate(murderer?.slotId);
    if (sheriff) {
      sheriff.specialRole = 3;
      sheriff.starterSkill = 'solar_lance';
      sheriff.skills = ['solar_lance', 'aegis_dome'];
      const railDef = getWeaponDef('rail_sniper');
      sheriff.weapons = [{ id: railDef.id, durability: railDef.maxDurability, maxDurability: railDef.maxDurability }];
    }
  } else if (activeSpecialModeId === 'infected_swarm') {
    const first = pickCandidate();
    const used = new Set<number>();
    if (first) {
      first.specialRole = 4;
      used.add(first.slotId);
    }
    const extraBots = bots.filter((b) => !used.has(b.slotId));
    for (let k = 0; k < 4 && k < extraBots.length; k++) {
      extraBots[k].specialRole = 4;
    }
  } else if (activeSpecialModeId === 'hide_and_seek') {
    const predatorSlots = new Set<number>();
    const p1 = pickCandidate();
    if (p1) predatorSlots.add(p1.slotId);
    const botPool = [...bots].sort(() => Math.random() - 0.5);
    for (let i = 0; i < botPool.length && predatorSlots.size < 4; i++) {
      predatorSlots.add(botPool[i].slotId);
    }
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      if (predatorSlots.has(p.slotId)) {
        p.specialRole = 8;
        p.scale = 1.25;
        p.skills = (['overdrive', 'emp_shock', p.starterSkill] as SkillId[]).slice(0, MAX_SKILL_SLOTS);
        const railDef = getWeaponDef('rail_sniper');
        p.weapons = [{ id: railDef.id, durability: 99, maxDurability: 99 }];
      } else {
        p.specialRole = 9;
        p.scale = 0.88;
        p.skills = (['phase_blink', 'shard_magnet', p.starterSkill] as SkillId[]).slice(0, MAX_SKILL_SLOTS);
      }
    }
  }
}

function sendPlayerSkills(
  p: ServerPlayer,
  grantedSkill?: SkillId,
  replacedSlot?: number,
  rechargedStarter = false,
): void {
  if (!p.ws) return;
  sendJson(p.ws, {
    type: 'skills_sync',
    skills: p.skills,
    nextReplaceSlot: p.nextReplaceSlot,
    starterCooldown: Number(p.starterCooldown.toFixed(1)),
    kills: p.kills,
    grantedSkill: grantedSkill || null,
    replacedSlot: replacedSlot !== undefined ? replacedSlot : null,
    rechargedStarter,
  });
}

function grantRandomSkill(p: ServerPlayer): void {
  if (p.skills.length < MAX_SKILL_SLOTS) {
    const unowned = SKILL_DEFS.filter((s) => !p.skills.includes(s.id));
    const pool = unowned.length > 0 ? unowned : SKILL_DEFS;
    const picked = pool[Math.floor(Math.random() * pool.length)].id;
    p.skills.push(picked);
    p.starterCooldown = 0;
    sendPlayerSkills(p, picked);
  } else {
    const slot = p.nextReplaceSlot % MAX_SKILL_SLOTS;
    const oldId = p.skills[slot];
    const candidates = SKILL_DEFS.filter((s) => s.id !== oldId);
    const picked = candidates[Math.floor(Math.random() * candidates.length)].id;
    p.skills[slot] = picked;
    p.nextReplaceSlot = (slot + 1) % MAX_SKILL_SLOTS;
    sendPlayerSkills(p, picked, slot);
  }
}

function createBotPlayer(spreadInterior: boolean): ServerPlayer {
  const slotId = allocateSlotId();
  const teamId: 5 | 6 = slotId % 2 === 0 ? 5 : 6;
  const spawn = getSpawnPoint(spreadInterior, isTeamMatch() ? teamId : undefined);
  const botIdx = nextBotNum++;
  const baseName = BOT_CALLSIGNS[(botIdx - 1) % BOT_CALLSIGNS.length];
  const suffix = String(((botIdx - 1) % 99) + 1).padStart(2, '0');
  const colorIndex = Math.floor(Math.random() * HULL_PALETTE.length);
  const starterSkill = SKILL_DEFS[Math.floor(Math.random() * SKILL_DEFS.length)].id;
  const starterGun = getWeaponDef('pulse_carbine');

  return {
    slotId,
    ws: null,
    isBot: true,
    name: `${baseName}-${suffix}`,
    colorIndex,
    starterSkill,
    starterCooldown: 0,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: spawn.yaw,
    roll: 0,
    pitch: 0,
    aimPitch: 0,
    shield: 100,
    boost: 100,
    score: spreadInterior ? Math.floor(Math.random() * 60) : 0,
    kills: 0,
    streak: 0,
    lastKillTime: 0,
    comboCount: 0,
    comboTimer: 0,
    arsenalTier: 0,
    hideSurvivalTick: 0,
    alive: true,
    grounded: true,
    respawnTimer: 0,
    dashTimer: 0,
    dashCooldown: 0,
    pulseTimer: 0,
    pulseCooldown: 0,
    hitCooldown: 0,
    invulnTimer: 1.5,
    aegisTimer: 0,
    overdriveTimer: 0,
    magnetTimer: 0,
    empSlowTimer: 0,
    turboTimer: 0,
    ringCooldownTimer: 0,
    scale: activeSpecialModeId === 'tiny_giants' ? 0.58 : 1.0,
    teamId,
    specialRole: isTeamMatch() ? teamId : 0,
    rankTier: rollRandomRank(),
    skills: [starterSkill],
    nextReplaceSlot: 0,
    weapons: isTeamMatch()
      ? [{ id: starterGun.id, durability: starterGun.maxDurability, maxDurability: starterGun.maxDurability }]
      : [],
    equippedWeaponSlot: 0,
    weaponCooldown: 0,
    attackAnimTimer: 0,
    lastDamagerId: null,
    lastDamagerTime: 0,
    botThinkTimer: Math.random() * 0.5,
    botTargetX: 0,
    botTargetZ: 0,
    botStrafe: Math.random() > 0.5 ? 0.25 : -0.25,
    botAimTargetId: null,
    botAimReactionTimer: 0,
    botAimYaw: spawn.yaw,
    botAimPitch: 0,
    input: {
      moveX: 0,
      moveZ: 1,
      yaw: spawn.yaw,
      pitch: 0,
      dashQueued: false,
      pulseQueued: false,
      jumpQueued: false,
    },
  };
}

function reconcileBots(silent = false): void {
  const { humans, bots } = getPilotCounts();
  const desiredBots = Math.max(0, MAX_PLAYERS - humans);

  if (bots < desiredBots) {
    const toAdd = desiredBots - bots;
    for (let i = 0; i < toAdd; i++) {
      const bot = createBotPlayer(silent);
      players.set(bot.slotId, bot);
      syncPlayerCache();
      if (!silent) {
        const counts = getPilotCounts();
        broadcastJson({
          type: 'player_join',
          slotId: bot.slotId,
          name: bot.name,
          colorIndex: bot.colorIndex,
          isBot: true,
          onlinePlayers: counts.humans,
          botCount: counts.bots,
        });
      }
    }
  } else if (bots > desiredBots) {
    let toRemove = bots - desiredBots;
    const botList = cachedPlayers.filter((p) => p.isBot).sort((a, b) => a.score - b.score);
    for (let i = 0; i < botList.length && toRemove > 0; i++) {
      const bot = botList[i];
      if (players.delete(bot.slotId)) {
        toRemove--;
        syncPlayerCache();
        if (!silent) {
          const counts = getPilotCounts();
          broadcastJson({
            type: 'player_leave',
            slotId: bot.slotId,
            onlinePlayers: counts.humans,
            botCount: counts.bots,
          });
        }
      }
    }
  }
}

reconcileBots(true);

function handleJoinArena(
  session: ClientSession,
  nameRaw: unknown,
  colorRaw: unknown,
  starterRaw: unknown,
): void {
  if (session.role === 'pilot' && session.slotId !== null) {
    const existing = players.get(session.slotId);
    if (existing) {
      existing.name = sanitizeName(nameRaw);
      existing.colorIndex = Math.max(0, Math.min(HULL_PALETTE.length - 1, Number(colorRaw) || 0));
      if (isValidSkillId(starterRaw)) {
        existing.starterSkill = starterRaw;
      }
      broadcastJson({
        type: 'player_meta',
        slotId: existing.slotId,
        name: existing.name,
        colorIndex: existing.colorIndex,
        isBot: false,
      });
      return;
    }
  }

  const preCounts = getPilotCounts();
  if (preCounts.humans >= MAX_PLAYERS) {
    sendJson(session.ws, {
      type: 'server_full',
      onlinePlayers: preCounts.humans,
      botCount: preCounts.bots,
      maxPlayers: MAX_PLAYERS,
    });
    return;
  }

  let solarCount = 0;
  let eclipseCount = 0;
  for (let i = 0; i < cachedPlayers.length; i++) {
    if (cachedPlayers[i].teamId === 5) solarCount++;
    else eclipseCount++;
  }
  const teamId: 5 | 6 = solarCount <= eclipseCount ? 5 : 6;

  const slotId = allocateSlotId();
  const spawn = getSpawnPoint(false, isTeamMatch() ? teamId : undefined);
  const colorIndex = Math.max(0, Math.min(HULL_PALETTE.length - 1, Number(colorRaw) || 0));
  const name = sanitizeName(nameRaw);
  const starterSkill = sanitizeSkillId(starterRaw);

  const player: ServerPlayer = {
    slotId,
    ws: session.ws,
    isBot: false,
    name,
    colorIndex,
    starterSkill,
    starterCooldown: 0,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: spawn.yaw,
    roll: 0,
    pitch: 0,
    aimPitch: 0,
    shield: 100,
    boost: 100,
    score: 0,
    kills: 0,
    streak: 0,
    lastKillTime: 0,
    comboCount: 0,
    comboTimer: 0,
    arsenalTier: 0,
    hideSurvivalTick: 0,
    alive: true,
    grounded: true,
    respawnTimer: 0,
    dashTimer: 0,
    dashCooldown: 0,
    pulseTimer: 0,
    pulseCooldown: 0,
    hitCooldown: 0,
    invulnTimer: 2.0,
    aegisTimer: 0,
    overdriveTimer: 0,
    magnetTimer: 0,
    empSlowTimer: 0,
    turboTimer: 0,
    ringCooldownTimer: 0,
    scale: activeSpecialModeId === 'tiny_giants' ? 0.58 : 1.0,
    teamId,
    specialRole: isTeamMatch() ? teamId : 0,
    rankTier: rollRandomRank(),
    skills: [starterSkill],
    nextReplaceSlot: 0,
    weapons: [],
    equippedWeaponSlot: 0,
    weaponCooldown: 0,
    attackAnimTimer: 0,
    lastDamagerId: null,
    lastDamagerTime: 0,
    botThinkTimer: 0,
    botTargetX: 0,
    botTargetZ: 0,
    botStrafe: 0,
    botAimTargetId: null,
    botAimReactionTimer: 0,
    botAimYaw: spawn.yaw,
    botAimPitch: 0,
    input: {
      moveX: 0,
      moveZ: 0,
      yaw: spawn.yaw,
      pitch: 0,
      dashQueued: false,
      pulseQueued: false,
      jumpQueued: false,
    },
  };

  applySpecialModeLoadout(player);
  if (activeSpecialModeId === 'hide_and_seek') {
    player.specialRole = 9;
    player.scale = 0.88;
    player.skills = (['phase_blink', 'shard_magnet', player.starterSkill] as SkillId[]).slice(0, MAX_SKILL_SLOTS);
  }

  players.set(slotId, player);
  syncPlayerCache();
  session.role = 'pilot';
  session.slotId = slotId;

  reconcileBots(false);
  const counts = getPilotCounts();

  sendJson(session.ws, {
    type: 'joined',
    slotId,
    name,
    colorIndex,
    starterSkill,
    onlinePlayers: counts.humans,
    botCount: counts.bots,
    maxPlayers: MAX_PLAYERS,
    mapId: activeMapId,
    terrainSeed,
    matchNumber,
    normalModeId: activeNormalModeId,
    specialModeId: activeSpecialModeId,
    modeHud: getModeHudPayload(),
    teamId: isTeamMatch() ? player.teamId : 0,
    roleBanner: getRoleBannerForPlayer(player),
    matchPhase,
    matchTimeRemaining,
    activeEventId,
    activeEventTimer,
    nextEventTimer,
    disasterPillars,
    skills: player.skills,
    nextReplaceSlot: player.nextReplaceSlot,
    weapons: player.weapons,
    equippedSlot: player.equippedWeaponSlot,
    groundWeapons: getGroundWeaponsPayload(),
    thrownProjectiles,
    fireZones,
    solarBall,
    kills: player.kills,
  });

  broadcastJson({
    type: 'player_join',
    slotId,
    name,
    colorIndex,
    isBot: false,
    onlinePlayers: counts.humans,
    botCount: counts.bots,
  });
}

function handleLeaveArena(session: ClientSession): void {
  if (session.role === 'pilot' && session.slotId !== null) {
    const slotId = session.slotId;
    if (players.delete(slotId)) {
      syncPlayerCache();
      reconcileBots(false);
      const counts = getPilotCounts();
      broadcastJson({
        type: 'player_leave',
        slotId,
        onlinePlayers: counts.humans,
        botCount: counts.bots,
      });
    }
    session.role = 'observer';
    session.slotId = null;
  }
}

function hitNextbot(
  nb: ServerNextbot,
  dmg: number,
  slowSeconds: number,
  kx: number,
  kz: number,
  attacker: ServerPlayer | null,
): void {
  if (nb.banishTimer > 0) return;
  nb.hp -= dmg;
  if (slowSeconds > 0) {
    const firstSlow = nb.slowTimer <= 0.1;
    nb.slowTimer = Math.max(nb.slowTimer, slowSeconds);
    if (attacker && attacker.alive && firstSlow) {
      attacker.score += 35;
    }
  }
  nb.vx += kx;
  nb.vz += kz;
  if (nb.hp <= 0) {
    nb.banishTimer = 7.5;
    nb.hp = nb.maxHp;
    nb.slowTimer = 0;
    if (attacker && attacker.alive) {
      attacker.score += 250;
      attacker.kills += 1;
      grantRandomSkill(attacker);
      if (!attacker.isBot) {
        broadcastJson({
          type: 'fx',
          kind: 'clash',
          x: nb.x,
          y: nb.y + 1,
          z: nb.z,
          actorId: attacker.slotId,
          amount: 250,
        });
      }
    }
  }
}

function detonateThrowable(proj: ServerThrownProjectile): void {
  const def = getWeaponDef(proj.weaponId);
  const rad = def.splashRadius || 14;
  const radSq = rad * rad;
  const attacker = players.get(proj.ownerSlotId) || null;

  broadcastJson({
    type: 'explosion',
    kind: proj.weaponId,
    x: proj.x,
    y: proj.y,
    z: proj.z,
    color: def.color,
    radius: rad,
    smoke: true,
  });

  if (proj.weaponId === 'molotov_cocktail') {
    fireZones.push({
      uid: nextZoneUid++,
      kind: 'molotov',
      x: proj.x,
      y: getEffectiveGroundY(proj.x, proj.z) + 0.25,
      z: proj.z,
      radius: rad * 0.9,
      remaining: 4.8,
      ownerSlotId: proj.ownerSlotId,
      ownerTeam: proj.ownerTeam,
      tickTimer: 0.25,
    });
  } else if (proj.weaponId === 'cryo_bomb') {
    fireZones.push({
      uid: nextZoneUid++,
      kind: 'cryo',
      x: proj.x,
      y: getEffectiveGroundY(proj.x, proj.z) + 0.25,
      z: proj.z,
      radius: rad * 0.85,
      remaining: 3.8,
      ownerSlotId: proj.ownerSlotId,
      ownerTeam: proj.ownerTeam,
      tickTimer: 0.35,
    });
  }

  for (let i = 0; i < cachedPlayers.length; i++) {
    const other = cachedPlayers[i];
    if (!other.alive) continue;
    if (attacker && other.slotId !== attacker.slotId && isTeamMatch() && other.teamId === attacker.teamId) {
      continue;
    }
    const dx = other.x - proj.x;
    const dy = other.y - proj.y;
    const dz = other.z - proj.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= radSq) {
      const dist = Math.sqrt(d2);
      const fall = Math.max(0.38, 1 - dist / (rad * 1.15));
      const nx = dist > 0.1 ? dx / dist : 0;
      const nz = dist > 0.1 ? dz / dist : 1;
      if (proj.weaponId === 'emp_grenade') {
        other.boost = Math.max(0, other.boost - 85);
        other.empSlowTimer = Math.max(other.empSlowTimer, 5.2);
      } else if (def.slowDuration > 0) {
        other.empSlowTimer = Math.max(other.empSlowTimer, def.slowDuration * 0.75);
      }
      applyDamage(other, def.damage * fall, nx * def.knockback, 14 * fall, nz * def.knockback, attacker);
    }
  }

  for (let sIdx = 0; sIdx < sentinels.length; sIdx++) {
    const s = sentinels[sIdx];
    if (s.state === 3 || !attacker) continue;
    const dx = s.x - proj.x;
    const dz = s.z - proj.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= radSq) {
      const dist = Math.sqrt(d2) || 1;
      damageSentinel(s, def.damage * 1.4, (dx / dist) * def.knockback, (dz / dist) * def.knockback, attacker);
    }
  }

  for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
    const nb = serverNextbots[nIdx];
    if (nb.banishTimer > 0) continue;
    const dx = nb.x - proj.x;
    const dz = nb.z - proj.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= (rad + 2.5) * (rad + 2.5)) {
      const dist = Math.sqrt(d2) || 1;
      hitNextbot(nb, def.damage * 1.35, def.slowDuration, (dx / dist) * def.knockback * 1.6, (dz / dist) * def.knockback * 1.6, attacker);
    }
  }

  if (solarBall) {
    const dx = solarBall.x - proj.x;
    const dz = solarBall.z - proj.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= radSq) {
      const dist = Math.sqrt(d2) || 1;
      solarBall.vx += (dx / dist) * 32;
      solarBall.vy += 12;
      solarBall.vz += (dz / dist) * 32;
      if (attacker) lastBallToucher = attacker;
    }
  }
}

function executeWeaponAttack(p: ServerPlayer, playerList: ServerPlayer[], pitchOverride?: number): void {
  if (matchPhase !== 'active' || !p.alive) return;
  if (p.weaponCooldown > 0) return;
  const slotIdx = p.equippedWeaponSlot;
  if (slotIdx < 0 || slotIdx >= p.weapons.length) return;
  const slot = p.weapons[slotIdx];
  const def = getWeaponDef(slot.id);

  p.weaponCooldown = def.cooldown;
  p.attackAnimTimer = 0.24;

  const aimPitch = Number.isFinite(pitchOverride) ? Math.max(-1.45, Math.min(1.45, Number(pitchOverride))) : p.aimPitch;

  // Deduct 1 durability ("NBT" per instance; breaks cleanly at 0)
  slot.durability -= 1;
  const broken = slot.durability <= 0;
  if (broken) {
    p.weapons.splice(slotIdx, 1);
    if (p.equippedWeaponSlot >= p.weapons.length) {
      p.equippedWeaponSlot = Math.max(0, p.weapons.length - 1);
    }
  }
  sendPlayerWeapons(p, undefined, broken ? def.id : undefined);

  // Single-use Throwable Launch (manual 3D aim pitch + yaw!)
  if (def.fireMode === 'throw') {
    const cosP = Math.cos(aimPitch);
    const dirX = Math.sin(p.yaw) * cosP;
    const dirY = Math.sin(aimPitch);
    const dirZ = Math.cos(p.yaw) * cosP;
    const throwSpeed = 40;
    const proj: ServerThrownProjectile = {
      uid: nextThrownUid++,
      weaponId: def.id,
      x: p.x + dirX * 1.8,
      y: p.y + 1.2 + dirY * 1.4,
      z: p.z + dirZ * 1.8,
      vx: dirX * throwSpeed + p.vx * 0.3,
      vy: Math.max(4.5, dirY * throwSpeed + 9.5),
      vz: dirZ * throwSpeed + p.vz * 0.3,
      color: def.color,
      ownerSlotId: p.slotId,
      ownerTeam: p.teamId,
      timer: def.id === 'molotov_cocktail' ? 1.8 : 1.55,
    };
    thrownProjectiles.push(proj);
    broadcastJson({
      type: 'weapon_fx',
      actorId: p.slotId,
      weaponId: def.id,
      category: 'throwable',
      rarity: def.rarity,
      color: def.color,
      x: p.x,
      y: p.y + 1.1,
      z: p.z,
      tx: proj.x + proj.vx * 0.6,
      ty: proj.y + 2,
      tz: proj.z + proj.vz * 0.6,
      yaw: p.yaw,
      splashRadius: def.splashRadius,
    });
    return;
  }

  const sizeBoost = Math.max(1, p.scale * 0.65);
  let aimYaw = p.yaw;
  const maxRange = def.range * (def.category === 'melee' ? sizeBoost : 1);

  // Smart soft-lock cone assistance (never targets teammates!)
  let bestTargetYaw = p.yaw;
  let bestTargetPitch = aimPitch;
  let bestScore = Infinity;
  const coneTolerance = def.category === 'melee' ? 0.95 : 0.22;

  for (let j = 0; j < playerList.length; j++) {
    const other = playerList[j];
    if (other.slotId === p.slotId || !other.alive) continue;
    if (isTeamMatch() && other.teamId === p.teamId) continue;
    const dx = other.x - p.x;
    const dy = other.y - p.y;
    const dz = other.z - p.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.4 || d > maxRange) continue;
    const ty = Math.atan2(dx, dz);
    let diff = (ty - p.yaw) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= coneTolerance && d < bestScore) {
      bestScore = d;
      bestTargetYaw = ty;
      bestTargetPitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
  }
  for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
    const nb = serverNextbots[nIdx];
    if (nb.banishTimer > 0) continue;
    const dx = nb.x - p.x;
    const dy = nb.y - p.y;
    const dz = nb.z - p.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.4 || d > maxRange) continue;
    const ty = Math.atan2(dx, dz);
    let diff = (ty - p.yaw) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= coneTolerance && d < bestScore) {
      bestScore = d;
      bestTargetYaw = ty;
      bestTargetPitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
  }

  let effectivePitch = aimPitch;
  if (bestScore < Infinity && def.category === 'ranged') {
    aimYaw = bestTargetYaw;
    effectivePitch = bestTargetPitch;
  }

  const cosP = Math.cos(effectivePitch);
  const ax = Math.sin(aimYaw) * cosP;
  const ay = Math.sin(effectivePitch);
  const az = Math.cos(aimYaw) * cosP;
  let hitDist = maxRange;
  let hitPointX = p.x + ax * maxRange;
  let hitPointY = p.y + 0.8 + ay * maxRange;
  let hitPointZ = p.z + az * maxRange;

  if (def.category === 'melee') {
    p.vx += Math.sin(aimYaw) * (def.rarity === 'mythic' ? 16 : 9);
    p.vz += Math.cos(aimYaw) * (def.rarity === 'mythic' ? 16 : 9);

    for (let j = 0; j < playerList.length; j++) {
      const other = playerList[j];
      if (other.slotId === p.slotId || !other.alive) continue;
      if (isTeamMatch() && other.teamId === p.teamId) continue;
      const dx = other.x - p.x;
      const dz = other.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > maxRange || Math.abs(other.y - p.y) > 5.5) continue;
      let diff = (Math.atan2(dx, dz) - aimYaw) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= 1.15 || dist < 3.4) {
        const nx = dist > 0.05 ? dx / dist : ax;
        const nz = dist > 0.05 ? dz / dist : az;
        if (def.slowDuration > 0) other.empSlowTimer = Math.max(other.empSlowTimer, def.slowDuration * 0.65);
        applyDamage(other, def.damage, nx * def.knockback, 9, nz * def.knockback, p);
      }
    }

    for (let sIdx = 0; sIdx < sentinels.length; sIdx++) {
      const s = sentinels[sIdx];
      if (s.state === 3) continue;
      const dx = s.x - p.x;
      const dz = s.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= maxRange + 1.5 && dist > 0.05) {
        damageSentinel(s, def.damage * 1.4, (dx / dist) * def.knockback, (dz / dist) * def.knockback, p);
      }
    }

    for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
      const nb = serverNextbots[nIdx];
      if (nb.banishTimer > 0) continue;
      const dx = nb.x - p.x;
      const dz = nb.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= maxRange + 2.2 && dist > 0.05) {
        hitNextbot(nb, def.damage * 1.5, def.slowDuration, (dx / dist) * def.knockback * 1.6, (dz / dist) * def.knockback * 1.6, p);
      }
    }

    if (solarBall) {
      const dx = solarBall.x - p.x;
      const dz = solarBall.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= maxRange + 2.5 && dist > 0.05) {
        solarBall.vx += (dx / dist) * 34;
        solarBall.vy += 9;
        solarBall.vz += (dz / dist) * 34;
        lastBallToucher = p;
      }
    }
  } else {
    // 3D Raycast Hit Detection (blocked cleanly by solid apartment piers & floor slabs!)
    const wallHit = raycastApartments(p.x, p.y + 0.8, p.z, ax, ay, az, maxRange, activeMapId, terrainSeed);
    const rayRange = wallHit !== null ? Math.min(maxRange, wallHit) : maxRange;
    hitDist = rayRange;
    hitPointX = p.x + ax * rayRange;
    hitPointY = p.y + 0.8 + ay * rayRange;
    hitPointZ = p.z + az * rayRange;

    const widthTolerance = def.id === 'scatter_cannon' || def.id === 'flak_autocannon' ? 5.2 : 3.2;
    let directVictim: ServerPlayer | null = null;

    for (let j = 0; j < playerList.length; j++) {
      const other = playerList[j];
      if (other.slotId === p.slotId || !other.alive) continue;
      if (isTeamMatch() && other.teamId === p.teamId) continue;
      const rx = other.x - p.x;
      const ry = other.y - (p.y + 0.8);
      const rz = other.z - p.z;
      const proj = rx * ax + ry * ay + rz * az;
      if (proj > 0.5 && proj <= rayRange) {
        const px = rx - ax * proj;
        const py = ry - ay * proj;
        const pz = rz - az * proj;
        const perp = Math.hypot(px, py * 0.55, pz);
        if (perp <= widthTolerance * Math.max(1, other.scale * 0.7)) {
          if (proj < hitDist) {
            hitDist = proj;
            hitPointX = other.x;
            hitPointY = other.y + 0.6;
            hitPointZ = other.z;
            directVictim = other;
          }
          if (def.splashRadius <= 0) {
            if (def.slowDuration > 0) {
              other.empSlowTimer = Math.max(other.empSlowTimer, def.slowDuration * 0.7);
            }
            const distScale = def.id === 'scatter_cannon' ? Math.max(0.45, 1 - proj / (maxRange * 1.2)) : 1;
            applyDamage(other, def.damage * distScale, ax * def.knockback, 6, az * def.knockback, p);
          }
        }
      }
    }

    for (let sIdx = 0; sIdx < sentinels.length; sIdx++) {
      const s = sentinels[sIdx];
      if (s.state === 3) continue;
      const rx = s.x - p.x;
      const ry = s.y - (p.y + 0.8);
      const rz = s.z - p.z;
      const proj = rx * ax + ry * ay + rz * az;
      if (proj > 0.5 && proj <= rayRange) {
        const perp = Math.hypot(rx - ax * proj, ry - ay * proj, rz - az * proj);
        if (perp <= widthTolerance + 1.2) {
          if (proj < hitDist) {
            hitDist = proj;
            hitPointX = s.x;
            hitPointY = s.y;
            hitPointZ = s.z;
          }
          damageSentinel(s, def.damage * 1.25, ax * def.knockback, az * def.knockback, p);
        }
      }
    }

    for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
      const nb = serverNextbots[nIdx];
      if (nb.banishTimer > 0) continue;
      const rx = nb.x - p.x;
      const ry = nb.y - (p.y + 0.8);
      const rz = nb.z - p.z;
      const proj = rx * ax + ry * ay + rz * az;
      if (proj > 0.5 && proj <= rayRange) {
        const perp = Math.hypot(rx - ax * proj, ry - ay * proj, rz - az * proj);
        if (perp <= widthTolerance + 1.8) {
          if (proj < hitDist) {
            hitDist = proj;
            hitPointX = nb.x;
            hitPointY = nb.y;
            hitPointZ = nb.z;
          }
          hitNextbot(nb, def.damage * 1.25, def.slowDuration, ax * def.knockback * 1.5, az * def.knockback * 1.5, p);
        }
      }
    }

    if (solarBall) {
      const rx = solarBall.x - p.x;
      const ry = solarBall.y - (p.y + 0.8);
      const rz = solarBall.z - p.z;
      const proj = rx * ax + ry * ay + rz * az;
      if (proj > 0.5 && proj <= rayRange) {
        const perp = Math.hypot(rx - ax * proj, ry - ay * proj, rz - az * proj);
        if (perp <= 4.2) {
          hitDist = Math.min(hitDist, proj);
          hitPointX = solarBall.x;
          hitPointY = solarBall.y;
          hitPointZ = solarBall.z;
          solarBall.vx += ax * 24;
          solarBall.vy += Math.max(4, ay * 16 + 5);
          solarBall.vz += az * 24;
          lastBallToucher = p;
        }
      }
    }

    if (def.splashRadius > 0) {
      if (!directVictim && hitDist >= maxRange) {
        const clampedImpact = clampToArena(hitPointX, hitPointZ, 1.5, activeMapId, terrainSeed, hitPointY);
        hitPointX = clampedImpact.x;
        hitPointZ = clampedImpact.z;
        hitPointY = Math.max(hitPointY, getEffectiveGroundY(hitPointX, hitPointZ, hitPointY) + 0.6);
      }
      for (let j = 0; j < playerList.length; j++) {
        const other = playerList[j];
        if (other.slotId === p.slotId || !other.alive) continue;
        if (isTeamMatch() && other.teamId === p.teamId) continue;
        const dx = other.x - hitPointX;
        const dz = other.z - hitPointZ;
        const d = Math.hypot(dx, dz);
        if (d <= def.splashRadius) {
          const fall = Math.max(0.4, 1 - d / (def.splashRadius * 1.2));
          const nx = d > 0.1 ? dx / d : ax;
          const nz = d > 0.1 ? dz / d : az;
          if (def.slowDuration > 0) {
            other.empSlowTimer = Math.max(other.empSlowTimer, def.slowDuration * 0.65);
          }
          applyDamage(other, def.damage * fall, nx * def.knockback, 10 * fall, nz * def.knockback, p);
        }
      }
      for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
        const nb = serverNextbots[nIdx];
        if (nb.banishTimer > 0) continue;
        const dx = nb.x - hitPointX;
        const dz = nb.z - hitPointZ;
        const d = Math.hypot(dx, dz);
        if (d <= def.splashRadius + 2) {
          const nx = d > 0.1 ? dx / d : ax;
          const nz = d > 0.1 ? dz / d : az;
          hitNextbot(nb, def.damage, def.slowDuration, nx * def.knockback * 1.6, nz * def.knockback * 1.6, p);
        }
      }
    }
  }

  const emitFx = !p.isBot || botFxBudget-- > 0;
  if (emitFx) {
    broadcastJson({
      type: 'weapon_fx',
      actorId: p.slotId,
      weaponId: def.id,
      category: def.category,
      rarity: def.rarity,
      color: def.color,
      x: p.x,
      y: p.y + 0.7,
      z: p.z,
      tx: hitPointX,
      ty: hitPointY,
      tz: hitPointZ,
      yaw: aimYaw,
      splashRadius: def.splashRadius,
    });
  }
}

function executeSkill(
  p: ServerPlayer,
  slotIndex: number,
  playerList: ServerPlayer[],
  crystalUpdates: Array<{ id: number; active: boolean }>,
): void {
  if (matchPhase !== 'active' || !p.alive) return;
  if (slotIndex < 0 || slotIndex >= p.skills.length) return;

  const [skillId] = p.skills.splice(slotIndex, 1);
  if (p.nextReplaceSlot >= p.skills.length) {
    p.nextReplaceSlot = 0;
  }
  if (p.skills.length === 0) {
    p.starterCooldown = STARTER_RECHARGE_SECONDS;
  }
  sendPlayerSkills(p);

  const emitSkillFx = !p.isBot || botFxBudget-- > 0;
  const fwdX = Math.sin(p.yaw);
  const fwdZ = Math.cos(p.yaw);
  const sizeBoost = Math.max(1, p.scale * 0.65);

  if (skillId === 'nova_blast') {
    const rad = 18.5 * sizeBoost;
    for (let j = 0; j < playerList.length; j++) {
      const other = playerList[j];
      if (other.slotId === p.slotId || !other.alive) continue;
      if (isTeamMatch() && other.teamId === p.teamId) continue;
      const dx = other.x - p.x;
      const dz = other.z - p.z;
      const dist = Math.hypot(dx, other.y - p.y, dz);
      if (dist < rad && dist > 0.01) {
        const falloff = 1 - dist / rad;
        const nx = dx / Math.max(0.1, Math.hypot(dx, dz));
        const nz = dz / Math.max(0.1, Math.hypot(dx, dz));
        applyDamage(
          other,
          28 * falloff + 24,
          nx * (34 * falloff + 16),
          13 * falloff + 6,
          nz * (34 * falloff + 16),
          p,
        );
      }
    }
    for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
      const nb = serverNextbots[nIdx];
      if (nb.banishTimer > 0) continue;
      const dx = nb.x - p.x;
      const dz = nb.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < rad + 2 && dist > 0.05) {
        hitNextbot(nb, 65, 2.8, (dx / dist) * 44, (dz / dist) * 44, p);
      }
    }
    for (let cIdx = 0; cIdx < crystals.length; cIdx++) {
      const c = crystals[cIdx];
      if (!c.active) continue;
      if (Math.hypot(c.spawn.x - p.x, c.spawn.z - p.z) < rad) {
        collectCrystal(p, c, cIdx, crystalUpdates);
      }
    }
    if (emitSkillFx) {
      broadcastJson({ type: 'skill_fx', kind: 'nova_blast', actorId: p.slotId, x: p.x, y: p.y + 0.6, z: p.z });
    }
  } else if (skillId === 'phase_blink') {
    const ox = p.x;
    const oy = p.y;
    const oz = p.z;
    const clamped = clampToArena(p.x + fwdX * 24, p.z + fwdZ * 24, 1.8 * p.scale, activeMapId, terrainSeed);
    p.x = clamped.x;
    p.z = clamped.z;
    p.y = Math.max(p.y, getEffectiveGroundY(p.x, p.z) + 1.4 * p.scale);
    p.vx = fwdX * 34;
    p.vz = fwdZ * 34;
    p.invulnTimer = Math.max(p.invulnTimer, 0.85);
    if (emitSkillFx) {
      broadcastJson({
        type: 'skill_fx',
        kind: 'phase_blink',
        actorId: p.slotId,
        x: ox,
        y: oy + 0.6,
        z: oz,
        tx: p.x,
        ty: p.y + 0.6,
        tz: p.z,
      });
    }
  } else if (skillId === 'aegis_dome') {
    p.shield = Math.min(100, p.shield + 45);
    p.aegisTimer = 4.4;
    if (emitSkillFx) {
      broadcastJson({ type: 'skill_fx', kind: 'aegis_dome', actorId: p.slotId, x: p.x, y: p.y + 0.6, z: p.z });
    }
  } else if (skillId === 'vortex_snare') {
    const cx = p.x + fwdX * 10;
    const cz = p.z + fwdZ * 10;
    const cy = getEffectiveGroundY(cx, cz) + 1.4;
    for (let j = 0; j < playerList.length; j++) {
      const other = playerList[j];
      if (other.slotId === p.slotId || !other.alive) continue;
      if (isTeamMatch() && other.teamId === p.teamId) continue;
      const dx = cx - other.x;
      const dz = cz - other.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 22 && dist > 0.1) {
        const nx = dx / dist;
        const nz = dz / dist;
        applyDamage(other, 28, nx * 28, 8, nz * 28, p);
      }
    }
    for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
      const nb = serverNextbots[nIdx];
      if (nb.banishTimer > 0) continue;
      const dx = cx - nb.x;
      const dz = cz - nb.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 24 && dist > 0.1) {
        hitNextbot(nb, 42, 4.4, (dx / dist) * 32, (dz / dist) * 32, p);
      }
    }
    for (let cIdx = 0; cIdx < crystals.length; cIdx++) {
      const c = crystals[cIdx];
      if (!c.active) continue;
      if (Math.hypot(c.spawn.x - cx, c.spawn.z - cz) < 22) {
        collectCrystal(p, c, cIdx, crystalUpdates);
      }
    }
    if (emitSkillFx) {
      broadcastJson({ type: 'skill_fx', kind: 'vortex_snare', actorId: p.slotId, x: cx, y: cy, z: cz });
    }
  } else if (skillId === 'solar_lance') {
    const maxRange = 46;
    let aimYaw = p.yaw;
    let bestConeScore = Infinity;
    for (let j = 0; j < playerList.length; j++) {
      const other = playerList[j];
      if (other.slotId === p.slotId || !other.alive) continue;
      if (isTeamMatch() && other.teamId === p.teamId) continue;
      const dx = other.x - p.x;
      const dz = other.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5 || d > maxRange) continue;
      const targetYaw = Math.atan2(dx, dz);
      let angDiff = (targetYaw - p.yaw) % (Math.PI * 2);
      if (angDiff > Math.PI) angDiff -= Math.PI * 2;
      if (angDiff < -Math.PI) angDiff += Math.PI * 2;
      if (Math.abs(angDiff) <= 0.24 && d < bestConeScore) {
        bestConeScore = d;
        aimYaw = targetYaw;
      }
    }
    const ax = Math.sin(aimYaw);
    const az = Math.cos(aimYaw);

    for (let j = 0; j < playerList.length; j++) {
      const other = playerList[j];
      if (other.slotId === p.slotId || !other.alive) continue;
      if (isTeamMatch() && other.teamId === p.teamId) continue;
      const rx = other.x - p.x;
      const rz = other.z - p.z;
      const proj = rx * ax + rz * az;
      if (proj > 0 && proj <= maxRange) {
        const perp = Math.abs(rx * -az + rz * ax);
        if (perp <= 4.6 * Math.max(1, other.scale * 0.7) && Math.abs(other.y - p.y) < 7.5) {
          const lanceDmg = p.specialRole === 3 ? 85 : 56;
          applyDamage(other, lanceDmg, ax * 32, 9, az * 32, p);
        }
      }
    }
    for (let sIdx = 0; sIdx < sentinels.length; sIdx++) {
      const s = sentinels[sIdx];
      if (s.state === 3) continue;
      const rx = s.x - p.x;
      const rz = s.z - p.z;
      const proj = rx * ax + rz * az;
      if (proj > 0 && proj <= maxRange) {
        const perp = Math.abs(rx * -az + rz * ax);
        if (perp <= 4.8) {
          damageSentinel(s, 80, ax * 26, az * 26, p);
        }
      }
    }
    for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
      const nb = serverNextbots[nIdx];
      if (nb.banishTimer > 0) continue;
      const rx = nb.x - p.x;
      const rz = nb.z - p.z;
      const proj = rx * ax + rz * az;
      if (proj > 0 && proj <= maxRange) {
        const perp = Math.abs(rx * -az + rz * ax);
        if (perp <= 5.2) {
          hitNextbot(nb, 92, 2.8, ax * 38, az * 38, p);
        }
      }
    }
    if (emitSkillFx) {
      broadcastJson({
        type: 'skill_fx',
        kind: 'solar_lance',
        actorId: p.slotId,
        x: p.x,
        y: p.y + 0.6,
        z: p.z,
        tx: p.x + ax * maxRange,
        ty: p.y + 0.6,
        tz: p.z + az * maxRange,
        yaw: aimYaw,
      });
    }
  } else if (skillId === 'overdrive') {
    p.overdriveTimer = 5.2;
    p.boost = 100;
    p.dashCooldown = 0;
    if (emitSkillFx) {
      broadcastJson({ type: 'skill_fx', kind: 'overdrive', actorId: p.slotId, x: p.x, y: p.y + 0.6, z: p.z });
    }
  } else if (skillId === 'emp_shock') {
    for (let j = 0; j < playerList.length; j++) {
      const other = playerList[j];
      if (other.slotId === p.slotId || !other.alive) continue;
      if (isTeamMatch() && other.teamId === p.teamId) continue;
      const dx = other.x - p.x;
      const dz = other.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 17 * sizeBoost) {
        other.boost = Math.max(0, other.boost - 70);
        other.empSlowTimer = 3.2;
        const nx = dist > 0.1 ? dx / dist : 0;
        const nz = dist > 0.1 ? dz / dist : 0;
        applyDamage(other, 30, nx * 16, 6, nz * 16, p);
      }
    }
    for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
      const nb = serverNextbots[nIdx];
      if (nb.banishTimer > 0) continue;
      const dx = nb.x - p.x;
      const dz = nb.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 21 * sizeBoost && dist > 0.05) {
        hitNextbot(nb, 48, 5.2, (dx / dist) * 24, (dz / dist) * 24, p);
      }
    }
    if (emitSkillFx) {
      broadcastJson({ type: 'skill_fx', kind: 'emp_shock', actorId: p.slotId, x: p.x, y: p.y + 0.6, z: p.z });
    }
  } else if (skillId === 'shard_magnet') {
    p.magnetTimer = 6.5;
    if (emitSkillFx) {
      broadcastJson({ type: 'skill_fx', kind: 'shard_magnet', actorId: p.slotId, x: p.x, y: p.y + 0.6, z: p.z });
    }
  }
}

function handleDropWeapon(p: ServerPlayer, slotIndexArg?: number): void {
  if (!p.alive || p.weapons.length === 0) return;
  const targetIdx =
    Number.isInteger(slotIndexArg) && Number(slotIndexArg) >= 0 && Number(slotIndexArg) < p.weapons.length
      ? Number(slotIndexArg)
      : Math.max(0, Math.min(p.weapons.length - 1, p.equippedWeaponSlot));
  const [dropped] = p.weapons.splice(targetIdx, 1);
  if (p.equippedWeaponSlot >= p.weapons.length) {
    p.equippedWeaponSlot = Math.max(0, p.weapons.length - 1);
  }
  const cosP = Math.cos(p.aimPitch);
  const fx = Math.sin(p.yaw) * cosP;
  const fz = Math.cos(p.yaw) * cosP;
  // Launch dropped weapon forward like a thrown grenade with a 1.25s dropper pickup lock!
  const item = spawnGroundWeaponAt(
    dropped.id,
    p.x + fx * 2.4,
    p.z + fz * 2.4,
    dropped.durability,
    dropped.maxDurability,
    getWeaponDef(dropped.id).rarity === 'mythic',
    true,
    fx * 27 + p.vx * 0.35,
    10.5 + Math.sin(p.aimPitch) * 12,
    fz * 27 + p.vz * 0.35,
    p.slotId,
    1.25,
    p.y + 1.1,
  );
  sendPlayerWeapons(p);
  broadcastJson({ type: 'ground_weapons_delta', added: [item], removed: [] });
}

wss.on('connection', (ws: WebSocket) => {
  const session: ClientSession = {
    ws,
    role: 'observer',
    slotId: null,
    votedMap: null,
    votedMode: null,
  };
  sessions.set(ws, session);
  const counts = getPilotCounts();

  sendJson(ws, {
    type: 'welcome',
    maxPlayers: MAX_PLAYERS,
    onlinePlayers: counts.humans,
    botCount: counts.bots,
    mapId: activeMapId,
    terrainSeed,
    matchNumber,
    normalModeId: activeNormalModeId,
    specialModeId: activeSpecialModeId,
    modeHud: getModeHudPayload(),
    matchPhase,
    matchTimeRemaining,
    activeEventId,
    activeEventTimer,
    nextEventTimer,
    disasterPillars,
    playersMeta: getPlayersMetaList(),
    inactiveCrystals: getActiveCrystalMask(),
    inactiveOrbs: getInactiveOrbMask(),
    pylons: getPylonsPayload(),
    groundWeapons: getGroundWeaponsPayload(),
    thrownProjectiles,
    fireZones,
    solarBall,
    scores: matchPhase === 'postmatch' ? lastMatchScores : undefined,
    winningTeam: matchPhase === 'postmatch' ? winningTeamId : undefined,
    solarKills,
    eclipseKills,
    mapVotes: getMapVotesPayload(),
    modeVoteOptions: matchPhase === 'postmatch' ? modeVoteOptions : undefined,
    modeVotes: matchPhase === 'postmatch' ? getModeVotesPayload() : undefined,
  });

  ws.on('message', (rawData, isBinary) => {
    if (isBinary) return;
    try {
      const msg = JSON.parse(rawData.toString());
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'ping') {
        sendJson(ws, { type: 'pong', t: msg.t });
        return;
      }

      if (msg.type === 'join') {
        handleJoinArena(session, msg.name, msg.colorIndex, msg.starterSkill);
        return;
      }

      if (msg.type === 'leave_arena') {
        handleLeaveArena(session);
        return;
      }

      if (msg.type === 'vote_map' && typeof msg.mapId === 'string') {
        const valid = MAP_DEFS.some((m) => m.id === msg.mapId);
        if (valid) {
          session.votedMap = msg.mapId as MapId;
          broadcastJson({
            type: 'map_votes',
            votes: getMapVotesPayload(),
          });
        }
        return;
      }

      if (msg.type === 'vote_mode' && typeof msg.key === 'string') {
        const valid = modeVoteOptions.some((o) => o.key === msg.key);
        if (valid) {
          session.votedMode = msg.key;
          broadcastJson({
            type: 'mode_votes',
            votes: getModeVotesPayload(),
          });
        }
        return;
      }

      if (msg.type === 'use_skill' && session.role === 'pilot' && session.slotId !== null) {
        const p = players.get(session.slotId);
        if (p && Number.isInteger(msg.slotIndex)) {
          crystalUpdatesBuf.length = 0;
          executeSkill(p, Number(msg.slotIndex), cachedPlayers, crystalUpdatesBuf);
          if (crystalUpdatesBuf.length > 0) {
            broadcastJson({ type: 'crystals_sync', updates: crystalUpdatesBuf });
          }
        }
        return;
      }

      if (msg.type === 'use_weapon' && session.role === 'pilot' && session.slotId !== null) {
        const p = players.get(session.slotId);
        if (p) {
          if (Number.isFinite(msg.yaw)) p.yaw = Number(msg.yaw);
          executeWeaponAttack(p, cachedPlayers, Number.isFinite(msg.pitch) ? Number(msg.pitch) : undefined);
        }
        return;
      }

      if (msg.type === 'select_weapon' && session.role === 'pilot' && session.slotId !== null) {
        const p = players.get(session.slotId);
        const idx = Number(msg.slotIndex);
        if (p && Number.isInteger(idx) && idx >= 0 && idx < p.weapons.length) {
          p.equippedWeaponSlot = idx;
          sendPlayerWeapons(p);
        }
        return;
      }

      if (msg.type === 'drop_weapon' && session.role === 'pilot' && session.slotId !== null) {
        const p = players.get(session.slotId);
        if (p) {
          handleDropWeapon(p, Number.isInteger(msg.slotIndex) ? Number(msg.slotIndex) : undefined);
        }
        return;
      }

      if (msg.type === 'update_meta' && session.role === 'pilot' && session.slotId !== null) {
        const p = players.get(session.slotId);
        if (p) {
          if (msg.name !== undefined) p.name = sanitizeName(msg.name);
          if (msg.colorIndex !== undefined) {
            p.colorIndex = Math.max(0, Math.min(HULL_PALETTE.length - 1, Number(msg.colorIndex) || 0));
          }
          if (isValidSkillId(msg.starterSkill)) {
            p.starterSkill = msg.starterSkill;
          }
          broadcastJson({
            type: 'player_meta',
            slotId: p.slotId,
            name: p.name,
            colorIndex: p.colorIndex,
            isBot: false,
          });
        }
        return;
      }

      if (msg.type === 'input' && session.role === 'pilot' && session.slotId !== null) {
        const p = players.get(session.slotId);
        if (!p) return;
        const mx = Number(msg.moveX) || 0;
        const mz = Number(msg.moveZ) || 0;
        const len = Math.hypot(mx, mz);
        p.input.moveX = len > 1 ? mx / len : Math.max(-1, Math.min(1, mx));
        p.input.moveZ = len > 1 ? mz / len : Math.max(-1, Math.min(1, mz));
        if (Number.isFinite(msg.yaw)) {
          p.input.yaw = Number(msg.yaw);
        }
        if (Number.isFinite(msg.pitch)) {
          p.input.pitch = Math.max(-1.45, Math.min(1.45, Number(msg.pitch)));
          p.aimPitch = p.input.pitch;
        }
        if (msg.dash) p.input.dashQueued = true;
        if (msg.pulse) p.input.pulseQueued = true;
        if (msg.jump) p.input.jumpQueued = true;
      }
    } catch {
      // Ignore malformed payloads
    }
  });

  ws.on('close', () => {
    handleLeaveArena(session);
    sessions.delete(ws);
    if (matchPhase === 'postmatch') {
      broadcastJson({ type: 'map_votes', votes: getMapVotesPayload() });
    }
  });

  ws.on('error', () => {
    handleLeaveArena(session);
    sessions.delete(ws);
  });
});

function collectCrystal(
  p: ServerPlayer,
  c: ServerCrystal,
  cIdx: number,
  crystalUpdates: Array<{ id: number; active: boolean }>,
): void {
  c.active = false;
  const fastRespawn =
    activeSpecialModeId === 'gold_rush_madness'
      ? 0.25
      : activeEventId === 'gold_rush'
      ? 0.32
      : activeEventId === 'solar_storm'
      ? 0.38
      : 1;
  c.respawnTimer = (c.spawn.kind === 1 ? 13 : 6.5) * fastRespawn;

  const eventMult = activeEventId === 'gold_rush' ? 3 : activeEventId === 'solar_storm' ? 2 : 1;
  const specialMult =
    activeSpecialModeId === 'gold_rush_madness'
      ? 4
      : activeSpecialModeId === 'juggernaut_tag' && p.specialRole === 1
      ? 2
      : 1;
  const magnetMult = p.magnetTimer > 0 ? 1.5 : 1;
  const gain = Math.round(c.spawn.value * eventMult * specialMult * magnetMult);

  p.score += gain;
  p.boost = Math.min(100, p.boost + (c.spawn.kind === 1 ? 40 : 18));
  p.shield = Math.min(100, p.shield + (c.spawn.kind === 1 ? 14 : 5));
  crystalUpdates.push({ id: cIdx, active: false });

  if (p.ws) {
    sendJson(p.ws, {
      type: 'pickup',
      value: gain,
      kind: c.spawn.kind,
    });
  }
}

function collectPowerOrb(
  p: ServerPlayer,
  orb: ServerPowerOrb,
  orbIdx: number,
  orbUpdates: Array<{ id: number; active: boolean }>,
): void {
  orb.active = false;
  orb.respawnTimer =
    activeSpecialModeId === 'gold_rush_madness' || activeEventId === 'gold_rush' ? 5.0 : 12.0;
  orbUpdates.push({ id: orbIdx, active: false });

  p.boost = Math.min(100, p.boost + 40);
  if (p.skills.length < MAX_SKILL_SLOTS) {
    grantRandomSkill(p);
    p.score += 35;
  } else {
    p.score += 75;
    p.shield = Math.min(100, p.shield + 35);
    grantRandomSkill(p);
  }

  if (!p.isBot || botFxBudget-- > 0) {
    broadcastJson({
      type: 'fx',
      kind: 'orb_pickup',
      x: orb.def.x,
      y: orb.def.y,
      z: orb.def.z,
      actorId: p.slotId,
      amount: 35,
    });
  }
}

function damageSentinel(
  s: ServerSentinel,
  dmg: number,
  vx: number,
  vz: number,
  attacker: ServerPlayer,
): void {
  s.vx += vx;
  s.vz += vz;
  s.hp -= dmg;
  if (attacker.ws) {
    sendJson(attacker.ws, {
      type: 'combat_feedback',
      kind: 'hit',
      dmg: Math.round(dmg),
      x: s.x,
      y: s.y + 1.5,
      z: s.z,
    });
  }
  if (s.hp <= 0) {
    s.state = 3;
    s.timer = activeSpecialModeId === 'boss_raid_sentinels' ? 7.5 : 11;
    s.hp = 0;
    const isRaid = activeSpecialModeId === 'boss_raid_sentinels';
    const reward = activeEventId === 'sentinel_surge' || isRaid ? 360 : 140;
    attacker.score += reward;
    attacker.boost = Math.min(100, attacker.boost + 40);
    attacker.shield = Math.min(100, attacker.shield + 20);
    grantRandomSkill(attacker);
    if (isRaid && attacker.weapons.length < MAX_WEAPON_SLOTS && Math.random() < 0.45) {
      const pool = Math.random() < 0.35 ? MYTHIC_WEAPONS : REGULAR_WEAPONS;
      const wDef = pool[Math.floor(Math.random() * pool.length)];
      attacker.weapons.push({ id: wDef.id, durability: wDef.maxDurability, maxDurability: wDef.maxDurability });
      attacker.equippedWeaponSlot = attacker.weapons.length - 1;
      sendPlayerWeapons(attacker, wDef.id);
    }
    broadcastJson({
      type: 'explosion',
      kind: 'death',
      x: s.x,
      y: s.y,
      z: s.z,
      color: '#ef4444',
      radius: 8,
      smoke: true,
    });
    broadcastJson({
      type: 'fx',
      kind: 'clash',
      x: s.x,
      y: s.y,
      z: s.z,
      actorId: attacker.slotId,
      amount: reward,
    });
  }
}

function shatterPlayer(victim: ServerPlayer, attacker: ServerPlayer | null): void {
  if (!victim.alive) return;
  victim.alive = false;
  victim.shield = 0;
  victim.streak = 0;
  victim.comboCount = 0;
  victim.comboTimer = 0;
  victim.respawnTimer = RESPAWN_DURATION_SECONDS;

  // Realistic smoky explosion on EVERY player & bot death!
  const deathColor = HULL_PALETTE[victim.colorIndex]?.hex || '#E68A1E';
  if (!victim.isBot || !attacker?.isBot || botFxBudget-- > 0) {
    broadcastJson({
      type: 'explosion',
      kind: 'death',
      x: victim.x,
      y: victim.y + 0.8,
      z: victim.z,
      color: deathColor,
      radius: 7.5 * victim.scale,
      smoke: true,
    });
  }

  // Drop carried weapons onto the ground preserving exact remaining NBT durability!
  if (
    victim.weapons.length > 0 &&
    activeSpecialModeId !== 'sniper_duel' &&
    !(activeSpecialModeId === 'none' && activeNormalModeId === 'arsenal_escalate')
  ) {
    const droppedItems: GroundWeaponSync[] = [];
    const count = victim.weapons.length;
    for (let wIdx = 0; wIdx < count; wIdx++) {
      const slot = victim.weapons[wIdx];
      const def = getWeaponDef(slot.id);
      const isMythic = def.rarity === 'mythic';
      if (victim.isBot && !isMythic && groundWeapons.size >= MAX_GROUND_WEAPONS) {
        continue;
      }
      const scatterAngle = (wIdx / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.6;
      const scatterDist = count === 1 ? 0.5 : 3.2;
      const item = spawnGroundWeaponAt(
        slot.id,
        victim.x + Math.cos(scatterAngle) * scatterDist,
        victim.z + Math.sin(scatterAngle) * scatterDist,
        slot.durability,
        slot.maxDurability,
        isMythic,
        true,
        Math.cos(scatterAngle) * 11,
        7.5,
        Math.sin(scatterAngle) * 11,
        victim.slotId,
        0.5,
        victim.y + 0.9,
      );
      droppedItems.push(item);
    }
    const evictedUids = evictOldestGroundWeapons(MAX_GROUND_WEAPONS);
    victim.weapons = [];
    victim.equippedWeaponSlot = 0;
    sendPlayerWeapons(victim);
    if (droppedItems.length > 0 || evictedUids.length > 0) {
      broadcastJson({ type: 'ground_weapons_delta', added: droppedItems, removed: evictedUids });
    }
  } else if (victim.weapons.length > 0) {
    victim.weapons = [];
    victim.equippedWeaponSlot = 0;
    sendPlayerWeapons(victim);
  }

  const lostScore = Math.floor(victim.score * 0.42);
  victim.score = Math.max(0, victim.score - lostScore);

  const involvesHuman = !victim.isBot || Boolean(attacker && !attacker.isBot);
  const vLabel = victim.isBot ? `[BOT] ${victim.name}` : victim.name;

  if (attacker && attacker.slotId !== victim.slotId) {
    if (isTeamMatch()) {
      if (attacker.teamId === 5) solarKills += 1;
      else eclipseKills += 1;
    }

    if (serverTime - attacker.lastKillTime <= 14) {
      attacker.streak += 1;
    } else {
      attacker.streak = 1;
    }
    attacker.lastKillTime = serverTime;

    if (attacker.comboTimer > 0) {
      attacker.comboCount += 1;
    } else {
      attacker.comboCount = 1;
    }
    attacker.comboTimer = 8.5;

    let bountyBonus = 0;
    if (victim.specialRole === 1) {
      bountyBonus += 450;
      if (activeSpecialModeId === 'juggernaut_tag') {
        victim.specialRole = 0;
        victim.scale = 1.0;
        attacker.specialRole = 1;
        attacker.scale = 2.2;
        attacker.shield = 100;
        if (attacker.ws) {
          sendJson(attacker.ws, {
            type: 'role_banner',
            banner: getRoleBannerForPlayer(attacker),
          });
        }
      }
    } else if (victim.specialRole === 2 && activeSpecialModeId === 'murder_mystery') {
      bountyBonus += 400;
    } else if (victim.specialRole === 7 && isTeamMatch() && activeNormalModeId === 'bounty_hunters') {
      bountyBonus += 220;
      if (attacker.weapons.length < MAX_WEAPON_SLOTS) {
        const lootPool = Math.random() < 0.35 ? MYTHIC_WEAPONS : REGULAR_WEAPONS.filter((w) => w.rarity === 'rare');
        const lootDef = lootPool[Math.floor(Math.random() * lootPool.length)] || REGULAR_WEAPONS[0];
        attacker.weapons.push({ id: lootDef.id, durability: lootDef.maxDurability, maxDurability: lootDef.maxDurability });
        attacker.equippedWeaponSlot = attacker.weapons.length - 1;
        sendPlayerWeapons(attacker, lootDef.id);
      }
    } else if (activeSpecialModeId === 'hide_and_seek' && attacker.specialRole === 8) {
      bountyBonus += 180;
    }

    if (isTeamMatch() && activeNormalModeId === 'king_of_hill') {
      if (Math.hypot(attacker.x - solarZone.x, attacker.z - solarZone.z) <= solarZone.radius) {
        bountyBonus += 120;
      }
    }

    if (isTeamMatch() && activeNormalModeId === 'arsenal_escalate') {
      attacker.arsenalTier = Math.min(ARSENAL_LADDER.length - 1, attacker.arsenalTier + 1);
      const nextWep = getWeaponDef(ARSENAL_LADDER[attacker.arsenalTier]);
      attacker.weapons = [{ id: nextWep.id, durability: 99, maxDurability: 99 }];
      attacker.equippedWeaponSlot = 0;
      sendPlayerWeapons(attacker, nextWep.id);
      if (attacker.arsenalTier === ARSENAL_LADDER.length - 1) {
        bountyBonus += 300;
      }
    }

    if (activeSpecialModeId === 'infected_swarm' && attacker.specialRole === 4 && victim.specialRole !== 4) {
      victim.specialRole = 4;
      if (victim.ws) {
        sendJson(victim.ws, {
          type: 'role_banner',
          banner: getRoleBannerForPlayer(victim),
        });
      }
    }

    const comboBonus = attacker.comboCount >= 2 ? 40 * Math.min(6, attacker.comboCount) : 0;
    const streakBonus = attacker.streak >= 2 ? 75 * Math.min(4, attacker.streak - 1) : 0;
    const reward = 110 + Math.min(400, lostScore) + streakBonus + comboBonus + bountyBonus;
    attacker.score += reward;
    attacker.kills += 1;

    const healAmt = activeSpecialModeId === 'vampire_bloodlust' ? 65 : 30;
    attacker.shield = Math.min(100, attacker.shield + healAmt);
    attacker.boost = Math.min(100, attacker.boost + 45);

    grantRandomSkill(attacker);

    if (attacker.ws) {
      sendJson(attacker.ws, {
        type: 'combat_feedback',
        kind: 'kill',
        bonusShards: reward,
        comboCount: attacker.comboCount,
        streak: attacker.streak,
        victimName: vLabel,
      });
    }

    if (involvesHuman || botFxBudget-- > 0) {
      const aLabel = attacker.isBot ? `[BOT] ${attacker.name}` : attacker.name;
      broadcastJson({
        type: 'fx',
        kind: 'shatter',
        x: victim.x,
        y: victim.y + 0.8,
        z: victim.z,
        actorId: attacker.slotId,
        actorName: aLabel,
        targetId: victim.slotId,
        targetName: vLabel,
        amount: reward,
        streak: attacker.streak,
      });
    }
  } else if (involvesHuman) {
    broadcastJson({
      type: 'fx',
      kind: 'shatter',
      x: victim.x,
      y: victim.y + 0.8,
      z: victim.z,
      actorId: 0,
      actorName: getMapDef(activeMapId).name,
      targetId: victim.slotId,
      targetName: vLabel,
      amount: 0,
      streak: 0,
    });
  }
}

function applyDamage(
  victim: ServerPlayer,
  damage: number,
  kx: number,
  ky: number,
  kz: number,
  attacker: ServerPlayer | null,
): void {
  if (!victim.alive || victim.invulnTimer > 0) return;

  // Zero friendly fire in tactical team modes!
  if (
    attacker &&
    attacker.slotId !== victim.slotId &&
    isTeamMatch() &&
    attacker.teamId === victim.teamId
  ) {
    return;
  }

  let dmgMult = victim.aegisTimer > 0 ? 0.4 : 1.0;

  if (victim.specialRole === 1) {
    dmgMult *= activeSpecialModeId === 'titan_boss' ? 0.22 : 0.45;
  }
  if (activeSpecialModeId === 'glass_cannon') {
    dmgMult *= 3.0;
  } else if (activeSpecialModeId === 'sniper_duel' && attacker) {
    dmgMult *= 2.0;
  }
  if (attacker && attacker.specialRole === 2 && activeSpecialModeId === 'murder_mystery') {
    dmgMult *= 1.85;
  }
  if (attacker && attacker.specialRole === 1) {
    dmgMult *= 1.45;
  }

  const finalDmg = damage * dmgMult;
  const bounceMult =
    activeSpecialModeId === 'berserk_arena'
      ? 2.2
      : activeEventId === 'tectonic_uplift'
      ? 1.3
      : attacker?.specialRole === 1
      ? 1.6
      : 1;

  victim.shield -= finalDmg;
  victim.vx += kx * bounceMult;
  victim.vy = Math.max(victim.vy, ky * bounceMult);
  victim.vz += kz * bounceMult;
  victim.grounded = false;

  if (attacker && attacker.ws && attacker.slotId !== victim.slotId) {
    sendJson(attacker.ws, {
      type: 'combat_feedback',
      kind: 'hit',
      dmg: Math.round(finalDmg),
      x: victim.x,
      y: victim.y + 1.8,
      z: victim.z,
    });
  }

  if (victim.ws && finalDmg >= 1) {
    const kLen = Math.hypot(kx, kz);
    const fromX = attacker ? attacker.x : kLen > 0.01 ? victim.x - (kx / kLen) * 18 : victim.x;
    const fromZ = attacker ? attacker.z : kLen > 0.01 ? victim.z - (kz / kLen) * 18 : victim.z;
    sendJson(victim.ws, {
      type: 'combat_feedback',
      kind: 'damaged',
      dmg: Math.round(finalDmg),
      fromX,
      fromZ,
    });
  }

  if (attacker && activeSpecialModeId === 'vampire_bloodlust' && attacker.alive) {
    attacker.shield = Math.min(100, attacker.shield + finalDmg * 0.45);
    attacker.boost = Math.min(100, attacker.boost + 18);
  }

  if (attacker) {
    victim.lastDamagerId = attacker.slotId;
    victim.lastDamagerTime = serverTime;
  }

  if (victim.shield <= 0) {
    shatterPlayer(victim, attacker);
  }
}

function lerpAngle(current: number, target: number, t: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

function updateBotAI(
  p: ServerPlayer,
  dt: number,
  playerList: ServerPlayer[],
  crystalUpdates: Array<{ id: number; active: boolean }>,
): void {
  p.botThinkTimer -= dt;
  if (p.botThinkTimer <= 0) {
    p.botThinkTimer = 0.32 + Math.random() * 0.34;

    let chosen = false;
    let nearestEnemy: ServerPlayer | null = null;
    let nearestEnemyDistSq = 46 * 46;

    // 1. In Nico's Nextbots mode, evade nearby Nextbots & slow/shoot them!
    let nearestNextbot: ServerNextbot | null = null;
    let nearestNbDistSq = 48 * 48;
    for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
      const nb = serverNextbots[nIdx];
      if (nb.banishTimer > 0) continue;
      const dx = nb.x - p.x;
      const dz = nb.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestNbDistSq) {
        nearestNbDistSq = d2;
        nearestNextbot = nb;
      }
    }
    if (nearestNextbot && nearestNbDistSq < 25 * 25) {
      const nbDist = Math.sqrt(nearestNbDistSq);
      if (p.skills.length > 0 && nbDist < 17 && Math.random() < 0.6) {
        const slowIdx = p.skills.findIndex((s) => s === 'emp_shock' || s === 'vortex_snare' || s === 'nova_blast');
        executeSkill(p, slowIdx >= 0 ? slowIdx : 0, playerList, crystalUpdates);
      }
      if (p.weapons.length > 0 && nbDist < 34) {
        const nextbotYaw = Math.atan2(nearestNextbot.x - p.x, nearestNextbot.z - p.z);
        const nextbotPitch = Math.atan2(nearestNextbot.y - (p.y + 0.8), nbDist);
        p.botAimTargetId = -nearestNextbot.id - 1;
        p.botAimReactionTimer = Math.max(p.botAimReactionTimer, 0.12);
        p.botAimYaw = nextbotYaw + (Math.random() - 0.5) * 0.035;
        p.botAimPitch = Math.max(-1, Math.min(1, nextbotPitch + (Math.random() - 0.5) * 0.025));
      }
      p.botTargetX = p.x + (p.x - nearestNextbot.x) * 1.9;
      p.botTargetZ = p.z + (p.z - nearestNextbot.z) * 1.9;
      chosen = true;
      if (nbDist < 15 && p.dashCooldown <= 0) {
        p.input.dashQueued = true;
      }
    }

    // 2. Rush the active 30s Mythic Super Weapon beacon if close or opportunistic
    if (!chosen && activeSuperWeaponUid !== null) {
      const superItem = groundWeapons.get(activeSuperWeaponUid);
      if (superItem && superItem.pickupLockTimer <= 0) {
        const d2 = (superItem.x - p.x) ** 2 + (superItem.z - p.z) ** 2;
        if (d2 < 95 * 95 || Math.random() < 0.25) {
          p.botTargetX = superItem.x;
          p.botTargetZ = superItem.z;
          chosen = true;
          if (p.boost > 55 && p.dashCooldown <= 0) {
            p.input.dashQueued = true;
          }
        }
      }
    }

    // 3. Stadium Soccer Ball play!
    if (!chosen && solarBall && Math.random() < 0.42) {
      const bd2 = (solarBall.x - p.x) ** 2 + (solarBall.z - p.z) ** 2;
      if (bd2 < 52 * 52) {
        p.botTargetX = solarBall.x;
        p.botTargetZ = solarBall.z + (p.teamId === 5 ? -1.5 : 1.5);
        chosen = true;
      }
    }

    // 4. Scan enemy pilots (never targets teammates in team modes!)
    for (let k = 0; k < 14; k++) {
      const candidate = playerList[Math.floor(Math.random() * playerList.length)];
      if (!candidate || candidate.slotId === p.slotId || !candidate.alive) continue;
      if (isTeamMatch() && candidate.teamId === p.teamId) continue;
      if (activeSpecialModeId === 'infected_swarm' && p.specialRole === 4 && candidate.specialRole === 4) {
        continue;
      }
      const dx = candidate.x - p.x;
      const dz = candidate.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestEnemyDistSq) {
        nearestEnemyDistSq = d2;
        nearestEnemy = candidate;
      }
    }

    const nearestEnemyDist = Math.sqrt(nearestEnemyDistSq);
    if (nearestEnemy) {
      const dx = nearestEnemy.x - p.x;
      const dy = nearestEnemy.y - p.y;
      const dz = nearestEnemy.z - p.z;
      const targetYaw = Math.atan2(dx, dz);
      const targetPitch = Math.max(-1.0, Math.min(1.0, Math.atan2(dy - 0.8, Math.hypot(dx, dz))));

      if (p.botAimTargetId !== nearestEnemy.slotId) {
        p.botAimTargetId = nearestEnemy.slotId;
        p.botAimReactionTimer = 0.20 + Math.random() * 0.38;
        p.botAimYaw = p.input.yaw;
        p.botAimPitch = p.aimPitch;
      }
      // Keep tracking the opponent even while closing distance; firing still respects weapon range.
      p.botAimYaw = targetYaw + (Math.random() - 0.5) * 0.045;
      p.botAimPitch = targetPitch + (Math.random() - 0.5) * 0.035;

      if (!chosen) {
        p.botTargetX = nearestEnemy.x;
        p.botTargetZ = nearestEnemy.z;
        chosen = true;
      }

      if (p.weapons.length > 0) {
        let bestSlot = 0;
        let bestScore = -1;
        for (let wIdx = 0; wIdx < p.weapons.length; wIdx++) {
          const wDef = getWeaponDef(p.weapons[wIdx].id);
          const fit = wDef.damage * (nearestEnemyDist <= wDef.range ? 1.5 : 0.4);
          if (fit > bestScore) {
            bestScore = fit;
            bestSlot = wIdx;
          }
        }
        p.equippedWeaponSlot = bestSlot;
        const wDef = getWeaponDef(p.weapons[bestSlot].id);
      }
      if (nearestEnemyDist < 13 && p.dashCooldown <= 0 && p.boost > 45 && Math.random() < 0.45) {
        p.input.dashQueued = true;
      }
    }

    if (p.skills.length > 0 && Math.random() < 0.18 && (nearestEnemyDist < 26 || Math.random() < 0.3)) {
      const idx = Math.floor(Math.random() * p.skills.length);
      executeSkill(p, idx, playerList, crystalUpdates);
    }

    if (!chosen) {
      let bestDistSq = Infinity;
      if (p.weapons.length < 3) {
        for (const gw of groundWeapons.values()) {
          if (gw.pickupLockTimer > 0 && gw.dropperSlotId === p.slotId) continue;
          const d2 = (gw.x - p.x) ** 2 + (gw.z - p.z) ** 2;
          if (d2 < 44 * 44 && d2 < bestDistSq) {
            bestDistSq = d2;
            p.botTargetX = gw.x;
            p.botTargetZ = gw.z;
            chosen = true;
          }
        }
      }
      if (!chosen) {
        for (let k = 0; k < powerOrbs.length; k++) {
          const orb = powerOrbs[k];
          if (!orb.active) continue;
          const d2 = (orb.def.x - p.x) ** 2 + (orb.def.z - p.z) ** 2;
          if (d2 < 38 * 38 && d2 < bestDistSq) {
            bestDistSq = d2;
            p.botTargetX = orb.def.x;
            p.botTargetZ = orb.def.z;
            chosen = true;
          }
        }
      }
      if (!chosen) {
        for (let k = 0; k < 10; k++) {
          const c = crystals[Math.floor(Math.random() * crystals.length)];
          if (!c || !c.active) continue;
          const d2 = (c.spawn.x - p.x) ** 2 + (c.spawn.z - p.z) ** 2;
          if (d2 < bestDistSq) {
            bestDistSq = d2;
            p.botTargetX = c.spawn.x;
            p.botTargetZ = c.spawn.z;
            chosen = true;
          }
        }
      }
      if (!chosen || Math.random() < 0.18) {
        const pylon = pylons[Math.floor(Math.random() * pylons.length)];
        p.botTargetX = pylon.x + (Math.random() - 0.5) * 10;
        p.botTargetZ = pylon.z + (Math.random() - 0.5) * 10;
      }
    }

    if (Math.random() < 0.25) {
      p.botStrafe = (Math.random() - 0.5) * 0.5;
    }
    if (p.boost > 72 && p.dashCooldown <= 0 && Math.random() < 0.15) {
      p.input.dashQueued = true;
    }
    if (p.boost > 56 && p.pulseCooldown <= 0 && Math.random() < 0.04) {
      p.input.pulseQueued = true;
    }
    if (p.grounded && Math.random() < 0.06) {
      p.input.jumpQueued = true;
    }
  }

  const dx = p.botTargetX - p.x;
  const dz = p.botTargetZ - p.z;
  const desiredYaw = Math.atan2(dx, dz);

  // Human-like reaction: brief hesitation on target changes, then limited turn speed.
  p.botAimReactionTimer = Math.max(0, p.botAimReactionTimer - dt);
  const aimingAtTarget = p.botAimTargetId !== null;
  const aimTurnRate = aimingAtTarget ? 2.4 : 4.8;
  const yawGoal = aimingAtTarget && p.botAimReactionTimer <= 0 ? p.botAimYaw : desiredYaw;
  p.input.yaw = lerpAngle(p.input.yaw, yawGoal, Math.min(1, dt * aimTurnRate));

  if (p.botAimTargetId !== null && p.botAimReactionTimer <= 0) {
    const aimTargetId = p.botAimTargetId;
    p.aimPitch += (p.botAimPitch - p.aimPitch) * Math.min(1, dt * 2.2);

    // Fire only after the bot has physically turned close to its imperfect aim point.
    let targetDistance = Infinity;
    let targetAlive = false;
    const targetIsNextbot = aimTargetId < 0;
    if (targetIsNextbot) {
      const wantedId = -aimTargetId - 1;
      const nb = serverNextbots.find((item) => item.id === wantedId && item.banishTimer <= 0);
      if (nb) {
        targetAlive = true;
        targetDistance = Math.hypot(nb.x - p.x, nb.y - p.y, nb.z - p.z);
      }
    } else {
      const target = playerList.find((item) => item.slotId === aimTargetId && item.alive && item.slotId !== p.slotId && (!isTeamMatch() || item.teamId !== p.teamId));
      if (target) {
        targetAlive = true;
        targetDistance = Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z);
      }
    }

    let yawError = (p.botAimYaw - p.input.yaw) % (Math.PI * 2);
    if (yawError > Math.PI) yawError -= Math.PI * 2;
    if (yawError < -Math.PI) yawError += Math.PI * 2;
    if (targetAlive && targetDistance < 45 && Math.abs(yawError) < 0.16 && p.weapons.length > 0 && p.weaponCooldown <= 0) {
      // Small chance to hesitate instead of firing on every perfectly aligned frame.
      if (Math.random() < 0.58) executeWeaponAttack(p, playerList, p.aimPitch);
    }
    if (!targetAlive || targetDistance > 52) p.botAimTargetId = null;
  } else {
    p.aimPitch += (0 - p.aimPitch) * Math.min(1, dt * 1.5);
  }

  p.input.moveZ = 0.92;
  p.input.moveX = p.botStrafe;
}

function triggerRandomEvent(): void {
  const candidates = EVENT_DEFS.filter((e) => e.id !== lastEventId);
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  activeEventId = picked.id;
  lastEventId = picked.id;
  activeEventTimer = EVENT_DURATION_SECONDS;
  nextEventTimer = EVENT_INTERVAL_SECONDS;
  meteorSpawnTimer = 0.5;
  ionStormTimer = 0.7;
  vortexPulseTimer = 0.8;
  vortexPullPhase = true;
  seismicTremorTimer = 1.0;
  flareWaveTimer = 0.6;

  // Raise terrain height & map complexity when height-altering disasters hit!
  if (picked.id === 'tectonic_uplift' || picked.id === 'glacial_spires' || picked.id === 'magma_flood') {
    const kind: DisasterPillarSync['kind'] =
      picked.id === 'glacial_spires' ? 'ice' : picked.id === 'magma_flood' ? 'magma' : 'rock';
    disasterPillars = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.35;
      const dist = 28 + (i % 2) * 38 + Math.random() * 14;
      const px = Math.cos(a) * dist;
      const pz = Math.sin(a) * dist;
      const gy = groundHeightAt(px, pz, activeMapId, terrainSeed);
      disasterPillars.push({
        x: px,
        y: gy - 0.4,
        z: pz,
        radius: 6.2 + Math.random() * 2.2,
        height: 4.5 + Math.random() * 4.5,
        kind,
      });
    }
  } else {
    disasterPillars = [];
  }

  broadcastJson({
    type: 'event_sync',
    eventId: activeEventId,
    eventTimer: activeEventTimer,
    nextEventIn: nextEventTimer,
    disasterPillars,
  });
}

function endMatch(): void {
  matchPhase = 'postmatch';
  matchTimeRemaining = POSTMATCH_DURATION_SECONDS;
  activeEventId = 'none';
  activeEventTimer = 0;
  pendingMeteors = [];
  disasterPillars = [];

  const teamMode = isTeamMatch();
  winningTeamId = 0;
  if (teamMode) {
    // Winner decided strictly by highest total team kills; random tie-break if tied!
    if (solarKills > eclipseKills) {
      winningTeamId = 5;
    } else if (eclipseKills > solarKills) {
      winningTeamId = 6;
    } else {
      winningTeamId = Math.random() < 0.5 ? 5 : 6;
    }
    for (let i = 0; i < cachedPlayers.length; i++) {
      if (cachedPlayers[i].teamId === winningTeamId) {
        cachedPlayers[i].score += 150;
      }
    }
  }

  modeVoteOptions = buildModeVoteOptions(matchNumber + 1);
  for (const session of sessions.values()) {
    session.votedMap = null;
    session.votedMode = null;
  }

  // Winner-Only Leaderboard in Team Matches: losing team does not exist on the board!
  const contenders = teamMode && winningTeamId !== 0
    ? cachedPlayers.filter((p) => p.teamId === winningTeamId)
    : [...cachedPlayers];

  const sorted = contenders.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.kills - a.kills;
  });

  lastMatchScores = sorted.map((p, idx) => ({
    slotId: p.slotId,
    name: p.name,
    score: p.score,
    kills: p.kills,
    colorIndex: p.colorIndex,
    isBot: p.isBot,
    teamId: p.teamId,
    rank: idx + 1,
  }));

  broadcastJson({
    type: 'match_end',
    mapId: activeMapId,
    terrainSeed,
    matchNumber,
    normalModeId: activeNormalModeId,
    specialModeId: activeSpecialModeId,
    postMatchSeconds: POSTMATCH_DURATION_SECONDS,
    scores: lastMatchScores,
    winningTeam: winningTeamId,
    solarKills,
    eclipseKills,
    mapVotes: getMapVotesPayload(),
    modeVoteOptions,
    modeVotes: getModeVotesPayload(),
  });
}

function startNextMatch(): void {
  const votes = getMapVotesPayload();
  let bestCount = -1;
  let winners: MapId[] = [];
  for (const def of MAP_DEFS) {
    const c = votes[def.id] || 0;
    if (c > bestCount) {
      bestCount = c;
      winners = [def.id];
    } else if (c === bestCount) {
      winners.push(def.id);
    }
  }

  if (bestCount <= 0) {
    const others = MAP_DEFS.filter((m) => m.id !== activeMapId);
    activeMapId = others[Math.floor(Math.random() * others.length)].id;
  } else {
    activeMapId = winners[Math.floor(Math.random() * winners.length)];
  }

  matchNumber += 1;
  const mVotes = getModeVotesPayload();
  let bestModeCount = 0;
  let modeWinners: ModeVoteOption[] = [];
  for (const opt of modeVoteOptions) {
    const c = mVotes[opt.key] || 0;
    if (c > 0 && c > bestModeCount) {
      bestModeCount = c;
      modeWinners = [opt];
    } else if (c > 0 && c === bestModeCount) {
      modeWinners.push(opt);
    }
  }

  if (modeWinners.length > 0) {
    const pick = modeWinners[Math.floor(Math.random() * modeWinners.length)];
    if (pick.kind === 'special' && isValidSpecialModeId(pick.id)) {
      activeSpecialModeId = pick.id;
      lastSpecialModeId = pick.id;
    } else if (pick.kind === 'normal' && isValidNormalModeId(pick.id)) {
      activeSpecialModeId = 'none';
      activeNormalModeId = pick.id;
      lastNormalModeId = pick.id;
    }
  } else if (matchNumber % 3 === 0) {
    const candidates = SPECIAL_MODES.filter((m) => m.id !== lastSpecialModeId);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    activeSpecialModeId = chosen.id;
    lastSpecialModeId = chosen.id;
  } else {
    activeSpecialModeId = 'none';
    const normalCandidates = NORMAL_MODES.filter((m) => m.id !== lastNormalModeId);
    const chosenNorm = normalCandidates[Math.floor(Math.random() * normalCandidates.length)] || NORMAL_MODES[0];
    activeNormalModeId = chosenNorm.id;
    lastNormalModeId = chosenNorm.id;
  }

  // Dedicated arena for special rounds when no explicit map vote overrode it
  const specialDef = getSpecialModeDef(activeSpecialModeId);
  if (specialDef?.dedicatedMapId && bestCount <= 0) {
    activeMapId = specialDef.dedicatedMapId;
  }

  rouletteTimer = 5.0;
  terrainSeed = rollTerrainSeed();
  solarKills = 0;
  eclipseKills = 0;
  winningTeamId = 0;

  for (const session of sessions.values()) {
    session.votedMap = null;
    session.votedMode = null;
  }

  rebuildMapEntities(activeMapId, terrainSeed);
  matchPhase = 'active';
  matchTimeRemaining = MATCH_DURATION_SECONDS;
  activeEventId = 'none';
  activeEventTimer = 0;
  nextEventTimer = 2.0; // Disaster triggers at round start!
  pendingMeteors = [];
  sovereignSlotId = 0xffff;

  assignSpecialRolesForMatch();

  for (let i = 0; i < cachedPlayers.length; i++) {
    const p = cachedPlayers[i];
    const spawn = getSpawnPoint(p.isBot, isTeamMatch() ? p.teamId : undefined);
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.yaw = spawn.yaw;
    p.roll = 0;
    p.pitch = 0;
    p.aimPitch = 0;
    p.shield = 100;
    p.boost = 100;
    p.score = 0;
    p.kills = 0;
    p.streak = 0;
    p.lastKillTime = 0;
    p.comboCount = 0;
    p.comboTimer = 0;
    p.arsenalTier = 0;
    p.hideSurvivalTick = 0;
    p.alive = true;
    p.grounded = true;
    p.respawnTimer = 0;
    p.dashTimer = 0;
    p.dashCooldown = 0;
    p.pulseTimer = 0;
    p.pulseCooldown = 0;
    p.invulnTimer = 2.5;
    p.aegisTimer = 0;
    p.overdriveTimer = 0;
    p.magnetTimer = 0;
    p.empSlowTimer = 0;
    p.turboTimer = 0;
    p.ringCooldownTimer = 0;
    p.nextReplaceSlot = 0;
    sendPlayerSkills(p);
    sendPlayerWeapons(p);
  }

  const gwPayload = getGroundWeaponsPayload();
  const modeHud = getModeHudPayload();

  for (const session of sessions.values()) {
    const p = session.slotId !== null ? players.get(session.slotId) : undefined;
    sendJson(session.ws, {
      type: 'match_start',
      mapId: activeMapId,
      terrainSeed,
      matchNumber,
      normalModeId: activeNormalModeId,
      specialModeId: activeSpecialModeId,
      modeHud,
      teamId: p && isTeamMatch() ? p.teamId : 0,
      roleBanner: p ? getRoleBannerForPlayer(p) : null,
      matchDuration: MATCH_DURATION_SECONDS,
      nextEventIn: nextEventTimer,
      disasterPillars,
      inactiveCrystals: [],
      inactiveOrbs: [],
      pylons: getPylonsPayload(),
      groundWeapons: gwPayload,
      thrownProjectiles: [],
      fireZones: [],
      solarBall,
    });
  }
}

function broadcastBinarySnapshot(): void {
  snapPlayersBuf.length = 0;
  for (let i = 0; i < cachedPlayers.length; i++) {
    const p = cachedPlayers[i];
    const activeSlot = p.weapons[p.equippedWeaponSlot];
    const wIdx = activeSlot ? getWeaponDef(activeSlot.id).index : 0;
    snapPlayersBuf.push({
      slotId: p.slotId,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      roll: p.roll,
      pitch: p.pitch,
      shield: p.shield,
      alive: p.alive,
      dashing: p.dashTimer > 0,
      pulsing: p.pulseTimer > 0,
      sovereign: p.slotId === sovereignSlotId,
      grounded: p.grounded,
      isBot: p.isBot,
      shielded: p.aegisTimer > 0,
      overdrive:
        p.overdriveTimer > 0 ||
        p.magnetTimer > 0 ||
        p.turboTimer > 0 ||
        p.specialRole === 2 ||
        p.specialRole === 4 ||
        p.specialRole === 8,
      colorIndex: p.colorIndex,
      boost: p.boost,
      score: p.score,
      scale: p.scale,
      specialRole: p.specialRole,
      weaponKindIndex: wIdx,
      attacking: p.attackAnimTimer > 0,
      teamId: isTeamMatch() ? p.teamId : 0,
    });
  }

  snapSentinelsBuf.length = 0;
  for (let i = 0; i < sentinels.length; i++) {
    const s = sentinels[i];
    snapSentinelsBuf.push({
      id: s.id,
      state: s.state,
      hp: s.hp,
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
    });
  }

  snapNextbotsBuf.length = 0;
  for (let i = 0; i < serverNextbots.length; i++) {
    const n = serverNextbots[i];
    snapNextbotsBuf.push({
      id: n.id,
      variant: n.variant,
      slowed: n.slowTimer > 0,
      banished: n.banishTimer > 0,
      x: n.x,
      y: n.y,
      z: n.z,
      yaw: n.yaw,
    });
  }

  const binary = encodeSnapshot({
    serverTime,
    sovereignSlotId,
    beamAngle,
    mapIndex: getMapDef(activeMapId).index,
    terrainSeed,
    normalModeIndex: getNormalModeIndex(activeNormalModeId),
    specialModeIndex: getSpecialModeIndex(activeSpecialModeId),
    matchNumber,
    matchPhase,
    eventIndex: getEventIndex(activeEventId),
    matchTimeRemaining,
    players: snapPlayersBuf,
    sentinels: snapSentinelsBuf,
    nextbots: snapNextbotsBuf,
  });

  for (const session of sessions.values()) {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(binary);
    }
  }
}

function stepSimulation(dt: number): void {
  serverTime += dt;
  botFxBudget = 4;

  if (matchPhase === 'postmatch') {
    matchTimeRemaining -= dt;
    if (matchTimeRemaining <= 0) {
      startNextMatch();
    }
    broadcastBinarySnapshot();
    return;
  }

  matchTimeRemaining -= dt;
  if (matchTimeRemaining <= 0) {
    endMatch();
    broadcastBinarySnapshot();
    return;
  }

  nextEventTimer -= dt;
  if (nextEventTimer <= 0 && activeEventId === 'none') {
    triggerRandomEvent();
  }
  if (activeEventId !== 'none') {
    activeEventTimer -= dt;
    if (activeEventTimer <= 0) {
      activeEventId = 'none';
      activeEventTimer = 0;
      disasterPillars = [];
      broadcastJson({
        type: 'event_sync',
        eventId: 'none',
        eventTimer: 0,
        nextEventIn: nextEventTimer,
        disasterPillars: [],
      });
    }
  }

  const beamSpeed = activeEventId === 'sentinel_surge' ? 0.72 : 0.42;
  beamAngle = (beamAngle + dt * beamSpeed) % (Math.PI * 2);

  // 1. Update Crystals & Mystery Power Orbs
  crystalUpdatesBuf.length = 0;
  const crystalTick =
    activeSpecialModeId === 'gold_rush_madness'
      ? dt * 4.0
      : activeEventId === 'gold_rush'
      ? dt * 3.0
      : activeEventId === 'solar_storm'
      ? dt * 2.5
      : dt;
  for (let i = 0; i < crystals.length; i++) {
    const c = crystals[i];
    if (!c.active) {
      c.respawnTimer -= crystalTick;
      if (c.respawnTimer <= 0) {
        c.active = true;
        crystalUpdatesBuf.push({ id: i, active: true });
      }
    }
  }

  orbUpdatesBuf.length = 0;
  const orbTick =
    activeSpecialModeId === 'gold_rush_madness' || activeEventId === 'gold_rush' ? dt * 2.2 : dt;
  for (let i = 0; i < powerOrbs.length; i++) {
    const orb = powerOrbs[i];
    if (!orb.active) {
      orb.respawnTimer -= orbTick;
      if (orb.respawnTimer <= 0) {
        orb.active = true;
        orbUpdatesBuf.push({ id: i, active: true });
      }
    }
  }

  const playerList = cachedPlayers;
  const jumpPads = getMapJumpPads(activeMapId, terrainSeed);
  addedGroundWeaponsBuf.length = 0;
  removedGroundWeaponUidsBuf.length = 0;
  movedGroundWeaponsBuf.length = 0;

  // Step Ground Weapon Drop Ballistics (Server handles position & basic bounce only; zero rotation math!)
  for (const gw of groundWeapons.values()) {
    if (gw.pickupLockTimer > 0) {
      gw.pickupLockTimer = Math.max(0, gw.pickupLockTimer - dt);
    }
    if (!gw.settled) {
      gw.vy -= 26 * dt;
      gw.x += gw.vx * dt;
      gw.y += gw.vy * dt;
      gw.z += gw.vz * dt;
      const cl = clampToArena(gw.x, gw.z, 1.4, activeMapId, terrainSeed, gw.y - 0.45);
      if (cl.hitWall) {
        gw.vx *= -0.5;
        gw.vz *= -0.5;
      }
      gw.x = cl.x;
      gw.z = cl.z;
      const gy = getEffectiveGroundY(gw.x, gw.z, gw.y - 0.45) + 0.45;
      if (gw.y <= gy) {
        gw.y = gy;
        if (Math.abs(gw.vy) > 4.2) {
          gw.vy = -gw.vy * 0.38;
        } else {
          gw.vy = 0;
        }
        gw.vx *= 0.62;
        gw.vz *= 0.62;
        if (Math.abs(gw.vy) < 0.2 && gw.vx * gw.vx + gw.vz * gw.vz < 0.35) {
          gw.vx = 0;
          gw.vy = 0;
          gw.vz = 0;
          gw.settled = true;
        }
      }
      movedGroundWeaponsBuf.push(gw);
    }
  }

  // Step Thrown Projectiles (Grenades, Molotov, Cryo, EMP, Cluster)
  for (let i = thrownProjectiles.length - 1; i >= 0; i--) {
    const pr = thrownProjectiles[i];
    pr.timer -= dt;
    pr.vy -= 24 * dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.z += pr.vz * dt;

    const cl = clampToArena(pr.x, pr.z, 0.9, activeMapId, terrainSeed, pr.y - 0.35);
    if (cl.hitWall) {
      pr.vx *= -0.55;
      pr.vz *= -0.55;
    }
    pr.x = cl.x;
    pr.z = cl.z;

    const gy = getEffectiveGroundY(pr.x, pr.z, pr.y - 0.35) + 0.35;
    let impactDetonate = false;
    if (pr.y <= gy) {
      pr.y = gy;
      if (pr.weaponId === 'molotov_cocktail' || pr.weaponId === 'cryo_bomb') {
        impactDetonate = true;
      } else {
        pr.vy = Math.abs(pr.vy) > 4 ? -pr.vy * 0.48 : 0;
        pr.vx *= 0.72;
        pr.vz *= 0.72;
      }
    }

    // Direct contact with enemy triggers explosion early!
    if (!impactDetonate) {
      for (let k = 0; k < playerList.length; k++) {
        const tgt = playerList[k];
        if (!tgt.alive || tgt.slotId === pr.ownerSlotId) continue;
        if (isTeamMatch() && tgt.teamId === pr.ownerTeam) continue;
        const dx = tgt.x - pr.x;
        const dy = tgt.y - pr.y;
        const dz = tgt.z - pr.z;
        if (dx * dx + dy * dy + dz * dz < 6.8) {
          impactDetonate = true;
          break;
        }
      }
    }

    if (impactDetonate || pr.timer <= 0) {
      thrownProjectiles.splice(i, 1);
      detonateThrowable(pr);
    }
  }

  // Step Lingering Fire / Cryo Zones (Molotov & Cryo Bomb)
  for (let i = fireZones.length - 1; i >= 0; i--) {
    const fz = fireZones[i];
    fz.remaining -= dt;
    fz.tickTimer -= dt;
    if (fz.tickTimer <= 0) {
      fz.tickTimer = 0.4;
      const attacker = players.get(fz.ownerSlotId) || null;
      const r2 = fz.radius * fz.radius;
      for (let k = 0; k < playerList.length; k++) {
        const tgt = playerList[k];
        if (!tgt.alive) continue;
        if (attacker && tgt.slotId !== attacker.slotId && isTeamMatch() && tgt.teamId === attacker.teamId) {
          continue;
        }
        const dx = tgt.x - fz.x;
        const dz = tgt.z - fz.z;
        if (dx * dx + dz * dz <= r2 && Math.abs(tgt.y - fz.y) < 5.5) {
          if (fz.kind === 'molotov') {
            applyDamage(tgt, 9.5, 0, 1.5, 0, attacker);
          } else {
            tgt.empSlowTimer = Math.max(tgt.empSlowTimer, 1.4);
          }
        }
      }
      for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
        const nb = serverNextbots[nIdx];
        if (nb.banishTimer > 0) continue;
        const dx = nb.x - fz.x;
        const dz = nb.z - fz.z;
        if (dx * dx + dz * dz <= r2) {
          hitNextbot(nb, fz.kind === 'molotov' ? 14 : 6, fz.kind === 'cryo' ? 2.5 : 0.5, 0, 0, attacker);
        }
      }
    }
    if (fz.remaining <= 0) {
      fireZones.splice(i, 1);
    }
  }

  // Step Stadium Solar Ball Physics!
  if (solarBall) {
    solarBall.vy -= 22 * dt;
    solarBall.x += solarBall.vx * dt;
    solarBall.y += solarBall.vy * dt;
    solarBall.z += solarBall.vz * dt;
    solarBall.vx *= 1 - 0.55 * dt;
    solarBall.vz *= 1 - 0.55 * dt;

    const ballFloor = groundHeightAt(solarBall.x, solarBall.z, activeMapId, terrainSeed) + 2.3;
    if (solarBall.y <= ballFloor) {
      solarBall.y = ballFloor;
      solarBall.vy = Math.abs(solarBall.vy) > 3.5 ? -solarBall.vy * 0.65 : 0;
    }

    // Check Goals at z = ±118 between |x| < 18
    if (Math.abs(solarBall.x) < 18 && Math.abs(solarBall.z) > 116) {
      const scoredBySolar = solarBall.z > 116; // Solar (-Z) attacks Eclipse (+Z) goal!
      if (scoredBySolar) solarKills += 1;
      else eclipseKills += 1;
      if (lastBallToucher && lastBallToucher.alive) {
        lastBallToucher.score += 180;
      }
      broadcastJson({
        type: 'explosion',
        kind: 'frag_grenade',
        x: solarBall.x,
        y: solarBall.y + 1,
        z: solarBall.z,
        color: scoredBySolar ? '#F59E0B' : '#38BDF8',
        radius: 14,
        smoke: true,
      });
      solarBall.x = 0;
      solarBall.y = 6.5;
      solarBall.z = 0;
      solarBall.vx = 0;
      solarBall.vy = 0;
      solarBall.vz = 0;
      lastBallToucher = null;
    } else {
      const bClamp = clampToArena(solarBall.x, solarBall.z, 3.0, activeMapId, terrainSeed);
      if (bClamp.hitWall) {
        solarBall.vx *= -0.75;
        solarBall.vz *= -0.75;
      }
      solarBall.x = bClamp.x;
      solarBall.z = bClamp.z;
    }
  }

  // Every 30s: spawn 1 Mythic Super Weapon & alert all players & bots!
  superWeaponTimer -= dt;
  if (superWeaponTimer <= 0) {
    superWeaponTimer = SUPER_WEAPON_INTERVAL_SECONDS;
    const mythicDef = MYTHIC_WEAPONS[Math.floor(Math.random() * MYTHIC_WEAPONS.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = 16 + Math.random() * 88;
    const item = spawnGroundWeaponAt(
      mythicDef.id,
      Math.cos(angle) * dist,
      Math.sin(angle) * dist,
      mythicDef.maxDurability,
      mythicDef.maxDurability,
      true,
      false,
    );
    addedGroundWeaponsBuf.push(item);
    broadcastJson({
      type: 'super_weapon_alert',
      uid: item.uid,
      weaponId: mythicDef.id,
      name: mythicDef.name,
      shortName: mythicDef.shortName,
      x: item.x,
      z: item.z,
      durability: item.durability,
      maxDurability: item.maxDurability,
      color: mythicDef.color,
    });
  }

  // Keep scattered ground weapons replenished & manage despawn based on player weapon counts
  weaponTopupTimer -= dt;
  if (weaponTopupTimer <= 0) {
    weaponTopupTimer = 2.0;

    let humanCount = 0;
    let needyCount = 0;
    let firstNeedy: ServerPlayer | undefined;
    for (let i = 0; i < playerList.length; i++) {
      const hp = playerList[i];
      if (!hp.isBot) {
        humanCount++;
        if (hp.weapons.length < 3) {
          needyCount++;
          if (!firstNeedy || Math.random() < 0.35) firstNeedy = hp;
        }
      }
    }
    const hasPlayerBelowThree = needyCount > 0;
    const allPlayersStocked = humanCount > 0 && !hasPlayerBelowThree;

    if (!allPlayersStocked) {
      const dropMaxAge = hasPlayerBelowThree ? 24 : 45;
      const scatterMaxAge = hasPlayerBelowThree ? 34 : 90;
      for (const gw of groundWeapons.values()) {
        gw.age += 2.0;
        if (gw.isSuper) continue;
        const maxAge = gw.isDrop ? dropMaxAge : scatterMaxAge;
        if (gw.age > maxAge) {
          let humanNearby = false;
          for (let i = 0; i < playerList.length; i++) {
            const hp = playerList[i];
            if (!hp.isBot && hp.alive && (hp.x - gw.x) ** 2 + (hp.z - gw.z) ** 2 < 256) {
              humanNearby = true;
              break;
            }
          }
          if (!humanNearby) {
            groundWeapons.delete(gw.uid);
            removedGroundWeaponUidsBuf.push(gw.uid);
            if (activeSuperWeaponUid === gw.uid) activeSuperWeaponUid = null;
          }
        }
      }
    }

    const evictedUids = evictOldestGroundWeapons(MAX_GROUND_WEAPONS);
    for (let i = 0; i < evictedUids.length; i++) {
      removedGroundWeaponUidsBuf.push(evictedUids[i]);
    }

    let spawnedThisTick = 0;
    while (groundWeapons.size < MAP_WEAPON_COUNT && spawnedThisTick < 4) {
      const target = firstNeedy && Math.random() < 0.5 ? firstNeedy : undefined;
      addedGroundWeaponsBuf.push(spawnScatterRegularWeapon(target));
      spawnedThisTick++;
    }
  }

  // Special Mode: Skill Roulette drops every 5s
  if (activeSpecialModeId === 'skill_roulette') {
    rouletteTimer -= dt;
    if (rouletteTimer <= 0) {
      rouletteTimer = 5.0;
      for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];
        if (p.alive && !p.isBot) {
          grantRandomSkill(p);
        }
      }
    }
  }

  // Meteor Shower Disaster (#4)
  if (activeEventId === 'meteor_shower') {
    meteorSpawnTimer -= dt;
    if (meteorSpawnTimer <= 0) {
      meteorSpawnTimer = 1.0;
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 135;
      const mx = Math.cos(a) * r;
      const mz = Math.sin(a) * r;
      const delay = 1.3;
      pendingMeteors.push({ x: mx, z: mz, radius: 9.5, timer: delay });
      broadcastJson({ type: 'meteor', x: mx, z: mz, radius: 9.5, delay });
    }
  }

  for (let mIdx = pendingMeteors.length - 1; mIdx >= 0; mIdx--) {
    const m = pendingMeteors[mIdx];
    m.timer -= dt;
    if (m.timer <= 0) {
      pendingMeteors.splice(mIdx, 1);
      const my = getEffectiveGroundY(m.x, m.z) + 0.8;
      for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];
        if (!p.alive) continue;
        const dx = p.x - m.x;
        const dz = p.z - m.z;
        const dist = Math.hypot(dx, dz);
        if (dist < m.radius) {
          const nx = dist > 0.1 ? dx / dist : 1;
          const nz = dist > 0.1 ? dz / dist : 0;
          applyDamage(p, 32 * (1 - dist / (m.radius * 1.4)), nx * 24, 12, nz * 24, null);
        } else if (dist < m.radius + 7.5) {
          p.score += 45;
        }
      }
      broadcastJson({ type: 'explosion', kind: 'death', x: m.x, y: my, z: m.z, color: '#EF4444', radius: 9.5, smoke: true });
    }
  }

  // Ion Lightning Storm Disaster (#8)
  if (activeEventId === 'ion_tempest') {
    ionStormTimer -= dt;
    if (ionStormTimer <= 0) {
      ionStormTimer = 0.95;
      let lx = 0;
      let lz = 0;
      const target = playerList[Math.floor(Math.random() * playerList.length)];
      if (target && target.alive && Math.random() < 0.72) {
        const jitterA = Math.random() * Math.PI * 2;
        const jitterR = Math.random() * 14;
        lx = target.x + Math.cos(jitterA) * jitterR;
        lz = target.z + Math.sin(jitterA) * jitterR;
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 130;
        lx = Math.cos(a) * r;
        lz = Math.sin(a) * r;
      }
      const clampedL = clampToArena(lx, lz, 2, activeMapId, terrainSeed);
      lx = clampedL.x;
      lz = clampedL.z;
      const ly = getEffectiveGroundY(lx, lz) + 0.5;
      const strikeRad = 11.5;
      for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];
        if (!p.alive) continue;
        const dx = p.x - lx;
        const dz = p.z - lz;
        const d = Math.hypot(dx, dz);
        if (d < strikeRad) {
          const nx = d > 0.1 ? dx / d : 1;
          const nz = d > 0.1 ? dz / d : 0;
          p.empSlowTimer = Math.max(p.empSlowTimer, 2.6);
          p.boost = Math.max(0, p.boost - 24);
          applyDamage(p, 24, nx * 22, 11, nz * 22, null);
        } else if (d < strikeRad + 6.5) {
          p.score += 35;
        }
      }
      broadcastJson({ type: 'lightning', x: lx, y: ly, z: lz, radius: strikeRad });
    }
  }

  // Tectonic Monoliths Tremor (#6)
  if (activeEventId === 'tectonic_uplift') {
    seismicTremorTimer -= dt;
    if (seismicTremorTimer <= 0) {
      seismicTremorTimer = 3.2;
      for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];
        if (p.alive && p.grounded) {
          p.vy = Math.max(p.vy, 12 + Math.random() * 5);
          p.grounded = false;
        }
      }
      broadcastJson({
        type: 'fx',
        kind: 'quake_wave',
        x: 0,
        y: groundHeightAt(0, 0, activeMapId, terrainSeed) + 1.5,
        z: 0,
        actorId: 0,
        amount: 0,
      });
    }
  }

  // Glacial Cryo Spires chill wave (#9)
  if (activeEventId === 'glacial_spires') {
    vortexPulseTimer -= dt;
    if (vortexPulseTimer <= 0) {
      vortexPulseTimer = 4.0;
      vortexPullPhase = !vortexPullPhase;
      for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];
        if (p.alive && p.y < 2.2) {
          p.score += 15;
        }
      }
    }
  }

  // Magma Surge flood (#10 or Special Mode lava_rising)
  if (activeSpecialModeId === 'lava_rising' || activeEventId === 'magma_flood') {
    lavaCycleTimer = (lavaCycleTimer + dt) % 34;
    if (lavaCycleTimer < 20) {
      lavaLevel = -0.8 + (lavaCycleTimer / 20) * 4.8;
    } else if (lavaCycleTimer < 27) {
      lavaLevel = 4.0;
    } else {
      lavaLevel = 4.0 - ((lavaCycleTimer - 27) / 7) * 4.8;
    }
    flareWaveTimer -= dt;
    if (flareWaveTimer <= 0) {
      flareWaveTimer = 3.2;
      broadcastJson({
        type: 'fx',
        kind: 'flare_wave',
        x: 0,
        y: groundHeightAt(0, 0, activeMapId, terrainSeed) + 2.0,
        z: 0,
        actorId: 0,
        amount: 0,
      });
    }
  } else {
    lavaLevel = -32;
  }

  // Mode timers: Moving Solar Zone & Bounty tagging
  if (isTeamMatch() && activeNormalModeId === 'king_of_hill') {
    solarZone.timer -= dt;
    if (solarZone.timer <= 0) {
      solarZone.timer = 35;
      const za = Math.random() * Math.PI * 2;
      const zr = 18 + Math.random() * 68;
      solarZone.x = Math.cos(za) * zr;
      solarZone.z = Math.sin(za) * zr;
    }
  } else if (isTeamMatch() && activeNormalModeId === 'bounty_hunters') {
    let b1 = -1;
    let b2 = -1;
    let b3 = -1;
    let s1 = 40;
    let s2 = 40;
    let s3 = 40;
    for (let i = 0; i < playerList.length; i++) {
      const pl = playerList[i];
      if (pl.score >= s1) {
        s3 = s2; b3 = b2; s2 = s1; b2 = b1; s1 = pl.score; b1 = pl.slotId;
      } else if (pl.score >= s2) {
        s3 = s2; b3 = b2; s2 = pl.score; b2 = pl.slotId;
      } else if (pl.score >= s3) {
        s3 = pl.score; b3 = pl.slotId;
      }
    }
    for (let i = 0; i < playerList.length; i++) {
      const pl = playerList[i];
      pl.specialRole = pl.slotId === b1 || pl.slotId === b2 || pl.slotId === b3 ? 7 : pl.teamId;
    }
  }

  // 2. Update Players
  const spaceMode = isSpaceMap(activeMapId);
  const isLowGrav =
    spaceMode ||
    activeEventId === 'low_gravity' ||
    activeSpecialModeId === 'low_grav_airshow' ||
    activeSpecialModeId === 'sniper_duel';
  const isFrenzy = activeEventId === 'hyper_frenzy' || activeSpecialModeId === 'turbo_grand_prix';
  const isTurboChaos = activeEventId === 'tectonic_uplift' || activeSpecialModeId === 'turbo_grand_prix';

  for (let i = 0; i < playerList.length; i++) {
    const p = playerList[i];
    const cooldownRate = isFrenzy || isTurboChaos || p.overdriveTimer > 0 ? 1.85 : 1;
    p.dashCooldown =
      activeSpecialModeId === 'turbo_grand_prix'
        ? 0
        : Math.max(0, p.dashCooldown - dt * cooldownRate);
    p.pulseCooldown = Math.max(0, p.pulseCooldown - dt * cooldownRate);
    p.hitCooldown = Math.max(0, p.hitCooldown - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.pulseTimer = Math.max(0, p.pulseTimer - dt);
    p.aegisTimer = Math.max(0, p.aegisTimer - dt);
    p.overdriveTimer = Math.max(0, p.overdriveTimer - dt);
    p.magnetTimer = Math.max(0, p.magnetTimer - dt);
    p.empSlowTimer = Math.max(0, p.empSlowTimer - dt);
    p.turboTimer = Math.max(0, p.turboTimer - dt);
    p.ringCooldownTimer = Math.max(0, p.ringCooldownTimer - dt);
    p.weaponCooldown = Math.max(0, p.weaponCooldown - dt);
    p.attackAnimTimer = Math.max(0, p.attackAnimTimer - dt);
    p.comboTimer = Math.max(0, p.comboTimer - dt);
    if (p.comboTimer <= 0) p.comboCount = 0;

    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        const spawn = getSpawnPoint(false, isTeamMatch() ? p.teamId : undefined);
        p.x = spawn.x;
        p.y = spawn.y;
        p.z = spawn.z;
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
        p.yaw = spawn.yaw;
        p.shield = 100;
        p.boost = 100;
        p.alive = true;
        p.grounded = true;
        p.invulnTimer = 2.2;
        p.lastDamagerId = null;
        if (p.skills.length === 0) {
          p.skills = [p.starterSkill];
          p.starterCooldown = 0;
          sendPlayerSkills(p);
        }
        if (activeSpecialModeId === 'sniper_duel' && p.weapons.length === 0) {
          const rDef = getWeaponDef('rail_sniper');
          p.weapons = [{ id: rDef.id, durability: 99, maxDurability: 99 }];
          p.equippedWeaponSlot = 0;
          sendPlayerWeapons(p);
        } else if (isTeamMatch() && activeNormalModeId === 'arsenal_escalate' && p.weapons.length === 0) {
          const tierDef = getWeaponDef(ARSENAL_LADDER[Math.min(ARSENAL_LADDER.length - 1, p.arsenalTier)]);
          p.weapons = [{ id: tierDef.id, durability: 99, maxDurability: 99 }];
          p.equippedWeaponSlot = 0;
          sendPlayerWeapons(p);
        } else if (isTeamMatch() && p.weapons.length === 0) {
          const carbineDef = getWeaponDef('pulse_carbine');
          p.weapons = [{ id: carbineDef.id, durability: carbineDef.maxDurability, maxDurability: carbineDef.maxDurability }];
          p.equippedWeaponSlot = 0;
          sendPlayerWeapons(p);
        }
      }
      p.input.dashQueued = false;
      p.input.pulseQueued = false;
      p.input.jumpQueued = false;
      continue;
    }

    if (p.skills.length === 0) {
      p.starterCooldown -= dt * cooldownRate;
      if (p.starterCooldown <= 0) {
        p.starterCooldown = 0;
        p.skills.push(p.starterSkill);
        sendPlayerSkills(p, p.starterSkill, undefined, true);
      }
    }

    const boostRate =
      p.empSlowTimer > 0
        ? 7
        : isFrenzy || p.overdriveTimer > 0 || p.turboTimer > 0 || p.specialRole === 9
        ? 42
        : 22;
    p.boost = Math.min(100, p.boost + dt * boostRate);

    if (activeSpecialModeId === 'vampire_bloodlust') {
      p.shield = Math.max(6, p.shield - dt * 2.2);
    } else {
      p.shield = Math.min(100, p.shield + dt * (p.aegisTimer > 0 ? 7 : 2.8));
    }

    if (activeSpecialModeId === 'hide_and_seek' && p.specialRole === 9) {
      p.hideSurvivalTick += dt;
      if (p.hideSurvivalTick >= 5.0) {
        p.hideSurvivalTick = 0;
        p.score += 30;
      }
    }

    if (isTeamMatch() && activeNormalModeId === 'king_of_hill') {
      if ((p.x - solarZone.x) ** 2 + (p.z - solarZone.z) ** 2 <= solarZone.radius * solarZone.radius) {
        p.score += dt * 25;
        p.shield = Math.min(100, p.shield + dt * 12);
      }
    }

    if (p.isBot) {
      updateBotAI(p, dt, playerList, crystalUpdatesBuf);
    }

    p.yaw = p.input.yaw;

    // Dash trigger
    if (p.input.dashQueued) {
      p.input.dashQueued = false;
      const dashCost = activeSpecialModeId === 'turbo_grand_prix' ? 10 : 20;
      if (p.dashCooldown <= 0 && p.boost >= dashCost) {
        p.boost -= dashCost;
        p.dashTimer = 0.36;
        p.dashCooldown = activeSpecialModeId === 'turbo_grand_prix' ? 0 : 0.6;
        const cosP = spaceMode ? Math.cos(p.aimPitch) : 1;
        const dirX = Math.sin(p.yaw) * cosP;
        const dirZ = Math.cos(p.yaw) * cosP;
        const dashVel =
          p.overdriveTimer > 0 || p.turboTimer > 0 || p.specialRole === 2 || p.specialRole === 4 ? 64 : 50;
        p.vx = dirX * dashVel;
        p.vz = dirZ * dashVel;
        p.vy = spaceMode ? Math.sin(p.aimPitch) * dashVel : Math.max(p.vy, 3.0);
        if (!p.isBot) {
          broadcastJson({
            type: 'fx',
            kind: 'dash',
            x: p.x,
            y: p.y + 0.6,
            z: p.z,
            actorId: p.slotId,
          });
        }
      }
    }

    // Jump trigger
    if (p.input.jumpQueued) {
      p.input.jumpQueued = false;
      if (p.grounded || spaceMode || activeSpecialModeId === 'low_grav_airshow') {
        p.vy = spaceMode ? Math.max(p.vy + 14, 14) : activeSpecialModeId === 'low_grav_airshow' ? 27 : isLowGrav ? 24.5 : isTurboChaos ? 20.5 : 17.5;
        p.grounded = false;
      }
    }

    // Gravity Pulse trigger
    if (p.input.pulseQueued) {
      p.input.pulseQueued = false;
      if (p.pulseCooldown <= 0 && p.boost >= 32) {
        p.boost -= 32;
        p.pulseTimer = 0.35;
        p.pulseCooldown = 1.7;

        if (!p.isBot) {
          broadcastJson({
            type: 'fx',
            kind: 'pulse',
            x: p.x,
            y: p.y + 0.6,
            z: p.z,
            actorId: p.slotId,
          });
        }

        const pulseRange = 15 * Math.max(1, p.scale * 0.7);
        const pulseRangeSq = pulseRange * pulseRange;
        for (let j = 0; j < playerList.length; j++) {
          const other = playerList[j];
          if (other.slotId === p.slotId || !other.alive) continue;
          if (isTeamMatch() && other.teamId === p.teamId) continue;
          const dx = other.x - p.x;
          const dy = other.y - p.y;
          const dz = other.z - p.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < pulseRangeSq && d2 > 0.001) {
            const dist = Math.sqrt(d2);
            const falloff = 1 - dist / pulseRange;
            const nx = dx / dist;
            const nz = dz / dist;
            applyDamage(
              other,
              24 * falloff + 8,
              nx * (26 * falloff + 14),
              11 * falloff + 5,
              nz * (26 * falloff + 14),
              p,
            );
          }
        }

        for (let cIdx = 0; cIdx < crystals.length; cIdx++) {
          const c = crystals[cIdx];
          if (!c.active) continue;
          if ((c.spawn.x - p.x) ** 2 + (c.spawn.z - p.z) ** 2 < pulseRangeSq) {
            collectCrystal(p, c, cIdx, crystalUpdatesBuf);
          }
        }

        for (let sIdx = 0; sIdx < sentinels.length; sIdx++) {
          const s = sentinels[sIdx];
          if (s.state === 3) continue;
          const dx = s.x - p.x;
          const dz = s.z - p.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < pulseRangeSq && d2 > 0.001) {
            const dist = Math.sqrt(d2);
            damageSentinel(s, 45, (dx / dist) * 30, (dz / dist) * 30, p);
          }
        }
      }
    }

    // Movement integration (with 3D unrestricted flight in Deep Space!)
    const fwdX = Math.sin(p.yaw);
    const fwdZ = Math.cos(p.yaw);
    const rightX = -Math.cos(p.yaw);
    const rightZ = Math.sin(p.yaw);

    const worldMoveX = rightX * p.input.moveX + fwdX * p.input.moveZ;
    const worldMoveZ = rightZ * p.input.moveX + fwdZ * p.input.moveZ;

    if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
    } else {
      const speedMult =
        (isFrenzy ? 1.38 : 1) *
        (isTurboChaos ? 1.25 : 1) *
        (activeSpecialModeId === 'tiny_giants' ? 1.45 : 1) *
        (p.specialRole === 2 || p.specialRole === 4 || p.specialRole === 9 ? 1.25 : 1) *
        (p.overdriveTimer > 0 ? 1.45 : 1) *
        (p.turboTimer > 0 ? 1.35 : 1) *
        (p.empSlowTimer > 0 ? 0.65 : 1);
      const accel = (spaceMode ? 68 : p.grounded ? 84 : isLowGrav ? 56 : 38) * speedMult;
      const drag = spaceMode ? 1.8 : p.grounded ? 4.4 : 1.25;
      p.vx += worldMoveX * accel * dt;
      p.vz += worldMoveZ * accel * dt;
      p.vx -= p.vx * drag * dt;
      p.vz -= p.vz * drag * dt;

      if (spaceMode) {
        // Vertical 3D spaceship control via camera pitch!
        const climbInput = p.input.moveZ * Math.sin(p.aimPitch);
        p.vy += climbInput * accel * 0.9 * dt;
        p.vy -= p.vy * 1.9 * dt;
      }

      const maxSpeed = 27 * speedMult;
      const horizSpeed = Math.hypot(p.vx, p.vz);
      if (horizSpeed > maxSpeed && (p.grounded || spaceMode)) {
        const s = maxSpeed / horizSpeed;
        p.vx *= s;
        p.vz *= s;
      }
    }

    if (!spaceMode) {
      p.vy -= (isLowGrav ? 14 : 33) * dt;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    if (spaceMode) {
      // Spherical Glowing Energy Barrier Containment
      const cy = 32;
      const dx = p.x;
      const dy = p.y - cy;
      const dz = p.z;
      const d3 = Math.hypot(dx, dy, dz);
      const maxSphere = ARENA_RADIUS - 3.5;
      if (d3 > maxSphere && d3 > 0.01) {
        const s = maxSphere / d3;
        p.x = dx * s;
        p.y = cy + dy * s;
        p.z = dz * s;
        const nx = dx / d3;
        const ny = dy / d3;
        const nz = dz / d3;
        const dot = p.vx * nx + p.vy * ny + p.vz * nz;
        if (dot > 0) {
          p.vx -= 1.6 * dot * nx;
          p.vy -= 1.6 * dot * ny;
          p.vz -= 1.6 * dot * nz;
        }
      }
    }

    const hoverClearance = 1.05 * Math.max(0.75, p.scale * 0.85);
    const footY = p.y - hoverClearance;
    const clamped = clampToArena(p.x, p.z, 1.5 * Math.max(0.7, p.scale), activeMapId, terrainSeed, footY);
    if (clamped.hitWall) {
      const r = Math.hypot(clamped.x, clamped.z);
      if (r > PLAYABLE_RADIUS - 3.5 && r > 0.01) {
        const nx = clamped.x / r;
        const nz = clamped.z / r;
        const dot = p.vx * nx + p.vz * nz;
        if (dot > 0) {
          p.vx -= 1.6 * dot * nx;
          p.vz -= 1.6 * dot * nz;
        }
      }
    }
    p.x = clamped.x;
    p.z = clamped.z;

    if (p.vy > 0) {
      const ceilY = clampApartmentCeiling(p.x, p.z, footY, p.y + 1.2 * Math.max(0.8, p.scale), activeMapId, terrainSeed);
      if (ceilY !== null) {
        p.y = Math.min(p.y, ceilY - 1.2 * Math.max(0.8, p.scale));
        p.vy = 0;
      }
    }

    const groundY = getEffectiveGroundY(p.x, p.z, footY) + hoverClearance;
    if (p.y <= groundY) {
      p.y = groundY;
      if (p.vy < 0) p.vy = spaceMode ? -p.vy * 0.35 : 0;
      p.grounded = true;
    } else {
      p.grounded = false;
    }

    // Rising Magma damage check (Lava Rising Special Mode OR Magma Flood Disaster)
    if ((activeSpecialModeId === 'lava_rising' || activeEventId === 'magma_flood') && p.y - hoverClearance < lavaLevel && p.invulnTimer <= 0) {
      p.shield -= 22 * dt;
      if (p.grounded) {
        p.vy = 11.5;
        p.grounded = false;
      }
      if (p.shield <= 0) {
        shatterPlayer(p, null);
        continue;
      }
    }

    // Solar Ball kick contact in Stadium maps!
    if (solarBall) {
      const bdx = solarBall.x - p.x;
      const bdy = solarBall.y - p.y;
      const bdz = solarBall.z - p.z;
      const bd2 = bdx * bdx + bdy * bdy + bdz * bdz;
      const touchDist = 3.9 * Math.max(0.8, p.scale);
      if (bd2 < touchDist * touchDist && bd2 > 0.001) {
        const dist = Math.sqrt(bd2);
        const nx = bdx / dist;
        const nz = bdz / dist;
        const kickPower = p.dashTimer > 0 ? 44 : 26;
        solarBall.vx = nx * kickPower + p.vx * 0.45;
        solarBall.vy = Math.max(solarBall.vy, p.dashTimer > 0 ? 13 : 6);
        solarBall.vz = nz * kickPower + p.vz * 0.45;
        lastBallToucher = p;
      }
    }

    // Jump pads
    for (let j = 0; j < jumpPads.length; j++) {
      const pad = jumpPads[j];
      const d2 = (p.x - pad.x) ** 2 + (p.z - pad.z) ** 2;
      if (d2 < pad.radius * pad.radius && p.y <= groundHeightAt(pad.x, pad.z, activeMapId, terrainSeed) + 2.8 && p.vy < 8) {
        const jumpMult = isLowGrav ? 1.32 : isTurboChaos ? 1.45 : 1;
        p.vy = pad.boostY * jumpMult;
        p.grounded = false;
        const pr = Math.hypot(pad.x, pad.z) || 1;
        p.vx += (pad.x / pr) * pad.boostRadial;
        p.vz += (pad.z / pr) * pad.boostRadial;
        p.boost = Math.min(100, p.boost + 30);
        break;
      }
    }

    // Boost Rings
    if (p.ringCooldownTimer <= 0) {
      for (let rIdx = 0; rIdx < boostRings.length; rIdx++) {
        const ring = boostRings[rIdx];
        const hitR = ring.radius + 1.1 * Math.max(1, p.scale * 0.6);
        if ((p.x - ring.x) ** 2 + (p.z - ring.z) ** 2 < hitR * hitR && Math.abs(p.y - ring.y) < 5.0) {
          p.ringCooldownTimer = 1.6;
          p.turboTimer = 2.6;
          p.boost = 100;
          p.score += isTurboChaos ? 50 : 30;
          p.vx += fwdX * 14;
          p.vz += fwdZ * 14;
          if (!p.isBot) {
            broadcastJson({
              type: 'fx',
              kind: 'boost_ring',
              x: ring.x,
              y: ring.y,
              z: ring.z,
              actorId: p.slotId,
              amount: isTurboChaos ? 50 : 30,
            });
          }
          break;
        }
      }
    }

    // Mystery Power Orbs
    const orbRad = 4.2 * Math.max(1, p.scale * 0.7);
    const orbRadSq = orbRad * orbRad;
    for (let oIdx = 0; oIdx < powerOrbs.length; oIdx++) {
      const orb = powerOrbs[oIdx];
      if (!orb.active) continue;
      if ((p.x - orb.def.x) ** 2 + (p.y - orb.def.y) ** 2 + (p.z - orb.def.z) ** 2 < orbRadSq) {
        collectPowerOrb(p, orb, oIdx, orbUpdatesBuf);
      }
    }

    const localSideVel = p.vx * rightX + p.vz * rightZ;
    const localFwdVel = p.vx * fwdX + p.vz * fwdZ;
    const targetRoll = spaceMode
      ? Math.max(-1.15, Math.min(1.15, localSideVel * 0.045 + p.input.moveX * 0.55))
      : Math.max(-0.55, Math.min(0.55, localSideVel * 0.025 + p.input.moveX * 0.28));
    // Deep space unlocks full 3D ship pitch orientation!
    const targetPitch = spaceMode
      ? Math.max(-1.45, Math.min(1.45, -p.aimPitch))
      : Math.max(-0.35, Math.min(0.35, -p.vy * 0.016 + localFwdVel * 0.004));
    p.roll += (targetRoll - p.roll) * Math.min(1, dt * 10);
    p.pitch += (targetPitch - p.pitch) * Math.min(1, dt * 10);

    // Ground Weapon Pickups (Preserving exact NBT durability & respecting 1.25s dropper lock!)
    const maxWeaponPickupSlots = p.isBot ? 3 : MAX_WEAPON_SLOTS;
    const pickupRad = 4.2 * Math.max(1, p.scale * 0.7);
    const pickupRadSq = pickupRad * pickupRad;
    for (const gw of groundWeapons.values()) {
      if (gw.pickupLockTimer > 0 && gw.dropperSlotId === p.slotId) continue;
      if ((p.x - gw.x) ** 2 + (p.z - gw.z) ** 2 < pickupRadSq && Math.abs(p.y - gw.y) < 4.8) {
        if (p.weapons.length < maxWeaponPickupSlots || (gw.isSuper && p.weapons.length < MAX_WEAPON_SLOTS)) {
          groundWeapons.delete(gw.uid);
          removedGroundWeaponUidsBuf.push(gw.uid);
          if (activeSuperWeaponUid === gw.uid) activeSuperWeaponUid = null;
          p.weapons.push({
            id: gw.weaponId,
            durability: gw.durability,
            maxDurability: gw.maxDurability,
          });
          if (p.weapons.length === 1 || gw.isSuper) {
            p.equippedWeaponSlot = p.weapons.length - 1;
          }
          sendPlayerWeapons(p, gw.weaponId);
          if (gw.isSuper) {
            const label = p.isBot ? `[BOT] ${p.name}` : p.name;
            broadcastJson({
              type: 'super_weapon_claimed',
              uid: gw.uid,
              weaponId: gw.weaponId,
              name: getWeaponDef(gw.weaponId).name,
              claimerName: label,
              color: getWeaponDef(gw.weaponId).color,
            });
          }
          break;
        } else if (gw.isSuper) {
          let replaceIdx = 0;
          let minDmg = Infinity;
          for (let wIdx = 0; wIdx < p.weapons.length; wIdx++) {
            const wDef = getWeaponDef(p.weapons[wIdx].id);
            const scoreVal = wDef.rarity === 'mythic' ? 9999 : wDef.damage;
            if (scoreVal < minDmg) {
              minDmg = scoreVal;
              replaceIdx = wIdx;
            }
          }
          const swappedOut = p.weapons[replaceIdx];
          groundWeapons.delete(gw.uid);
          removedGroundWeaponUidsBuf.push(gw.uid);
          if (activeSuperWeaponUid === gw.uid) activeSuperWeaponUid = null;

          const dropped = spawnGroundWeaponAt(
            swappedOut.id,
            p.x - Math.sin(p.yaw) * 4,
            p.z - Math.cos(p.yaw) * 4,
            swappedOut.durability,
            swappedOut.maxDurability,
            getWeaponDef(swappedOut.id).rarity === 'mythic',
            true,
            -Math.sin(p.yaw) * 10,
            6.5,
            -Math.cos(p.yaw) * 10,
            p.slotId,
            1.1,
            p.y + 0.8,
          );
          addedGroundWeaponsBuf.push(dropped);
          p.weapons[replaceIdx] = {
            id: gw.weaponId,
            durability: gw.durability,
            maxDurability: gw.maxDurability,
          };
          p.equippedWeaponSlot = replaceIdx;
          sendPlayerWeapons(p, gw.weaponId);
          const label = p.isBot ? `[BOT] ${p.name}` : p.name;
          broadcastJson({
            type: 'super_weapon_claimed',
            uid: gw.uid,
            weaponId: gw.weaponId,
            name: getWeaponDef(gw.weaponId).name,
            claimerName: label,
            color: getWeaponDef(gw.weaponId).color,
          });
          break;
        }
      }
    }

    // Crystal pickups (squared-distance fast sweep!)
    const pickupRadius = p.magnetTimer > 0 ? 26 : 4.8 * Math.max(1, p.scale * 0.8);
    const crystalRadSq = pickupRadius * pickupRadius;
    for (let cIdx = 0; cIdx < crystals.length; cIdx++) {
      const c = crystals[cIdx];
      if (!c.active) continue;
      const dx = p.x - c.spawn.x;
      const dz = p.z - c.spawn.z;
      const d2 = p.magnetTimer > 0 ? dx * dx + dz * dz : dx * dx + (p.y - c.spawn.y) ** 2 + dz * dz;
      if (d2 < crystalRadSq) {
        collectCrystal(p, c, cIdx, crystalUpdatesBuf);
      }
    }

    // Sweeper Beam hazard collision
    const pr = Math.hypot(p.x, p.z);
    if (p.hitCooldown <= 0 && ((pr > 25 && pr < 66) || (pr > 74 && pr < 118))) {
      const pAngle = Math.atan2(p.z, p.x);
      for (let b = 0; b < 2; b++) {
        const bAng = (beamAngle + b * Math.PI) % (Math.PI * 2);
        let diff = Math.abs(pAngle - bAng) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        const arcDist = diff * pr;
        const beamFloorY = groundHeightAt(p.x, p.z, activeMapId, terrainSeed) + 1.3;
        if (arcDist < 2.2 * Math.max(1, p.scale * 0.65) && p.y < beamFloorY + 1.75 * Math.max(1, p.scale * 0.7)) {
          p.hitCooldown = 0.7;
          const tangentX = -Math.sin(bAng);
          const tangentZ = Math.cos(bAng);
          applyDamage(p, 16, tangentX * 18, 9, tangentZ * 18, null);
          break;
        }
      }
    }
  }

  // 3. Player vs Player Kinetic Ram (ONLY active Dash/Overdrive/Titan/Infected deals contact damage; zero passive bumper-car collision damage!)
  for (let i = 0; i < playerList.length; i++) {
    const a = playerList[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < playerList.length; j++) {
      const b = playerList[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const hitRange = (a.scale + b.scale) * 1.65;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= hitRange * hitRange || d2 <= 0.0001) continue;

      const dist = Math.sqrt(d2);
      const nx = dx / dist;
      const nz = dz / dist;

      // Clean positional separation only
      const overlap = (hitRange - dist) * 0.45;
      a.x -= nx * overlap;
      a.z -= nz * overlap;
      b.x += nx * overlap;
      b.z += nz * overlap;

      const sameTeam = isTeamMatch() && a.teamId === b.teamId;
      if (sameTeam) continue;

      const aHot = a.dashTimer > 0 || a.overdriveTimer > 0 || a.specialRole === 1 || a.specialRole === 4;
      const bHot = b.dashTimer > 0 || b.overdriveTimer > 0 || b.specialRole === 1 || b.specialRole === 4;

      if (aHot && (!bHot || a.scale > b.scale + 0.4) && b.hitCooldown <= 0) {
        b.hitCooldown = 0.45;
        applyDamage(b, 42, nx * 24, 9, nz * 24, a);
      } else if (bHot && (!aHot || b.scale > a.scale + 0.4) && a.hitCooldown <= 0) {
        a.hitCooldown = 0.45;
        applyDamage(a, 42, -nx * 24, 9, -nz * 24, b);
      }
    }
  }

  // 4. Update PvE Solar Sentinel Drones
  const sentinelSpeedMult =
    activeSpecialModeId === 'boss_raid_sentinels' ? 1.42 : activeEventId === 'sentinel_surge' ? 1.38 : 1.0;
  for (let sIdx = 0; sIdx < sentinels.length; sIdx++) {
    const s = sentinels[sIdx];
    if (s.state === 3) {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.state = 0;
        s.hp = 100;
        s.x = s.homeX;
        s.z = s.homeZ;
        s.y = getEffectiveGroundY(s.x, s.z) + 2.2;
        s.vx = 0;
        s.vz = 0;
      }
      continue;
    }

    let nearest: ServerPlayer | null = null;
    let nearestDistSq = 28 * 28;
    for (let i = 0; i < playerList.length; i++) {
      const p = playerList[i];
      if (!p.alive) continue;
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestDistSq) {
        nearestDistSq = d2;
        nearest = p;
      }
    }

    if (s.state === 0) {
      s.patrolAngle += dt * 0.7 * sentinelSpeedMult;
      const tx = s.homeX + Math.cos(s.patrolAngle) * 11;
      const tz = s.homeZ + Math.sin(s.patrolAngle) * 11;
      const dx = tx - s.x;
      const dz = tz - s.z;
      s.vx += (dx * 2.2 * sentinelSpeedMult - s.vx) * Math.min(1, dt * 4);
      s.vz += (dz * 2.2 * sentinelSpeedMult - s.vz) * Math.min(1, dt * 4);
      s.yaw = Math.atan2(s.vx, s.vz);

      if (nearest && nearestDistSq < 19 * 19) {
        s.state = 1;
        s.timer = activeEventId === 'sentinel_surge' ? 0.65 : 0.95;
        s.vx *= 0.2;
        s.vz *= 0.2;
      }
    } else if (s.state === 1) {
      s.timer -= dt;
      s.vx *= 0.85;
      s.vz *= 0.85;
      if (nearest) {
        s.yaw = Math.atan2(nearest.x - s.x, nearest.z - s.z);
      }
      if (s.timer <= 0) {
        s.state = 2;
        s.timer = 0.65;
        s.vx = Math.sin(s.yaw) * 32 * sentinelSpeedMult;
        s.vz = Math.cos(s.yaw) * 32 * sentinelSpeedMult;
      }
    } else if (s.state === 2) {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.state = 0;
      }
    }

    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const sc = clampToArena(s.x, s.z, 2.0, activeMapId, terrainSeed);
    s.x = sc.x;
    s.z = sc.z;
    s.y = getEffectiveGroundY(s.x, s.z) + 2.1 + Math.sin(serverTime * 3 + s.id) * 0.25;

    for (let i = 0; i < playerList.length; i++) {
      const p = playerList[i];
      if (!p.alive) continue;
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const hitR = 3.6 * Math.max(1, p.scale * 0.7);
      const d2 = dx * dx + dz * dz;
      if (d2 < hitR * hitR && d2 > 0.0001) {
        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const nz = dz / dist;
        if (p.dashTimer > 0 || p.overdriveTimer > 0) {
          damageSentinel(s, 65, -nx * 24, -nz * 24, p);
          p.vx = nx * 10;
          p.vz = nz * 10;
        } else if (p.hitCooldown <= 0) {
          p.hitCooldown = 0.7;
          applyDamage(p, s.state === 2 ? 24 : 12, nx * 20, 8, nz * 20, null);
        }
      }
    }
  }

  // 5. Update Capture Pylons
  let pylonChanged = false;
  const isDomination = isTeamMatch() && activeNormalModeId === 'pylon_domination';
  for (let i = 0; i < pylons.length; i++) {
    const pylon = pylons[i];
    contendersBuf.length = 0;
    const radSq = pylon.radius * pylon.radius;
    for (let j = 0; j < playerList.length; j++) {
      const p = playerList[j];
      if (!p.alive) continue;
      if ((p.x - pylon.x) ** 2 + (p.z - pylon.z) ** 2 <= radSq) {
        contendersBuf.push(p);
      }
    }

    if (contendersBuf.length === 1) {
      const pilot = contendersBuf[0];
      if (pylon.ownerSlotId !== pilot.slotId) {
        pylon.progress += dt * (isDomination ? 98 : 45);
        if (pylon.progress >= 100) {
          pylon.progress = 100;
          pylon.ownerSlotId = pilot.slotId;
          pylon.ownerName = pilot.name;
          pylon.ownerColor = pilot.colorIndex;
          pylon.ownerTeam = pilot.teamId;
          pylon.payoutTimer = 0;
          pilot.score += isDomination ? 140 : 65;
          pylonChanged = true;
          if (!pilot.isBot || botFxBudget-- > 0) {
            broadcastJson({
              type: 'fx',
              kind: 'capture',
              x: pylon.x,
              y: getEffectiveGroundY(pylon.x, pylon.z) + 4,
              z: pylon.z,
              actorId: pilot.slotId,
              actorName: pilot.isBot ? `[BOT] ${pilot.name}` : pilot.name,
              pylonName: pylon.name,
            });
          }
        } else {
          pylonChanged = true;
        }
      }
    } else if (contendersBuf.length === 0 && pylon.ownerSlotId === null && pylon.progress > 0) {
      pylon.progress = Math.max(0, pylon.progress - dt * 15);
    }

    if (pylon.ownerSlotId !== null) {
      const owner = players.get(pylon.ownerSlotId);
      if (!owner) {
        pylon.ownerSlotId = null;
        pylon.ownerName = '';
        pylon.progress = 0;
        pylonChanged = true;
      } else {
        if (isDomination && owner.alive && (owner.x - pylon.x) ** 2 + (owner.z - pylon.z) ** 2 <= (pylon.radius + 4) ** 2) {
          owner.shield = Math.min(100, owner.shield + dt * 7);
        }
        pylon.payoutTimer += dt;
        if (pylon.payoutTimer >= 2.0) {
          pylon.payoutTimer = 0;
          const mult = isDomination ? 3 : 1;
          owner.score += (pylon.id === 0 ? 25 : 15) * mult;
        }
      }
    }
  }

  // 5b. Nico's Nextbots Special Mode Simulation
  for (let nIdx = 0; nIdx < serverNextbots.length; nIdx++) {
    const nb = serverNextbots[nIdx];
    nb.hitCooldown = Math.max(0, nb.hitCooldown - dt);
    if (nb.banishTimer > 0) {
      nb.banishTimer -= dt;
      if (nb.banishTimer <= 0) {
        nb.banishTimer = 0;
        nb.hp = nb.maxHp;
        const a = Math.random() * Math.PI * 2;
        const r = 110 + Math.random() * 45;
        nb.x = Math.cos(a) * r;
        nb.z = Math.sin(a) * r;
        nb.vx = 0;
        nb.vz = 0;
      }
      continue;
    }

    nb.slowTimer = Math.max(0, nb.slowTimer - dt);
    let nearestTarget: ServerPlayer | null = null;
    let nearestDistSq = Infinity;
    for (let i = 0; i < playerList.length; i++) {
      const p = playerList[i];
      if (!p.alive) continue;
      const d2 = (p.x - nb.x) ** 2 + (p.z - nb.z) ** 2;
      if (d2 < nearestDistSq) {
        nearestDistSq = d2;
        nearestTarget = p;
      }
    }

    const nearestDist = Math.sqrt(nearestDistSq);
    const baseChaseSpeed = 30.5;
    const speedFactor = nb.slowTimer > 0 ? 0.34 : 1.0;
    const targetSpeed = baseChaseSpeed * speedFactor;

    if (nearestTarget && nearestDist > 0.05) {
      const nx = (nearestTarget.x - nb.x) / nearestDist;
      const nz = (nearestTarget.z - nb.z) / nearestDist;
      nb.vx += (nx * targetSpeed - nb.vx) * Math.min(1, dt * (nb.slowTimer > 0 ? 3.5 : 8.5));
      nb.vz += (nz * targetSpeed - nb.vz) * Math.min(1, dt * (nb.slowTimer > 0 ? 3.5 : 8.5));
      nb.yaw = Math.atan2(nb.vx, nb.vz);
    }

    nb.x += nb.vx * dt;
    nb.z += nb.vz * dt;
    const nbFoot = nb.y - 2.8;
    const nc = clampToArena(nb.x, nb.z, 2.6, activeMapId, terrainSeed, nbFoot);
    nb.x = nc.x;
    nb.z = nc.z;
    nb.y = getEffectiveGroundY(nb.x, nb.z, nbFoot) + 2.8 + Math.sin(serverTime * 4.2 + nb.id) * 0.32;

    if (nb.hitCooldown <= 0) {
      for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];
        if (!p.alive || p.invulnTimer > 0) continue;
        const dx = p.x - nb.x;
        const dz = p.z - nb.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 3.6 * 3.6 && Math.abs(p.y - nb.y) < 5.5) {
          const d = Math.max(0.1, Math.sqrt(d2));
          applyDamage(p, nb.slowTimer > 0 ? 28 : 54, (dx / d) * 32, 13, (dz / d) * 32, null);
          nb.hitCooldown = 0.35;
          break;
        }
      }
    }
  }

  // 6. Determine Solar Sovereign
  let topScore = 0;
  let topId = 0xffff;
  for (let i = 0; i < playerList.length; i++) {
    const p = playerList[i];
    if (p.score > topScore) {
      topScore = p.score;
      topId = p.slotId;
    }
  }
  sovereignSlotId = topScore > 0 ? topId : 0xffff;

  // 7. Broadcast deltas
  if (crystalUpdatesBuf.length > 0) {
    broadcastJson({ type: 'crystals_sync', updates: crystalUpdatesBuf });
  }
  if (orbUpdatesBuf.length > 0) {
    broadcastJson({ type: 'orbs_sync', updates: orbUpdatesBuf });
  }
  if (pylonChanged) {
    broadcastJson({ type: 'pylons_sync', pylons: getPylonsPayload() });
  }
  if (addedGroundWeaponsBuf.length > 0 || removedGroundWeaponUidsBuf.length > 0) {
    broadcastJson({
      type: 'ground_weapons_delta',
      added: addedGroundWeaponsBuf,
      removed: removedGroundWeaponUidsBuf,
    });
  }

  dynamicSyncTimer -= dt;
  if (
    dynamicSyncTimer <= 0 &&
    (thrownProjectiles.length > 0 || fireZones.length > 0 || movedGroundWeaponsBuf.length > 0 || solarBall !== null)
  ) {
    dynamicSyncTimer = 0.05;
    broadcastJson({
      type: 'world_dynamics',
      thrownProjectiles,
      fireZones,
      movedGroundWeapons: movedGroundWeaponsBuf,
      solarBall,
    });
  }

  modeHudSyncTimer -= dt;
  if (modeHudSyncTimer <= 0) {
    modeHudSyncTimer = 0.25;
    broadcastJson({ type: 'mode_hud', hud: getModeHudPayload() });
  }

  // 8. Encode & Broadcast binary snapshot
  broadcastBinarySnapshot();
}

setInterval(() => {
  stepSimulation(TICK_DT);
}, 1000 / TICK_RATE);

// REST Status & Memory Telemetry endpoint
app.get('/api/status', (_req, res) => {
  const sovereign = sovereignSlotId !== 0xffff ? players.get(sovereignSlotId) : null;
  const counts = getPilotCounts();
  const mem = process.memoryUsage();
  res.json({
    onlinePlayers: counts.humans,
    botCount: counts.bots,
    totalArena: counts.total,
    maxPlayers: MAX_PLAYERS,
    arenaRadius: ARENA_RADIUS,
    mapId: activeMapId,
    terrainSeed,
    matchNumber,
    normalModeId: activeNormalModeId,
    specialModeId: activeSpecialModeId,
    matchPhase,
    matchTimeRemaining: Math.round(matchTimeRemaining),
    activeEventId,
    solarKills,
    eclipseKills,
    rssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
    heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
    sovereign: sovereign ? { name: sovereign.name, score: sovereign.score, isBot: sovereign.isBot } : null,
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
  });
});

async function startServer() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SOLARIS 100 server running on http://0.0.0.0:${PORT} (max ${MAX_PLAYERS} pilots)`);
  });
}

startServer();
