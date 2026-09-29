import { filterAtlas } from "./data";
import type { Atlas, Filters } from "./data";
let atlas: Atlas;
self.onmessage = async (
  event: MessageEvent<{
    type: string;
    url?: string;
    filters?: Filters;
    id: number;
  }>,
) => {
  try {
    if (event.data.type === "load") {
      const url = event.data.url!;
      let response: Response;
      if (typeof DecompressionStream !== "undefined") {
        const compressed = await fetch(`${url}.gz`);
        response =
          compressed.ok &&
          compressed.headers.get("content-encoding")?.includes("gzip")
            ? compressed
            : compressed.ok && compressed.body
              ? new Response(
                  compressed.body.pipeThrough(new DecompressionStream("gzip")),
                )
              : await fetch(url);
      } else response = await fetch(url);
      if (!response.ok)
        throw new Error(`Dataset request failed (${response.status})`);
      atlas = await response.json();
      self.postMessage({
        type: "ready",
        data: { ...atlas, collaborations: [] },
      });
    } else if (atlas && event.data.filters) {
      self.postMessage({
        id: event.data.id,
        result: filterAtlas(atlas, event.data.filters),
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
