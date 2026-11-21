import * as THREE from 'three';
import type { BuiltPhotoScene } from './photoSceneBuilder';

export type RaytracerBackend = 'WebGPU' | 'CPU';

export interface RaytraceOptions {
  width: number;
  height: number;
  samplesPerPixel: number;
  maxBounces: number;
  camera: THREE.PerspectiveCamera;
  preferWebGPU?: boolean;
  signal?: AbortSignal;
  onStatus?: (msg: string, backend: RaytracerBackend) => void;
  onTileComplete?: (info: {
    x: number;
    y: number;
    w: number;
    h: number;
    imageData: ImageData;
    doneTiles: number;
    totalTiles: number;
    backend: RaytracerBackend;
    phase: 'tracing' | 'denoising';
  }) => void;
}

export interface RaytraceResult {
  backend: RaytracerBackend;
  durationMs: number;
  triCount: number;
  cancelled: boolean;
}

interface ExtractedSceneData {
  triCount: number;
  nodeCount: number;
  /** 32 floats (8 vec4) per triangle:
   * [v0x,v0y,v0z,rough, e1x,e1y,e1z,metal, e2x,e2y,e2z,trans, n0x,n0y,n0z,opacity,
   *  n1x,n1y,n1z,ior, n2x,n2y,n2z,0, colR,colG,colB,0, emitR,emitG,emitB,0] */
  tris: Float32Array;
  /** 8 floats/ints (32 bytes) per BVH node:
   * [minX,minY,minZ,data0(u32), maxX,maxY,maxZ,data1(u32)] */
  nodesBuffer: ArrayBuffer;
  nodesF32: Float32Array;
  nodesU32: Uint32Array;
}

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n0 = new THREE.Vector3();
const _n1 = new THREE.Vector3();
const _n2 = new THREE.Vector3();
const _edge1 = new THREE.Vector3();
const _edge2 = new THREE.Vector3();
const _faceN = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();
const _instanceMatrix = new THREE.Matrix4();
const _worldMatrix = new THREE.Matrix4();
const _colorTmp = new THREE.Color();

// Cache 2D pixel samplers for CanvasTexture / HTMLCanvasElement maps so raytracer picks up painted textures
const texSamplerCache = new WeakMap<
  THREE.Texture,
  { w: number; h: number; data: Uint8ClampedArray } | null
>();

function getTexturePixelData(tex: THREE.Texture | null | undefined) {
  if (!tex) return null;
  if (texSamplerCache.has(tex)) return texSamplerCache.get(tex) || null;
  try {
    const img = tex.image as HTMLCanvasElement | HTMLImageElement | ImageBitmap | undefined;
    if (!img) {
      texSamplerCache.set(tex, null);
      return null;
    }
    const iw = (img as HTMLCanvasElement).width || (img as HTMLImageElement).naturalWidth || 0;
    const ih = (img as HTMLCanvasElement).height || (img as HTMLImageElement).naturalHeight || 0;
    if (iw <= 0 || ih <= 0) {
      texSamplerCache.set(tex, null);
      return null;
    }
    const w = Math.min(128, iw);
    const h = Math.min(128, ih);
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');
    if (!ctx) {
      texSamplerCache.set(tex, null);
      return null;
    }
    ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const entry = { w, h, data };
    texSamplerCache.set(tex, entry);
    return entry;
  } catch {
    texSamplerCache.set(tex, null);
    return null;
  }
}

function sampleTexRGB(
  texData: { w: number; h: number; data: Uint8ClampedArray } | null,
  u: number,
  v: number,
  repeatX: number,
  repeatY: number,
): [number, number, number] {
  if (!texData) return [1, 1, 1];
  const uu = (((u * repeatX) % 1) + 1) % 1;
  const vv = (((1 - v * repeatY) % 1) + 1) % 1;
  const px = Math.min(texData.w - 1, Math.max(0, Math.floor(uu * texData.w)));
  const py = Math.min(texData.h - 1, Math.max(0, Math.floor(vv * texData.h)));
  const idx = (py * texData.w + px) * 4;
  // Convert sRGB byte -> linear approx
  const r = Math.pow(texData.data[idx] / 255, 2.2);
  const g = Math.pow(texData.data[idx + 1] / 255, 2.2);
  const b = Math.pow(texData.data[idx + 2] / 255, 2.2);
  return [r, g, b];
}

