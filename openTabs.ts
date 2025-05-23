import { Page, Browser, ElementHandle } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { launchBrowser, openPage } from "./prepareBrowser";
import {
  containsExactMatch,
  convertTimeNotation,
  delay,
  extractRotationFromUrl,
  getTimezoneForAirport,
  loadData,
} from "./helpers";
import { restrictedAirports } from "./restrictedAirports";
import UserAgent from "user-agents";
import moment from "moment-timezone";

type CheapestMainFlightPrice = {
  date: string;
  price: number;
  url: string;
  flightInfo: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  };
  pageIndex: number;
};

type CheapestAdjacentFlightPrice = {
  date: string;
  price: number;
  url: string;
  flightInfo: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  }[];
  margin: number;
};

let mainCheapestFlightPrices: CheapestMainFlightPrice[] = [];
let adjacentCheapestFlightPrices: CheapestAdjacentFlightPrice[] = [];

const aircraftModel = "A380"; // aircraft model value in the Kayak string search
const aircraftModelToOpen = "A388"; // aircraft model value JSON file suffix
const aircraftModelStringSearch = "A380"; // aircraft model substring value to search in flights

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

const homeAirport = "BEG";

const saturday = new Date("2025-10-04");
let saturdayIso = saturday.toISOString().substring(0, 10);

const userAgent = new UserAgent({
  deviceCategory: "desktop",
});

const userAgents = Array(100000)
  .fill(undefined)
  .map(() => userAgent.random());

async function main() {
  try {
    const airportRotations: string[] = await loadData(
      `rotations-${aircraftModelToOpen}.json`
    );

    const flights: { airlineName: string; flightNumber: string }[] =
      await loadData(`flights-${aircraftModelToOpen}.json`);

    const restrictedAirportCodes: string[] = restrictedAirports;

    while (true) {
      const urlsByRotation = prepareUrls(
        airportRotations,
        restrictedAirportCodes
      );

      const browser = await launchBrowser(false);

      for (const [rotation, urls] of Object.entries(urlsByRotation)) {
        mainCheapestFlightPrices = [];
        adjacentCheapestFlightPrices = [];

        console.log(`Processing rotation ${rotation}...`);

        await lookForFlights(
          urls.map((url) => ({
            ...url,
            flightType: "depart",
            airportRotation: rotation,
          })),
          flights,
          browser
        );
      }

      await browser.close();

      saturday.setDate(saturday.getDate() + 7);
      saturdayIso = saturday.toISOString().substring(0, 10);
    }
  } catch (error) {
    console.error("An error occurred in the main function.", error);
  }
}

function prepareRotations(
  airportRotations: string[],
  restrictedAirportCodes: string[]
) {
  const filteredAirportRotations = airportRotations.filter(
    (airportRotation) =>
      !restrictedAirportCodes.includes(airportRotation.split("-")[0]) &&
      !restrictedAirportCodes.includes(airportRotation.split("-")[1])
  );

  const airportRotationsSet = new Set<string>();

  for (const airportRotation of filteredAirportRotations) {
    let splitAirportRotation = airportRotation.split("-");

    const airportToCityMap = {};

    Object.entries(cityCodesForMultipleAirports).forEach(
      ([cityCode, airportCodes]) => {
        airportCodes.forEach((airportCode) => {
          airportToCityMap[airportCode] = cityCode;
        });
      }
    );

    splitAirportRotation.forEach((airportCode, index, array) => {
      if (airportToCityMap[airportCode]) {
        array[index] = airportToCityMap[airportCode];
      }
    });

    airportRotationsSet.add(splitAirportRotation.join("-"));
  }

  return airportRotationsSet;
}

// Generate dates Friday to Monday
function getDates(baseDate: Date): string[] {
  const dates: string[] = [];

  for (let offset = -1; offset <= 2; offset++) {
    const newDate = new Date(baseDate);
    newDate.setDate(newDate.getDate() + offset);
    dates.push(newDate.toISOString().split("T")[0]);
  }

  return dates;
}

function prepareUrls(
  airportRotations: string[],
  restrictedAirportCodes: string[]
): Record<string, { url: string; dateIso: string }[]> {
  const map: Record<string, { url: string; dateIso: string }[]> = {};

  const dates = getDates(new Date(saturdayIso));

  const dateObjects = dates.map((dateStr) => new Date(dateStr).getTime());

  const latestDateTimestamp = new Date(Math.max(...dateObjects));

  let latestDate = new Date(latestDateTimestamp);

  latestDate.setHours(12, 0, 0, 0);

  const mondayDateProp = latestDate
    .toISOString()
    .substring(5, 10)
    .split("-")
    .join("");

  const airportRotationsSet = prepareRotations(
    airportRotations,
    restrictedAirportCodes
  );

  for (const airportRotation of airportRotationsSet) {
    map[airportRotation] = [];
    for (const date of dates) {
      let departOrLandingTimeProps: string[] = [];

      const [departAirport, landingAirport] = airportRotation.split("-");

      if (
        new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
          new Date(date)
        ) === "Monday"
      ) {
        departOrLandingTimeProps.push(
          `landing=,${mondayDateProp}@${convertTimeNotation(
            "0700",
            "Europe/Belgrade",
            `${getTimezoneForAirport(landingAirport)}`
          )}`
        );
      } else {
        departOrLandingTimeProps.push(
          `landing=____,${mondayDateProp}@${convertTimeNotation(
            "0700",
            "Europe/Belgrade",
            `${getTimezoneForAirport(landingAirport)}`
          )}`
        );
      }

      if (
        new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
          new Date(date)
        ) === "Friday"
      ) {
        departOrLandingTimeProps.push(
          `takeoff=${convertTimeNotation(
            "1800",
            "Europe/Belgrade",
            `${getTimezoneForAirport(departAirport)}`
          )},____`
        );
      }

      const departOrLandingTimePropsStr = departOrLandingTimeProps.join(";");

      const url = `https://www.kayak.ie/flights/${airportRotation}/${date}?fs=stops=~0;eqmodel=~${aircraftModel};bfc=1;${departOrLandingTimePropsStr}&sort=price_a`;

      map[airportRotation].push({ url, dateIso: date });
    }
  }

  return map;
}

