import { delay, saveData } from "./helpers";
import { launchBrowser, openPage } from "./prepareBrowser";
import { Page } from "puppeteer-core";
import UserAgent from "user-agents";

async function main() {
  const airlines = {};
  const browser = await launchBrowser(false);

  const page = await openPage(
    browser,
    "https://www.kayak.ie/airlines",
    new UserAgent({ deviceCategory: "desktop" }).random().toString()
  );

  const pageCookies = await browser.cookies();
  await browser.setCookie(...pageCookies);

  await acceptCookies(page);

  const rows = await page.$$(".c-P1H-row");

  for (const row of rows) {
    if (rows.indexOf(row) === 0) continue;

    const codeCell = await row.$(".c-P1H-code-container");
    const nameCell = await row.$("p:nth-child(3)");

    let airlineCode = "";
    let airlineName = "";

    if (codeCell) {
      airlineCode = (
        await codeCell.evaluate((node) => node.textContent)
      ).trim();
    }

    if (nameCell) {
      airlineName = (
        await nameCell.evaluate((node) => node.textContent)
      ).trim();
    }

    airlines[airlineCode] = airlineName;
  }

  await saveData(airlines, `airlines.json`);
  await browser.close();
}

async function acceptCookies(page: Page) {
  try {
    await delay(3500);
    await page.click("div.P4zO-submit-buttons > button:nth-child(1)");
    console.log("Accepted all cookies.\n");
  } catch {
    console.log("Cookies already accepted.");
  }
}

main();
