import { Browser } from "puppeteer-core";
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

const aircraftCodesForVariants = {
  A350: ["A359", "A35K"],
  "787": ["B788", "B789", "B78X"],
  A220: ["BCS1", "BCS3"],
  A320neo: ["A19N", "A20N", "A21N"],
  "777": ["777", "B77W", "B772", "B77L", "B773"],
  A380: ["A388"],
  "747": ["B744", "B748", "747", "B742"],
  "767": ["767", "B763", "B764", "B762"],
  A330: ["A333", "A332", "A330"],
  A330neo: ["A339"],
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

async function retrieveCodesForAircraftTypes(aircraftTypes: string[]) {
  console.log("Let's grab these airports, shall we?");
  console.log("Pray that the FlightAware developers will not catch us.");

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

function reverseCodeMapping(objectMap: Object) {
  const reverseMapping: { [key: string]: string } = {};

  for (const [supercode, codes] of Object.entries(objectMap)) {
    for (const code of codes) {
      reverseMapping[code] = supercode;
    }
  }

  return reverseMapping;
}

export default async function prepareCodes(aircraftTypes: string[]) {
  await retrieveCodesForAircraftTypes(aircraftTypes);

  const airportReverseMapping = reverseCodeMapping(
    cityCodesForMultipleAirports
  );
  const aircraftReverseMapping = reverseCodeMapping(aircraftCodesForVariants);

  const resultAirportsArray = airportAndCityCodes.map(
    (code) => airportReverseMapping[code] || code
  );

  const resultAircraftArray = aircraftTypes.map(
    (code) => aircraftReverseMapping[code] || code
  );

  const distinctResultAirportsArray = Array.from(new Set(resultAirportsArray));
  let aircraftCode: string = Array.from(new Set(resultAircraftArray))[0];

  const airportCodes: string[] = [];
  const airportCities: string[] = [];

  for (const result of distinctResultAirportsArray) {
    if (Object.keys(cityCodesForMultipleAirports).includes(result)) {
      airportCities.push(result);
    } else {
      airportCodes.push(result);
    }
  }

  return { airportCodes, airportCities, aircraftCode };
}
