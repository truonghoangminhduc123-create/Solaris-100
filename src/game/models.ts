import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ARENA_RADIUS,
  HULL_PALETTE,
  NEXTBOT_DEFS,
  getMapApartments,
  getMapBoostRings,
  getMapDef,
  getMapJumpPads,
  getMapPillars,
  getMapPowerOrbs,
  getMapPylons,
  getWeaponByIndex,
  getWeaponDef,
  groundHeightAt,
} from '../../shared/world';
import type { MapId, WeaponId } from '../../shared/world';
import type { MaterialBank } from './materials';

function mergeNormalized(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared: THREE.BufferGeometry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const src = parts[i];
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (g.getAttribute('tangent')) g.deleteAttribute('tangent');
    if (g.getAttribute('color')) g.deleteAttribute('color');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      const count = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    prepared.push(g);
    src.dispose();
  }
  const merged = mergeGeometries(prepared, false);
  for (let i = 0; i < prepared.length; i++) {
    prepared[i].dispose();
  }
  if (!merged) {
    return new THREE.BoxGeometry(0.1, 0.1, 0.1);
  }
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

export interface SkimmerRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  hullMesh: THREE.Mesh;
  wingsMesh: THREE.Mesh;
  chassisMesh: THREE.Mesh;
  canopyMesh: THREE.Mesh;
  thrusterFlame: THREE.Mesh;
  haloRing: THREE.Mesh;
  shieldRing: THREE.Mesh;
  sovereignCrown: THREE.Mesh;
  shadowPlane: THREE.Mesh;
  pulseWaveMesh: THREE.Mesh;
  playerBeacon: THREE.Mesh;
  weaponMount: THREE.Group;
  setColorIndex: (idx: number) => void;
  setLodMode: (useLambert: boolean, materials: MaterialBank) => void;
  setWeaponIndex: (weaponIndex: number, materials: MaterialBank, useLambert?: boolean) => void;
  setVisualState: (opts: {
    shield: number;
    dashing: boolean;
    sovereign: boolean;
    shielded: boolean;
    overdrive: boolean;
    attacking?: boolean;
    isHumanMarker?: boolean;
    markerColorHex?: number;
    groundY: number;
    roll: number;
    pitch: number;
    dt: number;
    elapsed: number;
    lowDetail?: boolean;
    farDetail?: boolean;
  }) => void;
  triggerPulseVisual: () => void;
}

export interface SentinelRig {
  root: THREE.Group;
  coreGroup: THREE.Group;
  blades: THREE.Group;
  telegraphRing: THREE.Mesh;
  shadowPlane: THREE.Mesh;
  setShadowsEnabled: (enabled: boolean) => void;
}

export interface NextbotRig {
  root: THREE.Group;
  frameGroup: THREE.Group;
  slowAura: THREE.Mesh;
  dangerRing: THREE.Mesh;
  shadowPlane: THREE.Mesh;
  setVisualState: (opts: {
    slowed: boolean;
    banished: boolean;
    groundY: number;
    dt: number;
    elapsed: number;
  }) => void;
  dispose: () => void;
}

export interface GroundWeaponRig {
  root: THREE.Group;
  modelGroup: THREE.Group;
  ringMesh: THREE.Mesh;
  beaconMesh: THREE.Mesh | null;
  dispose: () => void;
}

export interface PylonVisual {
  id: number;
  ringMesh: THREE.Mesh;
  beaconMesh: THREE.Mesh;
  ringMat: THREE.MeshStandardMaterial;
  beaconMat: THREE.MeshStandardMaterial;
}

export interface ArenaEnvironment {
  group: THREE.Group;
  sweeperGroup: THREE.Group;
  jumpPadRings: THREE.Mesh[];
  boostRingMeshes: THREE.Mesh[];
  powerOrbMeshes: THREE.Mesh[];
  pylonVisuals: PylonVisual[];
  ambientPoints: THREE.Points;
  seaMesh: THREE.Mesh;
  seaMat: THREE.MeshStandardMaterial;
  skyMesh: THREE.Mesh;
  skyMat: THREE.MeshBasicMaterial;
  setShadowsEnabled: (enabled: boolean) => void;
  setMobileLowMode: (enabled: boolean) => void;
  updateWaterTime: (elapsed: number) => void;
  dispose: () => void;
}

let sharedSkimmerGeos: {
  hull: THREE.BufferGeometry;
  wings: THREE.BufferGeometry;
  chassisDetails: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  flame: THREE.BufferGeometry;
  halo: THREE.TorusGeometry;
  shieldRing: THREE.TorusGeometry;
  crown: THREE.OctahedronGeometry;
  shadow: THREE.PlaneGeometry;
  pulseSphere: THREE.SphereGeometry;
  playerBeacon: THREE.OctahedronGeometry;
} | null = null;

