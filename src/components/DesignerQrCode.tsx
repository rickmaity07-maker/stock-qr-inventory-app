import React, { useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require('qrcode');

interface DesignerQrCodeProps {
  value: string;
  size?: number;
  primaryColor?: string;
  accentColor?: string;
  badgeText?: string;
}

/**
 * Builds a standard QR code matrix (error correction level M) for any text length,
 * using the `qrcode` library. Returned as rows of booleans (true = dark module).
 */
export function generateRealQrMatrix(text: string): boolean[][] {
  const qr = QRCode.create(text || 'STK-0000', { errorCorrectionLevel: 'M' });
  const size: number = qr.modules.size;
  const rows: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(Boolean(qr.modules.get(r, c)));
    rows.push(row);
  }
  return rows;
}

/** True for the 3x3 centre of each of the three finder "eyes" (drawn in the accent colour). */
export function isFinderCenter(r: number, c: number, size: number): boolean {
  const inBand = (v: number, start: number) => v >= start + 2 && v <= start + 4;
  return (
    (inBand(r, 0) && inBand(c, 0)) ||
    (inBand(r, 0) && inBand(c, size - 7)) ||
    (inBand(r, size - 7) && inBand(c, 0))
  );
}

export const DesignerQrCode: React.FC<DesignerQrCodeProps> = ({
  value,
  size = 120,
  primaryColor = '#1C1C1E',
  accentColor = '#007AFF',
}) => {
  const matrix = useMemo(() => generateRealQrMatrix(value || 'STK-0000'), [value]);
  const gridSize = matrix.length;
  const quietZone = 4;
  const totalModules = gridSize + quietZone * 2;
  const cell = size / totalModules;

  const rects: { key: string; x: number; y: number; fill: string }[] = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (matrix[r][c]) {
        rects.push({
          key: `${r}-${c}`,
          x: (c + quietZone) * cell,
          y: (r + quietZone) * cell,
          fill: isFinderCenter(r, c, gridSize) ? accentColor : primaryColor,
        });
      }
    }
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect width={size} height={size} rx={size * 0.08} fill="#FFFFFF" />
      {rects.map((item) => (
        <Rect
          key={item.key}
          x={item.x}
          y={item.y}
          width={cell + 0.35}
          height={cell + 0.35}
          fill={item.fill}
        />
      ))}
    </Svg>
  );
};
