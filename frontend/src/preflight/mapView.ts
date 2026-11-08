import type { Facility } from './api';

/** Above this many nodes the whole site is too small to read, so the page opens on one hall. */
export const LARGE_SITE = 80;

/** A zone's equipment plus everything it depends on upstream, so the path from a failure to a rack stays
 * visible when you zoom to one hall. `feeders` are the upstream nodes outside the zone (drawn dimmed). */
export function visibleNodes(facility: Facility, zone: string): { all: Set<string>; feeders: Set<string> } {
  if (zone === 'all') return { all: new Set(facility.nodes.map((n) => n.id)), feeders: new Set() };
  const inZone = new Set(facility.nodes.filter((n) => n.zone === zone).map((n) => n.id));
  const suppliers = new Map<string, string[]>();
  for (const e of [...facility.edges, ...facility.suspected]) {
    if (e.status !== 'rejected') suppliers.set(e.consumer, [...(suppliers.get(e.consumer) ?? []), e.supplier]);
  }
  const all = new Set(inZone);
  const queue = [...inZone];
  while (queue.length) {
    for (const s of suppliers.get(queue.pop()!) ?? []) if (!all.has(s)) { all.add(s); queue.push(s); }
  }
  return { all, feeders: new Set([...all].filter((id) => !inZone.has(id))) };
}

/** Whole site for small facilities; for large ones, the first zone that holds racks. */
export function defaultZone(facility: Facility): string {
  if (facility.nodes.length <= LARGE_SITE) return 'all';
  const halls = [...new Set(facility.nodes.filter((n) => n.type === 'rack').map((n) => n.zone))].sort();
  return halls[0] ?? 'all';
}
