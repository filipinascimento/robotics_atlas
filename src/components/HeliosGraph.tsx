import { useTheme } from "../theme";
import { useEffect, useRef, useState } from "react";
import type { Helios, SelectionBehaviorOptions } from "helios-web";
import type Network from "helios-network";
import type { Atlas, Result } from "../data";
import { number } from "../data";
import { Icon } from "./Icon";
// Public runtime methods omitted from the upstream 0.10 TypeScript declarations.
type Renderer = Helios & {
  background(color: string): unknown;
  labels(options: { fill: string; outlineColor: string }): unknown;
  destroy(): void;
  requestRender(): void;
  setLayoutPositionsFromNodeAttribute(name: string): boolean;
  replaceNetwork(
    network: Network,
    options: Record<string, unknown>,
  ): Promise<Helios>;
};
type Session = {
  disposed: boolean;
  revision: number;
  helios: Renderer | null;
  queue: Promise<void>;
  container: HTMLDivElement;
  ids: number[];
};
export default function CollaborationGraph({
  data,
  result,
  selected,
  community,
  onSelect,
  onUnavailable,
}: {
  onUnavailable?: () => void;
  data: Atlas;
  result: Result;
  selected: number | null;
  community: number | null;
  onSelect: (id: number | null) => void;
}) {
  const paint = useTheme();
  const { color } = paint;
  const host = useRef<HTMLDivElement>(null),
    session = useRef<Session | null>(null),
    select = useRef(onSelect),
    selection = useRef(selected);
  const [status, setStatus] = useState("Preparing collaboration network…"),
    [error, setError] = useState(""),
    [generation, setGeneration] = useState(0);
  useEffect(() => {
    select.current = onSelect;
    selection.current = selected;
    const s = session.current;
    if (!s?.helios) return;
    const i = selected === null ? -1 : s.ids.indexOf(selected);
    s.helios.behavior.selection.selectNodes(i < 0 ? [] : [i]);
    s.helios.requestRender();
  }, [onSelect, selected]);
  useEffect(() => {
    const container = document.createElement("div");
    container.className = "helios-mount";
    host.current!.append(container);
    const s: Session = {
      disposed: false,
      revision: 0,
      helios: null,
      queue: Promise.resolve(),
      container,
      ids: [],
    };
    session.current = s;
    return () => {
      s.disposed = true;
      session.current = null;
      container.remove();
      void s.queue.finally(() => s.helios?.destroy());
    };
  }, [data, generation]);
  useEffect(() => {
    const s = session.current;
    if (!s || !result.nodes.length) return;
    const revision = ++s.revision;
    // Serialize graph replacements. Preserve the GPU context and compiled shaders;
    // disposing the entire renderer on a filter change is particularly expensive.
    s.queue = s.queue
      .then(async () => {
        if (s.disposed || revision !== s.revision) return;
        const started = performance.now();
        const [
          { default: HeliosNetwork, AttributeType },
          { Helios: HeliosClass },
        ] = await Promise.all([import("helios-network"), import("helios-web")]);
        if (s.disposed || revision !== s.revision) return;
        const graph = await HeliosNetwork.create({ directed: false });
        if (s.disposed || revision !== s.revision) {
          graph.dispose();
          return;
        }
        let owned = false;
        try {
          const nodes = result.nodes,
            index = new Map(nodes.map((n, i) => [n.id, i]));
          graph.addNodes(nodes.length);
          graph.addEdges(
            new Uint32Array(
              result.edges.flatMap((e) => [
                index.get(e.source)!,
                index.get(e.target)!,
              ]),
            ),
          );
          graph.nodeAttribute(
            "label",
            nodes.map((n) => data.institutions[n.id].label),
          );
          graph.nodeAttribute(
            "position",
            nodes.map((n) => [...data.institutions[n.id].xy, 0]),
            { type: AttributeType.Float, dimension: 3 },
          );
          graph.nodeAttribute(
            "atlasColor",
            nodes.map((n) => {
              const hex = color(community ?? n.community).slice(1);
              return [
                parseInt(hex.slice(0, 2), 16) / 255,
                parseInt(hex.slice(2, 4), 16) / 255,
                parseInt(hex.slice(4, 6), 16) / 255,
                1,
              ];
            }),
            { type: AttributeType.Float, dimension: 4 },
          );
          const max = Math.max(...nodes.map((n) => n.count), 1);
          graph.nodeAttribute(
            "radius",
            nodes.map((n) => 0.8 + Math.sqrt(n.count / max) * 9),
            { type: AttributeType.Float },
          );
          const first = !s.helios;
          if (first) {
            s.helios = new HeliosClass(graph, {
              container: s.container,
              mode: "2d",
              renderer: "auto",
              antialias: false,
              supersampling: 1,
              edgeFastRendering: true,
              transparencyModeEdges: "alpha",
              interpolation: false,
              background: paint.background,
              camera: {
                autoFit: false,
                largeNetworkStartupFit: false,
                maxZoom: 10000,
              },
              ui: false,
              quickControls: false,
              storage: false,
              session: false,
              autoCleanup: false,
              disposeNetworkOnDestroy: true,
              layout: { type: "static" },
              behaviors: {
                layout: { positionAttribute: "position" },
                labels: {
                  enabled: true,
                  source: "label",
                  selectionMode: "ranked",
                  maxVisible: 35,
                  minScreenRadiusPx: 2,
                  fontSizeScale: 1.15,
                  maxRows: 2,
                },
                selection: {
                  selectedConnectedEdges: true,
                  otherSelectedNodeStyle: { opacityMul: 0.22, sizeMul: 0.85 },
                  otherSelectedEdgeStyle: { opacityMul: 0.035, widthMul: 0.65 },
                  otherSelectedNodeTone: { enabled: false },
                  otherSelectedEdgeTone: { enabled: false },
                } as unknown as SelectionBehaviorOptions, // Runtime uses *Mul fields; upstream declarations omit them.
                legends: { enabled: false },
                hover: { hoverLabel: true, edgeHover: false },
              },
            }) as Renderer;
            owned = true;
            await s.helios.ready;
          } else {
            s.helios!.behavior.selection.clearSelection();
            await s.helios!.replaceNetwork(graph, {
              keepCamera: true,
              keepMappers: true,
              recreateRenderer: false,
              disposeOld: true,
              frame: false,
              layout: { type: "static" },
            });
            owned = true;
          }
          if (s.disposed) return;
          const h = s.helios!;
          h.background(paint.background);
          h.labels({ fill: paint.text, outlineColor: paint.labelHalo });
          s.ids = nodes.map((n) => n.id);
          h.setLayoutPositionsFromNodeAttribute("position");
          if (first) {
            const m = h.behavior.mappers;
            m.setChannelConfig("node", "color", {
              attributes: "atlasColor",
              type: "passthrough",
            });
            m.setChannelConfig("node", "opacity", {
              type: "constant",
              value: 1,
            });
            m.setChannelConfig("node", "size", {
              attributes: "radius",
              type: "passthrough",
            });
            m.setChannelConfig("edge", "color", {
              type: "nodeAttribute",
              nodeAttribute: "atlasColor",
              endpoints: "both",
            });
            m.setChannelConfig("edge", "opacity", {
              type: "constant",
              value: 0.65,
            });
            m.setChannelConfig("edge", "width", {
              type: "constant",
              value: 1.25,
            });
            h.addEventListener("graph:click", (event) => {
              const { kind, index } = (
                event as CustomEvent<{ kind: string; index: number }>
              ).detail;
              select.current(kind === "node" ? (s.ids[index] ?? null) : null);
            });
            h.addEventListener("node:hover", (event) => {
              const { state } = (event as CustomEvent<{ state: string }>)
                .detail;
              s.container.dataset.nodeHovered = String(state !== "out");
            });
            h.frameNetwork({ animate: false });
          }
          const selectedIndex =
            selection.current === null ? -1 : s.ids.indexOf(selection.current);
          h.behavior.selection.selectNodes(
            selectedIndex < 0 ? [] : [selectedIndex],
          );
          h.requestRender();
          setError("");
          setStatus(
            `Helios 0.10 · ${number(nodes.length)} nodes · ${Math.round(performance.now() - started)} ms to ${first ? "initialize" : "update"}`,
          );
        } catch (e) {
          if (!owned) graph.dispose();
          throw e;
        }
      })
      .catch((e) => {
        if (!s.disposed) {
          setError(e instanceof Error ? e.message : String(e));
          onUnavailable?.();
        }
      });
  }, [data, result, community, generation, onUnavailable, paint, color]);
  return (
    <div className="collaboration-canvas">
      <div
        ref={host}
        className="helios-host"
        style={{ visibility: result.nodes.length ? "visible" : "hidden" }}
      />
      {!result.nodes.length ? (
        <div className="viz-empty">No institutions match these filters.</div>
      ) : error ? (
        <div className="viz-error">
          <strong>Network renderer could not start</strong>
          <p>{error}</p>
          <button
            onClick={() => {
              setError("");
              setGeneration((n) => n + 1);
            }}
          >
            Retry renderer
          </button>
          <p>The geography view and institution explorer remain available.</p>
        </div>
      ) : (
        <span className="renderer-status">{status}</span>
      )}
      <button
        className="network-fit"
        aria-label="Fit collaboration network"
        onClick={() => session.current?.helios?.frameNetwork({ animate: true })}
      >
        <Icon name="expand" size={15} /> Fit network
      </button>
    </div>
  );
}
