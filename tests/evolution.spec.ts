import { test, expect } from "@playwright/test";

test("Evolution links community, subcluster and year selections across views", async ({
  page,
}) => {
  await page.goto("./?view=evolution");
  await expect(page.locator(".evolution-series")).toHaveCount(10);
  await expect(page.locator(".evolution-chart").first()).toHaveAttribute(
    "data-start-year",
    "1988",
  );
  await page.locator(".evolution-series-heading").first().click();
  await expect(
    page.getByRole("combobox", { name: "Evolution community" }),
  ).toHaveValue("0");
  await expect(page.locator('.evolution-network [role="button"]')).toHaveCount(
    5,
  );
  await expect(page.locator(".evolution-series")).toHaveCount(5);
  await expect(page.locator(".evolution-parent")).toContainText("SLAM");
  await expect(page.locator(".evolution-network line")).toHaveCount(10);
  await page
    .getByRole("button", { name: "Inspect subcluster 2", exact: true })
    .click();
  await expect(page.locator(".evolution-series").nth(1)).toHaveClass(
    /selected/,
  );
  await page.locator(".evolution-series-heading").nth(2).click();
  await expect(
    page.getByRole("button", { name: "Inspect subcluster 3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const chart = page.locator(".evolution-parent .evolution-chart");
  const bounds = (await chart.boundingBox())!;
  const x = (year: number) =>
    bounds.x + 44 + ((bounds.width - 64) * (year - 1988)) / (2022 - 1988);
  await page.mouse.move(x(2000), bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(x(2010), bounds.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect(chart).toHaveAttribute("data-start-year", "2000");
  await expect(chart).toHaveAttribute("data-end-year", "2010");
  await expect(
    page.locator(".evolution-chart .evolution-crosshair"),
  ).toHaveCount(6);
  await page.getByRole("button", { name: "Geography", exact: true }).click();
  await expect(page.locator(".selection-strip")).toContainText("SLAM");
  await expect(page.locator(".timeline-chart svg")).toHaveAttribute(
    "data-start-year",
    "2000",
  );
  const pane = (await page
    .locator(".geography-pane.pane-primary")
    .boundingBox())!;
  const focus = (await page
    .getByRole("button", { name: "Swap map and communities" })
    .boundingBox())!;
  expect(pane.x + pane.width - focus.x - focus.width).toBeLessThan(25);
  await page.getByRole("button", { name: "Evolution", exact: true }).click();
  await expect(chart).toHaveAttribute("data-end-year", "2010");
  await chart.dblclick({ position: { x: 100, y: 100 } });
  await expect(chart).toHaveAttribute("data-start-year", "1988");
  await expect(chart).toHaveAttribute("data-end-year", "2022");
  await page
    .getByRole("combobox", { name: "Evolution community" })
    .selectOption("1");
  await expect(page.locator(".evolution-parent")).toContainText(
    "Path Planning",
  );
  await expect(page.locator(".evolution-series.selected")).toHaveCount(0);
  await page.getByRole("button", { name: "Humanoid", exact: true }).click();
  await expect(page.locator(".evolution-series")).toHaveCount(10);
  await expect(
    page.getByRole("combobox", { name: "Evolution community" }),
  ).toHaveValue("");
});

test("Evolution is readable in both themes and fits a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./?dataset=humanoid&view=evolution");
  await expect(page.locator(".evolution-series")).toHaveCount(10);
  await page
    .getByRole("combobox", { name: "Evolution community" })
    .selectOption("0");
  await expect(page.locator(".evolution-network")).toBeVisible();
  await expect(page.locator(".evolution-chart")).toHaveCount(6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const toggle = page.getByRole("button", { name: "Change theme" });
  await expect(toggle).toBeInViewport();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator(".evolution-series").last().scrollIntoViewIfNeeded();
  await expect(page.locator(".evolution-series").last()).toBeInViewport();
});