function extractBvhScene(built: BuiltPhotoScene): ExtractedSceneData {
  built.scene.updateMatrixWorld(true);

  const rawTris: number[] = [];
  const centroids: number[] = [];
  const mins: number[] = [];
  const maxs: number[] = [];

  const pushMeshTris = (
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    matrix: THREE.Matrix4,
  ) => {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return;

    const anyMat = mat as THREE.MeshPhysicalMaterial & THREE.MeshBasicMaterial;
    if (anyMat.visible === false) return;
    if (anyMat.transparent && (anyMat.opacity ?? 1) < 0.08) return;

    // Skip huge sky dome spheres (radius > 340) so rays reach analytical sky light
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    if (geometry.boundingSphere && geometry.boundingSphere.radius > 340) return;

    const normAttr = geometry.getAttribute('normal');
    const colorAttr = geometry.getAttribute('color');
    const uvAttr = geometry.getAttribute('uv');
    const index = geometry.getIndex();

    const baseCol = anyMat.color ? anyMat.color.clone() : new THREE.Color(0xd8d8d8);
    const emitCol = anyMat.emissive ? anyMat.emissive.clone() : new THREE.Color(0x000000);
    const emitInt = anyMat.emissiveIntensity ?? (emitCol.r + emitCol.g + emitCol.b > 0 ? 1 : 0);
    const isBasic = mat.type === 'MeshBasicMaterial';

    const texData = getTexturePixelData(anyMat.map);
    const repX = anyMat.map?.repeat?.x ?? 1;
    const repY = anyMat.map?.repeat?.y ?? 1;

    const rough = Math.max(0.03, Math.min(1.0, anyMat.roughness ?? 0.65));
    const metal = Math.max(0.0, Math.min(1.0, anyMat.metalness ?? 0.0));
    const trans = Math.max(0.0, Math.min(1.0, anyMat.transmission ?? 0.0));
    const opacity = Math.max(0.05, Math.min(1.0, anyMat.opacity ?? 1.0));
    const ior = Math.max(1.05, Math.min(2.4, anyMat.ior ?? 1.45));

    _normalMatrix.getNormalMatrix(matrix);

    const triCountHere = index ? Math.floor(index.count / 3) : Math.floor(posAttr.count / 3);
    for (let t = 0; t < triCountHere; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      _v0.fromBufferAttribute(posAttr, i0).applyMatrix4(matrix);
      _v1.fromBufferAttribute(posAttr, i1).applyMatrix4(matrix);
      _v2.fromBufferAttribute(posAttr, i2).applyMatrix4(matrix);

      _edge1.subVectors(_v1, _v0);
      _edge2.subVectors(_v2, _v0);
      _faceN.crossVectors(_edge1, _edge2);
      const area2Sq = _faceN.lengthSq();
      if (area2Sq < 1e-10) continue;
      _faceN.divideScalar(Math.sqrt(area2Sq));

      if (normAttr) {
        _n0.fromBufferAttribute(normAttr, i0).applyMatrix3(_normalMatrix).normalize();
        _n1.fromBufferAttribute(normAttr, i1).applyMatrix3(_normalMatrix).normalize();
        _n2.fromBufferAttribute(normAttr, i2).applyMatrix3(_normalMatrix).normalize();
        if (_n0.lengthSq() < 0.01) _n0.copy(_faceN);
        if (_n1.lengthSq() < 0.01) _n1.copy(_faceN);
        if (_n2.lengthSq() < 0.01) _n2.copy(_faceN);
      } else {
        _n0.copy(_faceN);
        _n1.copy(_faceN);
        _n2.copy(_faceN);
      }

      let cr = baseCol.r;
      let cg = baseCol.g;
      let cb = baseCol.b;
      if (colorAttr) {
        _colorTmp.setRGB(
          (colorAttr.getX(i0) + colorAttr.getX(i1) + colorAttr.getX(i2)) / 3,
          (colorAttr.getY(i0) + colorAttr.getY(i1) + colorAttr.getY(i2)) / 3,
          (colorAttr.getZ(i0) + colorAttr.getZ(i1) + colorAttr.getZ(i2)) / 3,
        );
        cr *= _colorTmp.r;
        cg *= _colorTmp.g;
        cb *= _colorTmp.b;
      }
      if (texData && uvAttr) {
        const u = (uvAttr.getX(i0) + uvAttr.getX(i1) + uvAttr.getX(i2)) / 3;
        const v = (uvAttr.getY(i0) + uvAttr.getY(i1) + uvAttr.getY(i2)) / 3;
        const [tr, tg, tb] = sampleTexRGB(texData, u, v, repX, repY);
        cr *= tr;
        cg *= tg;
        cb *= tb;
      }

      const er = isBasic ? cr * 1.45 : emitCol.r * emitInt;
      const eg = isBasic ? cg * 1.45 : emitCol.g * emitInt;
      const eb = isBasic ? cb * 1.45 : emitCol.b * emitInt;

      rawTris.push(
        _v0.x, _v0.y, _v0.z, rough,
        _edge1.x, _edge1.y, _edge1.z, metal,
        _edge2.x, _edge2.y, _edge2.z, trans,
        _n0.x, _n0.y, _n0.z, opacity,
        _n1.x, _n1.y, _n1.z, ior,
        _n2.x, _n2.y, _n2.z, 0,
        cr, cg, cb, 0,
        er, eg, eb, 0,
      );

      centroids.push(
        (_v0.x + _v1.x + _v2.x) / 3,
        (_v0.y + _v1.y + _v2.y) / 3,
        (_v0.z + _v1.z + _v2.z) / 3,
      );
      mins.push(
        Math.min(_v0.x, _v1.x, _v2.x) - 0.001,
        Math.min(_v0.y, _v1.y, _v2.y) - 0.001,
        Math.min(_v0.z, _v1.z, _v2.z) - 0.001,
      );
      maxs.push(
        Math.max(_v0.x, _v1.x, _v2.x) + 0.001,
        Math.max(_v0.y, _v1.y, _v2.y) + 0.001,
        Math.max(_v0.z, _v1.z, _v2.z) + 0.001,
      );
    }
  };

  built.scene.traverse((obj) => {
    if (!obj.visible) return;
    if ((obj as THREE.InstancedMesh).isInstancedMesh) {
      const inst = obj as THREE.InstancedMesh;
      const mat = Array.isArray(inst.material) ? inst.material[0] : inst.material;
      if (!mat) return;
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, _instanceMatrix);
        // Skip hidden off-world instances (y < -500 or scale 0)
        if (_instanceMatrix.elements[13] < -400) continue;
        const sx =
          _instanceMatrix.elements[0] * _instanceMatrix.elements[0] +
          _instanceMatrix.elements[1] * _instanceMatrix.elements[1] +
          _instanceMatrix.elements[2] * _instanceMatrix.elements[2];
        if (sx < 1e-6) continue;
        _worldMatrix.multiplyMatrices(inst.matrixWorld, _instanceMatrix);
        pushMeshTris(inst.geometry, mat, _worldMatrix);
      }
      return;
    }

    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!mat) return;
      pushMeshTris(mesh.geometry, mat, mesh.matrixWorld);
    }
  });

  const triCount = Math.floor(rawTris.length / 32);
  if (triCount === 0) {
    const emptyBuf = new ArrayBuffer(32);
    return {
      triCount: 0,
      nodeCount: 1,
      tris: new Float32Array(0),
      nodesBuffer: emptyBuf,
      nodesF32: new Float32Array(emptyBuf),
      nodesU32: new Uint32Array(emptyBuf),
    };
  }

  // Build Binary BVH (flat index array reordered in-place)
  const order = new Int32Array(triCount);
  for (let i = 0; i < triCount; i++) order[i] = i;

  const maxNodes = Math.max(2, triCount * 2);
  const nodesBuffer = new ArrayBuffer(maxNodes * 32);
  const nodesF32 = new Float32Array(nodesBuffer);
  const nodesU32 = new Uint32Array(nodesBuffer);
  let nodePtr = 0;

  const buildNode = (start: number, count: number): number => {
    const myIdx = nodePtr++;
    const fOff = myIdx * 8;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    let cMinX = Infinity;
    let cMinY = Infinity;
    let cMinZ = Infinity;
    let cMaxX = -Infinity;
    let cMaxY = -Infinity;
    let cMaxZ = -Infinity;

    for (let i = start; i < start + count; i++) {
      const t = order[i] * 3;
      if (mins[t] < minX) minX = mins[t];
      if (mins[t + 1] < minY) minY = mins[t + 1];
      if (mins[t + 2] < minZ) minZ = mins[t + 2];
      if (maxs[t] > maxX) maxX = maxs[t];
      if (maxs[t + 1] > maxY) maxY = maxs[t + 1];
      if (maxs[t + 2] > maxZ) maxZ = maxs[t + 2];

      const cx = centroids[t];
      const cy = centroids[t + 1];
      const cz = centroids[t + 2];
      if (cx < cMinX) cMinX = cx;
      if (cy < cMinY) cMinY = cy;
      if (cz < cMinZ) cMinZ = cz;
      if (cx > cMaxX) cMaxX = cx;
      if (cy > cMaxY) cMaxY = cy;
      if (cz > cMaxZ) cMaxZ = cz;
    }

    nodesF32[fOff + 0] = minX;
    nodesF32[fOff + 1] = minY;
    nodesF32[fOff + 2] = minZ;
    nodesF32[fOff + 4] = maxX;
    nodesF32[fOff + 5] = maxY;
    nodesF32[fOff + 6] = maxZ;

    if (count <= 4) {
      nodesU32[fOff + 3] = start;
      nodesU32[fOff + 7] = count;
      return myIdx;
    }

    const ex = cMaxX - cMinX;
    const ey = cMaxY - cMinY;
    const ez = cMaxZ - cMinZ;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const cMin = axis === 0 ? cMinX : axis === 1 ? cMinY : cMinZ;
    const cMax = axis === 0 ? cMaxX : axis === 1 ? cMaxY : cMaxZ;

    if (cMax - cMin < 1e-5) {
      nodesU32[fOff + 3] = start;
      nodesU32[fOff + 7] = count;
      return myIdx;
    }

    const splitPos = (cMin + cMax) * 0.5;
    let left = start;
    let right = start + count - 1;
    while (left <= right) {
      const c = centroids[order[left] * 3 + axis];
      if (c < splitPos) {
        left++;
      } else {
        const tmp = order[left];
        order[left] = order[right];
        order[right] = tmp;
        right--;
      }
    }

    let leftCount = left - start;
    if (leftCount === 0 || leftCount === count) {
      leftCount = count >> 1;
    }

    buildNode(start, leftCount); // always placed at myIdx + 1
    const rightIdx = buildNode(start + leftCount, count - leftCount);
    nodesU32[fOff + 3] = rightIdx;
    nodesU32[fOff + 7] = 0; // internal node
    return myIdx;
  };

  buildNode(0, triCount);

  // Reorder triangles sequentially by BVH leaf order for cache-coherent tracing!
  const tris = new Float32Array(triCount * 32);
  for (let i = 0; i < triCount; i++) {
    const srcOff = order[i] * 32;
    const dstOff = i * 32;
    for (let k = 0; k < 32; k++) {
      tris[dstOff + k] = rawTris[srcOff + k];
    }
  }

  return {
    triCount,
    nodeCount: nodePtr,
    tris,
    nodesBuffer: nodesBuffer.slice(0, nodePtr * 32),
    nodesF32: new Float32Array(nodesBuffer, 0, nodePtr * 8),
    nodesU32: new Uint32Array(nodesBuffer, 0, nodePtr * 8),
  };
}

// ---------- Edge-Aware Joint Bilateral Tile Denoiser ----------
function tonemapACES(x: number): number {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

function linearToSRGBByte(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255)));
}