function ensureSharedSkimmerGeos() {
  if (sharedSkimmerGeos) return sharedSkimmerGeos;

  // 1) Sculpted multi-chine interceptor hull + dorsal stabilizer spine
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 2.02);
  hullShape.lineTo(0.32, 1.25);
  hullShape.lineTo(0.76, 0.35);
  hullShape.lineTo(0.68, -0.45);
  hullShape.lineTo(0.56, -1.28);
  hullShape.lineTo(0.24, -1.58);
  hullShape.lineTo(-0.24, -1.58);
  hullShape.lineTo(-0.56, -1.28);
  hullShape.lineTo(-0.68, -0.45);
  hullShape.lineTo(-0.76, 0.35);
  hullShape.lineTo(-0.32, 1.25);
  hullShape.closePath();

  const mainHull = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.11,
    bevelSize: 0.08,
    bevelSegments: 2,
  });
  mainHull.rotateX(Math.PI / 2);
  mainHull.translate(0, 0.24, 0);

  const spineFin = new THREE.BoxGeometry(0.1, 0.36, 1.15);
  spineFin.rotateX(-0.18);
  spineFin.translate(0, 0.38, -0.78);

  const noseCanardL = new THREE.BoxGeometry(0.45, 0.05, 0.26);
  noseCanardL.rotateY(0.38);
  noseCanardL.translate(-0.46, 0.14, 1.05);

  const noseCanardR = new THREE.BoxGeometry(0.45, 0.05, 0.26);
  noseCanardR.rotateY(-0.38);
  noseCanardR.translate(0.46, 0.14, 1.05);

  const hull = mergeNormalized([mainHull, spineFin, noseCanardL, noseCanardR]);

  // 2) Merged Left + Right Gull Wings + Angled Vertical Wingtip Winglets (1 draw call!)
  const wingShapeR = new THREE.Shape();
  wingShapeR.moveTo(0.48, 0.42);
  wingShapeR.lineTo(1.74, -0.58);
  wingShapeR.lineTo(1.56, -1.24);
  wingShapeR.lineTo(0.45, -0.96);
  wingShapeR.closePath();

  const wingRGeo = new THREE.ExtrudeGeometry(wingShapeR, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  wingRGeo.rotateX(Math.PI / 2);
  wingRGeo.rotateZ(-0.07);
  wingRGeo.translate(0, 0.12, 0);

  const wingShapeL = new THREE.Shape();
  wingShapeL.moveTo(-0.48, 0.42);
  wingShapeL.lineTo(-0.45, -0.96);
  wingShapeL.lineTo(-1.56, -1.24);
  wingShapeL.lineTo(-1.74, -0.58);
  wingShapeL.closePath();

  const wingLGeo = new THREE.ExtrudeGeometry(wingShapeL, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  wingLGeo.rotateX(Math.PI / 2);
  wingLGeo.rotateZ(0.07);
  wingLGeo.translate(0, 0.12, 0);

  const wingletShape = new THREE.Shape();
  wingletShape.moveTo(0, 0);
  wingletShape.lineTo(0.55, 0);
  wingletShape.lineTo(0.32, 0.48);
  wingletShape.lineTo(-0.05, 0.44);
  wingletShape.closePath();

  const wingletR = new THREE.ExtrudeGeometry(wingletShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  wingletR.rotateY(Math.PI / 2);
  wingletR.rotateZ(-0.22);
  wingletR.translate(1.58, 0.04, -0.68);

  const wingletL = new THREE.ExtrudeGeometry(wingletShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  wingletL.rotateY(Math.PI / 2);
  wingletL.rotateZ(0.22);
  wingletL.translate(-1.62, 0.04, -0.68);

  const wings = mergeNormalized([wingRGeo, wingLGeo, wingletR, wingletL]);

  // 3) Merged Under-Chassis Keel + Twin Side Intakes + Repulsor Skids + Twin Vector Nozzles (1 draw call!)
  const underKeel = new THREE.BoxGeometry(0.74, 0.22, 2.35);
  underKeel.translate(0, -0.14, -0.08);

  const intakeL = new THREE.BoxGeometry(0.24, 0.26, 0.92);
  intakeL.translate(-0.56, 0.06, 0.16);
  const intakeR = new THREE.BoxGeometry(0.24, 0.26, 0.92);
  intakeR.translate(0.56, 0.06, 0.16);

  const skiL = new THREE.BoxGeometry(0.11, 0.1, 1.95);
  skiL.translate(-0.46, -0.34, 0.05);
  const skiR = new THREE.BoxGeometry(0.11, 0.1, 1.95);
  skiR.translate(0.46, -0.34, 0.05);

  const nozL = new THREE.CylinderGeometry(0.18, 0.24, 0.44, 10);
  nozL.rotateX(Math.PI / 2);
  nozL.translate(-0.24, 0.04, -1.46);
  const nozR = new THREE.CylinderGeometry(0.18, 0.24, 0.44, 10);
  nozR.rotateX(Math.PI / 2);
  nozR.translate(0.24, 0.04, -1.46);

  const chassisDetails = mergeNormalized([underKeel, intakeL, intakeR, skiL, skiR, nozL, nozR]);

  // 4) Faceted Cockpit Canopy + Twin Afterburner Vector Flames
  const canopyBase = new THREE.SphereGeometry(0.36, 14, 10);
  canopyBase.scale(0.92, 0.62, 1.98);
  const canopy = canopyBase;

  const flameL = new THREE.ConeGeometry(0.19, 1.32, 10);
  flameL.rotateX(-Math.PI / 2);
  flameL.translate(-0.24, 0, -0.66);
  const flameR = new THREE.ConeGeometry(0.19, 1.32, 10);
  flameR.rotateX(-Math.PI / 2);
  flameR.translate(0.24, 0, -0.66);
  const flame = mergeNormalized([flameL, flameR]);

  sharedSkimmerGeos = {
    hull,
    wings,
    chassisDetails,
    canopy,
    flame,
    halo: new THREE.TorusGeometry(0.86, 0.045, 8, 24),
    shieldRing: new THREE.TorusGeometry(1.62, 0.042, 8, 28),
    crown: new THREE.OctahedronGeometry(0.42, 0),
    shadow: new THREE.PlaneGeometry(3.4, 3.4),
    pulseSphere: new THREE.SphereGeometry(1, 16, 12),
    playerBeacon: new THREE.OctahedronGeometry(0.32, 0),
  };

  return sharedSkimmerGeos;
}

// Sculpted 3D Weapon Silhouettes using beveled ExtrudeGeometry & multi-part merged hardware
let sharedWeaponGeos: {
  grip: THREE.BoxGeometry;
  guard: THREE.BufferGeometry;
  bladeThin: THREE.BufferGeometry;
  bladeLong: THREE.BufferGeometry;
  pole: THREE.CylinderGeometry;
  axeHead: THREE.BufferGeometry;
  maulHead: THREE.BufferGeometry;
  receiver: THREE.BufferGeometry;
  barrel: THREE.BufferGeometry;
  railBar: THREE.BoxGeometry;
  stock: THREE.BoxGeometry;
  cell: THREE.CylinderGeometry;
  orb: THREE.OctahedronGeometry;
} | null = null;

function createKatanaBladeGeo(length: number, width: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(length * 0.84, width * 0.08);
  s.lineTo(length, width * 0.85);
  s.lineTo(length * 0.78, width);
  s.lineTo(0, width * 0.92);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 1,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(0.018, -width * 0.45, -length * 0.5);
  geo.computeVertexNormals();
  return geo;
}

function ensureSharedWeaponGeos() {
  if (sharedWeaponGeos) return sharedWeaponGeos;

  const pole = new THREE.CylinderGeometry(0.05, 0.055, 2.15, 8);
  pole.rotateX(Math.PI / 2);

  // Sculpted fluted barrel + collar rings + muzzle brake
  const mainBarrel = new THREE.CylinderGeometry(0.068, 0.082, 1.32, 10);
  mainBarrel.rotateX(Math.PI / 2);
  const muzzle = new THREE.CylinderGeometry(0.095, 0.08, 0.22, 8);
  muzzle.rotateX(Math.PI / 2);
  muzzle.translate(0, 0, 0.64);
  const shroud = new THREE.BoxGeometry(0.18, 0.14, 0.68);
  shroud.translate(0, 0.02, -0.2);
  const barrel = mergeNormalized([mainBarrel, muzzle, shroud]);

  // Flanged octagonal Titan Maul head
  const maulCore = new THREE.CylinderGeometry(0.32, 0.32, 0.72, 8);
  maulCore.rotateZ(Math.PI / 2);
  const flangeL = new THREE.CylinderGeometry(0.36, 0.3, 0.14, 8);
  flangeL.rotateZ(Math.PI / 2);
  flangeL.translate(-0.34, 0, 0);
  const flangeR = new THREE.CylinderGeometry(0.3, 0.36, 0.14, 8);
  flangeR.rotateZ(Math.PI / 2);
  flangeR.translate(0.34, 0, 0);
  const maulHead = mergeNormalized([maulCore, flangeL, flangeR]);

  // Crescent Halberd Axe Blade
  const axeShape = new THREE.Shape();
  axeShape.moveTo(0, -0.14);
  axeShape.lineTo(0.42, -0.34);
  axeShape.quadraticCurveTo(0.6, 0, 0.44, 0.36);
  axeShape.lineTo(0, 0.16);
  axeShape.lineTo(-0.22, 0.04);
  axeShape.lineTo(-0.22, -0.04);
  axeShape.closePath();
  const axeHead = new THREE.ExtrudeGeometry(axeShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  axeHead.rotateX(Math.PI / 2);
  axeHead.translate(0, 0.025, 0);
  axeHead.computeVertexNormals();

  // Flared Crossguard
  const guardBar = new THREE.BoxGeometry(0.46, 0.08, 0.13);
  const pommelTipL = new THREE.BoxGeometry(0.1, 0.11, 0.16);
  pommelTipL.translate(-0.24, 0, 0.03);
  const pommelTipR = new THREE.BoxGeometry(0.1, 0.11, 0.16);
  pommelTipR.translate(0.24, 0, 0.03);
  const guard = mergeNormalized([guardBar, pommelTipL, pommelTipR]);

  // Tactical Rifle Receiver + Top Rail + Optic Sight
  const recBody = new THREE.BoxGeometry(0.24, 0.26, 0.94);
  const topRail = new THREE.BoxGeometry(0.12, 0.07, 0.82);
  topRail.translate(0, 0.16, 0.04);
  const holoFrame = new THREE.BoxGeometry(0.14, 0.11, 0.2);
  holoFrame.translate(0, 0.23, -0.08);
  const receiver = mergeNormalized([recBody, topRail, holoFrame]);

  const cell = new THREE.CylinderGeometry(0.105, 0.105, 0.45, 8);
  cell.rotateX(Math.PI / 2);

  sharedWeaponGeos = {
    grip: new THREE.BoxGeometry(0.1, 0.28, 0.22),
    guard,
    bladeThin: createKatanaBladeGeo(1.48, 0.19),
    bladeLong: createKatanaBladeGeo(2.08, 0.24),
    pole,
    axeHead,
    maulHead,
    receiver,
    barrel,
    railBar: new THREE.BoxGeometry(0.08, 0.09, 1.88),
    stock: new THREE.BoxGeometry(0.16, 0.22, 0.44),
    cell,
    orb: new THREE.OctahedronGeometry(0.22, 0),
  };
  return sharedWeaponGeos;
}

let sharedThrowGeos: {
  sphere: THREE.SphereGeometry;
  bottle: THREE.CylinderGeometry;
  neck: THREE.CylinderGeometry;
  canister: THREE.CylinderGeometry;
  ring: THREE.TorusGeometry;
  subBomb: THREE.DodecahedronGeometry;
} | null = null;

function ensureSharedThrowGeos() {
  if (sharedThrowGeos) return sharedThrowGeos;
  sharedThrowGeos = {
    sphere: new THREE.SphereGeometry(0.3, 14, 12),
    bottle: new THREE.CylinderGeometry(0.2, 0.24, 0.56, 12),
    neck: new THREE.CylinderGeometry(0.07, 0.14, 0.28, 10),
    canister: new THREE.CylinderGeometry(0.24, 0.24, 0.54, 8),
    ring: new THREE.TorusGeometry(0.26, 0.045, 8, 18),
    subBomb: new THREE.DodecahedronGeometry(0.14, 0),
  };
  return sharedThrowGeos;
}

export function createWeaponMesh(
  materials: MaterialBank,
  weaponId: WeaponId,
  useLambert = false,
): {
  group: THREE.Group;
  dispose: () => void;
} {
  const g = ensureSharedWeaponGeos();
  const def = getWeaponDef(weaponId);
  const group = new THREE.Group();
  const accentMat = new THREE.MeshStandardMaterial({
    color: def.color,
    emissive: def.color,
    emissiveIntensity: def.rarity === 'mythic' ? 1.45 : def.category === 'throwable' ? 1.1 : 0.85,
    roughness: 0.2,
    metalness: 0.55,
  });

  const steelMat = useLambert ? materials.mobileWeaponSteelLambert : materials.weaponSteel;
  const gunMat = useLambert ? materials.mobileWeaponGunmetalLambert : materials.weaponGunmetal;
  const goldMat = useLambert ? materials.mobileWeaponGoldLambert : materials.weaponMythicGold;
  const brassMat = useLambert ? materials.mobileBrassLambert : materials.burnishedBrass;
  const primaryBladeMat = def.rarity === 'mythic' ? goldMat : steelMat;

  if (def.category === 'throwable') {
    const tg = ensureSharedThrowGeos();
    if (weaponId === 'molotov_cocktail') {
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 0.75,
        roughness: 0.12,
        transparent: true,
        opacity: 0.88,
      });
      const body = new THREE.Mesh(tg.bottle, glassMat);
      const neck = new THREE.Mesh(tg.neck, glassMat);
      neck.position.y = 0.36;
      const wick = new THREE.Mesh(g.orb, accentMat);
      wick.scale.setScalar(0.75);
      wick.position.y = 0.58;
      group.add(body, neck, wick);
      return {
        group,
        dispose: () => {
          accentMat.dispose();
          glassMat.dispose();
        },
      };
    }

    if (weaponId === 'cryo_bomb') {
      const body = new THREE.Mesh(tg.canister, steelMat);
      const ring = new THREE.Mesh(tg.ring, accentMat);
      ring.rotation.x = Math.PI / 2;
      const core = new THREE.Mesh(g.orb, accentMat);
      core.position.y = 0.32;
      group.add(body, ring, core);
    } else if (weaponId === 'emp_grenade') {
      const core = new THREE.Mesh(tg.sphere, gunMat);
      const coil1 = new THREE.Mesh(tg.ring, accentMat);
      const coil2 = new THREE.Mesh(tg.ring, accentMat);
      coil2.rotation.y = Math.PI / 2;
      group.add(core, coil1, coil2);
    } else if (weaponId === 'cluster_bomb') {
      const hub = new THREE.Mesh(tg.sphere, gunMat);
      hub.scale.setScalar(0.92);
      group.add(hub);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        const sub = new THREE.Mesh(tg.subBomb, accentMat);
        sub.position.set(Math.cos(a) * 0.25, 0.04, Math.sin(a) * 0.25);
        group.add(sub);
      }
    } else {
      const body = new THREE.Mesh(tg.sphere, gunMat);
      const collar = new THREE.Mesh(tg.ring, accentMat);
      collar.rotation.x = Math.PI / 2;
      collar.scale.setScalar(0.85);
      const pin = new THREE.Mesh(g.orb, brassMat);
      pin.scale.setScalar(0.55);
      pin.position.set(0.14, 0.3, 0);
      group.add(body, collar, pin);
    }
    return {
      group,
      dispose: () => {
        accentMat.dispose();
      },
    };
  }

  if (weaponId === 'twin_fangs') {
    for (const side of [-0.18, 0.18]) {
      const hilt = new THREE.Mesh(g.grip, gunMat);
      hilt.position.set(side, 0, -0.15);
      const blade = new THREE.Mesh(g.bladeThin, accentMat);
      blade.scale.set(0.9, 0.85, 0.72);
      blade.position.set(side, 0.02, 0.45);
      group.add(hilt, blade);
    }
  } else if (weaponId === 'solar_katana' || weaponId === 'crimson_odachi' || weaponId === 'excalibur_sun') {
    const hilt = new THREE.Mesh(g.grip, gunMat);
    hilt.position.set(0, 0, -0.25);
    const guard = new THREE.Mesh(g.guard, weaponId === 'excalibur_sun' ? goldMat : brassMat);
    guard.position.set(0, 0, 0.02);
    const isLong = weaponId !== 'solar_katana';
    const blade = new THREE.Mesh(isLong ? g.bladeLong : g.bladeThin, primaryBladeMat);
    blade.position.set(0, 0.03, isLong ? 1.05 : 0.78);
    const edge = new THREE.Mesh(isLong ? g.bladeLong : g.bladeThin, accentMat);
    edge.scale.set(0.45, 0.55, 1.02);
    edge.position.set(0, 0.08, isLong ? 1.08 : 0.8);
    group.add(hilt, guard, blade, edge);
    if (weaponId === 'excalibur_sun') {
      const wingGem = new THREE.Mesh(g.orb, accentMat);
      wingGem.position.set(0, 0.16, 0.05);
      group.add(wingGem);
    }
  } else if (weaponId === 'cryo_halberd') {
    const shaft = new THREE.Mesh(g.pole, gunMat);
    shaft.position.set(0, 0, 0.55);
    const head = new THREE.Mesh(g.axeHead, steelMat);
    head.position.set(0, 0, 1.48);
    const edge = new THREE.Mesh(g.axeHead, accentMat);
    edge.scale.set(1.12, 0.65, 0.85);
    edge.position.set(0.08, 0, 1.52);
    group.add(shaft, head, edge);
  } else if (weaponId === 'titan_maul') {
    const shaft = new THREE.Mesh(g.pole, gunMat);
    shaft.position.set(0, 0, 0.45);
    const head = new THREE.Mesh(g.maulHead, steelMat);
    head.position.set(0, 0.04, 1.45);
    const core = new THREE.Mesh(g.orb, accentMat);
    core.scale.setScalar(1.4);
    core.position.set(0, 0.04, 1.45);
    group.add(shaft, head, core);
  } else {
    const rec = new THREE.Mesh(g.receiver, gunMat);
    rec.position.set(0, 0.05, 0.05);
    const stock = new THREE.Mesh(g.stock, gunMat);
    stock.position.set(0, 0, -0.46);
    const grip = new THREE.Mesh(g.grip, gunMat);
    grip.position.set(0, -0.18, -0.08);
    group.add(rec, stock, grip);

    if (weaponId === 'rail_sniper' || weaponId === 'chronos_rail' || weaponId === 'photon_burst') {
      const railTop = new THREE.Mesh(g.railBar, primaryBladeMat);
      railTop.position.set(0, 0.16, 0.92);
      const railBot = new THREE.Mesh(g.railBar, primaryBladeMat);
      railBot.position.set(0, -0.01, 0.92);
      const coreBeam = new THREE.Mesh(g.railBar, accentMat);
      coreBeam.scale.set(0.65, 0.65, 0.92);
      coreBeam.position.set(0, 0.08, 0.92);
      group.add(railTop, railBot, coreBeam);
    } else if (weaponId === 'hypernova_gatling' || weaponId === 'vulcan_rotary') {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        const b = new THREE.Mesh(g.barrel, primaryBladeMat);
        b.scale.set(0.68, 0.68, 1.15);
        b.position.set(Math.cos(a) * 0.11, 0.08 + Math.sin(a) * 0.11, 0.88);
        group.add(b);
      }
      const drum = new THREE.Mesh(g.cell, accentMat);
      drum.scale.set(1.5, 1.5, 1.2);
      drum.position.set(0, -0.05, 0.25);
      group.add(drum);
    } else if (weaponId === 'twin_blasters') {
      for (const side of [-0.12, 0.12]) {
        const b = new THREE.Mesh(g.barrel, primaryBladeMat);
        b.scale.set(0.75, 0.75, 0.9);
        b.position.set(side, 0.09, 0.72);
        const cell = new THREE.Mesh(g.cell, accentMat);
        cell.scale.set(0.8, 0.8, 0.85);
        cell.position.set(side, 0.17, 0.22);
        group.add(b, cell);
      }
    } else if (weaponId === 'void_obliterator') {
      const barrel = new THREE.Mesh(g.barrel, steelMat);
      barrel.scale.set(1.5, 1.5, 0.9);
      barrel.position.set(0, 0.08, 0.75);
      const singularity = new THREE.Mesh(g.orb, accentMat);
      singularity.scale.setScalar(1.35);
      singularity.position.set(0, 0.08, 1.48);
      group.add(barrel, singularity);
    } else {
      const isCompact = weaponId === 'solar_smg' || weaponId === 'cryo_repeater';
      const isWide =
        weaponId === 'scatter_cannon' ||
        weaponId === 'arc_launcher' ||
        weaponId === 'flak_autocannon' ||
        weaponId === 'arc_lmg';
      const barrel = new THREE.Mesh(g.barrel, primaryBladeMat);
      barrel.scale.set(isWide ? 1.5 : 0.92, isWide ? 1.35 : 0.92, isCompact ? 0.65 : 1.05);
      barrel.position.set(0, 0.09, isCompact ? 0.55 : 0.74);
      const cell = new THREE.Mesh(g.cell, accentMat);
      cell.position.set(0, 0.16, 0.25);
      group.add(barrel, cell);
      if (isWide || weaponId === 'plasma_ar') {
        const mag = new THREE.Mesh(g.grip, accentMat);
        mag.position.set(0, -0.14, 0.35);
        group.add(mag);
      }
    }
  }

  return {
    group,
    dispose: () => {
      accentMat.dispose();
    },
  };
}

let sharedGroundRingGeo: THREE.RingGeometry | null = null;
let sharedBeaconGeo: THREE.CylinderGeometry | null = null;

