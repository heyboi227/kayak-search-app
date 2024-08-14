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
) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  await page.goto(url);
  return page;
}
