export const MAX_PLAYERS = 50;
export const ARENA_RADIUS = 175;
export const PLAYABLE_RADIUS = 171;
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;

export const MATCH_DURATION_SECONDS = 180; // 3 minutes per match
export const POSTMATCH_DURATION_SECONDS = 20; // 20 seconds for winner scoreboard + map/mode vote
export const EVENT_INTERVAL_SECONDS = 75; // After 60s round-start disaster ends, next can follow late-round
export const EVENT_DURATION_SECONDS = 60; // Every disaster lasts 1 full minute (60s)
export const RESPAWN_DURATION_SECONDS = 10; // Universal 30s respawn timer for players & bots
export const SUPER_WEAPON_INTERVAL_SECONDS = 30; // Mythic super weapon drop every 30s
export const MAP_WEAPON_COUNT = 18;

export const CRYSTAL_COUNT = 64;
export const BOOST_RING_COUNT = 6;
export const POWER_ORB_COUNT = 6;
export const SENTINEL_COUNT = 6;
export const MAX_SKILL_SLOTS = 5;
export const MAX_WEAPON_SLOTS = 5;
export const STARTER_RECHARGE_SECONDS = 7.0;

export const HULL_PALETTE = [
  { name: 'Solar Amber', hex: '#E68A1E', accent: '#FFF3D1' },
  { name: 'Verdigris Teal', hex: '#14B8A6', accent: '#CCFBF1' },
  { name: 'Cobalt Slate', hex: '#3B82F6', accent: '#DBEAFE' },
  { name: 'Crimson Oxide', hex: '#E11D48', accent: '#FFE4E6' },
  { name: 'Ivory Brass', hex: '#D4AF37', accent: '#FEF9C3' },
  { name: 'Sage Obsidian', hex: '#84CC16', accent: '#ECFCCB' },
  { name: 'Copper Terracotta', hex: '#EA580C', accent: '#FFEDD5' },
  { name: 'Silver Titanium', hex: '#94A3B8', accent: '#F8FAFC' },
] as const;

// ============================================================================
// 11 Distinct 3D Arena Worlds (7 Modern Realms + 4 Classic Arenas)
// ============================================================================

export type MapId =
  | 'metro_city'
  | 'neon_citadel'
  | 'coastal_resort'
  | 'deep_space'
  | 'voxel_lands'
  | 'solaris_stadium'
  | 'sky_pitch'
  | 'solaris_basin'
  | 'obsidian_caldera'
  | 'glacier_atoll'
  | 'jade_terraces';

export type MapKind = 'city' | 'beach' | 'space' | 'voxel' | 'stadium' | 'basin';

export interface MapDef {
  id: MapId;
  index: number;
  kind: MapKind;
  name: string;
  subtitle: string;
  skyHex: number;
  fogDensity: number;
  floorBaseHex: number;
  floorAccentHex: number;
  floorMidHex: number;
  floorRimHex: number;
  stoneHex: number;
  mesaHex: number;
  seaHex: number;
  uiAccent: string;
}

export const MAP_DEFS: readonly MapDef[] = [
  {
    id: 'metro_city',
    index: 0,
    kind: 'city',
    name: 'Skyline Metropolis',
    subtitle: 'Detailed high-rise glass skyscrapers, skybridges & sunlit avenues',
    skyHex: 0xc2dcf2,
    fogDensity: 0.0022,
    floorBaseHex: 0x3b404d,
    floorAccentHex: 0x94a3b8,
    floorMidHex: 0x525a6b,
    floorRimHex: 0x262b36,
    stoneHex: 0xd1d8e0,
    mesaHex: 0x64748b,
    seaHex: 0x1e3a5f,
    uiAccent: '#F59E0B',
  },
  {
    id: 'neon_citadel',
    index: 1,
    kind: 'city',
    name: 'Cyber Neon City',
    subtitle: 'Midnight cyberpunk towers, glowing neon strips & elevated transit decks',
    skyHex: 0x14172b,
    fogDensity: 0.0026,
    floorBaseHex: 0x1e2235,
    floorAccentHex: 0x38bdf8,
    floorMidHex: 0x282e47,
    floorRimHex: 0x0f121e,
    stoneHex: 0x2c344d,
    mesaHex: 0x1b2138,
    seaHex: 0x091529,
    uiAccent: '#38BDF8',
  },
  {
    id: 'coastal_resort',
    index: 2,
    kind: 'beach',
    name: 'Azure Bay City',
    subtitle: 'Sunlit golden beach coast, ocean boardwalk piers, palms & resort towers',
    skyHex: 0xaadbf5,
    fogDensity: 0.0021,
    floorBaseHex: 0xe6d4a8,
    floorAccentHex: 0xf5ebd0,
    floorMidHex: 0xd6c18e,
    floorRimHex: 0x89b7c4,
    stoneHex: 0xf2e7d0,
    mesaHex: 0x82b3a8,
    seaHex: 0x0284c7,
    uiAccent: '#14B8A6',
  },
  {
    id: 'deep_space',
    index: 3,
    kind: 'space',
    name: 'Orbital Starfield',
    subtitle: '3D zero-lock space flight, ringed planets, asteroids & spherical barrier',
    skyHex: 0x050712,
    fogDensity: 0.0014,
    floorBaseHex: 0x1b2033,
    floorAccentHex: 0x6366f1,
    floorMidHex: 0x28304a,
    floorRimHex: 0x111524,
    stoneHex: 0x374151,
    mesaHex: 0x312e81,
    seaHex: 0x03050d,
    uiAccent: '#818CF8',
  },
  {
    id: 'voxel_lands',
    index: 4,
    kind: 'voxel',
    name: 'Voxel Overworld',
    subtitle: 'Blocky stepped grass & stone voxel terraces, cube trees & ore monoliths',
    skyHex: 0x9cd2ff,
    fogDensity: 0.0022,
    floorBaseHex: 0x58a546,
    floorAccentHex: 0x7bc950,
    floorMidHex: 0x7c5a3c,
    floorRimHex: 0x6b7280,
    stoneHex: 0x8b929a,
    mesaHex: 0x528246,
    seaHex: 0x2563eb,
    uiAccent: '#84CC16',
  },
  {
    id: 'solaris_stadium',
    index: 5,
    kind: 'stadium',
    name: 'Solaris Grand Pitch',
    subtitle: 'Championship turf soccer stadium, goals, grandstands & playable Solar Ball',
    skyHex: 0x24304a,
    fogDensity: 0.0019,
    floorBaseHex: 0x1d7a3c,
    floorAccentHex: 0x22994a,
    floorMidHex: 0x15612e,
    floorRimHex: 0x334155,
    stoneHex: 0xe2e8f0,
    mesaHex: 0x334155,
    seaHex: 0x0f172a,
    uiAccent: '#10B981',
  },
  {
    id: 'sky_pitch',
    index: 6,
    kind: 'stadium',
    name: 'Stratosphere Pitch',
    subtitle: 'Floating daylight sky stadium with glass stands, floodlights & Solar Ball',
    skyHex: 0xb7dcff,
    fogDensity: 0.0018,
    floorBaseHex: 0x15803d,
    floorAccentHex: 0x34d399,
    floorMidHex: 0x166534,
    floorRimHex: 0x475569,
    stoneHex: 0xf8fafc,
    mesaHex: 0x64748b,
    seaHex: 0x38bdf8,
    uiAccent: '#34D399',
  },
  {
    id: 'solaris_basin',
    index: 7,
    kind: 'basin',
    name: 'Solar Basin',
    subtitle: 'Sunlit golden limestone hills, terraced valleys & raised citadel',
    skyHex: 0xcbe4f7,
    fogDensity: 0.0020,
    floorBaseHex: 0xd9c79e,
    floorAccentHex: 0xf4ebd0,
    floorMidHex: 0xc4ae7e,
    floorRimHex: 0x8f7a53,
    stoneHex: 0xe6dac0,
    mesaHex: 0x9b8259,
    seaHex: 0x1d4ed8,
    uiAccent: '#EAB308',
  },
  {
    id: 'obsidian_caldera',
    index: 8,
    kind: 'basin',
    name: 'Obsidian Caldera',
    subtitle: 'Volcanic basalt ridges, warm magma sea & glowing ember motes',
    skyHex: 0x1f1419,
    fogDensity: 0.0024,
    floorBaseHex: 0x262128,
    floorAccentHex: 0xf97316,
    floorMidHex: 0x3b2c32,
    floorRimHex: 0x171216,
    stoneHex: 0x45383f,
    mesaHex: 0x2d1f24,
    seaHex: 0xea580c,
    uiAccent: '#F97316',
  },
  {
    id: 'glacier_atoll',
    index: 9,
    kind: 'basin',
    name: 'Glacier Atoll',
    subtitle: 'Crystalline frost slopes, turquoise ice sea & crisp alpine sky',
    skyHex: 0xbfe7ff,
    fogDensity: 0.0019,
    floorBaseHex: 0xd8eef9,
    floorAccentHex: 0xffffff,
    floorMidHex: 0x9bd1eb,
    floorRimHex: 0x4782a6,
    stoneHex: 0xe0f2fe,
    mesaHex: 0x67a9cf,
    seaHex: 0x0284c7,
    uiAccent: '#38BDF8',
  },
  {
    id: 'jade_terraces',
    index: 10,
    kind: 'basin',
    name: 'Jade Terraces',
    subtitle: 'Emerald stepped valleys, mossy cliffs & bronze-trimmed stone monoliths',
    skyHex: 0xb7e4d8,
    fogDensity: 0.0021,
    floorBaseHex: 0x3f7a58,
    floorAccentHex: 0x6ee7b7,
    floorMidHex: 0x2f6145,
    floorRimHex: 0x1f4230,
    stoneHex: 0x94b8a3,
    mesaHex: 0x355c47,
    seaHex: 0x0f766e,
    uiAccent: '#10B981',
  },
] as const;

export function getMapDef(mapId: MapId): MapDef {
  return MAP_DEFS.find((m) => m.id === mapId) || MAP_DEFS[0];
}

export function getMapByIndex(idx: number): MapDef {
  return MAP_DEFS[idx] || MAP_DEFS[0];
}

export function isSpaceMap(mapId: MapId): boolean {
  return getMapDef(mapId).kind === 'space';
}

export function isStadiumMap(mapId: MapId): boolean {
  return getMapDef(mapId).kind === 'stadium';
}

// ============================================================================
// Random Skills & Custom Starter Skills
// ============================================================================

export type SkillId =
  | 'nova_blast'
  | 'phase_blink'
  | 'aegis_dome'
  | 'vortex_snare'
  | 'solar_lance'
  | 'overdrive'
  | 'emp_shock'
  | 'shard_magnet';

export interface SkillDef {
  id: SkillId;
  name: string;
  shortName: string;
  description: string;
  color: string;
}

export const SKILL_DEFS: readonly SkillDef[] = [
  {
    id: 'nova_blast',
    name: 'Nova Burst',
    shortName: 'Nova',
    description: '18m solar blast dealing 48 dmg, knockback & slows Nextbots',
    color: '#F59E0B',
  },
  {
    id: 'phase_blink',
    name: 'Warp Blink',
    shortName: 'Blink',
    description: 'Teleport 24m forward with brief invulnerability',
    color: '#38BDF8',
  },
  {
    id: 'aegis_dome',
    name: 'Aegis Shield',
    shortName: 'Aegis',
    description: 'Restore +45 Shield & 60% dmg reduction for 4.4s',
    color: '#2DD4BF',
  },
  {
    id: 'vortex_snare',
    name: 'Gravity Well',
    shortName: 'Vortex',
    description: 'Pull rivals, crystals & lock Nextbots in 22m for 4s',
    color: '#A855F7',
  },
  {
    id: 'solar_lance',
    name: 'Solar Lance',
    shortName: 'Lance',
    description: 'Pierce 42m beam dealing 56 dmg & staggering foes',
    color: '#EF4444',
  },
  {
    id: 'overdrive',
    name: 'Hyperdrive',
    shortName: 'Drive',
    description: '5.2s +45% speed, rapid boost & lethal contact ram',
    color: '#FB923C',
  },
  {
    id: 'emp_shock',
    name: 'EMP Disrupt',
    shortName: 'EMP',
    description: 'Drain boost, heavily slow Nextbots & rivals for 4.8s',
    color: '#60A5FA',
  },
  {
    id: 'shard_magnet',
    name: 'Shard Magnet',
    shortName: 'Magnet',
    description: '6.5s auto-vacuum crystals within 26m with +50% shards',
    color: '#FACC15',
  },
] as const;