function denoiseTileToImageData(
  w: number,
  h: number,
  colorBuf: Float32Array,
  normalBuf: Float32Array,
  albedoBuf: Float32Array,
): ImageData {
  const out = new ImageData(w, h);
  const dst = out.data;

  const radius = 2;
  const invSigmaS = -1 / (2 * 1.45 * 1.45);
  const invSigmaN = 6.0;
  const invSigmaA = -1 / (2 * 0.18 * 0.18);
  const invSigmaL = -1 / (2 * 0.42 * 0.42);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 3;
      const cr = colorBuf[idx];
      const cg = colorBuf[idx + 1];
      const cb = colorBuf[idx + 2];
      const cLum = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;

      const nx = normalBuf[idx];
      const ny = normalBuf[idx + 1];
      const nz = normalBuf[idx + 2];

      const ar = albedoBuf[idx];
      const ag = albedoBuf[idx + 1];
      const ab = albedoBuf[idx + 2];

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumW = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.min(w - 1, Math.max(0, x + dx));
          const nIdx = (sy * w + sx) * 3;

          const sr = colorBuf[nIdx];
          const sg = colorBuf[nIdx + 1];
          const sb = colorBuf[nIdx + 2];
          const sLum = sr * 0.2126 + sg * 0.7152 + sb * 0.0722;

          const ndot = Math.max(0, nx * normalBuf[nIdx] + ny * normalBuf[nIdx + 1] + nz * normalBuf[nIdx + 2]);
          const da =
            (ar - albedoBuf[nIdx]) * (ar - albedoBuf[nIdx]) +
            (ag - albedoBuf[nIdx + 1]) * (ag - albedoBuf[nIdx + 1]) +
            (ab - albedoBuf[nIdx + 2]) * (ab - albedoBuf[nIdx + 2]);
          const dl = (sLum - cLum) / (0.25 + cLum);

          const wSpatial = Math.exp((dx * dx + dy * dy) * invSigmaS);
          const wNormal = Math.pow(ndot, invSigmaN);
          const wAlbedo = Math.exp(da * invSigmaA);
          const wLuma = Math.exp(dl * dl * invSigmaL);
          const wt = wSpatial * wNormal * wAlbedo * wLuma;

          sumR += sr * wt;
          sumG += sg * wt;
          sumB += sb * wt;
          sumW += wt;
        }
      }

      const invW = sumW > 1e-6 ? 1 / sumW : 1;
      const lr = tonemapACES(sumR * invW * 1.08);
      const lg = tonemapACES(sumG * invW * 1.08);
      const lb = tonemapACES(sumB * invW * 1.08);

      const pIdx = (y * w + x) * 4;
      dst[pIdx] = linearToSRGBByte(lr);
      dst[pIdx + 1] = linearToSRGBByte(lg);
      dst[pIdx + 2] = linearToSRGBByte(lb);
      dst[pIdx + 3] = 255;
    }
  }
  return out;
}

