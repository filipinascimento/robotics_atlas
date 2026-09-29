import { quadtree } from "d3";
import type { QuadtreeLeaf } from "d3";

export type LocatedInstitution = {
  id: number;
  geo: [number, number];
  papers: number;
};

/** Stable visual offsets; stored geographic coordinates are never changed. */
export function locationOffsets(institutions: LocatedInstitution[]) {
  const groups = new Map<string, LocatedInstitution[]>();
  for (const node of institutions) {
    const key = node.geo.map((value) => value.toFixed(6)).join(",");
    const group = groups.get(key) || [];
    group.push(node);
    groups.set(key, group);
  }
  const offsets = new Map<number, [number, number]>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.papers - a.papers || a.id - b.id);
    group.forEach((node, index) => {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      offsets.set(node.id, [
        Math.cos(angle) * Math.sqrt(index),
        Math.sin(angle) * Math.sqrt(index),
      ]);
    });
  }
  return offsets;
}

export function offsetSpacing(zoom: number) {
  // Keep intermediate views compact, accelerating separation toward the 512× limit.
  const progress = Math.min(1, Math.max(0, (zoom - 12) / (512 - 12)));
  return 12 * Math.pow(progress, 1.6);
}

export type MapHit = {
  id: number;
  x: number;
  y: number;
  radius: number;
  count: number;
};
/** Pick the most-published visible mark under the pointer, including coincident leaves. */
export function mapPicker(nodes: MapHit[]) {
  const tree = quadtree<MapHit>()
    .x((n) => n.x)
    .y((n) => n.y)
    .addAll(nodes);
  const maxRadius = Math.max(5, ...nodes.map((n) => n.radius + 2));
  return (x: number, y: number) => {
    let best: MapHit | undefined;
    let bestDistance = Infinity;
    tree.visit((quad, left, top, right, bottom) => {
      if (
        left > x + maxRadius ||
        right < x - maxRadius ||
        top > y + maxRadius ||
        bottom < y - maxRadius
      )
        return true;
      if (!quad.length) {
        let leaf: QuadtreeLeaf<MapHit> | undefined = quad;
        do {
          const node = leaf.data;
          const distance = Math.hypot(node.x - x, node.y - y);
          if (
            distance <= Math.max(5, node.radius + 2) &&
            (!best ||
              node.count > best.count ||
              (node.count === best.count &&
                (distance < bestDistance ||
                  (distance === bestDistance && node.id < best.id))))
          ) {
            best = node;
            bestDistance = distance;
          }
          leaf = leaf.next;
        } while (leaf);
      }
      return false;
    });
    return best;
  };
}