export function getSkillDef(id: SkillId): SkillDef {
  return SKILL_DEFS.find((s) => s.id === id) || SKILL_DEFS[0];
}

export function isValidSkillId(raw: unknown): raw is SkillId {
  return typeof raw === 'string' && SKILL_DEFS.some((s) => s.id === raw);
}

// ============================================================================
// Ground Weapons (Melee, Semi-Auto, 10 Full-Auto Guns, 5 Single-Use Throwables)
// ============================================================================

export type WeaponId =
  | 'twin_fangs'
  | 'solar_katana'
  | 'crimson_odachi'
  | 'cryo_halberd'
  | 'titan_maul'
  | 'pulse_carbine'
  | 'scatter_cannon'
  | 'cryo_rifle'
  | 'rail_sniper'
  | 'arc_launcher'
  | 'excalibur_sun'
  | 'hypernova_gatling'
  | 'void_obliterator'
  | 'chronos_rail'
  // 8 additional Full-Auto Firearms (total 10 Full-Auto)
  | 'solar_smg'
  | 'plasma_ar'
  | 'cryo_repeater'
  | 'flak_autocannon'
  | 'twin_blasters'
  | 'vulcan_rotary'
  | 'arc_lmg'
  | 'photon_burst'
  // 5 Single-Use Throwables
  | 'frag_grenade'
  | 'molotov_cocktail'
  | 'cryo_bomb'
  | 'emp_grenade'
  | 'cluster_bomb';

export type WeaponCategory = 'melee' | 'ranged' | 'throwable';
export type WeaponFireMode = 'melee' | 'semi' | 'auto' | 'throw';
export type WeaponRarity = 'common' | 'rare' | 'mythic';

export interface WeaponDef {
  id: WeaponId;
  index: number; // 1..27 for binary sync (0 = unarmed)
  name: string;
  shortName: string;
  category: WeaponCategory;
  fireMode: WeaponFireMode;
  rarity: WeaponRarity;
  maxDurability: number;
  damage: number;
  range: number;
  cooldown: number;
  knockback: number;
  slowDuration: number;
  splashRadius: number;
  color: string;
  description: string;
}

export interface WeaponSlotState {
  id: WeaponId;
  durability: number;
  maxDurability: number;
}

export interface GroundWeaponSync {
  uid: number;
  weaponId: WeaponId;
  durability: number;
  maxDurability: number;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  isSuper: boolean;
  isDrop: boolean;
}

export interface ThrownProjectileSync {
  uid: number;
  weaponId: WeaponId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
}

export interface FireZoneSync {
  uid: number;
  kind: 'molotov' | 'cryo';
  x: number;
  y: number;
  z: number;
  radius: number;
  remaining: number;
}

export interface DisasterPillarSync {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  kind: 'rock' | 'ice' | 'magma';
}

