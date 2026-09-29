import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { compact, TIMELINE_START } from "../data";
import type { Atlas, Community, Filters } from "../data";
import { useTheme } from "../theme";
import { Icon } from "./Icon";
import "./Evolution.css";

type Point = { year: number; percent: number };
type Subnode = Community["secondLevel"]["nodes"][number];
type Positioned = Subnode & d3.SimulationNodeDatum & { radius: number };

function ShareChart({
  values,
  end,
  max,
  color,
  filters,
  hover,
  onHover,
  onYears,
  label,
  height = 90,
}: {
  values: Point[];
  end: number;
  max: number;
  color: string;
  filters: Filters;
  hover: number | null;
  onHover: (year: number | null) => void;
  onYears: (start: number, end: number) => void;
  label: string;
  height?: number;
}) {
  const paint = useTheme();
  const start = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(240, entry.contentRect.width)),
    );
    observer.observe(svgRef.current!);
    return () => observer.disconnect();
  }, []);
  const left = 44,
    right = width - 20,
    bottom = height - 27;
  const x = d3.scaleLinear().domain([TIMELINE_START, end]).range([left, right]);
  const y = d3
    .scaleLinear()
    .domain([0, max || 1])
    .nice()
    .range([bottom, 16]);
  const points = d3.range(TIMELINE_START, end + 1).map((year) => ({
    year,
    percent: values.find((v) => v.year === year)?.percent ?? 0,
  }));
  const area = d3
    .area<Point>()
    .x((d) => x(d.year))
    .y0(bottom)
    .y1((d) => y(d.percent))
    .curve(d3.curveMonotoneX);
  const line = d3
    .line<Point>()
    .x((d) => x(d.year))
    .y((d) => y(d.percent))
    .curve(d3.curveMonotoneX);
  const yearAt = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.round(
      Math.max(
        TIMELINE_START,
        Math.min(
          end,
          x.invert(((event.clientX - bounds.left) / bounds.width) * width),
        ),
      ),
    );
  };
  return (
    <svg
      ref={svgRef}
      className="evolution-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      role="img"
      aria-label={label}
      aria-description="Drag to filter years; double-click restores all years."
      data-start-year={filters.start}
      data-end-year={filters.end}
      onDoubleClick={() => onYears(TIMELINE_START, end)}
      onPointerDown={(e) => {
        e.preventDefault();
        start.current = yearAt(e);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const year = yearAt(e);
        onHover(year);
        if (start.current !== null)
          onYears(Math.min(start.current, year), Math.max(start.current, year));
      }}
      onPointerUp={(e) => {
        if (start.current !== null) {
          const year = yearAt(e);
          onYears(Math.min(start.current, year), Math.max(start.current, year));
          start.current = null;
        }
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onPointerLeave={() => onHover(null)}
    >
      {y.ticks(3).map((t) => (
        <g key={t}>
          <line
            x1={left}
            x2={right}
            y1={y(t)}
            y2={y(t)}
            stroke={paint.grid}
            strokeDasharray="3 5"
          />
          <text x={left - 7} y={y(t) + 4} textAnchor="end" fill={paint.muted}>
            {t}%
          </text>
        </g>
      ))}
      <path d={area(points) || ""} fill={color} opacity=".17" />
      <path
        d={line(points) || ""}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={left}
        y="10"
        width={Math.max(0, x(filters.start) - left)}
        height={bottom - 10}
        fill={paint.mask}
        opacity=".75"
      />
      <rect
        x={x(filters.end)}
        y="10"
        width={Math.max(0, right - x(filters.end))}
        height={bottom - 10}
        fill={paint.mask}
        opacity=".75"
      />
      {[filters.start, filters.end].map((year, i) => (
        <line
          key={i}
          x1={x(year)}
          x2={x(year)}
          y1="10"
          y2={bottom}
          stroke={paint.brush}
          strokeWidth="1.5"
        />
      ))}
      {[TIMELINE_START, 2000, 2010, end]
        .filter((v, i, a) => v <= end && a.indexOf(v) === i)
        .map((t) => (
          <text
            key={t}
            x={x(t)}
            y={height - 5}
            textAnchor={
              t === TIMELINE_START ? "start" : t === end ? "end" : "middle"
            }
            fill={paint.muted}
          >
            {t}
          </text>
        ))}
      {hover !== null && (
        <g className="evolution-crosshair">
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1="10"
            y2={bottom}
            stroke={paint.muted}
          />
          <circle
            cx={x(hover)}
            cy={y(points.find((p) => p.year === hover)?.percent || 0)}
            r="4"
            fill={color}
          />
          <text
            x={hover > (end + TIMELINE_START) / 2 ? x(hover) - 8 : x(hover) + 8}
            y="12"
            textAnchor={hover > (end + TIMELINE_START) / 2 ? "end" : "start"}
            fill={paint.text}
          >
            {hover} ·{" "}
            {(points.find((p) => p.year === hover)?.percent || 0).toFixed(1)}%
          </text>
        </g>
      )}
    </svg>
  );
}

function SubclusterNetwork({
  community,
  selected,
  onSelect,
  colors,
}: {
  community: Community;
  selected: string | null;
  onSelect: (id: string | null) => void;
  colors: string[];
}) {
  const paint = useTheme();
  const layout = useMemo(() => {
    const largest = Math.max(
      1,
      ...community.secondLevel.nodes.map((n) => n.size),
    );
    const nodes: Positioned[] = community.secondLevel.nodes.map((n) => ({
      ...n,
      radius: 19 + Math.sqrt(n.size / largest) * 22,
    }));
    const links = community.secondLevel.links.map((e) => ({ ...e }));
    const simulation = d3
      .forceSimulation(nodes)
      .randomSource(d3.randomLcg(0.42))
      .force(
        "link",
        d3
          .forceLink<Positioned, d3.SimulationLinkDatum<Positioned>>(links)
          .id((n) => n.id)
          .distance((e) => 125 - 55 * (e as (typeof links)[number]).normalized)
          .strength(0.35),
      )
      .force("charge", d3.forceManyBody().strength(-550))
      .force(
        "collision",
        d3.forceCollide<Positioned>().radius((n) => n.radius + 25),
      )
      .force("center", d3.forceCenter(260, 157))
      .stop();
    simulation.tick(240);
    nodes.forEach((n) => {
      n.x = Math.max(70, Math.min(450, n.x!));
      n.y = Math.max(55, Math.min(255, n.y!));
    });
    return { nodes, positions: new Map(nodes.map((n) => [n.id, n])) };
  }, [community]);
  return (
    <svg
      className="evolution-network"
      viewBox="0 0 520 320"
      role="group"
      aria-label="Subcluster citation network"
      onClick={() => onSelect(null)}
    >
      <rect width="520" height="320" fill="transparent" />
      {community.secondLevel.links.map((e) => {
        const a = layout.positions.get(e.source),
          b = layout.positions.get(e.target);
        if (!a || !b) return null;
        return (
          <line
            key={`${e.source}-${e.target}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={colors[0]}
            strokeWidth={1 + e.normalized * 7}
            opacity={
              selected && e.source !== selected && e.target !== selected
                ? 0.08
                : 0.42
            }
          >
            <title>Citation affinity: {e.weight.toFixed(4)} · all years</title>
          </line>
        );
      })}
      {layout.nodes.map((n, i) => (
        <g
          key={n.id}
          role="button"
          tabIndex={0}
          aria-label={`Inspect subcluster ${i + 1}`}
          aria-pressed={selected === n.id}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(selected === n.id ? null : n.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(selected === n.id ? null : n.id);
            }
          }}
          style={{ cursor: "pointer" }}
        >
          <circle
            cx={n.x}
            cy={n.y}
            r={n.radius + 5}
            fill="none"
            stroke={selected === n.id ? colors[i] : "transparent"}
            strokeWidth="2"
          />
          <circle cx={n.x} cy={n.y} r={n.radius} fill={colors[i]} />
          <text
            x={n.x}
            y={n.y! + 10}
            fill={paint.count}
            textAnchor="middle"
            fontSize="16"
            fontWeight="600"
          >
            {compact(n.size)}
          </text>
          <text
            x={n.x}
            y={n.y! - 12}
            fill={paint.count}
            textAnchor="middle"
            fontSize="13"
          >
            {String(i + 1).padStart(2, "0")}
          </text>
          <title>
            {n.keywords.join(", ")} · {n.size.toLocaleString()} papers, all
            years
          </title>
        </g>
      ))}
    </svg>
  );
}

export function Evolution({
  data,
  filters,
  onCommunity,
  onYears,
}: {
  data: Atlas;
  filters: Filters;
  onCommunity: (index: number | null) => void;
  onYears: (start: number, end: number) => void;
}) {
  const paint = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const community =
    filters.community === null
      ? undefined
      : data.communities[filters.community];
  const nodes = community?.secondLevel.nodes || [];
  // Ignore a previous community's local selection without altering the shared filters.
  const active = nodes.some((n) => n.id === selected) ? selected : null;
  const end = data.years.at(-1)!;
  const maxOf = (values: Point[]) =>
    Math.max(
      1,
      ...values.filter((v) => v.year >= TIMELINE_START).map((v) => v.percent),
    );
  const commonMax = Math.max(
    1,
    ...(community
      ? nodes.map((n) => maxOf(n.timeline))
      : data.communities.map((c) => maxOf(c.timeline))),
  );
  const colors = nodes.map((_, i) => {
    const c = d3.hcl(paint.color(filters.community!));
    c.h += (i - 2) * 9;
    c.l += paint.mode === "light" ? -i * 3 : i * 3;
    return c.formatHex();
  });
  const chartProps = { end, filters, hover, onHover: setHover, onYears };
  return (
    <section className="evolution-view" aria-label="Community evolution">
      <div className="evolution-heading">
        <select
          aria-label="Evolution community"
          value={filters.community ?? ""}
          onChange={(e) => {
            onCommunity(e.target.value === "" ? null : +e.target.value);
            setSelected(null);
          }}
        >
          <option value="">All communities</option>
          {data.communities.map((c, i) => (
            <option value={i} key={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <span>
          {community
            ? "Annual share of community papers"
            : "Annual share of corpus papers"}
        </span>
      </div>
      {community ? (
        <>
          <div className="evolution-detail-top">
            <section className="evolution-network-section">
              <header>
                <strong>Top {nodes.length} subclusters</strong>
                <span>All-time papers · citation affinity</span>
              </header>
              <SubclusterNetwork
                community={community}
                colors={colors}
                selected={active}
                onSelect={setSelected}
              />
            </section>
            <div className="evolution-timelines">
              <section className="evolution-parent">
                <header>
                  <strong>{community.label}</strong>
                  <span>Share of corpus papers</span>
                </header>
                <ShareChart
                  {...chartProps}
                  values={community.timeline}
                  max={maxOf(community.timeline)}
                  color={paint.color(filters.community!)}
                  label={`${community.label} annual share of corpus papers`}
                  height={110}
                />
              </section>
              <div className="evolution-small-multiples">
                {nodes.map((node, i) => (
                  <section
                    key={node.id}
                    className={`evolution-series ${active === node.id ? "selected" : ""}`}
                    style={
                      { "--series-color": colors[i] } as React.CSSProperties
                    }
                  >
                    <button
                      className="evolution-series-heading"
                      aria-pressed={active === node.id}
                      onClick={() =>
                        setSelected(active === node.id ? null : node.id)
                      }
                    >
                      <span className="evolution-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <strong>
                        {node.keywords.slice(0, 4).join(" · ") || node.label}
                      </strong>
                      <span>
                        {compact(node.size)}
                        <small> papers · all years</small>
                      </span>
                    </button>
                    <ShareChart
                      {...chartProps}
                      values={node.timeline}
                      max={commonMax}
                      color={colors[i]}
                      label={`${node.label} annual share of community papers`}
                    />
                  </section>
                ))}
                {!nodes.length && (
                  <p className="evolution-empty">
                    No subcluster data is available for this community.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="evolution-small-multiples overview">
          {data.communities.map((c, i) => (
            <section
              className="evolution-series"
              key={c.id}
              style={
                { "--series-color": paint.color(i) } as React.CSSProperties
              }
            >
              <button
                className="evolution-series-heading"
                onClick={() => onCommunity(i)}
              >
                <span className="evolution-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <strong>{c.label}</strong>
                <Icon name="arrow" size={17} />
              </button>
              <ShareChart
                {...chartProps}
                values={c.timeline}
                max={commonMax}
                color={paint.color(i)}
                label={`${c.label} annual share of corpus papers`}
              />
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
