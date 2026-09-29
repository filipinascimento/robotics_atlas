export const TIMELINE_START = 1988;
export type Dataset = "robotics" | "humanoid";
export type View =
  "connected" | "communities" | "geography" | "collaborations" | "evolution";
export type Count = [year: number, community: number, papers: number];
export type YearCount = [year: number, papers: number];
export type Community = {
  id: string;
  label: string;
  size: number;
  keywords: string[];
  counts: YearCount[];
  timeline: { year: number; percent: number }[];
  secondLevel: {
    nodes: {
      id: string;
      label: string;
      size: number;
      keywords: string[];
      timeline: { year: number; percent: number }[];
    }[];
    links: {
      source: string;
      target: string;
      weight: number;
      normalized: number;
    }[];
  };
};
export type Institution = {
  id: number;
  label: string;
  address: string;
  geo: [number, number];
  xy: [number, number];
  counts: Count[];
};
export type Atlas = {
  years: number[];
  communities: Community[];
  links: {
    source: string;
    target: string;
    weight: number;
    normalized: number;
  }[];
  institutions: Institution[];
  collaborations: { source: number; target: number; counts: Count[] }[];
  citationLinks: { source: number; target: number; counts: YearCount[] }[];
  totalByYear: YearCount[];
  provenance: {
    citationPapers: number;
    matchedCitationPapers: number;
    geocodedPapers: number;
    sourceInstitutions: number;
    sourceEdges: number;
  };
};
export type Filters = {
  start: number;
  end: number;
  community: number | null;
  query: string;
  minPapers: number;
  edgeLimit: number;
  institution: number | null;
  neighborhood: boolean;
};
export type ActiveNode = {
  id: number;
  count: number;
  total: number;
  community: number;
  shares: number[];
};
export type ActiveEdge = { source: number; target: number; count: number };
export type Result = {
  nodes: ActiveNode[];
  edges: ActiveEdge[];
  eligibleEdges: number;
  selectedEdges: ActiveEdge[];
  communityCounts: number[];
  citationLinks: ActiveEdge[];
  papers: number;
  ms: number;
};
export const COLORS = [
  "#70d6bc",
  "#8aa9ff",
  "#f3bb74",
  "#c09cf3",
  "#ed829b",
  "#88c9e5",
  "#c1d881",
  "#e49ed7",
  "#dc9878",
  "#93b5b0",
];
export const color = (index: number) => COLORS[index] || "#657080";
export const shortLabel = (label: string) =>
  label.replace(/ Technologies$| in Robotics$| and Applications$/g, "");
export const number = (n: number) => n.toLocaleString("en-US");
export const compact = (n: number) =>
  Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
export const sumYears = (counts: YearCount[], start: number, end: number) =>
  counts.reduce((sum, [y, n]) => sum + (y >= start && y <= end ? n : 0), 0);

export function filterAtlas(data: Atlas, f: Filters): Result {
  const time = performance.now();
  const query = f.query.trim().toLowerCase();
  let nodes: ActiveNode[] = [];
  for (const node of data.institutions) {
    if (query && !`${node.label} ${node.address}`.toLowerCase().includes(query))
      continue;
    const shares = new Array(data.communities.length + 1).fill(0) as number[];
    for (const [year, ci, count] of node.counts)
      if (year >= f.start && year <= f.end)
        shares[ci < 0 ? data.communities.length : ci] += count;
    const total = shares.reduce((a, b) => a + b, 0);
    const count = f.community === null ? total : shares[f.community];
    if (count > 0)
      nodes.push({
        id: node.id,
        count,
        total,
        shares,
        community: shares.slice(0, data.communities.length).some((n) => n > 0)
          ? shares
              .slice(0, data.communities.length)
              .indexOf(Math.max(...shares.slice(0, data.communities.length)))
          : data.communities.length,
      });
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  let edges: ActiveEdge[] = [];
  for (const edge of data.collaborations) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    if (
      f.neighborhood &&
      f.institution !== null &&
      edge.source !== f.institution &&
      edge.target !== f.institution
    )
      continue;
    let count = 0;
    for (const [year, ci, n] of edge.counts)
      if (
        year >= f.start &&
        year <= f.end &&
        (f.community === null || ci === f.community)
      )
        count += n;
    if (count >= f.minPapers)
      edges.push({ source: edge.source, target: edge.target, count });
  }
  if (f.neighborhood && f.institution !== null) {
    const neighbors = new Set([
      f.institution,
      ...edges.flatMap((e) => [e.source, e.target]),
    ]);
    nodes = nodes.filter((n) => neighbors.has(n.id));
  }
  edges.sort(
    (a, b) => b.count - a.count || a.source - b.source || a.target - b.target,
  );
  const eligibleEdges = edges.length;
  const selectedEdges =
    f.institution === null
      ? []
      : edges.filter(
          (e) => e.source === f.institution || e.target === f.institution,
        );
  if (f.edgeLimit > 0) {
    const capped = edges.slice(0, f.edgeLimit);
    const included = new Set(capped.map((e) => `${e.source}:${e.target}`));
    edges = [
      ...capped,
      ...selectedEdges.filter((e) => !included.has(`${e.source}:${e.target}`)),
    ];
  }
  nodes.sort((a, b) => b.count - a.count || a.id - b.id);
  return {
    nodes,
    edges,
    eligibleEdges,
    selectedEdges,
    communityCounts: data.communities.map((c) =>
      sumYears(c.counts, f.start, f.end),
    ),
    citationLinks: data.citationLinks
      .map((e) => ({
        source: e.source,
        target: e.target,
        count: sumYears(e.counts, f.start, f.end),
      }))
      .filter((e) => e.count > 0),
    papers: sumYears(data.totalByYear, f.start, f.end),
    ms: performance.now() - time,
  };
}

/** Original gravity-style affinity, with an all-time normalization reference.
 * The citing-year filter changes the numerator; community sizes stay fixed so
 * an older cited community does not disappear from the denominator.
 */
export function communityAffinities(data: Atlas, links: ActiveEdge[]) {
  const key = (a: number, b: number) =>
    [Math.min(a, b), Math.max(a, b)].join(":");
  const reference = new Map(
    data.links.map((e) => [key(+e.source, +e.target), e.normalized]),
  );
  const totals = new Map(
    data.citationLinks.map((e) => [
      key(e.source, e.target),
      e.counts.reduce((s, [, n]) => s + n, 0),
    ]),
  );
  const minimum = Math.min(...data.links.map((e) => e.normalized), 1);
  return links.map((e) => {
    const id = key(e.source, e.target),
      all = totals.get(id) || 1;
    const affinity =
      ((reference.get(id) || 0) * Math.log1p(e.count)) / Math.log1p(all);
    const contrast = Math.pow(
      Math.max(0, Math.min(1, (affinity - minimum) / (1 - minimum || 1))),
      3.5,
    );
    return { ...e, affinity, contrast };
  });
}