export interface SolarBallSync {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export const WEAPON_DEFS: readonly WeaponDef[] = [
  // Melee Blades & Close Weapons (1..5)
  {
    id: 'twin_fangs',
    index: 1,
    name: 'Twin Photon Fangs',
    shortName: 'Fangs',
    category: 'melee',
    fireMode: 'melee',
    rarity: 'common',
    maxDurability: 26,
    damage: 28,
    range: 6.4,
    cooldown: 0.25,
    knockback: 11,
    slowDuration: 0,
    splashRadius: 0,
    color: '#10B981',
    description: 'Rapid twin blades for close-quarters shredding',
  },
  {
    id: 'solar_katana',
    index: 2,
    name: 'Solar Katana',
    shortName: 'Katana',
    category: 'melee',
    fireMode: 'melee',
    rarity: 'rare',
    maxDurability: 20,
    damage: 38,
    range: 7.5,
    cooldown: 0.35,
    knockback: 18,
    slowDuration: 0.8,
    splashRadius: 0,
    color: '#38BDF8',
    description: 'Clean crescent slash with lunge momentum',
  },
  {
    id: 'crimson_odachi',
    index: 3,
    name: 'Crimson Odachi',
    shortName: 'Odachi',
    category: 'melee',
    fireMode: 'melee',
    rarity: 'rare',
    maxDurability: 16,
    damage: 54,
    range: 8.6,
    cooldown: 0.54,
    knockback: 26,
    slowDuration: 1.0,
    splashRadius: 0,
    color: '#E11D48',
    description: 'Long greatsword cleaving multiple rivals at once',
  },
  {
    id: 'cryo_halberd',
    index: 4,
    name: 'Frost Halberd',
    shortName: 'Halberd',
    category: 'melee',
    fireMode: 'melee',
    rarity: 'rare',
    maxDurability: 18,
    damage: 44,
    range: 8.2,
    cooldown: 0.48,
    knockback: 22,
    slowDuration: 4.2,
    splashRadius: 0,
    color: '#60A5FA',
    description: 'Freezing polearm slowing rivals & Nextbots for 4.2s',
  },
  {
    id: 'titan_maul',
    index: 5,
    name: 'Kinetic Warmaul',
    shortName: 'Maul',
    category: 'melee',
    fireMode: 'melee',
    rarity: 'rare',
    maxDurability: 14,
    damage: 62,
    range: 7.8,
    cooldown: 0.7,
    knockback: 40,
    slowDuration: 1.6,
    splashRadius: 6.5,
    color: '#F97316',
    description: 'Heavy shockwave hammer launching targets skyward',
  },

  // Ranged Firearms (Semi & Full-Auto 6..10)
  {
    id: 'pulse_carbine',
    index: 6,
    name: 'Pulse Carbine',
    shortName: 'Carbine',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'common',
    maxDurability: 32,
    damage: 20,
    range: 52,
    cooldown: 0.17,
    knockback: 8,
    slowDuration: 0,
    splashRadius: 0,
    color: '#FBBF24',
    description: 'Full-auto rapid plasma carbine (hold Fire)',
  },
  {
    id: 'scatter_cannon',
    index: 7,
    name: 'Scatter Flakgun',
    shortName: 'Shotgun',
    category: 'ranged',
    fireMode: 'semi',
    rarity: 'rare',
    maxDurability: 16,
    damage: 50,
    range: 28,
    cooldown: 0.58,
    knockback: 30,
    slowDuration: 0.5,
    splashRadius: 4.5,
    color: '#FB7185',
    description: 'Semi-auto shotgun blast hitting hard up close',
  },
  {
    id: 'cryo_rifle',
    index: 8,
    name: 'Cryo Stasis Rifle',
    shortName: 'CryoGun',
    category: 'ranged',
    fireMode: 'semi',
    rarity: 'rare',
    maxDurability: 18,
    damage: 34,
    range: 56,
    cooldown: 0.44,
    knockback: 14,
    slowDuration: 5.0,
    splashRadius: 0,
    color: '#22D3EE',
    description: 'Precision stasis ray slowing rivals & Nextbots for 5s',
  },
  {
    id: 'rail_sniper',
    index: 9,
    name: 'Solar Railgun',
    shortName: 'Railgun',
    category: 'ranged',
    fireMode: 'semi',
    rarity: 'rare',
    maxDurability: 12,
    damage: 68,
    range: 95,
    cooldown: 0.88,
    knockback: 26,
    slowDuration: 1.0,
    splashRadius: 0,
    color: '#A855F7',
    description: 'Semi-auto piercing sniper beam with 95m reach',
  },
  {
    id: 'arc_launcher',
    index: 10,
    name: 'Plasma Mortar',
    shortName: 'Mortar',
    category: 'ranged',
    fireMode: 'semi',
    rarity: 'rare',
    maxDurability: 12,
    damage: 54,
    range: 62,
    cooldown: 0.78,
    knockback: 28,
    slowDuration: 1.2,
    splashRadius: 10,
    color: '#F59E0B',
    description: 'Semi-auto mortar detonating a 10m splash sphere',
  },

  // Mythic 30-Second Super Weapons (11..14)
  {
    id: 'excalibur_sun',
    index: 11,
    name: 'SOLARIS EXCALIBUR',
    shortName: 'Excalib',
    category: 'melee',
    fireMode: 'melee',
    rarity: 'mythic',
    maxDurability: 10,
    damage: 94,
    range: 13.5,
    cooldown: 0.44,
    knockback: 42,
    slowDuration: 3.0,
    splashRadius: 9,
    color: '#FACC15',
    description: 'MYTHIC BLADE: Massive sun wave cleaving & freezing foes',
  },
  {
    id: 'hypernova_gatling',
    index: 12,
    name: 'HYPERNOVA GATLING',
    shortName: 'Hypernv',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'mythic',
    maxDurability: 22,
    damage: 42,
    range: 78,
    cooldown: 0.14,
    knockback: 16,
    slowDuration: 1.5,
    splashRadius: 4.0,
    color: '#FB923C',
    description: 'MYTHIC FULL-AUTO: Rotary solar cannon melting squads',
  },
  {
    id: 'void_obliterator',
    index: 13,
    name: 'VOID OBLITERATOR',
    shortName: 'Obliter',
    category: 'ranged',
    fireMode: 'semi',
    rarity: 'mythic',
    maxDurability: 7,
    damage: 98,
    range: 72,
    cooldown: 0.78,
    knockback: 38,
    slowDuration: 5.5,
    splashRadius: 14,
    color: '#C084FC',
    description: 'MYTHIC CANNON: 14m nova blast + 5.5s Nextbot lockdown',
  },
  {
    id: 'chronos_rail',
    index: 14,
    name: 'CHRONOS ANNIHILATOR',
    shortName: 'Chronos',
    category: 'ranged',
    fireMode: 'semi',
    rarity: 'mythic',
    maxDurability: 6,
    damage: 112,
    range: 115,
    cooldown: 0.85,
    knockback: 34,
    slowDuration: 6.5,
    splashRadius: 5,
    color: '#38BDF8',
    description: 'MYTHIC SNIPER: Piercing 115m beam stalling Nextbots 6.5s',
  },

  // 8 Additional Full-Auto Guns (15..22 — 10 total Full-Auto!)
  {
    id: 'solar_smg',
    index: 15,
    name: 'Solar Vector SMG',
    shortName: 'SMG',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'common',
    maxDurability: 38,
    damage: 14,
    range: 40,
    cooldown: 0.11,
    knockback: 5,
    slowDuration: 0,
    splashRadius: 0,
    color: '#FDE047',
    description: 'Full-auto micro-SMG with blistering fire rate',
  },
  {
    id: 'plasma_ar',
    index: 16,
    name: 'Apex Plasma Rifle',
    shortName: 'ApexAR',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'common',
    maxDurability: 30,
    damage: 24,
    range: 64,
    cooldown: 0.2,
    knockback: 10,
    slowDuration: 0,
    splashRadius: 0,
    color: '#34D399',
    description: 'Full-auto precision assault rifle for mid-long duels',
  },
  {
    id: 'cryo_repeater',
    index: 17,
    name: 'Cryo Repeater SMG',
    shortName: 'CryoSMG',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'rare',
    maxDurability: 28,
    damage: 18,
    range: 46,
    cooldown: 0.16,
    knockback: 8,
    slowDuration: 2.8,
    splashRadius: 0,
    color: '#38BDF8',
    description: 'Full-auto frost stream chilling rivals & Nextbots',
  },
  {
    id: 'flak_autocannon',
    index: 18,
    name: 'Flak Autocannon',
    shortName: 'AutoFlak',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'rare',
    maxDurability: 20,
    damage: 32,
    range: 48,
    cooldown: 0.28,
    knockback: 18,
    slowDuration: 0.4,
    splashRadius: 5.5,
    color: '#FB7185',
    description: 'Full-auto explosive flak bursts shredding groups',
  },
  {
    id: 'twin_blasters',
    index: 19,
    name: 'Dual Star Blasters',
    shortName: 'DualBlst',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'common',
    maxDurability: 34,
    damage: 17,
    range: 44,
    cooldown: 0.14,
    knockback: 7,
    slowDuration: 0,
    splashRadius: 0,
    color: '#F472B6',
    description: 'Full-auto twin lasers firing continuous bolts',
  },
  {
    id: 'vulcan_rotary',
    index: 20,
    name: 'Vulcan Minigun',
    shortName: 'Vulcan',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'rare',
    maxDurability: 42,
    damage: 15,
    range: 56,
    cooldown: 0.1,
    knockback: 6,
    slowDuration: 0,
    splashRadius: 0,
    color: '#FB923C',
    description: 'Full-auto 10 RPS rotary cannon for suppressive fire',
  },
  {
    id: 'arc_lmg',
    index: 21,
    name: 'Tesla Arc LMG',
    shortName: 'ArcLMG',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'rare',
    maxDurability: 28,
    damage: 25,
    range: 58,
    cooldown: 0.21,
    knockback: 11,
    slowDuration: 1.4,
    splashRadius: 3.5,
    color: '#60A5FA',
    description: 'Full-auto lightning machine gun shocking nearby foes',
  },
  {
    id: 'photon_burst',
    index: 22,
    name: 'Photon Striker Carbine',
    shortName: 'PhotonAR',
    category: 'ranged',
    fireMode: 'auto',
    rarity: 'rare',
    maxDurability: 26,
    damage: 27,
    range: 68,
    cooldown: 0.22,
    knockback: 12,
    slowDuration: 0,
    splashRadius: 0,
    color: '#C084FC',
    description: 'Full-auto long-barrel carbine with crisp pinpoint accuracy',
  },

  // 5 Single-Use Throwables (23..27 — Hold Fire 3.0s to aim & throw!)
  {
    id: 'frag_grenade',
    index: 23,
    name: 'Solar Frag Grenade',
    shortName: 'Frag',
    category: 'throwable',
    fireMode: 'throw',
    rarity: 'common',
    maxDurability: 1,
    damage: 92,
    range: 66,
    cooldown: 0.4,
    knockback: 42,
    slowDuration: 0.8,
    splashRadius: 15,
    color: '#F59E0B',
    description: 'Hold 3s to aim & throw — 15m high-explosive blast (1 use)',
  },
  {
    id: 'molotov_cocktail',
    index: 24,
    name: 'Plasma Molotov',
    shortName: 'Molotov',
    category: 'throwable',
    fireMode: 'throw',
    rarity: 'common',
    maxDurability: 1,
    damage: 58,
    range: 62,
    cooldown: 0.4,
    knockback: 18,
    slowDuration: 0.5,
    splashRadius: 13,
    color: '#EA580C',
    description: 'Hold 3s to throw — ignites a 4.8s lingering inferno zone (1 use)',
  },
  {
    id: 'cryo_bomb',
    index: 25,
    name: 'Cryo Stasis Bomb',
    shortName: 'CryoBmb',
    category: 'throwable',
    fireMode: 'throw',
    rarity: 'rare',
    maxDurability: 1,
    damage: 50,
    range: 64,
    cooldown: 0.4,
    knockback: 22,
    slowDuration: 5.5,
    splashRadius: 14,
    color: '#22D3EE',
    description: 'Hold 3s to throw — freezes enemies & Nextbots for 5.5s (1 use)',
  },
  {
    id: 'emp_grenade',
    index: 26,
    name: 'EMP Pulse Grenade',
    shortName: 'EMPBmb',
    category: 'throwable',
    fireMode: 'throw',
    rarity: 'rare',
    maxDurability: 1,
    damage: 46,
    range: 66,
    cooldown: 0.4,
    knockback: 24,
    slowDuration: 6.5,
    splashRadius: 16,
    color: '#60A5FA',
    description: 'Hold 3s to throw — drains rival boost & locks Nextbots 6.5s (1 use)',
  },
  {
    id: 'cluster_bomb',
    index: 27,
    name: 'Nova Cluster Charge',
    shortName: 'Cluster',
    category: 'throwable',
    fireMode: 'throw',
    rarity: 'rare',
    maxDurability: 1,
    damage: 86,
    range: 64,
    cooldown: 0.4,
    knockback: 46,
    slowDuration: 1.2,
    splashRadius: 16.5,
    color: '#EF4444',
    description: 'Hold 3s to throw — multi-stage shockwave saturation blast (1 use)',
  },
] as const;

export const REGULAR_WEAPONS: readonly WeaponDef[] = WEAPON_DEFS.filter((w) => w.rarity !== 'mythic');
export const MYTHIC_WEAPONS: readonly WeaponDef[] = WEAPON_DEFS.filter((w) => w.rarity === 'mythic');
export const THROWABLE_WEAPONS: readonly WeaponDef[] = WEAPON_DEFS.filter((w) => w.fireMode === 'throw');
export const AUTO_WEAPONS: readonly WeaponDef[] = WEAPON_DEFS.filter((w) => w.fireMode === 'auto');

export function getWeaponDef(id: WeaponId): WeaponDef {
  return WEAPON_DEFS.find((w) => w.id === id) || WEAPON_DEFS[0];
}

export function getWeaponByIndex(idx: number): WeaponDef | null {
  if (idx <= 0) return null;
  return WEAPON_DEFS.find((w) => w.index === idx) || null;
}

export function isValidWeaponId(raw: unknown): raw is WeaponId {
  return typeof raw === 'string' && WEAPON_DEFS.some((w) => w.id === raw);
}

// ============================================================================
// Nico's Nextbots Definitions (5 Procedural Nextbots)
// ============================================================================

export interface NextbotDef {
  variant: number;
  name: string;
  accent: string;
  tagline: string;
}

export const NEXTBOT_DEFS: readonly NextbotDef[] = [
  { variant: 0, name: 'NICO-01', accent: '#EF4444', tagline: 'Relentless Watcher' },
  { variant: 1, name: 'OBUNGA-EXE', accent: '#F97316', tagline: 'Abyssal Stare' },
  { variant: 2, name: 'SELENE-VOID', accent: '#A855F7', tagline: 'Phantom Glitch' },
  { variant: 3, name: 'SOLAR-WRAITH', accent: '#FACC15', tagline: 'Blinding Core' },
  { variant: 4, name: 'CRYO-STALKER', accent: '#38BDF8', tagline: 'Static Phantom' },
] as const;

export function getNextbotDef(variant: number): NextbotDef {
  return NEXTBOT_DEFS[Math.abs(variant) % NEXTBOT_DEFS.length] || NEXTBOT_DEFS[0];
}

// ============================================================================
// 10 Natural Disasters (Round-Start 60s Duration — Including Height/Complexity Shifts)
// ============================================================================

export type EventId =
  | 'none'
  | 'solar_storm'
  | 'low_gravity'
  | 'hyper_frenzy'
  | 'meteor_shower'
  | 'sentinel_surge'
  | 'tectonic_uplift'
  | 'gold_rush'
  | 'ion_tempest'
  | 'glacial_spires'
  | 'magma_flood';

export interface EventDef {
  id: Exclude<EventId, 'none'>;
  index: number; // 1..10
  name: string;
  summary: string;
  accent: string;
  altersTerrainHeight?: boolean;
}

export const EVENT_DEFS: readonly EventDef[] = [
  {
    id: 'solar_storm',
    index: 1,
    name: 'Solar Overcharge',
    summary: '2x Crystal Shards & ultra-fast crystal respawn across the arena',
    accent: '#FBBF24',
  },
  {
    id: 'low_gravity',
    index: 2,
    name: 'Zero-G Anomaly',
    summary: 'Gravitational collapse — +70% jump lift & high-altitude aerial clashes',
    accent: '#38BDF8',
  },
  {
    id: 'hyper_frenzy',
    index: 3,
    name: 'Kinetic Hyper-Gale',
    summary: '+38% speed, 2x boost regen & rapid Dash/Pulse cooldowns',
    accent: '#F97316',
  },
  {
    id: 'meteor_shower',
    index: 4,
    name: 'Meteor Barrage',
    summary: 'Molten meteors bombard the arena (+45 near-miss Shards)',
    accent: '#EF4444',
  },
  {
    id: 'sentinel_surge',
    index: 5,
    name: 'Sentinel Rampage',
    summary: 'Overclocked Sentinels & faster Sweeper Beam — 3x bounty & free skill',
    accent: '#A855F7',
  },
  {
    id: 'tectonic_uplift',
    index: 6,
    name: 'Tectonic Monoliths',
    summary: 'Seismic uplift raises 8 tall stone platforms & supercharges Jump Pads!',
    accent: '#10B981',
    altersTerrainHeight: true,
  },
  {
    id: 'gold_rush',
    index: 7,
    name: 'Golden Core Fiesta',
    summary: '3x Crystal Shards & accelerated Mystery Skill Orb spawns',
    accent: '#FACC15',
  },
  {
    id: 'ion_tempest',
    index: 8,
    name: 'Ion Lightning Storm',
    summary: 'High-voltage sky bolts strike the terrain & EMP-shock nearby pilots',
    accent: '#60A5FA',
  },
  {
    id: 'glacial_spires',
    index: 9,
    name: 'Glacial Cryo Spires',
    summary: 'Frozen monolith ridges erupt across the arena adding vertical cover!',
    accent: '#22D3EE',
    altersTerrainHeight: true,
  },
  {
    id: 'magma_flood',
    index: 10,
    name: 'Magma Surge Flood',
    summary: 'Rising molten lava floods low ground while raising basalt refuge towers!',
    accent: '#FB7185',
    altersTerrainHeight: true,
  },
] as const;

export function getEventDef(id: EventId): EventDef | null {
  if (id === 'none') return null;
  return EVENT_DEFS.find((e) => e.id === id) || null;
}

export function getEventByIndex(idx: number): EventId {
  const found = EVENT_DEFS.find((e) => e.index === idx);
  return found ? found.id : 'none';
}

export function getEventIndex(id: EventId): number {
  const found = EVENT_DEFS.find((e) => e.id === id);
  return found ? found.index : 0;
}

export type MatchPhase = 'active' | 'postmatch';

// ============================================================================
// Normal Gamemodes (Team-Based Tactical Formats: Solar vs Eclipse!)
// ============================================================================

export type NormalModeId =
  | 'team_clash'
  | 'bounty_hunters'
  | 'pylon_domination'
  | 'arsenal_escalate'
  | 'king_of_hill'
  | 'classic_skirmish';

export interface NormalModeDef {
  id: NormalModeId;
  index: number; // 0..5 packed into snapshot header bits
  name: string;
  summary: string;
  accent: string;
  defaultRoleTitle: string;
  defaultTutorial: string;
  isTeamMode: boolean;
}

export const NORMAL_MODES: readonly NormalModeDef[] = [
  {
    id: 'team_clash',
    index: 0,
    name: 'Solar vs. Eclipse',
    summary: 'Tactical Squad Combat! Zero friendly fire — highest team kills wins!',
    accent: '#38BDF8',
    defaultRoleTitle: 'SQUADRON PILOT',
    defaultTutorial: 'Eliminate rivals with weapons & skills — top team kills wins!',
    isTeamMode: true,
  },
  {
    id: 'bounty_hunters',
    index: 1,
    name: 'Team Bounty Hunt',
    summary: 'Enemy top scorers carry [BOUNTY] tags — shatter them for +220 Shards!',
    accent: '#FACC15',
    defaultRoleTitle: 'BOUNTY TRACKER',
    defaultTutorial: 'Hunt marked enemy [BOUNTY] leaders & stack team kills!',
    isTeamMode: true,
  },
  {
    id: 'pylon_domination',
    index: 2,
    name: 'Citadel Domination',
    summary: '2x faster Pylon capture, 3x Shards & squad shield heal inside held Pylons!',
    accent: '#2DD4BF',
    defaultRoleTitle: 'BASTION CAPTAIN',
    defaultTutorial: 'Secure Solar Pylons with your team & defeat enemy squads!',
    isTeamMode: true,
  },
  {
    id: 'arsenal_escalate',
    index: 3,
    name: 'Squad Gun Game',
    summary: 'Team kills evolve your Arsenal from Twin Fangs up to Mythic Chronos!',
    accent: '#A855F7',
    defaultRoleTitle: 'WEAPON MASTER',
    defaultTutorial: 'Score eliminations to upgrade weapons up the 8-tier ladder!',
    isTeamMode: true,
  },
  {
    id: 'king_of_hill',
    index: 4,
    name: 'Moving Solar Zone',
    summary: 'A golden Solar Zone shifts every 35s — hold it with allies for 2x kills!',
    accent: '#FB923C',
    defaultRoleTitle: 'ZONE CONTENDER',
    defaultTutorial: 'Control the glowing Solar Zone with your squad for 2x kills!',
    isTeamMode: true,
  },
  {
    id: 'classic_skirmish',
    index: 5,
    name: 'Squad Skirmish',
    summary: 'Balanced 25v25 Solar vs. Eclipse gun & skill warfare across all maps!',
    accent: '#E68A1E',
    defaultRoleTitle: 'ARENA PILOT',
    defaultTutorial: 'Loot guns & grenades, support allies & crush the rival team!',
    isTeamMode: true,
  },
] as const;

export const ARSENAL_LADDER: readonly WeaponId[] = [
  'twin_fangs',
  'solar_katana',
  'plasma_ar',
  'scatter_cannon',
  'cryo_rifle',
  'rail_sniper',
  'excalibur_sun',
  'chronos_rail',
] as const;

export function getNormalModeDef(id: NormalModeId): NormalModeDef {
  return NORMAL_MODES.find((m) => m.id === id) || NORMAL_MODES[0];
}

export function getNormalModeByIndex(idx: number): NormalModeId {
  const found = NORMAL_MODES.find((m) => m.index === idx);
  return found ? found.id : 'team_clash';
}

export function getNormalModeIndex(id: NormalModeId): number {
  const found = NORMAL_MODES.find((m) => m.id === id);
  return found ? found.index : 0;
}

export function isValidNormalModeId(raw: unknown): raw is NormalModeId {
  return typeof raw === 'string' && NORMAL_MODES.some((m) => m.id === raw);
}

// ============================================================================
// Special Modes (Dedicated Maps, Special Props & Special Items!)
// ============================================================================

export type SpecialModeId =
  | 'none'
  | 'titan_boss'
  | 'murder_mystery'
  | 'infected_swarm'
  | 'juggernaut_tag'
  | 'vampire_bloodlust'
  | 'tiny_giants'
  | 'glass_cannon'
  | 'skill_roulette'
  | 'turbo_grand_prix'
  | 'low_grav_airshow'
  | 'gold_rush_madness'
  | 'berserk_arena'
  | 'nico_nextbots'
  | 'hide_and_seek'
  | 'lava_rising'
  | 'sniper_duel'
  | 'boss_raid_sentinels';

export interface SpecialModeDef {
  id: Exclude<SpecialModeId, 'none'>;
  index: number;
  name: string;
  summary: string;
  accent: string;
  defaultRoleTitle: string;
  defaultTutorial: string;
  dedicatedMapId?: MapId;
}

export const SPECIAL_MODES: readonly SpecialModeDef[] = [
  {
    id: 'titan_boss',
    index: 1,
    name: 'Colossus Hunt',
    summary: '1 Giant Titan (2.8x size) vs 49 Slayers in Cyber Citadel!',
    accent: '#EF4444',
    defaultRoleTitle: 'TITAN SLAYER',
    defaultTutorial: 'Kill the Giant Titan & loot Mythic weapons for +450 bonus!',
    dedicatedMapId: 'neon_citadel',
  },
  {
    id: 'murder_mystery',
    index: 2,
    name: 'Murder Mystery',
    summary: '1 secret Murderer & 1 Sheriff hunt among 48 Survivors!',
    accent: '#E11D48',
    defaultRoleTitle: 'SURVIVOR',
    defaultTutorial: 'Harvest Shards, grab weapons & survive until the Murderer falls!',
    dedicatedMapId: 'metro_city',
  },
  {
    id: 'infected_swarm',
    index: 3,
    name: 'Infected Outbreak',
    summary: 'Infected pilots convert anyone they shatter!',
    accent: '#84CC16',
    defaultRoleTitle: 'SURVIVOR',
    defaultTutorial: 'Get Cryo/Auto guns & evade the Infected swarm!',
    dedicatedMapId: 'voxel_lands',
  },
  {
    id: 'juggernaut_tag',
    index: 4,
    name: 'Juggernaut Crown',
    summary: 'One 2.2x Juggernaut reigns supreme — shatter them to claim power!',
    accent: '#F59E0B',
    defaultRoleTitle: 'BOUNTY HUNTER',
    defaultTutorial: 'Kill the Golden Juggernaut to steal the 2.2x Crown!',
  },
  {
    id: 'vampire_bloodlust',
    index: 5,
    name: 'Crimson Vampirism',
    summary: 'Shields constantly drain — hit rivals with weapons or skills to heal!',
    accent: '#F43F5E',
    defaultRoleTitle: 'DAYWALKER',
    defaultTutorial: 'Kill rivals & strike fast to steal Shield before yours decays!',
  },
  {
    id: 'tiny_giants',
    index: 6,
    name: 'Micro Dash Fiesta',
    summary: 'Everyone shrinks to 0.58x size with +45% speed & rapid dashes!',
    accent: '#38BDF8',
    defaultRoleTitle: 'MICRO SKIMMER',
    defaultTutorial: 'Harvest Shards & slice tiny foes at +45% hyper speed!',
  },
  {
    id: 'glass_cannon',
    index: 7,
    name: 'Glass Cannon',
    summary: '3x lethal damage & high-stakes 30s respawns!',
    accent: '#FB7185',
    defaultRoleTitle: 'GLASS CANNON',
    defaultTutorial: 'Get any gun or grenade and shatter targets in 1-2 hits!',
  },
  {
    id: 'skill_roulette',
    index: 8,
    name: 'Skill Roulette',
    summary: 'Start with 5 skills & receive free random skills every 5 seconds!',
    accent: '#A855F7',
    defaultRoleTitle: 'SKILL WEAVER',
    defaultTutorial: 'Kill pilots with nonstop skills & cycle fresh powers every 5s!',
  },
  {
    id: 'turbo_grand_prix',
    index: 9,
    name: 'Turbo Grand Prix',
    summary: '+50% top speed, super jump pads & unlimited kinetic dashes!',
    accent: '#F97316',
    defaultRoleTitle: 'HYPER RACER',
    defaultTutorial: 'Get Boost Rings & slash rivals at zero-cooldown Mach speed!',
    dedicatedMapId: 'coastal_resort',
  },
  {
    id: 'low_grav_airshow',
    index: 10,
    name: 'Zero-G Orbital Clash',
    summary: 'Deep Space 3D ship flight + low gravity aerial gunfights!',
    accent: '#60A5FA',
    defaultRoleTitle: 'SKY ACE',
    defaultTutorial: 'Pitch freely in 3D space & snipe airborne targets!',
    dedicatedMapId: 'deep_space',
  },
  {
    id: 'gold_rush_madness',
    index: 11,
    name: 'Golden Core Madness',
    summary: '4x Shard drops & rapid Mythic Weapon spawns!',
    accent: '#FACC15',
    defaultRoleTitle: 'TREASURE RAIDER',
    defaultTutorial: 'Harvest 4x Shards & race for glowing Mythic Weapon beacons!',
  },
  {
    id: 'berserk_arena',
    index: 12,
    name: 'Stadium Striker Brawl',
    summary: 'Soccer Stadium showdown with playable Solar Ball & 2.2x knockback!',
    accent: '#10B981',
    defaultRoleTitle: 'STRIKER ACE',
    defaultTutorial: 'Score Solar Ball goals & launch rivals with grenades/weapons!',
    dedicatedMapId: 'solaris_stadium',
  },
  {
    id: 'nico_nextbots',
    index: 13,
    name: "Nico's Nextbots",
    summary: '5 AI Nextbots hunt Cyber City — Cryo Bombs & EMP Grenades spawn nonstop!',
    accent: '#EF4444',
    defaultRoleTitle: 'NEXTBOT RUNNER',
    defaultTutorial: 'Use Cryo Bombs, EMP & Skills to slow Nextbots while surviving!',
    dedicatedMapId: 'neon_citadel',
  },
  {
    id: 'hide_and_seek',
    index: 14,
    name: 'Predator & Ghosts',
    summary: '4 armed Predators hunt 46 agile Ghosts in Skyline Metropolis!',
    accent: '#C084FC',
    defaultRoleTitle: 'GHOST RUNNER',
    defaultTutorial: 'Use Warp Blink & skyline skyscrapers to evade Predators!',
    dedicatedMapId: 'metro_city',
  },
  {
    id: 'lava_rising',
    index: 15,
    name: 'Magma Surge Climb',
    summary: 'Molten plasma rises continuously — climb Voxel & tectonic spires!',
    accent: '#EA580C',
    defaultRoleTitle: 'MAGMA CLIMBER',
    defaultTutorial: 'Climb elevated Voxel terraces & use Jump Pads to outlast the lava!',
    dedicatedMapId: 'voxel_lands',
  },
  {
    id: 'sniper_duel',
    index: 16,
    name: 'Orbital Railgun Duel',
    summary: '3D Orbital Starfield + Railguns & Warp Blink — crisp 1-tap snipes!',
    accent: '#22D3EE',
    defaultRoleTitle: 'RAILGUN DUELIST',
    defaultTutorial: 'Aim 360° across Deep Space & land 1-tap Railgun snipes!',
    dedicatedMapId: 'deep_space',
  },
  {
    id: 'boss_raid_sentinels',
    index: 17,
    name: 'Sentinel Invasion',
    summary: '10 Super Sentinels swarm — heavy Flak & Cluster Bombs spawn everywhere!',
    accent: '#EC4899',
    defaultRoleTitle: 'SENTINEL BREAKER',
    defaultTutorial: 'Destroy swarming Sentinels with Autocannons & Cluster Bombs!',
    dedicatedMapId: 'sky_pitch',
  },
] as const;

export interface ModeVoteOption {
  key: string;
  kind: 'normal' | 'special';
  id: string;
  name: string;
  subtitle: string;
  accent: string;
}

export interface ModeHudPayload {
  normalModeId: NormalModeId;
  specialModeId: SpecialModeId;
  isTeamMatch?: boolean;
  solarScore?: number;
  eclipseScore?: number;
  solarKills?: number;
  eclipseKills?: number;
  zoneX?: number;
  zoneZ?: number;
  zoneRadius?: number;
  zoneTimer?: number;
  lavaLevel?: number;
  lavaMax?: number;
  bountyName?: string;
  bountyX?: number;
  bountyZ?: number;
  ballX?: number;
  ballZ?: number;
}

export function getSpecialModeDef(id: SpecialModeId): SpecialModeDef | null {
  if (id === 'none') return null;
  return SPECIAL_MODES.find((m) => m.id === id) || null;
}

export function getSpecialModeByIndex(idx: number): SpecialModeId {
  const found = SPECIAL_MODES.find((m) => m.index === idx);
  return found ? found.id : 'none';
}

export function getSpecialModeIndex(id: SpecialModeId): number {
  const found = SPECIAL_MODES.find((m) => m.id === id);
  return found ? found.index : 0;
}

export function isValidSpecialModeId(raw: unknown): raw is Exclude<SpecialModeId, 'none'> {
  return typeof raw === 'string' && SPECIAL_MODES.some((m) => m.id === raw);
}

// ============================================================================
// Procedural Deterministic Terrain & Architecture Layout Generator
// ============================================================================

export interface PillarDef {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export interface ApartmentBuildingDef {
  id: number;
  x: number;
  z: number;
  baseY: number;
  halfW: number;
  halfD: number;
  floorH: number;
  floors: number;
  rot: 0 | 1 | 2 | 3;
  accentIdx: number;
}

export interface JumpPadDef {
  id: number;
  x: number;
  z: number;
  radius: number;
  boostY: number;
  boostRadial: number;
}

export interface PylonDef {
  id: number;
  name: string;
  x: number;
  z: number;
  radius: number;
}

export interface BoostRingDef {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  radius: number;
}

export interface PowerOrbDef {
  id: number;
  x: number;
  y: number;
  z: number;
}

interface TerrainMound {
  x: number;
  z: number;
  invSigmaSq: number;
  amp: number;
}

interface TerrainProfile {
  archetype: number;
  citadelHeight: number;
  phaseX: number;
  phaseZ: number;
  freqMul: number;
  rotOffset: number;
  bastionAngles: number[];
  bastionRadii: number[];
  mounds: TerrainMound[];
  pillars: PillarDef[];
  apartments: ApartmentBuildingDef[];
  jumpPads: JumpPadDef[];
  pylons: PylonDef[];
  boostRings: BoostRingDef[];
  powerOrbs: PowerOrbDef[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const terrainCache = new Map<string, TerrainProfile>();

function evalBaseGround(x: number, z: number, mapId: MapId, prof: TerrainProfile): number {
  const mapDef = getMapDef(mapId);
  const r = Math.hypot(x, z);

  // Soccer stadiums: flat emerald championship pitch with gentle outer apron rim
  if (mapDef.kind === 'stadium') {
    if (r < 126) return 0;
    const t = Math.min(1, (r - 126) / (ARENA_RADIUS - 126));
    return t * t * 5.2;
  }

  // Deep space: central orbital platform + asteroid clusters hovering around 0m
  if (mapDef.kind === 'space') {
    if (r < 28) return 1.5;
    let pad = 0;
    for (let i = 0; i < 4; i++) {
      const a = prof.bastionAngles[i];
      const br = prof.bastionRadii[i];
      const dist = Math.hypot(x - Math.cos(a) * br, z - Math.sin(a) * br);
      if (dist < 22) pad = Math.max(pad, smoothstep(22, 14, dist) * 3.2);
    }
    return pad - 0.5;
  }

  // Coastal Resort Beach: sandy slope down toward outer surf on +Z half, boardwalk & city plaza on -Z half
  if (mapDef.kind === 'beach') {
    let h = z < -18 ? 2.4 + smoothstep(-18, -55, z) * 2.2 : smoothstep(75, -18, z) * 2.1 - 0.4;
    for (let i = 0; i < prof.mounds.length; i++) {
      const m = prof.mounds[i];
      const d2 = (x - m.x) * (x - m.x) + (z - m.z) * (z - m.z);
      h += Math.exp(-d2 * m.invSigmaSq) * m.amp * 0.55;
    }
    if (r > 136 && z < 40) {
      const t = (r - 136) / (ARENA_RADIUS - 136);
      h += t * t * 6.0;
    }
    return Math.max(-1.2, h);
  }

  // Cities: level drivable plazas & avenues with stepped elevated overpasses / bastions
  if (mapDef.kind === 'city') {
    let h = 0;
    if (r < 22) h = 3.2;
    else if (r < 42) h = smoothstep(42, 22, r) * 3.2;
    for (let i = 0; i < 4; i++) {
      const a = prof.bastionAngles[i];
      const br = prof.bastionRadii[i];
      const dist = Math.hypot(x - Math.cos(a) * br, z - Math.sin(a) * br);
      if (dist < 20) h = Math.max(h, smoothstep(20, 12, dist) * 3.0);
    }
    if (r > 136) {
      const t = (r - 136) / (ARENA_RADIUS - 136);
      h += t * t * 6.5;
    }
    // Keep apartment building foundations completely level at y = 0
    for (let i = 0; i < prof.apartments.length; i++) {
      const b = prof.apartments[i];
      const dx = Math.abs(x - b.x);
      const dz = Math.abs(z - b.z);
      const maxSpan = Math.max(b.halfW, b.halfD);
      if (dx < maxSpan + 4 && dz < maxSpan + 4) {
        const d = Math.hypot(dx, dz);
        const flat = smoothstep(maxSpan + 4, maxSpan, d);
        h *= 1 - flat;
      }
    }
    return h;
  }

  // Voxel Overworld: Minecraft-style crisp stepped integer blocks!
  if (mapDef.kind === 'voxel') {
    const gx = Math.round(x / 6) * 6;
    const gz = Math.round(z / 6) * 6;
    const gr = Math.hypot(gx, gz);
    let raw =
      1.6 +
      Math.sin(gx * 0.042 * prof.freqMul + prof.phaseX) * 2.4 +
      Math.cos(gz * 0.042 * prof.freqMul + prof.phaseZ) * 2.2;
    if (gr < 22) raw = Math.max(raw, prof.citadelHeight * 0.85);
    for (let i = 0; i < prof.mounds.length; i++) {
      const m = prof.mounds[i];
      const d2 = (gx - m.x) * (gx - m.x) + (gz - m.z) * (gz - m.z);
      raw += Math.exp(-d2 * m.invSigmaSq) * m.amp;
    }
    if (gr > 132) {
      const t = (gr - 132) / (ARENA_RADIUS - 132);
      raw += t * t * 8.5;
    }
    return Math.max(0, Math.round(raw * 0.65) * 1.5);
  }

  if (mapDef.kind === 'basin') {
    const wx = x * Math.cos(prof.rotOffset) - z * Math.sin(prof.rotOffset);
    const wz = x * Math.sin(prof.rotOffset) + z * Math.cos(prof.rotOffset);
    let h =
      1.6 +
      Math.sin(wx * 0.036 * prof.freqMul + prof.phaseX) *
        Math.cos(wz * 0.036 * prof.freqMul + prof.phaseZ) *
        2.6 *
        smoothstep(18, 48, r) *
        (1 - smoothstep(132, 155, r));
    for (let i = 0; i < prof.mounds.length; i++) {
      const m = prof.mounds[i];
      const d2 = (x - m.x) * (x - m.x) + (z - m.z) * (z - m.z);
      h += Math.exp(-d2 * m.invSigmaSq) * m.amp * 0.85;
    }
    if (r < 20) h = Math.max(h, prof.citadelHeight * 0.82);
    else if (r < 34) h = Math.max(h, smoothstep(34, 20, r) * prof.citadelHeight * 0.82);
    if (r > 134) {
      const t = (r - 134) / (ARENA_RADIUS - 134);
      h += t * t * 7.2;
    }
    return Math.max(-0.8, h);
  }

  const wx = x * Math.cos(prof.rotOffset) - z * Math.sin(prof.rotOffset);
  const wz = x * Math.sin(prof.rotOffset) + z * Math.cos(prof.rotOffset);
  let h =
    0.55 *
    Math.sin(wx * 0.045 * prof.freqMul + prof.phaseX) *
    Math.cos(wz * 0.045 * prof.freqMul + prof.phaseZ) *
    smoothstep(20, 48, r) *
    (1 - smoothstep(125, 145, r));
  if (r <= 24) h = Math.max(h, prof.citadelHeight);
  return Math.max(-0.4, h);
}

function getTerrainProfile(mapId: MapId, seed: number): TerrainProfile {
  const safeSeed = (seed >>> 0) || 1;
  const key = `${mapId}:${safeSeed}`;
  const cached = terrainCache.get(key);
  if (cached) return cached;

  if (terrainCache.size > 16) {
    const oldest = terrainCache.keys().next().value;
    if (oldest) terrainCache.delete(oldest);
  }

  const mapDef = getMapDef(mapId);
  const rng = mulberry32(safeSeed ^ 0x9e3779b9);
  const archetype = Math.floor(rng() * 5);
  const citadelHeight = 4.6 + rng() * 2.2;
  const phaseX = rng() * Math.PI * 2;
  const phaseZ = rng() * Math.PI * 2;
  const freqMul = 0.8 + rng() * 0.45;
  const rotOffset = mapDef.kind === 'stadium' ? 0 : (rng() - 0.5) * 1.4;

  const bastionAngles: number[] = [];
  const bastionRadii: number[] = [];
  for (let i = 0; i < 4; i++) {
    bastionAngles.push((i * Math.PI) / 2 + Math.PI / 4 + rotOffset + (rng() - 0.5) * 0.2);
    bastionRadii.push(78 + rng() * 18);
  }

  const mounds: TerrainMound[] = [];
  const moundCount = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < moundCount; i++) {
    const a = (i * Math.PI * 2) / moundCount + rng() * 0.9;
    const dist = 48 + rng() * 76;
    const sigma = 14 + rng() * 14;
    const isDip = rng() < 0.25;
    const amp = isDip ? -(1.4 + rng() * 1.6) : 2.0 + rng() * 3.0;
    mounds.push({
      x: Math.cos(a) * dist,
      z: Math.sin(a) * dist,
      invSigmaSq: 1 / (2 * sigma * sigma),
      amp,
    });
  }

  const pylonPrefix =
    mapDef.kind === 'stadium'
      ? ['Center Circle', 'NE Corner', 'SE Corner', 'SW Corner', 'NW Corner']
      : mapDef.kind === 'space'
      ? ['Orbital Core', 'Alpha Array', 'Beta Array', 'Gamma Array', 'Delta Array']
      : mapDef.kind === 'voxel'
      ? ['Beacon Core', 'Oak Ridge', 'Iron Crag', 'Emerald Peak', 'Stone Keep']
      : mapDef.kind === 'beach'
      ? ['Harbor Plaza', 'Palm Cove', 'Pier Point', 'Coral Bay', 'Dune Overlook']
      : mapDef.kind === 'basin'
      ? ['Citadel Peak', 'Sunward Crest', 'Valley Bastion', 'Ridge Outpost', 'Sunken Arch']
      : ['Central Plaza', 'North Tower', 'East Tower', 'South Tower', 'West Tower'];

  const pylons: PylonDef[] = [{ id: 0, name: pylonPrefix[0], x: 0, z: 0, radius: 13 }];
  for (let i = 0; i < 4; i++) {
    const a = bastionAngles[i];
    const pr = bastionRadii[i];
    pylons.push({
      id: i + 1,
      name: pylonPrefix[i + 1],
      x: Math.cos(a) * pr,
      z: Math.sin(a) * pr,
      radius: 11,
    });
  }

  const pillars: PillarDef[] = [];
  const apartments: ApartmentBuildingDef[] = [];

  if (mapDef.kind === 'city') {
    // 8 Real Enterable Multi-Story Apartment Buildings ("Chung cu") with stairs & simple interior furniture!
    const slots: Array<{ x: number; z: number; rot: 0 | 1 | 2 | 3 }> = [
      { x: -86, z: -38, rot: 1 },
      { x: -86, z: 38, rot: 1 },
      { x: 86, z: -38, rot: 3 },
      { x: 86, z: 38, rot: 3 },
      { x: -38, z: -86, rot: 2 },
      { x: 38, z: -86, rot: 2 },
      { x: -38, z: 86, rot: 0 },
      { x: 38, z: 86, rot: 0 },
    ];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const bx = s.x + (rng() - 0.5) * 4;
      const bz = s.z + (rng() - 0.5) * 4;
      apartments.push({
        id: i,
        x: bx,
        z: bz,
        baseY: 0,
        halfW: 11,
        halfD: 9,
        floorH: 7.2,
        floors: 2,
        rot: s.rot,
        accentIdx: i % 4,
      });
    }
    // Keep Pylons 1..4 on open city squares well outside apartment walls
    for (let i = 1; i < pylons.length; i++) {
      const py = pylons[i];
      for (let k = 0; k < apartments.length; k++) {
        const b = apartments[k];
        const dx = py.x - b.x;
        const dz = py.z - b.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 26 && dist > 0.01) {
          py.x = b.x + (dx / dist) * 27;
          py.z = b.z + (dz / dist) * 27;
        }
      }
    }
  } else if (mapDef.kind === 'stadium') {
    // Only outer perimeter floodlight / grandstand stanchions (keep pitch clear for soccer!)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8 + Math.PI / 8;
      pillars.push({
        x: Math.cos(a) * 140,
        z: Math.sin(a) * 140,
        radius: 3.4,
        height: 36,
      });
    }
  } else {
    const innerCount = 4 + Math.floor(rng() * 3);
    const innerOffset = rng() * Math.PI * 0.5;
    for (let i = 0; i < innerCount; i++) {
      const a = (i * Math.PI * 2) / innerCount + innerOffset;
      const r = 35 + rng() * 14;
      pillars.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        radius: mapDef.kind === 'voxel' ? 3.2 : 2.5 + rng() * 1.1,
        height: 16 + rng() * 10,
      });
    }
    const outerCount = 8 + Math.floor(rng() * 3);
    const outerOffset = rng() * Math.PI * 0.4;
    for (let i = 0; i < outerCount; i++) {
      const a = (i * Math.PI * 2) / outerCount + outerOffset;
      const r = 108 + rng() * 24;
      pillars.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        radius: mapDef.kind === 'voxel' ? 4.0 : 2.9 + rng() * 1.4,
        height: 20 + rng() * 12,
      });
    }
  }

  const pushOutsideApts = (px: number, pz: number, margin: number): { x: number; z: number } => {
    let x = px;
    let z = pz;
    for (let i = 0; i < apartments.length; i++) {
      const b = apartments[i];
      const hw = (b.rot % 2 === 0 ? b.halfW : b.halfD) + margin;
      const hd = (b.rot % 2 === 0 ? b.halfD : b.halfW) + margin;
      const dx = x - b.x;
      const dz = z - b.z;
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
        const pushX = hw - Math.abs(dx);
        const pushZ = hd - Math.abs(dz);
        if (pushX < pushZ) {
          x = b.x + (dx >= 0 ? hw : -hw);
        } else {
          z = b.z + (dz >= 0 ? hd : -hd);
        }
      }
    }
    return { x, z };
  };

  const jumpPads: JumpPadDef[] = [];
  const padInnerOff = rng() * Math.PI * 0.5;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6 + padInnerOff;
    const r = 50 + rng() * 16;
    const pos = pushOutsideApts(Math.cos(a) * r, Math.sin(a) * r, 5.5);
    jumpPads.push({
      id: i,
      x: pos.x,
      z: pos.z,
      radius: 4.9,
      boostY: 24 + rng() * 4,
      boostRadial: -18,
    });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + padInnerOff + 0.38;
    const r = 124 + rng() * 12;
    const pos = pushOutsideApts(Math.cos(a) * r, Math.sin(a) * r, 5.5);
    jumpPads.push({
      id: 6 + i,
      x: pos.x,
      z: pos.z,
      radius: 5.0,
      boostY: 23 + rng() * 3,
      boostRadial: -19,
    });
  }

  const prof: TerrainProfile = {
    archetype,
    citadelHeight,
    phaseX,
    phaseZ,
    freqMul,
    rotOffset,
    bastionAngles,
    bastionRadii,
    mounds,
    pillars,
    apartments,
    jumpPads,
    pylons,
    boostRings: [],
    powerOrbs: [],
  };

  const ringOff = rng() * Math.PI * 2;
  for (let i = 0; i < BOOST_RING_COUNT; i++) {
    const a = (i * Math.PI * 2) / BOOST_RING_COUNT + ringOff;
    const r = i % 2 === 0 ? 54 + rng() * 8 : 102 + rng() * 14;
    const pos = pushOutsideApts(Math.cos(a) * r, Math.sin(a) * r, 5.5);
    const ry = evalBaseGround(pos.x, pos.z, mapId, prof) + 2.6;
    const tangentYaw = Math.atan2(-Math.sin(a), Math.cos(a));
    prof.boostRings.push({
      id: i,
      x: pos.x,
      y: ry,
      z: pos.z,
      yaw: tangentYaw,
      radius: 4.5,
    });
  }

  const orbOff = rng() * Math.PI * 2;
  for (let i = 0; i < POWER_ORB_COUNT; i++) {
    if (apartments.length > 0 && i >= 2 && i < 6) {
      // Place 4 rooftop/2nd-floor power orbs inside/atop alternating apartment buildings to reward climbing the stairs!
      const b = apartments[(i - 2) * 2];
      prof.powerOrbs.push({
        id: i,
        x: b.x,
        y: b.baseY + b.floorH * (i % 2 === 0 ? 2 : 1) + 1.8,
        z: b.z,
      });
      continue;
    }
    const a = (i * Math.PI * 2) / POWER_ORB_COUNT + orbOff;
    const r = i < 2 ? 32 + rng() * 8 : 92 + rng() * 22;
    const pos = pushOutsideApts(Math.cos(a) * r, Math.sin(a) * r, 4.5);
    const oy = evalBaseGround(pos.x, pos.z, mapId, prof) + 1.9;
    prof.powerOrbs.push({ id: i, x: pos.x, y: oy, z: pos.z });
  }

  terrainCache.set(key, prof);
  return prof;
}