export function createGroundWeaponRig(
  materials: MaterialBank,
  weaponId: WeaponId,
  isSuper: boolean,
): GroundWeaponRig & { isThrowable: boolean; isSuper: boolean } {
  if (!sharedGroundRingGeo) {
    sharedGroundRingGeo = new THREE.RingGeometry(1.15, 1.5, 24);
    sharedGroundRingGeo.rotateX(-Math.PI / 2);
  }
  if (!sharedBeaconGeo) {
    sharedBeaconGeo = new THREE.CylinderGeometry(0.45, 1.35, 95, 12, 1, true);
  }

  const def = getWeaponDef(weaponId);
  const isThrowable = def.category === 'throwable';
  const root = new THREE.Group();
  const { group: modelGroup, dispose: disposeWeapon } = createWeaponMesh(materials, weaponId);
  modelGroup.scale.setScalar(isSuper ? 1.55 : isThrowable ? 1.4 : 1.18);

  if (isSuper) {
    modelGroup.position.set(0, 0.85, -0.35);
    modelGroup.rotation.x = -0.25;
  } else if (isThrowable) {
    modelGroup.position.set(0, 0.36, 0);
  } else {
    modelGroup.position.set(0, 0.28, 0);
    modelGroup.rotation.z = Math.PI / 2;
    modelGroup.rotation.x = 0.08;
  }
  root.add(modelGroup);

  const ringMat = new THREE.MeshBasicMaterial({
    color: def.color,
    transparent: true,
    opacity: isSuper ? 0.9 : 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(sharedGroundRingGeo, ringMat);
  ringMesh.scale.setScalar(isSuper ? 2.2 : 1.05);
  ringMesh.position.y = 0.06;
  root.add(ringMesh);

  let beaconMesh: THREE.Mesh | null = null;
  let beaconMat: THREE.MeshBasicMaterial | null = null;
  if (isSuper) {
    beaconMat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    beaconMesh = new THREE.Mesh(sharedBeaconGeo, beaconMat);
    beaconMesh.position.y = 46;
    root.add(beaconMesh);
  }

  return {
    root,
    modelGroup,
    ringMesh,
    beaconMesh,
    isThrowable,
    isSuper,
    dispose: () => {
      disposeWeapon();
      ringMat.dispose();
      beaconMat?.dispose();
    },
  };
}

export function createNextbotRig(materials: MaterialBank, variant: number): NextbotRig {
  const def = NEXTBOT_DEFS[Math.abs(variant) % NEXTBOT_DEFS.length] || NEXTBOT_DEFS[0];
  const root = new THREE.Group();
  const frameGroup = new THREE.Group();
  root.add(frameGroup);

  const frameGeo = new THREE.BoxGeometry(4.2, 4.4, 0.36);
  const frame = new THREE.Mesh(frameGeo, materials.darkBasalt);
  frameGroup.add(frame);

  const faceGeo = new THREE.PlaneGeometry(3.85, 3.85);
  const faceMat =
    materials.nextbotFaceMaterials[def.variant] || materials.nextbotFaceMaterials[0];
  const faceFront = new THREE.Mesh(faceGeo, faceMat);
  faceFront.position.z = 0.2;
  const faceBack = new THREE.Mesh(faceGeo, faceMat);
  faceBack.position.z = -0.2;
  faceBack.rotation.y = Math.PI;
  frameGroup.add(faceFront, faceBack);

  const slowGeo = new THREE.TorusGeometry(2.6, 0.14, 8, 28);
  const slowMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
  });
  const slowAura = new THREE.Mesh(slowGeo, slowMat);
  slowAura.rotation.x = Math.PI / 2;
  slowAura.visible = false;
  root.add(slowAura);

  const dangerGeo = new THREE.RingGeometry(2.8, 3.35, 32);
  dangerGeo.rotateX(-Math.PI / 2);
  const dangerMat = new THREE.MeshBasicMaterial({
    color: def.accent,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const dangerRing = new THREE.Mesh(dangerGeo, dangerMat);
  root.add(dangerRing);

  const shadowGeo = new THREE.PlaneGeometry(5.2, 5.2);
  const shadowPlane = new THREE.Mesh(shadowGeo, materials.contactShadow);
  shadowPlane.rotation.x = -Math.PI / 2;
  root.add(shadowPlane);

  return {
    root,
    frameGroup,
    slowAura,
    dangerRing,
    shadowPlane,
    setVisualState: ({ slowed, banished, groundY, dt, elapsed }) => {
      root.visible = !banished;
      if (banished) return;

      frameGroup.position.y = Math.sin(elapsed * 7 + variant) * 0.22;
      frameGroup.rotation.z = slowed ? 0 : Math.sin(elapsed * 9 + variant) * 0.08;
      slowAura.visible = slowed;
      if (slowed) {
        slowAura.rotation.z += dt * 4.5;
        slowAura.scale.setScalar(1 + Math.sin(elapsed * 12) * 0.08);
      }

      const relGround = groundY - root.position.y + 0.08;
      shadowPlane.position.y = relGround;
      dangerRing.position.y = relGround + 0.05;
      dangerMat.color.set(slowed ? '#38bdf8' : def.accent);
      dangerRing.scale.setScalar(1 + Math.sin(elapsed * 10) * 0.06);
    },
    dispose: () => {
      frameGeo.dispose();
      faceGeo.dispose();
      slowGeo.dispose();
      slowMat.dispose();
      dangerGeo.dispose();
      dangerMat.dispose();
      shadowGeo.dispose();
    },
  };
}

export function createSkimmerRig(
  materials: MaterialBank,
  colorIndex: number,
  isSoftwareGl: boolean,
  useLambert = false,
): SkimmerRig {
  const geos = ensureSharedSkimmerGeos();
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  let currentColorIndex = Math.max(0, Math.min(materials.hullMaterials.length - 1, colorIndex));
  let lambertActive = useLambert;

  const activeHullMat = () =>
    lambertActive ? materials.mobileHullLambert[currentColorIndex] : materials.hullMaterials[currentColorIndex];

  const hullMesh = new THREE.Mesh(geos.hull, activeHullMat());
  hullMesh.castShadow = !isSoftwareGl;
  hullMesh.receiveShadow = true;
  bodyGroup.add(hullMesh);

  const wingsMesh = new THREE.Mesh(geos.wings, activeHullMat());
  wingsMesh.castShadow = !isSoftwareGl;
  bodyGroup.add(wingsMesh);

  const chassisMesh = new THREE.Mesh(
    geos.chassisDetails,
    lambertActive ? materials.mobileDarkLambert : materials.darkBasalt,
  );
  bodyGroup.add(chassisMesh);

  const canopyMesh = new THREE.Mesh(
    geos.canopy,
    lambertActive ? materials.mobileCanopyLambert : materials.canopyGlass,
  );
  canopyMesh.position.set(0, 0.34, 0.26);
  bodyGroup.add(canopyMesh);

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.88,
  });
  const thrusterFlame = new THREE.Mesh(geos.flame, flameMat);
  thrusterFlame.position.set(0, 0.04, -1.68);
  bodyGroup.add(thrusterFlame);

  const haloRing = new THREE.Mesh(
    geos.halo,
    lambertActive ? materials.mobileBrassLambert : materials.burnishedBrass,
  );
  haloRing.position.set(0, 0.22, -0.92);
  bodyGroup.add(haloRing);

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.88, 0.32, 0.25);
  bodyGroup.add(weaponMount);

  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x2dd4bf,
    transparent: true,
    opacity: 0.35,
  });
  const shieldRing = new THREE.Mesh(geos.shieldRing, shieldMat);
  shieldRing.rotation.x = Math.PI / 2;
  shieldRing.position.y = 0.05;
  root.add(shieldRing);

  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.9,
    roughness: 0.15,
    metalness: 0.9,
  });
  const sovereignCrown = new THREE.Mesh(geos.crown, crownMat);
  sovereignCrown.position.set(0, 2.2, 0);
  sovereignCrown.visible = false;
  root.add(sovereignCrown);

  const shadowPlane = new THREE.Mesh(geos.shadow, materials.contactShadow);
  shadowPlane.rotation.x = -Math.PI / 2;
  root.add(shadowPlane);

  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0,
    wireframe: true,
    depthWrite: false,
  });
  const pulseWaveMesh = new THREE.Mesh(geos.pulseSphere, pulseMat);
  pulseWaveMesh.visible = false;
  root.add(pulseWaveMesh);

  const playerBeaconMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.92,
  });
  const playerBeacon = new THREE.Mesh(geos.playerBeacon, playerBeaconMat);
  playerBeacon.position.set(0, 2.05, 0);
  playerBeacon.visible = false;
  root.add(playerBeacon);

  let pulseProgress = 1;
  let currentWeaponIndex = 0;
  let activeWeaponCleanup: (() => void) | null = null;
  let attackSwingTimer = 0;

  return {
    root,
    bodyGroup,
    hullMesh,
    wingsMesh,
    chassisMesh,
    canopyMesh,
    thrusterFlame,
    haloRing,
    shieldRing,
    sovereignCrown,
    shadowPlane,
    pulseWaveMesh,
    playerBeacon,
    weaponMount,
    setColorIndex: (idx: number) => {
      currentColorIndex = Math.max(0, Math.min(materials.hullMaterials.length - 1, idx));
      const mat = activeHullMat();
      hullMesh.material = mat;
      wingsMesh.material = mat;
    },
    setLodMode: (nextLambert: boolean, mats: MaterialBank) => {
      if (lambertActive === nextLambert) return;
      lambertActive = nextLambert;
      const mat = nextLambert ? mats.mobileHullLambert[currentColorIndex] : mats.hullMaterials[currentColorIndex];
      hullMesh.material = mat;
      wingsMesh.material = mat;
      chassisMesh.material = nextLambert ? mats.mobileDarkLambert : mats.darkBasalt;
      canopyMesh.material = nextLambert ? mats.mobileCanopyLambert : mats.canopyGlass;
      haloRing.material = nextLambert ? mats.mobileBrassLambert : mats.burnishedBrass;
    },
    setWeaponIndex: (weaponIndex: number, mats: MaterialBank, forceLambert?: boolean) => {
      const nextLambert = forceLambert !== undefined ? forceLambert : lambertActive;
      if (weaponIndex === currentWeaponIndex && nextLambert === lambertActive) return;
      currentWeaponIndex = weaponIndex;
      while (weaponMount.children.length > 0) {
        weaponMount.remove(weaponMount.children[0]);
      }
      if (activeWeaponCleanup) {
        activeWeaponCleanup();
        activeWeaponCleanup = null;
      }
      const def = getWeaponByIndex(weaponIndex);
      if (def) {
        const built = createWeaponMesh(mats, def.id, nextLambert);
        built.group.scale.setScalar(0.95);
        weaponMount.add(built.group);
        activeWeaponCleanup = built.dispose;
      }
    },
    triggerPulseVisual: () => {
      pulseProgress = 0;
      pulseWaveMesh.visible = true;
    },
    setVisualState: ({
      shield,
      dashing,
      sovereign,
      shielded,
      overdrive,
      attacking,
      isHumanMarker = false,
      markerColorHex = 0x34d399,
      groundY,
      roll,
      pitch,
      dt,
      elapsed,
      lowDetail,
      farDetail = false,
    }) => {
      bodyGroup.rotation.z = roll;
      bodyGroup.rotation.x = pitch;

      if (attacking) {
        attackSwingTimer = 0.25;
      } else if (attackSwingTimer > 0) {
        attackSwingTimer = Math.max(0, attackSwingTimer - dt);
      }
      if (currentWeaponIndex > 0 && !farDetail) {
        const swingFrac = attackSwingTimer / 0.25;
        weaponMount.rotation.y = Math.sin(swingFrac * Math.PI) * 1.15;
        weaponMount.rotation.x = -Math.sin(swingFrac * Math.PI) * 0.45;
      }

      sovereignCrown.visible = sovereign;
      if (sovereign) {
        sovereignCrown.rotation.y += dt * 2.2;
        sovereignCrown.position.y = 2.2 + Math.sin(elapsed * 3.5) * 0.18;
      }

      playerBeacon.visible = isHumanMarker;
      if (isHumanMarker) {
        playerBeaconMat.color.setHex(markerColorHex);
        playerBeacon.rotation.y += dt * 2.8;
        playerBeacon.position.y = (sovereign ? 2.88 : 2.02) + Math.sin(elapsed * 4.6) * 0.14;
      }

      if (lowDetail) {
        bodyGroup.position.y = 0;
        chassisMesh.visible = false;
        canopyMesh.visible = false;
        haloRing.visible = false;
        shadowPlane.visible = false;

        weaponMount.visible = !farDetail && currentWeaponIndex > 0;
        thrusterFlame.visible = !farDetail;
        shieldRing.visible = !farDetail && shielded;
        if (!farDetail) {
          if (shielded) {
            shieldMat.opacity = 0.65;
            shieldMat.color.setHex(0xfacc15);
          }
          thrusterFlame.scale.set(0.8, 0.8, dashing || overdrive ? 1.8 : 0.7);
          flameMat.color.setHex(dashing ? 0x38bdf8 : overdrive ? 0xf97316 : 0xfbbf24);
        }
      } else {
        chassisMesh.visible = true;
        canopyMesh.visible = true;
        haloRing.visible = true;
        weaponMount.visible = currentWeaponIndex > 0;
        thrusterFlame.visible = true;

        bodyGroup.position.y = Math.sin(elapsed * 4.2) * 0.08;
        haloRing.rotation.z += dt * (dashing || overdrive ? 14 : 3.2);

        const hot = dashing || overdrive;
        const flameScale = hot ? 2.5 + Math.sin(elapsed * 45) * 0.35 : 0.75 + Math.sin(elapsed * 28) * 0.15;
        thrusterFlame.scale.set(hot ? 1.4 : 0.85, hot ? 1.4 : 0.85, flameScale);
        flameMat.color.setHex(dashing ? 0x38bdf8 : overdrive ? 0xf97316 : 0xfbbf24);

        const sNorm = Math.max(0, Math.min(1, shield / 100));
        shieldRing.visible = true;
        shieldRing.scale.setScalar(shielded ? 1.25 + Math.sin(elapsed * 10) * 0.05 : 0.85 + sNorm * 0.2);
        shieldMat.opacity = shielded ? 0.75 : 0.1 + sNorm * 0.35;
        shieldMat.color.setHex(shielded ? 0xfacc15 : sNorm < 0.3 ? 0xef4444 : 0x2dd4bf);

        shadowPlane.visible = true;
        const relGround = groundY - root.position.y + 0.04;
        shadowPlane.position.y = relGround;
        const heightFade = Math.max(0.2, 1 - Math.abs(relGround) * 0.06);
        shadowPlane.scale.setScalar(heightFade);
      }

      if (pulseProgress < 1) {
        pulseProgress = Math.min(1, pulseProgress + dt * 2.8);
        const radius = 1.5 + pulseProgress * 13.5;
        pulseWaveMesh.scale.setScalar(radius);
        pulseMat.opacity = (1 - pulseProgress) * 0.65;
        pulseWaveMesh.rotation.y += dt * 4;
        if (pulseProgress >= 1) {
          pulseWaveMesh.visible = false;
        }
      }
    },
  };
}

