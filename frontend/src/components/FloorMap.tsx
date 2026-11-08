import { cx } from './ui';

export interface MapHighlight { kind: 'rack' | 'unit' | 'row' | 'config'; id: string; label?: string }
const rows = ['A', 'B', 'C', 'D'] as const;
const GPU = new Set(['D6', 'D7', 'D8']);
const baseTemp: Record<string, number> = { B7: 26.1, B6: 25.2, B8: 25.4, A4: 23.1, D6: 24.6, D7: 24.8, D8: 24.5 };
const temp = (id: string) => baseTemp[id] ?? +(22 + ((id.charCodeAt(0) * 7 + parseInt(id.slice(1))) % 23) / 10).toFixed(1);

/** Grey by default. Only the highlighted target gets colour; B7 is always drawn untrusted. */
export function FloorMap({ highlight, compact }: { highlight?: MapHighlight; compact?: boolean }) {
  const tileW = 56, tileH = compact ? 56 : 72, gapX = 6, rowGap = 26, left = 70, top = 28;
  const W = left + 10 * (tileW + gapX) + 110, H = top + 4 * (tileH + rowGap) + 10;
  const rowY = (ri: number) => top + ri * (tileH + rowGap);
  const isHi = (kind: string, id: string) => highlight && highlight.kind === kind && highlight.id === id;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Hall 1 floor map, four rows of ten racks">
      {[0, 2].map((ri) => <g key={ri}><rect x={left - 4} y={rowY(ri) + tileH + 2} width={10 * (tileW + gapX)} height={rowGap - 4} fill="var(--accent)" opacity={0.05} /><text x={left} y={rowY(ri) + tileH + rowGap / 2 + 3} fontSize="9.5" fill="var(--text-muted)">Cold aisle {ri / 2 + 1}</text></g>)}
      <rect x={left - 4} y={rowY(1) + tileH + 2} width={10 * (tileW + gapX)} height={rowGap - 4} fill="var(--warning)" opacity={0.05} /><text x={left} y={rowY(1) + tileH + rowGap / 2 + 3} fontSize="9.5" fill="var(--text-muted)">Hot aisle</text>
      {rows.map((r, ri) => (
        <g key={r}>
          <text x={14} y={rowY(ri) + tileH / 2 + 4} fontSize="13" fontWeight={600} fill="var(--text-muted)">Row {r}</text>
          {Array.from({ length: 10 }, (_, i) => {
            const id = `${r}${i + 1}`, x = left + i * (tileW + gapX), y = rowY(ri);
            const decom = id === 'D10', untrusted = id === 'B7', hi = isHi('rack', id) || isHi('row', r);
            return (
              <g key={id} className="t">
                <rect x={x} y={y} width={tileW} height={tileH} rx={4} fill={decom ? 'none' : 'var(--surface-2)'} stroke={hi ? 'var(--accent)' : untrusted ? 'var(--untrusted)' : 'var(--border)'} strokeWidth={hi ? 2 : untrusted ? 1.5 : 1} strokeDasharray={untrusted ? '4 3' : undefined} />
                {decom && <rect x={x} y={y} width={tileW} height={tileH} rx={4} fill="url(#hatch)" opacity={0.6} />}
                <text x={x + 6} y={y + 13} fontSize="10" fill="var(--text-muted)">{id}{GPU.has(id) ? ' ·GPU' : ''}</text>
                {decom ? <text x={x + tileW / 2} y={y + tileH / 2 + 4} textAnchor="middle" fontSize="10" fill="var(--text-muted)">Decom.</text>
                  : untrusted ? <><text x={x + tileW / 2} y={y + tileH / 2 + (compact ? 2 : 0)} textAnchor="middle" fontSize={compact ? 12 : 15} fill="var(--untrusted)" className="mono" textDecoration="line-through">36.1</text><text x={x + tileW / 2} y={y + tileH - 8} textAnchor="middle" fontSize="9.5" fill="var(--untrusted)">est 26.1</text></>
                  : <text x={x + tileW / 2} y={y + tileH / 2 + 6} textAnchor="middle" fontSize={compact ? 13 : 16} fill={hi ? 'var(--text)' : 'var(--text-muted)'} className="mono">{temp(id).toFixed(1)}</text>}
              </g>
            );
          })}
          {(() => { const id = `CU-${r}`, x = left + 10 * (tileW + gapX) + 8, y = rowY(ri), hi = isHi('unit', id); return (
            <g key={id}>
              <rect x={x} y={y} width={92} height={tileH} rx={4} fill="var(--surface-2)" stroke={hi ? 'var(--accent)' : 'var(--border)'} strokeWidth={hi ? 2 : 1} />
              <text x={x + 8} y={y + 14} fontSize="10.5" fontWeight={600} fill="var(--text)">{id}</text>
              <text x={x + 8} y={y + 30} fontSize="10" fill="var(--text-muted)">Running</text>
              {hi && highlight?.label && <text x={x + 8} y={y + 46} fontSize="9.5" fill="var(--accent)" fontWeight={600}>{highlight.label}</text>}
            </g>); })()}
        </g>
      ))}
      {highlight && highlight.kind === 'rack' && highlight.label && (() => { const ri = rows.indexOf(highlight.id[0] as 'A'), i = parseInt(highlight.id.slice(1)) - 1; const x = left + i * (tileW + gapX), y = rowY(ri); return <g><rect x={x - 2} y={y - 18} width={Math.max(highlight.label.length * 6 + 10, tileW + 4)} height={15} rx={3} fill="var(--accent)" /><text x={x + 3} y={y - 7} fontSize="10" fontWeight={600} fill="var(--accent-ink)">{highlight.label}</text></g>; })()}
      <defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--border)" strokeWidth="2" /></pattern></defs>
      <text x={W - 4} y={H - 2} textAnchor="end" fontSize="9.5" fill="var(--text-muted)" className={cx('mono')}>Hall 1 · reported inlet °C</text>
    </svg>
  );
}
