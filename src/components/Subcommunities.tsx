import { useTheme } from "../theme";
import { TIMELINE_START } from "../data";
import { useState } from "react";
import * as d3 from "d3";
import type { Community } from "../data";
import { compact } from "../data";
export function Subcommunities({
  community,
  index,
}: {
  community: Community;
  index: number;
}) {
  const paint = useTheme();
  const { color } = paint;
  const [selected, setSelected] = useState<string | null>(null);
  const nodes = community.secondLevel.nodes,
    links = community.secondLevel.links;
  const positions = new Map(
    nodes.map((n, i) => [
      n.id,
      {
        x: 115 + Math.cos((i / nodes.length) * Math.PI * 2 - Math.PI / 2) * 73,
        y: 95 + Math.sin((i / nodes.length) * Math.PI * 2 - Math.PI / 2) * 66,
      },
    ]),
  );
  const max = Math.max(...nodes.map((n) => n.size), 1);
  return (
    <div className="subcommunities">
      <p className="rank-caption">Within this community · all years</p>
      <svg
        role="img"
        viewBox="0 0 230 186"
        aria-label="Subcommunity citation network"
      >
        {links.map((e) => {
          const a = positions.get(e.source),
            b = positions.get(e.target);
          if (!a || !b) return null;
          return (
            <line
              key={`${e.source}-${e.target}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color(index)}
              strokeWidth={0.5 + e.normalized * 2.5}
              opacity={
                selected === null ||
                selected === e.source ||
                selected === e.target
                  ? 0.3
                  : 0.06
              }
            >
              <title>Citation affinity: {e.weight.toFixed(4)}</title>
            </line>
          );
        })}
        {nodes.map((n, i) => {
          const p = positions.get(n.id)!;
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`Inspect subcommunity ${i + 1}`}
              onClick={() => setSelected(selected === n.id ? null : n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(selected === n.id ? null : n.id);
                }
              }}
              style={{ cursor: "pointer" }}
              opacity={selected === null || selected === n.id ? 1 : 0.35}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={12 + Math.sqrt(n.size / max) * 10}
                fill={paint.land}
                stroke={color(index)}
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fill={color(index)}
                fontSize="11"
              >
                {i + 1}
              </text>
              <title>
                {n.keywords.slice(0, 4).join(", ")} · {n.size} papers
              </title>
            </g>
          );
        })}
      </svg>
      <p className="sub-scope">
        These citation groups and their annual shares use the original all-time
        analysis. Institution filters use the parent community.
      </p>
      {nodes.map((n, i) => {
        const values = n.timeline.filter((t) => t.year >= TIMELINE_START),
          x = d3
            .scaleLinear()
            .domain([
              TIMELINE_START,
              d3.max(values, (v) => v.year) || TIMELINE_START + 1,
            ])
            .range([0, 180]),
          y = d3
            .scaleLinear()
            .domain([0, d3.max(values, (v) => v.percent) || 1])
            .range([38, 2]);
        return (
          <button
            className={`subcommunity-row ${selected === n.id ? "active" : ""}`}
            key={n.id}
            onClick={() => setSelected(selected === n.id ? null : n.id)}
            aria-pressed={selected === n.id}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            <div>
              <strong>{n.keywords.slice(0, 3).join(" · ") || n.label}</strong>
              <small>
                {compact(n.size)} papers · peak annual share{" "}
                {(d3.max(values, (v) => v.percent) || 0).toFixed(1)}%
              </small>
              <svg
                width="100%"
                viewBox="0 0 180 52"
                aria-label={`${n.label} annual share`}
              >
                <path
                  d={
                    d3
                      .area<(typeof values)[number]>()
                      .x((v) => x(v.year))
                      .y0(38)
                      .y1((v) => y(v.percent))
                      .curve(d3.curveMonotoneX)(values) || ""
                  }
                  fill={color(index)}
                  opacity=".15"
                />
                <path
                  d={
                    d3
                      .line<(typeof values)[number]>()
                      .x((v) => x(v.year))
                      .y((v) => y(v.percent))
                      .curve(d3.curveMonotoneX)(values) || ""
                  }
                  fill="none"
                  stroke={color(index)}
                  strokeWidth="1"
                />
                <text x="0" y="50" fill={paint.muted} fontSize="7">
                  {values[0]?.year}
                </text>
                <text
                  x="180"
                  y="50"
                  textAnchor="end"
                  fill={paint.muted}
                  fontSize="7"
                >
                  {values.at(-1)?.year}
                </text>
              </svg>
            </div>
          </button>
        );
      })}
    </div>
  );
}