async function findAdjacentForMain(
  mainCandidate: CheapestMainFlightPrice,
  browser: Browser
): Promise<{
  adjacentPrices: CheapestAdjacentFlightPrice[];
  bestMargin: number; // in ms
}> {
  // reset for isolation
  adjacentCheapestFlightPrices.length = 0;

  // run exactly as you do now—but have it return the array AND compute the margin
  await lookForAdjacentFlights(
    {
      // the same shape your function expects
      url: mainCandidate.url,
      dateIso: mainCandidate.date,
      airportRotation: extractRotationFromUrl(mainCandidate.url),
    },
    mainCandidate.date,
    mainCandidate.flightInfo.flightTime,
    2 * 60 * 60 * 1000, // your timeCheck
    browser
  );

  // compute the actual margin you got (adjacent arrival → main departure)
  // here I assume you push objects that contain the time difference
  // into each `CheapestAdjacentFlightPrice.margin` when you find them.
  let bestMargin = Math.max(
    ...adjacentCheapestFlightPrices.map((p) => p.margin || 0),
    -Infinity
  );

  return {
    adjacentPrices: [...adjacentCheapestFlightPrices],
    bestMargin,
  };
}

async function lookForFlights(
  urlsToOpen: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[],
  flights: { airlineName: string; flightNumber: string }[],
  browser: Browser,
  startIndex: number = 0
) {
  let cheapestMainFlightPriceFound: number = Infinity;
  let mainFlightCheapestFlightPrice = {
    cheapestFlightPrice: undefined,
    mainFlightDateIso: "",
    mainFlightBaseDateIso: "",
    dateTime: "",
    flightInfoObj: {
      flightTime: "",
      flightRoute: "",
      flightNumber: "",
      aircraft: "",
    },
  };

  const userAgent =
    userAgents[Math.floor(Math.random() * userAgents.length)].toString();

  try {
    for (let i = startIndex; i < urlsToOpen.slice(startIndex).length; i++) {
      const { url, airportRotation } = urlsToOpen[i];
      let page = await openPage(browser, url, userAgent);

      console.log(`Opened URL at: ${url}.`);

      await page.bringToFront();

      page = await handleCaptcha(page, url);

      await delay(500);

      if (!page || page.isClosed()) {
        console.error("Page is invalid after captcha handling. Skipping...");
        continue;
      }

      await delay(500);

      const pageCookies = await browser.cookies();
      await browser.setCookie(...pageCookies);

      await acceptCookies(page);

      const firstSelector = page
        .waitForSelector(".c8MCw-header-text")
        .catch(() => null);

      const secondSelector = page
        .waitForSelector(".IVAL-title")
        .catch(() => null);

      const result = await Promise.race([firstSelector, secondSelector]);

      if (result) {
        const headerText = await page
          .$eval(".c8MCw-header-text", (el) => el.textContent)
          .catch(() => null);

        const titleText = await page
          .$eval(".IVAL-title", (el) => el.textContent)
          .catch(() => null);

        if (
          (headerText &&
            (headerText.includes("No matching results found") ||
              headerText.includes("No matching flights found"))) ||
          titleText
        ) {
          console.log("No prices available. Proceeding to the next link.");
          await page.close();
        }
      }
    }

    await delay(Math.floor(Math.random() * 5000 + 40000));

    const pages = (await browser.pages()).slice(1);

    for (const page of pages) {
      const { airportRotation } =
        urlsToOpen[urlsToOpen.findIndex((url) => url.url === page.url())];
      if (!page.isClosed()) {
        await page.bringToFront();

        if (Math.random() > 0.5) {
          await page.goBack();
          await delay(2000);
          await page.goForward();
        }

        if (Math.random() > 0.5) {
          await simulateMouseMovement(page);
          await delay(2000);
        }
      }

      if (Math.random() > 0.5) {
        await delay(Math.random() * 5000 + 2000);
        const newPage = await browser.newPage();
        await newPage.goto("https://www.google.com");
        await delay(Math.random() * 5000 + 2000);
        await newPage.close();
      }

      if (!page.isClosed()) {
        await page.bringToFront();
        const offers = await obtainAllPricesForMainRotation(
          browser,
          page,
          flights,
          urlsToOpen,
          airportRotation,
          urlsToOpen.findIndex((url) => url.url === page.url())
        );

        mainCheapestFlightPrices.push(...offers);

        await page.close();
      }
    }

    const floor = Math.min(...mainCheapestFlightPrices.map((p) => p.price));
    const tied = mainCheapestFlightPrices.filter((p) => p.price === floor);

    let winner: {
      main: CheapestMainFlightPrice;
      adjacent: CheapestAdjacentFlightPrice[];
      margin: number;
    } | null = null;

    for (const mainCandidate of tied) {
      const { adjacentPrices, bestMargin } = await findAdjacentForMain(
        mainCandidate,
        browser
      );

      if (adjacentPrices.length > 0) {
        if (!winner || bestMargin > winner.margin) {
          winner = {
            main: mainCandidate,
            adjacent: adjacentPrices,
            margin: bestMargin,
          };
        }
      }
    }

    if (winner) {
      // now you have the optimal combination:
      console.log(
        `Picked rotation @ ${winner.main.date} ` +
          `with price ${floor} and spare margin ${winner.margin / 60000} min.`
      );
      // send email or otherwise report `winner.main` + `winner.adjacent`
      await sendCheapestPricesEmail(winner.main, winner.adjacent);
    } else {
      console.log(
        "No valid adjacent combination found for any tied main price."
      );
    }
  } catch (error) {
    console.log("An error occured.", error);
  }
}

