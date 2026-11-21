import * as THREE from 'three';
import {
  CRYSTAL_COUNT,
  generateCrystalLayout,
  getApartmentSupportY,
  getMapDef,
  getWeaponDef,
  groundHeightAt,
  isSpaceMap,
  isStadiumMap,
} from '../../shared/world';
import { createMaterialBank } from './materials';
import {
  createArenaEnvironment,
  createDisasterPillarMesh,
  createGroundWeaponRig,
  createNextbotRig,
  createSentinelRig,
  createSkimmerRig,
  createSolarBallRig,
  getPaletteColorHex,
} from './models';
import type { FrozenSceneSnapshot } from './photoStorage';

export interface BuiltPhotoScene {
  scene: THREE.Scene;
  keyLightDir: THREE.Vector3;
  skyHex: number;
  seaHex: number;
  isSpace: boolean;
  dispose: () => void;
}

export function buildPhotoStudioScene(
  snapshot: FrozenSceneSnapshot,
  maxAniso = 8,
): BuiltPhotoScene {
  const scene = new THREE.Scene();
  const mapDef = getMapDef(snapshot.mapId);
  scene.background = new THREE.Color(mapDef.skyHex);
  scene.fog = new THREE.FogExp2(mapDef.skyHex, mapDef.fogDensity * 0.85);

  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0xb48a5a, 0.50);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.95);
  keyLight.position.set(85, 130, 65);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 10;
  keyLight.shadow.camera.far = 280;
  const d = 96;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.024;
  scene.add(keyLight);
  scene.add(keyLight.target);

  const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.65);
  rimLight.position.set(-90, 55, -110);
  scene.add(rimLight);

  const materials = createMaterialBank(maxAniso, true);
  materials.setQualityOptions({ transmission: true, ultraPbr: true, lowSpec: false });

  const arena = createArenaEnvironment(
    materials,
    true,
    snapshot.mapId,
    snapshot.terrainSeed,
    { isMobile: false },
  );
  arena.sweeperGroup.rotation.y = -snapshot.beamAngle;
  scene.add(arena.group);

  const disposables: Array<{ dispose: () => void }> = [];

  // Pylon states
  for (let i = 0; i < snapshot.pylons.length; i++) {
    const p = snapshot.pylons[i];
    const vis = arena.pylonVisuals[i];
    if (!vis) continue;
    if (p.ownerSlotId !== null) {
      const hex = getPaletteColorHex(p.ownerColor);
      vis.ringMat.color.set(hex);
      vis.ringMat.emissive.set(hex);
      vis.beaconMat.color.set(hex);
      vis.beaconMat.emissive.set(hex);
    }
  }

  // Crystals
  const crystalLayout = generateCrystalLayout(snapshot.mapId, snapshot.terrainSeed);
  const stdGeo = new THREE.OctahedronGeometry(0.95, 0);
  const coreGeo = new THREE.OctahedronGeometry(1.5, 1);
  disposables.push(stdGeo, coreGeo);
  for (let i = 0; i < Math.min(CRYSTAL_COUNT, crystalLayout.length); i++) {
    if (snapshot.crystals[i] === false) continue;
    const c = crystalLayout[i];
    const isCore = c.kind === 1;
    const mesh = new THREE.Mesh(
      isCore ? coreGeo : stdGeo,
      isCore ? materials.crystalCore : materials.crystalStandard,
    );
    mesh.position.set(c.x, c.y + 1.25, c.z);
    mesh.scale.setScalar(isCore ? 1.28 : 1.0);
    mesh.castShadow = true;
    scene.add(mesh);
  }

  // Players & Bots
  for (const p of snapshot.players) {
    const rig = createSkimmerRig(materials, p.colorIndex, false, false);
    rig.root.position.set(p.x, p.y, p.z);
    rig.root.rotation.y = p.yaw;
    rig.root.scale.setScalar(p.scale);
    rig.setWeaponIndex(p.weaponKindIndex, materials, false);

    const gy = getApartmentSupportY(
      p.x,
      p.z,
      p.y - 0.9 * p.scale,
      snapshot.mapId,
      snapshot.terrainSeed,
    );
    const pTeam = p.teamId || (p.specialRole === 5 || p.specialRole === 6 ? p.specialRole : 0);
    const markerColorHex = pTeam === 5 ? 0xfbbf24 : pTeam === 6 ? 0x38bdf8 : 0x34d399;
    rig.setVisualState({
      shield: p.shield,
      dashing: p.dashing,
      sovereign: p.sovereign,
      shielded: p.shielded,
      overdrive: p.overdrive,
      attacking: p.attacking,
      isHumanMarker: false,
      markerColorHex,
      groundY: gy,
      roll: p.roll,
      pitch: isSpaceMap(snapshot.mapId) ? -p.pitch : p.pitch * 0.45,
      dt: 0.016,
      elapsed: 1.0,
      lowDetail: false,
      farDetail: false,
    });
    scene.add(rig.root);
  }

  // Nextbots
  for (const nb of snapshot.nextbots) {
    if (nb.banished) continue;
    const rig = createNextbotRig(materials, nb.typeIndex);
    rig.root.position.set(nb.x, nb.y, nb.z);
    rig.root.lookAt(snapshot.camera.x, nb.y, snapshot.camera.z);
    rig.root.scale.setScalar(nb.scale || 1);
    scene.add(rig.root);
    disposables.push(rig);
  }

  // Sentinels
  for (const s of snapshot.sentinels) {
    if (s.state === 3) continue;
    const rig = createSentinelRig(materials, true);
    rig.root.position.set(s.x, s.y, s.z);
    rig.coreGroup.rotation.y = s.rotY;
    scene.add(rig.root);
  }

  // Solar Ball
  if (snapshot.solarBall && isStadiumMap(snapshot.mapId)) {
    const ballRig = createSolarBallRig();
    ballRig.group.position.set(snapshot.solarBall.x, snapshot.solarBall.y, snapshot.solarBall.z);
    scene.add(ballRig.group);
    disposables.push(ballRig);
  }

  // Ground weapons
  for (const gw of snapshot.groundWeapons) {
    const def = getWeaponDef(gw.id);
    const rig = createGroundWeaponRig(materials, gw.id, def.rarity === 'mythic');
    rig.root.position.set(gw.x, gw.y, gw.z);
    rig.root.rotation.y = gw.spinY;
    scene.add(rig.root);
    disposables.push(rig);
  }

  // Thrown projectiles frozen mid-air
  const throwGeo = new THREE.SphereGeometry(0.42, 12, 10);
  disposables.push(throwGeo);
  for (const tp of snapshot.thrownProjectiles) {
    const mat = new THREE.MeshStandardMaterial({
      color: tp.color,
      emissive: tp.color,
      emissiveIntensity: 1.5,
      roughness: 0.25,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(throwGeo, mat);
    mesh.position.set(tp.x, tp.y, tp.z);
    scene.add(mesh);
    disposables.push(mat);
  }

  // Disaster pillars
  for (const dp of snapshot.disasterPillars) {
    const pMesh = createDisasterPillarMesh(dp.radius, dp.height, dp.kind, materials);
    const gy = groundHeightAt(dp.x, dp.z, snapshot.mapId, snapshot.terrainSeed);
    pMesh.group.position.set(dp.x, gy - 0.6, dp.z);
    scene.add(pMesh.group);
    disposables.push(pMesh);
  }

  // Frozen beams
  const unitBeamGeo = new THREE.CylinderGeometry(0.11, 0.11, 1, 8, 1, false);
  unitBeamGeo.rotateX(Math.PI / 2);
  disposables.push(unitBeamGeo);
  for (const b of snapshot.beams) {
    const mat = new THREE.MeshBasicMaterial({
      color: b.colorHex,
      transparent: true,
      opacity: b.opacity,
    });
    const mesh = new THREE.Mesh(unitBeamGeo, mat);
    const cosP = Math.cos(b.pitch);
    const fx = Math.sin(b.yaw) * cosP;
    const fy = Math.sin(b.pitch);
    const fz = Math.cos(b.yaw) * cosP;
    mesh.position.set(b.x + fx * b.length * 0.5, b.y + fy * b.length * 0.5, b.z + fz * b.length * 0.5);
    mesh.lookAt(b.x + fx * b.length, b.y + fy * b.length, b.z + fz * b.length);
    mesh.scale.set(1, 1, b.length);
    scene.add(mesh);
    disposables.push(mat);
  }

  // Frozen flying ballistic bullets
  const bulletHeadGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const bulletTailGeo = new THREE.CylinderGeometry(0.05, 0.14, 1, 8, 1, false);
  bulletTailGeo.rotateX(Math.PI / 2);
  disposables.push(bulletHeadGeo, bulletTailGeo);
  for (const bl of snapshot.bullets) {
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: bl.colorHex,
      emissiveIntensity: bl.mythic ? 3.2 : 2.4,
      roughness: 0.15,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: bl.colorHex,
      emissive: bl.colorHex,
      emissiveIntensity: bl.mythic ? 2.2 : 1.6,
      transparent: true,
      opacity: 0.85,
      roughness: 0.2,
    });
    const grp = new THREE.Group();
    const head = new THREE.Mesh(bulletHeadGeo, headMat);
    const tailLen = Math.max(2.2, bl.length);
    const tail = new THREE.Mesh(bulletTailGeo, tailMat);
    tail.scale.set(bl.mythic ? 1.5 : 1.0, bl.mythic ? 1.5 : 1.0, tailLen);
    tail.position.set(0, 0, -tailLen * 0.5);
    grp.add(head, tail);
    grp.position.set(bl.x, bl.y, bl.z);
    grp.lookAt(bl.x + bl.dirX * 10, bl.y + bl.dirY * 10, bl.z + bl.dirZ * 10);
    scene.add(grp);
    disposables.push(headMat, tailMat);
  }

  // Frozen shockwave rings
  const ringGeo = new THREE.RingGeometry(0.65, 1.0, 28);
  ringGeo.rotateX(-Math.PI / 2);
  disposables.push(ringGeo);
  for (const r of snapshot.rings) {
    const mat = new THREE.MeshBasicMaterial({
      color: r.colorHex,
      transparent: true,
      opacity: r.opacity,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.set(r.x, r.y, r.z);
    mesh.scale.setScalar(r.scale);
    scene.add(mesh);
    disposables.push(mat);
  }

  // Frozen sparks (solid emissive shards so they also raytrace crisply!)
  const sparkGeo = new THREE.OctahedronGeometry(0.18, 0);
  disposables.push(sparkGeo);
  for (const sp of snapshot.sparks) {
    const mat = new THREE.MeshStandardMaterial({
      color: sp.colorHex,
      emissive: sp.colorHex,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    });
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.position.set(sp.x, sp.y, sp.z);
    mesh.scale.setScalar(sp.scale);
    scene.add(mesh);
    disposables.push(mat);
  }

  // Frozen fire/smoke spheres (soft translucent volumetric puffs for both preview & raytracer)
  const puffGeo = new THREE.IcosahedronGeometry(0.45, 1);
  disposables.push(puffGeo);
  for (const sm of snapshot.smoke) {
    const mat = new THREE.MeshStandardMaterial({
      color: sm.colorHex,
      emissive: sm.additive ? sm.colorHex : 0x000000,
      emissiveIntensity: sm.additive ? 2.2 : 0,
      roughness: 0.9,
      transparent: true,
      opacity: Math.min(0.68, sm.opacity),
    });
    const mesh = new THREE.Mesh(puffGeo, mat);
    mesh.position.set(sm.x, sm.y, sm.z);
    mesh.scale.setScalar(sm.scale * 0.55);
    scene.add(mesh);
    disposables.push(mat);
  }

  // Frozen meteors
  const metGeo = new THREE.DodecahedronGeometry(2.8, 1);
  const metMat = new THREE.MeshStandardMaterial({
    color: 0x3b1812,
    emissive: 0xea580c,
    emissiveIntensity: 1.5,
    roughness: 0.8,
  });
  disposables.push(metGeo, metMat);
  for (const m of snapshot.meteors) {
    const mesh = new THREE.Mesh(metGeo, metMat);
    mesh.position.set(m.x, m.y, m.z);
    scene.add(mesh);
  }

  scene.updateMatrixWorld(true);

  return {
    scene,
    keyLightDir: new THREE.Vector3(85, 130, 65).normalize(),
    skyHex: mapDef.skyHex,
    seaHex: mapDef.seaHex,
    isSpace: isSpaceMap(snapshot.mapId),
    dispose: () => {
      for (const dItem of disposables) dItem.dispose();
      arena.dispose();
      materials.dispose();
    },
  };
}
