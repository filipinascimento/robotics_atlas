import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
async function chooseTheme(page: Page, name: "Automatic" | "Light" | "Dark") {
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
}
async function ready(page: Page) {
  await expect(page.locator(".institution-row").first()).toBeVisible();
  await expect(page.locator(".atlas-app")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
test("theme follows the browser, remembers explicit choices, and preserves map interaction", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./?dataset=humanoid&view=geography");
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".community-marker").first()).toHaveCSS(
    "background-color",
    "rgb(8, 126, 104)",
  );
  await page.locator(".institution-row").first().click();
  await page.getByRole("button", { name: "Zoom in map", exact: true }).click();
  const canvas = page.locator(".geography-pane canvas");
  const camera = await canvas.evaluate((el) =>
    JSON.stringify((el as HTMLCanvasElement & { __zoom: unknown }).__zoom),
  );
  const bounds = await canvas.boundingBox();
  await canvas.evaluate((el) =>
    el.setAttribute("data-theme-mount", "preserved"),
  );
  const light = await canvas.screenshot();
  await chooseTheme(page, "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".community-marker").first()).toHaveCSS(
    "background-color",
    "rgb(112, 214, 188)",
  );
  await expect(canvas).toHaveAttribute("data-theme-mount", "preserved");
  expect(await canvas.boundingBox()).toEqual(bounds);
  expect(
    await canvas.evaluate((el) =>
      JSON.stringify((el as HTMLCanvasElement & { __zoom: unknown }).__zoom),
    ),
  ).toBe(camera);
  expect(light.equals(await canvas.screenshot())).toBe(false);
  await expect(page.locator(".institution-detail")).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await chooseTheme(page, "Automatic");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await chooseTheme(page, "Light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});
test("Helios recolors its labels and canvas without remounting when the theme changes", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./?dataset=humanoid&view=collaborations&renderer=helios");
  await ready(page);
  await expect(page.locator(".renderer-status")).toContainText(
    "ms to initialize",
    { timeout: 30000 },
  );
  const canvas = page.locator(".helios-mount canvas").first();
  await canvas.evaluate((el) =>
    el.setAttribute("data-theme-mount", "preserved"),
  );
  const before = await canvas.screenshot();
  await chooseTheme(page, "Light");
  await expect(page.locator(".renderer-status")).toContainText("ms to update", {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute("data-theme-mount", "preserved");
  await expect(page.locator(".helios-label").first()).toHaveCSS(
    "fill",
    "rgb(23, 51, 66)",
  );
  expect(before.equals(await canvas.screenshot())).toBe(false);
  expect(errors).toEqual([]);
});
test("mobile theme control remains visible and fits the header", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./?dataset=humanoid");
  await expect(
    page.getByRole("button", { name: "Change theme" }),
  ).toBeVisible();
  await chooseTheme(page, "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Appearance" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
