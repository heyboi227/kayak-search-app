import puppeteer, { Browser } from "puppeteer-core";

export async function launchBrowser(headless: boolean) {
  return puppeteer.launch({
    channel: "chrome",
    headless,
    defaultViewport: null,
    args: ["--start-maximized"],
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
  await page.goto(url, { timeout: 0 });
  return page;
}

export function delay(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}