export function getMapPillars(mapId: MapId = 'metro_city', seed = 1): PillarDef[] {
  return getTerrainProfile(mapId, seed).pillars;
}

export function getMapApartments(mapId: MapId = 'metro_city', seed = 1): ApartmentBuildingDef[] {
  return getTerrainProfile(mapId, seed).apartments;
}

export function getMapJumpPads(mapId: MapId = 'metro_city', seed = 1): JumpPadDef[] {
  return getTerrainProfile(mapId, seed).jumpPads;
}

export function getMapPylons(mapId: MapId = 'metro_city', seed = 1): PylonDef[] {
  return getTerrainProfile(mapId, seed).pylons;
}

export function getMapBoostRings(mapId: MapId = 'metro_city', seed = 1): BoostRingDef[] {
  return getTerrainProfile(mapId, seed).boostRings;
}

export function getMapPowerOrbs(mapId: MapId = 'metro_city', seed = 1): PowerOrbDef[] {
  return getTerrainProfile(mapId, seed).powerOrbs;
}

export const PILLARS: PillarDef[] = getMapPillars('metro_city', 1);
export const JUMP_PADS: JumpPadDef[] = getMapJumpPads('metro_city', 1);
export const PYLONS: PylonDef[] = getMapPylons('metro_city', 1);

