import { saveData } from "./helpers";
import { delay, launchBrowser, openPage } from "./prepareBrowser";
import { Browser, ElementHandle, Page } from "puppeteer-core";
import { userAgents } from "./userAgents";
import { aircraftMappings } from "./aircraftMappings";

async function obtainRotations() {
  const airportRotations: string[] = [];

  async function retrieveRotationsForAircraftTypes(aircraftTypes: string[]) {
    console.log("Let's grab these rotations, shall we?");
    console.log("Pray that the FlightRadar24 developers will not catch us.");
    console.log(
      "This is going to be a long one, so you'd better make some popcorn and go watch your favorite movie."
    );

    const browser = await launchBrowser(true);

    for (const aircraftType of aircraftTypes) {
      await processAircraftType(browser, aircraftType);
    }

    await saveData(airportRotations, "rotations.json");
    await browser.close();

    console.log(`Successfully added the airports. Let's go!`);
  }

  async function processAircraftType(browser: Browser, aircraftType: string) {
    await obtainRotations(browser, aircraftType);
  }

  async function acceptCookiesAfterVerification(page: Page) {
    try {
      await page.click("#onetrust-accept-btn-handler");
      console.log("Accepted all cookies, unfortunately.");
      await delay(1500);
    } catch {
      console.log("Cookies already accepted.");
    }
  }

  async function waitForVerification(
    browser: Browser,
    page: Page
  ): Promise<Page> {
    while (true) {
      const pageContent = await page.$eval(
        "html",
        (element) => element.innerHTML
      );
      if (!pageContent.includes("Verifying")) {
        return page;
      }

      await page.close();
      await delay(Math.floor(Math.random() * 10000 + 10000)); // Adjust delay as needed
      page = await openPage(browser, page.url(), getRandomUserAgent());
      await acceptCookiesAfterVerification(page);
      return page;
    }
  }

  async function processLinks(
    browser: Browser,
    links: { aircraftReg: string; link: string }[],
    aircraftType: string
  ) {
    const BATCH_SIZE = 10; // Adjust batch size as needed
    for (let i = 0; i < links.length; i += BATCH_SIZE) {
      const batch = links.slice(i, i + BATCH_SIZE);

      for (const link of batch) {
        await processLink(browser, link, aircraftType);
      }
    }
  }

  async function processLink(
    browser: Browser,
    link: { aircraftReg: string; link: string },
    aircraftType: string
  ) {
    console.log(`Opening data for ${link.aircraftReg}.`);
    let detailPage = await openPage(browser, link.link, getRandomUserAgent());

    detailPage = await waitForVerification(browser, detailPage);

    try {
      await extractAirportRotations(browser, detailPage, aircraftType);
    } catch (error) {
      console.error("Error processing link", link, error);
    } finally {
      await detailPage.close();
      console.log(`Processed ${link.aircraftReg}.`);
    }
  }

  async function checkIfAirportsShouldBeAdded(
    browser: Browser,
    url: string,
    aircraftTypeICAO: string
  ): Promise<boolean> {
    let page = await openPage(browser, url, getRandomUserAgent());

    page = await waitForVerification(browser, page);

    const detailTable = await page.$("#tbl-datatable");
    if (!detailTable) return false;

    const detailRows = await detailTable.$$("tbody > tr");
    const aircraftOperating: string[] = [];

    for (const detailRow of detailRows) {
      const aircraftTypeCell = await detailRow.$("td:nth-child(6)");
      const aircraftType = (await getCellText(aircraftTypeCell)).trim();

      let aircraftTypeNormalized = aircraftType;
      for (const mapping of aircraftMappings) {
        if (
          aircraftType.includes(mapping.IATA) ||
          aircraftType.includes(mapping.ICAO)
        ) {
          aircraftTypeNormalized = mapping.ICAO;
          break;
        }
      }

      aircraftOperating.push(aircraftTypeNormalized);
    }

    await page.close();
    await delay(Math.floor(Math.random() * 1000 + 2000));

    const count = aircraftOperating.filter(
      (aircraft) => aircraft === aircraftTypeICAO
    ).length;

    const percentage = (count / aircraftOperating.length) * 100;

    return percentage >= 50;
  }

  async function extractAirportRotations(
    browser: Browser,
    page: Page,
    aircraftType: string
  ) {
    const processedRotations = new Set<string>();

    const detailTable = await page.$("#tbl-datatable");
    if (!detailTable) return;

    const detailRows = await detailTable.$$("tbody > tr");

    for (const detailRow of detailRows) {
      const cells:
        | []
        | [
            ElementHandle<HTMLTableCellElement>,
            ElementHandle<HTMLTableCellElement>,
            ElementHandle<HTMLAnchorElement>
          ] = await Promise.all([
        detailRow.$("td:nth-child(4)"),
        detailRow.$("td:nth-child(5)"),
        detailRow.$("td:nth-child(6) > a"),
      ]);
      const [originCell, destinationCell, flightLinkCell] = cells;

      try {
        if (originCell && destinationCell && flightLinkCell) {
          const originCellText = (await getCellText(originCell)).trim();
          const destinationCellText = (
            await getCellText(destinationCell)
          ).trim();

          const charRegex = /[a-zA-Z0-9]/;

          if (
            charRegex.test(originCellText) &&
            charRegex.test(destinationCellText)
          ) {
            const originCode = originCellText.slice(-4, -1);
            const destinationCode = destinationCellText.slice(-4, -1);
            const flightLink = await getCellLink(flightLinkCell);

            const shouldAddAirports = await checkIfAirportsShouldBeAdded(
              browser,
              flightLink,
              aircraftType
            );

            if (shouldAddAirports) {
              const rotation = `${originCode}-${destinationCode}`;

              if (!processedRotations.has(rotation)) {
                airportRotations.push(rotation);
                processedRotations.add(rotation);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error processing link", error);
      }
    }
  }

  async function getCellLink(cell: ElementHandle<HTMLAnchorElement>) {
    return await cell.evaluate((cell) => cell.href.trim());
  }

  async function getCellText(cell: ElementHandle) {
    return await cell.evaluate((cell) => cell.textContent.trim());
  }

  function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)].useragent;
  }

  let cookiesAccepted: boolean = false;

  async function obtainRotations(browser: Browser, aircraftType: string) {
    cookiesAccepted = false;

    try {
      const page = await openPage(
        browser,
        `https://www.flightradar24.com/data/aircraft/${aircraftType}`,
        getRandomUserAgent()
      );

      console.log(`Opened page at ${page.url()}`);

      if (!cookiesAccepted) {
        try {
          await page.click("#onetrust-accept-btn-handler");
          console.log("Accepted all cookies, unfortunately.");
          cookiesAccepted = true;
        } catch {
          console.log("Cookies already accepted.");
        }
      }

      const table = await page.$("#cnt-list-aircraft > table");
      if (!table) {
        console.error("Table not found");
        return;
      }

      const rows = await table.$$("tbody > tr");
      const links: { aircraftReg: string; link: string }[] = [];

      for (const row of rows) {
        const linkElement = await row.$("td:nth-child(2) > a");
        if (linkElement) {
          const link = (await linkElement.evaluate((a) => a.href)).trim();
          const aircraftReg = (
            await linkElement.evaluate((a) => a.textContent)
          ).trim();
          links.push({ aircraftReg, link });
        }
      }

      console.log(`Found ${links.length} aircraft to process.`);
      console.log(`Obtaining the aircraft's rotations. Please wait...`);

      await processLinks(browser, links, aircraftType);
    } catch (error) {
      console.error("An error occurred in obtainRotations:", error);
    }
  }

  retrieveRotationsForAircraftTypes(["B788", "B789", "B78X"]);
}

obtainRotations();