async function lookForAdjacentFlights(
  flightInfo: {
    url: string;
    dateIso: string;
    airportRotation: string;
  },
  mainFlightDateIso: string,
  dateTime: string,
  timeCheck: number,
  browser: Browser
): Promise<{
  adjacentPrices: CheapestAdjacentFlightPrice[];
  bestMargin: number;
}> {
  const links: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[] = [];

  const dates = getDates(new Date(saturdayIso));

  const dateObjects = dates.map((dateStr) => new Date(dateStr).getTime());

  const latestDateTimestamp = new Date(Math.max(...dateObjects));

  let latestDate = new Date(latestDateTimestamp);

  latestDate.setHours(12, 0, 0, 0);

  const mondayDateProp = latestDate
    .toISOString()
    .substring(5, 10)
    .split("-")
    .join("");

  let url: string = "";

  for (const date of dates) {
    let departOrLandingTimeProps: string[] = [];

    departOrLandingTimeProps.push(`landing=____,${mondayDateProp}@0700`);

    if (
      new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
        new Date(date)
      ) === "Friday"
    ) {
      departOrLandingTimeProps.push("takeoff=1800,____");
    }

    const departOrLandingTimePropsStr = departOrLandingTimeProps.join(";");

    if (new Date(date).getTime() <= new Date(mainFlightDateIso).getTime()) {
      url = `https://www.kayak.ie/flights/${homeAirport}-${
        flightInfo.airportRotation.split("-")[0]
      }/${date}?fs=bfc=1;${departOrLandingTimePropsStr}&sort=price_a`;
      links.push({
        url,
        flightType: "depart",
        dateIso: date,
        airportRotation: flightInfo.airportRotation,
      });
    } else {
      url = `https://www.kayak.ie/flights/${
        flightInfo.airportRotation.split("-")[1]
      }-${homeAirport}/${date}?fs=bfc=1;${departOrLandingTimePropsStr}&sort=price_a`;
      links.push({
        url,
        flightType: "return",
        dateIso: date,
        airportRotation: flightInfo.airportRotation,
      });
    }
  }

  try {
    for (const link of links) {
      const page = await openPage(
        browser,
        link.url,
        userAgents[Math.floor(Math.random() * userAgents.length)].toString()
      );
      console.log(`Opened URL at: ${link.url}.`);

      await handleCaptcha(page, link.url);

      const cookies = await browser.cookies();
      await browser.setCookie(...cookies);

      await delay(500);
      await acceptCookies(page);

      const firstSelector = page
        .waitForSelector(".c8MCw-header-text")
        .catch(() => null);

      const secondSelector = page
        .waitForSelector(".IVAL-title")
        .catch(() => null);

      const result = await Promise.race([firstSelector, secondSelector]);

      if (result) {
        const headerText = await page
          .$eval(".c8MCw-header-text", (el) => el.textContent)
          .catch(() => null);

        const titleText = await page
          .$eval(".IVAL-title", (el) => el.textContent)
          .catch(() => null);

        if (
          (headerText &&
            (headerText.includes("No matching results found") ||
              headerText.includes("No matching flights found"))) ||
          titleText
        ) {
          console.log("No prices available. Proceeding to the next link.");
          await page.close();
        }
      }

      await delay(Math.floor(Math.random() * 5000 + 40000));

      if (!page.isClosed()) {
        if (Math.random() > 0.5) {
          await page.goBack();
          await delay(2000);
          await page.goForward();
        }

        if (Math.random() > 0.5) {
          await simulateMouseMovement(page);
        }

        if (Math.random() > 0.5) {
          const newPage = await browser.newPage();
          await newPage.goto("https://www.google.com");
          await delay(Math.random() * 5000 + 2000);
          await newPage.close();
        }

        const cheapestFlightPrice = await obtainPriceForAdjacentFlight(
          links[links.indexOf(link)],
          browser,
          page,
          mainFlightDateIso,
          link.dateIso,
          dateTime,
          link.flightType,
          timeCheck,
          true,
          links.indexOf(link)
        );

        if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
          const priceObj = createAdjacentPriceObject(
            cheapestFlightPrice.adjacentFlightBaseDateIso,
            cheapestFlightPrice.cheapestFlightPrice,
            link.url,
            cheapestFlightPrice.flightInfoArr,
            cheapestFlightPrice.marginMs
          );
          adjacentCheapestFlightPrices.push(priceObj);
          console.log("Added the adjacent flight's price.");
        }

        await page.close();
      }
    }
    await delay(Math.floor(Math.random() * 5000 + 5000));

    const bestMargin = adjacentCheapestFlightPrices.reduce(
      (max, p) => Math.max(max, p.margin),
      -Infinity
    );

    return {
      adjacentPrices: adjacentCheapestFlightPrices,
      bestMargin,
    };
  } catch (error) {
    console.log("An error occured.", error);
  }
}

