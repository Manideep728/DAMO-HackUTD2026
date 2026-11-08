import { memo, useMemo } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Zap, Fuel, ArrowLeftRight, ToggleRight, BatteryCharging, Plug, Snowflake, Waves, Droplets, Fan, Server, Cpu, Box, Rows3 } from 'lucide-react';
import { cx } from '../components/ui';
import type { Facility, FEdge, FNode, NodeState, SimResult } from './api';

/**
 * Power and cooling flow left to right: utility → workloads, one column per layer.
 * Racks are grouped by row ("Row R1 · 8 racks") until a row is expanded, which removes the fan of crossing links
 * and lets every node be large enough to read and tap on an iPad (≥ 44 pt at the default zoom).
 */
const COL_W = 156, NODE_W = 132, NODE_H = 56, PITCH = 76;
export const LAYERS = ['Utility', 'Transfer', 'Switchgear', 'UPS · MCC', 'PDU · plant', 'CHW loop', 'CRAH', 'Racks', 'Workloads'];
const ICON: Record<string, typeof Zap> = {
  utility_feed: Zap, generator: Fuel, ats: ArrowLeftRight, switchgear: ToggleRight, ups: BatteryCharging, rpp: Plug, pdu: Plug,
  chiller: Snowflake, pump: Waves, cooling_loop: Droplets, crah: Fan, rack: Server, workload: Cpu, rack_group: Rows3,
};
export const rowOf = (id: string) => id.split('-')[0];            // R1-03 → R1
export const groupId = (row: string) => `row:${row}`;

export type Tone = 'ok' | 'degraded' | 'maint' | 'down';
export const TONE_WORD: Record<Tone, string> = { ok: 'OK', degraded: 'Degraded', maint: 'Maintenance', down: 'Down' };

export function toneOf(id: string, sim: SimResult | null, toggles: Record<string, string>): Tone {
  const t = toggles[id]; if (t === 'failed') return 'down'; if (t === 'maintenance') return 'maint';
  if (sim?.lost.includes(id)) return 'down';
  const s: NodeState | undefined = sim?.nodes[id]?.state;
  return s === 'failed' ? 'down' : s === 'maintenance' ? 'maint' : s === 'degraded' ? 'degraded' : 'ok';
}
const RANK: Record<Tone, number> = { ok: 0, degraded: 1, maint: 2, down: 3 };

export type MapNodeData = {
  id: string; label: string; type: string; tone: Tone; members?: { total: number; down: number; degraded: number };
  selected: boolean; picked: boolean; focus: 'none' | 'chain' | 'dim'; headroom: number | null; spareKw: number | null; delay: number; critical: boolean;
};

const EquipmentNode = memo(function EquipmentNode({ data }: NodeProps<Node<MapNodeData>>) {
  const { id, type, tone, members, selected, picked, focus, headroom, spareKw, delay, critical } = data;
  const I = ICON[type] ?? Box;
  const group = type === 'rack_group';
  const word = group && members
    ? (members.down ? `${members.down} of ${members.total} down` : members.degraded ? `${members.degraded} of ${members.total} degraded` : `${members.total} racks · OK`)
    : TONE_WORD[tone];
  return (
    <div style={{ transitionDelay: `${delay}ms`, width: NODE_W, height: NODE_H }}
      className={cx('fm-node relative rounded-xl px-2.5 py-1.5 text-left', `fm-${tone}`, group && 'fm-group', selected && 'fm-selected', picked && 'fm-picked', focus === 'dim' && 'fm-dim')}
      aria-label={`${data.label}: ${word}`}>
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1 !min-w-0 !min-h-0 !border-0" />
      <div className="flex items-center gap-1.5">
        <I size={14} className="shrink-0 opacity-85" aria-hidden />
        <span className="mono text-[13px] font-semibold truncate">{group ? `Row ${id.slice(4)}` : id}</span>
        {critical && <span className="ml-auto h-2 w-2 rounded-full bg-[var(--panel-accent)] shrink-0" title="Critical service" />}
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className={cx('text-[11px] font-semibold uppercase tracking-wide truncate', `fm-word-${tone}`)}>{word}</span>
        {spareKw !== null && !group && <span className="ml-auto mono text-[10.5px] text-[var(--panel-muted)] shrink-0">{Math.round(spareKw)} kW</span>}
      </div>
      <div className="absolute left-2.5 right-2.5 bottom-1.5 h-[3px] rounded-full bg-[var(--panel-3)] overflow-hidden">
        <div className="fm-bar h-full rounded-full" style={{ width: `${headroom === null ? 100 : Math.max(4, Math.min(100, headroom * 100))}%`, transitionDelay: `${delay}ms` }} />
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1 !min-w-0 !min-h-0 !border-0" />
    </div>
  );
});

