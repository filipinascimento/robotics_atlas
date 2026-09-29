import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { Atlas, Result } from "../data";
import { GeoMap } from "./GeoMap";

const HeliosGraph = lazy(() => import("./HeliosGraph"));
type Props = {
  data: Atlas;
  result: Result;
  selected: number | null;
  community: number | null;
  onSelect: (id: number | null) => void;
};

async function hasHardwareGraphics() {
  const override = new URLSearchParams(location.search).get("renderer");
  if (override) return override === "helios";
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter(): Promise<unknown> };
    }
  ).gpu;
  if (gpu && (await gpu.requestAdapter().catch(() => null))) return true;
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return false;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = String(
    gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
  );
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return !/swiftshader|llvmpipe|software|swrast/i.test(renderer);
}

export default function CollaborationGraph(props: Props) {
  const [hardware, setHardware] = useState<boolean | null>(null);
  const fallback = useCallback(() => setHardware(false), []);
  useEffect(() => {
    let active = true;
    void hasHardwareGraphics()
      .catch(() => false)
      .then((available) => {
        if (active) setHardware(available);
      });
    return () => {
      active = false;
    };
  }, []);
  if (hardware === null)
    return <div className="viz-empty">Preparing network…</div>;
  return hardware ? (
    <Suspense
      fallback={<div className="viz-empty">Loading network renderer…</div>}
    >
      <HeliosGraph {...props} onUnavailable={fallback} />
    </Suspense>
  ) : (
    <GeoMap {...props} mode="network" />
  );
}
