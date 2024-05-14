import { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

export async function launchBrowser(headless: boolean) {
  return puppeteer.launch({
    channel: "chrome",
    headless,
    protocolTimeout: 0,
  });
}

export async function openPage(
  browser: Browser,
  url: string,
  userAgent: string
) {
  const page = await browser.newPage();
  await page.setUserAgent(userAgent);
  await page.setViewport({
    width: 1280 + Math.floor(Math.random() * 100),
    height: 800 + Math.floor(Math.random() * 100),
  });
  await page.goto(url, { waitUntil: "networkidle2" });
  return page;
}

export function delay(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}
