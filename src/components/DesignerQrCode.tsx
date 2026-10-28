import React from 'react';
import Svg, { Rect, Circle, Text as SvgText } from 'react-native-svg';

interface DesignerQrCodeProps {
  value: string;
  size?: number;
  primaryColor?: string;
  accentColor?: string;
  badgeText?: string;
}

/**
 * Custom Designer QR Code for React Native with:
 * - Concentric squircle corner finder eyes
 * - Rounded circular dot-matrix modules
 * - Center brand emblem badge
 */
export const DesignerQrCode: React.FC<DesignerQrCodeProps> = ({
  value,
  size = 120,
  primaryColor = '#0F172A',
  accentColor = '#0D9488',
  badgeText = 'QR',
}) => {
  const gridSize = 21;
  const cell = size / gridSize;

  const isFinderZone = (r: number, c: number) => {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c >= gridSize - 7) return true;
    if (r >= gridSize - 7 && c < 7) return true;
    return false;
  };

  const isCenterLogoZone = (r: number, c: number) => {
    return r >= 8 && r <= 12 && c >= 8 && c <= 12;
  };

  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const dots: { key: string; cx: number; cy: number; r: number; fill: string }[] = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (isFinderZone(r, c) || isCenterLogoZone(r, c)) continue;
      const charCode = value.charCodeAt((r * gridSize + c) % Math.max(1, value.length));
      const active = ((charCode * 17 + r * 31 + c * 13 + (hash & 0xff)) % 10) < 5;
      if (active) {
        dots.push({
          key: `${r}-${c}`,
          cx: (c + 0.5) * cell,
          cy: (r + 0.5) * cell,
          r: cell * 0.4,
          fill: (r + c) % 5 === 0 ? accentColor : primaryColor,
        });
      }
    }
  }

  const renderFinderEye = (startR: number, startC: number, key: string) => {
    const x = startC * cell;
    const y = startR * cell;
    const outer = 7 * cell;
    const inner = 3 * cell;
    const innerOffset = 2 * cell;
    return (
      <React.Fragment key={key}>
        <Rect
          x={x + cell * 0.4}
          y={y + cell * 0.4}
          width={outer - cell * 0.8}
          height={outer - cell * 0.8}
          rx={cell * 1.8}
          fill="none"
          stroke={primaryColor}
          strokeWidth={cell * 0.95}
        />
        <Rect
          x={x + innerOffset}
          y={y + innerOffset}
          width={inner}
          height={inner}
          rx={cell * 0.9}
          fill={accentColor}
        />
      </React.Fragment>
    );
  };

  const centerPos = 8.2 * cell;
  const centerSize = 4.6 * cell;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect width={size} height={size} rx={size * 0.1} fill="#FFFFFF" />
      {renderFinderEye(0, 0, 'eye-tl')}
      {renderFinderEye(0, gridSize - 7, 'eye-tr')}
      {renderFinderEye(gridSize - 7, 0, 'eye-bl')}
      {dots.map((d) => (
        <Circle key={d.key} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} />
      ))}
      <Rect
        x={centerPos}
        y={centerPos}
        width={centerSize}
        height={centerSize}
        rx={cell * 1.2}
        fill={primaryColor}
        stroke="#FFFFFF"
        strokeWidth={cell * 0.4}
      />
      <SvgText
        x={size / 2}
        y={size / 2 + cell * 0.55}
        fill="#FFFFFF"
        fontSize={cell * 1.65}
        fontWeight="900"
        textAnchor="middle"
      >
        {badgeText}
      </SvgText>
    </Svg>
  );
};