let sharedSentinelGeos: {
  core: THREE.BufferGeometry;
  cage: THREE.BufferGeometry;
  blades: THREE.BufferGeometry;
} | null = null;

export function createSentinelRig(materials: MaterialBank, shadowsEnabled: boolean): SentinelRig {
  if (!sharedSentinelGeos) {
    const coreGem = new THREE.OctahedronGeometry(0.92, 0);
    const opticRing = new THREE.TorusGeometry(0.55, 0.12, 8, 18);
    opticRing.rotateY(Math.PI / 2);
    const core = mergeNormalized([coreGem, opticRing]);

    const outerRing = new THREE.TorusGeometry(1.42, 0.14, 8, 22);
    outerRing.rotateX(Math.PI / 2);
    const innerRing = new THREE.TorusGeometry(1.12, 0.09, 6, 18);
    innerRing.rotateY(Math.PI / 2);
    const cage = mergeNormalized([outerRing, innerRing]);

    const bladeParts: THREE.BufferGeometry[] = [];
    const scytheShape = new THREE.Shape();
    scytheShape.moveTo(0, -0.78);
    scytheShape.lineTo(0.44, -0.45);
    scytheShape.lineTo(0.28, 0.86);
    scytheShape.lineTo(-0.1, 0.56);
    scytheShape.closePath();

    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const b = new THREE.ExtrudeGeometry(scytheShape, {
        depth: 0.14,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 1,
      });
      b.rotateY(-a);
      b.translate(Math.cos(a) * 1.72, 0, Math.sin(a) * 1.72);
      bladeParts.push(b);
    }
    const blades = mergeNormalized(bladeParts);
    sharedSentinelGeos = { core, cage, blades };
  }

  const root = new THREE.Group();
  const coreGroup = new THREE.Group();
  root.add(coreGroup);

  const core = new THREE.Mesh(sharedSentinelGeos.core, materials.sentinelCore);
  coreGroup.add(core);

  const cage = new THREE.Mesh(sharedSentinelGeos.cage, materials.sentinelBody);
  coreGroup.add(cage);

  const blades = new THREE.Group();
  const bladeMesh = new THREE.Mesh(sharedSentinelGeos.blades, materials.sentinelBody);
  bladeMesh.castShadow = shadowsEnabled;
  blades.add(bladeMesh);
  coreGroup.add(blades);

  const teleMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const telegraphRing = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.35, 28), teleMat);
  telegraphRing.rotation.x = -Math.PI / 2;
  root.add(telegraphRing);

  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), materials.contactShadow);
  shadowPlane.rotation.x = -Math.PI / 2;
  root.add(shadowPlane);

  return {
    root,
    coreGroup,
    blades,
    telegraphRing,
    shadowPlane,
    setShadowsEnabled: (enabled: boolean) => {
      bladeMesh.castShadow = enabled;
    },
  };
}