export function groundHeightAt(x: number, z: number, mapId: MapId = 'metro_city', seed = 1): number {
  const prof = getTerrainProfile(mapId, seed);
  return evalBaseGround(x, z, mapId, prof);
}

function aptWorldToLocal(b: ApartmentBuildingDef, wx: number, wz: number): [number, number] {
  const dx = wx - b.x;
  const dz = wz - b.z;
  if (b.rot === 1) return [dz, -dx];
  if (b.rot === 2) return [-dx, -dz];
  if (b.rot === 3) return [-dz, dx];
  return [dx, dz];
}

function aptLocalVecToWorld(b: ApartmentBuildingDef, lx: number, lz: number): [number, number] {
  if (b.rot === 1) return [-lz, lx];
  if (b.rot === 2) return [-lx, -lz];
  if (b.rot === 3) return [lz, -lx];
  return [lx, lz];
}

export function getApartmentSupportY(
  x: number,
  z: number,
  footY: number,
  mapId: MapId = 'metro_city',
  seed = 1,
): number {
  const prof = getTerrainProfile(mapId, seed);
  let best = evalBaseGround(x, z, mapId, prof);
  const apts = prof.apartments;
  if (apts.length === 0) return best;

  for (let i = 0; i < apts.length; i++) {
    const b = apts[i];
    if (Math.abs(x - b.x) > 15 || Math.abs(z - b.z) > 15) continue;
    const [lx, lz] = aptWorldToLocal(b, x, z);
    if (Math.abs(lx) > b.halfW + 0.55 || Math.abs(lz) > b.halfD + 0.55) continue;

    if (b.baseY > best && footY + 1.65 >= b.baseY) best = b.baseY;

    // Flight 1 Staircase (North wall: lz in [-8.3, -4.5], lx in [-6.3, +6.3], climbs West->East 0 -> 7.2)
    if (lz >= -8.35 && lz <= -4.45 && lx >= -6.35 && lx <= 6.35) {
      const t = Math.max(0, Math.min(1, (lx + 6.0) / 12.0));
      const sy = b.baseY + t * b.floorH;
      if (footY + 1.85 >= sy && sy > best) best = sy;
    }

    // Floor 1 Slab (y = baseY + 7.2) excluding Stairwell 1 opening
    const inCutout1 = lx > -6.3 && lx < 6.05 && lz > -8.35 && lz < -4.45;
    const f1Y = b.baseY + b.floorH;
    if (!inCutout1 && footY + 1.25 >= f1Y && f1Y > best) {
      best = f1Y;
    }

    // Flight 2 Staircase (South wall: lz in [+4.5, +8.3], lx in [-6.3, +6.3], climbs East->West 7.2 -> 14.4)
    if (lz >= 4.45 && lz <= 8.35 && lx >= -6.35 && lx <= 6.35) {
      const t = Math.max(0, Math.min(1, (6.0 - lx) / 12.0));
      const sy = f1Y + t * b.floorH;
      if (footY + 1.85 >= sy && sy > best) best = sy;
    }

    // Rooftop Slab (y = baseY + 14.4) excluding Stairwell 2 opening
    const inCutout2 = lx > -6.05 && lx < 6.3 && lz > 4.45 && lz < 8.35;
    const roofY = b.baseY + b.floorH * 2;
    if (!inCutout2 && footY + 1.25 >= roofY && roofY > best) {
      best = roofY;
    }
  }

  return best;
}

