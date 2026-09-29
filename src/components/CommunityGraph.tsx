import { useTheme } from "../theme";
import { useMemo, useState } from "react";
import * as d3 from "d3";
import { compact, shortLabel, communityAffinities } from "../data";
import type { Atlas, Result } from "../data";

type Point = d3.SimulationNodeDatum & {
  index: number;
  r: number;
  x: number;
  y: number;
};
export function CommunityGraph({
  data,
  result,
  selected,
  onSelect,
  onBackground,
  representation,
  compactView = false,
}: {
  data: Atlas;
  result: Result;
  selected: number | null;
  onSelect: (id: number | null) => void;
  onBackground?: () => void;
  representation?: number[];
  compactView?: boolean;
}) {
  const paint = useTheme();
  const { color } = paint;
  const [hovered, setHovered] = useState<number | null>(null);
  const positions = useMemo(() => {
    const nodes: Point[] = data.communities.map((c, i) => ({
      index: i,
      r:
        20 +
        Math.sqrt(c.size / Math.max(...data.communities.map((c) => c.size))) *
          30,
      x: 340 + Math.cos(i * 2.4) * 190,
      y: 230 + Math.sin(i * 2.4) * 140,
    }));
    const links = communityAffinities(
      data,
      data.citationLinks.map((e) => ({
        source: e.source,
        target: e.target,
        count: e.counts.reduce((sum, [, n]) => sum + n, 0),
      })),
    );
    const sim = d3
      .forceSimulation(nodes)
      .randomSource(d3.randomLcg(0.42))
      .force(
        "links",
        d3
          .forceLink<Point, (typeof links)[number]>(links)
          .id((n) => n.index)
          .distance((e) => 310 - e.contrast * 170)
          .strength((e) => 0.015 + e.contrast * 0.34),
      )
      .force("charge", d3.forceManyBody().strength(-750))
      .force(
        "collision",
        d3.forceCollide<Point>().radius((n) => n.r + 29),
      )
      .force("x", d3.forceX(340).strength(0.07))
      .force("y", d3.forceY(225).strength(0.12))
      .stop();
    sim.tick(450);
    const xs = d3.extent(nodes, (n) => n.x) as [number, number],
      ys = d3.extent(nodes, (n) => n.y) as [number, number];
    const x = d3.scaleLinear().domain(xs).range([105, 585]),
      y = d3.scaleLinear().domain(ys).range([78, 368]);
    return nodes.map((n) => ({ ...n, x: x(n.x), y: y(n.y) }));
  }, [data]);
  const labels = useMemo(() => {
    const specs = data.communities.map((c) => {
      const lines = [""];
      for (const word of shortLabel(c.label).split(" ")) {
        if ((lines[lines.length - 1] + word).length > 24) lines.push("");
        lines[lines.length - 1] += `${word} `;
      }
      return {
        lines: lines.map((s) => s.trim()),
        width: Math.max(...lines.map((s) => s.trim().length)) * 5.4,
        height: lines.length * 14,
      };
    });
    type Box = { x: number; y: number; w: number; h: number };
    const overlap = (a: Box, b: Box) =>
      Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const placed: Box[] = [];
    const result = specs.map((s) => ({ ...s, x: 0, y: 0 }));
    const obstacles = positions.map((p) => ({
      x: p.x - 49,
      y: p.y - 49,
      w: 98,
      h: 98,
    }));
    specs
      .map((_, i) => i)
      .sort((a, b) => specs[b].height - specs[a].height)
      .forEach((i) => {
        const p = positions[i],
          label = specs[i],
          r =
            Math.sqrt(
              data.communities[i].size /
                Math.max(...data.communities.map((c) => c.size)),
            ) * 43;
        const candidates = [
          { x: p.x, y: p.y + r + 22 },
          { x: p.x, y: p.y - r - 16 - (label.lines.length - 1) * 14 },
          { x: p.x + r + 14 + label.width / 2, y: p.y - label.height / 2 + 10 },
          { x: p.x - r - 14 - label.width / 2, y: p.y - label.height / 2 + 10 },
        ];
        const scored = candidates
          .map((c, j) => {
            const box = {
              x: c.x - label.width / 2,
              y: c.y - 10,
              w: label.width,
              h: label.height,
            };
            const outside =
              Math.max(0, 5 - box.x) +
              Math.max(0, box.x + box.w - 685) +
              Math.max(0, 5 - box.y) +
              Math.max(0, box.y + box.h - 450);
            return {
              ...c,
              box,
              score:
                outside * 1000 +
                obstacles.reduce(
                  (sum, b, k) => sum + (k === i ? 0 : overlap(box, b) * 8),
                  0,
                ) +
                placed.reduce((sum, b) => sum + overlap(box, b) * 12, 0) +
                j * 5,
            };
          })
          .sort((a, b) => a.score - b.score);
        result[i] = { ...label, x: scored[0].x, y: scored[0].y };
        placed.push(scored[0].box);
      });
    return result;
  }, [data, positions]);
  const max = Math.max(...result.communityCounts, 1);
  const links = communityAffinities(data, result.citationLinks);
  const radius = (index: number) =>
    result.communityCounts[index]
      ? Math.sqrt(result.communityCounts[index] / max) * 43
      : 5;
  return (
    <div className="community-visual">
      <svg
        onClick={() => {
          onSelect(null);
          onBackground?.();
        }}
        className="community-graph"
        viewBox="0 0 690 455"
        role="img"
        aria-label="Citation community network. Select a community to explore its institutions."
      >
        <defs>
          {data.communities.map((_, i) => (
            <radialGradient id={`halo-${i}`} key={i}>
              <stop stopColor={color(i)} stopOpacity=".13" />
              <stop offset="1" stopColor={color(i)} stopOpacity="0" />
            </radialGradient>
          ))}
          {links.map((e) => (
            <linearGradient
              key={`${e.source}-${e.target}`}
              id={`affinity-${e.source}-${e.target}`}
              gradientUnits="userSpaceOnUse"
              x1={positions[e.source].x}
              y1={positions[e.source].y}
              x2={positions[e.target].x}
              y2={positions[e.target].y}
            >
              <stop stopColor={color(e.source)} />
              <stop offset="1" stopColor={color(e.target)} />
            </linearGradient>
          ))}
        </defs>
        {links.map((e) => {
          const a = positions[e.source],
            b = positions[e.target],
            active =
              selected === null ||
              e.source === selected ||
              e.target === selected;
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const ux = (b.x - a.x) / length,
            uy = (b.y - a.y) / length;
          return (
            <line
              className="community-edge"
              data-source={e.source}
              data-target={e.target}
              key={`${e.source}-${e.target}`}
              x1={a.x + ux * (radius(e.source) + 6)}
              y1={a.y + uy * (radius(e.source) + 6)}
              x2={b.x - ux * (radius(e.target) + 6)}
              y2={b.y - uy * (radius(e.target) + 6)}
              stroke={`url(#affinity-${e.source}-${e.target})`}
              strokeWidth={0.6 + 8.5 * e.contrast}
              strokeLinecap="round"
              opacity={
                active
                  ? paint.mode === "light"
                    ? 0.22 + 0.55 * e.contrast
                    : 0.1 + 0.48 * e.contrast
                  : paint.mode === "light"
                    ? 0.06
                    : 0.025
              }
            >
              <title>
                {data.communities[e.source].label} ↔{" "}
                {data.communities[e.target].label}: affinity{" "}
                {e.affinity.toFixed(3)} · {e.count.toLocaleString()} citations
                in period. Width uses the original community-size-adjusted
                relationship measure.
              </title>
            </line>
          );
        })}
        {positions.map((p, i) => {
          const c = data.communities[i],
            count = result.communityCounts[i] || 0,
            active = selected === null || selected === i,
            r = radius(i);
          const label = labels[i];
          return (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`Select ${c.label}`}
              aria-pressed={selected === i}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(selected === i ? null : i);
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(selected === i ? null : i);
                }
              }}
              className="community-node"
              opacity={active ? 1 : 0.3}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={r * 2.1}
                fill={`url(#halo-${i})`}
                pointerEvents="none"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={r + 5}
                fill="none"
                stroke={color(i)}
                strokeWidth={selected === i ? 1.5 : 0.5}
                opacity={selected === i ? 0.9 : 0.25}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={color(i)}
                fillOpacity={paint.mode === "light" ? 1 : 0.82}
                stroke={color(i)}
                strokeWidth="1.3"
              />
              {representation && representation[i] > 0 && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r + 8}
                  fill="none"
                  stroke={color(i)}
                  strokeWidth="3"
                  strokeDasharray={`${
                    (2 * Math.PI * (r + 8) * representation[i]) /
                    Math.max(
                      1,
                      representation.reduce((a, b) => a + b, 0),
                    )
                  } 999`}
                  transform={`rotate(-90 ${p.x} ${p.y})`}
                />
              )}
              <text
                x={p.x}
                y={p.y + 5}
                textAnchor="middle"
                fill={paint.count}
                fontSize={compactView ? "23" : "17"}
                fontWeight="600"
              >
                {compact(count)}
              </text>
              {!compactView &&
                label.lines.map((line, j) => (
                  <text
                    key={j}
                    x={label.x}
                    y={label.y + j * 14}
                    stroke={paint.labelHalo}
                    strokeWidth="3"
                    paintOrder="stroke"
                    strokeLinejoin="round"
                    textAnchor="middle"
                    fill={paint.text}
                    fontSize="12"
                    fontWeight="500"
                  >
                    {line.trim()}
                  </text>
                ))}
              <title>
                {c.label}: {count.toLocaleString()} papers in period
              </title>
            </g>
          );
        })}
      </svg>
      {compactView && hovered !== null && (
        <div className="community-tooltip" role="tooltip">
          <strong style={{ color: color(hovered) }}>
            {data.communities[hovered].label}
          </strong>
          <span>
            {(result.communityCounts[hovered] || 0).toLocaleString()} papers in
            period
          </span>
        </div>
      )}
    </div>
  );
}