async function notifyCaptchaNeeded() {
  sendMail(
    "milosjeknic@hotmail.rs",
    "CAPTCHA solving needed",
    "This might not be your lucky day. You will need to solve the CAPTCHA to proceed."
  );
  console.log("Oops, there seems to be a CAPTCHA here. Try to solve it.");
}

async function waitForCaptchaSolution(page: Page) {
  await page.waitForFunction(
    () =>
      !document.URL.includes("security/check") &&
      !document.URL.includes("sitecaptcha"),
    { timeout: 0 }
  );
}

async function isCaptchaPage(url: string) {
  return url.includes("security/check") || url.includes("sitecaptcha");
}

async function handleCaptcha(page: Page, pageUrl: string) {
  if (await isCaptchaPage(page.url())) {
    await delay(3500);
    await acceptCookies(page);

    await notifyCaptchaNeeded();
    await waitForCaptchaSolution(page);

    await delay(3500);
    await page.goto(pageUrl);
  }

  return page;
}

async function obtainAllPricesForMainRotation(
  browser: Browser,
  page: Page,
  flights: { airlineName: string; flightNumber: string }[],
  urlsToOpen: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[],
  airportRotation: string,
  pageIndex: number
) {
  const airlines: Object = await loadData("airlines.json");

  const offers: CheapestMainFlightPrice[] = [];

  const dayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  function parseDayTime(
    s: string,
    homeAirportTakeoffDay?: string,
    homeAirportLandingDay?: string
  ): number {
    const [dayStr, timeStr] = s.split(" ");
    let dayNum = dayMap[dayStr];

    if (!dayNum) {
      if (homeAirportTakeoffDay) {
        dayNum = dayMap[homeAirportTakeoffDay];
      } else {
        dayNum = dayMap[homeAirportLandingDay];
      }
    }

    const [hours, mins] = timeStr.split(":").map(Number);

    return ((dayNum - 1) * 24 + hours) * 60 + mins;
  }

  function convertDepartureToDestZone(
    departureStr: string,
    rotation: string
  ): string {
    const [orgIata] = rotation.split("-");
    const orgTz = getTimezoneForAirport(orgIata);

    const [dayAbbr, timePart] = departureStr.split(" ");
    const [hour, minute] = timePart.split(":").map(Number);

    const belgradeNow = moment.tz("Europe/Belgrade");

    let departMoment = belgradeNow
      .clone()
      .day(dayMap[dayAbbr])
      .hour(hour)
      .minute(minute)
      .second(0);

    if (departMoment.isBefore(belgradeNow)) {
      departMoment.add(7, "days");
    }

    const orgMoment = departMoment.clone().tz(orgTz);
    return orgMoment.format("ddd HH:mm");
  }

  function convertArrivalToDestZone(
    arrivalStr: string,
    rotation: string
  ): string {
    const [, destIata] = rotation.split("-");
    const destTz = getTimezoneForAirport(destIata);

    const [dayAbbr, timePart] = arrivalStr.split(" ");
    const [hour, minute] = timePart.split(":").map(Number);

    const belgradeNow = moment.tz("Europe/Belgrade");

    let departMoment = belgradeNow
      .clone()
      .day(dayMap[dayAbbr])
      .hour(hour)
      .minute(minute)
      .second(0);

    if (departMoment.isBefore(belgradeNow)) {
      departMoment.add(7, "days");
    }

    const destMoment = departMoment.clone().tz(destTz);
    return destMoment.format("ddd HH:mm");
  }

  const MIN_DEPARTURE = parseDayTime(
    convertDepartureToDestZone("Fri 18:00", airportRotation),
    "takeoff"
  );
  const MAX_ARRIVAL = parseDayTime(
    convertArrivalToDestZone("Mon 07:00", airportRotation),
    "landing"
  );

  const takeoffTimeElement = (
    await page.$$(".oKiy-mod-visible .iKtq-inner > div:nth-child(2)")
  )[0];

  const landingTimeElement = (
    await page.$$(".oKiy-mod-visible .iKtq-inner > div:nth-child(2)")
  )[1];

  if (takeoffTimeElement !== null) {
    const takeoffStr = (
      await takeoffTimeElement.evaluate((node) => node.textContent)
    ).trim();

    const takeoffDay = takeoffStr.substring(0, 3);

    const firstDepMinutes = parseDayTime(
      takeoffStr.substring(0, 9),
      takeoffDay
    );

    if (takeoffDay === "Fri" && firstDepMinutes < MIN_DEPARTURE) {
      return null;
    }
  }

  if (landingTimeElement !== null) {
    const landingStr = (
      await landingTimeElement.evaluate((node) => node.textContent)
    ).trim();

    const landingDay = landingStr.substring(0, 3);

    const lastArrMinutes = parseDayTime(landingStr.substring(12), landingDay);

    if (landingDay === "Mon" && lastArrMinutes > MAX_ARRIVAL) {
      return null;
    }
  }

  let foundPricesButtons: ElementHandle<HTMLAnchorElement>[] = [];

  foundPricesButtons = (await page.$$(
    ".oVHK > .Iqt3"
  )) as ElementHandle<HTMLAnchorElement>[];

  let buttonsFetchAttempts = 0;

  while (foundPricesButtons.length === 0) {
    ++buttonsFetchAttempts;

    await page.reload();
    await delay(Math.floor(Math.random() * 5000 + 40000));

    foundPricesButtons = (await page.$$(
      ".oVHK > .Iqt3"
    )) as ElementHandle<HTMLAnchorElement>[];

    if (buttonsFetchAttempts === 3) {
      break;
    }
  }

  if (foundPricesButtons.length === 0) {
    await lookForFlights(
      urlsToOpen,
      flights,
      browser,
      urlsToOpen.findIndex((url) => url.airportRotation === airportRotation)
    );
  }

  let flightThatOperatesTheAircraftFound = false;

  let mainFlightBaseDateIso = "";

  let flightInfoObj: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  } = {
    flightTime: "",
    flightRoute: "",
    flightNumber: "",
    aircraft: "",
  };

  for (const foundPricesButton of foundPricesButtons) {
    try {
      const innerText = await foundPricesButton.evaluate(
        (btn) => btn.textContent
      );

      if (innerText === "View Deal") continue;

      await foundPricesButton.evaluate((btn) => btn.click());
      await page.waitForNavigation();

      await delay(5000);

      const flightCard = await page.$(".E69K-leg-wrapper");

      const flightTime = (
        await flightCard.$eval(".NxR6-time", (node) => node.textContent)
      ).substring(0, 13);

      const flightRoute = await flightCard.$eval(
        ".NxR6-airport",
        (node) => node.textContent
      );

      const flightNumber = await flightCard.$eval(
        ".NxR6-plane-details > div:nth-child(1)",
        (node) => node.textContent
      );

      let aircraft = "";

      if ((await flightCard.$(".NxR6-aircraft-badge")) !== null)
        aircraft = await flightCard.$eval(
          ".NxR6-aircraft-badge",
          (node) => node.textContent
        );

      flightInfoObj = {
        flightTime,
        flightRoute,
        flightNumber,
        aircraft,
      };

      const routeAndDateString = await flightCard.$eval(
        ".c2x94-title",
        (node) => node.textContent
      );

      let flightDate = routeAndDateString.substring(9);

      let baseDate = new Date(`${flightDate} ${new Date().getFullYear()}`);
      baseDate.setHours(12);

      if (baseDate.getTime() < new Date().getTime()) {
        baseDate = new Date(`${flightDate} ${new Date().getFullYear() + 1}`);
        baseDate.setHours(12);
      }

      mainFlightBaseDateIso = baseDate.toISOString().substring(0, 10);

      for (const flightSegment of await flightCard.$$(".NxR6-segment")) {
        const dateWarning = await flightSegment.$(".NxR6-date-warning");

        if (dateWarning !== null) {
          const dateWarningText = await dateWarning.evaluate(
            (node) => node.textContent
          );
          flightDate = dateWarningText.trim().substring(8);
        }
      }

      const currentYear = new Date().getFullYear();

      const now = new Date();

      let date = new Date(`${flightDate} ${currentYear}`);
      date.setHours(12);

      if (date.getTime() < now.getTime()) {
        date = new Date(`${flightDate} ${currentYear + 1}`);
        date.setHours(12);
      }

      const airlineName = (
        await flightCard.$eval(
          ".NxR6-plane-details > div:nth-child(1)",
          (node) => node.textContent
        )
      )
        .replace(/\d+/g, "")
        .trim();

      const airlineCode = Object.keys(airlines).find(
        (key) => airlines[key] === airlineName
      );

      const flightNum = (
        await flightCard.$eval(
          ".NxR6-plane-details > div:nth-child(1) > span",
          (node) => node.textContent
        )
      ).trim();

      const fullFlightNumber = `${airlineCode}${flightNum}`;

      let operatedBy = "";
      let aircraftOperating = "";

      if (
        (await flightCard.$(".NxR6-plane-details > div:nth-child(2)")) !== null
      )
        operatedBy = (
          await flightCard.$eval(
            ".NxR6-plane-details > div:nth-child(2)",
            (node) => node.textContent
          )
        )
          .trim()
          .toLowerCase();

      if ((await flightCard.$(".NxR6-aircraft-badge > div")) !== null)
        aircraftOperating = (
          await flightCard.$eval(
            ".NxR6-aircraft-badge > div",
            (node) => node.textContent
          )
        ).trim();

      const exactFlight = flights.find(
        (flight) => flight.flightNumber === fullFlightNumber
      );

      if (
        containsExactMatch(aircraftOperating, aircraftModelStringSearch) &&
        (exactFlight !== undefined ||
          operatedBy?.includes(exactFlight?.airlineName.trim().toLowerCase()))
      ) {
        flightThatOperatesTheAircraftFound = true;
        break;
      }

      if (flightThatOperatesTheAircraftFound) {
        const rawPrice = await page.$eval(
          ".jnTP-display-price",
          (el) => el.textContent
        );

        offers.push(
          createMainPriceObject(
            mainFlightBaseDateIso,
            rawPrice,
            page.url(),
            flightInfoObj,
            pageIndex
          )
        );
      }

      await page.goBack();
    } catch (error) {
      console.log("An error occured.", error);
    }
  }

  return offers;
}