// ---------- Priority 1: WebGPU Compute BVH Path Tracer ----------
const WGSL_PATH_TRACER = /* wgsl */ `
struct Tri {
  v0_rough: vec4<f32>,
  e1_metal: vec4<f32>,
  e2_trans: vec4<f32>,
  n0_opac:  vec4<f32>,
  n1_ior:   vec4<f32>,
  n2_pad:   vec4<f32>,
  col_pad:  vec4<f32>,
  emit_pad: vec4<f32>,
};

struct BvhNode {
  minX: f32, minY: f32, minZ: f32, data0: u32,
  maxX: f32, maxY: f32, maxZ: f32, data1: u32,
};

struct Params {
  camPos: vec4<f32>,
  camFwd: vec4<f32>,
  camRight: vec4<f32>,
  camUp: vec4<f32>,
  sunDir: vec4<f32>,
  skyColor: vec4<f32>,
  seaColor: vec4<f32>,
  imgW: u32,
  imgH: u32,
  tileX: u32,
  tileY: u32,
  tileW: u32,
  tileH: u32,
  spp: u32,
  maxBounces: u32,
  triCount: u32,
  isSpace: u32,
  frameSeed: u32,
  pad0: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> tris: array<Tri>;
@group(0) @binding(2) var<storage, read> nodes: array<BvhNode>;
@group(0) @binding(3) var<storage, read_write> outColor: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outNormal: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> outAlbedo: array<vec4<f32>>;

fn pcgHash(v: ptr<function, u32>) -> f32 {
  let state = (*v) * 747796405u + 2891336453u;
  *v = state;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return f32((word >> 22u) ^ word) * 2.3283064e-10;
}

fn hitAabb(minB: vec3<f32>, maxB: vec3<f32>, ro: vec3<f32>, invD: vec3<f32>, maxT: f32) -> f32 {
  let t0 = (minB - ro) * invD;
  let t1 = (maxB - ro) * invD;
  let tmin = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tmax = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  if (tmax >= max(tmin, 0.0) && tmin < maxT) {
    return tmin;
  }
  return 1e30;
}

struct HitInfo {
  hit: bool,
  t: f32,
  u: f32,
  v: f32,
  triIdx: u32,
};

fn traceRay(ro: vec3<f32>, rd: vec3<f32>, maxDist: f32, anyHit: bool) -> HitInfo {
  var res = HitInfo(false, maxDist, 0.0, 0.0, 0u);
  if (params.triCount == 0u) { return res; }
  let invD = vec3<f32>(
    select(1.0 / rd.x, 1e12, abs(rd.x) < 1e-8),
    select(1.0 / rd.y, 1e12, abs(rd.y) < 1e-8),
    select(1.0 / rd.z, 1e12, abs(rd.z) < 1e-8)
  );
  var stack: array<u32, 48>;
  var sp: i32 = 0;
  stack[0] = 0u;
  sp = 1;

  while (sp > 0) {
    sp -= 1;
    let nodeIdx = stack[sp];
    let n = nodes[nodeIdx];
    let distBox = hitAabb(vec3<f32>(n.minX, n.minY, n.minZ), vec3<f32>(n.maxX, n.maxY, n.maxZ), ro, invD, res.t);
    if (distBox >= res.t) { continue; }

    if (n.data1 > 0u) {
      let start = n.data0;
      let count = n.data1;
      for (var i = 0u; i < count; i += 1u) {
        let tri = tris[start + i];
        let v0 = tri.v0_rough.xyz;
        let e1 = tri.e1_metal.xyz;
        let e2 = tri.e2_trans.xyz;
        let pvec = cross(rd, e2);
        let det = dot(e1, pvec);
        if (abs(det) < 1e-7) { continue; }
        let invDet = 1.0 / det;
        let tvec = ro - v0;
        let u = dot(tvec, pvec) * invDet;
        if (u < 0.0 || u > 1.0) { continue; }
        let qvec = cross(tvec, e1);
        let v = dot(rd, qvec) * invDet;
        if (v < 0.0 || u + v > 1.0) { continue; }
        let t = dot(e2, qvec) * invDet;
        if (t > 0.002 && t < res.t) {
          res.hit = true;
          res.t = t;
          res.u = u;
          res.v = v;
          res.triIdx = start + i;
          if (anyHit) { return res; }
        }
      }
    } else {
      let leftIdx = nodeIdx + 1u;
      let rightIdx = n.data0;
      let ln = nodes[leftIdx];
      let rn = nodes[rightIdx];
      let dL = hitAabb(vec3<f32>(ln.minX, ln.minY, ln.minZ), vec3<f32>(ln.maxX, ln.maxY, ln.maxZ), ro, invD, res.t);
      let dR = hitAabb(vec3<f32>(rn.minX, rn.minY, rn.minZ), vec3<f32>(rn.maxX, rn.maxY, rn.maxZ), ro, invD, res.t);
      if (dL < dR) {
        if (dR < res.t && sp < 47) { stack[sp] = rightIdx; sp += 1; }
        if (dL < res.t && sp < 47) { stack[sp] = leftIdx; sp += 1; }
      } else {
        if (dL < res.t && sp < 47) { stack[sp] = leftIdx; sp += 1; }
        if (dR < res.t && sp < 47) { stack[sp] = rightIdx; sp += 1; }
      }
    }
  }
  return res;
}

fn evalSky(rd: vec3<f32>) -> vec3<f32> {
  let y = clamp(rd.y, -1.0, 1.0);
  if (params.isSpace != 0u) {
    let sunD = max(0.0, dot(rd, params.sunDir.xyz));
    let sunDisk = pow(sunD, 520.0) * 14.0 + pow(sunD, 24.0) * 0.45;
    let gridGlow = max(0.0, 1.0 - abs(y) * 2.5) * 0.08;
    return params.skyColor.rgb * 0.45 + vec3<f32>(0.08, 0.12, 0.25) * gridGlow + vec3<f32>(1.0, 0.92, 0.78) * sunDisk;
  }
  let horizon = mix(params.skyColor.rgb * 1.12, params.skyColor.rgb * 0.58 + vec3<f32>(0.10, 0.18, 0.36), pow(max(0.0, y), 0.55));
  let ground = params.seaColor.rgb * (0.45 + 0.35 * (1.0 - abs(y)));
  var col = select(ground, horizon, y >= 0.0);
  let sunCos = max(0.0, dot(rd, params.sunDir.xyz));
  col += vec3<f32>(1.0, 0.93, 0.78) * (pow(sunCos, 460.0) * 18.0 + pow(sunCos, 16.0) * 0.42);
  return col;
}

fn onbCosineSample(n: vec3<f32>, r1: f32, r2: f32) -> vec3<f32> {
  let phi = 6.2831853 * r1;
  let sinT = sqrt(r2);
  let cosT = sqrt(max(0.0, 1.0 - r2));
  let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), abs(n.y) < 0.99);
  let t = normalize(cross(up, n));
  let b = cross(n, t);
  return normalize(t * (cos(phi) * sinT) + b * (sin(phi) * sinT) + n * cosT);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.tileW || gid.y >= params.tileH) { return; }
  let px = params.tileX + gid.x;
  let py = params.tileY + gid.y;
  let outIdx = gid.y * params.tileW + gid.x;

  var rng = (px * 1973u) ^ (py * 9277u) ^ (params.frameSeed * 26699u) ^ 0x9e3779b9u;
  var accumColor = vec3<f32>(0.0);
  var accumNorm = vec3<f32>(0.0);
  var accumAlbedo = vec3<f32>(0.0);

  let aspectTanH = params.camUp.w;
  let aspectTanW = params.camRight.w;

  for (var s = 0u; s < params.spp; s += 1u) {
    let jx = pcgHash(&rng);
    let jy = pcgHash(&rng);
    let u = ((f32(px) + jx) / f32(params.imgW)) * 2.0 - 1.0;
    let v = 1.0 - ((f32(py) + jy) / f32(params.imgH)) * 2.0;

    var ro = params.camPos.xyz;
    var rd = normalize(params.camFwd.xyz + params.camRight.xyz * (u * aspectTanW) + params.camUp.xyz * (v * aspectTanH));
    var throughput = vec3<f32>(1.0);
    var sampleCol = vec3<f32>(0.0);

    for (var b = 0u; b <= params.maxBounces; b += 1u) {
      let h = traceRay(ro, rd, 1e6, false);
      if (!h.hit) {
        sampleCol += throughput * evalSky(rd);
        if (b == 0u) {
          accumNorm += vec3<f32>(0.0, 1.0, 0.0);
          accumAlbedo += vec3<f32>(1.0);
        }
        break;
      }

      let tri = tris[h.triIdx];
      let w0 = 1.0 - h.u - h.v;
      var n = normalize(tri.n0_opac.xyz * w0 + tri.n1_ior.xyz * h.u + tri.n2_pad.xyz * h.v);
      let frontFace = dot(rd, n) < 0.0;
      if (!frontFace) { n = -n; }

      let hitP = ro + rd * h.t;
      let albedo = tri.col_pad.rgb;
      let emit = tri.emit_pad.rgb;
      let rough = tri.v0_rough.w;
      let metal = tri.e1_metal.w;
      let trans = tri.e2_trans.w;
      let opac = tri.n0_opac.w;

      if (b == 0u) {
        accumNorm += n;
        accumAlbedo += albedo;
      }

      sampleCol += throughput * emit;

      // Glass / Transparent pass-through or Fresnel bounce
      if (trans > 0.08 || opac < 0.92) {
        let f0 = 0.04;
        let cosI = clamp(-dot(rd, n), 0.0, 1.0);
        let fresnel = f0 + (1.0 - f0) * pow(1.0 - cosI, 5.0);
        if (pcgHash(&rng) < fresnel * 0.85) {
          rd = normalize(reflect(rd, n) + onbCosineSample(n, pcgHash(&rng), pcgHash(&rng)) * rough * 0.15);
          ro = hitP + n * 0.004;
        } else {
          let ior = tri.n1_ior.w;
          let eta = select(ior, 1.0 / ior, frontFace);
          let refr = refract(rd, n, eta);
          rd = select(reflect(rd, n), normalize(refr), length(refr) > 0.001);
          ro = hitP - n * 0.004;
          throughput *= mix(vec3<f32>(1.0), albedo * 0.94 + vec3<f32>(0.06), 0.35);
        }
        continue;
      }

      // Direct Sun Lighting + Soft Shadow Ray (Area Light cone jitter)
      let j1 = (pcgHash(&rng) - 0.5) * 0.032;
      let j2 = (pcgHash(&rng) - 0.5) * 0.032;
      let j3 = (pcgHash(&rng) - 0.5) * 0.032;
      let shadowDir = normalize(params.sunDir.xyz + vec3<f32>(j1, j2, j3));
      let nDotL = dot(n, shadowDir);
      if (nDotL > 0.0) {
        let sh = traceRay(hitP + n * 0.006, shadowDir, 500.0, true);
        if (!sh.hit) {
          let viewDir = -rd;
          let halfVec = normalize(shadowDir + viewDir);
          let nDotH = max(0.0, dot(n, halfVec));
          let a2 = rough * rough * rough * rough;
          let denom = nDotH * nDotH * (a2 - 1.0) + 1.0;
          let D = a2 / max(0.001, 3.1415926 * denom * denom);
          let F0 = mix(vec3<f32>(0.04), albedo, metal);
          let F = F0 + (vec3<f32>(1.0) - F0) * pow(1.0 - max(0.0, dot(halfVec, viewDir)), 5.0);
          let spec = min(vec3<f32>(6.0), F * D * 0.25);
          let diff = albedo * ((1.0 - metal) / 3.1415926);
          let sunRadiance = vec3<f32>(2.85, 2.66, 2.38);
          sampleCol += throughput * (diff + spec) * sunRadiance * nDotL;
        }
      }

      // Next Bounce (Metallic / Specular Reflection vs Cosine Diffuse GI)
      let f0Scalar = mix(0.04, 0.92, metal);
      let cosV = clamp(-dot(rd, n), 0.0, 1.0);
      let specProb = clamp(f0Scalar + (1.0 - f0Scalar) * pow(1.0 - cosV, 4.0) * (1.0 - rough * 0.8), 0.05, 0.95);

      if (pcgHash(&rng) < specProb) {
        let refl = reflect(rd, n);
        let jitter = onbCosineSample(n, pcgHash(&rng), pcgHash(&rng));
        rd = normalize(mix(refl, jitter, rough * rough));
        if (dot(rd, n) <= 0.0) { break; }
        let specTint = mix(vec3<f32>(1.0), albedo, metal);
        throughput *= specTint * min(1.0, 0.92 / specProb) * (1.0 - rough * 0.25);
      } else {
        rd = onbCosineSample(n, pcgHash(&rng), pcgHash(&rng));
        throughput *= albedo * (1.0 - metal) / max(0.15, 1.0 - specProb);
      }

      ro = hitP + n * 0.005;
      // Russian roulette termination on deeper bounces
      if (b >= 2u) {
        let p = clamp(max(throughput.r, max(throughput.g, throughput.b)), 0.1, 0.95);
        if (pcgHash(&rng) > p) { break; }
        throughput /= p;
      }
    }

    // Clamp extreme fireflies per sample
    accumColor += min(sampleCol, vec3<f32>(10.0));
  }

  let invSpp = 1.0 / f32(params.spp);
  outColor[outIdx] = vec4<f32>(accumColor * invSpp, 1.0);
  outNormal[outIdx] = vec4<f32>(normalize(accumNorm * invSpp + vec3<f32>(0.0, 0.0001, 0.0)), 1.0);
  outAlbedo[outIdx] = vec4<f32>(accumAlbedo * invSpp, 1.0);
}
`;

