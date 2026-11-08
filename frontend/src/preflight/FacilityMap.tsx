import { memo, useMemo } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Zap, Fuel, ArrowLeftRight, ToggleRight, BatteryCharging, Plug, Snowflake, Waves, Droplets, Fan, Server, Cpu, Box } from 'lucide-react';
import { cx } from '../components/ui';
import type { Facility, FNode, NodeState, SimResult } from './api';

/** Power and cooling flow left to right: utility → workloads. One column per layer, so every label stays readable. */
const COL_W = 122, NODE_W = 106, NODE_H = 38, PITCH = 46;
export const LAYERS = ['Utility', 'Transfer', 'Switchgear', 'UPS · MCC', 'PDU · plant', 'CHW loop', 'CRAH', 'Racks', 'Workloads'];
const ICON: Record<string, typeof Zap> = {
  utility_feed: Zap, generator: Fuel, ats: ArrowLeftRight, switchgear: ToggleRight, ups: BatteryCharging, rpp: Plug, pdu: Plug,
  chiller: Snowflake, pump: Waves, cooling_loop: Droplets, crah: Fan, rack: Server, workload: Cpu,
};

export type FocusKind = 'none' | 'chain' | 'dim';
export type MapNodeData = {
  n: FNode; state: NodeState; lost: boolean; toggled: string | null; selected: boolean; picked: boolean; focus: FocusKind;
  headroom: number | null; delay: number; critical: boolean;
  onSelect: (id: string) => void; onHover: (id: string | null) => void;
};

const EquipmentNode = memo(function EquipmentNode({ data }: NodeProps<Node<MapNodeData>>) {
  const { n, state, lost, toggled, selected, picked, focus, headroom, delay, critical } = data;
  const I = ICON[n.type] ?? Box;
  const tone = toggled === 'failed' || lost ? 'down' : toggled === 'maintenance' ? 'maint' : state === 'failed' ? 'down' : state === 'maintenance' ? 'maint' : state === 'degraded' ? 'degraded' : 'ok';
  return (
    <button
      type="button"
      style={{ transitionDelay: `${delay}ms`, width: NODE_W, height: NODE_H }}
      className={cx('fm-node relative rounded-lg px-2 text-left', `fm-${tone}`, selected && 'fm-selected', picked && 'fm-picked', focus === 'dim' && 'fm-dim', focus === 'chain' && 'fm-chain')}
      aria-label={`${n.label}, ${tone === 'ok' ? 'in service' : tone}`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1 !min-w-0 !min-h-0 !border-0" />
      <div className="flex items-center gap-1 h-[22px]">
        <I size={12} className="shrink-0 opacity-80" aria-hidden />
        <span className="mono text-[10.5px] font-semibold truncate">{n.id}</span>
        {critical && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--panel-accent)] shrink-0" title="Critical service" />}
      </div>
      <div className="h-[3px] rounded-full bg-[var(--panel-3)] overflow-hidden">
        <div className="fm-bar h-full rounded-full" style={{ width: `${headroom === null ? 100 : Math.max(4, Math.min(100, headroom * 100))}%`, transitionDelay: `${delay}ms` }} />
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1 !min-w-0 !min-h-0 !border-0" />
    </button>
  );
});

const LabelNode = memo(function LabelNode({ data }: NodeProps<Node<{ text: string }>>) {
  return <div className="text-[10.5px] font-medium tracking-wide text-[var(--panel-muted)] whitespace-nowrap" style={{ width: NODE_W }}>{data.text}</div>;
});

const nodeTypes = { equipment: EquipmentNode, label: LabelNode };

export interface MapProps {
  facility: Facility; sim: SimResult | null; toggles: Record<string, string>; selected: string | null; hover: string | null;
  picked: Set<string>; onSelect: (id: string) => void; onHover: (id: string | null) => void;
}