async function obtainPriceForAdjacentFlight(
  flightInfo: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  },
  browser: Browser,
  page: Page,
  mainFlightDateIso: string,
  dateIso: string,
  dateTime: string,
  flightType: "depart" | "return",
  timeCheck: number,
  firstSearch: boolean,
  startIndex: number = 0,
  buttonsStartIndex: number = 0
) {
  const dayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  function parseDayTime(
    s: string,
    homeAirportTakeoffDay?: string,
    homeAirportLandingDay?: string
  ): number {
    const [dayStr, timeStr] = s.split(" ");
    let dayNum = dayMap[dayStr];

    if (!dayNum) {
      if (homeAirportTakeoffDay) {
        dayNum = dayMap[homeAirportTakeoffDay];
      } else {
        dayNum = dayMap[homeAirportLandingDay];
      }
    }

    const [hours, mins] = timeStr.split(":").map(Number);

    return ((dayNum - 1) * 24 + hours) * 60 + mins;
  }

  const MIN_DEPARTURE = parseDayTime("Fri 18:00", "takeoff");
  const MAX_ARRIVAL = parseDayTime("Mon 07:00", "landing");

  if (firstSearch) {
    if (flightType === "depart") {
      const homeAirportTakeoffTimeElement = (
        await page.$$(".oKiy-mod-visible .iKtq-inner > div:nth-child(2)")
      )[0];

      if (homeAirportTakeoffTimeElement !== null) {
        const homeAirportTakeoffStr = (
          await homeAirportTakeoffTimeElement.evaluate(
            (node) => node.textContent
          )
        ).trim();

        const homeAirportTakeoffDay = homeAirportTakeoffStr.substring(0, 3);

        const firstDepMinutes = parseDayTime(
          homeAirportTakeoffStr.substring(0, 9),
          homeAirportTakeoffDay
        );

        if (firstDepMinutes < MIN_DEPARTURE) {
          return null;
        }
      }
    } else {
      const homeAirportLandingTimeElement = (
        await page.$$(".oKiy-mod-visible .iKtq-inner > div:nth-child(2)")
      )[1];

      if (homeAirportLandingTimeElement !== null) {
        const homeAirportLandingStr = (
          await homeAirportLandingTimeElement.evaluate(
            (node) => node.textContent
          )
        ).trim();

        const homeAirportLandingDay = homeAirportLandingStr.substring(0, 3);

        const lastArrMinutes = parseDayTime(
          homeAirportLandingStr.substring(12),
          homeAirportLandingDay
        );

        if (lastArrMinutes > MAX_ARRIVAL) {
          return null;
        }
      }
    }
  }

  let foundPricesButtons: ElementHandle<HTMLAnchorElement>[] = [];

  foundPricesButtons = (await page.$$(
    ".oVHK > .Iqt3"
  )) as ElementHandle<HTMLAnchorElement>[];

  let buttonsFetchAttempts = 0;

  while (foundPricesButtons.length === 0) {
    ++buttonsFetchAttempts;

    await page.reload();
    await delay(Math.floor(Math.random() * 5000 + 40000));

    foundPricesButtons = (await page.$$(
      ".oVHK > .Iqt3"
    )) as ElementHandle<HTMLAnchorElement>[];

    if (buttonsFetchAttempts === 3) {
      break;
    }
  }

  if (foundPricesButtons.length === 0) {
    await page.close();
    await lookForAdjacentFlights(
      flightInfo,
      mainFlightDateIso,
      dateTime,
      timeCheck,
      browser
    );
  }

  let cheapestFlightPrice: string = null;

  let adjacentFlightDateIso: string = "";
  let adjacentFlightBaseDateIso: string = "";

  let flightInfoArr: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  }[] = [];

  let marginMs: number;

  for (const foundPricesButton of foundPricesButtons.slice(buttonsStartIndex)) {
    try {
      const innerText = await foundPricesButton.evaluate(
        (btn) => btn.textContent
      );

      let foundNonAircraftDeal = false;

      if (innerText === "View Deal") continue;

      await foundPricesButton.evaluate((btn) => btn.click());
      await page.waitForNavigation();

      await delay(5000);

      const flightCard = await page.$(".E69K-leg-wrapper");

      const flightSegments = await flightCard.$$(".NxR6-segment");

      for (const flightSegment of flightSegments) {
        const flightTime = (
          await flightSegment.$eval(".NxR6-time", (node) => node.textContent)
        ).substring(0, 13);

        const flightRoute = await flightSegment.$eval(
          ".NxR6-airport",
          (node) => node.textContent
        );

        const flightNumber = await flightSegment.$eval(
          ".NxR6-plane-details > div:nth-child(1)",
          (node) => node.textContent
        );

        const badgeInfo = await flightSegment.$(".NxR6-badge");

        if (
          badgeInfo !== null &&
          (await badgeInfo.evaluate((node) => node.textContent)) ===
            "Train ride"
        ) {
          foundNonAircraftDeal = true;
          break;
        }

        let aircraft = "";

        if ((await flightSegment.$(".NxR6-aircraft-badge")) !== null)
          aircraft = await flightSegment.$eval(
            ".NxR6-aircraft-badge",
            (node) => node.textContent
          );

        flightInfoArr.push({
          flightTime,
          flightRoute,
          flightNumber,
          aircraft,
        });
      }

      if (foundNonAircraftDeal) {
        await page.goBack();
        continue;
      }

      const firstLegFlightSegment = flightSegments[0];
      const lastLegFlightSegment = flightSegments[flightSegments.length - 1];

      const routeAndDateString = await flightCard.$eval(
        ".c2x94-title",
        (node) => node.textContent
      );

      let flightDate = routeAndDateString.substring(9);

      let baseDate = new Date(`${flightDate} ${new Date().getFullYear()}`);
      baseDate.setHours(12);

      if (baseDate.getTime() < new Date().getTime()) {
        baseDate = new Date(`${flightDate} ${new Date().getFullYear() + 1}`);
        baseDate.setHours(12);
      }

      adjacentFlightBaseDateIso = baseDate.toISOString().substring(0, 10);

      for (const flightSegment of flightSegments) {
        const dateWarning = await flightSegment.$(".NxR6-date-warning");

        if (dateWarning !== null) {
          const dateWarningText = await dateWarning.evaluate(
            (node) => node.textContent
          );
          flightDate = dateWarningText.trim().substring(8);
        }
      }

      const currentYear = new Date().getFullYear();

      const now = new Date();

      let date = new Date(`${flightDate} ${currentYear}`);
      date.setHours(12);

      if (date.getTime() < now.getTime()) {
        date = new Date(`${flightDate} ${currentYear + 1}`);
        date.setHours(12);
      }

      adjacentFlightDateIso = date.toISOString().substring(0, 10);

      const firstLegFlightSegmentDepartureTime = (
        await firstLegFlightSegment.$eval(
          ".NxR6-time",
          (node) => node.textContent
        )
      )
        .trim()
        .substring(0, 5);

      const lastLegFlightSegmentArrivalTime = (
        await lastLegFlightSegment.$eval(
          ".NxR6-time",
          (node) => node.textContent
        )
      )
        .trim()
        .substring(8, 13);

      if (flightInfo.flightType === flightType) {
        if (flightInfo.flightType === "depart") {
          const [mainFlightDepartHours, mainFlightDepartMinutes] = dateTime
            .substring(0, 5)
            .split(":")
            .map(Number);

          const mainDep = moment(
            `${mainFlightDateIso} ${mainFlightDepartHours}:${mainFlightDepartMinutes}`,
            "YYYY-MM-DD HH:mm"
          );

          const [adjacentFlightArrivalHours, adjacentFlightArrivalMinutes] =
            lastLegFlightSegmentArrivalTime.split(":").map(Number);

          const adjArr = moment(
            `${adjacentFlightDateIso} ${adjacentFlightArrivalHours}:${adjacentFlightArrivalMinutes}`,
            "YYYY-MM-DD HH:mm"
          );

          marginMs = mainDep.diff(adjArr);

          const mainFlightDepartureTimeDate = new Date(mainFlightDateIso);
          const adjacentFlightArrivalTimeDate = new Date(adjacentFlightDateIso);

          mainFlightDepartureTimeDate.setHours(
            mainFlightDepartHours,
            mainFlightDepartMinutes
          );
          adjacentFlightArrivalTimeDate.setHours(
            adjacentFlightArrivalHours,
            adjacentFlightArrivalMinutes
          );

          if (adjacentFlightArrivalTimeDate > mainFlightDepartureTimeDate) {
            flightInfoArr.length = 0;
            await page.goBack();
            continue;
          }

          const mainFlightDepartureTimeToMilliseconds =
            mainFlightDepartureTimeDate.getTime();
          const adjacentFlightArrivalTimeDateToMilliseconds =
            adjacentFlightArrivalTimeDate.getTime();

          if (
            mainFlightDepartureTimeToMilliseconds -
              adjacentFlightArrivalTimeDateToMilliseconds >=
            timeCheck
          ) {
            cheapestFlightPrice = await page.$eval(
              ".jnTP-display-price",
              (el) => el.textContent
            );
            break;
          }
        } else {
          const [mainFlightReturnHours, mainFlightReturnMinutes] = dateTime
            .substring(8, 13)
            .split(":")
            .map(Number);

          const mainRet = moment(
            `${mainFlightDateIso} ${mainFlightReturnHours}:${mainFlightReturnMinutes}`,
            "YYYY-MM-DD HH:mm"
          );

          const [adjacentFlightDepartureHours, adjacentFlightDepartureMinutes] =
            firstLegFlightSegmentDepartureTime.split(":").map(Number);

          const adjDep = moment(
            `${adjacentFlightDateIso} ${adjacentFlightDepartureHours}:${adjacentFlightDepartureMinutes}`,
            "YYYY-MM-DD HH:mm"
          );

          marginMs = adjDep.diff(mainRet);

          const mainFlightReturnTimeDate = new Date(mainFlightDateIso);
          const adjacentFlightDepartureTimeDate = new Date(
            adjacentFlightDateIso
          );

          mainFlightReturnTimeDate.setHours(
            mainFlightReturnHours,
            mainFlightReturnMinutes
          );
          adjacentFlightDepartureTimeDate.setHours(
            adjacentFlightDepartureHours,
            adjacentFlightDepartureMinutes
          );

          if (adjacentFlightDepartureTimeDate < mainFlightReturnTimeDate) {
            flightInfoArr.length = 0;
            await page.goBack();
            continue;
          }

          const mainFlightReturnTimeToMilliseconds =
            mainFlightReturnTimeDate.getTime();
          const adjacentFlightDepartureTimeDateToMilliseconds =
            adjacentFlightDepartureTimeDate.getTime();

          if (
            adjacentFlightDepartureTimeDateToMilliseconds -
              mainFlightReturnTimeToMilliseconds >=
            timeCheck
          ) {
            cheapestFlightPrice = await page.$eval(
              ".jnTP-display-price",
              (el) => el.textContent
            );
            break;
          }
        }
      } else {
        cheapestFlightPrice = await page.$eval(
          ".jnTP-display-price",
          (el) => el.textContent
        );
        break;
      }

      flightInfoArr.length = 0;
      await page.goBack();
    } catch (error) {
      console.log("An error occurred.", error);
    }
  }

  if (cheapestFlightPrice !== null) {
    return {
      cheapestFlightPrice,
      adjacentFlightBaseDateIso,
      dateTime,
      flightInfoArr,
      marginMs,
    };
  } else {
    buttonsStartIndex = foundPricesButtons.length;
    flightInfoArr.length = 0;
    console.log("No prices have been found for the desired plane so far.");
    console.log("Trying to fetch more prices...");
    try {
      await page.click(".show-more-button");
      await page.waitForNavigation();

      return await obtainPriceForAdjacentFlight(
        flightInfo,
        browser,
        page,
        mainFlightDateIso,
        dateIso,
        dateTime,
        flightType,
        timeCheck,
        false,
        startIndex,
        buttonsStartIndex
      );
    } catch (error) {
      console.log("No more prices available.");
    }
  }
}

