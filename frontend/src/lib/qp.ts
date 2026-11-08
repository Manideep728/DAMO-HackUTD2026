/** Query param from either ?a=b (before the hash) or #/route?a=b (inside the hash). */
export function qp(name: string): string | null {
  const a = new URLSearchParams(window.location.search).get(name);
  if (a != null) return a;
  const i = window.location.hash.indexOf('?');
  return i >= 0 ? new URLSearchParams(window.location.hash.slice(i)).get(name) : null;
}
