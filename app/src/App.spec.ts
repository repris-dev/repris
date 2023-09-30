import { test, expect } from "@playwright/test";

test("Visual Regression Test", async ({ page }) => {
  await page.goto("http://localhost:3000/");

  expect(await page.screenshot()).toMatchSnapshot("vrt.png", {
    threshold: 0.075,
  });
});