interface WebGpuBufferLike {
  destroy(): void;
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
}
interface WebGpuDeviceLike {
  createShaderModule(desc: { code: string }): unknown;
  createComputePipeline(desc: unknown): { getBindGroupLayout(idx: number): unknown };
  createBuffer(desc: { size: number; usage: number }): WebGpuBufferLike;
  createBindGroup(desc: unknown): unknown;
  createCommandEncoder(): {
    beginComputePass(): {
      setPipeline(p: unknown): void;
      setBindGroup(i: number, bg: unknown): void;
      dispatchWorkgroups(x: number, y?: number, z?: number): void;
      end(): void;
    };
    copyBufferToBuffer(src: WebGpuBufferLike, srcOff: number, dst: WebGpuBufferLike, dstOff: number, len: number): void;
    finish(): unknown;
  };
  queue: {
    writeBuffer(buf: WebGpuBufferLike, offset: number, data: ArrayBufferView | ArrayBuffer): void;
    submit(cmds: unknown[]): void;
  };
}
interface WebGpuAdapterLike {
  limits: { maxStorageBufferBindingSize: number };
  requestDevice(desc?: { requiredLimits?: Record<string, number> }): Promise<WebGpuDeviceLike | null>;
}
interface WebGpuNavigatorLike {
  requestAdapter(opts?: { powerPreference?: string }): Promise<WebGpuAdapterLike | null>;
}

async function renderWithWebGPU(
  extracted: ExtractedSceneData,
  built: BuiltPhotoScene,
  opts: RaytraceOptions,
): Promise<boolean> {
  const g = globalThis as unknown as {
    GPUBufferUsage?: { MAP_READ: number; COPY_SRC: number; COPY_DST: number; UNIFORM: number; STORAGE: number };
    GPUMapMode?: { READ: number };
  };
  const BUF = g.GPUBufferUsage ?? { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128 };
  const MAP_READ = g.GPUMapMode?.READ ?? 1;

  const gpu = (navigator as Navigator & { gpu?: WebGpuNavigatorLike }).gpu;
  if (!gpu) return false;

  let adapter: WebGpuAdapterLike | null = null;
  let device: WebGpuDeviceLike | null = null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return false;
    const reqLimits: Record<string, number> = {};
    if (adapter.limits.maxStorageBufferBindingSize >= extracted.tris.byteLength) {
      reqLimits.maxStorageBufferBindingSize = Math.min(
        adapter.limits.maxStorageBufferBindingSize,
        Math.max(128 * 1024 * 1024, extracted.tris.byteLength + 1024 * 1024),
      );
    } else {
      return false;
    }
    device = await adapter.requestDevice({ requiredLimits: reqLimits });
  } catch {
    return false;
  }
  if (!device) return false;

  try {
    const shaderModule = device.createShaderModule({ code: WGSL_PATH_TRACER });
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' },
    });

    const triBuf = device.createBuffer({
      size: Math.max(128, extracted.tris.byteLength),
      usage: BUF.STORAGE | BUF.COPY_DST,
    });
    if (extracted.tris.byteLength > 0) {
      device.queue.writeBuffer(triBuf, 0, extracted.tris);
    }

    const nodeBuf = device.createBuffer({
      size: Math.max(32, extracted.nodesBuffer.byteLength),
      usage: BUF.STORAGE | BUF.COPY_DST,
    });
    device.queue.writeBuffer(nodeBuf, 0, extracted.nodesBuffer);

    const tileSize = 96;
    const maxTilePixels = tileSize * tileSize;

    const colorBufGpu = device.createBuffer({
      size: maxTilePixels * 16,
      usage: BUF.STORAGE | BUF.COPY_SRC,
    });
    const normalBufGpu = device.createBuffer({
      size: maxTilePixels * 16,
      usage: BUF.STORAGE | BUF.COPY_SRC,
    });
    const albedoBufGpu = device.createBuffer({
      size: maxTilePixels * 16,
      usage: BUF.STORAGE | BUF.COPY_SRC,
    });

    const readColor = device.createBuffer({
      size: maxTilePixels * 16,
      usage: BUF.MAP_READ | BUF.COPY_DST,
    });
    const readNormal = device.createBuffer({
      size: maxTilePixels * 16,
      usage: BUF.MAP_READ | BUF.COPY_DST,
    });
    const readAlbedo = device.createBuffer({
      size: maxTilePixels * 16,
      usage: BUF.MAP_READ | BUF.COPY_DST,
    });

    const paramBuf = device.createBuffer({
      size: 160,
      usage: BUF.UNIFORM | BUF.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramBuf } },
        { binding: 1, resource: { buffer: triBuf } },
        { binding: 2, resource: { buffer: nodeBuf } },
        { binding: 3, resource: { buffer: colorBufGpu } },
        { binding: 4, resource: { buffer: normalBufGpu } },
        { binding: 5, resource: { buffer: albedoBufGpu } },
      ],
    });

    opts.camera.updateMatrixWorld();
    const camPos = opts.camera.position.clone();
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(opts.camera.quaternion).normalize();
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(opts.camera.quaternion).normalize();
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(opts.camera.quaternion).normalize();
    const tanH = Math.tan(THREE.MathUtils.degToRad(opts.camera.fov * 0.5));
    const tanW = tanH * (opts.width / opts.height);

    const skyCol = new THREE.Color(built.skyHex);
    const seaCol = new THREE.Color(built.seaHex);

    const pArr = new ArrayBuffer(160);
    const pF32 = new Float32Array(pArr);
    const pU32 = new Uint32Array(pArr);
    pF32.set([camPos.x, camPos.y, camPos.z, 0], 0);
    pF32.set([camFwd.x, camFwd.y, camFwd.z, 0], 4);
    pF32.set([camRight.x, camRight.y, camRight.z, tanW], 8);
    pF32.set([camUp.x, camUp.y, camUp.z, tanH], 12);
    pF32.set([built.keyLightDir.x, built.keyLightDir.y, built.keyLightDir.z, 0], 16);
    pF32.set([skyCol.r, skyCol.g, skyCol.b, 1], 20);
    pF32.set([seaCol.r, seaCol.g, seaCol.b, 1], 24);
    pU32[28] = opts.width;
    pU32[29] = opts.height;
    pU32[34] = opts.samplesPerPixel;
    pU32[35] = opts.maxBounces;
    pU32[36] = extracted.triCount;
    pU32[37] = built.isSpace ? 1 : 0;

    const cols = Math.ceil(opts.width / tileSize);
    const rows = Math.ceil(opts.height / tileSize);
    const totalTiles = cols * rows;
    let doneTiles = 0;

    const tileC = new Float32Array(maxTilePixels * 3);
    const tileN = new Float32Array(maxTilePixels * 3);
    const tileA = new Float32Array(maxTilePixels * 3);

    opts.onStatus?.('WebGPU BVH Path Tracing...', 'WebGPU');

    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        if (opts.signal?.aborted) {
          triBuf.destroy();
          nodeBuf.destroy();
          colorBufGpu.destroy();
          normalBufGpu.destroy();
          albedoBufGpu.destroy();
          readColor.destroy();
          readNormal.destroy();
          readAlbedo.destroy();
          paramBuf.destroy();
          return true;
        }

        const x0 = tx * tileSize;
        const y0 = ty * tileSize;
        const tw = Math.min(tileSize, opts.width - x0);
        const th = Math.min(tileSize, opts.height - y0);

        pU32[30] = x0;
        pU32[31] = y0;
        pU32[32] = tw;
        pU32[33] = th;
        pU32[38] = (doneTiles + 1) * 7919;
        device.queue.writeBuffer(paramBuf, 0, pArr);

        const byteLen = tw * th * 16;
        const enc = device.createCommandEncoder();
        const pass = enc.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(tw / 8), Math.ceil(th / 8), 1);
        pass.end();
        enc.copyBufferToBuffer(colorBufGpu, 0, readColor, 0, byteLen);
        enc.copyBufferToBuffer(normalBufGpu, 0, readNormal, 0, byteLen);
        enc.copyBufferToBuffer(albedoBufGpu, 0, readAlbedo, 0, byteLen);
        device.queue.submit([enc.finish()]);

        await Promise.all([
          readColor.mapAsync(MAP_READ, 0, byteLen),
          readNormal.mapAsync(MAP_READ, 0, byteLen),
          readAlbedo.mapAsync(MAP_READ, 0, byteLen),
        ]);

        const rawC = new Float32Array(readColor.getMappedRange(0, byteLen));
        const rawN = new Float32Array(readNormal.getMappedRange(0, byteLen));
        const rawA = new Float32Array(readAlbedo.getMappedRange(0, byteLen));

        const pxCount = tw * th;
        for (let i = 0; i < pxCount; i++) {
          const i4 = i * 4;
          const i3 = i * 3;
          tileC[i3] = rawC[i4];
          tileC[i3 + 1] = rawC[i4 + 1];
          tileC[i3 + 2] = rawC[i4 + 2];
          tileN[i3] = rawN[i4];
          tileN[i3 + 1] = rawN[i4 + 1];
          tileN[i3 + 2] = rawN[i4 + 2];
          tileA[i3] = rawA[i4];
          tileA[i3 + 1] = rawA[i4 + 1];
          tileA[i3 + 2] = rawA[i4 + 2];
        }

        readColor.unmap();
        readNormal.unmap();
        readAlbedo.unmap();

        const imgData = denoiseTileToImageData(tw, th, tileC, tileN, tileA);
        doneTiles++;
        opts.onTileComplete?.({
          x: x0,
          y: y0,
          w: tw,
          h: th,
          imageData: imgData,
          doneTiles,
          totalTiles,
          backend: 'WebGPU',
          phase: 'denoising',
        });

        // Yield once every few tiles so React progress & abort remain silky
        if (doneTiles % 3 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }

    triBuf.destroy();
    nodeBuf.destroy();
    colorBufGpu.destroy();
    normalBufGpu.destroy();
    albedoBufGpu.destroy();
    readColor.destroy();
    readNormal.destroy();
    readAlbedo.destroy();
    paramBuf.destroy();
    return true;
  } catch {
    return false;
  }
}

