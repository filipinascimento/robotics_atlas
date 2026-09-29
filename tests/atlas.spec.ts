import { geoEqualEarth } from "d3";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
async function ready(page: import("@playwright/test").Page) {
  await expect(page.locator(".institution-row").first()).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".atlas-app")).toHaveAttribute(
    "aria-busy",
    "false",
    {
      timeout: 20000,
    },
  );
}
test("linked community, year, institution, and geography selections", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await ready(page);
  await expect(page.locator(".summary-stats")).toContainText("34.6K");
  await expect(
    page.getByRole("combobox", { name: "Minimum shared papers" }),
  ).toHaveValue("3");
  await expect(
    page.getByRole("combobox", { name: "Edge display limit" }),
  ).toHaveValue("5000");
  await expect(page.locator(".edge-count")).toHaveText(
    "5,000 / 12,281 edges shown",
  );
  const original = await page.locator(".edge-count").innerText();
  const positions = await page
    .locator(".community-node")
    .evaluateAll((nodes) =>
      nodes.map((n) => [
        n.querySelector("circle")!.getAttribute("cx"),
        n.querySelector("circle")!.getAttribute("cy"),
      ]),
    );
  await expect(page.locator(".community-edge")).toHaveCount(45);
  await expect(page.locator(".community-graph path")).toHaveCount(0);
  await page.locator(".community-row").first().click();
  await ready(page);
  await expect(page.locator(".selection-strip")).toContainText("SLAM");
  await expect(page.locator(".edge-count")).not.toHaveText(original);
  const timeline = page.locator(".timeline-chart svg");
  const range = (await timeline.boundingBox())!;
  await page.mouse.move(
    range.x + 8 + ((range.width - 18) * (2013 - 1988)) / (2022 - 1988),
    range.y + 20,
  );
  await page.mouse.down();
  await page.mouse.move(range.x + range.width - 10, range.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(timeline).toHaveAttribute("data-start-year", "2013");
  await ready(page);
  const after = await page
    .locator(".community-node")
    .evaluateAll((nodes) =>
      nodes.map((n) => [
        n.querySelector("circle")!.getAttribute("cx"),
        n.querySelector("circle")!.getAttribute("cy"),
      ]),
    );
  expect(after).toEqual(positions);
  await page
    .getByRole("button", { name: "Subcommunities", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Subcommunity citation network" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect subcommunity 1" }).click();
  await page.locator(".inspector-tabs button").first().click();
  await page.locator(".institution-row").first().click();
  await expect(page.locator(".representation")).toBeVisible();
  await expect(page.locator(".timeline-heading")).toContainText(
    "publication history",
  );
  await page
    .getByRole("checkbox", { name: "Only this institution’s connections" })
    .check();
  await ready(page);
  await page.getByRole("button", { name: "Geography", exact: true }).click();
  await expect(page.locator(".geography-pane")).toBeVisible();
  await expect(page.locator(".communities-pane")).toHaveClass(/pane-floating/);
  await expect(page.locator(".geography-pane")).toHaveClass(/pane-primary/);
  await expect(page.locator(".community-node text")).toHaveCount(10);
  await page.locator(".community-node").first().focus();
  await expect(page.getByRole("tooltip")).toContainText("SLAM");
  await page.getByRole("button", { name: "Swap map and communities" }).click();
  await expect(page.locator(".communities-pane")).toHaveClass(/pane-primary/);
  await expect(page.locator(".geography-pane")).toHaveClass(/pane-floating/);
  await page.getByRole("button", { name: "Make map primary" }).click();
  await expect(page.locator(".geography-pane")).toHaveClass(/pane-primary/);
  await expect(page.getByRole("checkbox")).toBeChecked();
  const before = await page
    .locator(".geography-pane .map-canvas canvas")
    .screenshot();
  await page.getByRole("button", { name: "Zoom in map" }).click();
  const mapAfter = await page
    .locator(".geography-pane .map-canvas canvas")
    .screenshot();
  expect(before.equals(mapAfter)).toBe(false);
  await page
    .getByRole("button", { name: "Expand timeline", exact: true })
    .click();
  await expect(page.locator(".timeline-panel")).toHaveClass(/expanded/);
  await page.screenshot({ path: "/tmp/atlas-selected.png" });
  expect(errors).toEqual([]);
});
for (const renderer of ["canvas", "helios"])
  test(`${renderer} renders in a nested production path, keeps selection without remount, and handles empty filters`, async ({
    page,
  }) => {
    // Software WebGL rasterization of all 122k edges can block the headless
    // browser between interactions. Keep this correctness test hardware-neutral.
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`./?view=collaborations&renderer=${renderer}`);
    await ready(page);
    await expect(page.locator(".renderer-status")).toContainText(
      renderer === "helios" ? "ms to initialize" : "Canvas",
      { timeout: 30000 },
    );
    await expect(page.locator(".viz-error")).toHaveCount(0);
    const canvas = page
      .locator(
        renderer === "helios" ? ".helios-host canvas" : ".map-canvas canvas",
      )
      .first();
    await expect(canvas).toBeVisible();
    await canvas.evaluate((el) =>
      el.setAttribute("data-mount-check", "preserved"),
    );
    await page.locator(".institution-row").first().click();
    await page.waitForTimeout(400);
    await expect(canvas).toHaveAttribute("data-mount-check", "preserved");
    await canvas.click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".institution-detail")).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Minimum shared papers" })
      .selectOption("1");
    await page
      .getByRole("combobox", { name: "Edge display limit" })
      .selectOption("0");
    await ready(page);
    await expect(page.locator(".edge-count")).toHaveText(
      "122,655 / 122,655 edges shown",
      { timeout: 15000 },
    );
    await expect(page.locator(".renderer-status")).toContainText(
      renderer === "helios" ? "ms to update" : "Canvas",
    );
    await expect(canvas).toHaveAttribute("data-mount-check", "preserved");
    await page.screenshot({ path: `/tmp/atlas-network-${renderer}.png` });
    await page
      .getByRole("textbox", { name: "Search institutions or places" })
      .fill("zzzz_nonexistent_institution");
    await expect(
      page.getByText("No institutions in this selection"),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".edge-count")).toHaveText("0 / 0 edges shown");
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    await ready(page);
    expect(errors).toEqual([]);
  });
