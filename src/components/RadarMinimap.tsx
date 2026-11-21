import React from 'react';
import { getMapApartments, getMapPylons, isStadiumMap } from '../../shared/world';
import type { MapId } from '../../shared/world';
import type { HudSnapshot } from '../game/engine';

interface RadarMinimapProps {
  blips: HudSnapshot['radarBlips'];
  pylons: HudSnapshot['pylons'];
  nextbots?: HudSnapshot['radarNextbots'];
  superWeapons?: HudSnapshot['radarSuperWeapons'];
  modeHud?: HudSnapshot['modeHud'];
  mapId?: MapId;
  terrainSeed?: number;
  localTeamId?: 0 | 5 | 6;
  size?: number;
}

export const RadarMinimap: React.FC<RadarMinimapProps> = React.memo(({
  blips,
  pylons,
  nextbots = [],
  superWeapons = [],
  modeHud,
  mapId = 'metro_city',
  terrainSeed = 1,
  localTeamId = 0,
  size = 124,
}) => {
  const half = size / 2;
  const scale = half - 6;
  const mapPylons = React.useMemo(() => getMapPylons(mapId, terrainSeed), [mapId, terrainSeed]);
  const mapApartments = React.useMemo(() => getMapApartments(mapId, terrainSeed), [mapId, terrainSeed]);
  const stadium = isStadiumMap(mapId);
  const showSolarZone =
    modeHud?.specialModeId === 'none' &&
    modeHud?.normalModeId === 'king_of_hill' &&
    modeHud.zoneX !== undefined &&
    modeHud.zoneZ !== undefined &&
    modeHud.zoneRadius !== undefined;

  return (
    <div
      className="relative rounded-2xl border border-white/15 bg-[#12141a]/82 p-1.5 shadow-lg backdrop-blur-md"
      style={{ width: size + 12, height: size + 12 }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        {/* Arena Outer Ring */}
        <circle
          cx={half}
          cy={half}
          r={scale}
          fill={stadium ? '#14532d' : '#1a1d26'}
          stroke={stadium ? 'rgba(52, 211, 153, 0.55)' : 'rgba(220, 161, 59, 0.35)'}
          strokeWidth={1.2}
        />

        {stadium ? (
          /* Soccer Pitch Markings & Goal Boxes */
          <g stroke="rgba(255,255,255,0.45)" strokeWidth={1} fill="none">
            <rect
              x={half - (86 / 175) * scale}
              y={half - (132 / 175) * scale}
              width={(172 / 175) * scale}
              height={(264 / 175) * scale}
              rx={2}
            />
            <line
              x1={half - (86 / 175) * scale}
              y1={half}
              x2={half + (86 / 175) * scale}
              y2={half}
            />
            <circle cx={half} cy={half} r={(24 / 175) * scale} />
            {/* North & South Goal Boxes */}
            <rect
              x={half - (22 / 175) * scale}
              y={half - (132 / 175) * scale}
              width={(44 / 175) * scale}
              height={(14 / 175) * scale}
              stroke="#fbbf24"
            />
            <rect
              x={half - (22 / 175) * scale}
              y={half + (118 / 175) * scale}
              width={(44 / 175) * scale}
              height={(14 / 175) * scale}
              stroke="#38bdf8"
            />
          </g>
        ) : (
          <>
            <circle
              cx={half}
              cy={half}
              r={scale * 0.55}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={1}
            />
            <circle
              cx={half}
              cy={half}
              r={scale * 0.14}
              fill="rgba(220, 161, 59, 0.16)"
              stroke="rgba(220, 161, 59, 0.5)"
              strokeWidth={1}
            />
            {mapApartments.map((b) => {
              const bx = half + (b.x / 175) * scale;
              const bz = half + (b.z / 175) * scale;
              const bw = ((b.rot % 2 === 0 ? b.halfW : b.halfD) * 2 / 175) * scale;
              const bd = ((b.rot % 2 === 0 ? b.halfD : b.halfW) * 2 / 175) * scale;
              return (
                <rect
                  key={`apt-${b.id}`}
                  x={bx - bw * 0.5}
                  y={bz - bd * 0.5}
                  width={bw}
                  height={bd}
                  rx={1}
                  fill="rgba(148, 163, 184, 0.2)"
                  stroke="rgba(226, 232, 240, 0.36)"
                  strokeWidth={0.7}
                />
              );
            })}
          </>
        )}

        {/* Moving Solar Zone Circle (King of the Hill) */}
        {showSolarZone && modeHud.zoneX !== undefined && modeHud.zoneZ !== undefined && modeHud.zoneRadius !== undefined && (
          <circle
            cx={half + (modeHud.zoneX / 175) * scale}
            cy={half + (modeHud.zoneZ / 175) * scale}
            r={(modeHud.zoneRadius / 175) * scale}
            fill="rgba(250, 204, 21, 0.2)"
            stroke="#facc15"
            strokeWidth={1.3}
            strokeDasharray="3 2"
          />
        )}

        {/* Capture Pylons */}
        {mapPylons.map((pylon, idx) => {
          const px = half + (pylon.x / 175) * scale;
          const pz = half + (pylon.z / 175) * scale;
          const state = pylons[idx];
          const owned = state && state.ownerSlotId !== null;
          return (
            <rect
              key={pylon.id}
              x={px - 2.5}
              y={pz - 2.5}
              width={5}
              height={5}
              rx={1}
              fill={owned ? '#f59e0b' : 'rgba(244, 239, 230, 0.35)'}
            />
          );
        })}

        {/* 30s Mythic Super Weapon Drops */}
        {superWeapons.map((sw, idx) => {
          const sx = half + sw.x * scale;
          const sz = half + sw.z * scale;
          return (
            <g key={`sw-${idx}`}>
              <circle cx={sx} cy={sz} r={6} fill="none" stroke={sw.color} strokeWidth={1.1} opacity={0.8} />
              <polygon
                points={`${sx},${sz - 4.2} ${sx + 4.2},${sz} ${sx},${sz + 4.2} ${sx - 4.2},${sz}`}
                fill={sw.color}
                stroke="#ffffff"
                strokeWidth={0.7}
              />
            </g>
          );
        })}

        {/* Playable Solar Ball on Stadium Maps */}
        {stadium && modeHud?.ballX !== undefined && modeHud?.ballZ !== undefined && (
          <g>
            <circle
              cx={half + (modeHud.ballX / 175) * scale}
              cy={half + (modeHud.ballZ / 175) * scale}
              r={4.2}
              fill="#ffffff"
              stroke="#facc15"
              strokeWidth={1.4}
            />
          </g>
        )}

        {/* Player & Bot Blips */}
        {blips.map((b, i) => {
          const bx = half + b.x * scale;
          const bz = half + b.z * scale;
          const bTeam = b.teamId || (b.specialRole === 5 || b.specialRole === 6 ? b.specialRole : 0);
          const isAlly = !b.isSelf && localTeamId !== 0 && bTeam === localTeamId;
          const blipColor =
            bTeam === 5
              ? '#F59E0B'
              : bTeam === 6
              ? '#38BDF8'
              : b.specialRole === 8
              ? '#EF4444'
              : b.colorHex;

          if (b.isSelf) {
            return (
              <g key={`self-${i}`}>
                <circle cx={bx} cy={bz} r={4.5} fill="none" stroke="#ffffff" strokeWidth={1.3} />
                <circle cx={bx} cy={bz} r={2.4} fill={bTeam === 5 ? '#f59e0b' : '#38bdf8'} />
              </g>
            );
          }
          if (b.specialRole === 7) {
            return (
              <g key={`bounty-${i}`}>
                <circle cx={bx} cy={bz} r={4.2} fill="none" stroke={isAlly ? '#34d399' : '#facc15'} strokeWidth={1.1} />
                <circle cx={bx} cy={bz} r={2.2} fill="#facc15" />
              </g>
            );
          }
          if (b.isSovereign) {
            return (
              <g key={`sov-${i}`}>
                {!b.isBot && <circle cx={bx} cy={bz} r={5} fill="none" stroke="#34d399" strokeWidth={1} />}
                <circle cx={bx} cy={bz} r={3.6} fill="#fbbf24" stroke="#12141a" strokeWidth={0.8} />
                {b.isBot && <rect x={bx - 1} y={bz - 1} width={2} height={2} fill="#12141a" />}
              </g>
            );
          }
          if (b.isBot) {
            return (
              <g key={`bot-${i}`}>
                {isAlly && (
                  <circle cx={bx} cy={bz} r={3} fill="none" stroke="#34d399" strokeWidth={0.8} opacity={0.85} />
                )}
                <rect
                  x={bx - 1.3}
                  y={bz - 1.3}
                  width={2.6}
                  height={2.6}
                  fill={blipColor}
                  opacity={isAlly ? 0.85 : 0.45}
                />
              </g>
            );
          }
          // Real human player (!isBot): unmistakable crisp outlined diamond
          const d = 3.5;
          return (
            <g key={`p-${i}`}>
              {isAlly && <circle cx={bx} cy={bz} r={5.4} fill="none" stroke="#34d399" strokeWidth={0.9} />}
              <polygon
                points={`${bx},${bz - d} ${bx + d},${bz} ${bx},${bz + d} ${bx - d},${bz}`}
                fill={blipColor}
                stroke="#ffffff"
                strokeWidth={1.05}
              />
            </g>
          );
        })}

        {/* Nico's Nextbots Threat Markers */}
        {nextbots.map((nb, idx) => {
          const nx = half + nb.x * scale;
          const nz = half + nb.z * scale;
          return (
            <g key={`nb-${idx}`}>
              <rect
                x={nx - 3.6}
                y={nz - 3.6}
                width={7.2}
                height={7.2}
                rx={1}
                fill={nb.slowed ? '#38bdf8' : '#ef4444'}
                stroke="#ffffff"
                strokeWidth={0.9}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
});