// ---------- Priority 2: Async CPU BVH Path Tracer Fallback ----------
function hitAabbCpu(
  nodesF32: Float32Array,
  fOff: number,
  rox: number,
  roy: number,
  roz: number,
  invDx: number,
  invDy: number,
  invDz: number,
  maxT: number,
): number {
  const t0x = (nodesF32[fOff] - rox) * invDx;
  const t1x = (nodesF32[fOff + 4] - rox) * invDx;
  const t0y = (nodesF32[fOff + 1] - roy) * invDy;
  const t1y = (nodesF32[fOff + 5] - roy) * invDy;
  const t0z = (nodesF32[fOff + 2] - roz) * invDz;
  const t1z = (nodesF32[fOff + 6] - roz) * invDz;

  const tmin = Math.max(Math.min(t0x, t1x), Math.min(t0y, t1y), Math.min(t0z, t1z));
  const tmax = Math.min(Math.max(t0x, t1x), Math.max(t0y, t1y), Math.max(t0z, t1z));
  return tmax >= Math.max(tmin, 0) && tmin < maxT ? tmin : 1e30;
}

const _cpuStack = new Int32Array(64);
const _cpuHit = { hit: false, t: 0, u: 0, v: 0, triIdx: 0 };

function traceRayCpu(
  extracted: ExtractedSceneData,
  rox: number,
  roy: number,
  roz: number,
  rdx: number,
  rdy: number,
  rdz: number,
  maxDist: number,
  anyHit: boolean,
): typeof _cpuHit {
  _cpuHit.hit = false;
  _cpuHit.t = maxDist;
  if (extracted.triCount === 0) return _cpuHit;

  const invDx = Math.abs(rdx) < 1e-8 ? 1e12 : 1 / rdx;
  const invDy = Math.abs(rdy) < 1e-8 ? 1e12 : 1 / rdy;
  const invDz = Math.abs(rdz) < 1e-8 ? 1e12 : 1 / rdz;

  const { nodesF32, nodesU32, tris } = extracted;
  let sp = 1;
  _cpuStack[0] = 0;

  while (sp > 0) {
    const nodeIdx = _cpuStack[--sp];
    const fOff = nodeIdx * 8;
    const boxT = hitAabbCpu(nodesF32, fOff, rox, roy, roz, invDx, invDy, invDz, _cpuHit.t);
    if (boxT >= _cpuHit.t) continue;

    const count = nodesU32[fOff + 7];
    if (count > 0) {
      const start = nodesU32[fOff + 3];
      for (let i = 0; i < count; i++) {
        const ti = start + i;
        const off = ti * 32;
        const e1x = tris[off + 4];
        const e1y = tris[off + 5];
        const e1z = tris[off + 6];
        const e2x = tris[off + 8];
        const e2y = tris[off + 9];
        const e2z = tris[off + 10];

        const px = rdy * e2z - rdz * e2y;
        const py = rdz * e2x - rdx * e2z;
        const pz = rdx * e2y - rdy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-7) continue;

        const invDet = 1 / det;
        const tvecX = rox - tris[off];
        const tvecY = roy - tris[off + 1];
        const tvecZ = roz - tris[off + 2];
        const u = (tvecX * px + tvecY * py + tvecZ * pz) * invDet;
        if (u < 0 || u > 1) continue;

        const qx = tvecY * e1z - tvecZ * e1y;
        const qy = tvecZ * e1x - tvecX * e1z;
        const qz = tvecX * e1y - tvecY * e1x;
        const v = (rdx * qx + rdy * qy + rdz * qz) * invDet;
        if (v < 0 || u + v > 1) continue;

        const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (t > 0.002 && t < _cpuHit.t) {
          _cpuHit.hit = true;
          _cpuHit.t = t;
          _cpuHit.u = u;
          _cpuHit.v = v;
          _cpuHit.triIdx = ti;
          if (anyHit) return _cpuHit;
        }
      }
    } else {
      const leftIdx = nodeIdx + 1;
      const rightIdx = nodesU32[fOff + 3];
      const dL = hitAabbCpu(nodesF32, leftIdx * 8, rox, roy, roz, invDx, invDy, invDz, _cpuHit.t);
      const dR = hitAabbCpu(nodesF32, rightIdx * 8, rox, roy, roz, invDx, invDy, invDz, _cpuHit.t);
      if (dL < dR) {
        if (dR < _cpuHit.t && sp < 63) _cpuStack[sp++] = rightIdx;
        if (dL < _cpuHit.t && sp < 63) _cpuStack[sp++] = leftIdx;
      } else {
        if (dL < _cpuHit.t && sp < 63) _cpuStack[sp++] = leftIdx;
        if (dR < _cpuHit.t && sp < 63) _cpuStack[sp++] = rightIdx;
      }
    }
  }
  return _cpuHit;
}