export function clampApartmentCeiling(
  x: number,
  z: number,
  footY: number,
  headY: number,
  mapId: MapId = 'metro_city',
  seed = 1,
): number | null {
  const apts = getTerrainProfile(mapId, seed).apartments;
  for (let i = 0; i < apts.length; i++) {
    const b = apts[i];
    if (Math.abs(x - b.x) > 15 || Math.abs(z - b.z) > 15) continue;
    const [lx, lz] = aptWorldToLocal(b, x, z);
    if (Math.abs(lx) > b.halfW || Math.abs(lz) > b.halfD) continue;

    const f1Y = b.baseY + b.floorH;
    const inCutout1 = lx > -6.35 && lx < 6.1 && lz > -8.4 && lz < -4.4;
    if (!inCutout1 && footY < f1Y - 0.8 && headY > f1Y - 0.35) {
      return f1Y - 0.35;
    }

    const roofY = b.baseY + b.floorH * 2;
    const inCutout2 = lx > -6.1 && lx < 6.35 && lz > 4.4 && lz < 8.4;
    if (!inCutout2 && footY < roofY - 0.8 && headY > roofY - 0.35) {
      return roofY - 0.35;
    }
  }
  return null;
}

function resolveCircleBox2D(
  lx: number,
  lz: number,
  radius: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): [number, number] | null {
  const cx = lx < minX ? minX : lx > maxX ? maxX : lx;
  const cz = lz < minZ ? minZ : lz > maxZ ? maxZ : lz;
  const dx = lx - cx;
  const dz = lz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return null;
  if (d2 > 0.00001) {
    const d = Math.sqrt(d2);
    const push = radius - d;
    return [(dx / d) * push, (dz / d) * push];
  }
  // Center inside box: push out along nearest edge
  const toLeft = lx - minX;
  const toRight = maxX - lx;
  const toTop = lz - minZ;
  const toBot = maxZ - lz;
  const m = Math.min(toLeft, toRight, toTop, toBot);
  if (m === toLeft) return [-(toLeft + radius), 0];
  if (m === toRight) return [toRight + radius, 0];
  if (m === toTop) return [0, -(toTop + radius)];
  return [0, toBot + radius];
}

