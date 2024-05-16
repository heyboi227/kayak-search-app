import { Browser, ElementHandle, Page } from "puppeteer-core";
import { userAgents } from "./userAgents";
import { delay, launchBrowser, openPage } from "./prepareBrowser";
import { saveData } from "./helpers";

const cityCodesForMultipleAirports = {
  BJS: ["PEK", "PKX"],
  BHZ: ["CNF", "PLU"],
  BUH: ["OTP", "BBU"],
  BUE: ["EZE", "AEP"],
  CHI: ["ORD", "MDW", "RFD"],
  JKT: ["CGK", "HLP"],
  LON: ["LHR", "LGW", "LCY", "STN", "LTN", "SEN"],
  MIL: ["MXP", "LIN", "BGY"],
  YMQ: ["YUL", "YMX", "YHU"],
  MOW: ["SVO", "DME", "VKO", "ZIA", "OSF"],
  NYC: ["JFK", "LGA", "EWR"],
  OSA: ["ITM", "KIX", "UKB"],
  PAR: ["ORY", "CDG", "LBG", "BVA"],
  RIO: ["GIG", "SDU"],
  ROM: ["FCO", "CIA"],
  SAO: ["CGH", "GRU", "VCP"],
  SPK: ["CTS", "OKD"],
  SEL: ["ICN", "GMP"],
  STO: ["ARN", "BMA", "NYO", "VST"],
  TCI: ["TFN", "TFS"],
  TYO: ["HND", "NRT"],
  YTO: ["YYZ", "YTZ", "YHM", "YKF"],
  WAS: ["IAD", "DCA", "BWI"],
  ALA: ["ALA", "BXJ"],
  BKK: ["BKK", "DMK", "BKK"],
  BFS: ["BFS", "BHD"],
  CTU: ["CTU", "TFU", "HZU"],
  CMB: ["CMB", "RML"],
  DKR: ["DKR", "DSS"],
  DFW: ["DFW", "DAL", "FTW", "AFW", "ADS"],
  DXB: ["DXB", "DWC"],
  GLA: ["GLA", "PIK"],
  HOU: ["HOU", "IAH", "EFD"],
  IST: ["IST", "SAW", "ISL"],
  JNB: ["JNB", "HLA"],
  KUL: ["KUL", "SZB", "KUL"],
  IEV: ["IEV", "KBP"],
  LAX: ["LAX", "SBD", "ONT", "SNA", "VNY", "PMD", "LGB", "BUR"],
  MDE: ["MDE", "EOH"],
  MEX: ["MEX", "NLU"],
  MEL: ["MEL", "MEB", "AVV"],
  MIA: ["MIA", "FLL", "PBI"],
  NGO: ["NGO", "NKM"],
  SAN: ["SAN", "TIJ"],
  SFO: ["SFO", "OAK", "SJC", "STS"],
  SEA: ["SEA", "BFI", "PAE"],
  SHA: ["PVG", "SHA"],
  TPE: ["TPE", "TSA"],
  THR: ["IKA", "THR"],
};

let airportAndCityCodes: Set<string> = new Set<string>();

let startIndex: number = 0;

async function retrieveCodesForAircraftTypes(aircraftTypes: string[]) {
  console.log("Let's grab these airports, shall we?");
  console.log("Pray that the FlightRadar24 developers will not catch us.");
  console.log(
    "This is going to be a long one, so you'd better make some popcorn and go watch your favorite movie."
  );

  for (const aircraftType of aircraftTypes) {
    const browser = await launchBrowser(true);

    const pages = await browser.pages();
    if (pages.length > 1) await pages[0].close();

    await obtainCodes(browser, aircraftType);

    await browser.close();
  }

  console.log(
    `Succesfully added ${airportAndCityCodes.size} airports. Let's go!`
  );
}

function saveCurrentState(index: number) {
  return {
    index,
  };
}

function restoreState(savedState: { index: number }) {
  startIndex = savedState.index;
}

async function acceptCookiesAfterVerification(page: Page) {
  try {
    await page.click("#onetrust-accept-btn-handler");
    console.log("Accepted all cookies, unfortunately.");
    await delay(1500);
  } catch {}
}

async function processLinks(
  browser: Browser,
  links: string[],
  aircraftType: string,
  startIndex: number = 0
) {
  let index = startIndex;

  for (const link of links.slice(startIndex > 0 ? ++startIndex : startIndex)) {
    const detailPage = await openPage(browser, link, getRandomUserAgent());

    await delay(Math.floor(Math.random() * 2000 + 1000));

    if (
      (await detailPage.$eval("html", (page) => page.innerHTML)).includes(
        "Verifying"
      )
    ) {
      let savedState = saveCurrentState(index);

      await delay(Math.floor(Math.random() * 10000 + 15000));

      acceptCookiesAfterVerification(detailPage);

      await browser.close();
      await delay(Math.floor(Math.random() * 5000 + 10000));
      browser = await launchBrowser(true);

      restoreState(savedState);
      await processLinks(browser, links, aircraftType, savedState.index);
    } else {
      await delay(1500);
      acceptCookiesAfterVerification(detailPage);
    }

    index++;

    try {
      const detailRows = await extractAirportCodes(
        browser,
        detailPage,
        aircraftType
      );
      detailRows.forEach(processAirportCode);
    } catch (error) {
      console.error("Error processing link", link, error);
    } finally {
      await detailPage.close();
    }
  }
}