test("humanoid switching, timeline brush and reset, and data notes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await ready(page);
  await page.getByRole("button", { name: "Humanoid", exact: true }).click();
  await ready(page);
  await expect(page.locator(".summary-stats")).toContainText("2.4K");
  await expect(page.locator(".timeline-chart svg")).toHaveAttribute(
    "data-start-year",
    "1988",
  );
  await page
    .getByRole("combobox", { name: "Timeline scale" })
    .selectOption("share");
  await expect(page.locator(".timeline-chart")).toContainText("100%");
  await page
    .getByRole("combobox", { name: "Timeline scale" })
    .selectOption("sqrt");
  const box = (await page.locator(".timeline-chart svg").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + 20, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  await ready(page);
  expect(
    Number(
      await page.locator(".timeline-chart svg").getAttribute("data-start-year"),
    ),
  ).toBeGreaterThan(1990);
  await page.locator(".timeline-chart svg").dblclick();
  await expect(page.locator(".timeline-chart svg")).toHaveAttribute(
    "data-start-year",
    "1988",
  );
  await expect(page.locator(".timeline-chart svg")).toHaveAttribute(
    "data-end-year",
    "2022",
  );
  await page
    .getByRole("button", { name: "About data and methodology" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("7,311 of 7,432");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("mobile uses the viewport and opens the institution explorer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?dataset=humanoid");
  await expect(page.locator(".atlas-app")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".community-graph")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    innerWidth,
    innerHeight,
  }));
  expect(dimensions.width).toBe(dimensions.innerWidth);
  expect(dimensions.height).toBe(dimensions.innerHeight);
  await page.getByRole("button", { name: "Toggle explorer" }).click();
  await expect(page.locator(".inspector")).toBeVisible();
  await page.locator(".institution-row").first().click();
  await expect(page.locator(".institution-detail")).toBeVisible();
  await page.getByRole("button", { name: "Close explorer" }).click();
  await expect(page.locator(".inspector")).not.toBeVisible();
  await page.screenshot({ path: "/tmp/atlas-mobile.png" });
});

test("collaboration view remains usable without WebGL or WebGPU", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (String(args[0]).startsWith("webgl")) return null;
      return Reflect.apply(original, this, args);
    } as typeof original;
  });
  await page.goto("./?dataset=humanoid&view=collaborations");
  await ready(page);
  await expect(page.locator(".renderer-status")).toContainText("Canvas");
  const canvas = page.locator(".map-canvas canvas");
  const before = await canvas.screenshot();
  await page.getByRole("button", { name: "Zoom in network" }).click();
  expect(before.equals(await canvas.screenshot())).toBe(false);
  await page.locator(".institution-row").first().click();
  await expect(page.locator(".representation")).toBeVisible();
});