export function clampToArena(
  x: number,
  z: number,
  radius = 1.6,
  mapId: MapId = 'metro_city',
  seed = 1,
  footY?: number,
): { x: number; z: number; hitWall: boolean } {
  let nx = x;
  let nz = z;
  let hitWall = false;

  const prof = getTerrainProfile(mapId, seed);
  const pillars = prof.pillars;
  for (let i = 0; i < pillars.length; i++) {
    const p = pillars[i];
    const dx = nx - p.x;
    const dz = nz - p.z;
    const d2 = dx * dx + dz * dz;
    const minDist = p.radius + radius;
    if (d2 < minDist * minDist && d2 > 0.00001) {
      const dist = Math.sqrt(d2);
      const push = (minDist - dist) / dist;
      nx += dx * push;
      nz += dz * push;
    }
  }

  const apts = prof.apartments;
  if (apts.length > 0) {
    for (let i = 0; i < apts.length; i++) {
      const b = apts[i];
      if (Math.abs(nx - b.x) > 15 + radius || Math.abs(nz - b.z) > 15 + radius) continue;
      let [lx, lz] = aptWorldToLocal(b, nx, nz);
      const hw = b.halfW;
      const hd = b.halfD;
      const fy = footY ?? 0;

      // Below roof height: collide with 4 sturdy corner structural piers (1.8m x 1.8m)
      if (fy < b.baseY + b.floorH * 2 + 0.8) {
        const corners: Array<[number, number, number, number]> = [
          [-hw, -hw + 2.2, -hd, -hd + 2.0],
          [hw - 2.2, hw, -hd, -hd + 2.0],
          [-hw, -hw + 2.2, hd - 2.0, hd],
          [hw - 2.2, hw, hd - 2.0, hd],
        ];
        for (let c = 0; c < corners.length; c++) {
          const box = corners[c];
          const res = resolveCircleBox2D(lx, lz, radius, box[0], box[1], box[2], box[3]);
          if (res) {
            lx += res[0];
            lz += res[1];
            const [wx, wz] = aptLocalVecToWorld(b, res[0], res[1]);
            nx += wx;
            nz += wz;
            hitWall = true;
          }
        }
      }

      // Ground & Floor 2 window sills (waist height 1.15m above floor; jumping clears them!)
      // Leaves 6.4m-wide center doorways on North/South and 6.0m on East/West completely open on Ground Floor!
      const floorLocalY = fy >= b.baseY + b.floorH * 1.9 ? b.baseY + b.floorH * 2 : fy >= b.baseY + b.floorH * 0.85 ? b.baseY + b.floorH : b.baseY;
      const isGround = floorLocalY < b.baseY + 2;
      const isRoof = floorLocalY >= b.baseY + b.floorH * 1.9;
      if (fy < floorLocalY + 1.1) {
        const wallBoxes: Array<[number, number, number, number]> = isRoof
          ? [
              // Rooftop safety parapet with North/South center jump gaps (|lx| < 2.6)
              [-hw, -2.6, -hd, -hd + 0.7],
              [2.6, hw, -hd, -hd + 0.7],
              [-hw, -2.6, hd - 0.7, hd],
              [2.6, hw, hd - 0.7, hd],
              [-hw, -hw + 0.7, -hd, hd],
              [hw - 0.7, hw, -hd, hd],
            ]
          : isGround
          ? [
              // Ground floor: open 6.4m center doorways on N/S (|lx|<3.2) & E/W (|lz|<3.0)
              [-hw, -3.2, -hd, -hd + 0.85],
              [3.2, hw, -hd, -hd + 0.85],
              [-hw, -3.2, hd - 0.85, hd],
              [3.2, hw, hd - 0.85, hd],
              [-hw, -hw + 0.85, -hd, -3.0],
              [-hw, -hw + 0.85, 3.0, hd],
              [hw - 0.85, hw, -hd, -3.0],
              [hw - 0.85, hw, 3.0, hd],
            ]
          : [
              // Floor 2: open 5m terrace center doors + low 1.1m balcony sills
              [-hw, -2.5, -hd, -hd + 0.8],
              [2.5, hw, -hd, -hd + 0.8],
              [-hw, -2.5, hd - 0.8, hd],
              [2.5, hw, hd - 0.8, hd],
              [-hw, -hw + 0.8, -hd, -2.4],
              [-hw, -hw + 0.8, 2.4, hd],
              [hw - 0.8, hw, -hd, -2.4],
              [hw - 0.8, hw, 2.4, hd],
            ];
        for (let w = 0; w < wallBoxes.length; w++) {
          const wb = wallBoxes[w];
          const res = resolveCircleBox2D(lx, lz, radius, wb[0], wb[1], wb[2], wb[3]);
          if (res) {
            lx += res[0];
            lz += res[1];
            const [wx, wz] = aptLocalVecToWorld(b, res[0], res[1]);
            nx += wx;
            nz += wz;
            hitWall = true;
          }
        }
      }
    }
  }

  const r2 = nx * nx + nz * nz;
  const maxR = PLAYABLE_RADIUS - radius;
  if (r2 > maxR * maxR && r2 > 0.00001) {
    const scale = maxR / Math.sqrt(r2);
    nx *= scale;
    nz *= scale;
    hitWall = true;
  }

  return { x: nx, z: nz, hitWall };
}

function rayIntersectAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  maxT: number,
): number | null {
  let tmin = 0.05;
  let tmax = maxT;

  if (Math.abs(dx) < 1e-6) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - ox) * inv;
    let t2 = (maxX - ox) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(dy) < 1e-6) {
    if (oy < minY || oy > maxY) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - oy) * inv;
    let t2 = (maxY - oy) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(dz) < 1e-6) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - oz) * inv;
    let t2 = (maxZ - oz) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  return tmin <= tmax ? tmin : null;
}

export function raycastApartments(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  mapId: MapId = 'metro_city',
  seed = 1,
): number | null {
  const apts = getTerrainProfile(mapId, seed).apartments;
  if (apts.length === 0) return null;

  let bestT: number | null = null;
  const curMax = () => (bestT !== null ? bestT : maxDist);

  for (let i = 0; i < apts.length; i++) {
    const b = apts[i];
    const [lox, loz] = aptWorldToLocal(b, ox, oz);
    // Quick bounding sphere / AABB reject
    let ldx = dx;
    let ldz = dz;
    if (b.rot === 1) {
      ldx = dz;
      ldz = -dx;
    } else if (b.rot === 2) {
      ldx = -dx;
      ldz = -dz;
    } else if (b.rot === 3) {
      ldx = -dz;
      ldz = dx;
    }

    const hw = b.halfW;
    const hd = b.halfD;
    if (rayIntersectAABB(lox, oy, loz, ldx, dy, ldz, -hw - 1, hw + 1, b.baseY - 1, b.baseY + b.floorH * 2 + 3, -hd - 1, hd + 1, curMax()) === null) {
      continue;
    }

    const topY = b.baseY + b.floorH * 2 + 1.2;
    // 4 Corner structural piers
    const piers: Array<[number, number, number, number]> = [
      [-hw, -hw + 2.2, -hd, -hd + 2.0],
      [hw - 2.2, hw, -hd, -hd + 2.0],
      [-hw, -hw + 2.2, hd - 2.0, hd],
      [hw - 2.2, hw, hd - 2.0, hd],
    ];
    for (let p = 0; p < piers.length; p++) {
      const pr = piers[p];
      const t = rayIntersectAABB(lox, oy, loz, ldx, dy, ldz, pr[0], pr[1], b.baseY, topY, pr[2], pr[3], curMax());
      if (t !== null && (bestT === null || t < bestT)) bestT = t;
    }

    // Floor 1 slab (3 pieces around Stairwell 1 cutout: [-6.3..6.05] x [-8.35..-4.45])
    const f1MinY = b.baseY + b.floorH - 0.5;
    const f1MaxY = b.baseY + b.floorH;
    const f1Pieces: Array<[number, number, number, number]> = [
      [-hw, hw, -4.45, hd],
      [-hw, -6.3, -hd, -4.45],
      [6.05, hw, -hd, -4.45],
      [-6.3, 6.05, -hd, -8.35],
    ];
    for (let s = 0; s < f1Pieces.length; s++) {
      const sp = f1Pieces[s];
      const t = rayIntersectAABB(lox, oy, loz, ldx, dy, ldz, sp[0], sp[1], f1MinY, f1MaxY, sp[2], sp[3], curMax());
      if (t !== null && (bestT === null || t < bestT)) bestT = t;
    }

    // Roof slab (around Stairwell 2 cutout: [-6.05..6.3] x [4.45..8.35])
    const rMinY = b.baseY + b.floorH * 2 - 0.5;
    const rMaxY = b.baseY + b.floorH * 2;
    const rPieces: Array<[number, number, number, number]> = [
      [-hw, hw, -hd, 4.45],
      [-hw, -6.05, 4.45, hd],
      [6.3, hw, 4.45, hd],
      [-6.05, 6.3, 8.35, hd],
    ];
    for (let s = 0; s < rPieces.length; s++) {
      const sp = rPieces[s];
      const t = rayIntersectAABB(lox, oy, loz, ldx, dy, ldz, sp[0], sp[1], rMinY, rMaxY, sp[2], sp[3], curMax());
      if (t !== null && (bestT === null || t < bestT)) bestT = t;
    }
  }

  return bestT;
}

export interface CrystalSpawn {
  id: number;
  x: number;
  y: number;
  z: number;
  value: number;
  kind: 0 | 1; // 0 = standard shard (+15), 1 = solar core (+45)
}