function createMainPriceObject(
  date: string,
  price: string,
  url: string,
  flightInfo: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  },
  pageIndex: number
): CheapestMainFlightPrice {
  return {
    date,
    price: parseFloat(price.replace(/\D/g, "")),
    url,
    flightInfo,
    pageIndex,
  };
}

function createAdjacentPriceObject(
  date: string,
  price: string,
  url: string,
  flightInfo: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  }[],
  margin: number
): CheapestAdjacentFlightPrice {
  return {
    date,
    price: parseFloat(price.replace(/\D/g, "")),
    url,
    flightInfo,
    margin,
  };
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

async function simulateMouseMovement(page: Page) {
  await page.mouse.move(
    Math.floor(Math.random() * 100 + 100),
    Math.floor(Math.random() * 100 + 100)
  );
  await page.mouse.move(
    Math.floor(Math.random() * 200 + 200),
    Math.floor(Math.random() * 200 + 200)
  );
  await page.mouse.move(
    Math.floor(Math.random() * 300 + 300),
    Math.floor(Math.random() * 300 + 300)
  );
}

async function sendMail(to: string, subject: string, message: string) {
  const transporter = nodemailer.createTransport({
    host: MailConfigurationParameters.host,
    port: MailConfigurationParameters.port,
    secure: false,
    tls: {
      ciphers: "SSLv3",
    },
    debug: MailConfigurationParameters.debug,
    auth: {
      user: MailConfigurationParameters.email,
      pass: MailConfigurationParameters.password,
    },
  });

  const mailOptions = {
    from: process.env.USER_EMAIL,
    to: to,
    subject: subject,
    html: message,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

function generateMainFlightTableRow(item: CheapestMainFlightPrice) {
  return `
        <tr>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${new Date(
              item.date
            ).toLocaleDateString("sr")}</td>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">
              <span>${item.flightInfo.flightNumber}</span><br>
              <span>${item.flightInfo.flightTime}</span><br>
              <span>${item.flightInfo.flightRoute}</span><br>
              <span>${item.flightInfo.aircraft}</span></td>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${
              item.price
            }</td>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">
                <a href="${item.url}" target="_blank">${item.url}</a>
            </td>
        </tr>
    `;
}

function generateAdjacentFlightTableRows(items: CheapestAdjacentFlightPrice[]) {
  return items.map(
    (item) => `
        <tr>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${new Date(
              item.date
            ).toLocaleDateString("sr")}</td>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${item.flightInfo
              .map(
                (flightInfoObj) =>
                  `<span>${flightInfoObj.flightNumber}</span><br>
                 <span>${flightInfoObj.flightTime}</span><br>
                 <span>${flightInfoObj.flightRoute}</span><br>
                 <span>${flightInfoObj.aircraft}</span><br><br>`
              )
              .join("")}</td>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${
              item.price
            }</td>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">
                <a href="${item.url}" target="_blank">${item.url}</a>
            </td>
        </tr>
    `
  );
}

async function sendCheapestPricesEmail(
  mainPrice: CheapestMainFlightPrice,
  adjacentPrices: CheapestAdjacentFlightPrice[]
) {
  const totalPrice =
    mainPrice.price +
    adjacentPrices.reduce((prev, curr) => prev + curr.price, 0);

  console.log(
    "Here's all the prices found for the airport rotation. Sending it to you mail right away!"
  );

  await sendMail(
    "milosjeknic@hotmail.rs",
    `New cheapest price found: ${totalPrice}€`,
    `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
          </head>
          <body>
              <p>Hey there! These are the cheapest prices that I've managed to find so far. Check it out.</p>
              <h2>Price Overview</h2>
              <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                      <tr style="background-color: #f2f2f2;">
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Date</th>
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Flight info</th>
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Price (€)</th>
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Link</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${generateMainFlightTableRow(mainPrice)}
                      ${generateAdjacentFlightTableRows(
                        adjacentCheapestFlightPrices
                      ).join("")}
                  </tbody>
              </table>
              <p>Total price (€): ${totalPrice}</p>
          </body>
        </html>`
  );
}

main();