function createAtmosphericSkyTexture(mapId: MapId): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const palette =
    mapId === 'deep_space'
      ? {
          zenith: '#020308',
          mid: '#090d24',
          horizon: '#1e1b4b',
          ground: '#040610',
          sunCore: 'rgba(224, 231, 255, 0.96)',
          sunHalo: 'rgba(129, 140, 248, 0.36)',
          cloud: 'rgba(165, 180, 252, 0.09)',
          stars: true,
        }
      : mapId === 'neon_citadel'
      ? {
          zenith: '#090c1c',
          mid: '#1b1d3d',
          horizon: '#4a1e52',
          ground: '#0d1122',
          sunCore: 'rgba(244, 114, 182, 0.92)',
          sunHalo: 'rgba(56, 189, 248, 0.32)',
          cloud: 'rgba(192, 132, 252, 0.14)',
          stars: true,
        }
      : mapId === 'solaris_stadium'
      ? {
          zenith: '#0f172a',
          mid: '#1e293b',
          horizon: '#3b4f6e',
          ground: '#111827',
          sunCore: 'rgba(255, 250, 232, 0.96)',
          sunHalo: 'rgba(250, 204, 21, 0.32)',
          cloud: 'rgba(148, 163, 184, 0.16)',
          stars: true,
        }
      : mapId === 'coastal_resort'
      ? {
          zenith: '#1d6fb8',
          mid: '#6ec4f2',
          horizon: '#e4f5fc',
          ground: '#7dd3fc',
          sunCore: 'rgba(255, 253, 238, 0.99)',
          sunHalo: 'rgba(253, 224, 148, 0.48)',
          cloud: 'rgba(255, 255, 255, 0.28)',
          stars: false,
        }
      : mapId === 'voxel_lands'
      ? {
          zenith: '#3885d6',
          mid: '#87c5ff',
          horizon: '#e0f2fe',
          ground: '#94c58c',
          sunCore: 'rgba(255, 253, 230, 0.98)',
          sunHalo: 'rgba(254, 240, 138, 0.45)',
          cloud: 'rgba(255, 255, 255, 0.3)',
          stars: false,
        }
      : mapId === 'obsidian_caldera'
      ? {
          zenith: '#140b12',
          mid: '#3b1822',
          horizon: '#c2410c',
          ground: '#1f1114',
          sunCore: 'rgba(255, 214, 153, 0.96)',
          sunHalo: 'rgba(249, 115, 22, 0.42)',
          cloud: 'rgba(251, 146, 60, 0.16)',
          stars: true,
        }
      : mapId === 'glacier_atoll'
      ? {
          zenith: '#1e5aa8',
          mid: '#6cc4f5',
          horizon: '#eefaff',
          ground: '#bae6fd',
          sunCore: 'rgba(255, 255, 255, 0.99)',
          sunHalo: 'rgba(125, 211, 252, 0.44)',
          cloud: 'rgba(240, 249, 255, 0.34)',
          stars: false,
        }
      : mapId === 'jade_terraces'
      ? {
          zenith: '#1b6453',
          mid: '#60b89e',
          horizon: '#e4f7ee',
          ground: '#9ad4bc',
          sunCore: 'rgba(255, 252, 230, 0.98)',
          sunHalo: 'rgba(110, 231, 183, 0.4)',
          cloud: 'rgba(236, 253, 245, 0.28)',
          stars: false,
        }
      : mapId === 'solaris_basin'
      ? {
          zenith: '#2563ab',
          mid: '#7ebae8',
          horizon: '#f7efd8',
          ground: '#d9c79e',
          sunCore: 'rgba(255, 251, 225, 0.99)',
          sunHalo: 'rgba(251, 191, 36, 0.46)',
          cloud: 'rgba(255, 251, 240, 0.28)',
          stars: false,
        }
      : {
          zenith: '#2c64a8',
          mid: '#86b9ea',
          horizon: '#eef2f6',
          ground: '#cbd5e1',
          sunCore: 'rgba(255, 250, 225, 0.98)',
          sunHalo: 'rgba(253, 224, 148, 0.48)',
          cloud: 'rgba(255, 250, 242, 0.26)',
          stars: false,
        };

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0.0, palette.zenith);
  grad.addColorStop(0.32, palette.mid);
  grad.addColorStop(0.5, palette.horizon);
  grad.addColorStop(0.58, palette.ground);
  grad.addColorStop(1.0, palette.ground);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (palette.stars) {
    for (let i = 0; i < 420; i++) {
      const sx = ((i * 7919 + 41) % width);
      const sy = ((i * 4219 + 19) % (height * 0.85));
      const sz = i % 9 === 0 ? 2.2 : 1.1;
      ctx.fillStyle = i % 5 === 0 ? 'rgba(191,219,254,0.9)' : 'rgba(255,255,255,0.75)';
      ctx.fillRect(sx, sy, sz, sz);
    }
  }

  ctx.fillStyle = palette.cloud;
  for (let i = 0; i < 42; i++) {
    const cx = (i * 197 + 83) % width;
    const cy = 72 + ((i * 67) % 145);
    const rx = 55 + (i % 5) * 32;
    const ry = 4 + (i % 3) * 3.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, (i % 2 === 0 ? 1 : -1) * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  const sunX = width * 0.34;
  const sunY = height * 0.28;
  const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 155);
  halo.addColorStop(0, palette.sunCore);
  halo.addColorStop(0.14, palette.sunHalo);
  halo.addColorStop(0.55, 'rgba(255,240,210,0.08)');
  halo.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 155, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createArenaEnvironment(
  materials: MaterialBank,
  shadowsEnabled: boolean,
  mapId: MapId = 'metro_city',
  terrainSeed = 1,
  options?: { isMobile?: boolean },
): ArenaEnvironment {
  const isMobile = Boolean(options?.isMobile);
  const group = new THREE.Group();
  const shadowCasters: THREE.Mesh[] = [];
  const shadowReceivers: THREE.Mesh[] = [];
  const disposables: Array<{ dispose: () => void }> = [];
  const mobileSwapEntries: Array<{
    obj: THREE.Mesh;
    pbr: THREE.Material;
    lambert: THREE.Material;
  }> = [];

  const registerSwap = (obj: THREE.Mesh, pbr: THREE.Material, lambert: THREE.Material) => {
    mobileSwapEntries.push({ obj, pbr, lambert });
  };

  const makeMobileLambert = (src: THREE.Material, opts?: { vertexColors?: boolean; map?: THREE.Texture | null }): THREE.MeshLambertMaterial => {
    const std = src as THREE.MeshStandardMaterial;
    const mat = new THREE.MeshLambertMaterial({
      color: std.color ? std.color.clone() : new THREE.Color(0xffffff),
      emissive: std.emissive ? std.emissive.clone() : new THREE.Color(0x000000),
      emissiveIntensity: std.emissiveIntensity || 0,
      map: opts?.map !== undefined ? opts.map : std.map || null,
      vertexColors: opts?.vertexColors ?? std.vertexColors ?? false,
    });
    disposables.push(mat);
    return mat;
  };

  const mapDef = getMapDef(mapId);
  materials.citadelStone.color.setHex(mapDef.stoneHex);
  materials.mobileStoneLambert.color.setHex(mapDef.stoneHex);

  const skyTex = createAtmosphericSkyTexture(mapId);
  const skyGeo = new THREE.SphereGeometry(620, isMobile ? 20 : 40, isMobile ? 12 : 24);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  disposables.push(skyTex, skyGeo, skyMat);
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.rotation.y = 0.65;
  group.add(skyMesh);

  const radialSegs = isMobile ? 40 : 84;
  const angularSegs = isMobile ? 56 : 120;
  const terrainGeo = new THREE.BufferGeometry();
  const vertCount = (radialSegs + 1) * (angularSegs + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  const cBase = new THREE.Color(mapDef.floorBaseHex);
  const cAccent = new THREE.Color(mapDef.floorAccentHex);
  const cMid = new THREE.Color(mapDef.floorMidHex);
  const cRim = new THREE.Color(mapDef.floorRimHex);
  const tmpColor = new THREE.Color();

  let ptr = 0;
  let uvPtr = 0;
  for (let ri = 0; ri <= radialSegs; ri++) {
    const rFrac = ri / radialSegs;
    const r = rFrac * ARENA_RADIUS;
    for (let ai = 0; ai <= angularSegs; ai++) {
      const a = (ai / angularSegs) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = groundHeightAt(x, z, mapId, terrainSeed);

      positions[ptr] = x;
      positions[ptr + 1] = y;
      positions[ptr + 2] = z;

      uvs[uvPtr] = (x + ARENA_RADIUS) / (ARENA_RADIUS * 2);
      uvs[uvPtr + 1] = (z + ARENA_RADIUS) / (ARENA_RADIUS * 2);

      tmpColor.copy(cBase);
      if (mapDef.kind === 'voxel') {
        if (y >= 4.2) tmpColor.lerp(cRim, 0.85);
        else if (y <= 1.2) tmpColor.lerp(cMid, 0.72);
        else if (r < 24) tmpColor.lerp(cAccent, 0.7);
      } else {
        if (r < 24) {
          tmpColor.lerp(cAccent, 0.72);
        } else if (y > 2.6 && r < 126) {
          tmpColor.lerp(cMid, 0.75);
        } else if (r > 134) {
          tmpColor.lerp(cRim, Math.min(1, (r - 134) / 40));
        }
      }

      colors[ptr] = tmpColor.r;
      colors[ptr + 1] = tmpColor.g;
      colors[ptr + 2] = tmpColor.b;

      ptr += 3;
      uvPtr += 2;
    }
  }

  for (let ri = 0; ri < radialSegs; ri++) {
    for (let ai = 0; ai < angularSegs; ai++) {
      const a = ri * (angularSegs + 1) + ai;
      const b = a + angularSegs + 1;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, c, b);
      indices.push(c, d, b);
    }
  }

  terrainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  terrainGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.setIndex(indices);
  terrainGeo.computeVertexNormals();
  if (!isMobile && terrainGeo.index && terrainGeo.attributes.uv && terrainGeo.attributes.normal) {
    terrainGeo.computeTangents();
  }
  disposables.push(terrainGeo);

  const terrainMat =
    mapDef.kind === 'stadium'
      ? materials.stadiumTurfMat
      : mapDef.kind === 'voxel'
      ? materials.voxelBlockMat
      : materials.limestoneFloor;

  const mobileTerrainMat =
    mapDef.kind === 'stadium'
      ? materials.mobileTurfLambert
      : mapDef.kind === 'voxel'
      ? materials.mobileVoxelLambert
      : materials.mobileFloorLambert;

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = shadowsEnabled;
  shadowReceivers.push(terrainMesh);
  registerSwap(terrainMesh, terrainMat, mobileTerrainMat);
  group.add(terrainMesh);

  if (mapDef.kind !== 'space') {
    const segs = isMobile ? 48 : 96;
    const rimRingGeo = new THREE.TorusGeometry(ARENA_RADIUS + 1.5, 2.6, 10, segs);
    rimRingGeo.rotateX(Math.PI / 2);
    disposables.push(rimRingGeo);
    const rimRing = new THREE.Mesh(rimRingGeo, materials.darkBasalt);
    rimRing.position.y = 8.4;
    registerSwap(rimRing, materials.darkBasalt, materials.mobileDarkLambert);
    group.add(rimRing);

    const brassTrimGeo = new THREE.TorusGeometry(ARENA_RADIUS - 0.8, 0.38, 8, segs);
    brassTrimGeo.rotateX(Math.PI / 2);
    disposables.push(brassTrimGeo);
    const brassTrim = new THREE.Mesh(brassTrimGeo, materials.burnishedBrass);
    brassTrim.position.y = 8.9;
    registerSwap(brassTrim, materials.burnishedBrass, materials.mobileBrassLambert);
    group.add(brassTrim);
  }

  // Distinct Map-Specific 3D Landmarks & Backdrop Architecture
  const dummy = new THREE.Object3D();
  if (mapDef.kind === 'space') {
    const domeGeo = new THREE.SphereGeometry(ARENA_RADIUS + 3, isMobile ? 22 : 36, isMobile ? 14 : 24);
    const domeMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    disposables.push(domeGeo, domeMat);
    group.add(new THREE.Mesh(domeGeo, domeMat));

    // Orbital Brass Docking Ring framing Deep Space
    const dockGeo = new THREE.TorusGeometry(ARENA_RADIUS + 12, 1.8, 8, isMobile ? 48 : 88);
    dockGeo.rotateX(Math.PI / 2);
    disposables.push(dockGeo);
    const dockRing = new THREE.Mesh(dockGeo, materials.burnishedBrass);
    dockRing.rotation.z = 0.08;
    registerSwap(dockRing, materials.burnishedBrass, materials.mobileBrassLambert);
    group.add(dockRing);

    // 48-Rock Faceted Asteroid Belt (1 single InstancedMesh)
    const astGeo = new THREE.DodecahedronGeometry(4.2, 0);
    const astMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.88,
      metalness: 0.18,
    });
    const astMobileMat = makeMobileLambert(astMat);
    disposables.push(astGeo, astMat);
    const astInst = new THREE.InstancedMesh(astGeo, astMat, 48);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + (i % 3) * 0.05;
      const dist = 212 + (i % 5) * 26;
      const yOff = ((i % 7) - 3) * 14;
      const sc = 0.7 + ((i * 19) % 10) * 0.16;
      dummy.position.set(Math.cos(a) * dist, yOff, Math.sin(a) * dist);
      dummy.rotation.set(i * 0.6, i * 1.1, i * 0.4);
      dummy.scale.set(sc * 1.2, sc * 0.85, sc);
      dummy.updateMatrix();
      astInst.setMatrixAt(i, dummy.matrix);
    }
    astInst.instanceMatrix.needsUpdate = true;
    astInst.computeBoundingSphere();
    registerSwap(astInst, astMat, astMobileMat);
    group.add(astInst);

    // 3D Ringed Gas Giant Planet + Moons
    const planetGeo = new THREE.SphereGeometry(58, isMobile ? 20 : 32, isMobile ? 14 : 24);
    const planetMat = new THREE.MeshStandardMaterial({
      color: 0x4338ca,
      emissive: 0x1e1b4b,
      emissiveIntensity: 0.55,
      roughness: 0.65,
    });
    const ringGeo = new THREE.RingGeometry(74, 118, 48);
    ringGeo.rotateX(Math.PI / 2.4);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xa5b4fc,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    disposables.push(planetGeo, planetMat, ringGeo, ringMat);
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.set(220, 125, -290);
    const pRing = new THREE.Mesh(ringGeo, ringMat);
    pRing.position.copy(planet.position);
    pRing.rotation.z = 0.32;
    group.add(planet, pRing);

    const moonGeo = new THREE.SphereGeometry(22, 18, 14);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.88 });
    disposables.push(moonGeo, moonMat);
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(-245, 95, 210);
    group.add(moon);
  } else {
    // Monumental Perimeter Silhouette Structures (Setback Skyline / Mesas + Glowing Spires)
    const isCityMap = mapDef.kind === 'city';
    const mesaGeo = isCityMap
      ? new THREE.BoxGeometry(42, 140, 42)
      : new THREE.CylinderGeometry(18, 36, 140, 7);
    disposables.push(mesaGeo);
    const mesaMat = new THREE.MeshStandardMaterial({
      color: isCityMap
        ? mapId === 'neon_citadel'
          ? 0x1b2238
          : 0x94a3b8
        : mapDef.mesaHex,
      roughness: isCityMap ? 0.72 : 0.86,
      metalness: isCityMap ? 0.2 : 0.06,
      normalMap: isCityMap || isMobile ? null : materials.citadelStone.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
    });
    const mesaMobileMat = makeMobileLambert(mesaMat);
    disposables.push(mesaMat);
    const mesaInst = new THREE.InstancedMesh(mesaGeo, mesaMat, 28);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + (i % 2) * 0.08;
      const dist = 250 + (i % 3) * 45;
      const scaleH = 0.72 + ((i * 37) % 10) * 0.1;
      const scaleW = 0.85 + ((i * 19) % 7) * 0.12;
      dummy.position.set(Math.cos(a) * dist, -38 + scaleH * 28, Math.sin(a) * dist);
      dummy.rotation.set(0, isCityMap ? Math.round(a * 2) * (Math.PI * 0.25) : a * 1.7, 0);
      dummy.scale.set(scaleW, scaleH, scaleW);
      dummy.updateMatrix();
      mesaInst.setMatrixAt(i, dummy.matrix);
    }
    mesaInst.instanceMatrix.needsUpdate = true;
    mesaInst.computeBoundingSphere();
    registerSwap(mesaInst, mesaMat, mesaMobileMat);
    group.add(mesaInst);

    if (isCityMap) {
      const crownGeo = new THREE.BoxGeometry(28, 16, 28);
      const spireGeo = new THREE.CylinderGeometry(0.4, 1.4, 24, 6);
      spireGeo.translate(0, 18, 0);
      const mergedCrown = mergeNormalized([crownGeo, spireGeo]);
      disposables.push(mergedCrown);
      const crownMat =
        mapId === 'neon_citadel' ? materials.weaponEdgeGlow : materials.darkBasalt;
      const crownInst = new THREE.InstancedMesh(mergedCrown, crownMat, 28);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2 + (i % 2) * 0.08;
        const dist = 250 + (i % 3) * 45;
        const scaleH = 0.72 + ((i * 37) % 10) * 0.1;
        const scaleW = 0.85 + ((i * 19) % 7) * 0.12;
        dummy.position.set(Math.cos(a) * dist, -38 + scaleH * 98 + 8, Math.sin(a) * dist);
        dummy.rotation.set(0, Math.round(a * 2) * (Math.PI * 0.25), 0);
        dummy.scale.set(scaleW, 1, scaleW);
        dummy.updateMatrix();
        crownInst.setMatrixAt(i, dummy.matrix);
      }
      crownInst.instanceMatrix.needsUpdate = true;
      crownInst.computeBoundingSphere();
      if (mapId !== 'neon_citadel') {
        registerSwap(crownInst, materials.darkBasalt, materials.mobileDarkLambert);
      }
      group.add(crownInst);
    }
  }

  // Sea / Ocean / Animated PC Waves & Magma Glow Shader
  const isBeach = mapDef.kind === 'beach';
  const isCaldera = mapId === 'obsidian_caldera';
  const seaGeo = isMobile
    ? new THREE.CircleGeometry(650, 24)
    : new THREE.PlaneGeometry(1300, 1300, 48, 48);
  seaGeo.rotateX(-Math.PI / 2);
  disposables.push(seaGeo);

  const seaTimeUniform = { value: 0 };
  const seaMat = new THREE.MeshStandardMaterial({
    color: mapDef.seaHex,
    emissive: isCaldera ? 0xdc2626 : 0x000000,
    emissiveIntensity: isCaldera ? 0.65 : 0,
    normalMap: isMobile ? null : materials.seaNormalMap,
    normalScale: new THREE.Vector2(0.78, 0.78),
    roughness: isCaldera ? 0.35 : 0.14,
    metalness: isCaldera ? 0.25 : 0.72,
    envMapIntensity: 1.55,
  });

  if (!isMobile) {
    seaMat.customProgramCacheKey = () => (isCaldera ? 'solaris_sea_caldera_v1' : 'solaris_sea_ocean_v1');
    seaMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSeaTime = seaTimeUniform;
      shader.uniforms.uIsCaldera = { value: isCaldera ? 1.0 : 0.0 };
      shader.vertexShader =
        `uniform float uSeaTime;\nvarying vec2 vSeaWorldXZ;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 wpSea = modelMatrix * vec4(transformed, 1.0);
           transformed.y += sin(wpSea.x * 0.065 + uSeaTime * 1.45) * 0.26 + cos(wpSea.z * 0.055 - uSeaTime * 1.15) * 0.22;
           vSeaWorldXZ = wpSea.xz;`,
        );
      shader.fragmentShader =
        `uniform float uSeaTime;\nuniform float uIsCaldera;\nvarying vec2 vSeaWorldXZ;\n` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float sWave = sin(vSeaWorldXZ.x * 0.14 + uSeaTime * 1.8) * cos(vSeaWorldXZ.y * 0.13 - uSeaTime * 1.4);
           if (uIsCaldera > 0.5) {
             float magmaVein = smoothstep(0.32, 0.92, sWave);
             totalEmissiveRadiance += vec3(1.0, 0.38, 0.06) * magmaVein * 1.1;
           } else {
             float foamCrest = smoothstep(0.68, 0.98, sWave);
             totalEmissiveRadiance += vec3(0.45, 0.85, 1.0) * foamCrest * 0.22;
           }`,
        );
    };
  }

  const mobileSeaMat = makeMobileLambert(seaMat);
  disposables.push(seaMat);
  const seaMesh = new THREE.Mesh(seaGeo, seaMat);
  seaMesh.position.y = mapDef.kind === 'space' ? -240 : isBeach ? -0.9 : isCaldera ? -18 : -32;
  registerSwap(seaMesh, seaMat, mobileSeaMat);
  group.add(seaMesh);

  // Coastal Resort: Boardwalk Pier with Pilings + Curved 6-Frond Palm Trees (Only 2 InstancedMeshes!)
  if (isBeach) {
    const pierGeo = new THREE.BoxGeometry(16, 0.7, 92);
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x926239, roughness: 0.85 });
    const pierMobileMat = makeMobileLambert(pierMat);
    disposables.push(pierGeo, pierMat);
    const pier = new THREE.Mesh(pierGeo, pierMat);
    pier.position.set(0, 1.35, 92);
    pier.receiveShadow = shadowsEnabled;
    shadowReceivers.push(pier);
    registerSwap(pier, pierMat, pierMobileMat);
    group.add(pier);

    // Boardwalk wooden pilings & rail posts (1 InstancedMesh)
    const pilingGeo = new THREE.CylinderGeometry(0.35, 0.4, 5.2, 7);
    const pilingInst = new THREE.InstancedMesh(pilingGeo, pierMat, 14);
    disposables.push(pilingGeo);
    let pIdx = 0;
    for (let k = 0; k < 7; k++) {
      const pz = 54 + k * 13;
      for (const px of [-7.4, 7.4]) {
        dummy.position.set(px, 0.2, pz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pilingInst.setMatrixAt(pIdx++, dummy.matrix);
      }
    }
    pilingInst.instanceMatrix.needsUpdate = true;
    pilingInst.computeBoundingSphere();
    registerSwap(pilingInst, pierMat, pierMobileMat);
    group.add(pilingInst);

    // Sculpted Curved Palm Trunks + 6-Frond Radial Crowns (2 InstancedMeshes total instead of 48 draws!)
    const segLow = new THREE.CylinderGeometry(0.5, 0.68, 4.2, 7);
    segLow.translate(0, 2.1, 0);
    const segMid = new THREE.CylinderGeometry(0.4, 0.5, 4.2, 7);
    segMid.rotateZ(-0.1);
    segMid.translate(0.2, 6.0, 0);
    const segTop = new THREE.CylinderGeometry(0.3, 0.4, 3.8, 7);
    segTop.rotateZ(-0.18);
    segTop.translate(0.7, 9.6, 0);
    const palmTrunkGeo = mergeNormalized([segLow, segMid, segTop]);

    const frondParts: THREE.BufferGeometry[] = [];
    for (let f = 0; f < 6; f++) {
      const fa = (f / 6) * Math.PI * 2;
      const blade = new THREE.ConeGeometry(1.15, 5.4, 4);
      blade.scale(1.0, 1.0, 0.28);
      blade.rotateZ(-Math.PI * 0.58);
      blade.translate(2.5, -0.45, 0);
      blade.rotateY(fa);
      frondParts.push(blade);
    }
    const cocoCap = new THREE.SphereGeometry(0.95, 7, 5);
    cocoCap.translate(0, -0.25, 0);
    frondParts.push(cocoCap);
    const palmCrownGeo = mergeNormalized(frondParts);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7c4d2b, roughness: 0.9 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.74 });
    const trunkMobileMat = makeMobileLambert(trunkMat);
    const frondMobileMat = makeMobileLambert(frondMat);
    disposables.push(palmTrunkGeo, palmCrownGeo, trunkMat, frondMat);

    const palmCount = 16;
    const palmTrunkInst = new THREE.InstancedMesh(palmTrunkGeo, trunkMat, palmCount);
    const palmCrownInst = new THREE.InstancedMesh(palmCrownGeo, frondMat, palmCount);
    for (let i = 0; i < palmCount; i++) {
      const a = (i / palmCount) * Math.PI * 2 + 0.15;
      const r = 132 + (i % 2) * 14;
      const tx = Math.cos(a) * r;
      const tz = Math.sin(a) * r;
      const gy = groundHeightAt(tx, tz, mapId, terrainSeed);
      const rotY = a + (i % 2 === 0 ? 0.5 : -0.6);

      dummy.position.set(tx, gy - 0.3, tz);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(1, 0.92 + (i % 3) * 0.1, 1);
      dummy.updateMatrix();
      palmTrunkInst.setMatrixAt(i, dummy.matrix);

      const cosR = Math.cos(rotY);
      const sinR = Math.sin(rotY);
      const topSc = 0.92 + (i % 3) * 0.1;
      dummy.position.set(tx + 0.98 * cosR, gy - 0.3 + 11.1 * topSc, tz - 0.98 * sinR);
      dummy.rotation.set(0, rotY + i * 0.4, 0);
      dummy.scale.setScalar(0.95 + (i % 2) * 0.12);
      dummy.updateMatrix();
      palmCrownInst.setMatrixAt(i, dummy.matrix);
    }
    palmTrunkInst.instanceMatrix.needsUpdate = true;
    palmCrownInst.instanceMatrix.needsUpdate = true;
    palmTrunkInst.computeBoundingSphere();
    palmCrownInst.computeBoundingSphere();
    palmTrunkInst.castShadow = shadowsEnabled;
    palmCrownInst.castShadow = shadowsEnabled;
    shadowCasters.push(palmTrunkInst, palmCrownInst);
    registerSwap(palmTrunkInst, trunkMat, trunkMobileMat);
    registerSwap(palmCrownInst, frondMat, frondMobileMat);
    group.add(palmTrunkInst, palmCrownInst);
  }

  // Voxel Overworld: Cube Oak & Emerald Trees (2 InstancedMeshes!) + Floating Voxel Sky Clouds (1 InstancedMesh!)
  if (mapDef.kind === 'voxel') {
    const vTrunkGeo = new THREE.BoxGeometry(2.2, 8.5, 2.2);
    vTrunkGeo.translate(0, 4.2, 0);
    const vLeafMain = new THREE.BoxGeometry(6.6, 5.2, 6.6);
    vLeafMain.translate(0, 9.8, 0);
    const vLeafTop = new THREE.BoxGeometry(4.2, 2.6, 4.2);
    vLeafTop.translate(0, 13.5, 0);
    const vCanopyGeo = mergeNormalized([vLeafMain, vLeafTop]);

    const vTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.92 });
    const vLeafMat = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.86 });
    const vTrunkMobileMat = makeMobileLambert(vTrunkMat);
    const vLeafMobileMat = makeMobileLambert(vLeafMat);
    disposables.push(vTrunkGeo, vCanopyGeo, vTrunkMat, vLeafMat);

    const vTreeCount = 18;
    const vTrunkInst = new THREE.InstancedMesh(vTrunkGeo, vTrunkMat, vTreeCount);
    const vLeafInst = new THREE.InstancedMesh(vCanopyGeo, vLeafMat, vTreeCount);
    for (let i = 0; i < vTreeCount; i++) {
      const a = (i / vTreeCount) * Math.PI * 2;
      const r = 134 + (i % 3) * 10;
      const tx = Math.cos(a) * r;
      const tz = Math.sin(a) * r;
      const gy = groundHeightAt(tx, tz, mapId, terrainSeed);
      dummy.position.set(tx, gy - 0.2, tz);
      dummy.rotation.set(0, Math.round((a * 2) / Math.PI) * (Math.PI / 2), 0);
      dummy.scale.setScalar(0.95 + (i % 3) * 0.08);
      dummy.updateMatrix();
      vTrunkInst.setMatrixAt(i, dummy.matrix);
      vLeafInst.setMatrixAt(i, dummy.matrix);
    }
    vTrunkInst.instanceMatrix.needsUpdate = true;
    vLeafInst.instanceMatrix.needsUpdate = true;
    vTrunkInst.computeBoundingSphere();
    vLeafInst.computeBoundingSphere();
    vTrunkInst.castShadow = shadowsEnabled;
    vLeafInst.castShadow = shadowsEnabled;
    shadowCasters.push(vTrunkInst, vLeafInst);
    registerSwap(vTrunkInst, vTrunkMat, vTrunkMobileMat);
    registerSwap(vLeafInst, vLeafMat, vLeafMobileMat);
    group.add(vTrunkInst, vLeafInst);

    // 14 Floating 3D Voxel Sky Clouds
    const cPartA = new THREE.BoxGeometry(22, 4.2, 12);
    const cPartB = new THREE.BoxGeometry(14, 3.2, 18);
    cPartB.translate(4, 1.5, 2);
    const vCloudGeo = mergeNormalized([cPartA, cPartB]);
    const vCloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
    });
    disposables.push(vCloudGeo, vCloudMat);
    const vCloudInst = new THREE.InstancedMesh(vCloudGeo, vCloudMat, 14);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3;
      const r = 75 + (i % 3) * 65;
      dummy.position.set(Math.cos(a) * r, 86 + (i % 4) * 12, Math.sin(a) * r);
      dummy.rotation.set(0, (i % 2) * (Math.PI / 2), 0);
      dummy.scale.setScalar(1 + (i % 3) * 0.35);
      dummy.updateMatrix();
      vCloudInst.setMatrixAt(i, dummy.matrix);
    }
    vCloudInst.instanceMatrix.needsUpdate = true;
    vCloudInst.computeBoundingSphere();
    group.add(vCloudInst);
  }

  // Stadium Maps: 3D Goal Frames + Nets + Stepped Color-Coded Bleachers (InstancedMesh)
  if (mapDef.kind === 'stadium') {
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.6 });
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      wireframe: true,
      transparent: true,
      opacity: 0.36,
    });
    const postVGeo = new THREE.CylinderGeometry(0.42, 0.42, 11, 10);
    const barGeo = new THREE.CylinderGeometry(0.42, 0.42, 36.4, 10);
    barGeo.rotateZ(Math.PI / 2);
    const netBoxGeo = new THREE.BoxGeometry(36, 11, 8.5, 10, 4, 3);
    disposables.push(postMat, netMat, postVGeo, barGeo, netBoxGeo);

    for (const sign of [-1, 1]) {
      const gz = sign * 118;
      const goalGroup = new THREE.Group();
      goalGroup.position.set(0, 0, gz);

      const postL = new THREE.Mesh(postVGeo, postMat);
      postL.position.set(-18, 5.5, 0);
      const postR = new THREE.Mesh(postVGeo, postMat);
      postR.position.set(18, 5.5, 0);
      const crossbar = new THREE.Mesh(barGeo, postMat);
      crossbar.position.set(0, 11, 0);
      const net = new THREE.Mesh(netBoxGeo, netMat);
      net.position.set(0, 5.5, sign * 4.4);

      const glowStripMat = new THREE.MeshBasicMaterial({
        color: sign === -1 ? 0xf59e0b : 0x38bdf8,
      });
      disposables.push(glowStripMat);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(36, 0.45, 0.6), glowStripMat);
      strip.position.set(0, 11.4, 0);
      disposables.push(strip.geometry);

      goalGroup.add(postL, postR, crossbar, net, strip);
      group.add(goalGroup);
    }

    // Tiered Stadium Grandstands on East & West flanks consolidated into 1 InstancedMesh!
    const standMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });
    const standMobileMat = makeMobileLambert(standMat);
    const tierGeo = new THREE.BoxGeometry(10, 5, 195);
    disposables.push(standMat, tierGeo);
    const standInst = new THREE.InstancedMesh(tierGeo, standMat, 6);
    const standColors = [0x334155, 0x475569, 0x1e293b];
    const tmpCol = new THREE.Color();
    let sIdx = 0;
    for (const side of [-1, 1]) {
      for (let t = 0; t < 3; t++) {
        dummy.position.set(side * (146 + t * 9), 2.5 + t * 5.2, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        standInst.setMatrixAt(sIdx, dummy.matrix);
        tmpCol.setHex(t === 1 ? (side < 0 ? 0xb45309 : 0x0369a1) : standColors[t]);
        standInst.setColorAt(sIdx, tmpCol);
        sIdx++;
      }
    }
    standInst.instanceMatrix.needsUpdate = true;
    if (standInst.instanceColor) standInst.instanceColor.needsUpdate = true;
    standInst.receiveShadow = shadowsEnabled;
    shadowReceivers.push(standInst);
    registerSwap(standInst, standMat, standMobileMat);
    group.add(standInst);
  }

  // Ambient 3D atmospheric motes (embers / dust / snow / stars)
  const moteCount = isMobile ? 140 : 520;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const r = Math.sqrt(Math.random()) * ARENA_RADIUS;
    const a = Math.random() * Math.PI * 2;
    motePos[i * 3] = Math.cos(a) * r;
    motePos[i * 3 + 1] = 2 + Math.random() * 44;
    motePos[i * 3 + 2] = Math.sin(a) * r;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    color:
      mapId === 'neon_citadel'
        ? 0x38bdf8
        : mapId === 'deep_space'
        ? 0xc7d2fe
        : mapId === 'voxel_lands'
        ? 0xbef264
        : mapId === 'obsidian_caldera'
        ? 0xfb923c
        : mapId === 'glacier_atoll'
        ? 0xe0f2fe
        : mapId === 'jade_terraces'
        ? 0x6ee7b7
        : 0xfde68a,
    size: 0.9,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  disposables.push(moteGeo, moteMat);
  const ambientPoints = new THREE.Points(moteGeo, moteMat);
  group.add(ambientPoints);

  // Enterable Multi-Story Apartment Buildings with 3D Staircases, Balcony Stanchions, AC Condensers, Awnings & Furniture (3 Draw Calls Total!)
  const apartments = getMapApartments(mapId, terrainSeed);
  if (apartments.length > 0) {
    const isNeon = mapId === 'neon_citadel';
    const matteBoxes: Array<{ m: THREE.Matrix4; c: number }> = [];
    const metalBoxes: Array<{ m: THREE.Matrix4; c: number }> = [];
    const glowBoxes: Array<{ m: THREE.Matrix4; c: number }> = [];

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const bDummy = new THREE.Object3D();
    const rotAngles = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

    const pushBox = (
      arr: Array<{ m: THREE.Matrix4; c: number }>,
      b: (typeof apartments)[number],
      lx: number,
      ly: number,
      lz: number,
      sx: number,
      sy: number,
      sz: number,
      hex: number,
    ) => {
      const ang = rotAngles[b.rot];
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const wx = b.x + lx * cosA + lz * sinA;
      const wz = b.z - lx * sinA + lz * cosA;
      bDummy.position.set(wx, b.baseY + ly, wz);
      bDummy.rotation.set(0, ang, 0);
      bDummy.scale.set(sx, sy, sz);
      bDummy.updateMatrix();
      arr.push({ m: bDummy.matrix.clone(), c: hex });
    };

    const wallTints = isNeon
      ? [0x262f47, 0x222a40, 0x2d3652, 0x1e263b]
      : [0xe6dfd3, 0xd8e0e8, 0xe8d9c8, 0xd4dcd6];
    const accentTints = isNeon
      ? [0x0ea5e9, 0xec4899, 0x8b5cf6, 0x14b8a6]
      : [0xd97706, 0x0d9488, 0x3b82f6, 0xe11d48];
    const slabColor = isNeon ? 0x1a2033 : 0xcbd5e1;
    const stairWood = isNeon ? 0x334155 : 0xb47b44;
    const sofaColor = isNeon ? 0x0284c7 : 0xc2410c;
    const sofaAlt = isNeon ? 0x7c3aed : 0x0f766e;
    const woodDark = isNeon ? 0x1e293b : 0x784a28;
    const metalColor = isNeon ? 0x64748b : 0x334155;
    const glowColor = isNeon ? 0x38bdf8 : 0xfef3c7;

    for (let i = 0; i < apartments.length; i++) {
      const b = apartments[i];
      const hw = b.halfW;
      const hd = b.halfD;
      const fh = b.floorH;
      const topH = fh * 2 + 1.2;
      const wallCol = wallTints[b.accentIdx % wallTints.length];
      const accCol = accentTints[b.accentIdx % accentTints.length];

      // 4 Full-height Structural Corner Columns
      pushBox(matteBoxes, b, -hw + 1.1, topH * 0.5, -hd + 1.0, 2.2, topH, 2.0, wallCol);
      pushBox(matteBoxes, b, hw - 1.1, topH * 0.5, -hd + 1.0, 2.2, topH, 2.0, wallCol);
      pushBox(matteBoxes, b, -hw + 1.1, topH * 0.5, hd - 1.0, 2.2, topH, 2.0, wallCol);
      pushBox(matteBoxes, b, hw - 1.1, topH * 0.5, hd - 1.0, 2.2, topH, 2.0, wallCol);

      // Ground Floor: doorways, panoramic window cutouts + entrance awnings
      const gWingW = hw - 3.2 - 2.2;
      const gWingCx = 3.2 + gWingW * 0.5;
      for (const zSign of [-1, 1]) {
        pushBox(matteBoxes, b, -gWingCx, 0.6, zSign * (hd - 0.42), gWingW, 1.2, 0.85, wallCol);
        pushBox(matteBoxes, b, gWingCx, 0.6, zSign * (hd - 0.42), gWingW, 1.2, 0.85, wallCol);
        pushBox(matteBoxes, b, 0, fh - 0.55, zSign * (hd - 0.42), hw * 2 - 4.4, 1.1, 0.85, accCol);
        // Architectural Doorway Canopy Awning
        pushBox(metalBoxes, b, 0, 5.2, zSign * (hd + 0.55), 7.2, 0.22, 1.4, accCol);
      }
      const gSideD = hd - 3.0 - 2.0;
      const gSideCz = 3.0 + gSideD * 0.5;
      for (const xSign of [-1, 1]) {
        pushBox(matteBoxes, b, xSign * (hw - 0.42), 0.6, -gSideCz, 0.85, 1.2, gSideD, wallCol);
        pushBox(matteBoxes, b, xSign * (hw - 0.42), 0.6, gSideCz, 0.85, 1.2, gSideD, wallCol);
        pushBox(matteBoxes, b, xSign * (hw - 0.42), fh - 0.55, 0, 0.85, 1.1, hd * 2 - 4.0, wallCol);
      }

      // Floor 1 Slab
      pushBox(matteBoxes, b, 0, fh - 0.25, (-4.45 + hd) * 0.5, hw * 2, 0.5, hd + 4.45, slabColor);
      pushBox(matteBoxes, b, (-hw - 6.3) * 0.5, fh - 0.25, -6.4, hw - 6.3, 0.5, 3.9, slabColor);
      pushBox(matteBoxes, b, (6.05 + hw) * 0.5, fh - 0.25, -6.4, hw - 6.05, 0.5, 3.9, slabColor);
      pushBox(matteBoxes, b, -0.125, fh - 0.25, (-hd - 8.35) * 0.5, 12.35, 0.5, hd - 8.35, slabColor);

      // Floor 2 Panoramic Facades + Balcony Stanchions + Exterior AC Units
      const f2WingW = hw - 2.5 - 2.2;
      const f2WingCx = 2.5 + f2WingW * 0.5;
      for (const zSign of [-1, 1]) {
        pushBox(matteBoxes, b, -f2WingCx, fh + 0.6, zSign * (hd - 0.4), f2WingW, 1.2, 0.8, wallCol);
        pushBox(matteBoxes, b, f2WingCx, fh + 0.6, zSign * (hd - 0.4), f2WingW, 1.2, 0.8, wallCol);
        pushBox(matteBoxes, b, 0, fh * 2 - 0.55, zSign * (hd - 0.4), hw * 2 - 4.4, 1.1, 0.8, accCol);
        pushBox(metalBoxes, b, 0, fh + 1.35, zSign * (hd - 0.4), hw * 2 - 4.4, 0.12, 0.14, metalColor);
        // Balcony Rail Stanchion Posts
        for (const px of [-6.5, -3.5, 3.5, 6.5]) {
          pushBox(metalBoxes, b, px, fh + 0.72, zSign * (hd - 0.4), 0.12, 1.25, 0.12, metalColor);
        }
      }
      const f2SideD = hd - 2.4 - 2.0;
      const f2SideCz = 2.4 + f2SideD * 0.5;
      for (const xSign of [-1, 1]) {
        pushBox(matteBoxes, b, xSign * (hw - 0.4), fh + 0.6, -f2SideCz, 0.8, 1.2, f2SideD, wallCol);
        pushBox(matteBoxes, b, xSign * (hw - 0.4), fh + 0.6, f2SideCz, 0.8, 1.2, f2SideD, wallCol);
        pushBox(matteBoxes, b, xSign * (hw - 0.4), fh * 2 - 0.55, 0, 0.8, 1.1, hd * 2 - 4.0, wallCol);
        pushBox(metalBoxes, b, xSign * (hw - 0.4), fh + 1.35, 0, 0.14, 0.12, hd * 2 - 4.0, metalColor);
        // Wall-Mounted AC Condenser Box
        pushBox(metalBoxes, b, xSign * (hw + 0.35), fh + 0.55, -3.8, 0.65, 0.9, 1.2, metalColor);
      }

      // Rooftop Slab
      const rfY = fh * 2;
      pushBox(matteBoxes, b, 0, rfY - 0.25, (-hd + 4.45) * 0.5, hw * 2, 0.5, 4.45 + hd, slabColor);
      pushBox(matteBoxes, b, (-hw - 6.05) * 0.5, rfY - 0.25, 6.4, hw - 6.05, 0.5, 3.9, slabColor);
      pushBox(matteBoxes, b, (6.3 + hw) * 0.5, rfY - 0.25, 6.4, hw - 6.3, 0.5, 3.9, slabColor);
      pushBox(matteBoxes, b, 0.125, rfY - 0.25, (8.35 + hd) * 0.5, 12.35, 0.5, hd - 8.35, slabColor);

      // Rooftop Parapet Walls + HVAC + Radio Antenna Mast
      const rParW = hw - 2.6;
      const rParCx = 2.6 + rParW * 0.5;
      for (const zSign of [-1, 1]) {
        pushBox(matteBoxes, b, -rParCx, rfY + 0.55, zSign * (hd - 0.35), rParW, 1.1, 0.7, wallCol);
        pushBox(matteBoxes, b, rParCx, rfY + 0.55, zSign * (hd - 0.35), rParW, 1.1, 0.7, wallCol);
      }
      pushBox(matteBoxes, b, -hw + 0.35, rfY + 0.55, 0, 0.7, 1.1, hd * 2, wallCol);
      pushBox(matteBoxes, b, hw - 0.35, rfY + 0.55, 0, 0.7, 1.1, hd * 2, wallCol);
      pushBox(metalBoxes, b, -5.5, rfY + 0.85, -3.5, 3.2, 1.7, 2.4, metalColor);
      pushBox(metalBoxes, b, 6.4, rfY + 2.4, -4.5, 0.22, 4.8, 0.22, metalColor);
      pushBox(glowBoxes, b, 6.4, rfY + 4.9, -4.5, 0.45, 0.45, 0.45, accCol);

      // 3D Stepped Staircase 1 & 2
      const steps = 14;
      for (let st = 0; st < steps; st++) {
        const t0 = st / steps;
        const sx = -6.0 + (st + 0.5) * (12.0 / steps);
        const sy = (t0 + 0.5 / steps) * fh;
        pushBox(matteBoxes, b, sx, sy - 0.18, -6.4, 12.0 / steps + 0.08, 0.36, 3.4, stairWood);
        pushBox(metalBoxes, b, sx, sy + 0.55, -4.65, 0.12, 1.1, 0.12, metalColor);
      }
      pushBox(metalBoxes, b, -0.1, fh + 0.55, -4.45, 12.2, 0.14, 0.14, metalColor);

      for (let st = 0; st < steps; st++) {
        const t0 = st / steps;
        const sx = 6.0 - (st + 0.5) * (12.0 / steps);
        const sy = fh + (t0 + 0.5 / steps) * fh;
        pushBox(matteBoxes, b, sx, sy - 0.18, 6.4, 12.0 / steps + 0.08, 0.36, 3.4, stairWood);
        pushBox(metalBoxes, b, sx, sy + 0.55, 4.65, 0.12, 1.1, 0.12, metalColor);
      }
      pushBox(metalBoxes, b, 0.1, rfY + 0.55, 4.45, 12.2, 0.14, 0.14, metalColor);

      // Simple Interior Furniture
      pushBox(matteBoxes, b, -6.8, 0.35, 1.6, 2.2, 0.7, 4.4, sofaColor);
      pushBox(matteBoxes, b, -7.65, 0.85, 1.6, 0.5, 1.1, 4.4, sofaColor);
      pushBox(matteBoxes, b, -6.8, 0.65, -0.4, 2.2, 0.6, 0.45, sofaColor);
      pushBox(matteBoxes, b, -6.8, 0.65, 3.6, 2.2, 0.6, 0.45, sofaColor);
      pushBox(matteBoxes, b, -4.2, 0.48, 1.6, 1.4, 0.16, 2.4, woodDark);
      pushBox(metalBoxes, b, -4.2, 0.22, 0.6, 1.1, 0.44, 0.16, metalColor);
      pushBox(metalBoxes, b, -4.2, 0.22, 2.6, 1.1, 0.44, 0.16, metalColor);

      pushBox(matteBoxes, b, 6.8, 0.55, 1.4, 1.5, 1.1, 4.0, wallCol);
      pushBox(matteBoxes, b, 6.8, 1.14, 1.4, 1.65, 0.12, 4.15, woodDark);
      pushBox(matteBoxes, b, 5.1, 0.42, 0.6, 0.75, 0.75, 0.75, sofaAlt);
      pushBox(matteBoxes, b, 5.1, 0.42, 2.2, 0.75, 0.75, 0.75, sofaAlt);

      pushBox(matteBoxes, b, -6.8, fh + 0.28, -1.6, 3.6, 0.56, 2.4, woodDark);
      pushBox(matteBoxes, b, -6.7, fh + 0.64, -1.6, 3.3, 0.3, 2.15, 0xf8fafc);
      pushBox(matteBoxes, b, -7.8, fh + 0.86, -1.6, 0.75, 0.22, 1.7, accCol);

      pushBox(matteBoxes, b, 5.6, fh + 0.88, -0.8, 2.6, 0.16, 1.8, woodDark);
      pushBox(metalBoxes, b, 4.5, fh + 0.42, -1.5, 0.16, 0.84, 0.16, metalColor);
      pushBox(metalBoxes, b, 6.7, fh + 0.42, -1.5, 0.16, 0.84, 0.16, metalColor);
      pushBox(metalBoxes, b, 4.5, fh + 0.42, -0.1, 0.16, 0.84, 0.16, metalColor);
      pushBox(metalBoxes, b, 6.7, fh + 0.42, -0.1, 0.16, 0.84, 0.16, metalColor);
      pushBox(matteBoxes, b, 5.6, fh + 0.45, -2.35, 0.9, 0.9, 0.9, sofaAlt);
      pushBox(matteBoxes, b, 5.6, fh + 0.45, 0.75, 0.9, 0.9, 0.9, sofaAlt);
      pushBox(matteBoxes, b, 0, fh + 0.95, -2.6, 3.4, 1.9, 0.75, woodDark);

      pushBox(glowBoxes, b, -3.8, fh - 0.56, 0.6, 4.2, 0.12, 0.45, glowColor);
      pushBox(glowBoxes, b, 3.8, fh - 0.56, 0.6, 4.2, 0.12, 0.45, glowColor);
      pushBox(glowBoxes, b, -3.5, rfY - 0.56, -0.6, 4.2, 0.12, 0.45, glowColor);
      pushBox(glowBoxes, b, 3.5, rfY - 0.56, -0.6, 4.2, 0.12, 0.45, glowColor);
      if (isNeon) {
        pushBox(glowBoxes, b, 0, rfY + 1.15, -hd + 0.35, hw * 2, 0.18, 0.2, accCol);
        pushBox(glowBoxes, b, 0, rfY + 1.15, hd - 0.35, hw * 2, 0.18, 0.2, accCol);
      }
    }

    const makeInst = (
      items: Array<{ m: THREE.Matrix4; c: number }>,
      mat: THREE.Material,
      lambertMat: THREE.Material | null,
      castShadow: boolean,
      receiveShadow: boolean,
    ) => {
      if (items.length === 0) return;
      const inst = new THREE.InstancedMesh(unitBox, mat, items.length);
      const col = new THREE.Color();
      for (let i = 0; i < items.length; i++) {
        inst.setMatrixAt(i, items[i].m);
        col.setHex(items[i].c);
        inst.setColorAt(i, col);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.castShadow = castShadow;
      inst.receiveShadow = receiveShadow;
      inst.computeBoundingSphere();
      if (castShadow) shadowCasters.push(inst);
      if (receiveShadow) shadowReceivers.push(inst);
      if (lambertMat) registerSwap(inst, mat, lambertMat);
      group.add(inst);
    };

    const aptMatteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.06,
      envMapIntensity: 0.85,
    });
    const aptMatteMobile = makeMobileLambert(aptMatteMat);
    const aptMetalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.34,
      metalness: 0.78,
      envMapIntensity: 1.1,
    });
    const aptMetalMobile = makeMobileLambert(aptMetalMat);
    const aptGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    disposables.push(unitBox, aptMatteMat, aptMetalMat, aptGlowMat);

    makeInst(matteBoxes, aptMatteMat, aptMatteMobile, shadowsEnabled, shadowsEnabled);
    makeInst(metalBoxes, aptMetalMat, aptMetalMobile, false, shadowsEnabled);
    makeInst(glowBoxes, aptGlowMat, null, false, false);
  }

  // Pillars Consolidated into 2-3 InstancedMeshes (massive draw call savings across all maps!)
  const pillars = getMapPillars(mapId, terrainSeed);
  if (pillars.length > 0) {
    if (mapDef.kind === 'stadium') {
      const poleGeo = new THREE.CylinderGeometry(0.55, 0.65, 1, 8);
      const lampGeo = new THREE.BoxGeometry(5.5, 2.2, 1.8);
      const lightGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
      disposables.push(poleGeo, lampGeo, lightGlowMat);

      const poleInst = new THREE.InstancedMesh(poleGeo, materials.darkBasalt, pillars.length);
      const lampInst = new THREE.InstancedMesh(lampGeo, lightGlowMat, pillars.length);

      let coneInst: THREE.InstancedMesh | null = null;
      if (!isMobile) {
        const coneGeo = new THREE.ConeGeometry(16, 42, 12, 1, true);
        const coneMat = new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.055,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        disposables.push(coneGeo, coneMat);
        coneInst = new THREE.InstancedMesh(coneGeo, coneMat, pillars.length);
      }

      for (let i = 0; i < pillars.length; i++) {
        const p = pillars[i];
        const gy = groundHeightAt(p.x, p.z, mapId, terrainSeed);

        dummy.position.set(p.x, gy - 0.5 + p.height * 0.5, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, p.height, 1);
        dummy.updateMatrix();
        poleInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(p.x, gy - 0.5 + p.height, p.z);
        dummy.lookAt(0, gy + p.height * 0.45, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        lampInst.setMatrixAt(i, dummy.matrix);

        if (coneInst) {
          dummy.position.set(p.x * 0.72, gy + p.height * 0.52, p.z * 0.72);
          dummy.lookAt(0, gy, 0);
          dummy.rotateX(Math.PI / 2);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          coneInst.setMatrixAt(i, dummy.matrix);
        }
      }
      poleInst.instanceMatrix.needsUpdate = true;
      lampInst.instanceMatrix.needsUpdate = true;
      poleInst.computeBoundingSphere();
      lampInst.computeBoundingSphere();
      registerSwap(poleInst, materials.darkBasalt, materials.mobileDarkLambert);
      group.add(poleInst, lampInst);
      if (coneInst) {
        coneInst.instanceMatrix.needsUpdate = true;
        coneInst.computeBoundingSphere();
        group.add(coneInst);
      }
    } else if (mapDef.kind === 'voxel') {
      const boxBodyGeo = new THREE.BoxGeometry(1.75, 1, 1.75);
      const voxelCapGeo = new THREE.BoxGeometry(1.9, 0.25, 1.9);
      const voxelCapMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.85 });
      const voxelCapMobile = makeMobileLambert(voxelCapMat);
      disposables.push(boxBodyGeo, voxelCapGeo, voxelCapMat);

      const bodyInst = new THREE.InstancedMesh(boxBodyGeo, materials.citadelStone, pillars.length);
      const capInst = new THREE.InstancedMesh(voxelCapGeo, voxelCapMat, pillars.length);
      for (let i = 0; i < pillars.length; i++) {
        const p = pillars[i];
        const gy = groundHeightAt(p.x, p.z, mapId, terrainSeed);
        dummy.position.set(p.x, gy - 0.5 + p.height * 0.5, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(p.radius, p.height, p.radius);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(p.x, gy - 0.5 + p.height + 0.12, p.z);
        dummy.scale.set(p.radius, 1, p.radius);
        dummy.updateMatrix();
        capInst.setMatrixAt(i, dummy.matrix);
      }
      bodyInst.instanceMatrix.needsUpdate = true;
      capInst.instanceMatrix.needsUpdate = true;
      bodyInst.computeBoundingSphere();
      capInst.computeBoundingSphere();
      bodyInst.castShadow = shadowsEnabled;
      bodyInst.receiveShadow = shadowsEnabled;
      shadowCasters.push(bodyInst);
      shadowReceivers.push(bodyInst);
      registerSwap(bodyInst, materials.citadelStone, materials.mobileStoneLambert);
      registerSwap(capInst, voxelCapMat, voxelCapMobile);
      group.add(bodyInst, capInst);
    } else {
      const cylBodyGeo = new THREE.CylinderGeometry(0.86, 1.02, 1, 10);
      const pillarCapGeo = new THREE.CylinderGeometry(1.08, 0.94, 0.18, 10);
      disposables.push(cylBodyGeo, pillarCapGeo);

      const bodyInst = new THREE.InstancedMesh(cylBodyGeo, materials.citadelStone, pillars.length);
      const brassInst = new THREE.InstancedMesh(pillarCapGeo, materials.burnishedBrass, pillars.length);
      const topInst = new THREE.InstancedMesh(pillarCapGeo, materials.darkBasalt, pillars.length);

      for (let i = 0; i < pillars.length; i++) {
        const p = pillars[i];
        const gy = groundHeightAt(p.x, p.z, mapId, terrainSeed);

        dummy.position.set(p.x, gy - 0.5 + p.height * 0.5, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(p.radius, p.height, p.radius);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(p.x, gy - 0.5 + p.height * 0.72, p.z);
        dummy.scale.set(p.radius, 1, p.radius);
        dummy.updateMatrix();
        brassInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(p.x, gy - 0.5 + p.height, p.z);
        dummy.scale.set(p.radius, 2.2, p.radius);
        dummy.updateMatrix();
        topInst.setMatrixAt(i, dummy.matrix);
      }
      bodyInst.instanceMatrix.needsUpdate = true;
      brassInst.instanceMatrix.needsUpdate = true;
      topInst.instanceMatrix.needsUpdate = true;
      bodyInst.computeBoundingSphere();
      brassInst.computeBoundingSphere();
      topInst.computeBoundingSphere();
      bodyInst.castShadow = shadowsEnabled;
      bodyInst.receiveShadow = shadowsEnabled;
      shadowCasters.push(bodyInst);
      shadowReceivers.push(bodyInst);
      registerSwap(bodyInst, materials.citadelStone, materials.mobileStoneLambert);
      registerSwap(brassInst, materials.burnishedBrass, materials.mobileBrassLambert);
      registerSwap(topInst, materials.darkBasalt, materials.mobileDarkLambert);
      group.add(bodyInst, brassInst, topInst);
    }
  }

  // Jump Pads: 1 single InstancedMesh for bases + floating rings
  const jumpPads = getMapJumpPads(mapId, terrainSeed);
  const jumpPadRings: THREE.Mesh[] = [];
  const padBaseGeo = new THREE.CylinderGeometry(4.4, 4.9, 0.42, 8);
  const padRingGeo = new THREE.TorusGeometry(3.2, 0.22, 8, 24);
  padRingGeo.rotateX(Math.PI / 2);
  disposables.push(padBaseGeo, padRingGeo);

  const padGlowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });
  disposables.push(padGlowMat);

  if (jumpPads.length > 0) {
    const padBaseInst = new THREE.InstancedMesh(padBaseGeo, materials.darkBasalt, jumpPads.length);
    for (let i = 0; i < jumpPads.length; i++) {
      const pad = jumpPads[i];
      const gy = groundHeightAt(pad.x, pad.z, mapId, terrainSeed);
      dummy.position.set(pad.x, gy + 0.08, pad.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      padBaseInst.setMatrixAt(i, dummy.matrix);

      const ring = new THREE.Mesh(padRingGeo, padGlowMat);
      ring.position.set(pad.x, gy + 0.5, pad.z);
      ring.userData.baseY = gy + 0.45;
      group.add(ring);
      jumpPadRings.push(ring);
    }
    padBaseInst.instanceMatrix.needsUpdate = true;
    padBaseInst.computeBoundingSphere();
    padBaseInst.receiveShadow = shadowsEnabled;
    shadowReceivers.push(padBaseInst);
    registerSwap(padBaseInst, materials.darkBasalt, materials.mobileDarkLambert);
    group.add(padBaseInst);
  }

  const boostRings = getMapBoostRings(mapId, terrainSeed);
  const boostRingMeshes: THREE.Mesh[] = [];
  const boostArchGeo = new THREE.TorusGeometry(3.8, 0.34, 10, 28);
  const boostRingMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.18,
    metalness: 0.4,
  });
  disposables.push(boostArchGeo, boostRingMat);

  for (let i = 0; i < boostRings.length; i++) {
    const br = boostRings[i];
    const mesh = new THREE.Mesh(boostArchGeo, boostRingMat);
    mesh.position.set(br.x, br.y, br.z);
    mesh.rotation.y = br.yaw;
    mesh.userData.baseY = br.y;
    group.add(mesh);
    boostRingMeshes.push(mesh);
  }

  const powerOrbs = getMapPowerOrbs(mapId, terrainSeed);
  const powerOrbMeshes: THREE.Mesh[] = [];
  const powerOrbGeo = new THREE.IcosahedronGeometry(1.55, 0);
  const powerOrbMat = new THREE.MeshStandardMaterial({
    color: 0xc084fc,
    emissive: 0xa855f7,
    emissiveIntensity: 1.35,
    roughness: 0.15,
    metalness: 0.55,
  });
  disposables.push(powerOrbGeo, powerOrbMat);

  for (let i = 0; i < powerOrbs.length; i++) {
    const orb = powerOrbs[i];
    const mesh = new THREE.Mesh(powerOrbGeo, powerOrbMat);
    mesh.position.set(orb.x, orb.y, orb.z);
    mesh.userData.baseY = orb.y;
    group.add(mesh);
    powerOrbMeshes.push(mesh);
  }

  const mapPylons = getMapPylons(mapId, terrainSeed);
  const pylonVisuals: PylonVisual[] = [];
  const spireCone = new THREE.ConeGeometry(1.15, 7.6, 6);
  spireCone.translate(0, 4.1, 0);
  const spirePlinth = new THREE.CylinderGeometry(2.0, 2.4, 0.7, 6);
  spirePlinth.translate(0, 0.35, 0);
  const spireGeo = mergeNormalized([spirePlinth, spireCone]);
  const beaconGeo = new THREE.OctahedronGeometry(1.2, 0);
  disposables.push(spireGeo, beaconGeo);

  for (let i = 0; i < mapPylons.length; i++) {
    const pylon = mapPylons[i];
    const gy = groundHeightAt(pylon.x, pylon.z, mapId, terrainSeed);

    const spire = new THREE.Mesh(spireGeo, materials.darkBasalt);
    spire.position.set(pylon.x, gy - 0.1, pylon.z);
    spire.castShadow = shadowsEnabled;
    shadowCasters.push(spire);
    registerSwap(spire, materials.darkBasalt, materials.mobileDarkLambert);
    group.add(spire);

    const ringGeo = new THREE.RingGeometry(pylon.radius - 0.55, pylon.radius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    disposables.push(ringGeo);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xdca13b,
      emissive: 0xb45309,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    disposables.push(ringMat);

    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(pylon.x, gy + 0.08, pylon.z);
    group.add(ringMesh);

    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.5,
    });
    disposables.push(beaconMat);

    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.set(pylon.x, gy + 9.2, pylon.z);
    group.add(beaconMesh);

    pylonVisuals.push({
      id: pylon.id,
      ringMesh,
      beaconMesh,
      ringMat,
      beaconMat,
    });
  }

  const sweeperGroup = new THREE.Group();
  const beamSegInner = new THREE.CylinderGeometry(0.28, 0.28, 41, 10);
  beamSegInner.rotateZ(Math.PI / 2);
  const beamSegOuter = new THREE.CylinderGeometry(0.28, 0.28, 44, 10);
  beamSegOuter.rotateZ(Math.PI / 2);
  disposables.push(beamSegInner, beamSegOuter);

  for (let b = 0; b < 2; b++) {
    const sign = b === 0 ? 1 : -1;
    const inner = new THREE.Mesh(beamSegInner, materials.sweeperBeam);
    inner.position.set(sign * 45.5, 1.5, 0);
    sweeperGroup.add(inner);

    const outer = new THREE.Mesh(beamSegOuter, materials.sweeperBeam);
    outer.position.set(sign * 96, 1.5, 0);
    sweeperGroup.add(outer);
  }
  group.add(sweeperGroup);

  let mobileLowActive = false;

  return {
    group,
    sweeperGroup,
    jumpPadRings,
    boostRingMeshes,
    powerOrbMeshes,
    pylonVisuals,
    ambientPoints,
    seaMesh,
    seaMat,
    skyMesh,
    skyMat,
    setShadowsEnabled: (enabled: boolean) => {
      for (let i = 0; i < shadowCasters.length; i++) {
        shadowCasters[i].castShadow = enabled;
      }
      for (let i = 0; i < shadowReceivers.length; i++) {
        shadowReceivers[i].receiveShadow = enabled;
      }
    },
    setMobileLowMode: (enabled: boolean) => {
      if (mobileLowActive === enabled) return;
      mobileLowActive = enabled;
      for (let i = 0; i < mobileSwapEntries.length; i++) {
        const entry = mobileSwapEntries[i];
        entry.obj.material = enabled ? entry.lambert : entry.pbr;
      }
    },
    updateWaterTime: (elapsed: number) => {
      seaTimeUniform.value = elapsed;
    },
    dispose: () => {
      group.traverse((obj) => {
        if ((obj as THREE.InstancedMesh).isInstancedMesh) {
          (obj as THREE.InstancedMesh).dispose();
        }
      });
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function createSolarBallRig(): { group: THREE.Group; ball: THREE.Mesh; dispose: () => void } {
  const group = new THREE.Group();
  const ballGeo = new THREE.IcosahedronGeometry(2.6, 1);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.72,
    roughness: 0.28,
    metalness: 0.22,
  });
  const wireGeo = new THREE.IcosahedronGeometry(2.65, 1);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x111827, wireframe: true });
  const ringGeo = new THREE.RingGeometry(2.7, 3.2, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const ball = new THREE.Mesh(ballGeo, ballMat);
  const wire = new THREE.Mesh(wireGeo, wireMat);
  ball.add(wire);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = -2.3;
  group.add(ball, ring);

  return {
    group,
    ball,
    dispose: () => {
      ballGeo.dispose();
      ballMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}

export function createDisasterPillarMesh(
  radius: number,
  height: number,
  kind: 'rock' | 'ice' | 'magma',
  materials: MaterialBank,
): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  const bodyGeo = new THREE.CylinderGeometry(radius * 0.86, radius, height, 7);
  const mat = new THREE.MeshStandardMaterial({
    color: kind === 'ice' ? 0x67e8f9 : kind === 'magma' ? 0x332222 : 0x78716c,
    emissive: kind === 'ice' ? 0x0891b2 : kind === 'magma' ? 0xea580c : 0x000000,
    emissiveIntensity: kind === 'ice' ? 0.45 : kind === 'magma' ? 0.55 : 0,
    roughness: kind === 'ice' ? 0.2 : 0.85,
    metalness: kind === 'ice' ? 0.25 : 0.1,
    normalMap: materials.citadelStone.normalMap,
  });
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.y = height * 0.5;
  group.add(body);
  return {
    group,
    dispose: () => {
      bodyGeo.dispose();
      mat.dispose();
    },
  };
}

export function createFireZoneVisual(kind: 'molotov' | 'cryo', radius: number): {
  group: THREE.Group;
  ringMat: THREE.MeshBasicMaterial;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const isMolotov = kind === 'molotov';
  const ringGeo = new THREE.RingGeometry(Math.max(1, radius - 0.8), radius, 36);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isMolotov ? 0xf97316 : 0x22d3ee,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  group.add(ring);

  const discGeo = new THREE.CircleGeometry(radius * 0.96, 32);
  discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({
    color: isMolotov ? 0xea580c : 0x06b6d4,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = 0.03;
  group.add(disc);

  return {
    group,
    ringMat,
    dispose: () => {
      ringGeo.dispose();
      ringMat.dispose();
      discGeo.dispose();
      discMat.dispose();
    },
  };
}

export function getPaletteColorHex(colorIndex: number): string {
  const safe = Math.max(0, Math.min(HULL_PALETTE.length - 1, colorIndex));
  return HULL_PALETTE[safe].hex;
}