const LabelNode = memo(function LabelNode({ data }: NodeProps<Node<{ text: string }>>) {
  return <div className="text-[12px] font-semibold tracking-wide text-[var(--panel-muted)] whitespace-nowrap" style={{ width: NODE_W }}>{data.text}</div>;
});
const nodeTypes = { equipment: EquipmentNode, label: LabelNode };

/** The displayed graph: racks folded into row groups unless their row is expanded. Shared with the trace view. */
export function displayGraph(facility: Facility, expanded: Set<string>) {
  const mapId = (id: string) => { const n = facility.nodes.find((x) => x.id === id); return n && n.type === 'rack' && !expanded.has(rowOf(id)) ? groupId(rowOf(id)) : id; };
  const groups = new Map<string, FNode[]>();
  for (const n of facility.nodes) if (n.type === 'rack' && !expanded.has(rowOf(n.id))) groups.set(groupId(rowOf(n.id)), [...(groups.get(groupId(rowOf(n.id))) ?? []), n]);
  const nodes: FNode[] = [
    ...facility.nodes.filter((n) => !(n.type === 'rack' && !expanded.has(rowOf(n.id)))),
    ...[...groups].map(([gid, ms]): FNode => ({ ...ms[0], id: gid, type: 'rack_group', label: `Row ${gid.slice(4)} (${ms.length} racks)`, capacity: ms.reduce((a, m) => a + m.capacity, 0) })),
  ];
  const seen = new Map<string, FEdge>();
  for (const e of [...facility.edges, ...facility.suspected]) {
    if (e.status === 'rejected') continue;
    const s = mapId(e.supplier), c = mapId(e.consumer);
    if (s === c) continue;
    const k = `${s}>${c}>${e.resource ?? e.group}`;
    const prev = seen.get(k);
    if (!prev || (e.status === 'suspected' && prev.status !== 'suspected')) seen.set(k, { ...e, supplier: s, consumer: c });
  }
  return { nodes, edges: [...seen.values()], groups, mapId };
}

export interface MapProps {
  facility: Facility; sim: SimResult | null; toggles: Record<string, string>; selected: string | null; hover: string | null;
  picked: Set<string>; expanded: Set<string>; onSelect: (id: string) => void; onHover: (id: string | null) => void;
}

