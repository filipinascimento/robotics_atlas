import { useTheme } from "./theme";
import { ThemeControl } from "./components/ThemeControl";
import { CornerHandle } from "./components/CornerHandle";
import type { Corner } from "./components/CornerHandle";
import { TIMELINE_START } from "./data";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as d3 from "d3";
import type { Atlas, Dataset, Filters, Result, View } from "./data";
import { compact, number, shortLabel } from "./data";
import { Icon } from "./components/Icon";
import { CommunityGraph } from "./components/CommunityGraph";
import type { MapViewport } from "./components/GeoMap";
import { GeoMap } from "./components/GeoMap";
import { Evolution } from "./components/Evolution";
import { Timeline } from "./components/Timeline";
import { Subcommunities } from "./components/Subcommunities";
import "./App.css";
const CollaborationGraph = lazy(
  () => import("./components/CollaborationGraph"),
);
const params = new URLSearchParams(location.search);
const initialDataset: Dataset =
  params.get("dataset") === "humanoid" ? "humanoid" : "robotics";
const initialView: View =
  (({
    institutions: "geography",
    overview: "communities",
    connected: "communities",
  }[params.get("view") || ""] || params.get("view")) as View) || "communities";
const views: { id: View; label: string; icon: string }[] = [
  { id: "communities", label: "Communities", icon: "network" },
  { id: "geography", label: "Geography", icon: "globe" },
  { id: "collaborations", label: "Collaborations", icon: "network" },
  { id: "evolution", label: "Evolution", icon: "timeline" },
];
const empty: Result = {
  nodes: [],
  edges: [],
  eligibleEdges: 0,
  selectedEdges: [],
  communityCounts: [],
  citationLinks: [],
  papers: 0,
  ms: 0,
};
function Spark({
  values,
  stroke,
  width = 62,
  height = 22,
}: {
  values: number[];
  stroke: string;
  width?: number;
  height?: number;
}) {
  const x = d3
      .scaleLinear()
      .domain([0, Math.max(1, values.length - 1)])
      .range([0, width]),
    y = d3
      .scaleLinear()
      .domain([0, Math.max(...values, 1)])
      .range([height - 2, 2]);
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path
        d={
          d3
            .area<number>()
            .x((_, i) => x(i))
            .y0(height)
            .y1((v) => y(v))
            .curve(d3.curveMonotoneX)(values) || ""
        }
        fill={stroke}
        opacity=".09"
      />
      <path
        d={
          d3
            .line<number>()
            .x((_, i) => x(i))
            .y((v) => y(v))
            .curve(d3.curveMonotoneX)(values) || ""
        }
        stroke={stroke}
        fill="none"
        strokeWidth="1.25"
      />
    </svg>
  );
}
function App() {
  const { color } = useTheme();
  const [dataset, setDataset] = useState<Dataset>(initialDataset),
    [data, setData] = useState<Atlas | null>(null),
    [result, setResult] = useState<Result>(empty),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>(
      views.some((v) => v.id === initialView) ? initialView : "communities",
    ),
    [timelineExpanded, setTimelineExpanded] = useState(false),
    [showInfo, setShowInfo] = useState(false),
    [sideOpen, setSideOpen] = useState(false);
  const [corners, setCorners] = useState<{
    overview: Corner;
    neighbors: Corner;
  }>({ overview: "bottom-right", neighbors: "bottom-left" });
  const movePanel = (panel: "overview" | "neighbors", corner: Corner) => {
    setCorners((previous) => {
      const other = panel === "overview" ? "neighbors" : "overview";
      return {
        ...previous,
        [panel]: corner,
        [other]: previous[other] === corner ? previous[panel] : previous[other],
      };
    });
  };
  const [mapViewport, setMapViewport] = useState<MapViewport>();
  const [filters, setFilters] = useState<Filters>({
    start: TIMELINE_START,
    end: 2022,
    community: null,
    query: "",
    minPapers: 3,
    edgeLimit: 5000,
    institution: null,
    neighborhood: false,
  });
  const [search, setSearch] = useState(""),
    [detailTab, setDetailTab] = useState<"institutions" | "subcommunities">(
      "institutions",
    );
  const worker = useRef<Worker | null>(null),
    request = useRef(0),
    latest = useRef(0);
  useEffect(() => {
    // Fetch, decompress, parse and filter in the worker. The UI never receives
    // the full collaboration history, only the currently displayed edges.
    const w = new Worker(new URL("./filter.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e) => {
      if (e.data.type === "ready") {
        const atlas = e.data.data as Atlas;
        setData(atlas);
        setFilters((f) => ({
          ...f,
          start: TIMELINE_START,
          end: atlas.years.at(-1)!,
          community: null,
          institution: null,
          neighborhood: false,
          query: "",
        }));
        setLoading(false);
      } else if (e.data.type === "error") {
        setError(e.data.message);
        setLoading(false);
        setBusy(false);
      } else if (e.data.id === latest.current) {
        setResult(e.data.result);
        setBusy(false);
      }
    };
    w.onerror = () => {
      setError("The data worker could not start. Reload to retry.");
      setLoading(false);
      setBusy(false);
    };
    w.postMessage({
      type: "load",
      url: new URL(
        `${import.meta.env.BASE_URL}data/atlas_${dataset}.json`,
        document.baseURI,
      ).href,
    });
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, [dataset]);
  const filterKey = JSON.stringify({
    ...filters,
    institution: filters.institution,
  });
  useEffect(() => {
    if (!data || !worker.current) return;
    const id = ++request.current;
    latest.current = id;
    const timer = setTimeout(() => {
      setBusy(true);
      worker.current?.postMessage({
        type: "filter",
        filters: JSON.parse(filterKey),
        id,
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [data, filterKey]);
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((f) => ({ ...f, query: search })),
      160,
    );
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("dataset", dataset);
    url.searchParams.set("view", view);
    history.replaceState(null, "", url);
  }, [dataset, view]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showInfo) {
          setShowInfo(false);
          return;
        }
        setFilters((f) => ({
          ...f,
          community: null,
          institution: null,
          neighborhood: false,
        }));
        setShowInfo(false);
        setSideOpen(false);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [showInfo]);
  const selectCommunity = useCallback((community: number | null) => {
    setFilters((f) => ({ ...f, community }));
    setDetailTab("institutions");
  }, []);
  const selectInstitution = useCallback((institution: number | null) => {
    setFilters((f) => ({
      ...f,
      institution,
      neighborhood: institution === null ? false : f.neighborhood,
    }));
    if (institution !== null) setSideOpen(true);
  }, []);
  const changeYears = useCallback(
    (start: number, end: number) => setFilters((f) => ({ ...f, start, end })),
    [],
  );
  const selectedInstitution =
    data && filters.institution !== null
      ? data.institutions[filters.institution]
      : undefined;
  const showNeighbors =
    view === "geography" &&
    !!selectedInstitution &&
    !!mapViewport &&
    mapViewport.zoom >= 2;
  const occupiedCorners =
    view === "geography"
      ? [corners.overview, ...(showNeighbors ? [corners.neighbors] : [])]
      : [];
  const controlsCorner = (
    ["top-left", "top-right", "bottom-left", "bottom-right"] as Corner[]
  ).find((corner) => !occupiedCorners.includes(corner))!;
  const activeInstitution = result.nodes.find(
    (n) => n.id === filters.institution,
  );
  const selectedCommunity =
    data && filters.community !== null
      ? data.communities[filters.community]
      : undefined;
  const institutionShares = useMemo(() => {
    if (!selectedInstitution || !data) return undefined;
    const values = Array(data.communities.length + 1).fill(0) as number[];
    for (const [year, c, n] of selectedInstitution.counts)
      if (year >= filters.start && year <= filters.end)
        values[c < 0 ? data.communities.length : c] += n;
    return values;
  }, [selectedInstitution, data, filters.start, filters.end]);
  const neighborhoodResult = useMemo(() => {
    const edges = (result.selectedEdges || []).slice(0, 5);
    const ids = new Set([
      filters.institution,
      ...edges.flatMap((e) => [e.source, e.target]),
    ]);
    return {
      ...result,
      edges,
      nodes: result.nodes.filter((n) => ids.has(n.id)),
    };
  }, [result, filters.institution]);
  const shareTotal = institutionShares?.reduce((a, b) => a + b, 0) || 0;
  const reset = () => {
    setFilters({
      start: TIMELINE_START,
      end: data!.years.at(-1)!,
      community: null,
      query: "",
      minPapers: 3,
      edgeLimit: 5000,
      institution: null,
      neighborhood: false,
    });
    setSearch("");
  };
  return (
    <div className="atlas-app" aria-busy={loading || busy}>
      <header className="app-header">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="Robotics Atlas home"
        >
          <span className="brand-symbol">
            <Icon name="network" size={23} />
          </span>
          <span>
            ROBOTICS<span className="brand-atlas">ATLAS</span>
          </span>
        </a>
        <nav className="view-tabs" aria-label="Atlas views">
          {views.map((v) => (
            <button
              key={v.id}
              aria-pressed={view === v.id}
              className={view === v.id ? "active" : ""}
              onClick={() => setView(v.id)}
            >
              <Icon name={v.icon} size={16} />
              {v.label}
            </button>
          ))}
        </nav>
        <div className="dataset-switch" aria-label="Research dataset">
          {(["robotics", "humanoid"] as Dataset[]).map((d) => (
            <button
              key={d}
              aria-pressed={dataset === d}
              className={dataset === d ? "active" : ""}
              onClick={() => {
                if (d === dataset) return;
                setLoading(true);
                setError("");
                setData(null);
                setResult(empty);
                setSearch("");
                setDataset(d);
              }}
            >
              {d === "robotics" ? "All robotics" : "Humanoid"}
            </button>
          ))}
        </div>
        <label className="global-search">
          <Icon name="search" size={16} />
          <input
            aria-label="Search institutions or places"
            placeholder="Find an institution or place…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button aria-label="Clear search" onClick={() => setSearch("")}>
              <Icon name="close" size={13} />
            </button>
          )}
        </label>
        <button
          className="icon-button about-button"
          aria-label="About data and methodology"
          onClick={() => setShowInfo(true)}
        >
          <Icon name="info" />
        </button>
        <div className="view-actions">
          <button
            className="mobile-inspector"
            aria-label="Toggle explorer"
            onClick={() => setSideOpen((v) => !v)}
          >
            <Icon name="filter" size={16} />
          </button>
          <ThemeControl />
        </div>
      </header>
      {loading ? (
        <main className="loading-state">
          <div className="loading-orbit" />
          <p>Mapping the robotics landscape</p>
          <span>
            Loading {dataset === "robotics" ? "robotics" : "humanoid"}{" "}
            communities and collaboration evidence…
          </span>
        </main>
      ) : error ? (
        <main className="loading-state">
          <h2>Unable to load the atlas</h2>
          <p>{error}</p>
          <button onClick={() => location.reload()}>Retry</button>
        </main>
      ) : (
        data && (
          <div
            className={`workspace ${view === "evolution" ? "evolution-workspace" : ""}`}
          >
            <aside className="community-sidebar">
              <div className="section-label">
                <span>COMMUNITIES</span>
                <span>
                  {data.communities.length.toString().padStart(2, "0")}
                </span>
              </div>
              <button
                className={`all-communities ${filters.community === null ? "active" : ""}`}
                onClick={() => selectCommunity(null)}
              >
                <span className="all-dot" />
                All research areas<span>{compact(result.papers)}</span>
              </button>
              <div className="community-list">
                {data.communities.map((c, i) => (
                  <button
                    className={`community-row ${filters.community === i ? "active" : ""}`}
                    key={c.id}
                    onClick={() =>
                      selectCommunity(filters.community === i ? null : i)
                    }
                    aria-pressed={filters.community === i}
                    style={
                      { "--community-color": color(i) } as React.CSSProperties
                    }
                  >
                    <span
                      className="community-marker"
                      style={{ background: color(i) }}
                    />
                    <span className="community-row-content">
                      <span className="community-name">
                        {shortLabel(c.label)}
                      </span>
                      <span className="community-row-bottom">
                        <span>
                          {compact(result.communityCounts[i] || 0)} papers{" "}
                          <b>
                            {(
                              ((result.communityCounts[i] || 0) /
                                Math.max(result.papers, 1)) *
                              100
                            ).toFixed(1)}
                            %
                          </b>
                        </span>
                        <Spark
                          values={c.timeline
                            .filter((p) => p.year >= TIMELINE_START)
                            .map((p) => p.percent)}
                          stroke={color(i)}
                        />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="sidebar-footer">
                <div className="other-legend">
                  <i style={{ background: color(-1) }} />
                  Other communities{" "}
                  <span>
                    {compact(
                      Math.max(
                        0,
                        result.papers -
                          result.communityCounts.reduce((a, b) => a + b, 0),
                      ),
                    )}
                  </span>
                </div>
              </div>
            </aside>
            <main className="main-workspace">
              <div className="workspace-toolbar">
                <div className="summary-stats">
                  <div>
                    <strong>{compact(result.papers)}</strong>
                    <span>papers</span>
                  </div>
                  <div>
                    <strong>{compact(result.nodes.length)}</strong>
                    <span>institutions</span>
                  </div>
                  <div>
                    <strong>{compact(result.eligibleEdges)}</strong>
                    <span>collaborations</span>
                  </div>
                </div>
                <div className="selection-strip">
                  {selectedCommunity && (
                    <button
                      onClick={() => selectCommunity(null)}
                      style={{ color: color(filters.community!) }}
                    >
                      {shortLabel(selectedCommunity.label)}
                      <Icon name="close" size={11} />
                    </button>
                  )}
                  {filters.query && (
                    <button onClick={() => setSearch("")}>
                      “{filters.query}”<Icon name="close" size={11} />
                    </button>
                  )}
                  {selectedInstitution && (
                    <button
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          institution: null,
                          neighborhood: false,
                        }))
                      }
                    >
                      {selectedInstitution.label}
                      <Icon name="close" size={11} />
                    </button>
                  )}
                </div>
              </div>
              {view === "evolution" ? (
                <Evolution
                  key={dataset}
                  data={data}
                  filters={filters}
                  onCommunity={selectCommunity}
                  onYears={changeYears}
                />
              ) : (
                <>
                  <div
                    className={`visualization-stage view-${view} ${timelineExpanded ? "timeline-is-expanded" : ""}`}
                  >
                    {view !== "collaborations" && (
                      <section
                        data-corner={
                          view === "geography" ? corners.overview : undefined
                        }
                        className={`viz-pane communities-pane ${view === "geography" ? "pane-floating" : "pane-primary"}`}
                        aria-label={
                          view === "geography"
                            ? "Community overview panel"
                            : "Main community view"
                        }
                      >
                        <div className="pane-heading">
                          {view === "geography" && (
                            <CornerHandle
                              name="communities"
                              corner={corners.overview}
                              onCorner={(corner) =>
                                movePanel("overview", corner)
                              }
                            />
                          )}
                          <div>
                            <span className="pane-index">01</span>
                            <strong>Research communities</strong>
                            <span className="pane-subtitle">
                              Citation connections
                            </span>
                          </div>
                          <button
                            className="focus-switch"
                            aria-label={
                              view === "geography"
                                ? "Make communities primary"
                                : "Swap map and communities"
                            }
                            title={
                              view === "geography"
                                ? "Make communities primary"
                                : "Make map primary"
                            }
                            onClick={() =>
                              setView(
                                view === "geography"
                                  ? "communities"
                                  : "geography",
                              )
                            }
                          >
                            <Icon
                              name={view === "geography" ? "expand" : "globe"}
                              size={14}
                            />
                            {view !== "geography" && <span>Focus map</span>}
                          </button>
                        </div>
                        <div className="community-graph-wrap">
                          <CommunityGraph
                            data={data}
                            result={result}
                            selected={filters.community}
                            onSelect={selectCommunity}
                            onBackground={() => selectInstitution(null)}
                            representation={institutionShares}
                            compactView={view === "geography"}
                          />
                        </div>
                        <div className="pane-footer">
                          <span>
                            Node area ∝ publications · Width = citation affinity
                          </span>
                        </div>
                      </section>
                    )}
                    {view !== "collaborations" && (
                      <section
                        data-corner={
                          view !== "geography" ? corners.overview : undefined
                        }
                        className={`viz-pane geography-pane ${view === "geography" ? "pane-primary" : "pane-floating"}`}
                        aria-label={
                          view === "geography"
                            ? "Main map view"
                            : "Map overview panel"
                        }
                      >
                        <div className="pane-heading">
                          {view !== "geography" && (
                            <CornerHandle
                              name="map"
                              corner={corners.overview}
                              onCorner={(corner) =>
                                movePanel("overview", corner)
                              }
                            />
                          )}
                          <div>
                            <span className="pane-index">02</span>
                            <strong>Institutional footprint</strong>
                            <span className="pane-subtitle">
                              Geographic collaboration
                            </span>
                          </div>
                          <button
                            className="focus-switch"
                            aria-label={
                              view === "geography"
                                ? "Swap map and communities"
                                : "Make map primary"
                            }
                            title={
                              view === "geography"
                                ? "Make communities primary"
                                : "Make map primary"
                            }
                            onClick={() =>
                              setView(
                                view === "geography"
                                  ? "communities"
                                  : "geography",
                              )
                            }
                          >
                            <Icon
                              name={view === "geography" ? "network" : "expand"}
                              size={14}
                            />
                            {view === "geography" && (
                              <span>Focus communities</span>
                            )}
                          </button>
                        </div>
                        <GeoMap
                          data={data}
                          result={result}
                          selected={filters.institution}
                          community={filters.community}
                          onSelect={selectInstitution}
                          onViewport={setMapViewport}
                          controlsCorner={controlsCorner}
                        />
                        <div className="pane-footer">
                          <span>
                            Node size = papers · Color ={" "}
                            {selectedCommunity ? "selected" : "strongest named"}{" "}
                            community
                          </span>
                          <button onClick={() => setView("collaborations")}>
                            Explore network <Icon name="arrow" size={12} />
                          </button>
                        </div>
                      </section>
                    )}
                    {view === "geography" &&
                      selectedInstitution &&
                      mapViewport &&
                      mapViewport.zoom >= 2 && (
                        <section
                          data-corner={corners.neighbors}
                          className="viz-pane pane-floating neighbor-pane"
                          aria-label="Top connected institutions map"
                        >
                          <div className="pane-heading">
                            <CornerHandle
                              name="collaborators"
                              corner={corners.neighbors}
                              onCorner={(corner) =>
                                movePanel("neighbors", corner)
                              }
                            />
                            <strong>
                              Top {neighborhoodResult.edges.length}{" "}
                              collaborators
                            </strong>
                          </div>
                          {neighborhoodResult.edges.length ? (
                            <GeoMap
                              data={data}
                              result={neighborhoodResult}
                              selected={filters.institution}
                              community={filters.community}
                              onSelect={selectInstitution}
                              regional
                              viewport={mapViewport}
                            />
                          ) : (
                            <div className="neighbor-empty">
                              No connections meet the current year, community,
                              and shared-paper filters.
                            </div>
                          )}
                          <span
                            className="neighbor-caption"
                            title={selectedInstitution.label}
                          >
                            {selectedInstitution.label} · ranked by shared
                            papers
                          </span>
                        </section>
                      )}
                    {view === "collaborations" && (
                      <section className="viz-pane network-pane">
                        <div className="pane-heading">
                          <div>
                            <span className="pane-index">03</span>
                            <strong>Institution collaboration network</strong>
                            <span className="pane-subtitle">
                              Shared publications · fixed force layout
                            </span>
                          </div>
                          <button onClick={() => setView("communities")}>
                            <Icon name="network" size={14} /> Communities
                          </button>
                        </div>
                        <Suspense
                          fallback={
                            <div className="viz-loading">
                              Loading collaboration network…
                            </div>
                          }
                        >
                          <CollaborationGraph
                            data={data}
                            result={result}
                            selected={filters.institution}
                            community={filters.community}
                            onSelect={selectInstitution}
                          />
                        </Suspense>
                      </section>
                    )}
                  </div>
                  <div className="edge-toolbar">
                    <div>
                      <Icon name="network" size={14} />
                      <span>COLLABORATION EDGES</span>
                      <label>
                        Shared papers{" "}
                        <select
                          aria-label="Minimum shared papers"
                          value={filters.minPapers}
                          onChange={(e) => {
                            const minPapers = +e.currentTarget.value;
                            setFilters((f) => ({ ...f, minPapers }));
                          }}
                        >
                          {[1, 2, 3, 5, 10, 20, 50].map((n) => (
                            <option key={n} value={n}>
                              ≥ {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Show{" "}
                        <select
                          aria-label="Edge display limit"
                          value={filters.edgeLimit}
                          onChange={(e) => {
                            const edgeLimit = +e.currentTarget.value;
                            setFilters((f) => ({ ...f, edgeLimit }));
                          }}
                        >
                          <option value="500">Top 500</option>
                          <option value="1500">Top 1,500</option>
                          <option value="5000">Top 5,000</option>
                          <option value="0">All edges</option>
                        </select>
                      </label>
                    </div>
                    <span className="edge-count">
                      {number(result.edges.length)} /{" "}
                      {number(result.eligibleEdges)} edges shown
                      {filters.institution !== null
                        ? " · selected links retained"
                        : ""}
                    </span>
                  </div>
                  <Timeline
                    data={data}
                    filters={filters}
                    institution={selectedInstitution}
                    onChange={changeYears}
                    expanded={timelineExpanded}
                    onExpand={() => setTimelineExpanded((v) => !v)}
                  />
                </>
              )}
            </main>
            <aside className={`inspector ${sideOpen ? "open" : ""}`}>
              <div className="inspector-heading">
                <button
                  className="mobile-inspector"
                  aria-label="Close explorer"
                  onClick={() => setSideOpen(false)}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
              {selectedInstitution && (
                <>
                  <div className="institution-detail">
                    <div className="detail-top">
                      <Icon name="globe" size={20} />
                      <button
                        aria-label="Clear institution selection"
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            institution: null,
                            neighborhood: false,
                          }))
                        }
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                    <h2>{selectedInstitution.label}</h2>
                    <p>{selectedInstitution.address}</p>
                    <div className="institution-metric">
                      <strong>{number(shareTotal)}</strong>
                      <span>
                        papers · {filters.start}—{filters.end}
                      </span>
                    </div>
                    {!activeInstitution && (
                      <p className="no-match-note">
                        This institution is outside the current community or
                        search filter.
                      </p>
                    )}
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={filters.neighborhood}
                        onChange={(e) => {
                          const neighborhood = e.currentTarget.checked;
                          setFilters((f) => ({ ...f, neighborhood }));
                        }}
                      />
                      <span>Only this institution’s connections</span>
                    </label>
                  </div>
                  <div className="representation">
                    <div className="section-label">
                      <span>COMMUNITY PARTICIPATION</span>
                    </div>
                    <p>
                      Share of this institution’s papers in the selected period.
                    </p>
                    <div className="participation-strip">
                      {institutionShares?.map((n, i) => (
                        <span
                          key={i}
                          style={{ background: color(i), flex: n }}
                          title={`${data.communities[i]?.label || "Other communities"}: ${n}`}
                        />
                      ))}
                    </div>
                    {institutionShares
                      ?.map((n, i) => ({ n, i }))
                      .filter((v) => v.n > 0)
                      .sort((a, b) => b.n - a.n)
                      .map(({ n, i }) => (
                        <button
                          key={i}
                          className="representation-row"
                          disabled={i >= data.communities.length}
                          onClick={() =>
                            selectCommunity(filters.community === i ? null : i)
                          }
                        >
                          <span
                            className="community-marker"
                            style={{ background: color(i) }}
                          />
                          <span>
                            {data.communities[i]
                              ? shortLabel(data.communities[i].label)
                              : "Other communities"}
                          </span>
                          <strong>
                            {((n / Math.max(shareTotal, 1)) * 100).toFixed(1)}%
                          </strong>
                        </button>
                      ))}
                  </div>
                  <button
                    className="text-action"
                    onClick={() =>
                      setView(
                        view === "collaborations"
                          ? "geography"
                          : "collaborations",
                      )
                    }
                  >
                    View in{" "}
                    {view === "collaborations"
                      ? "geography"
                      : "collaboration network"}
                    <Icon name="arrow" size={14} />
                  </button>
                </>
              )}
              <div className="inspector-tabs">
                <button
                  className={detailTab === "institutions" ? "active" : ""}
                  onClick={() => setDetailTab("institutions")}
                >
                  Institutions <span>{compact(result.nodes.length)}</span>
                </button>
                {selectedCommunity && (
                  <button
                    className={detailTab === "subcommunities" ? "active" : ""}
                    aria-label="Subcommunities"
                    title="Subcommunities"
                    onClick={() => setDetailTab("subcommunities")}
                  >
                    <Icon name="network" size={16} />
                  </button>
                )}
                {detailTab === "institutions" && (
                  <span className="rank-column-label">Papers</span>
                )}
              </div>
              <div className="rank-list">
                {detailTab === "subcommunities" && selectedCommunity ? (
                  <>
                    <button
                      className="text-action"
                      onClick={() => {
                        setView("evolution");
                        setSideOpen(false);
                      }}
                    >
                      Open in Evolution <Icon name="expand" size={14} />
                    </button>
                    <Subcommunities
                      key={selectedCommunity.id}
                      community={selectedCommunity}
                      index={filters.community!}
                    />
                  </>
                ) : (
                  <>
                    {result.nodes.slice(0, 60).map((n, i) => (
                      <button
                        className={`institution-row ${filters.institution === n.id ? "active" : ""}`}
                        key={n.id}
                        onClick={() => selectInstitution(n.id)}
                      >
                        <span className="rank-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="rank-body">
                          <strong>{data.institutions[n.id].label}</strong>
                          <span className="mini-participation">
                            {n.shares.map((count, ci) => (
                              <span
                                key={ci}
                                style={{ flex: count, background: color(ci) }}
                                title={`${data.communities[ci]?.label || "Other communities"}: ${((count / Math.max(n.total, 1)) * 100).toFixed(1)}%`}
                              />
                            ))}
                          </span>
                        </span>
                        <span className="rank-count">{compact(n.count)}</span>
                      </button>
                    ))}
                    {!result.nodes.length && (
                      <div className="empty-results">
                        <Icon name="search" size={24} />
                        <strong>No institutions in this selection</strong>
                        <p>
                          Try a broader year range, another community, or clear
                          the search.
                        </p>
                        <button onClick={reset}>Reset filters</button>
                      </div>
                    )}
                    {result.nodes.length > 60 && (
                      <p className="list-end">
                        Top 60 shown. Search to find any institution.
                      </p>
                    )}
                  </>
                )}
              </div>
            </aside>
          </div>
        )
      )}
      {showInfo && data && (
        <div className="modal-backdrop" onClick={() => setShowInfo(false)}>
          <section
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
                "button,a[href],input,select",
              );
              const first = focusable[0],
                last = focusable[focusable.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
          >
            <button
              className="modal-close"
              aria-label="Close about dialog"
              autoFocus
              onClick={() => setShowInfo(false)}
            >
              <Icon name="close" />
            </button>
            <span className="eyebrow">ROBOTICS ATLAS / DATA NOTES</span>
            <h2 id="about-title">One field. Three perspectives.</h2>
            <p>
              Communities come from the citation network. Institution links
              represent coauthored papers. They are joined through Web of
              Science paper IDs, using title and publication year to recover the
              IDs.
            </p>
            <dl>
              <dt>Citation coverage</dt>
              <dd>
                {number(data.provenance.matchedCitationPapers)} of{" "}
                {number(data.provenance.citationPapers)} papers matched to
                metadata.
              </dd>
              <dt>Institutions and edges</dt>
              <dd>
                Counts use distinct papers per institution or institution pair
                in the selected years and community. Institutions can belong to
                several communities. Node colors use the strongest named
                community; gray nodes have no papers in the ten displayed areas.
                Composition bars retain all research, including other
                communities.
              </dd>
              <dt>Year filtering</dt>
              <dd>
                Collaboration dates use publication year. Citation connections
                use the citing paper’s year and are displayed without direction.
                The ten main communities are fixed across time. Subcommunity
                summaries retain their original, all-time scope. Evolution shows
                corpus-level citation data: community shares use the corpus as
                their denominator, and subcluster shares use the parent
                community. Institution and search filters do not change these
                historical shares.
              </dd>
              <dt>Community relationships</dt>
              <dd>
                Widths follow the previous size-adjusted measure: log(1 +
                citations) divided by (community A size × community B
                size)^0.35. The original normalization and 3.5-power contrast
                are retained. Fixed node positions use all-time affinity; year
                filters reduce edge strength against that same reference.
              </dd>
              <dt>Geography</dt>
              <dd>
                Original map coordinates and institution name normalization are
                preserved, including existing address ambiguity. Location
                identifies the source’s institution coordinate, not every
                campus.
              </dd>
              <dt>Edge visibility</dt>
              <dd>
                Both institution views display the same strongest edges, after
                applying the paper threshold and display limit. All qualifying
                connections of the selected institution are retained beyond the
                display limit. Counts report all eligible edges. An institution
                selection highlights it; enable “Only this institution’s
                connections” to filter its neighborhood.
              </dd>
              <dt>Rendering</dt>
              <dd>
                Helios Web 0.10.9 / Helios Network 0.10.4. Static force layout
                computed offline; software graphics use a canvas fallback. Data
                filtering runs in a worker. Filter computation:{" "}
                {result.ms.toFixed(1)} ms (latest request).
              </dd>
            </dl>
            <a
              href="https://heliosweb.io/docs/"
              target="_blank"
              rel="noreferrer"
            >
              Helios documentation ↗
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
export default App;