async function renderWithCPU(
  extracted: ExtractedSceneData,
  built: BuiltPhotoScene,
  opts: RaytraceOptions,
): Promise<boolean> {
  opts.camera.updateMatrixWorld();
  const camPos = opts.camera.position;
  const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(opts.camera.quaternion).normalize();
  const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(opts.camera.quaternion).normalize();
  const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(opts.camera.quaternion).normalize();
  const tanH = Math.tan(THREE.MathUtils.degToRad(opts.camera.fov * 0.5));
  const tanW = tanH * (opts.width / opts.height);

  const sunX = built.keyLightDir.x;
  const sunY = built.keyLightDir.y;
  const sunZ = built.keyLightDir.z;
  const skyCol = new THREE.Color(built.skyHex);
  const seaCol = new THREE.Color(built.seaHex);

  const evalSky = (dx: number, dy: number, dz: number): [number, number, number] => {
    const y = Math.max(-1, Math.min(1, dy));
    const sunCos = Math.max(0, dx * sunX + dy * sunY + dz * sunZ);
    const sunDisc = Math.pow(sunCos, 460) * 18 + Math.pow(sunCos, 16) * 0.42;
    if (built.isSpace) {
      const gridGlow = Math.max(0, 1 - Math.abs(y) * 2.5) * 0.08;
      return [
        skyCol.r * 0.45 + 0.08 * gridGlow + sunDisc,
        skyCol.g * 0.45 + 0.12 * gridGlow + 0.92 * sunDisc,
        skyCol.b * 0.45 + 0.25 * gridGlow + 0.78 * sunDisc,
      ];
    }
    if (y >= 0) {
      const f = Math.pow(y, 0.55);
      const r = skyCol.r * 1.12 * (1 - f) + (skyCol.r * 0.58 + 0.10) * f + sunDisc;
      const g = skyCol.g * 1.12 * (1 - f) + (skyCol.g * 0.58 + 0.18) * f + 0.93 * sunDisc;
      const b = skyCol.b * 1.12 * (1 - f) + (skyCol.b * 0.58 + 0.36) * f + 0.78 * sunDisc;
      return [r, g, b];
    }
    const gf = 0.45 + 0.35 * (1 - Math.abs(y));
    return [seaCol.r * gf + sunDisc, seaCol.g * gf + 0.93 * sunDisc, seaCol.b * gf + 0.78 * sunDisc];
  };

  let rngSeed = 0x1337beef;
  const rand = (): number => {
    rngSeed = (Math.imul(rngSeed ^ (rngSeed >>> 15), 0x85ebca6b) + 0xc2b2ae35) >>> 0;
    return rngSeed / 4294967296;
  };

  const tileSize = 64;
  const cols = Math.ceil(opts.width / tileSize);
  const rows = Math.ceil(opts.height / tileSize);
  const totalTiles = cols * rows;
  let doneTiles = 0;

  const tileC = new Float32Array(tileSize * tileSize * 3);
  const tileN = new Float32Array(tileSize * tileSize * 3);
  const tileA = new Float32Array(tileSize * tileSize * 3);
  const tris = extracted.tris;
  const invSpp = 1 / opts.samplesPerPixel;

  opts.onStatus?.('CPU BVH Path Tracing (WebGPU unavailable)...', 'CPU');

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (opts.signal?.aborted) return false;

      const x0 = tx * tileSize;
      const y0 = ty * tileSize;
      const tw = Math.min(tileSize, opts.width - x0);
      const th = Math.min(tileSize, opts.height - y0);

      for (let ly = 0; ly < th; ly++) {
        const py = y0 + ly;
        for (let lx = 0; lx < tw; lx++) {
          const px = x0 + lx;
          rngSeed = ((px * 1973) ^ (py * 9277) ^ 0x9e3779b9) >>> 0;

          let accR = 0;
          let accG = 0;
          let accB = 0;
          let normX = 0;
          let normY = 0;
          let normZ = 0;
          let albR = 0;
          let albG = 0;
          let albB = 0;

          for (let s = 0; s < opts.samplesPerPixel; s++) {
            const u = ((px + rand()) / opts.width) * 2 - 1;
            const v = 1 - ((py + rand()) / opts.height) * 2;

            let rox = camPos.x;
            let roy = camPos.y;
            let roz = camPos.z;
            let rdx = camFwd.x + camRight.x * u * tanW + camUp.x * v * tanH;
            let rdy = camFwd.y + camRight.y * u * tanW + camUp.y * v * tanH;
            let rdz = camFwd.z + camRight.z * u * tanW + camUp.z * v * tanH;
            const rLen = Math.hypot(rdx, rdy, rdz) || 1;
            rdx /= rLen;
            rdy /= rLen;
            rdz /= rLen;

            let thR = 1;
            let thG = 1;
            let thB = 1;
            let smpR = 0;
            let smpG = 0;
            let smpB = 0;

            for (let b = 0; b <= opts.maxBounces; b++) {
              const hit = traceRayCpu(extracted, rox, roy, roz, rdx, rdy, rdz, 1e6, false);
              if (!hit.hit) {
                const [sr, sg, sb] = evalSky(rdx, rdy, rdz);
                smpR += thR * sr;
                smpG += thG * sg;
                smpB += thB * sb;
                if (b === 0) {
                  normY += 1;
                  albR += 1;
                  albG += 1;
                  albB += 1;
                }
                break;
              }

              const off = hit.triIdx * 32;
              const w0 = 1 - hit.u - hit.v;
              let nx = tris[off + 12] * w0 + tris[off + 16] * hit.u + tris[off + 20] * hit.v;
              let ny = tris[off + 13] * w0 + tris[off + 17] * hit.u + tris[off + 21] * hit.v;
              let nz = tris[off + 14] * w0 + tris[off + 18] * hit.u + tris[off + 22] * hit.v;
              const nLen = Math.hypot(nx, ny, nz) || 1;
              nx /= nLen;
              ny /= nLen;
              nz /= nLen;
              if (rdx * nx + rdy * ny + rdz * nz > 0) {
                nx = -nx;
                ny = -ny;
                nz = -nz;
              }

              const hx = rox + rdx * hit.t;
              const hy = roy + rdy * hit.t;
              const hz = roz + rdz * hit.t;

              const ar = tris[off + 24];
              const ag = tris[off + 25];
              const ab = tris[off + 26];
              const er = tris[off + 28];
              const eg = tris[off + 29];
              const eb = tris[off + 30];
              const rough = tris[off + 3];
              const metal = tris[off + 7];
              const trans = tris[off + 11];
              const opac = tris[off + 15];

              if (b === 0) {
                normX += nx;
                normY += ny;
                normZ += nz;
                albR += ar;
                albG += ag;
                albB += ab;
              }

              smpR += thR * er;
              smpG += thG * eg;
              smpB += thB * eb;

              if (trans > 0.08 || opac < 0.92) {
                const cosI = Math.max(0, -(rdx * nx + rdy * ny + rdz * nz));
                const fresnel = 0.04 + 0.96 * Math.pow(1 - cosI, 5);
                if (rand() < fresnel * 0.85) {
                  const d2 = 2 * (rdx * nx + rdy * ny + rdz * nz);
                  rdx -= d2 * nx;
                  rdy -= d2 * ny;
                  rdz -= d2 * nz;
                  rox = hx + nx * 0.004;
                  roy = hy + ny * 0.004;
                  roz = hz + nz * 0.004;
                } else {
                  rox = hx - nx * 0.004;
                  roy = hy - ny * 0.004;
                  roz = hz - nz * 0.004;
                  thR *= 0.65 + ar * 0.33;
                  thG *= 0.65 + ag * 0.33;
                  thB *= 0.65 + ab * 0.33;
                }
                continue;
              }

              // Direct soft sun shadow ray
              let sx = sunX + (rand() - 0.5) * 0.032;
              let sy = sunY + (rand() - 0.5) * 0.032;
              let sz = sunZ + (rand() - 0.5) * 0.032;
              const sLen = Math.hypot(sx, sy, sz) || 1;
              sx /= sLen;
              sy /= sLen;
              sz /= sLen;
              const nDotL = nx * sx + ny * sy + nz * sz;
              if (nDotL > 0) {
                const sh = traceRayCpu(
                  extracted,
                  hx + nx * 0.006,
                  hy + ny * 0.006,
                  hz + nz * 0.006,
                  sx,
                  sy,
                  sz,
                  500,
                  true,
                );
                if (!sh.hit) {
                  let hvx = sx - rdx;
                  let hvy = sy - rdy;
                  let hvz = sz - rdz;
                  const hvLen = Math.hypot(hvx, hvy, hvz) || 1;
                  hvx /= hvLen;
                  hvy /= hvLen;
                  hvz /= hvLen;
                  const nDotH = Math.max(0, nx * hvx + ny * hvy + nz * hvz);
                  const a2 = rough * rough * rough * rough;
                  const denom = nDotH * nDotH * (a2 - 1) + 1;
                  const D = a2 / Math.max(0.001, Math.PI * denom * denom);
                  const hvDotV = Math.max(0, hvx * -rdx + hvy * -rdy + hvz * -rdz);
                  const fPow = Math.pow(1 - hvDotV, 5);
                  const f0R = 0.04 * (1 - metal) + ar * metal;
                  const f0G = 0.04 * (1 - metal) + ag * metal;
                  const f0B = 0.04 * (1 - metal) + ab * metal;
                  const spR = Math.min(6, (f0R + (1 - f0R) * fPow) * D * 0.25);
                  const spG = Math.min(6, (f0G + (1 - f0G) * fPow) * D * 0.25);
                  const spB = Math.min(6, (f0B + (1 - f0B) * fPow) * D * 0.25);
                  const dFactor = (1 - metal) / Math.PI;
                  smpR += thR * (ar * dFactor + spR) * 2.85 * nDotL;
                  smpG += thG * (ag * dFactor + spG) * 2.66 * nDotL;
                  smpB += thB * (ab * dFactor + spB) * 2.38 * nDotL;
                }
              }

              // Cosine hemisphere GI or Metallic specular bounce
              const phi = Math.PI * 2 * rand();
              const r2 = rand();
              const sinT = Math.sqrt(r2);
              const cosT = Math.sqrt(Math.max(0, 1 - r2));
              const upX = Math.abs(ny) < 0.99 ? 0 : 1;
              const upY = Math.abs(ny) < 0.99 ? 1 : 0;
              let txV = upY * nz;
              let tyV = -upX * nz;
              let tzV = upX * ny - upY * nx;
              const tLen = Math.hypot(txV, tyV, tzV) || 1;
              txV /= tLen;
              tyV /= tLen;
              tzV /= tLen;
              const bxV = ny * tzV - nz * tyV;
              const byV = nz * txV - nx * tzV;
              const bzV = nx * tyV - ny * txV;
              const cx = txV * Math.cos(phi) * sinT + bxV * Math.sin(phi) * sinT + nx * cosT;
              const cy = tyV * Math.cos(phi) * sinT + byV * Math.sin(phi) * sinT + ny * cosT;
              const cz = tzV * Math.cos(phi) * sinT + bzV * Math.sin(phi) * sinT + nz * cosT;

              const cosV = Math.max(0, -(rdx * nx + rdy * ny + rdz * nz));
              const f0S = 0.04 * (1 - metal) + 0.92 * metal;
              const specProb = Math.min(0.95, Math.max(0.05, f0S + (1 - f0S) * Math.pow(1 - cosV, 4) * (1 - rough * 0.8)));

              if (rand() < specProb) {
                const d2 = 2 * (rdx * nx + rdy * ny + rdz * nz);
                const rfx = rdx - d2 * nx;
                const rfy = rdy - d2 * ny;
                const rfz = rdz - d2 * nz;
                const rg2 = rough * rough;
                rdx = rfx * (1 - rg2) + cx * rg2;
                rdy = rfy * (1 - rg2) + cy * rg2;
                rdz = rfz * (1 - rg2) + cz * rg2;
                const rl = Math.hypot(rdx, rdy, rdz) || 1;
                rdx /= rl;
                rdy /= rl;
                rdz /= rl;
                if (rdx * nx + rdy * ny + rdz * nz <= 0) break;
                const sGain = Math.min(1, 0.92 / specProb) * (1 - rough * 0.25);
                thR *= (1 - metal + ar * metal) * sGain;
                thG *= (1 - metal + ag * metal) * sGain;
                thB *= (1 - metal + ab * metal) * sGain;
              } else {
                rdx = cx;
                rdy = cy;
                rdz = cz;
                const dGain = (1 - metal) / Math.max(0.15, 1 - specProb);
                thR *= ar * dGain;
                thG *= ag * dGain;
                thB *= ab * dGain;
              }
              rox = hx + nx * 0.005;
              roy = hy + ny * 0.005;
              roz = hz + nz * 0.005;
            }

            accR += Math.min(10, smpR);
            accG += Math.min(10, smpG);
            accB += Math.min(10, smpB);
          }

          const p3 = (ly * tw + lx) * 3;
          tileC[p3] = accR * invSpp;
          tileC[p3 + 1] = accG * invSpp;
          tileC[p3 + 2] = accB * invSpp;
          const nMag = Math.hypot(normX, normY, normZ) || 1;
          tileN[p3] = normX / nMag;
          tileN[p3 + 1] = normY / nMag;
          tileN[p3 + 2] = normZ / nMag;
          tileA[p3] = albR * invSpp;
          tileA[p3 + 1] = albG * invSpp;
          tileA[p3 + 2] = albB * invSpp;
        }
      }

      const imgData = denoiseTileToImageData(tw, th, tileC, tileN, tileA);
      doneTiles++;
      opts.onTileComplete?.({
        x: x0,
        y: y0,
        w: tw,
        h: th,
        imageData: imgData,
        doneTiles,
        totalTiles,
        backend: 'CPU',
        phase: 'denoising',
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return true;
}

export async function runPhotoRaytrace(
  built: BuiltPhotoScene,
  opts: RaytraceOptions,
): Promise<RaytraceResult> {
  const start = performance.now();
  opts.onStatus?.('Building BVH acceleration structure...', 'WebGPU');
  await new Promise((r) => setTimeout(r, 12));
  const extracted = extractBvhScene(built);

  let backend: RaytracerBackend = 'CPU';
  let completed = false;
  if (opts.preferWebGPU !== false) {
    const ok = await renderWithWebGPU(extracted, built, opts);
    if (ok) {
      backend = 'WebGPU';
      completed = true;
    }
  }

  if (!completed && !opts.signal?.aborted) {
    backend = 'CPU';
    await renderWithCPU(extracted, built, opts);
  }

  return {
    backend,
    durationMs: performance.now() - start,
    triCount: extracted.triCount,
    cancelled: Boolean(opts.signal?.aborted),
  };
}

export function detectNewestWebmCodec(): { mimeType: string; label: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', label: 'PNG Fallback' };
  }
  const candidates: Array<{ mime: string; label: string }> = [
    { mime: 'video/webm;codecs=av01.0.08M.08', label: 'WebM AV1' },
    { mime: 'video/webm;codecs=av01.0.04M.08', label: 'WebM AV1' },
    { mime: 'video/webm;codecs=av01', label: 'WebM AV1' },
    { mime: 'video/webm;codecs=vp09.00.10.08', label: 'WebM VP9' },
    { mime: 'video/webm;codecs=vp9', label: 'WebM VP9' },
    { mime: 'video/webm;codecs=vp8', label: 'WebM VP8' },
    { mime: 'video/webm', label: 'WebM' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) {
      return { mimeType: c.mime, label: c.label };
    }
  }
  return { mimeType: '', label: 'PNG Fallback' };
}

export async function exportCanvasToWebM(
  sourceCanvas: HTMLCanvasElement,
  lossless: boolean,
): Promise<{ blob: Blob; mimeType: string; codecLabel: string; ext: 'webm' | 'png' }> {
  const exportPngFallback = async () => {
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      sourceCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png', 1.0);
    });
    return { blob: pngBlob, mimeType: 'image/png', codecLabel: 'PNG Lossless', ext: 'png' as const };
  };

  const detected = detectNewestWebmCodec();
  if (!detected.mimeType || typeof sourceCanvas.captureStream !== 'function') {
    return exportPngFallback();
  }

  try {
    // Paint onto an offscreen canvas with subtle tick frames so captureStream records a pristine still WebM reliably
    const stage = document.createElement('canvas');
    stage.width = sourceCanvas.width;
    stage.height = sourceCanvas.height;
    const ctx = stage.getContext('2d');
    if (ctx) {
      ctx.drawImage(sourceCanvas, 0, 0);
    }

    const stream = stage.captureStream(30);
    const videoBitsPerSecond = lossless ? 140_000_000 : 28_000_000;
    let recorder: MediaRecorder;
    let activeMime = detected.mimeType;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: detected.mimeType,
        videoBitsPerSecond,
      });
    } catch {
      activeMime = 'video/webm';
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const blob = await new Promise<Blob>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(new Blob(chunks, { type: activeMime || 'video/webm' }));
      };
      recorder.onstop = finish;
      recorder.onerror = finish;
      recorder.start(100);
      let ticks = 0;
      const timer = window.setInterval(() => {
        ticks++;
        if (ctx) {
          ctx.drawImage(sourceCanvas, 0, 0);
        }
        if (ticks >= 12) {
          window.clearInterval(timer);
          if (recorder.state !== 'inactive') {
            try {
              recorder.stop();
            } catch {
              finish();
            }
          } else {
            finish();
          }
          stream.getTracks().forEach((t) => t.stop());
        }
      }, 60);
    });

    if (blob.size < 64) {
      return exportPngFallback();
    }

    return {
      blob,
      mimeType: activeMime,
      codecLabel: `${detected.label}${lossless ? ' (Lossless)' : ''}`,
      ext: 'webm',
    };
  } catch {
    return exportPngFallback();
  }
}
