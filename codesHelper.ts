import puppeteer, { Browser } from "puppeteer-core";
import { userAgents } from "./userAgents";
import { launchBrowser, openPage } from "./prepareBrowser";

export const cityCodesForMultipleAirports = {
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

let airportAndCityCodes: string[] = [];

function processAirport(airportString: string): string {
  const pattern = /.+ \(([A-Z]{3} \/ [A-Z]{4})\)|.+ \(([A-Z]{4})\)/;

  return airportString.replace(pattern, (_, group1, group2) => {
    if (group1) {
      const matches = group1.match(/^([A-Z]{3})\s/);
      return matches ? matches[1] : "";
    } else if (group2) {
      return group2.slice(1);
    }
    return "";
  });
}

function delay(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

async function retrieveCodesForAircraftTypes(aircraftTypes: string[]) {
  for (const aircraftType of aircraftTypes) {
    const browser = await launchBrowser(true);

    await obtainCodes(browser, aircraftType);

    console.log("Succesfully added airports. Let's go!");

    await browser.close();
  }
}

async function obtainCodes(browser: Browser, aircraftType: string) {
  let offset: number = 0;

  try {
    while (true) {
      const page = await openPage(
        browser,
        `https://www.flightaware.com/live/aircrafttype/${aircraftType};offset=${offset}`,
        userAgents[Math.floor(Math.random() * userAgents.length)].useragent
      );

      console.log(`Opened page at ${page.url()}`);
      console.log("Pray that FlightAware developers will not catch you.");

      const table = await page.$$("table");

      if (
        (await table[2].evaluate((table) => table.innerText)).includes(
          "No matching flights"
        )
      ) {
        break;
      }
      const rows = await table[2].$$(
        "#mainBody > div.pageContainer > table:nth-child(2) > tbody > tr:nth-child(2) > td > table > tbody > tr"
      );

      for (const row of rows) {
        const cells = await row.$$("td");
        const originAirport = processAirport(
          await cells[2].evaluate((cell) => cell.innerText)
        );

        const destinationAirport = processAirport(
          await cells[3].evaluate((cell) => cell.innerText)
        );

        const regex: RegExp = /[A-Z]{3}/g;

        if (originAirport.match(regex)) airportAndCityCodes.push(originAirport);
        if (destinationAirport.match(regex))
          airportAndCityCodes.push(destinationAirport);
      }

      await page.close();

      offset += 20;
    }
  } catch (error) {
    console.error(error);
  }
}

export default async function prepareCodes() {
  const reverseMapping: { [key: string]: string } = {};

  for (const [supercode, codes] of Object.entries(
    cityCodesForMultipleAirports
  )) {
    for (const code of codes) {
      reverseMapping[code] = supercode;
    }
  }

  await retrieveCodesForAircraftTypes(["A359", "A35K"]);

  const resultArray = airportAndCityCodes.map(
    (code) => reverseMapping[code] || code
  );

  const distinctResultArray = Array.from(new Set(resultArray));

  const airportCodes: string[] = [];
  const airportCities: string[] = [];

  for (const result of distinctResultArray) {
    if (Object.keys(cityCodesForMultipleAirports).includes(result)) {
      airportCities.push(result);
    } else {
      airportCodes.push(result);
    }
  }

  return { airportCodes, airportCities };
}