test("zoomed collaborator inset shows five connections, tracks the viewport, snaps to corners, and deselects on background", async ({
  page,
}) => {
  await page.goto("./?view=geography&dataset=humanoid");
  await ready(page);
  const main = page.locator(".geography-pane > .map-canvas");
  const before = await main.boundingBox();
  await page.locator(".institution-row").first().click();
  await expect(page.locator(".institution-detail")).toBeVisible();
  await expect(page.locator(".neighbor-pane")).toHaveCount(0);
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Zoom in map", exact: true })
      .click();
  await expect(page.locator(".neighbor-pane .pane-heading")).toContainText(
    "Top 5 collaborators",
  );
  await expect(page.locator(".neighbor-pane .map-label").first()).toBeVisible();
  await expect(page.locator(".map-viewport-overlay rect")).toBeVisible();
  expect(await main.boundingBox()).toEqual(before);
  const stage = (await page.locator(".visualization-stage").boundingBox())!;
  const handle = page.getByRole("button", { name: "Move collaborators panel" });
  for (const [corner, x, y] of [
    ["top-left", 20, 20],
    ["top-right", stage.width - 20, 20],
    ["bottom-right", stage.width - 20, stage.height - 20],
    ["bottom-left", 20, stage.height - 20],
  ] as const) {
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + x, stage.y + y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator(".neighbor-pane")).toHaveAttribute(
      "data-corner",
      corner,
    );
    expect(
      await page.locator(".communities-pane").getAttribute("data-corner"),
    ).not.toBe(corner);
    const controls = page.locator(".geography-pane .map-controls");
    const controlCorner = await controls.getAttribute("data-corner");
    expect(controlCorner).not.toBe(corner);
    expect(controlCorner).not.toBe(
      await page.locator(".communities-pane").getAttribute("data-corner"),
    );
    const controlBox = (await controls.boundingBox())!;
    for (const panel of await page.locator(".pane-floating").all()) {
      const floating = (await panel.boundingBox())!;
      const overlaps =
        controlBox.x < floating.x + floating.width &&
        controlBox.x + controlBox.width > floating.x &&
        controlBox.y < floating.y + floating.height &&
        controlBox.y + controlBox.height > floating.y;
      expect(overlaps).toBe(false);
    }
  }
  await handle.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".geography-pane .map-controls")).toHaveAttribute(
    "data-corner",
    "bottom-left",
  );
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  await page
    .getByRole("button", { name: "Reset map camera", exact: true })
    .click();
  await expect(page.locator(".neighbor-pane")).toHaveCount(0);
  await page.getByRole("button", { name: "Move communities panel" }).focus();
  await page.keyboard.press("ArrowDown");
  // Zoom at the selected institution: nearby labels must disappear from the inset.
  const atlas = JSON.parse(
    readFileSync("public/data/atlas_humanoid.json", "utf8"),
  );
  const institution = atlas.institutions.find(
    (n: { label: string }) => n.label === "Univ Tokyo",
  );
  const mapBox = (await main.boundingBox())!;
  const projection = geoEqualEarth().fitExtent(
    [
      [14, 30],
      [mapBox.width - 14, mapBox.height - 18],
    ],
    { type: "Sphere" },
  );
  const point = projection(institution.geo)!;
  await page.mouse.move(mapBox.x + point[0], mapBox.y + point[1]);
  await page.mouse.wheel(0, -1500);
  await expect(page.locator(".neighbor-pane")).toBeVisible();
  await page.waitForTimeout(300);
  const camera = await main.locator("canvas").evaluate((el) => {
    const t = (
      el as HTMLCanvasElement & { __zoom: { x: number; y: number; k: number } }
    ).__zoom;
    return { x: t.x, y: t.y, k: t.k };
  });
  const labelIds = await page
    .locator(".neighbor-pane .map-label")
    .evaluateAll((nodes) =>
      nodes.map((n) => Number(n.getAttribute("data-institution"))),
    );
  for (const id of labelIds) {
    const p = projection(atlas.institutions[id].geo)!;
    const x = p[0] * camera.k + camera.x,
      y = p[1] * camera.k + camera.y;
    expect(x < 0 || x > mapBox.width || y < 0 || y > mapBox.height).toBe(true);
  }
  expect(labelIds).not.toContain(institution.id);
  await page
    .getByRole("button", { name: "Reset map camera", exact: true })
    .click();
  await main.locator("canvas").click({ position: { x: 15, y: 80 } });
  await expect(page.locator(".institution-detail")).toHaveCount(0);
  for (let i = 0; i < 8; i++)
    await page
      .getByRole("button", { name: "Zoom in map", exact: true })
      .click();
  expect(
    await main
      .locator("canvas")
      .evaluate(
        (el) => (el as HTMLCanvasElement & { __zoom: { k: number } }).__zoom.k,
      ),
  ).toBeGreaterThan(24);
});

