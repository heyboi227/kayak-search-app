import puppeteer, { Browser } from "puppeteer-core";

export async function launchBrowser(headless: boolean) {
  return puppeteer.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless,
    protocolTimeout: 0,
    args: ["--start-maximized=true"],
    defaultViewport: null,
  });
}

export async function openPage(
  browser: Browser,
  url: string,
  userAgent: string
) {
  const page = await browser.newPage();
  await page.setUserAgent(userAgent);
  page.setDefaultNavigationTimeout(60000);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  return page;
}
