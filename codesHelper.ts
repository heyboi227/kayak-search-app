import { delay, saveData } from "./helpers";
import { launchBrowser, openPage } from "./prepareBrowser";
import { Browser, ElementHandle, Page } from "puppeteer-core";
import { aircraftMappings } from "./aircraftMappings";
import UserAgent from "user-agents";

async function obtainRotations() {
  const airportRotations: string[] = [];

  const flights: {
    airlineName: string;
    flightNumber: string;
  }[] = [];

  const processedRotations = new Set<string>();
  const processedFlights = new Set<{
    airlineName: string;
    flightNumber: string;
  }>();

  async function retrieveRotationsForAircraftTypes(aircraftTypes: string[]) {
    console.log("Let's grab these rotations, shall we?");
    console.log("Pray that the FlightRadar24 developers will not catch us.");
    console.log(
      "This is going to be a long one, so you'd better make some popcorn and go watch your favorite movie."
    );

    const browser = await launchBrowser(false);

    for (const aircraftType of aircraftTypes) {
      await processAircraftType(browser, aircraftType);

      if (airportRotations.length > 0 && flights.length > 0) {
        await saveData(airportRotations, `rotations-${aircraftType}.json`);
        await saveData(flights, `flights-${aircraftType}.json`);
        console.log(`Successfully added the airports and flights. Let's go!`);

        airportRotations.length = 0;
        flights.length = 0;
      } else {
        console.log(
          "Unfortunately, no rotations or flights found for this aircraft type."
        );
      }
    }

    await browser.close();
  }

  async function processAircraftType(browser: Browser, aircraftType: string) {
    await obtainRotations(browser, aircraftType);
  }

  async function acceptCookiesAfterVerification(page: Page) {
    try {
      await page.click("#didomi-notice-agree-button > span");
      console.log("Accepted all cookies, unfortunately.");
      await delay(1500);
    } catch {}
  }

  async function waitForVerification(
    browser: Browser,
    page: Page,
    url: string
  ): Promise<Page> {
    const pageContent = await page.$eval(
      "html",
      (element) => element.innerHTML
    );

    if (
      pageContent.includes("Verifying") ||
      pageContent.includes("Error") ||
      pageContent.includes("Cloudfare")
    ) {
      await page.close();
      await delay(Math.floor(Math.random() * 10000 + 10000)); // Adjust delay as needed
      page = await openPage(browser, url);
      await acceptCookiesAfterVerification(page);
    }

    return page;
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
    let detailPage = await openPage(browser, link.link);

    detailPage = await waitForVerification(browser, detailPage, link.link);

    try {
      await extractAirportRotations(browser, detailPage, aircraftType);
    } catch (error) {
      console.error("Error processing link", link, error);
    } finally {
      await detailPage.close();
      console.log(`Processed ${link.aircraftReg}.`);
    }
  }

  async function checkAircraftFrequency(
    browser: Browser,
    url: string,
    aircraftTypeICAO: string
  ): Promise<{
    aircraftFrequency: number;
    isAircraftFrequent: boolean;
    airlineName: string;
  }> {
    let page = await openPage(browser, url);

    page = await waitForVerification(browser, page, url);

    const detailTable = await page.$("#tbl-datatable");
    if (detailTable === null) return null;

    const detailRows = await detailTable.$$("tbody > tr");
    const aircraftOperating: string[] = [];

    const airlineName = await page.$eval("#cnt-playback", (element) =>
      element.getAttribute("data-airline-name")
    );

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

    return {
      aircraftFrequency: percentage,
      isAircraftFrequent: percentage >= 70,
      airlineName,
    };
  }

  async function extractAirportRotations(
    browser: Browser,
    page: Page,
    aircraftType: string
  ) {
    const detailTable = await page.$("#tbl-datatable");
    if (!detailTable) {
      console.log("No rotation data available for this aircraft.");
      return;
    }

    let processedRotationsForThisAircraft = 0;
    let processedFlightsForThisAircraft = 0;

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
            const flightNumber = await getCellLinkInnerText(flightLinkCell);

            const rotation = `${originCode}-${destinationCode}`;

            console.log(`Checking out rotation: ${rotation}.`);

            const aircraftFrequency = await checkAircraftFrequency(
              browser,
              flightLink,
              aircraftType
            );

            const flightNumberObj = {
              airlineName: aircraftFrequency.airlineName,
              flightNumber,
            };

            console.log(
              `This aircraft was in service at ${Math.round(
                aircraftFrequency.aircraftFrequency
              )}% of the total number of rotations for this flight, in the last week.`
            );

            if (!processedRotations.has(rotation)) {
              airportRotations.push(rotation);
              processedRotations.add(rotation);

              processedRotationsForThisAircraft++;

              console.log("Added the rotation.");
            } else {
              console.log("Rotation already added. Skipped the rotation.");
            }

            if (aircraftFrequency.isAircraftFrequent) {
              let setHasEquivalentFlightNumberObj = false;

              for (const flight of processedFlights) {
                if (
                  flight.airlineName === flightNumberObj.airlineName &&
                  flight.flightNumber === flightNumberObj.flightNumber
                ) {
                  setHasEquivalentFlightNumberObj = true;
                }
              }

              if (!setHasEquivalentFlightNumberObj) {
                flights.push(flightNumberObj);
                processedFlights.add(flightNumberObj);

                processedFlightsForThisAircraft++;

                console.log(
                  `Added the flight: ${JSON.stringify(flightNumberObj)}`
                );
              } else {
                console.log("Flight already added. Skipped the flight.");
              }
            } else {
              console.log("Not frequent enough. Skipped the flight.");
            }
          }
        }
      } catch (error) {
        console.error("Error processing link", error);
      }
    }

    if (
      processedRotationsForThisAircraft > 0 ||
      processedFlightsForThisAircraft > 0
    ) {
      console.log(
        `Added ${processedRotationsForThisAircraft} rotations and ${processedFlightsForThisAircraft} flights for this aircraft.`
      );
    } else {
      console.log("No aircraft rotations or flights to add.");
    }
  }

  async function getCellLinkInnerText(cell: ElementHandle<HTMLAnchorElement>) {
    return await cell.evaluate((cell) => cell.textContent.trim());
  }

  async function getCellLink(cell: ElementHandle<HTMLAnchorElement>) {
    return await cell.evaluate((cell) => cell.href.trim());
  }

  async function getCellText(cell: ElementHandle) {
    return await cell.evaluate((cell) => cell.textContent.trim());
  }

  let cookiesAccepted: boolean = false;

  async function obtainRotations(browser: Browser, aircraftType: string) {
    cookiesAccepted = false;

    try {
      const page = await openPage(
        browser,
        `https://www.flightradar24.com/data/aircraft/${aircraftType}`
      );

      console.log(`Opened page at ${page.url()}`);

      if (!cookiesAccepted) {
        try {
          await page.click("#didomi-notice-agree-button > span");
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
        const linkElement =
          (await row.$("td:nth-child(2) > a")) ??
          (await row.$("td:nth-child(3) > a"));
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

  retrieveRotationsForAircraftTypes([
    // "A306",
    // "A30B",
    // "A3ST",
    // "A310",
    // "A332",
    // "A333",
    // "A338",
    // "A339",
    // "A342",
    // "A343",
    // "A345",
    // "A346",
    // "A359",
    // "A35K",
    "A388",
    // "B741",
    // "B742",
    // "B743",
    // "B744",
    // "B748",
    // "B762",
    // "B763",
    // "B764",
    // "B772",
    // "B773",
    // "B779",
    // "B77L",
    // "B77W",
    // "B788",
    // "B789",
    // "B78X",
  ]);
}

obtainRotations();