async function checkIfAirportsShouldBeAdded(
  browser: Browser,
  url: string,
  aircraftType: string
): Promise<boolean> {
  const page = await openPage(browser, url, getRandomUserAgent());

  const detailTable = await page.$("#tbl-datatable");
  if (!detailTable) return;

  const detailRows = await detailTable.$$("tbody > tr");
  const aircraftOperating: string[] = [];

  for (const detailRow of detailRows) {
    const aircraftTypeCell = await detailRow.$("td:nth-child(6)");
    const aircraftType = (await getCellText(aircraftTypeCell)).trim();
    const aircraftTypeIata = aircraftType.slice(0, 4);
    aircraftOperating.push(aircraftTypeIata);
  }
  if (
    aircraftOperating.filter((aircraft) => aircraft === aircraftType).length /
      aircraftOperating.length >=
    0.5
  ) {
    return true;
  } else {
    return false;
  }
}

async function extractAirportCodes(
  browser: Browser,
  page: Page,
  aircraftType: string
) {
  const detailTable = await page.$("#tbl-datatable");
  if (!detailTable) return [];

  const detailRows = await detailTable.$$("tbody > tr");
  const airportCodes: string[] = [];

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
    ]).catch(() => []);
    const [originCell, destinationCell, flightLinkCell] = cells;

    try {
      if (flightLinkCell) {
        console.log(
          `Should get link for flight: ${(
            await getCellText(flightLinkCell)
          ).trim()}`
        );
        const flightLink = await getCellLink(flightLinkCell);

        const shouldAddAirports = await checkIfAirportsShouldBeAdded(
          browser,
          flightLink,
          aircraftType
        );

        if (originCell && destinationCell) {
          const originCode = (await getCellText(originCell))
            .trim()
            .slice(-4, -1);
          const destinationCode = (await getCellText(destinationCell))
            .trim()
            .slice(-4, -1);
          if (originCode && destinationCode && shouldAddAirports) {
            airportCodes.push(originCode, destinationCode);
          }
        }
      }
    } catch (error) {
      console.error("Error processing link", error);
    }
  }

  return airportCodes;
}

function processAirportCode(code: string) {
  if (!airportAndCityCodes.has(code)) {
    console.log(`Airport code ${code} added to table.`);
  }
  airportAndCityCodes.add(code);
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

async function obtainCodes(browser: Browser, aircraftType: string) {
  cookiesAccepted = false;

  try {
    const page = await openPage(
      browser,
      `https://www.flightradar24.com/data/aircraft/${aircraftType}`,
      getRandomUserAgent()
    );

    console.log(`Opened page at ${page.url()}`);

    if (!cookiesAccepted) {
      await page.click("#onetrust-accept-btn-handler");
      console.log("Accepted all cookies, unfortunately.");
      cookiesAccepted = true;
    }

    const table = await page.$("#cnt-list-aircraft > table");
    if (!table) {
      console.error("Table not found");
      return;
    }

    const rows = await table.$$("tbody > tr");
    const links = [];

    for (const row of rows) {
      const linkElement = await row.$("td:nth-child(2) > a");
      if (linkElement) {
        const link = await linkElement.evaluate((a) => a.href);
        links.push(link);
      }
    }

    console.log(`Found ${links.length} aircraft to process.`);

    await processLinks(browser, links, aircraftType);
  } catch (error) {
    console.error("An error occurred in obtainCodes:", error);
  }
}

function reverseCodeMapping(objectMap: Object) {
  const reverseMapping: { [key: string]: string } = {};

  for (const [supercode, codes] of Object.entries(objectMap)) {
    for (const code of codes) {
      reverseMapping[code] = supercode;
    }
  }

  return reverseMapping;
}

async function prepareCodes(aircraftTypes: string[]) {
  await retrieveCodesForAircraftTypes(aircraftTypes);

  const airportReverseMapping = reverseCodeMapping(
    cityCodesForMultipleAirports
  );

  const airportAndCityCodesArray = Array.from(airportAndCityCodes);

  const resultAirportsArray = airportAndCityCodesArray.map(
    (code) => airportReverseMapping[code] || code
  );

  const airportCodes: string[] = [];
  const airportCities: Set<string> = new Set<string>();

  for (const result of resultAirportsArray) {
    if (Object.keys(cityCodesForMultipleAirports).includes(result)) {
      airportCities.add(result);
    } else {
      airportCodes.push(result);
    }
  }

  const uniqueAirportCitiesArray = Array.from(airportCities);

  saveData(airportCodes, "codes.json").then(() =>
    console.log("Airport codes succesfully saved!")
  );
  saveData(uniqueAirportCitiesArray, "cities.json").then(() =>
    console.log("Airport cities succesfully saved!")
  );
}

prepareCodes(["B788", "B789", "B78X"]);
