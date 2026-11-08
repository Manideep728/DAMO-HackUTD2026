import { useMemo } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cx } from '../components/ui';
import type { Facility, FNode, NodeState, SimResult } from './api';

const COL = 148;
const ROW = 118;
const LAYER_NAMES = ['Utility and generators', 'Transfer switches', 'Switchgear', 'UPS and panels', 'PDUs and plant', 'Chilled-water loop', 'CRAHs', 'Racks', 'Workloads'];

export type MapNodeData = {
  n: FNode; state: NodeState; toggled: boolean; highlight: boolean; shared: boolean; critical: boolean;
  margin: number | null; onToggle: (id: string) => void;
};

const STATE_STYLE: Record<NodeState, string> = {
  operational: 'border-border bg-surface',
  degraded: 'border-warning bg-warning/10',
  maintenance: 'border-watch bg-watch/15',
  failed: 'border-critical bg-critical/12',
};
const STATE_WORD: Record<NodeState, string> = { operational: 'OK', degraded: 'Degraded', maintenance: 'Maintenance', failed: 'Down' };

function EquipmentNode({ data }: NodeProps<Node<MapNodeData>>) {
  const { n, state, toggled, highlight, shared, critical, margin } = data;
  return (
    <button
      type="button"
      data-testid={`node-${n.id}`}
      data-state={state}
      onClick={() => data.onToggle(n.id)}
      title={`${n.label} (${n.type}). Click to cycle: in service → maintenance → failed.`}
      className={cx('w-[132px] rounded-lg border-2 px-2 py-1.5 text-left t hover:border-border-strong', STATE_STYLE[state],
        highlight && '!border-critical ring-2 ring-critical/40', shared && !highlight && '!border-untrusted ring-2 ring-untrusted/40',
        toggled && 'shadow-[var(--shadow)]')}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="flex items-center gap-1">
        <span className="mono text-[11.5px] font-semibold truncate">{n.id}</span>
        {critical && <span className="ml-auto text-[9.5px] font-semibold text-accent" title="Critical service">CRIT</span>}
      </div>
      <div className="text-[10.5px] text-muted truncate">{n.label}</div>
      <div className="flex items-center gap-1 mt-0.5 text-[10px]">
        <span className={cx('font-semibold uppercase tracking-wide', state === 'failed' ? 'text-critical' : state === 'maintenance' ? 'text-watch' : state === 'degraded' ? 'text-warning' : 'text-ok')}>{STATE_WORD[state]}</span>
        {margin !== null && n.capacity > 0 && <span className="ml-auto mono text-faint">{Math.round(margin)} kW spare</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </button>
  );
}

const nodeTypes = { equipment: EquipmentNode };

export function DependencyMap({ facility, sim, toggles, highlight, shared, zone, onToggle }: {
  facility: Facility; sim: SimResult | null; toggles: Record<string, string>; highlight: Set<string>; shared: Set<string>;
  zone: string; onToggle: (id: string) => void;
}) {
  const visible = useMemo(() => new Set(facility.nodes.filter((n) => zone === 'all' || n.zone === zone).map((n) => n.id)), [facility, zone]);

  const positions = useMemo(() => {
    const byLayer = new Map<number, FNode[]>();
    for (const n of facility.nodes) if (visible.has(n.id)) byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n]);
    const widest = Math.max(...[...byLayer.values()].map((l) => l.length));
    const pos: Record<string, { x: number; y: number }> = {};
    [...byLayer.keys()].sort((a, b) => a - b).forEach((layer, row) => {
      const items = byLayer.get(layer)!.sort((a, b) => a.zone.localeCompare(b.zone) || a.id.localeCompare(b.id, undefined, { numeric: true }));
      const offset = ((widest - items.length) * COL) / 2;
      items.forEach((n, i) => { pos[n.id] = { x: offset + i * COL, y: row * ROW }; });
    });
    return pos;
  }, [facility, visible]);

  const nodes: Node<MapNodeData>[] = facility.nodes.filter((n) => visible.has(n.id)).map((n) => ({
    id: n.id, type: 'equipment', position: positions[n.id], draggable: false,
    data: {
      n, state: sim?.nodes[n.id]?.state ?? 'operational', toggled: n.id in toggles, highlight: highlight.has(n.id),
      shared: shared.has(n.id), critical: facility.critical_services.includes(n.id), margin: sim?.nodes[n.id]?.margin_kw ?? null, onToggle,
    },
  }));

  const edges: Edge[] = [...facility.edges, ...facility.suspected]
    .filter((e) => visible.has(e.consumer) && visible.has(e.supplier) && e.status !== 'rejected')
    .map((e, i) => {
      const suspected = e.status === 'suspected';
      const fromRecords = e.source === 'engineer_confirmed';
      const down = sim && sim.nodes[e.supplier] && ['failed', 'maintenance'].includes(sim.nodes[e.supplier].state);
      const color = suspected || fromRecords ? 'var(--untrusted)' : e.resource === 'cooling' ? 'var(--accent)' : 'var(--legacy)';
      return {
        id: `${e.supplier}->${e.consumer}:${e.group}:${i}`, source: e.supplier, target: e.consumer,
        style: { stroke: color, strokeWidth: suspected || fromRecords ? 2.2 : 1.2, strokeDasharray: suspected ? '6 4' : undefined, opacity: down ? 0.25 : 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        label: suspected ? 'suspected' : fromRecords ? 'from records' : undefined,
        labelStyle: { fill: 'var(--untrusted)', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--surface)' },
      };
    });

  const rows = [...new Set(facility.nodes.filter((n) => visible.has(n.id)).map((n) => n.layer))].sort((a, b) => a - b);
  return (
    <div className="relative h-full min-h-[520px] rounded-xl border hairline bg-surface overflow-hidden" aria-label="Dependency map">
      <ReactFlow key={`${zone}:${facility.name}:${facility.nodes.length}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.08 }}
        minZoom={0.15} maxZoom={1.6} nodesConnectable={false} proOptions={{ hideAttribution: true }}>
        <Background gap={24} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="pointer-events-none absolute left-3 top-3 grid gap-0.5 text-[10.5px] text-faint">
        {rows.map((l) => <span key={l}>{l + 1}. {LAYER_NAMES[l]}</span>)}
      </div>
    </div>
  );
}
