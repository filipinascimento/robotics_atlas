import { useTheme } from "../theme";
import type { Corner } from "./CornerHandle";
import { locationOffsets, mapPicker, offsetSpacing } from "../mapInteraction";
import type { MapHit } from "../mapInteraction";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Atlas, Result } from "../data";
import { number } from "../data";
import { Icon } from "./Icon";
let worldPromise: Promise<GeoJSON.FeatureCollection> | undefined;
const world = () =>
  (worldPromise ??= fetch(`${import.meta.env.BASE_URL}data/world.json`)
    .then((r) => {
      if (!r.ok) throw new Error("Could not load map");
      return r.json();
    })
    .then((topology: Topology<{ countries: GeometryCollection }>) =>
      feature(topology, topology.objects.countries),
    ));

// Bounds use the Equal Earth projection plane, independent of panel size.
export type MapViewport = {
  zoom: number;
  bounds: [number, number, number, number];
};
export function GeoMap({
  data,
  result,
  selected,
  community,
  onSelect,
  mode = "geography",
  regional = false,
  viewport,
  onViewport,
  controlsCorner = "top-left",
}: {
  mode?: "geography" | "network";
  regional?: boolean;
  controlsCorner?: Corner;
  viewport?: MapViewport;
  onViewport?: (viewport: MapViewport) => void;
  data: Atlas;
  result: Result;
  selected: number | null;
  community: number | null;
  onSelect: (id: number | null) => void;
}) {
  const paint = useTheme();
  const { color } = paint;
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<[number, number]>([600, 400]);
  const [land, setLand] = useState<GeoJSON.FeatureCollection | null>(null);
  const [labels, setLabels] = useState<
    { id: number; x: number; y: number; width: number }[]
  >([]);
  const viewportHandler = useRef(onViewport);
  const publishedViewport = useRef("");
  const [viewportRect, setViewportRect] = useState<
    [number, number, number, number] | null
  >(null);
  useEffect(() => {
    viewportHandler.current = onViewport;
  }, [onViewport]);
  const fitSignature = useRef("");
  const frameRequest = useRef(0);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<{
    id: number;
    x: number;
    y: number;
  } | null>(null);
  const transform = useRef(d3.zoomIdentity),
    redraw = useRef<() => void>(() => {}),
    zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const cameraFrame = useRef<{
    w: number;
    h: number;
    origin: [number, number];
    scale: number;
  } | null>(null);
  const offsets = useMemo(
    () =>
      locationOffsets(
        data.institutions.map((n) => ({
          id: n.id,
          geo: n.geo,
          papers: n.counts.reduce((sum, [, , count]) => sum + count, 0),
        })),
      ),
    [data],
  );
  const pick = useRef<(x: number, y: number) => MapHit | undefined>(
      () => undefined,
    ),
    clickHandler = useRef(onSelect);
  useEffect(() => {
    clickHandler.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (mode === "network") return;
    let active = true;
    world()
      .then((v) => {
        if (active) setLand(v);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [mode]);
  useEffect(() => {
    const resize = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize([width, height]);
    });
    resize.observe(host.current!);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const el = canvas.current!;
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 512])
      .on("zoom", (e) => {
        transform.current = e.transform;
        setHover(null);
        cancelAnimationFrame(frameRequest.current);
        frameRequest.current = requestAnimationFrame(() => redraw.current());
      });
    zoomRef.current = zoom;
    d3.select(el)
      .call(zoom)
      // D3 leaves wheel events unhandled at its zoom limits. Keep those
      // gestures on the visualization instead of scrolling the page.
      .on(
        "wheel.contain",
        (event: WheelEvent) => {
          event.preventDefault();
          event.stopPropagation();
        },
        { passive: false },
      )
      .on("click.select", (e) => {
        if (e.defaultPrevented) return;
        const [x, y] = d3.pointer(e, el);
        clickHandler.current(pick.current(x, y)?.id ?? null);
      });
    return () => {
      cancelAnimationFrame(frameRequest.current);
      d3.select(el).on(".zoom", null).on(".select", null).on(".contain", null);
    };
  }, []);
  useEffect(() => {
    const [w, h] = size,
      el = canvas.current!,
      ctx = el.getContext("2d")!;
    const ratio = Math.min(devicePixelRatio, 2);
    el.width = w * ratio;
    el.height = h * ratio;
    const projection = d3.geoEqualEarth().fitExtent(
      [
        [w < 400 ? 8 : 14, w < 400 ? 6 : 30],
        [w - (w < 400 ? 8 : 14), h - (w < 400 ? 8 : 18)],
      ],
      { type: "Sphere" },
    );
    const path = d3.geoPath(projection);
    const landPaths =
      land?.features
        .filter((f) => f.id !== "010")
        .map((f) => new Path2D(path(f) || "")) || [];
    const graticule = new Path2D(path(d3.geoGraticule10()) || "");
    const xs = d3.extent(data.institutions, (n) => n.xy[0]) as [number, number];
    const ys = d3.extent(data.institutions, (n) => n.xy[1]) as [number, number];
    const scale = Math.min(
      (w - 50) / (xs[1] - xs[0] || 1),
      (h - 50) / (ys[1] - ys[0] || 1),
    );
    const anchors = new Map(
      result.nodes.map((n) => {
        const institution = data.institutions[n.id];
        const p: [number, number] =
          mode === "network"
            ? [
                w / 2 + (institution.xy[0] - (xs[0] + xs[1]) / 2) * scale,
                h / 2 + (institution.xy[1] - (ys[0] + ys[1]) / 2) * scale,
              ]
            : projection(institution.geo)!;
        return [n.id, p];
      }),
    );
    const frame = {
      w,
      h,
      origin:
        mode === "geography"
          ? projection([0, 0])!
          : ([w / 2, h / 2] as [number, number]),
      scale: mode === "geography" ? projection.scale() : scale,
    };
    const previous = cameraFrame.current,
      current = transform.current;
    if (
      previous &&
      (previous.w !== w || previous.h !== h) &&
      (current.k !== 1 || current.x !== 0 || current.y !== 0)
    ) {
      const center = current.invert([previous.w / 2, previous.h / 2]);
      const zoomScale = frame.scale / previous.scale;
      const cx = frame.origin[0] + (center[0] - previous.origin[0]) * zoomScale;
      const cy = frame.origin[1] + (center[1] - previous.origin[1]) * zoomScale;
      d3.select(el).call(
        zoomRef.current!.transform,
        d3.zoomIdentity
          .translate(w / 2 - cx * current.k, h / 2 - cy * current.k)
          .scale(current.k),
      );
    }
    cameraFrame.current = frame;
    // The inset packs only its six marks; the main map retains stable dataset-wide offsets.
    const displayOffsets = regional
      ? locationOffsets(
          result.nodes.map((n) => ({
            id: n.id,
            geo: data.institutions[n.id].geo,
            papers: n.count,
          })),
        )
      : offsets;
    const nodeLookup = new Map(result.nodes.map((n) => [n.id, n]));
    const connected = new Set<number>(selected === null ? [] : [selected]);
    for (const e of result.edges)
      if (e.source === selected || e.target === selected) {
        connected.add(e.source);
        connected.add(e.target);
      }
    const signature = `${viewport?.bounds.join(",")}:${selected}:${w}:${h}:${result.nodes.map((n) => n.id).join(",")}`;
    if (regional && fitSignature.current !== signature && anchors.size) {
      fitSignature.current = signature;
      const coords = [...anchors.values()];
      if (viewport) {
        const [left, top, right, bottom] = viewport.bounds;
        coords.push(
          [
            left * projection.scale() + frame.origin[0],
            top * projection.scale() + frame.origin[1],
          ],
          [
            right * projection.scale() + frame.origin[0],
            bottom * projection.scale() + frame.origin[1],
          ],
        );
      }
      const boundsX = d3.extent(coords, (p) => p[0]) as [number, number];
      const boundsY = d3.extent(coords, (p) => p[1]) as [number, number];
      const k = Math.max(
        1,
        Math.min(
          384,
          (w - 80) / Math.max(0.15, boundsX[1] - boundsX[0]),
          (h - 65) / Math.max(0.15, boundsY[1] - boundsY[0]),
        ),
      );
      d3.select(el).call(
        zoomRef.current!.transform,
        d3.zoomIdentity
          .translate(
            w / 2 - ((boundsX[0] + boundsX[1]) / 2) * k,
            h / 2 - ((boundsY[0] + boundsY[1]) / 2) * k,
          )
          .scale(k),
      );
    }
    redraw.current = () => {
      const t = transform.current;
      if (!regional && mode === "geography" && viewportHandler.current) {
        const a = t.invert([0, 0]),
          b = t.invert([w, h]);
        const snapshot: MapViewport = {
          zoom: t.k,
          bounds: [
            (a[0] - frame.origin[0]) / frame.scale,
            (a[1] - frame.origin[1]) / frame.scale,
            (b[0] - frame.origin[0]) / frame.scale,
            (b[1] - frame.origin[1]) / frame.scale,
          ],
        };
        const key = JSON.stringify(snapshot);
        if (publishedViewport.current !== key) {
          publishedViewport.current = key;
          viewportHandler.current(snapshot);
        }
      }
      if (regional && viewport) {
        const [left, top, right, bottom] = viewport.bounds;
        const a = t.apply([
          left * frame.scale + frame.origin[0],
          top * frame.scale + frame.origin[1],
        ]);
        const b = t.apply([
          right * frame.scale + frame.origin[0],
          bottom * frame.scale + frame.origin[1],
        ]);
        setViewportRect([a[0], a[1], b[0] - a[0], b[1] - a[1]]);
      }
      const inside = new Set<number>();
      const screen = new Map<number, [number, number]>();
      const points = new Map<number, [number, number]>();
      const spacing = offsetSpacing(t.k);
      for (const [id, anchor] of anchors) {
        const offset =
          mode === "geography" ? displayOffsets.get(id) : undefined;
        const p: [number, number] = offset
          ? [
              anchor[0] + (offset[0] * spacing) / t.k,
              anchor[1] + (offset[1] * spacing) / t.k,
            ]
          : anchor;
        points.set(id, p);
        const xy = t.apply(p);
        screen.set(id, xy);
        if (xy[0] >= 0 && xy[0] <= w && xy[1] >= 0 && xy[1] <= h)
          inside.add(id);
      }
      const visible = result.nodes.filter((n) => inside.has(n.id));
      const maxCount = Math.max(1, ...visible.map((n) => n.count));
      const radii = new Map(
        visible.map((n) => [
          n.id,
          regional
            ? 3 + Math.sqrt(n.count / maxCount) * 3
            : 1.5 + Math.sqrt(n.count / maxCount) * 8,
        ]),
      );
      pick.current = mapPicker(
        visible.map((n) => ({
          id: n.id,
          count: n.count,
          x: screen.get(n.id)![0],
          y: screen.get(n.id)![1],
          radius: radii.get(n.id)!,
        })),
      );
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);
      if (mode === "geography") {
        ctx.strokeStyle = paint.grid;
        ctx.lineWidth = 0.45 / t.k;
        ctx.stroke(graticule);
        ctx.fillStyle = paint.land;
        ctx.strokeStyle = paint.landBorder;
        ctx.lineWidth = 0.6 / t.k;
        for (const p of landPaths) {
          ctx.fill(p);
          ctx.stroke(p);
        }
      }
      // Cull remote connections and batch the remaining straight segments by
      // endpoint color and emphasis. Selected links are drawn last.
      const batches = new Map<
        string,
        {
          path: Path2D;
          stroke: string;
          alpha: number;
          width: number;
          active: boolean;
        }
      >();
      for (const e of result.edges) {
        const aIn = inside.has(e.source),
          bIn = inside.has(e.target);
        if (!aIn && !bIn) continue;
        const active = e.source === selected || e.target === selected;
        const local = aIn && bIn;
        const alpha =
          selected !== null
            ? active
              ? 1
              : 0.025
            : !local && t.k > 1.5
              ? 0.07
              : 0.48;
        const width = active
          ? 2.2 + Math.min(1.6, Math.log1p(e.count) * 0.24)
          : 1.05;
        const a = points.get(e.source)!,
          b = points.get(e.target)!;
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        for (const [id, start, end] of [
          [e.source, a, mid],
          [e.target, mid, b],
        ] as [number, [number, number], [number, number]][]) {
          const stroke = color(
            community ?? nodeLookup.get(id)?.community ?? -1,
          );
          const key = `${stroke}:${alpha}:${width.toFixed(1)}`;
          let batch = batches.get(key);
          if (!batch) {
            batch = { path: new Path2D(), stroke, alpha, width, active };
            batches.set(key, batch);
          }
          batch.path.moveTo(start[0], start[1]);
          batch.path.lineTo(end[0], end[1]);
        }
      }
      for (const batch of [...batches.values()].sort(
        (a, b) => +a.active - +b.active,
      )) {
        ctx.globalAlpha = batch.alpha;
        ctx.lineWidth = batch.width / t.k;
        ctx.strokeStyle = batch.stroke;
        ctx.stroke(batch.path);
      }
      // Subtle leaders preserve the true geographic anchor of displaced marks.
      if (mode === "geography" && spacing > 0) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = paint.leader;
        ctx.lineWidth = 0.6 / t.k;
        ctx.beginPath();
        for (const n of visible) {
          const a = anchors.get(n.id)!,
            p = points.get(n.id)!;
          if (Math.hypot(p[0] - a[0], p[1] - a[1]) * t.k < 3) continue;
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke();
      }
      for (const n of [...visible].sort(
        (a, b) => a.count - b.count || b.id - a.id,
      )) {
        const p = points.get(n.id)!;
        const relative = Math.sqrt(n.count / maxCount);
        const rPx = radii.get(n.id)!;
        ctx.globalAlpha = selected === null || connected.has(n.id) ? 1 : 0.18;
        ctx.fillStyle = color(community ?? n.community);
        ctx.beginPath();
        ctx.arc(p[0], p[1], rPx / t.k, 0, Math.PI * 2);
        ctx.fill();
        if (relative > 0.3 || n.id === selected) {
          ctx.strokeStyle =
            n.id === selected ? paint.selectedOutline : paint.outline;
          ctx.lineWidth = (n.id === selected ? 2 : 0.65) / t.k;
          ctx.beginPath();
          ctx.arc(
            p[0],
            p[1],
            (rPx + (n.id === selected ? 3 : 0)) / t.k,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.globalAlpha = 1;
      const labelCount = regional ? 6 : w < 400 ? 0 : t.k >= 2 ? 20 : 6;
      const candidates = [...visible].sort(
        (a, b) =>
          +(b.id === selected) - +(a.id === selected) ||
          +connected.has(b.id) - +connected.has(a.id) ||
          b.count - a.count,
      );
      const placed: { id: number; x: number; y: number; width: number }[] = [];
      for (const n of candidates) {
        if (placed.length >= labelCount) break;
        if (regional && viewport) {
          const point = anchors.get(n.id)!;
          const px = (point[0] - frame.origin[0]) / frame.scale;
          const py = (point[1] - frame.origin[1]) / frame.scale;
          const [left, top, right, bottom] = viewport.bounds;
          if (px >= left && px <= right && py >= top && py <= bottom) continue;
        }
        if (selected !== null && !connected.has(n.id)) continue;
        const p = screen.get(n.id)!,
          r = radii.get(n.id) || 3;
        const textWidth = Math.min(
          regional ? (w - 32) / 2 : 220,
          data.institutions[n.id].label.length * 6.6 + 8,
        );
        const slots = [
          [p[0] + r + 5, p[1] - 8],
          [p[0] - r - textWidth - 5, p[1] - 8],
          [p[0] - textWidth / 2, p[1] + r + 3],
          [p[0] - textWidth / 2, p[1] - r - 19],
        ];
        if (regional) {
          slots.length = 0;
          for (let y = 4; y < h - 15; y += 18) {
            slots.push([4, y], [w / 2 + 4, y]);
          }
          slots.sort(
            (a, b) =>
              Math.hypot(a[0] + textWidth / 2 - p[0], a[1] - p[1]) -
              Math.hypot(b[0] + textWidth / 2 - p[0], b[1] - p[1]),
          );
        }
        const slot = slots.find(
          ([x, y]) =>
            x >= 2 &&
            x + textWidth <= w - 2 &&
            y >= 2 &&
            y + 16 <= h - 2 &&
            !placed.some(
              (b) =>
                x < b.x + b.width + 4 &&
                x + textWidth + 4 > b.x &&
                y < b.y + 18 &&
                y + 18 > b.y,
            ),
        );
        if (!slot) continue;
        const [x, y] = slot;
        placed.push({ id: n.id, x, y, width: textWidth });
        if (regional) {
          ctx.strokeStyle = color(community ?? n.community);
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(Math.max(x, Math.min(x + textWidth, p[0])), y + 8);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      setLabels(placed);
    };
    redraw.current();
  }, [
    size,
    land,
    data,
    result,
    selected,
    community,
    mode,
    regional,
    viewport,
    offsets,
    paint,
    color,
  ]);
  return (
    <div className="map-canvas" ref={host}>
      <canvas
        ref={canvas}
        data-node-hovered={hover !== null}
        aria-label={`Institution collaboration ${mode === "network" ? "network" : "world map"}. Drag to pan, scroll to zoom; select institutions here or through the institution list.`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect(),
            x = e.clientX - rect.left,
            y = e.clientY - rect.top;
          const found = pick.current(x, y);
          setHover(found ? { id: found.id, x, y } : null);
        }}
        onMouseLeave={() => setHover(null)}
      />
      {regional && viewportRect && (
        <svg
          className="map-viewport-overlay"
          width={size[0]}
          height={size[1]}
          aria-label="Main map visible region"
        >
          <rect
            x={viewportRect[0]}
            y={viewportRect[1]}
            width={viewportRect[2]}
            height={viewportRect[3]}
          />
        </svg>
      )}
      {labels.map((label) => (
        <div
          key={label.id}
          className={`map-label ${label.id === selected ? "selected" : ""}`}
          style={{ left: label.x, top: label.y, width: label.width }}
          title={data.institutions[label.id].label}
          data-institution={label.id}
        >
          {data.institutions[label.id].label}
        </div>
      ))}
      {mode === "network" && (
        <span className="renderer-status">
          Canvas · {number(result.nodes.length)} nodes
        </span>
      )}
      {!result.nodes.length && (
        <div className="viz-empty">No institutions match these filters.</div>
      )}
      {error && <div className="viz-error">{error}</div>}
      {hover && (
        <div
          className="map-tooltip"
          style={{
            left: Math.max(8, Math.min(hover.x + 12, size[0] - 220)),
            maxWidth: Math.min(210, size[0] - 16),
            top: Math.max(8, hover.y - 50),
          }}
        >
          <strong>{data.institutions[hover.id].label}</strong>
          <span>
            {number(result.nodes.find((n) => n.id === hover.id)?.count || 0)}{" "}
            papers in selection
          </span>
        </div>
      )}
      <div
        className="map-controls"
        data-corner={controlsCorner}
        style={{
          top: controlsCorner.startsWith("top") ? 38 : "auto",
          bottom: controlsCorner.startsWith("bottom") ? 12 : "auto",
          left: controlsCorner.endsWith("left") ? 12 : "auto",
          right: controlsCorner.endsWith("right") ? 12 : "auto",
          transform: "none",
          flexDirection: "row",
        }}
      >
        <button
          aria-label={`Zoom in ${regional ? "collaborator map" : mode === "network" ? "network" : "map"}`}
          onClick={() =>
            d3.select(canvas.current!).call(zoomRef.current!.scaleBy, 1.6)
          }
        >
          <Icon name="plus" size={15} />
        </button>
        <button
          aria-label={`Zoom out ${regional ? "collaborator map" : mode === "network" ? "network" : "map"}`}
          onClick={() =>
            d3.select(canvas.current!).call(zoomRef.current!.scaleBy, 1 / 1.6)
          }
        >
          <Icon name="minus" size={15} />
        </button>
        <button
          aria-label={`Reset ${regional ? "collaborator map" : mode === "network" ? "network" : "map"} camera`}
          onClick={() =>
            d3
              .select(canvas.current!)
              .call(zoomRef.current!.transform, d3.zoomIdentity)
          }
        >
          <Icon name="reset" size={14} />
        </button>
      </div>
      <span className="map-attribution">
        {mode === "network"
          ? "Fixed collaboration layout · drag to explore"
          : "Equal Earth · Natural Earth"}
      </span>
    </div>
  );
}