export function FacilityMap({ facility, sim, toggles, selected, hover, picked, expanded, onSelect, onHover }: MapProps) {
  const g = useMemo(() => displayGraph(facility, expanded), [facility, expanded]);
  const adj = useMemo(() => {
    const up = new Map<string, string[]>(), down = new Map<string, string[]>();
    for (const e of g.edges) { up.set(e.consumer, [...(up.get(e.consumer) ?? []), e.supplier]); down.set(e.supplier, [...(down.get(e.supplier) ?? []), e.consumer]); }
    return { up, down };
  }, [g]);
  const walk = (start: string, a: Map<string, string[]>) => {
    const seen = new Set<string>([start]); const q = [start];
    while (q.length) { const x = q.shift()!; for (const y of a.get(x) ?? []) if (!seen.has(y)) { seen.add(y); q.push(y); } }
    return seen;
  };
  const focusId = hover ?? selected;
  const chain = useMemo(() => (focusId && g.nodes.some((n) => n.id === focusId) ? new Set([...walk(focusId, adj.up), ...walk(focusId, adj.down)]) : null), [focusId, adj, g]);

  const tones = useMemo(() => {
    const t = new Map<string, Tone>();
    for (const n of facility.nodes) t.set(n.id, toneOf(n.id, sim, toggles));
    return t;
  }, [facility, sim, toggles]);
  const toneFor = (n: FNode): Tone => n.type === 'rack_group'
    ? (g.groups.get(n.id) ?? []).map((m) => tones.get(m.id) ?? 'ok').reduce<Tone>((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok')
    : tones.get(n.id) ?? 'ok';

  // Scenario focus: with a change active and nothing selected, only affected equipment stays lit.
  const active = Object.keys(toggles).length > 0;

  const depth = useMemo(() => {
    const d = new Map<string, number>(); const q: string[] = [];
    for (const id of Object.keys(toggles)) { const m = g.mapId(id); d.set(m, 0); q.push(m); }
    while (q.length) { const x = q.shift()!; for (const y of adj.down.get(x) ?? []) if (!d.has(y)) { d.set(y, d.get(x)! + 1); q.push(y); } }
    return d;
  }, [toggles, adj, g]);

  const positions = useMemo(() => {
    const byLayer = new Map<number, FNode[]>();
    for (const n of g.nodes) byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n]);
    const tallest = Math.max(...[...byLayer.values()].map((l) => l.length));
    const H = Math.max(tallest, 6) * PITCH;
    const pos: Record<string, { x: number; y: number }> = {};
    for (const [layer, items] of byLayer) {
      items.sort((a, b) => a.zone.localeCompare(b.zone) || a.id.localeCompare(b.id, undefined, { numeric: true }));
      const pitch = H / items.length;
      items.forEach((n, i) => { pos[n.id] = { x: layer * COL_W, y: (i + 0.5) * pitch - NODE_H / 2 }; });
    }
    return pos;
  }, [g]);

  const nodes: Node[] = [
    ...LAYERS.map((text, i) => ({ id: `label-${i}`, type: 'label', position: { x: i * COL_W, y: -34 }, data: { text }, draggable: false, selectable: false, focusable: false, ariaRole: 'presentation' })),
    ...g.nodes.map((n): Node<MapNodeData> => {
      const members = n.type === 'rack_group' ? g.groups.get(n.id) ?? [] : [];
      const st = n.type === 'rack_group' ? undefined : sim?.nodes[n.id];
      const headroom = n.type === 'rack_group'
        ? (members.length ? Math.min(...members.map((m) => { const s = sim?.nodes[m.id]; return s && s.margin_kw !== null && m.capacity ? s.margin_kw / m.capacity : 1; })) : null)
        : st && st.margin_kw !== null && n.capacity > 0 ? st.margin_kw / n.capacity : null;
      const tone = toneFor(n);
      const focus = chain ? (chain.has(n.id) ? 'chain' : 'dim') : active && tone === 'ok' ? 'dim' : 'none';
      return {
        id: n.id, type: 'equipment', position: positions[n.id], draggable: false,
        data: {
          id: n.id, label: n.label, type: n.type, tone,
          members: members.length ? { total: members.length, down: members.filter((m) => tones.get(m.id) === 'down').length, degraded: members.filter((m) => tones.get(m.id) === 'degraded').length } : undefined,
          selected: selected === n.id, picked: picked.has(n.id) || members.some((m) => picked.has(m.id)), focus, headroom,
          spareKw: st && st.margin_kw !== null && n.capacity > 0 ? st.margin_kw : null, delay: (depth.get(n.id) ?? 0) * 120,
          critical: facility.critical_services.includes(n.id) || members.some((m) => facility.critical_services.includes(m.id)),
        },
      };
    }),
  ];

  const edges: Edge[] = g.edges.map((e, i) => {
    const suspected = e.status === 'suspected' || e.source === 'engineer_confirmed';
    const supTone = e.supplier.startsWith('row:') ? 'ok' : tones.get(e.supplier);
    const broken = supTone === 'down' || supTone === 'maint';
    const inChain = chain ? chain.has(e.supplier) && chain.has(e.consumer) : false;
    const color = broken ? 'var(--critical)' : suspected ? 'var(--untrusted)' : e.resource === 'cooling' ? 'var(--panel-accent)' : 'var(--panel-muted)';
    const opacity = chain ? (inChain ? 0.95 : 0.04) : active ? (broken ? 0.75 : 0.08) : suspected ? 0.9 : 0.3;
    return {
      id: `${e.supplier}->${e.consumer}:${i}`, source: e.supplier, target: e.consumer, animated: inChain && !broken,
      style: { stroke: color, strokeWidth: inChain || suspected || broken ? 2.2 : 1.4, strokeDasharray: suspected ? '6 5' : broken ? '4 5' : undefined, opacity, transition: 'opacity .25s ease, stroke .4s ease' },
      markerEnd: inChain || suspected ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 } : undefined,
      label: suspected && (!chain || inChain) ? 'suspected · 97%' : undefined,
      labelStyle: { fill: 'var(--untrusted)', fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: 'var(--panel)' }, labelBgPadding: [4, 2] as [number, number],
    };
  });

  return (
    <div className="fm relative h-full w-full" aria-label="Dependency map: power and cooling flow left to right">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.05, minZoom: 0.5 }} minZoom={0.35} maxZoom={2}
        nodesConnectable={false} nodesDraggable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }} onPaneClick={() => onSelect('')}
        onNodeClick={(_, nd) => { if (nd.type === 'equipment') onSelect(nd.id); }}
        onNodeMouseEnter={(_, nd) => { if (nd.type === 'equipment') onHover(nd.id); }}
        onNodeMouseLeave={() => onHover(null)}>
        <Background gap={24} size={1} color="var(--panel-border)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
