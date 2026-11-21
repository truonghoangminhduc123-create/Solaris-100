import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  Camera,
  Check,
  Cpu,
  Download,
  Film,
  Pencil,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getMapDef } from '../../shared/world';
import { buildPhotoStudioScene } from '../game/photoSceneBuilder';
import type { BuiltPhotoScene } from '../game/photoSceneBuilder';
import { getPaletteColorHex } from '../game/models';
import {
  deleteSavedPhoto,
  loadSavedPhotos,
  renameSavedPhoto,
} from '../game/photoStorage';
import type { FrozenSceneSnapshot } from '../game/photoStorage';
import {
  detectNewestWebmCodec,
  exportCanvasToWebM,
  runPhotoRaytrace,
} from '../game/raytracer';
import type { RaytracerBackend } from '../game/raytracer';

interface MyPhotosStudioProps {
  onClose: () => void;
}

const RESOLUTIONS = [
  { id: '720p', label: '720p', w: 1280, h: 720 },
  { id: '1080p', label: '1080p', w: 1920, h: 1080 },
  { id: '2k', label: '2K', w: 2560, h: 1440 },
  { id: '4k', label: '4K', w: 3840, h: 2160 },
  { id: '8k', label: '8K', w: 7680, h: 4320 },
] as const;

const SPP_PRESETS = [
  { id: 'fast', label: 'Fast (4 SPP)', spp: 4, bounces: 2 },
  { id: 'cinema', label: 'Cinema (12 SPP)', spp: 12, bounces: 3 },
  { id: 'ultra', label: 'Ultra (24 SPP)', spp: 24, bounces: 4 },
] as const;

interface ProjectedTag {
  slotId: number;
  name: string;
  isBot: boolean;
  shield: number;
  xPct: number;
  yPct: number;
  accent: string;
}

function formatPhotoDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const MyPhotosStudio: React.FC<MyPhotosStudioProps> = ({ onClose }) => {
  const [photos, setPhotos] = useState<FrozenSceneSnapshot[]>(() => loadSavedPhotos());
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);

  const activePhoto = useMemo(
    () => photos.find((p) => p.id === activePhotoId) || null,
    [photos, activePhotoId],
  );

  const filteredPhotos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return photos;
    return photos.filter((p) => {
      const displayName = (p.name || 'Untitled').toLowerCase();
      const mapName = getMapDef(p.mapId).name.toLowerCase();
      return displayName.includes(q) || mapName.includes(q);
    });
  }, [photos, searchQuery]);

  // Studio controls
  const [cameraMode, setCameraMode] = useState<string>('snapshot'); // 'snapshot' | 'slot:<id>'
  const [fov, setFov] = useState<number>(62);
  const [showNametags, setShowNametags] = useState<boolean>(true);
  const [showGui, setShowGui] = useState<boolean>(false);
  const [resId, setResId] = useState<(typeof RESOLUTIONS)[number]['id']>('1080p');
  const [sppId, setSppId] = useState<(typeof SPP_PRESETS)[number]['id']>('cinema');
  const [losslessWebm, setLosslessWebm] = useState<boolean>(true);

  const [projectedTags, setProjectedTags] = useState<ProjectedTag[]>([]);

  // Live raytracer state
  const [rendering, setRendering] = useState(false);
  const [renderCompletedUrl, setRenderCompletedUrl] = useState<string | null>(null);
  const [renderDownloadExt, setRenderDownloadExt] = useState<'webm' | 'png'>('webm');
  const [renderCodecInfo, setRenderCodecInfo] = useState<string>('');
  const [renderBackend, setRenderBackend] = useState<RaytracerBackend>('WebGPU');
  const [renderStatus, setRenderStatus] = useState<string>('');
  const [renderProgress, setRenderProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [activeBucket, setActiveBucket] = useState<{
    xPct: number;
    yPct: number;
    wPct: number;
    hPct: number;
  } | null>(null);

  const previewMountRef = useRef<HTMLDivElement | null>(null);
  const rayDisplayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rayFullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const builtSceneRef = useRef<BuiltPhotoScene | null>(null);
  const studioCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Orbit / offset state for Snapshot Free Cam or Spectate orbit
  const camPoseRef = useRef({
    x: 0,
    y: 12,
    z: 24,
    yaw: 0,
    pitch: -0.2,
    specYawOffset: 0,
    specPitchOffset: 0.22,
    specDist: 10.2,
  });

  const isSpectatingSelf = useMemo(() => {
    if (!activePhoto || activePhoto.localSlotId === null) return false;
    return cameraMode === `slot:${activePhoto.localSlotId}`;
  }, [activePhoto, cameraMode]);

  const detectedCodec = useMemo(() => detectNewestWebmCodec(), []);

  // Automatically disable Show GUI if user switches camera away from Self
  useEffect(() => {
    if (!isSpectatingSelf && showGui) {
      setShowGui(false);
    }
  }, [isSpectatingSelf, showGui]);

  // Cleanup any blob URL on unmount or photo change
  useEffect(() => {
    return () => {
      if (renderCompletedUrl) URL.revokeObjectURL(renderCompletedUrl);
    };
  }, [renderCompletedUrl]);

  const computeStudioCamera = useCallback(
    (cam: THREE.PerspectiveCamera, photo: FrozenSceneSnapshot, aspect: number) => {
      cam.fov = fov;
      cam.aspect = aspect;
      cam.updateProjectionMatrix();

      if (cameraMode.startsWith('slot:')) {
        const targetSlot = Number(cameraMode.slice(5));
        const p = photo.players.find((pl) => pl.slotId === targetSlot);
        if (p) {
          const dist = camPoseRef.current.specDist * Math.max(0.85, Math.min(2.1, p.scale));
          const yaw = p.yaw + camPoseRef.current.specYawOffset;
          const pitch = Math.max(-1.05, Math.min(1.25, camPoseRef.current.specPitchOffset));
          const horiz = Math.cos(pitch) * dist;
          const cx = p.x - Math.sin(yaw) * horiz;
          const cy = p.y + 1.8 * p.scale + Math.sin(pitch) * dist;
          const cz = p.z - Math.cos(yaw) * horiz;
          cam.position.set(cx, cy, cz);
          cam.lookAt(p.x, p.y + 1.25 * p.scale, p.z);
          cam.updateMatrixWorld();
          return;
        }
      }

      const pose = camPoseRef.current;
      cam.position.set(pose.x, pose.y, pose.z);
      const cosP = Math.cos(pose.pitch);
      const lookX = pose.x - Math.sin(pose.yaw) * cosP * 20;
      const lookY = pose.y + Math.sin(pose.pitch) * 20;
      const lookZ = pose.z - Math.cos(pose.yaw) * cosP * 20;
      cam.lookAt(lookX, lookY, lookZ);
      cam.updateMatrixWorld();
    },
    [cameraMode, fov],
  );

  // Build & run live 16:9 Three.js Studio Preview
  useEffect(() => {
    const mount = previewMountRef.current;
    if (!mount || !activePhoto) return;

    camPoseRef.current = {
      x: activePhoto.camera.x,
      y: activePhoto.camera.y,
      z: activePhoto.camera.z,
      yaw: activePhoto.camera.yaw,
      pitch: activePhoto.camera.pitch,
      specYawOffset: 0,
      specPitchOffset: 0.22,
      specDist: 10.2,
    };
    setFov(Math.round(Math.max(30, Math.min(110, activePhoto.camera.fov || 62))));
    setCameraMode('snapshot');
    setRenderCompletedUrl(null);
    setRendering(false);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'h-full w-full block';
    mount.replaceChildren(renderer.domElement);

    const built = buildPhotoStudioScene(activePhoto, renderer.capabilities.getMaxAnisotropy());
    builtSceneRef.current = built;

    const cam = new THREE.PerspectiveCamera(activePhoto.camera.fov || 62, 16 / 9, 0.25, 1100);
    studioCameraRef.current = cam;

    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(16, mount.clientWidth);
      const h = Math.max(9, mount.clientHeight);
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(mount);
    renderer.setSize(Math.max(16, mount.clientWidth), Math.max(9, mount.clientHeight), false);

    let rafId = 0;
    let lastTagUpdate = 0;
    const tmpVec = new THREE.Vector3();

    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop);
      if (!builtSceneRef.current || !studioCameraRef.current) return;
      computeStudioCamera(studioCameraRef.current, activePhoto, 16 / 9);
      renderer.render(builtSceneRef.current.scene, studioCameraRef.current);

      if (now - lastTagUpdate > 50) {
        lastTagUpdate = now;
        const tags: ProjectedTag[] = [];
        for (const p of activePhoto.players) {
          tmpVec.set(p.x, p.y + 2.35 * p.scale, p.z).project(studioCameraRef.current);
          if (tmpVec.z <= 0 || tmpVec.z >= 1) continue;
          const xPct = (tmpVec.x + 1) * 50;
          const yPct = (-tmpVec.y + 1) * 50;
          if (xPct < 3 || xPct > 97 || yPct < 4 || yPct > 96) continue;
          tags.push({
            slotId: p.slotId,
            name: p.name,
            isBot: p.isBot,
            shield: p.shield,
            xPct,
            yPct,
            accent:
              p.teamId === 5
                ? '#F59E0B'
                : p.teamId === 6
                ? '#38BDF8'
                : getPaletteColorHex(p.colorIndex),
          });
        }
        setProjectedTags(tags);
      }
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      abortRef.current?.abort();
      built.dispose();
      builtSceneRef.current = null;
      studioCameraRef.current = null;
      renderer.dispose();
      mount.replaceChildren();
    };
  }, [activePhoto?.id]);

  // Keep studioCamera synced when FOV/cameraMode update while rendering UI is hidden/visible
  useEffect(() => {
    if (studioCameraRef.current && activePhoto) {
      computeStudioCamera(studioCameraRef.current, activePhoto, 16 / 9);
    }
  }, [activePhoto, cameraMode, fov, computeStudioCamera]);

  // Mouse drag to adjust Studio camera angle in the 16:9 viewport
  const dragStateRef = useRef<{ active: boolean; lastX: number; lastY: number; btn: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
    btn: 0,
  });

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rendering) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, btn: e.button };
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active || rendering) return;
    const dx = e.clientX - dragStateRef.current.lastX;
    const dy = e.clientY - dragStateRef.current.lastY;
    dragStateRef.current.lastX = e.clientX;
    dragStateRef.current.lastY = e.clientY;

    const pose = camPoseRef.current;
    if (cameraMode.startsWith('slot:')) {
      pose.specYawOffset -= dx * 0.006;
      pose.specPitchOffset = Math.max(-1.05, Math.min(1.25, pose.specPitchOffset + dy * 0.005));
    } else if (e.shiftKey || dragStateRef.current.btn === 2) {
      const rightX = Math.cos(pose.yaw);
      const rightZ = -Math.sin(pose.yaw);
      pose.x -= rightX * dx * 0.07;
      pose.z -= rightZ * dx * 0.07;
      pose.y += dy * 0.07;
    } else {
      pose.yaw -= dx * 0.005;
      pose.pitch = Math.max(-1.35, Math.min(1.35, pose.pitch - dy * 0.005));
    }
  };

  const handleViewportPointerUp = () => {
    dragStateRef.current.active = false;
  };

  const handleViewportWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (rendering) return;
    const pose = camPoseRef.current;
    if (cameraMode.startsWith('slot:')) {
      pose.specDist = Math.max(4.5, Math.min(28, pose.specDist + e.deltaY * 0.012));
    } else {
      const step = -Math.sign(e.deltaY) * 2.2;
      const cosP = Math.cos(pose.pitch);
      pose.x -= Math.sin(pose.yaw) * cosP * step;
      pose.y += Math.sin(pose.pitch) * step;
      pose.z -= Math.cos(pose.yaw) * cosP * step;
    }
  };

  const zoomStudioCamera = (direction: 1 | -1) => {
    const pose = camPoseRef.current;
    if (cameraMode.startsWith('slot:')) {
      pose.specDist = Math.max(4.5, Math.min(28, pose.specDist - direction * 2.0));
    } else {
      const step = direction * 3.0;
      const cosP = Math.cos(pose.pitch);
      pose.x -= Math.sin(pose.yaw) * cosP * step;
      pose.y += Math.sin(pose.pitch) * step;
      pose.z -= Math.cos(pose.yaw) * cosP * step;
    }
  };

  const handleResetCam = () => {
    if (!activePhoto) return;
    camPoseRef.current = {
      x: activePhoto.camera.x,
      y: activePhoto.camera.y,
      z: activePhoto.camera.z,
      yaw: activePhoto.camera.yaw,
      pitch: activePhoto.camera.pitch,
      specYawOffset: 0,
      specPitchOffset: 0.22,
      specDist: 10.2,
    };
    setFov(Math.round(Math.max(30, Math.min(110, activePhoto.camera.fov || 62))));
    setCameraMode('snapshot');
  };

  const compositeOverlaysOntoCanvas = (
    canvas: HTMLCanvasElement,
    photo: FrozenSceneSnapshot,
    cam: THREE.PerspectiveCamera,
    tagsEnabled: boolean,
    guiEnabled: boolean,
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const scale = W / 1280;

    if (tagsEnabled) {
      const tmp = new THREE.Vector3();
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of photo.players) {
        tmp.set(p.x, p.y + 2.35 * p.scale, p.z).project(cam);
        if (tmp.z <= 0 || tmp.z >= 1) continue;
        const sx = (tmp.x + 1) * 0.5 * W;
        const sy = (-tmp.y + 1) * 0.5 * H;
        if (sx < 40 * scale || sx > W - 40 * scale || sy < 30 * scale || sy > H - 30 * scale) continue;

        const label = p.isBot ? `[BOT] ${p.name}` : p.name;
        ctx.font = `700 ${Math.round(13 * scale)}px "Plus Jakarta Sans", sans-serif`;
        const tw = ctx.measureText(label).width + 24 * scale;
        const boxH = 26 * scale;
        ctx.fillStyle = 'rgba(18, 20, 26, 0.85)';
        ctx.strokeStyle =
          p.teamId === 5 ? '#F59E0B' : p.teamId === 6 ? '#38BDF8' : getPaletteColorHex(p.colorIndex);
        ctx.lineWidth = Math.max(1.5, 1.5 * scale);
        ctx.beginPath();
        ctx.roundRect(sx - tw / 2, sy - boxH, tw, boxH, 999);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#F4EFE6';
        ctx.fillText(label, sx, sy - boxH * 0.55);

        // Micro HP bar
        const barW = Math.min(tw - 14 * scale, 62 * scale);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(sx - barW / 2, sy - 6 * scale, barW, 3 * scale);
        ctx.fillStyle = p.shield <= 35 ? '#EF4444' : '#2DD4BF';
        ctx.fillRect(sx - barW / 2, sy - 6 * scale, barW * Math.max(0, Math.min(1, p.shield / 100)), 3 * scale);
      }
      ctx.restore();
    }

    if (guiEnabled && photo.localSlotId !== null) {
      const self = photo.players.find((p) => p.slotId === photo.localSlotId);
      if (self) {
        ctx.save();
        // Top-Left Self Telemetry Pill
        const pad = 24 * scale;
        const cardW = 240 * scale;
        const cardH = 88 * scale;
        ctx.fillStyle = 'rgba(18, 20, 26, 0.84)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = Math.max(1.5, 1.5 * scale);
        ctx.beginPath();
        ctx.roundRect(pad, pad, cardW, cardH, 16 * scale);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#B8B1A4';
        ctx.font = `600 ${Math.round(12 * scale)}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillText(self.name, pad + 16 * scale, pad + 24 * scale);

        ctx.fillStyle = self.shield <= 35 ? '#EF4444' : '#2DD4BF';
        ctx.font = `700 ${Math.round(18 * scale)}px "JetBrains Mono", monospace`;
        ctx.fillText(`SHIELD ${self.shield}%`, pad + 16 * scale, pad + 52 * scale);

        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(pad + 16 * scale, pad + 64 * scale, cardW - 32 * scale, 7 * scale);
        ctx.fillStyle = self.shield <= 35 ? '#EF4444' : '#2DD4BF';
        ctx.fillRect(
          pad + 16 * scale,
          pad + 64 * scale,
          (cardW - 32 * scale) * Math.max(0, Math.min(1, self.shield / 100)),
          7 * scale,
        );

        // Hollow O Crosshair
        ctx.globalCompositeOperation = 'difference';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(2, 2.2 * scale);
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.46, 10 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const handleStartRender = async () => {
    if (!activePhoto || !builtSceneRef.current || !studioCameraRef.current || rendering) return;

    const res = RESOLUTIONS.find((r) => r.id === resId) || RESOLUTIONS[1];
    const preset = SPP_PRESETS.find((s) => s.id === sppId) || SPP_PRESETS[1];

    if (renderCompletedUrl) {
      URL.revokeObjectURL(renderCompletedUrl);
      setRenderCompletedUrl(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setRendering(true);
    setRenderProgress({ done: 0, total: 1 });
    setRenderStatus('Preparing BVH acceleration tree...');
    setActiveBucket(null);

    // Full-resolution output canvas (kept offscreen so 8K never stretches CSS layout)
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = res.w;
    fullCanvas.height = res.h;
    rayFullCanvasRef.current = fullCanvas;
    const fullCtx = fullCanvas.getContext('2d');
    if (fullCtx) {
      fullCtx.fillStyle = '#0c0e14';
      fullCtx.fillRect(0, 0, res.w, res.h);
    }

    // Live 16:9 visible preview canvas (max 1280x720 for buttery tile updates even while tracing 8K)
    const dispCanvas = rayDisplayCanvasRef.current;
    if (dispCanvas) {
      dispCanvas.width = Math.min(res.w, 1280);
      dispCanvas.height = Math.min(res.h, 720);
      const dCtx = dispCanvas.getContext('2d');
      if (dCtx) {
        dCtx.fillStyle = '#0c0e14';
        dCtx.fillRect(0, 0, dispCanvas.width, dispCanvas.height);
      }
    }

    // Sync exact camera pose & aspect
    const cam = studioCameraRef.current.clone();
    computeStudioCamera(cam, activePhoto, res.w / res.h);

    const tileCanvas = document.createElement('canvas');

    try {
      const result = await runPhotoRaytrace(builtSceneRef.current, {
        width: res.w,
        height: res.h,
        samplesPerPixel: preset.spp,
        maxBounces: preset.bounces,
        camera: cam,
        preferWebGPU: true,
        signal: controller.signal,
        onStatus: (msg, backend) => {
          setRenderStatus(msg);
          setRenderBackend(backend);
        },
        onTileComplete: (info) => {
          if (fullCtx) {
            fullCtx.putImageData(info.imageData, info.x, info.y);
          }
          if (dispCanvas) {
            const dCtx = dispCanvas.getContext('2d');
            if (dCtx) {
              tileCanvas.width = info.w;
              tileCanvas.height = info.h;
              const tCtx = tileCanvas.getContext('2d');
              if (tCtx) {
                tCtx.putImageData(info.imageData, 0, 0);
                const sx = dispCanvas.width / res.w;
                const sy = dispCanvas.height / res.h;
                dCtx.drawImage(
                  tileCanvas,
                  info.x * sx,
                  info.y * sy,
                  Math.max(1, info.w * sx),
                  Math.max(1, info.h * sy),
                );
              }
            }
          }
          setRenderBackend(info.backend);
          setRenderProgress({ done: info.doneTiles, total: info.totalTiles });
          setRenderStatus(
            `${info.backend} Tracing & Denoising · ${info.doneTiles}/${info.totalTiles} tiles`,
          );
          setActiveBucket({
            xPct: (info.x / res.w) * 100,
            yPct: (info.y / res.h) * 100,
            wPct: (info.w / res.w) * 100,
            hPct: (info.h / res.h) * 100,
          });
        },
      });

      setActiveBucket(null);

      if (result.cancelled) {
        setRendering(false);
        setRenderStatus('Cancelled');
        return;
      }

      // Composite selected HUD overlays onto full-res canvas and display canvas
      compositeOverlaysOntoCanvas(fullCanvas, activePhoto, cam, showNametags, isSpectatingSelf && showGui);
      if (dispCanvas) {
        const dCtx = dispCanvas.getContext('2d');
        if (dCtx) {
          dCtx.drawImage(fullCanvas, 0, 0, dispCanvas.width, dispCanvas.height);
        }
      }

      setRenderStatus(`Encoding ${detectedCodec.label}...`);
      const exported = await exportCanvasToWebM(fullCanvas, losslessWebm);
      const url = URL.createObjectURL(exported.blob);
      setRenderCompletedUrl(url);
      setRenderDownloadExt(exported.ext);
      setRenderCodecInfo(exported.codecLabel);
      setRenderStatus(
        `Complete in ${(result.durationMs / 1000).toFixed(1)}s · ${result.triCount.toLocaleString()} tris · ${exported.codecLabel}`,
      );

      // Auto-trigger download cleanly
      const safeName = (activePhoto.name || 'solaris-photo')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}-${res.id}.${exported.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setRendering(false);
      setActiveBucket(null);
    }
  };

  const handleCancelRender = () => {
    abortRef.current?.abort();
    setRendering(false);
    setActiveBucket(null);
  };

  const handleRenameSubmit = (id: string) => {
    setPhotos(renameSavedPhoto(id, editDraft));
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setPhotos(deleteSavedPhoto(id));
    if (activePhotoId === id) setActivePhotoId(null);
  };

  // ---------- STUDIO VIEW (Single Snapshot Opened via Double-Click) ----------
  if (activePhoto) {
    const mapDef = getMapDef(activePhoto.mapId);
    const selfSlot = activePhoto.localSlotId;
    const showSelfGuiOverlay = isSpectatingSelf && showGui && !rendering && !renderCompletedUrl;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1017] text-[#f4efe6] overflow-y-auto overscroll-contain touch-pan-y">
        {/* Top Studio Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#121620] px-3 sm:px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                handleCancelRender();
                setActivePhotoId(null);
              }}
              className="ios-btn flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#f4efe6] hover:bg-white/15 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>My Photos</span>
            </button>
            <div className="min-w-0">
              <div className="font-display text-sm sm:text-base font-bold truncate">
                {activePhoto.name || 'Untitled'}
              </div>
              <div className="text-[11px] text-[#9ca3af] truncate">
                {mapDef.name} · {activePhoto.players.length} Pilots · {formatPhotoDate(activePhoto.createdAt)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              handleCancelRender();
              onClose();
            }}
            className="ios-btn flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#b8b1a4] hover:text-white cursor-pointer"
            aria-label="Close Studio"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col lg:flex-row gap-3 sm:gap-4 p-2.5 sm:p-4 max-w-[1600px] w-full mx-auto">
          {/* Exact 16:9 Live Preview & Raytraced Bucket Viewport */}
          <div className="flex-1 flex flex-col items-center justify-center min-w-0">
            <div
              onPointerDown={handleViewportPointerDown}
              onPointerMove={handleViewportPointerMove}
              onPointerUp={handleViewportPointerUp}
              onWheel={handleViewportWheel}
              onContextMenu={(e) => e.preventDefault()}
              className="relative w-full max-w-[1120px] aspect-video rounded-2xl border border-white/15 bg-black overflow-hidden shadow-2xl select-none touch-none cursor-grab active:cursor-grabbing"
            >
              {/* WebGL 3D Studio Preview */}
              <div
                ref={previewMountRef}
                className={`absolute inset-0 h-full w-full ${
                  rendering || renderCompletedUrl ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}
              />

              {/* Live Raytracer Bucket Output Canvas */}
              <canvas
                ref={rayDisplayCanvasRef}
                className={`absolute inset-0 h-full w-full object-contain ${
                  rendering || renderCompletedUrl ? 'block' : 'hidden'
                }`}
              />

              {/* Active V-Ray Style Bucket Box */}
              {rendering && activeBucket && (
                <div
                  className="pointer-events-none absolute border-2 border-[#fbbf24] shadow-[0_0_12px_rgba(251,191,36,0.65)]"
                  style={{
                    left: `${activeBucket.xPct}%`,
                    top: `${activeBucket.yPct}%`,
                    width: `${activeBucket.wPct}%`,
                    height: `${activeBucket.hPct}%`,
                  }}
                />
              )}

              {/* Live Projected Nametags inside 16:9 Frame */}
              {showNametags && !rendering && !renderCompletedUrl && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  {projectedTags.map((t) => (
                    <div
                      key={t.slotId}
                      style={{ left: `${t.xPct}%`, top: `${t.yPct}%`, transform: 'translate(-50%, -100%)' }}
                      className="absolute whitespace-nowrap text-center"
                    >
                      <div
                        className="inline-flex items-center gap-1 rounded-full border bg-[#12141a]/88 px-2 py-0.5 text-[10px] font-bold text-[#f4efe6] shadow"
                        style={{ borderColor: t.accent }}
                      >
                        {t.isBot && <span className="text-[#94a3b8]">[BOT]</span>}
                        <span>{t.name}</span>
                      </div>
                      <div className="mx-auto mt-0.5 h-1 w-10 overflow-hidden rounded-full bg-white/20">
                        <div
                          className={`h-full ${t.shield <= 35 ? 'bg-[#ef4444]' : 'bg-[#2dd4bf]'}`}
                          style={{ width: `${t.shield}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Live Self GUI Preview Overlay (ONLY when Spectating Self + Show GUI checked) */}
              {showSelfGuiOverlay && (() => {
                const selfP = activePhoto.players.find((p) => p.slotId === selfSlot);
                if (!selfP) return null;
                return (
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute left-3 top-3 rounded-xl border border-white/15 bg-[#12141a]/84 px-3 py-2 shadow-lg">
                      <div className="text-[10px] text-[#b8b1a4]">{selfP.name}</div>
                      <div className="font-mono-tabular text-sm font-bold text-[#2dd4bf]">
                        SHIELD {selfP.shield}%
                      </div>
                      <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-white/15">
                        <div
                          className={`h-full ${selfP.shield <= 35 ? 'bg-[#ef4444]' : 'bg-[#2dd4bf]'}`}
                          style={{ width: `${selfP.shield}%` }}
                        />
                      </div>
                    </div>
                    <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 mix-blend-difference">
                      <div className="h-5 w-5 rounded-full border-2 border-white" />
                    </div>
                  </div>
                );
              })()}

              {/* Viewport Hint Badge */}
              {!rendering && !renderCompletedUrl && (
                <div className="pointer-events-none absolute bottom-2.5 left-3 rounded-full border border-white/15 bg-[#12141a]/80 px-3 py-1 text-[10px] text-[#d6cfc2]">
                  Drag to orbit · Scroll to zoom · Shift+Drag to pan · FOV {fov}°
                </div>
              )}

              {/* Render Status Bar inside Viewport */}
              {(rendering || renderCompletedUrl) && (
                <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 bg-[#12141a]/90 px-3.5 py-2 backdrop-blur-md">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Cpu className="h-4 w-4 text-[#fbbf24]" />
                    <span>{renderStatus}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {rendering ? (
                      <>
                        <span className="font-mono-tabular text-xs font-bold text-[#fbbf24]">
                          {renderProgress.total > 0
                            ? `${Math.round((renderProgress.done / renderProgress.total) * 100)}%`
                            : '0%'}
                        </span>
                        <button
                          type="button"
                          onClick={handleCancelRender}
                          className="ios-btn rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/20 px-2.5 py-1 text-[11px] font-bold text-[#fca5a5] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      renderCompletedUrl && (
                        <>
                          <a
                            href={renderCompletedUrl}
                            download={`${(activePhoto.name || 'solaris-photo').toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}-${resId}.${renderDownloadExt}`}
                            className="ios-btn flex items-center gap-1 rounded-lg bg-[#e68a1e] px-2.5 py-1 text-[11px] font-bold text-[#12141a]"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Save {renderDownloadExt.toUpperCase()}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => setRenderCompletedUrl(null)}
                            className="ios-btn rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            Back to 3D View
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Studio Control Panel */}
          <div className="w-full lg:w-[340px] shrink-0 rounded-2xl border border-white/12 bg-[#141822] p-3.5 sm:p-4 flex flex-col gap-3.5 sm:gap-4 h-fit">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#f4efe6]">Camera Spectate</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={rendering}
                    onClick={() => zoomStudioCamera(1)}
                    className="ios-btn flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-[#0e1118] text-[#d6cfc2] hover:text-white cursor-pointer"
                    aria-label="Zoom in"
                    title="Zoom in"
                  >
                    <ZoomIn className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={rendering}
                    onClick={() => zoomStudioCamera(-1)}
                    className="ios-btn flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-[#0e1118] text-[#d6cfc2] hover:text-white cursor-pointer"
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    <ZoomOut className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetCam}
                    className="ios-btn flex items-center gap-1 text-[11px] text-[#fbbf24] hover:underline cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>
              <select
                value={cameraMode}
                disabled={rendering}
                onChange={(e) => {
                  setCameraMode(e.target.value);
                  setRenderCompletedUrl(null);
                }}
                className="w-full rounded-xl border border-white/15 bg-[#0e1118] px-3 py-2 text-xs font-medium text-[#f4efe6] focus:border-[#e68a1e] focus:outline-none"
              >
                <option value="snapshot">Snapshot Camera (Free Orbit)</option>
                {activePhoto.players.map((p) => {
                  const isSelf = p.slotId === selfSlot;
                  return (
                    <option key={p.slotId} value={`slot:${p.slotId}`}>
                      {isSelf ? `Self · ${p.name}` : `${p.isBot ? '[BOT] ' : ''}${p.name}`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* FOV Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-[#f4efe6]">Camera FOV</span>
                <span className="font-mono-tabular text-[#fbbf24] font-bold">{fov}°</span>
              </div>
              <input
                type="range"
                min={30}
                max={110}
                step={1}
                disabled={rendering}
                value={fov}
                onChange={(e) => setFov(Number(e.target.value))}
                className="w-full accent-[#e68a1e] cursor-pointer"
              />
            </div>

            {/* Overlay Checkboxes: Show Nametags + Show GUI (Self Spectate only) */}
            <div className="space-y-2 rounded-xl border border-white/10 bg-[#0e1118] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                Viewport Overlays
              </div>
              <label className="flex items-center gap-2.5 text-xs text-[#f4efe6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showNametags}
                  disabled={rendering}
                  onChange={(e) => setShowNametags(e.target.checked)}
                  className="h-4 w-4 accent-[#e68a1e] rounded cursor-pointer"
                />
                <span>Show Nametags</span>
              </label>

              <label
                className={`flex items-center gap-2.5 text-xs ${
                  isSpectatingSelf
                    ? 'text-[#f4efe6] cursor-pointer'
                    : 'text-[#6b7280] cursor-not-allowed'
                }`}
                title={
                  isSpectatingSelf
                    ? 'Show Self HUD in Studio & Render'
                    : 'Switch Camera Spectate to Self to enable GUI'
                }
              >
                <input
                  type="checkbox"
                  checked={isSpectatingSelf && showGui}
                  disabled={!isSpectatingSelf || rendering}
                  onChange={(e) => setShowGui(e.target.checked)}
                  className="h-4 w-4 accent-[#e68a1e] rounded"
                />
                <span>
                  Show GUI{' '}
                  {!isSpectatingSelf && (
                    <span className="text-[10px] text-[#6b7280]">(Self spectate only)</span>
                  )}
                </span>
              </label>
            </div>

            {/* Raytrace Resolution */}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#f4efe6]">Render Resolution</span>
                <span className="font-mono-tabular text-[10px] text-[#9ca3af]">
                  {RESOLUTIONS.find((r) => r.id === resId)?.w}×{RESOLUTIONS.find((r) => r.id === resId)?.h}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={rendering}
                    onClick={() => setResId(r.id)}
                    className={`ios-btn rounded-lg border py-1.5 text-[11px] font-bold cursor-pointer ${
                      resId === r.id
                        ? 'border-[#e68a1e] bg-[#e68a1e] text-[#12141a]'
                        : 'border-white/12 bg-[#0e1118] text-[#b8b1a4] hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Path Tracer Sampling Quality */}
            <div>
              <div className="text-xs font-semibold text-[#f4efe6] mb-1.5">
                BVH Path Tracer Sampling
              </div>
              <div className="grid grid-cols-3 gap-1">
                {SPP_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={rendering}
                    onClick={() => setSppId(p.id)}
                    className={`ios-btn rounded-lg border px-1.5 py-1.5 text-[10px] font-semibold cursor-pointer ${
                      sppId === p.id
                        ? 'border-[#38bdf8] bg-[#38bdf8]/20 text-[#38bdf8]'
                        : 'border-white/12 bg-[#0e1118] text-[#b8b1a4] hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* WebM Lossless Toggle */}
            <div className="rounded-xl border border-white/10 bg-[#0e1118] p-3">
              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span className="flex items-center gap-2 font-semibold text-[#f4efe6]">
                  <Film className="h-3.5 w-3.5 text-[#38bdf8]" />
                  <span>Lossless Quality</span>
                </span>
                <input
                  type="checkbox"
                  checked={losslessWebm}
                  disabled={rendering}
                  onChange={(e) => setLosslessWebm(e.target.checked)}
                  className="h-4 w-4 accent-[#e68a1e]"
                />
              </label>
              <div className="mt-1 text-[10px] text-[#9ca3af]">
                Codec: <span className="text-[#f4efe6] font-mono-tabular">{renderCodecInfo || detectedCodec.label}</span> · Backend priority: WebGPU Compute → CPU BVH
              </div>
            </div>

            <button
              type="button"
              disabled={rendering}
              onClick={handleStartRender}
              className="ios-btn w-full min-h-[44px] rounded-xl bg-[#e68a1e] px-4 py-2.5 font-display text-sm font-bold text-[#12141a] hover:bg-[#f59e0b] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-lg"
            >
              <Sparkles className="h-4 w-4" />
              <span>{rendering ? `Raytracing (${renderBackend})...` : 'Raytrace & Export WebM'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- GALLERY MANAGER VIEW ("My Photos") ----------
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1017]/96 backdrop-blur-md text-[#f4efe6]">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 bg-[#121620] px-3.5 sm:px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Camera className="h-5 w-5 text-[#e68a1e] shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold tracking-wide">My Photos</h2>
            <p className="text-[11px] text-[#9ca3af] truncate">
              Capture via top-right Camera button (mobile) or S/P (PC) · Tap or double-click to open Studio
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search photos or maps..."
              className="w-full sm:w-60 rounded-xl border border-white/15 bg-[#0d1017] pl-8 pr-3 py-1.5 text-xs text-[#f4efe6] placeholder-[#6b7280] focus:border-[#e68a1e] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ios-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#b8b1a4] hover:text-white cursor-pointer"
            aria-label="Close My Photos"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-3.5 sm:p-5">
        {filteredPhotos.length === 0 ? (
          <div className="mx-auto mt-10 sm:mt-16 max-w-md rounded-2xl border border-white/12 bg-[#141822] p-6 sm:p-8 text-center">
            <Camera className="mx-auto h-10 w-10 text-[#6b7280]" />
            <h3 className="mt-3 font-display text-base font-bold">
              {photos.length === 0 ? 'No 3D Snapshots Saved Yet' : 'No Matching Photos'}
            </h3>
            <p className="mt-1.5 text-xs text-[#9ca3af]">
              {photos.length === 0
                ? 'While playing in an arena, tap the Camera button in the top navigation bar (mobile) or tap S / P (PC) to freeze the 3D scene locally.'
                : 'Try another search term or clear your filter.'}
            </p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-6xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            {filteredPhotos.map((p) => {
              const mapDef = getMapDef(p.mapId);
              const isEditing = editingId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (!isEditing && (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)) {
                      setActivePhotoId(p.id);
                    }
                  }}
                  onDoubleClick={() => {
                    if (!isEditing) setActivePhotoId(p.id);
                  }}
                  title="Double-click (or tap on mobile) to open 3D Raytrace Studio"
                  className="group relative flex flex-col justify-between rounded-2xl border border-white/12 bg-[#141822] p-3.5 sm:p-4 shadow-lg transition hover:border-[#e68a1e]/70 hover:bg-[#181d2a] cursor-pointer select-none"
                >
                  {/* Visual Scene Header Card */}
                  <div>
                    <div
                      className="mb-3 flex h-24 items-end justify-between rounded-xl border border-white/10 p-3"
                      style={{
                        background: `linear-gradient(135deg, #111521 0%, ${mapDef.uiAccent}33 100%)`,
                      }}
                    >
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-[#12141a]"
                        style={{ backgroundColor: mapDef.uiAccent }}
                      >
                        {mapDef.name}
                      </span>
                      <span className="font-mono-tabular text-[10px] text-[#d6cfc2] bg-[#12141a]/75 px-2 py-0.5 rounded-full">
                        Double-Click Studio
                      </span>
                    </div>

                    {isEditing ? (
                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          autoFocus
                          maxLength={64}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSubmit(p.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          placeholder="Photo name"
                          className="flex-1 rounded-lg border border-[#e68a1e] bg-[#0d1017] px-2.5 py-1 text-xs text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameSubmit(p.id)}
                          className="ios-btn rounded-lg bg-[#e68a1e] p-1.5 text-[#12141a] cursor-pointer"
                          aria-label="Save name"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <h3
                          className={`font-display text-sm font-bold truncate ${
                            p.name ? 'text-[#f4efe6]' : 'text-[#9ca3af] italic'
                          }`}
                        >
                          {p.name || 'Untitled'}
                        </h3>
                      </div>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[#9ca3af]">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-[#34d399]" />
                        {p.players.length} Pilots
                      </span>
                      <span>·</span>
                      <span className="font-mono-tabular">{p.bullets.length + p.beams.length} Shots</span>
                      <span>·</span>
                      <span>{formatPhotoDate(p.createdAt)}</span>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div
                    className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setActivePhotoId(p.id)}
                      className="text-[11px] font-semibold text-[#fbbf24] hover:underline cursor-pointer"
                    >
                      Open 3D Studio
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditDraft(p.name);
                        }}
                        className="ios-btn flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-[#d6cfc2] hover:text-white cursor-pointer"
                        title="Rename photo"
                        aria-label="Rename photo"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="ios-btn flex h-7 w-7 items-center justify-center rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 text-[#fca5a5] hover:bg-[#ef4444]/25 cursor-pointer"
                        title="Delete photo"
                        aria-label="Delete photo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
