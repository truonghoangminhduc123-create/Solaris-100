import * as THREE from 'three';
import { HULL_PALETTE, NEXTBOT_DEFS } from '../../shared/world';

export interface MaterialBank {
  limestoneFloor: THREE.MeshStandardMaterial;
  citadelStone: THREE.MeshStandardMaterial;
  darkBasalt: THREE.MeshStandardMaterial;
  burnishedBrass: THREE.MeshPhysicalMaterial;
  canopyGlass: THREE.MeshPhysicalMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  crystalStandard: THREE.MeshPhysicalMaterial;
  crystalCore: THREE.MeshPhysicalMaterial;
  sweeperBeam: THREE.MeshStandardMaterial;
  sentinelBody: THREE.MeshStandardMaterial;
  sentinelCore: THREE.MeshStandardMaterial;
  weaponSteel: THREE.MeshStandardMaterial;
  weaponGunmetal: THREE.MeshStandardMaterial;
  weaponMythicGold: THREE.MeshPhysicalMaterial;
  weaponEdgeGlow: THREE.MeshStandardMaterial;
  seaNormalMap: THREE.DataTexture;
  stadiumTurfMat: THREE.MeshStandardMaterial;
  voxelBlockMat: THREE.MeshStandardMaterial;
  smokeTex: THREE.CanvasTexture;
  flameTex: THREE.CanvasTexture;
  nextbotFaceMaterials: THREE.MeshBasicMaterial[];
  hullMaterials: THREE.MeshPhysicalMaterial[];
  mobileHullLambert: THREE.MeshLambertMaterial[];
  mobileDarkLambert: THREE.MeshLambertMaterial;
  mobileBrassLambert: THREE.MeshLambertMaterial;
  mobileCanopyLambert: THREE.MeshLambertMaterial;
  mobileStoneLambert: THREE.MeshLambertMaterial;
  mobileFloorLambert: THREE.MeshLambertMaterial;
  mobileTurfLambert: THREE.MeshLambertMaterial;
  mobileVoxelLambert: THREE.MeshLambertMaterial;
  mobileWeaponSteelLambert: THREE.MeshLambertMaterial;
  mobileWeaponGunmetalLambert: THREE.MeshLambertMaterial;
  mobileWeaponGoldLambert: THREE.MeshLambertMaterial;
  setQualityOptions: (opts: { transmission: boolean; ultraPbr?: boolean; lowSpec?: boolean }) => void;
  dispose: () => void;
}

