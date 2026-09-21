import type { PackSource } from "./model";

/** Topics are curator-defined paths, not an authority taxonomy. Legacy labels stay intact. */
export function topicParts(topic: string): string[] {
  const parts = topic.split(">").map(part => part.trim());
  return parts.every(Boolean) ? parts : [topic.trim()];
}
export function topicKey(topic: string): string {
  return topicParts(topic).map(part => part.toLowerCase()).join(" > ");
}
export function inTopic(topic: string, parent: string): boolean {
  return !parent || topicKey(topic) === parent || topicKey(topic).startsWith(`${parent} > `);
}
export function topicOptions(packs: { category: string }[]) {
  const paths = new Map<string, { key: string; label: string; count: number }>();
  for (const pack of packs) {
    const parts = topicParts(pack.category);
    for (let depth = 1; depth <= parts.length; depth++) {
      const label = parts.slice(0, depth).join(" > "), key = topicKey(label);
      const old = paths.get(key);
      paths.set(key, { key, label: old?.label ?? label, count: (old?.count ?? 0) + 1 });
    }
  }
  return [...paths.values()].sort((a, b) => a.key.localeCompare(b.key));
}
export interface RankedEntry {
  source_id: string; rank: number; note: string;
  tn_sources: PackSource | null;
}
export function compareEntries(left: RankedEntry[], right: RankedEntry[]) {
  const leftMap = new Map(left.map(entry => [entry.source_id, entry]));
  const rightMap = new Map(right.map(entry => [entry.source_id, entry]));
  // Preserve each curator's order; shared records appear once, then right-only records.
  const ids = [...new Set([...left].sort((a, b) => a.rank - b.rank).map(e => e.source_id)
    .concat([...right].sort((a, b) => a.rank - b.rank).map(e => e.source_id)))];
  return ids.map(id => {
    const a = leftMap.get(id), b = rightMap.get(id);
    return { id, left: a, right: b, shared: !!a && !!b,
      rankChanged: !!a && !!b && a.rank !== b.rank,
      noteChanged: !!a && !!b && a.note !== b.note };
  });
}