export function generateCrystalLayout(mapId: MapId = 'metro_city', seed = 1): CrystalSpawn[] {
  const list: CrystalSpawn[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const mapPylons = getMapPylons(mapId, seed);
  const rng = mulberry32(((seed >>> 0) || 1) ^ 0x517cc1b7);
  const angleOffset = rng() * Math.PI * 2;

  for (let i = 0; i < CRYSTAL_COUNT; i++) {
    let r: number;
    let angle: number;
    let kind: 0 | 1 = 0;

    if (i < 6) {
      angle = (i * Math.PI * 2) / 6 + angleOffset;
      r = 14;
      kind = 1;
    } else if (i < 14) {
      const pylonIdx = 1 + Math.floor((i - 6) / 2);
      const pylon = mapPylons[pylonIdx] || mapPylons[0];
      const sub = (i - 6) % 2;
      const offA = Math.atan2(pylon.z, pylon.x) + (sub === 0 ? 0.65 : -0.65);
      const cx = pylon.x + Math.cos(offA) * 9;
      const cz = pylon.z + Math.sin(offA) * 9;
      const clampedP = clampToArena(cx, cz, 3.2, mapId, seed);
      list.push({
        id: i,
        x: clampedP.x,
        y: groundHeightAt(clampedP.x, clampedP.z, mapId, seed) + 1.4,
        z: clampedP.z,
        value: 45,
        kind: 1,
      });
      continue;
    } else {
      const idx = i - 14;
      const t = (idx + 0.5) / (CRYSTAL_COUNT - 14);
      r = 28 + Math.sqrt(t) * 124;
      angle = idx * goldenAngle + angleOffset;
      if (i % 10 === 0) kind = 1;
    }

    let x = Math.cos(angle) * r;
    let z = Math.sin(angle) * r;
    const clamped = clampToArena(x, z, 4.5, mapId, seed);
    x = clamped.x;
    z = clamped.z;
    list.push({
      id: i,
      x,
      y: groundHeightAt(x, z, mapId, seed) + 1.35,
      z,
      value: kind === 1 ? 45 : 15,
      kind,
    });
  }
  return list;
}

// ============================================================================
// Binary World Snapshot Codec (Players + Sentinels + Weapon Index + Nextbots)
// ============================================================================

export const SNAPSHOT_MSG_TYPE = 1;
export const HEADER_BYTES = 32;
export const PLAYER_STRIDE = 32;
export const SENTINEL_STRIDE = 20;
export const NEXTBOT_STRIDE = 20;

export interface SnapshotPlayer {
  slotId: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
  pitch: number;
  shield: number;
  alive: boolean;
  dashing: boolean;
  pulsing: boolean;
  sovereign: boolean;
  grounded: boolean;
  isBot: boolean;
  shielded: boolean;
  overdrive: boolean;
  colorIndex: number;
  boost: number;
  score: number;
  scale: number;
  specialRole: number; // 0=normal, 1=giant/jugg, 2=murderer, 3=sheriff, 4=infected, 5=solar, 6=eclipse, 7=bounty, 8=predator, 9=ghost
  weaponKindIndex: number; // 0=none, 1..27=WEAPON_DEFS
  attacking: boolean;
  teamId?: number; // 0=none, 5=Solar, 6=Eclipse
}

export interface SnapshotSentinel {
  id: number;
  state: number; // 0=patrol, 1=windup, 2=charge, 3=respawn
  hp: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface SnapshotNextbot {
  id: number;
  variant: number;
  slowed: boolean;
  banished: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface WorldSnapshot {
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
}

export function encodeSnapshot(snapshot: WorldSnapshot): Uint8Array {
  const pCount = snapshot.players.length;
  const sCount = snapshot.sentinels.length;
  const nCount = snapshot.nextbots.length;
  const totalBytes =
    HEADER_BYTES + pCount * PLAYER_STRIDE + sCount * SENTINEL_STRIDE + nCount * NEXTBOT_STRIDE;
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);

  const headerFlags =
    (snapshot.matchPhase === 'postmatch' ? 1 : 0) |
    ((snapshot.eventIndex & 0x0f) << 1) |
    ((snapshot.normalModeIndex & 0x07) << 5);

  view.setUint8(0, SNAPSHOT_MSG_TYPE);
  view.setUint8(1, sCount);
  view.setUint16(2, pCount, true);
  view.setUint16(4, snapshot.sovereignSlotId & 0xffff, true);
  view.setUint8(6, snapshot.mapIndex & 0xff);
  view.setUint8(7, headerFlags);
  view.setFloat64(8, snapshot.serverTime, true);
  view.setFloat32(16, snapshot.beamAngle, true);
  view.setFloat32(20, snapshot.matchTimeRemaining, true);
  view.setUint32(24, (snapshot.terrainSeed >>> 0) || 1, true);
  view.setUint8(28, snapshot.specialModeIndex & 0xff);
  view.setUint8(29, nCount & 0xff);
  view.setUint16(30, snapshot.matchNumber & 0xffff, true);

  let offset = HEADER_BYTES;
  for (let i = 0; i < pCount; i++) {
    const p = snapshot.players[i];
    const flags =
      (p.alive ? 1 : 0) |
      (p.dashing ? 2 : 0) |
      (p.pulsing ? 4 : 0) |
      (p.sovereign ? 8 : 0) |
      (p.grounded ? 16 : 0) |
      (p.isBot ? 32 : 0) |
      (p.shielded ? 64 : 0) |
      (p.overdrive ? 128 : 0);

    view.setUint16(offset + 0, p.slotId, true);
    view.setUint8(offset + 2, Math.max(0, Math.min(100, Math.round(p.shield))));
    view.setUint8(offset + 3, flags);
    view.setFloat32(offset + 4, p.x, true);
    view.setFloat32(offset + 8, p.y, true);
    view.setFloat32(offset + 12, p.z, true);
    view.setFloat32(offset + 16, p.yaw, true);
    view.setInt8(offset + 20, Math.max(-127, Math.min(127, Math.round(p.roll * 40))));
    view.setInt8(offset + 21, Math.max(-127, Math.min(127, Math.round(p.pitch * 40))));
    view.setUint8(offset + 22, p.colorIndex & 0xff);
    view.setUint8(offset + 23, Math.max(0, Math.min(100, Math.round(p.boost))));
    view.setUint32(offset + 24, Math.max(0, Math.round(p.score)), true);
    view.setUint8(offset + 28, Math.max(10, Math.min(255, Math.round((p.scale || 1) * 40))));
    view.setUint8(offset + 29, p.specialRole & 0xff);
    view.setUint8(offset + 30, p.weaponKindIndex & 0xff);
    const teamCode = p.teamId === 5 ? 1 : p.teamId === 6 ? 2 : 0;
    view.setUint8(offset + 31, (p.attacking ? 1 : 0) | (teamCode << 1));
    offset += PLAYER_STRIDE;
  }

  for (let i = 0; i < sCount; i++) {
    const s = snapshot.sentinels[i];
    view.setUint8(offset + 0, s.id);
    view.setUint8(offset + 1, s.state);
    view.setUint16(offset + 2, Math.max(0, Math.min(100, Math.round(s.hp))), true);
    view.setFloat32(offset + 4, s.x, true);
    view.setFloat32(offset + 8, s.y, true);
    view.setFloat32(offset + 12, s.z, true);
    view.setFloat32(offset + 16, s.yaw, true);
    offset += SENTINEL_STRIDE;
  }

  for (let i = 0; i < nCount; i++) {
    const n = snapshot.nextbots[i];
    const nFlags = (n.slowed ? 1 : 0) | (n.banished ? 2 : 0);
    view.setUint8(offset + 0, n.id & 0xff);
    view.setUint8(offset + 1, n.variant & 0xff);
    view.setUint8(offset + 2, nFlags);
    view.setUint8(offset + 3, 0);
    view.setFloat32(offset + 4, n.x, true);
    view.setFloat32(offset + 8, n.y, true);
    view.setFloat32(offset + 12, n.z, true);
    view.setFloat32(offset + 16, n.yaw, true);
    offset += NEXTBOT_STRIDE;
  }

  return new Uint8Array(buf);
}

export function decodeSnapshot(buffer: ArrayBuffer): WorldSnapshot | null {
  if (buffer.byteLength < HEADER_BYTES) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== SNAPSHOT_MSG_TYPE) return null;

  const sCount = view.getUint8(1);
  const pCount = view.getUint16(2, true);
  const sovereignSlotId = view.getUint16(4, true);
  const mapIndex = view.getUint8(6);
  const headerFlags = view.getUint8(7);
  const matchPhase: MatchPhase = (headerFlags & 1) !== 0 ? 'postmatch' : 'active';
  const eventIndex = (headerFlags >> 1) & 0x0f;
  const normalModeIndex = (headerFlags >> 5) & 0x07;
  const serverTime = view.getFloat64(8, true);
  const beamAngle = view.getFloat32(16, true);
  const matchTimeRemaining = view.getFloat32(20, true);
  const terrainSeed = view.getUint32(24, true) || 1;
  const specialModeIndex = view.getUint8(28);
  const nCount = view.getUint8(29);
  const matchNumber = view.getUint16(30, true) || 1;

  const expected =
    HEADER_BYTES + pCount * PLAYER_STRIDE + sCount * SENTINEL_STRIDE + nCount * NEXTBOT_STRIDE;
  if (buffer.byteLength < expected) return null;

  const players: SnapshotPlayer[] = new Array(pCount);
  let offset = HEADER_BYTES;
  for (let i = 0; i < pCount; i++) {
    const flags = view.getUint8(offset + 3);
    const extraFlags = view.getUint8(offset + 31);
    const teamCode = (extraFlags >> 1) & 0x03;
    players[i] = {
      slotId: view.getUint16(offset + 0, true),
      shield: view.getUint8(offset + 2),
      alive: (flags & 1) !== 0,
      dashing: (flags & 2) !== 0,
      pulsing: (flags & 4) !== 0,
      sovereign: (flags & 8) !== 0,
      grounded: (flags & 16) !== 0,
      isBot: (flags & 32) !== 0,
      shielded: (flags & 64) !== 0,
      overdrive: (flags & 128) !== 0,
      x: view.getFloat32(offset + 4, true),
      y: view.getFloat32(offset + 8, true),
      z: view.getFloat32(offset + 12, true),
      yaw: view.getFloat32(offset + 16, true),
      roll: view.getInt8(offset + 20) / 40,
      pitch: view.getInt8(offset + 21) / 40,
      colorIndex: view.getUint8(offset + 22),
      boost: view.getUint8(offset + 23),
      score: view.getUint32(offset + 24, true),
      scale: (view.getUint8(offset + 28) || 40) / 40,
      specialRole: view.getUint8(offset + 29),
      weaponKindIndex: view.getUint8(offset + 30),
      attacking: (extraFlags & 1) !== 0,
      teamId: teamCode === 1 ? 5 : teamCode === 2 ? 6 : 0,
    };
    offset += PLAYER_STRIDE;
  }

  const sentinels: SnapshotSentinel[] = new Array(sCount);
  for (let i = 0; i < sCount; i++) {
    sentinels[i] = {
      id: view.getUint8(offset + 0),
      state: view.getUint8(offset + 1),
      hp: view.getUint16(offset + 2, true),
      x: view.getFloat32(offset + 4, true),
      y: view.getFloat32(offset + 8, true),
      z: view.getFloat32(offset + 12, true),
      yaw: view.getFloat32(offset + 16, true),
    };
    offset += SENTINEL_STRIDE;
  }

  const nextbots: SnapshotNextbot[] = new Array(nCount);
  for (let i = 0; i < nCount; i++) {
    const nFlags = view.getUint8(offset + 2);
    nextbots[i] = {
      id: view.getUint8(offset + 0),
      variant: view.getUint8(offset + 1),
      slowed: (nFlags & 1) !== 0,
      banished: (nFlags & 2) !== 0,
      x: view.getFloat32(offset + 4, true),
      y: view.getFloat32(offset + 8, true),
      z: view.getFloat32(offset + 12, true),
      yaw: view.getFloat32(offset + 16, true),
    };
    offset += NEXTBOT_STRIDE;
  }

  return {
    serverTime,
    sovereignSlotId,
    beamAngle,
    mapIndex,
    terrainSeed,
    normalModeIndex,
    specialModeIndex,
    matchNumber,
    matchPhase,
    eventIndex,
    matchTimeRemaining,
    players,
    sentinels,
    nextbots,
  };
}
