import { useTheme } from "../theme";
import { TIMELINE_START } from "../data";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { Atlas, Filters, Institution } from "../data";
import { Icon } from "./Icon";
export function Timeline({
  data,
  filters,
  institution,
  onChange,
  expanded,
  onExpand,
}: {
  data: Atlas;
  filters: Filters;
  institution?: Institution;
  onChange: (start: number, end: number) => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  const paint = useTheme();
  const { color } = paint;
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(700),
    [hover, setHover] = useState<number | null>(null),
    [playing, setPlaying] = useState(false);
  const [scaleMode, setScaleMode] = useState("sqrt");
  const brushStart = useRef<number | null>(null);
  const min = TIMELINE_START,
    max = data.years.at(-1)!;
  useEffect(() => {
    const ro = new ResizeObserver((entries) =>
      setWidth(Math.max(200, entries[0].contentRect.width)),
    );
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (filters.end >= max) {
        setPlaying(false);
        return;
      }
      onChange(filters.start, filters.end + 1);
    }, 650);
    return () => clearInterval(timer);
  }, [playing, filters.start, filters.end, max, onChange]);
  const height = expanded ? 220 : 70,
    top = 8,
    bottom = height - 20;
  const x = d3
    .scaleLinear()
    .domain([min, max])
    .range([8, width - 10]);
  const rows = useMemo(
    () =>
      d3.range(TIMELINE_START, data.years.at(-1)! + 1).map((year) => {
        const totals = Array(data.communities.length).fill(0) as number[];
        let all = 0;
        if (institution) {
          for (const [y, c, n] of institution.counts)
            if (y === year) {
              all += n;
              if (c >= 0) totals[c] += n;
            }
        } else {
          all = data.totalByYear.find(([y]) => y === year)?.[1] || 0;
          data.communities.forEach((c, i) => {
            totals[i] = c.counts.find(([y]) => y === year)?.[1] || 0;
          });
        }
        totals.push(Math.max(0, all - totals.reduce((a, b) => a + b, 0)));
        return { year, all, values: totals };
      }),
    [data, institution],
  );
  const layers = d3
    .stack<(typeof rows)[number]>()
    .keys(
      Array.from({ length: data.communities.length + 1 }, (_, i) => String(i)),
    )
    .value((d, key) =>
      scaleMode === "share"
        ? d.all
          ? (d.values[+key] / d.all) * 100
          : 0
        : d.values[+key],
    )(rows);
  const y = (scaleMode === "sqrt" ? d3.scaleSqrt() : d3.scaleLinear())
    .domain([
      0,
      scaleMode === "share" ? 100 : Math.max(1, ...rows.map((r) => r.all)),
    ])
    .range([bottom, top]);
  const path = d3
    .area<d3.SeriesPoint<(typeof rows)[number]>>()
    .x((d) => x(d.data.year))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(d3.curveMonotoneX);
  const pointerYear = (e: React.PointerEvent<SVGSVGElement>) =>
    Math.round(
      Math.max(
        min,
        Math.min(
          max,
          x.invert(e.clientX - e.currentTarget.getBoundingClientRect().left),
        ),
      ),
    );
  return (
    <section className={`timeline-panel ${expanded ? "expanded" : ""}`}>
      <div className="timeline-heading">
        <div>
          <Icon name="timeline" size={16} />
          <strong>
            {institution
              ? `${institution.label} · publication history`
              : "Research through time"}
          </strong>
          <select
            aria-label="Timeline scale"
            value={scaleMode}
            onChange={(e) => setScaleMode(e.target.value)}
          >
            <option value="sqrt">Papers · square-root scale</option>
            <option value="linear">Papers · linear scale</option>
            <option value="share">Annual community share</option>
          </select>
        </div>
        <div>
          <button
            title={playing ? "Pause timeline" : "Play through years"}
            aria-label={playing ? "Pause timeline" : "Play through years"}
            onClick={() => {
              if (!playing && filters.end >= max)
                onChange(filters.start, Math.min(max, filters.start + 5));
              setPlaying((v) => !v);
            }}
          >
            <Icon name={playing ? "pause" : "play"} size={14} />
          </button>
          <button
            aria-label={expanded ? "Shrink timeline" : "Expand timeline"}
            onClick={onExpand}
          >
            <Icon name="expand" size={14} />
          </button>
        </div>
      </div>
      <div className="timeline-chart" ref={ref}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-label="Publication timeline; drag to filter years, double-click to show all years"
          aria-description={`Selected years: ${filters.start}–${filters.end}`}
          data-start-year={filters.start}
          data-end-year={filters.end}
          onDoubleClick={() => onChange(min, max)}
          onPointerDown={(e) => {
            e.preventDefault();
            brushStart.current = pointerYear(e);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const year = pointerYear(e);
            setHover(year);
            if (brushStart.current !== null)
              onChange(
                Math.min(year, brushStart.current),
                Math.max(year, brushStart.current),
              );
          }}
          onPointerUp={(e) => {
            if (brushStart.current !== null) {
              const year = pointerYear(e);
              onChange(
                Math.min(year, brushStart.current),
                Math.max(year, brushStart.current),
              );
              brushStart.current = null;
            }
          }}
          onPointerCancel={() => {
            brushStart.current = null;
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1="8"
                x2={width - 10}
                y1={y(y.domain()[1] * f)}
                y2={y(y.domain()[1] * f)}
                stroke={paint.grid}
                strokeDasharray="2 4"
              />
              <text
                x="10"
                y={y(y.domain()[1] * f) + 10}
                fill={paint.muted}
                fontSize="11"
              >
                {d3.format("~s")(y.domain()[1] * f)}
                {scaleMode === "share" ? "%" : ""}
              </text>
            </g>
          ))}
          {layers.map((layer, i) => (
            <path
              key={i}
              d={path(layer) || ""}
              fill={color(i)}
              opacity={
                filters.community === null || filters.community === i
                  ? 0.7
                  : 0.12
              }
            />
          ))}
          <rect
            x="0"
            y="0"
            width={Math.max(0, x(filters.start))}
            height={bottom}
            fill={paint.mask}
            opacity=".68"
          />
          <rect
            x={x(filters.end)}
            y="0"
            width={Math.max(0, width - x(filters.end))}
            height={bottom}
            fill={paint.mask}
            opacity=".68"
          />
          {[filters.start, filters.end].map((year, i) => (
            <g key={i}>
              <line
                x1={x(year)}
                x2={x(year)}
                y1="3"
                y2={bottom}
                stroke={paint.brush}
                strokeWidth="1"
              />
              <rect
                x={x(year) - 2}
                y={bottom / 2 - 8}
                width="4"
                height="16"
                rx="2"
                fill={paint.brush}
              />
            </g>
          ))}
          {[
            min,
            ...x
              .ticks(width < 600 ? 5 : 10)
              .filter((t) => t > min + (width < 600 ? 3 : 1)),
          ].map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 4}
              textAnchor={t === min ? "start" : "middle"}
              fill={paint.muted}
              fontSize="12"
            >
              {t}
            </text>
          ))}
          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1="0"
                y2={bottom}
                stroke={paint.text}
                opacity=".5"
              />
              <text
                x={Math.min(width - 90, Math.max(20, x(hover) + 8))}
                y="15"
                fill={paint.text}
                fontSize="12"
              >
                {hover} ·{" "}
                {rows.find((r) => r.year === hover)?.all.toLocaleString() || 0}{" "}
                papers
              </text>
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}