test("MIT wins overlapping clicks and co-located institutions can be selected separately after zoom", async ({
  page,
}) => {
  const { locationOffsets, offsetSpacing } =
    await import("../src/mapInteraction");
  await page.goto("./?view=geography");
  await ready(page);
  await page
    .getByRole("textbox", { name: "Search institutions or places" })
    .fill("MIT");
  await expect(page.locator(".selection-strip")).toContainText("MIT");
  await ready(page);
  const atlas = JSON.parse(
    readFileSync("public/data/atlas_robotics.json", "utf8"),
  );
  const mit = atlas.institutions.find(
    (n: { label: string }) => n.label === "MIT",
  );
  const lab = atlas.institutions.find(
    (n: { label: string }) => n.label === "MIT Media Lab",
  );
  const canvas = page.locator(".geography-pane canvas");
  const box = (await canvas.boundingBox())!;
  const projection = geoEqualEarth().fitExtent(
    [
      [14, 30],
      [box.width - 14, box.height - 18],
    ],
    { type: "Sphere" },
  );
  const anchor = projection(mit.geo)!;
  await canvas.click({ position: { x: anchor[0], y: anchor[1] } });
  await expect(page.locator(".institution-detail h2")).toHaveText("MIT");
  await page.mouse.move(box.x + anchor[0], box.y + anchor[1]);
  await page.mouse.wheel(0, -5000);
  await page.waitForTimeout(300);
  const zoom = await canvas.evaluate((el) => {
    const t = (
      el as HTMLCanvasElement & { __zoom: { x: number; y: number; k: number } }
    ).__zoom;
    return { x: t.x, y: t.y, k: t.k };
  });
  const offsets = locationOffsets(
    atlas.institutions.map(
      (n: { id: number; geo: [number, number]; counts: number[][] }) => ({
        id: n.id,
        geo: n.geo,
        papers: n.counts.reduce((sum, entry) => sum + entry[2], 0),
      }),
    ),
  );
  const offset = offsets.get(lab.id)!;
  await canvas.click({
    position: {
      x: anchor[0] * zoom.k + zoom.x + offset[0] * offsetSpacing(zoom.k),
      y: anchor[1] * zoom.k + zoom.y + offset[1] * offsetSpacing(zoom.k),
    },
  });
  await expect(page.locator(".institution-detail h2")).toHaveText(
    "MIT Media Lab",
  );
  await page
    .getByRole("combobox", { name: "Minimum shared papers" })
    .selectOption("1");
  await page
    .getByRole("combobox", { name: "Edge display limit" })
    .selectOption("0");
  await page
    .getByRole("textbox", { name: "Search institutions or places" })
    .fill("zzzz_no_institution");
  await expect(
    page.getByText("No institutions in this selection"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Edge display limit" }),
  ).toHaveValue("5000");
  await expect(
    page.getByRole("combobox", { name: "Minimum shared papers" }),
  ).toHaveValue("3");
});

for (const view of ["geography", "collaborations"])
  test(`${view} consumes wheel gestures at both zoom limits without scrolling the page`, async ({
    page,
  }) => {
    await page.goto(`./?dataset=humanoid&view=${view}&renderer=canvas`);
    await ready(page);
    const canvas = page.locator(
      view === "geography" ? ".geography-pane canvas" : ".map-canvas canvas",
    );
    await expect(canvas).toBeVisible();
    // Give the page room to scroll so the regression cannot pass just because
    // the normal full-window layout has no document overflow.
    await page.evaluate(() => {
      document.documentElement.style.overflow = "auto";
      document.body.style.overflow = "auto";
      const spacer = document.createElement("div");
      spacer.style.height = "200vh";
      document.body.append(spacer);
      window.scrollTo(0, 150);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(150);
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(
      box.x + box.width / 2,
      Math.max(160, box.y + box.height / 2),
    );
    await page.mouse.wheel(0, -10000);
    await expect
      .poll(() =>
        canvas.evaluate(
          (el) =>
            (el as HTMLCanvasElement & { __zoom: { k: number } }).__zoom.k,
        ),
      )
      .toBe(512);
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.scrollY)).toBe(150);
    await page.mouse.wheel(0, 10000);
    await expect
      .poll(() =>
        canvas.evaluate(
          (el) =>
            (el as HTMLCanvasElement & { __zoom: { k: number } }).__zoom.k,
        ),
      )
      .toBe(1);
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.scrollY)).toBe(150);
  });
