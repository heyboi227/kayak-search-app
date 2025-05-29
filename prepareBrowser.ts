import puppeteer, { Browser } from "puppeteer-core";
import { delay } from "./helpers";
import UserAgent from "user-agents";

export async function launchBrowser(headless: boolean) {
  return puppeteer.launch({
    channel: "chrome",
    headless,
    protocolTimeout: 0,
    args: [
      "--start-maximized=true",
      "--disable-application-cache",
      "--disable-offline-load-stale-cache",
      "--disable-gpu-shader-disk-cache",
      "--media-cache-size=0",
      "--disk-cache-size=0",
    ],
    defaultViewport: null,
  });
}

export async function openPage(browser: Browser, url: string) {
  const userAgent = new UserAgent({
    deviceCategory: "desktop",
  });

  const page = await browser.newPage();
  await page.setUserAgent(userAgent.random().toString());
  page.setDefaultNavigationTimeout(0);
  const response = await page.goto(url);
  if (!response.ok()) {
    console.log(
      `Page status returned with error code ${response.status()}. Trying again...`
    );
    await page.close();
    await delay(5000);
    return await openPage(browser, url);
  }
  return page;
}