function hash2D(ix: number, iy: number, period: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let n = (px * 374761393 + py * 668265263) ^ 0x5bf03635;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function tileNoise(u: number, v: number, freq: number): number {
  const x = u * freq;
  const y = v * freq;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2D(ix, iy, freq);
  const n10 = hash2D(ix + 1, iy, freq);
  const n01 = hash2D(ix, iy + 1, freq);
  const n11 = hash2D(ix + 1, iy + 1, freq);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbmTile(u: number, v: number): number {
  return (
    tileNoise(u, v, 8) * 0.45 +
    tileNoise(u, v, 16) * 0.28 +
    tileNoise(u, v, 32) * 0.17 +
    tileNoise(u, v, 64) * 0.1
  );
}

function buildNormalDataTexture(
  height: Float32Array,
  size: number,
  strength: number,
  repeat: number,
  aniso: number,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const idx = (x: number, y: number) => ((y + size) % size) * size + ((x + size) % size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = height[idx(x - 1, y)];
      const hR = height[idx(x + 1, y)];
      const hD = height[idx(x, y - 1)];
      const hU = height[idx(x, y + 1)];
      const hTL = height[idx(x - 1, y + 1)];
      const hTR = height[idx(x + 1, y + 1)];
      const hBL = height[idx(x - 1, y - 1)];
      const hBR = height[idx(x + 1, y - 1)];

      const dX = (hTR + 2 * hR + hBR - (hTL + 2 * hL + hBL)) * strength;
      const dY = (hTL + 2 * hU + hTR - (hBL + 2 * hD + hBR)) * strength;

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const p = (y * size + x) * 4;
      data[p] = Math.round((nx * 0.5 + 0.5) * 255);
      data[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[p + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[p + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function createStoneTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
} {
  const size = 512;
  const aniso = Math.max(1, Math.min(16, maxAniso || 1));

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  const bImg = bCtx.createImageData(size, size);

  const heightField = new Float32Array(size * size);
  const roughBytes = new Uint8Array(size * size * 4);

  const tileStep = 128;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const modY = y % tileStep;
    const inSeamY = modY < 3 || modY > tileStep - 3;
    const bevelY = Math.min(modY, tileStep - modY);

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const modX = x % tileStep;
      const inSeamX = modX < 3 || modX > tileStep - 3;
      const bevelX = Math.min(modX, tileStep - modX);
      const edgeDist = Math.min(bevelX, bevelY);

      const fbm = fbmTile(u, v);
      const strata = Math.sin((u * 3.0 + v * 1.5 + fbm * 0.45) * Math.PI * 2) * 0.5 + 0.5;
      const fine = tileNoise(u, v, 128);
      const tileId = (Math.floor(x / tileStep) * 7 + Math.floor(y / tileStep) * 13) % 5;
      const tileTint = (tileId - 2) * 0.025;

      // Height computation: stone surface + micro pits + architectural bevel + deep seam
      let h = 0.58 + (fbm - 0.5) * 0.34 + (strata - 0.5) * 0.14 + (fine - 0.5) * 0.12;
      if (fine < 0.12) h -= 0.18; // natural travertine pores
      if (edgeDist < 8) {
        h -= (1 - edgeDist / 8) * 0.14;
      }
      if (inSeamX || inSeamY) {
        h -= 0.42;
      }
      h = Math.max(0, Math.min(1, h));
      const idx = y * size + x;
      heightField[idx] = h;

      // Albedo mineral modulation (neutral-warm so vertexColors tint accurately)
      const seamAO = inSeamX || inSeamY ? 0.64 : edgeDist < 8 ? 0.88 + (edgeDist / 8) * 0.12 : 1.0;
      const shade = (0.88 + (fbm - 0.5) * 0.18 + (strata - 0.5) * 0.08 + tileTint) * seamAO;
      const rCol = Math.max(0, Math.min(255, Math.round(234 * shade)));
      const gCol = Math.max(0, Math.min(255, Math.round(228 * shade)));
      const bCol = Math.max(0, Math.min(255, Math.round(216 * shade)));

      const p = idx * 4;
      imgData.data[p] = rCol;
      imgData.data[p + 1] = gCol;
      imgData.data[p + 2] = bCol;
      imgData.data[p + 3] = 255;

      const bVal = Math.round(h * 255);
      bImg.data[p] = bVal;
      bImg.data[p + 1] = bVal;
      bImg.data[p + 2] = bVal;
      bImg.data[p + 3] = 255;

      // Roughness map: polished slabs (0.48) vs matte mineral veins/pores/seams (0.86..0.96)
      let rough = 0.52 + (1 - fbm) * 0.24 + (fine < 0.12 ? 0.22 : 0);
      if (inSeamX || inSeamY) rough = 0.94;
      const rByte = Math.max(40, Math.min(250, Math.round(rough * 255)));
      roughBytes[p] = rByte;
      roughBytes[p + 1] = rByte;
      roughBytes[p + 2] = rByte;
      roughBytes[p + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  // Subtle metallic hairline inlay inside each architectural slab
  ctx.strokeStyle = 'rgba(218, 175, 85, 0.22)';
  ctx.lineWidth = 1.5;
  for (let gy = 0; gy < size; gy += tileStep) {
    for (let gx = 0; gx < size; gx += tileStep) {
      ctx.strokeRect(gx + 10, gy + 10, tileStep - 20, tileStep - 20);
    }
  }

  const repeat = 26;
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = aniso;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(repeat, repeat);
  bumpMap.anisotropy = aniso;

  const normalMap = buildNormalDataTexture(heightField, size, 2.35, repeat, aniso);

  const roughnessMap = new THREE.DataTexture(roughBytes, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeat, repeat);
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;
  roughnessMap.generateMipmaps = true;
  roughnessMap.anisotropy = aniso;
  roughnessMap.needsUpdate = true;

  return { map, bumpMap, normalMap, roughnessMap };
}

function createBrushedMetalTextures(maxAniso: number): {
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
} {
  const size = 256;
  const aniso = Math.max(1, Math.min(16, maxAniso || 1));
  const height = new Float32Array(size * size);
  const roughBytes = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const rowStreak = tileNoise(0.25, v, 128);
    const seamY = y % 128 < 2;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const microBrush = tileNoise(u * 0.25, v, 64) * 0.5 + rowStreak * 0.5;
      const seamX = x % 128 < 2;
      let h = 0.5 + (microBrush - 0.5) * 0.25;
      if (seamX || seamY) h -= 0.35;
      height[y * size + x] = h;

      const rough = seamX || seamY ? 0.55 : 0.15 + microBrush * 0.16;
      const rByte = Math.round(rough * 255);
      const p = (y * size + x) * 4;
      roughBytes[p] = rByte;
      roughBytes[p + 1] = rByte;
      roughBytes[p + 2] = rByte;
      roughBytes[p + 3] = 255;
    }
  }

  const normalMap = buildNormalDataTexture(height, size, 1.35, 3, aniso);
  const roughnessMap = new THREE.DataTexture(roughBytes, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 3);
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;
  roughnessMap.generateMipmaps = true;
  roughnessMap.anisotropy = aniso;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

function createWaterNormalTexture(maxAniso: number): THREE.DataTexture {
  const size = 256;
  const aniso = Math.max(1, Math.min(16, maxAniso || 1));
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = (y / size) * Math.PI * 2;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const w1 = Math.sin(u * 3 + Math.cos(v * 2) * 0.7) * 0.35;
      const w2 = Math.cos(v * 5 - Math.sin(u * 3) * 0.5) * 0.25;
      const w3 = Math.sin((u + v) * 7) * 0.15;
      const w4 = Math.cos((u * 2 - v * 4) * 3) * 0.1;
      height[y * size + x] = 0.5 + (w1 + w2 + w3 + w4) * 0.5;
    }
  }

  return buildNormalDataTexture(height, size, 1.65, 22, aniso);
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(10, 12, 16, 0.78)');
  grad.addColorStop(0.52, 'rgba(10, 12, 16, 0.34)');
  grad.addColorStop(1, 'rgba(10, 12, 16, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNextbotFaceTexture(variant: number): THREE.CanvasTexture {
  const def = NEXTBOT_DEFS[variant] || NEXTBOT_DEFS[0];
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#07080c';
  ctx.fillRect(0, 0, size, size);

  const rad = ctx.createRadialGradient(128, 118, 12, 128, 128, 128);
  rad.addColorStop(0, def.accent + '44');
  rad.addColorStop(0.7, '#0f111a');
  rad.addColorStop(1, '#050608');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < size; y += 6) {
    ctx.fillRect(0, y, size, 2);
  }

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = def.accent;
  ctx.lineWidth = 4;

  if (variant === 0) {
    ctx.beginPath();
    ctx.ellipse(80, 96, 26, 32, 0, 0, Math.PI * 2);
    ctx.ellipse(176, 96, 26, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#090a0f';
    ctx.beginPath();
    ctx.arc(82, 98, 10, 0, Math.PI * 2);
    ctx.arc(174, 98, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.accent;
    ctx.beginPath();
    ctx.arc(82, 98, 4, 0, Math.PI * 2);
    ctx.arc(174, 98, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(128, 152, 54, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.fill();
  } else if (variant === 1) {
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(76, 94, 24, 0, Math.PI * 2);
    ctx.arc(180, 94, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#050608';
    ctx.beginPath();
    ctx.arc(76, 94, 11, 0, Math.PI * 2);
    ctx.arc(180, 94, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(62, 156, 132, 34);
    ctx.fillStyle = '#050608';
    for (let x = 72; x < 186; x += 22) {
      ctx.fillRect(x, 156, 8, 34);
    }
  } else if (variant === 2) {
    ctx.fillStyle = def.accent;
    ctx.beginPath();
    ctx.moveTo(40, 84);
    ctx.lineTo(108, 108);
    ctx.lineTo(44, 118);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(216, 84);
    ctx.lineTo(148, 108);
    ctx.lineTo(212, 118);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(64, 170);
    ctx.lineTo(96, 154);
    ctx.lineTo(128, 174);
    ctx.lineTo(160, 154);
    ctx.lineTo(192, 170);
    ctx.stroke();
  } else if (variant === 3) {
    ctx.strokeStyle = def.accent;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(128, 116, 82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('X   X', 128, 128);
    ctx.fillStyle = def.accent;
    ctx.fillRect(82, 152, 92, 18);
  } else {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(58, 74, 42, 42);
    ctx.fillRect(156, 74, 42, 42);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(72, 88, 14, 14);
    ctx.fillRect(170, 88, 14, 14);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(72, 154, 112, 22);
  }

  ctx.strokeStyle = def.accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  ctx.fillStyle = def.accent;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(def.name, 128, 232);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStadiumTurfTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 1024;
  const aniso = Math.max(1, Math.min(16, maxAniso || 1));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Outer stadium concrete apron
  ctx.fillStyle = '#283142';
  ctx.fillRect(0, 0, size, size);

  // Pitch dimensions mapped cleanly to arena UVs (Arena radius = 175 -> diameter 350)
  // Pitch X: -76..+76, Pitch Z: -118..+118
  const toPxX = (wx: number) => ((wx + 175) / 350) * size;
  const toPxZ = (wz: number) => ((wz + 175) / 350) * size;

  const pLeft = toPxX(-82);
  const pRight = toPxX(82);
  const pTop = toPxZ(-124);
  const pBot = toPxZ(124);

  // Mowed emerald grass stripes
  const stripeCount = 16;
  const stripeH = (pBot - pTop) / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1b8a42' : '#157035';
    ctx.fillRect(pLeft, pTop + i * stripeH, pRight - pLeft, stripeH + 1);
  }

  // Subtle organic grass grain
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < 1600; i++) {
    const gx = pLeft + ((i * 7919) % Math.max(1, Math.floor(pRight - pLeft)));
    const gz = pTop + ((i * 6271) % Math.max(1, Math.floor(pBot - pTop)));
    ctx.fillRect(gx, gz, 2, 2);
  }

  // Crisp chalk-white pitch markings
  const lLeft = toPxX(-76);
  const lRight = toPxX(76);
  const lTop = toPxZ(-118);
  const lBot = toPxZ(118);
  const midX = size * 0.5;
  const midZ = size * 0.5;

  ctx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
  ctx.lineWidth = 4;
  ctx.strokeRect(lLeft, lTop, lRight - lLeft, lBot - lTop);

  // Halfway line & center circle
  ctx.beginPath();
  ctx.moveTo(lLeft, midZ);
  ctx.lineTo(lRight, midZ);
  ctx.stroke();

  const centerR = (20 / 350) * size;
  ctx.beginPath();
  ctx.arc(midX, midZ, centerR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(midX, midZ, 5, 0, Math.PI * 2);
  ctx.fill();

  // Penalty boxes (North & South goals)
  const penHalfW = (38 / 350) * size;
  const penDepth = (26 / 350) * size;
  const goalHalfW = (18 / 350) * size;
  const goalBoxDepth = (10 / 350) * size;

  ctx.strokeRect(midX - penHalfW, lTop, penHalfW * 2, penDepth);
  ctx.strokeRect(midX - goalHalfW, lTop, goalHalfW * 2, goalBoxDepth);
  ctx.strokeRect(midX - penHalfW, lBot - penDepth, penHalfW * 2, penDepth);
  ctx.strokeRect(midX - goalHalfW, lBot - goalBoxDepth, goalHalfW * 2, goalBoxDepth);

  // Team endzone color accents behind goals (Team Solar Amber vs Team Eclipse Cyan)
  ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
  ctx.fillRect(midX - goalHalfW, lTop - 16, goalHalfW * 2, 14);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.fillRect(midX - goalHalfW, lBot + 2, goalHalfW * 2, 14);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function createVoxelPixelTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cell = 8;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const n = hash2D(x / cell, y / cell, 8);
      const shade = Math.round(212 + (n - 0.5) * 56);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(58, 58);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function createSoftCloudTexture(innerRgba: string, midRgba: string, outerRgba: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(0.45, midRgba);
  grad.addColorStop(1, outerRgba);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMaterialBank(maxAniso: number, useTransmission: boolean): MaterialBank {
  const { map: stoneTex, bumpMap: stoneBump, normalMap: stoneNormal, roughnessMap: stoneRoughness } =
    createStoneTextures(maxAniso);
  const { normalMap: metalNormal, roughnessMap: metalRoughness } = createBrushedMetalTextures(maxAniso);
  const seaNormalMap = createWaterNormalTexture(maxAniso);
  const shadowTex = createContactShadowTexture();
  const stadiumTurfTex = createStadiumTurfTexture(maxAniso);
  const voxelTex = createVoxelPixelTexture();
  const smokeTex = createSoftCloudTexture(
    'rgba(48, 52, 60, 0.92)',
    'rgba(78, 84, 96, 0.52)',
    'rgba(78, 84, 96, 0)',
  );
  const flameTex = createSoftCloudTexture(
    'rgba(255, 248, 200, 0.98)',
    'rgba(251, 146, 60, 0.65)',
    'rgba(239, 68, 68, 0)',
  );

  const limestoneFloor = new THREE.MeshStandardMaterial({
    map: stoneTex,
    normalMap: stoneNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: stoneRoughness,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.08,
    envMapIntensity: 1.05,
  });

  const citadelStone = new THREE.MeshStandardMaterial({
    color: 0xe6dcc8,
    map: stoneTex,
    normalMap: stoneNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: stoneRoughness,
    roughness: 0.85,
    metalness: 0.14,
    envMapIntensity: 1.15,
  });

  const darkBasalt = new THREE.MeshStandardMaterial({
    color: 0x222631,
    normalMap: metalNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: metalRoughness,
    roughness: 0.72,
    metalness: 0.58,
    envMapIntensity: 1.25,
  });

  const burnishedBrass = new THREE.MeshPhysicalMaterial({
    color: 0xdca13b,
    normalMap: metalNormal,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughnessMap: metalRoughness,
    roughness: 0.6,
    metalness: 0.94,
    anisotropy: 0.8,
    clearcoat: 0.72,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.5,
  });

  const canopyGlass = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.06,
    metalness: 0.12,
    transmission: useTransmission ? 0.78 : 0,
    transparent: true,
    opacity: useTransmission ? 1 : 0.74,
    ior: 1.54,
    thickness: 0.65,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.55,
  });

  const contactShadow = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.62,
  });

  const crystalStandard = new THREE.MeshPhysicalMaterial({
    color: 0x14b8a6,
    emissive: 0x0d9488,
    emissiveIntensity: 0.62,
    roughness: 0.12,
    metalness: 0.25,
    clearcoat: 1.0,
    iridescence: 0.5,
    iridescenceIOR: 1.5,
  });

  const crystalCore = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.9,
    roughness: 0.1,
    metalness: 0.48,
    clearcoat: 1.0,
    iridescence: 0.6,
    iridescenceIOR: 1.6,
  });

  const sweeperBeam = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xea580c,
    emissiveIntensity: 1.55,
    roughness: 0.2,
    metalness: 0.6,
  });

  const sentinelBody = new THREE.MeshStandardMaterial({
    color: 0x1e222b,
    normalMap: metalNormal,
    roughnessMap: metalRoughness,
    roughness: 0.52,
    metalness: 0.84,
    envMapIntensity: 1.25,
  });

  const sentinelCore = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 1.35,
    roughness: 0.18,
    metalness: 0.3,
  });

  const weaponSteel = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    normalMap: metalNormal,
    roughnessMap: metalRoughness,
    roughness: 0.44,
    metalness: 0.92,
    envMapIntensity: 1.35,
  });

  const weaponGunmetal = new THREE.MeshStandardMaterial({
    color: 0x262b38,
    normalMap: metalNormal,
    roughnessMap: metalRoughness,
    roughness: 0.58,
    metalness: 0.8,
    envMapIntensity: 1.2,
  });

  const weaponMythicGold = new THREE.MeshPhysicalMaterial({
    color: 0xfacc15,
    emissive: 0xd97706,
    emissiveIntensity: 0.56,
    normalMap: metalNormal,
    roughnessMap: metalRoughness,
    roughness: 0.36,
    metalness: 0.96,
    anisotropy: 0.85,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.55,
  });

  const weaponEdgeGlow = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.45,
    roughness: 0.14,
    metalness: 0.22,
  });

  const faceTextures: THREE.CanvasTexture[] = [];
  const nextbotFaceMaterials = NEXTBOT_DEFS.map((def) => {
    const tex = createNextbotFaceTexture(def.variant);
    faceTextures.push(tex);
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  });

  const hullMaterials = HULL_PALETTE.map(
    (entry) =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(entry.hex),
        normalMap: metalNormal,
        normalScale: new THREE.Vector2(0.18, 0.18),
        roughnessMap: metalRoughness,
        roughness: 0.48,
        metalness: 0.76,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        iridescence: 0.35,
        iridescenceIOR: 1.45,
        envMapIntensity: 1.48,
      }),
  );

  const stadiumTurfMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: stadiumTurfTex,
    roughness: 0.88,
    metalness: 0.04,
    envMapIntensity: 0.9,
  });

  const voxelBlockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: voxelTex,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.05,
    envMapIntensity: 0.85,
  });

  // Mobile-fast Lambert materials (zero Cook-Torrance GGX/IBL/clearcoat overhead while keeping crisp textures & 100% full resolution)
  const mobileHullLambert = HULL_PALETTE.map(
    (entry) =>
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(entry.hex),
      }),
  );
  const mobileDarkLambert = new THREE.MeshLambertMaterial({ color: 0x262c3a });
  const mobileBrassLambert = new THREE.MeshLambertMaterial({ color: 0xdca13b });
  const mobileCanopyLambert = new THREE.MeshLambertMaterial({
    color: 0x16243b,
    emissive: 0x0a1426,
    emissiveIntensity: 0.4,
  });
  const mobileStoneLambert = new THREE.MeshLambertMaterial({ color: 0xe6dcc8 });
  const mobileFloorLambert = new THREE.MeshLambertMaterial({
    map: stoneTex,
    vertexColors: true,
  });
  const mobileTurfLambert = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: stadiumTurfTex,
  });
  const mobileVoxelLambert = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: voxelTex,
    vertexColors: true,
  });
  const mobileWeaponSteelLambert = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });
  const mobileWeaponGunmetalLambert = new THREE.MeshLambertMaterial({ color: 0x2a3140 });
  const mobileWeaponGoldLambert = new THREE.MeshLambertMaterial({
    color: 0xfacc15,
    emissive: 0xd97706,
    emissiveIntensity: 0.45,
  });

  const allMaterials: THREE.Material[] = [
    limestoneFloor,
    citadelStone,
    darkBasalt,
    burnishedBrass,
    canopyGlass,
    contactShadow,
    crystalStandard,
    crystalCore,
    sweeperBeam,
    sentinelBody,
    sentinelCore,
    weaponSteel,
    weaponGunmetal,
    weaponMythicGold,
    weaponEdgeGlow,
    stadiumTurfMat,
    voxelBlockMat,
    ...nextbotFaceMaterials,
    ...hullMaterials,
    ...mobileHullLambert,
    mobileDarkLambert,
    mobileBrassLambert,
    mobileCanopyLambert,
    mobileStoneLambert,
    mobileFloorLambert,
    mobileTurfLambert,
    mobileVoxelLambert,
    mobileWeaponSteelLambert,
    mobileWeaponGunmetalLambert,
    mobileWeaponGoldLambert,
  ];

  let currentQualityMode: 'low' | 'mid' | 'ultra' = 'ultra';

  return {
    limestoneFloor,
    citadelStone,
    darkBasalt,
    burnishedBrass,
    canopyGlass,
    contactShadow,
    crystalStandard,
    crystalCore,
    sweeperBeam,
    sentinelBody,
    sentinelCore,
    weaponSteel,
    weaponGunmetal,
    weaponMythicGold,
    weaponEdgeGlow,
    seaNormalMap,
    stadiumTurfMat,
    voxelBlockMat,
    smokeTex,
    flameTex,
    nextbotFaceMaterials,
    hullMaterials,
    mobileHullLambert,
    mobileDarkLambert,
    mobileBrassLambert,
    mobileCanopyLambert,
    mobileStoneLambert,
    mobileFloorLambert,
    mobileTurfLambert,
    mobileVoxelLambert,
    mobileWeaponSteelLambert,
    mobileWeaponGunmetalLambert,
    mobileWeaponGoldLambert,
    setQualityOptions: ({ transmission, ultraPbr = true, lowSpec = false }) => {
      const nextTrans = transmission ? 0.78 : 0;
      const nextOpacity = transmission ? 1 : 0.74;
      if (canopyGlass.transmission !== nextTrans || canopyGlass.opacity !== nextOpacity) {
        canopyGlass.transmission = nextTrans;
        canopyGlass.opacity = nextOpacity;
        canopyGlass.needsUpdate = true;
      }

      const targetMode: 'low' | 'mid' | 'ultra' = lowSpec ? 'low' : ultraPbr ? 'ultra' : 'mid';
      if (currentQualityMode !== targetMode) {
        currentQualityMode = targetMode;
        if (targetMode === 'ultra') {
          limestoneFloor.normalMap = stoneNormal;
          limestoneFloor.normalScale.set(1.38, 1.38);
          limestoneFloor.roughnessMap = stoneRoughness;
          limestoneFloor.bumpMap = null;
          limestoneFloor.roughness = 0.88;
          limestoneFloor.metalness = 0.12;
          limestoneFloor.envMapIntensity = 0.92;

          citadelStone.normalMap = stoneNormal;
          citadelStone.normalScale.set(1.18, 1.18);
          citadelStone.roughnessMap = stoneRoughness;
          citadelStone.bumpMap = null;
          citadelStone.roughness = 0.78;
          citadelStone.metalness = 0.18;
          citadelStone.envMapIntensity = 0.98;

          darkBasalt.normalMap = metalNormal;
          darkBasalt.normalScale.set(0.68, 0.68);
          darkBasalt.roughnessMap = metalRoughness;
          darkBasalt.roughness = 0.62;
          darkBasalt.metalness = 0.72;
          darkBasalt.envMapIntensity = 1.18;

          burnishedBrass.clearcoat = 0.88;
          burnishedBrass.clearcoatRoughness = 0.08;
          burnishedBrass.anisotropy = 0.9;
          burnishedBrass.envMapIntensity = 1.35;

          weaponSteel.normalScale.set(0.75, 0.75);
          weaponSteel.roughness = 0.36;
          weaponSteel.envMapIntensity = 1.32;
          weaponGunmetal.normalScale.set(0.65, 0.65);
          weaponGunmetal.roughness = 0.48;

          weaponMythicGold.clearcoat = 1.0;
          weaponMythicGold.anisotropy = 0.92;
          weaponMythicGold.envMapIntensity = 1.45;

          stadiumTurfMat.normalMap = stoneNormal;
          stadiumTurfMat.normalScale.set(0.32, 0.32);
          stadiumTurfMat.roughness = 0.82;

          for (const hm of hullMaterials) {
            hm.normalMap = metalNormal;
            hm.normalScale.set(0.26, 0.26);
            hm.roughnessMap = metalRoughness;
            hm.roughness = 0.42;
            hm.metalness = 0.82;
            hm.clearcoat = 1.0;
            hm.clearcoatRoughness = 0.05;
            hm.iridescence = 0.44;
            hm.envMapIntensity = 1.38;
            hm.needsUpdate = true;
          }
        } else if (targetMode === 'mid') {
          limestoneFloor.normalMap = null;
          limestoneFloor.roughnessMap = null;
          limestoneFloor.bumpMap = stoneBump;
          limestoneFloor.bumpScale = 0.22;
          limestoneFloor.roughness = 0.74;
          limestoneFloor.metalness = 0.08;

          citadelStone.normalMap = null;
          citadelStone.roughnessMap = null;
          citadelStone.bumpMap = stoneBump;
          citadelStone.bumpScale = 0.14;
          citadelStone.roughness = 0.62;
          citadelStone.metalness = 0.14;

          darkBasalt.normalMap = null;
          darkBasalt.roughnessMap = null;
          darkBasalt.roughness = 0.72;
          darkBasalt.metalness = 0.58;

          burnishedBrass.clearcoat = 0.5;
          weaponMythicGold.clearcoat = 0.8;
          stadiumTurfMat.normalMap = null;

          for (const hm of hullMaterials) {
            hm.normalMap = null;
            hm.roughnessMap = null;
            hm.roughness = 0.24;
            hm.clearcoat = 0.6;
            hm.iridescence = 0;
            hm.needsUpdate = true;
          }
        } else {
          // Low spec: disable expensive bump/normal/roughness map lookups and clearcoat passes while keeping 100% full resolution
          limestoneFloor.normalMap = null;
          limestoneFloor.roughnessMap = null;
          limestoneFloor.bumpMap = null;
          limestoneFloor.roughness = 0.86;

          citadelStone.normalMap = null;
          citadelStone.roughnessMap = null;
          citadelStone.bumpMap = null;
          citadelStone.roughness = 0.76;

          darkBasalt.normalMap = null;
          darkBasalt.roughnessMap = null;

          burnishedBrass.clearcoat = 0;
          weaponMythicGold.clearcoat = 0;
          stadiumTurfMat.normalMap = null;

          for (const hm of hullMaterials) {
            hm.normalMap = null;
            hm.roughnessMap = null;
            hm.roughness = 0.34;
            hm.clearcoat = 0;
            hm.iridescence = 0;
            hm.needsUpdate = true;
          }
        }
        limestoneFloor.needsUpdate = true;
        citadelStone.needsUpdate = true;
        darkBasalt.needsUpdate = true;
        burnishedBrass.needsUpdate = true;
        weaponSteel.needsUpdate = true;
        weaponGunmetal.needsUpdate = true;
        weaponMythicGold.needsUpdate = true;
        stadiumTurfMat.needsUpdate = true;
      }
    },
    dispose: () => {
      stoneTex.dispose();
      stoneBump.dispose();
      stoneNormal.dispose();
      stoneRoughness.dispose();
      metalNormal.dispose();
      metalRoughness.dispose();
      seaNormalMap.dispose();
      shadowTex.dispose();
      stadiumTurfTex.dispose();
      voxelTex.dispose();
      smokeTex.dispose();
      flameTex.dispose();
      faceTextures.forEach((t) => t.dispose());
      allMaterials.forEach((m) => m.dispose());
    },
  };
}