export function FacilityMap({ facility, sim, toggles, selected, hover, picked, onSelect, onHover }: MapProps) {
  const graph = useMemo(() => {
    const live = [...facility.edges, ...facility.suspected].filter((e) => e.status !== 'rejected');
    const up = new Map<string, string[]>(), down = new Map<string, string[]>();
    for (const e of live) { up.set(e.consumer, [...(up.get(e.consumer) ?? []), e.supplier]); down.set(e.supplier, [...(down.get(e.supplier) ?? []), e.consumer]); }
    return { live, up, down };
  }, [facility]);

  const walk = (start: string, adj: Map<string, string[]>) => {
    const seen = new Set<string>([start]); const q = [start];
    while (q.length) { const x = q.shift()!; for (const y of adj.get(x) ?? []) if (!seen.has(y)) { seen.add(y); q.push(y); } }
    return seen;
  };
  const focusId = hover ?? selected;
  const chain = useMemo(() => (focusId ? new Set([...walk(focusId, graph.up), ...walk(focusId, graph.down)]) : null), [focusId, graph]);

  // Cascade timing: how many hops downstream of a changed node, so failures ripple outward.
  const depth = useMemo(() => {
    const d = new Map<string, number>(); const q: string[] = [];
    for (const id of Object.keys(toggles)) { d.set(id, 0); q.push(id); }
    while (q.length) { const x = q.shift()!; for (const y of graph.down.get(x) ?? []) if (!d.has(y)) { d.set(y, d.get(x)! + 1); q.push(y); } }
    return d;
  }, [toggles, graph]);

  const positions = useMemo(() => {
    const byLayer = new Map<number, FNode[]>();
    for (const n of facility.nodes) byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n]);
    const tallest = Math.max(...[...byLayer.values()].map((l) => l.length));
    const H = tallest * PITCH;
    const pos: Record<string, { x: number; y: number }> = {};
    for (const [layer, items] of byLayer) {
      items.sort((a, b) => a.zone.localeCompare(b.zone) || a.id.localeCompare(b.id, undefined, { numeric: true }));
      const pitch = H / items.length;
      items.forEach((n, i) => { pos[n.id] = { x: layer * COL_W, y: (i + 0.5) * pitch - NODE_H / 2 }; });
    }
    return pos;
  }, [facility]);

  const lost = useMemo(() => new Set(sim?.lost ?? []), [sim]);
  const nodes: Node[] = [
    ...LAYERS.map((text, i) => ({ id: `label-${i}`, type: 'label', position: { x: i * COL_W, y: -26 }, data: { text }, draggable: false, selectable: false, focusable: false, ariaRole: 'presentation' })),
    ...facility.nodes.map((n): Node<MapNodeData> => {
      const st = sim?.nodes[n.id];
      const headroom = st && st.margin_kw !== null && n.capacity > 0 ? st.margin_kw / n.capacity : null;
      return {
        id: n.id, type: 'equipment', position: positions[n.id], draggable: false,
        data: {
          n, state: st?.state ?? 'operational', lost: lost.has(n.id), toggled: toggles[n.id] ?? null, selected: selected === n.id, picked: picked.has(n.id),
          focus: !chain ? 'none' : chain.has(n.id) ? 'chain' : 'dim', headroom, delay: (depth.get(n.id) ?? 0) * 120,
          critical: facility.critical_services.includes(n.id), onSelect, onHover,
        },
      };
    }),
  ];

  const edges: Edge[] = graph.live.map((e, i) => {
    const suspected = e.status === 'suspected' || e.source === 'engineer_confirmed';
    const supplier = sim?.nodes[e.supplier]?.state;
    const broken = !!toggles[e.supplier] || supplier === 'failed' || supplier === 'maintenance';
    const inChain = chain ? chain.has(e.supplier) && chain.has(e.consumer) : false;
    const color = broken ? 'var(--critical)' : suspected ? 'var(--untrusted)' : e.resource === 'cooling' ? 'var(--panel-accent)' : 'var(--panel-muted)';
    const opacity = chain ? (inChain ? 0.95 : 0.05) : suspected ? 0.9 : broken ? 0.55 : 0.2;
    return {
      id: `${e.supplier}->${e.consumer}:${i}`, source: e.supplier, target: e.consumer, animated: inChain && !broken,
      style: { stroke: color, strokeWidth: inChain || suspected ? 1.8 : 1, strokeDasharray: suspected ? '5 4' : broken ? '3 4' : undefined, opacity, transition: 'opacity .25s ease, stroke .4s ease' },
      markerEnd: inChain || suspected ? { type: MarkerType.ArrowClosed, color, width: 12, height: 12 } : undefined,
      label: suspected && (!chain || inChain) ? 'suspected · 97%' : undefined,
      labelStyle: { fill: 'var(--untrusted)', fontSize: 10, fontWeight: 600 }, labelBgStyle: { fill: 'var(--panel)' }, labelBgPadding: [4, 2] as [number, number],
    };
  });

  return (
    <div className="fm relative h-full w-full" aria-label="Dependency map: power and cooling flow left to right">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.06 }} minZoom={0.4} maxZoom={2}
        nodesConnectable={false} nodesDraggable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }} onPaneClick={() => onSelect('')}
        onNodeClick={(_, nd) => { if (nd.type === 'equipment') onSelect(nd.id); }}
        onNodeMouseEnter={(_, nd) => { if (nd.type === 'equipment') onHover(nd.id); }}
        onNodeMouseLeave={() => onHover(null)}>
        <Background gap={22} size={1} color="var(--panel-border)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
