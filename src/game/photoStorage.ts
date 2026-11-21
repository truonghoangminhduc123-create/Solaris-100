import type { DisasterPillarSync, EventId, MapId, WeaponId } from '../../shared/world';

export interface FrozenSnapshotPlayer {
  slotId: number;
  name: string;
  isBot: boolean;
  teamId: 0 | 5 | 6;
  colorIndex: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
  pitch: number;
  scale: number;
  weaponKindIndex: number;
  shield: number;
  dashing: boolean;
  sovereign: boolean;
  shielded: boolean;
  overdrive: boolean;
  attacking: boolean;
  specialRole: number;
}

export interface FrozenSnapshotNextbot {
  id: number;
  typeIndex: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  slowed: boolean;
  banished: boolean;
}

export interface FrozenSnapshotSentinel {
  x: number;
  y: number;
  z: number;
  rotY: number;
  state: number;
}

export interface FrozenSnapshotGroundWeapon {
  uid: number;
  id: WeaponId;
  x: number;
  y: number;
  z: number;
  spinY: number;
}

export interface FrozenSnapshotBeam {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  length: number;
  colorHex: number;
  opacity: number;
}

export interface FrozenSnapshotBullet {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  length: number;
  colorHex: number;
  mythic: boolean;
}

export interface FrozenSnapshotRing {
  x: number;
  y: number;
  z: number;
  scale: number;
  colorHex: number;
  opacity: number;
}

export interface FrozenSnapshotSpark {
  x: number;
  y: number;
  z: number;
  scale: number;
  colorHex: number;
}

export interface FrozenSnapshotSmoke {
  x: number;
  y: number;
  z: number;
  scale: number;
  colorHex: number;
  opacity: number;
  additive: boolean;
}

export interface FrozenSnapshotMeteor {
  x: number;
  y: number;
  groundY: number;
  z: number;
  radius: number;
}

export interface FrozenSnapshotThrown {
  uid: number;
  weaponId: WeaponId;
  x: number;
  y: number;
  z: number;
  color: string;
}

export interface FrozenSceneSnapshot {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  mapId: MapId;
  terrainSeed: number;
  activeEventId: EventId;
  beamAngle: number;
  localSlotId: number | null;
  localTeamId: 0 | 5 | 6;
  camera: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    fov: number;
  };
  players: FrozenSnapshotPlayer[];
  nextbots: FrozenSnapshotNextbot[];
  sentinels: FrozenSnapshotSentinel[];
  solarBall: { x: number; y: number; z: number } | null;
  groundWeapons: FrozenSnapshotGroundWeapon[];
  thrownProjectiles: FrozenSnapshotThrown[];
  crystals: boolean[];
  pylons: Array<{
    id: number;
    name: string;
    ownerSlotId: number | null;
    ownerName: string;
    ownerColor: number;
    progress: number;
  }>;
  disasterPillars: DisasterPillarSync[];
  beams: FrozenSnapshotBeam[];
  bullets: FrozenSnapshotBullet[];
  rings: FrozenSnapshotRing[];
  sparks: FrozenSnapshotSpark[];
  smoke: FrozenSnapshotSmoke[];
  meteors: FrozenSnapshotMeteor[];
}

const STORAGE_KEY = 'solaris100_photos_v1';
const MAX_SAVED_PHOTOS = 32;

export function loadSavedPhotos(): FrozenSceneSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FrozenSceneSnapshot =>
        Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.mapId === 'string'),
    );
  } catch {
    return [];
  }
}

function persistPhotos(list: FrozenSceneSnapshot[]): void {
  const trimmed = list.slice(0, MAX_SAVED_PHOTOS);
  for (let limit = trimmed.length; limit >= 1; limit--) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed.slice(0, limit)));
      return;
    } catch {
      // QuotaExceededError: evict oldest snapshot and retry
    }
  }
}

export function saveNewPhoto(snapshot: FrozenSceneSnapshot): FrozenSceneSnapshot[] {
  const existing = loadSavedPhotos().filter((p) => p.id !== snapshot.id);
  const next = [snapshot, ...existing].slice(0, MAX_SAVED_PHOTOS);
  persistPhotos(next);
  return loadSavedPhotos();
}

export function renameSavedPhoto(id: string, nextName: string): FrozenSceneSnapshot[] {
  const cleaned = nextName.trim().slice(0, 64);
  const next = loadSavedPhotos().map((p) => (p.id === id ? { ...p, name: cleaned } : p));
  persistPhotos(next);
  return next;
}

export function deleteSavedPhoto(id: string): FrozenSceneSnapshot[] {
  const next = loadSavedPhotos().filter((p) => p.id !== id);
  persistPhotos(next);
  return next;
}
