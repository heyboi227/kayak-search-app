import { Page, Browser, ElementHandle } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { launchBrowser, openPage } from "./prepareBrowser";
import { delay, loadData } from "./helpers";
import { restrictedAirports } from "./restrictedAirports";
import UserAgent from "user-agents";
import moment from "moment-timezone";

const airportTz: {
  code: string;
  timezone: string;
  offset: { gmt: number; dst: number };
}[] = require("airport-timezone");

type CheapestFlightPrice = { date: string; price: number; url: string };
type FlightDate = {
  departureDate: string;
  midpointDate: string;
  returnDate: string;
};

let cheapestFlightPrices: CheapestFlightPrice[] = [];
let cheapestFlightPriceFoundUrl: string = "";
const aircraftModel = "A350";

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

const saturday = new Date("2024-11-30");
let saturdayIso = saturday.toISOString().substring(0, 10);

const userAgent = new UserAgent({ deviceCategory: "desktop" });
const userAgents = Array(100000)
  .fill(undefined)
  .map(() => userAgent.random());

async function main() {
  try {
    const airportRotations: string[] = await loadData("rotations.json");
    const flights: { airlineName: string; flightNumber: string }[] =
      await loadData("flights.json");

    const restrictedAirportCodes: string[] = restrictedAirports;

    let urlsToOpen: { url: string; airportRotation: string }[] = [];

    await prepareUrls(
      airportRotations,
      restrictedAirportCodes,
      aircraftModel,
      saturdayIso,
      urlsToOpen
    );

    while (true) {
      await lookForSingleFlights(urlsToOpen, flights);

      saturday.setDate(saturday.getDate() + 7);
      saturdayIso = saturday.toISOString().substring(0, 10);
      await prepareUrls(
        airportRotations,
        restrictedAirportCodes,
        aircraftModel,
        saturdayIso,
        urlsToOpen
      );

      await lookForSingleFlights(urlsToOpen, flights);
    }
  } catch (error) {
    console.error("An error occurred in the main function.", error);
  }
}

async function prepareUrls(
  airportRotations: string[],
  restrictedAirportCodes: string[],
  aircraftModel: string,
  saturdayIso: string,
  urlsToOpen: { url: string; airportRotation: string }[]
) {
  urlsToOpen.length = 0;
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

  airportRotationsSet.forEach((rotation) => {
    const linkAndAirportRotationObj = {
      url: `https://www.kayak.ie/flights/${rotation}/${saturdayIso}-flexible-1day?fs=eqmodel=~${aircraftModel};stops=~0&sort=price_a`,
      airportRotation: rotation,
    };

    urlsToOpen.push(linkAndAirportRotationObj);
  });
}

async function lookForSingleFlights(
  urlsToOpen: { url: string; airportRotation: string }[],
  flights: { airlineName: string; flightNumber: string }[],
  startIndex: number = 0
) {
  const browser = await launchBrowser(true);

  try {
    for (const url of urlsToOpen.slice(startIndex)) {
      const page = await openPage(
        browser,
        url.url,
        userAgents[Math.floor(Math.random() * userAgents.length)].toString()
      );
      console.log(`Opened URL at: ${url.url}.`);

      await handleCaptcha(
        browser,
        page,
        urlsToOpen,
        urlsToOpen.indexOf(url),
        flights
      );

      const cookies = await page.cookies();
      await page.setCookie(...cookies);

      await delay(500);
      await acceptCookies(page);

      if (
        (await page.$eval("html", (page) => page.innerHTML)).includes("expired")
      ) {
        await page.reload();
      }

      const delayPromise = delay(Math.floor(Math.random() * 30000 + 90000));
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

      await delayPromise;

      const cheapestFlightPrice =
        await getCheapestFlightPriceForSingleFlightLeg(page);
      if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
        console.log(
          "Prices have been found for this flight. Starting to process date combinations..."
        );
        cheapestFlightPriceFoundUrl = url.url;

        await processDateCombinations(
          browser,
          cheapestFlightPriceFoundUrl,
          saturdayIso,
          aircraftModel,
          flights
        );

        await page.close();
      } else {
        await page.close();
      }
    }
  } catch (error) {
    console.log("An error occured.", error);
  }
}

async function processDateCombinations(
  browser: Browser,
  singleFlightCheapestPriceUrl: string,
  saturdayIso: string,
  aircraftModel: string,
  flights: { airlineName: string; flightNumber: string }[],
  startIndex: number = 0
) {
  const dateCombinations = generateDateCombinations(saturdayIso);
  let urlsToOpenForCombinations: string[] = [];

  const airportRotation = singleFlightCheapestPriceUrl
    .split("/flights/")[1]
    .split("/")[0];
  const midpoints = airportRotation.split("-");
  const firstMidpoint = midpoints[0];
  const secondMidpoint = midpoints[1];

  for (const dateCombination of dateCombinations) {
    const url = `https://www.kayak.ie/flights/BEG-${firstMidpoint}/${dateCombination.departureDate}/${airportRotation}/${dateCombination.midpointDate}/${secondMidpoint}-BEG/${dateCombination.returnDate}?fs=baditin=baditin&sort=price_a`;
    urlsToOpenForCombinations.push(url);
  }

  try {
    for (const url of urlsToOpenForCombinations.slice(startIndex)) {
      const page = await openPage(
        browser,
        url,
        userAgents[Math.floor(Math.random() * userAgents.length)].toString()
      );
      console.log(`Opened URL at: ${url}.`);

      await handleDateCombinationsCaptcha(
        browser,
        page,
        urlsToOpenForCombinations.indexOf(url),
        flights
      );

      const cookies = await page.cookies();
      await page.setCookie(...cookies);

      await delay(500);
      await acceptCookies(page);
      await delay(Math.floor(Math.random() * 30000 + 90000));

      if (
        (await page.$eval("html", (page) => page.innerHTML)).includes("expired")
      ) {
        await page.reload();
      }

      const delayPromise = delay(Math.floor(Math.random() * 30000 + 90000));
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

      await delayPromise;

      const cheapestFlightPrice =
        await getCheapestFlightPriceForDateCombinationsAndFlexibleDates(
          page,
          aircraftModel,
          null,
          airportRotation,
          flights
        );

      if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
        const priceObj = createPriceObject(cheapestFlightPrice, url);
        cheapestFlightPrices.push(priceObj);
        console.log("Added the link.");
      }

      await page.close();
    }
  } catch (error) {
    console.log("An error occured.", error);
  }

  await processFlexibleDates(
    browser,
    cheapestFlightPriceFoundUrl,
    saturdayIso,
    aircraftModel,
    flights
  );
}

async function processFlexibleDates(
  browser: Browser,
  singleFlightCheapestPriceUrl: string,
  saturdayIso: string,
  aircraftModel: string,
  flights: { airlineName: string; flightNumber: string }[],
  startIndex: number = 0
) {
  console.log(
    "No prices have been found for the date combinations. Starting to process the flexible date options."
  );

  let urlsToOpenForCombinations: string[] = [];

  const airportRotation = singleFlightCheapestPriceUrl
    .split("/flights/")[1]
    .split("/")[0];
  const midpoints = airportRotation.split("-");

  for (const midpoint of midpoints) {
    const url = `https://www.kayak.ie/flights/BEG-${midpoint}/${saturdayIso}-flexible-1day/${saturdayIso}-flexible-1day?fs=baditin=baditin;eqmodel=~A350&sort=price_a`;
    urlsToOpenForCombinations.push(url);
  }

  try {
    for (const url of urlsToOpenForCombinations.slice(startIndex)) {
      const page = await openPage(
        browser,
        url,
        userAgents[Math.floor(Math.random() * userAgents.length)].toString()
      );
      console.log(`Opened URL at: ${url}.`);

      await handleFlexibleDatesCaptcha(
        browser,
        page,
        urlsToOpenForCombinations.indexOf(url),
        flights
      );

      const cookies = await page.cookies();
      await page.setCookie(...cookies);

      await delay(500);
      await acceptCookies(page);
      await delay(Math.floor(Math.random() * 30000 + 90000));

      if (
        (await page.$eval("html", (page) => page.innerHTML)).includes("expired")
      ) {
        await page.reload();
      }

      const delayPromise = delay(Math.floor(Math.random() * 30000 + 90000));
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

      await delayPromise;

      const cheapestFlightPrice =
        await getCheapestFlightPriceForDateCombinationsAndFlexibleDates(
          page,
          aircraftModel,
          null,
          airportRotation,
          flights
        );

      if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
        const priceObj = createPriceObject(cheapestFlightPrice, url);
        cheapestFlightPrices.push(priceObj);
        console.log("Added the link.");
      }

      await page.close();
    }
  } catch (error) {
    console.log("An error occured.", error);
  }

  if (cheapestFlightPrices.length > 0) {
    cheapestFlightPrices.sort((a, b) => a.price - b.price);
    await sendCheapestPricesEmail(cheapestFlightPrices);
    cheapestFlightPrices.length = 0;
  } else {
    console.log(
      "Wasn't able to find any prices for these combinations. Moving on..."
    );
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

async function handleCaptcha(
  browser: Browser,
  page: Page,
  urlsToOpen: { url: string; airportRotation: string }[],
  urlIndex: number,
  flights: { airlineName: string; flightNumber: string }[]
) {
  if (await isCaptchaPage(page.url())) {
    const pages = await browser.pages();
    for (const page of pages) {
      let index: number = 0;
      if ((index === 0 || index === pages.length - 1) && pages.length > 2) {
        continue;
      } else if (pages.length <= 2) {
        break;
      }

      await page.reload();
      index++;
    }

    browser = await launchBrowser(false);

    const newPage = await openPage(
      browser,
      page.url(),
      userAgents[Math.floor(Math.random() * userAgents.length)].toString()
    );

    await delay(3500);
    await acceptCookies(newPage);

    await notifyCaptchaNeeded();
    await waitForCaptchaSolution(newPage);

    await browser.close();
    await lookForSingleFlights(urlsToOpen, flights, urlIndex);
  }
}

async function handleDateCombinationsCaptcha(
  browser: Browser,
  page: Page,
  urlIndex: number,
  flights: { airlineName: string; flightNumber: string }[]
) {
  if (await isCaptchaPage(page.url())) {
    browser = await launchBrowser(false);

    const newPage = await openPage(
      browser,
      page.url(),
      userAgents[Math.floor(Math.random() * userAgents.length)].toString()
    );

    await delay(3500);
    await acceptCookies(newPage);

    await notifyCaptchaNeeded();
    await waitForCaptchaSolution(newPage);

    await browser.close();

    browser = await launchBrowser(true);
    await processDateCombinations(
      browser,
      cheapestFlightPriceFoundUrl,
      saturdayIso,
      aircraftModel,
      flights,
      urlIndex
    );
  }
}

async function handleFlexibleDatesCaptcha(
  browser: Browser,
  page: Page,
  urlIndex: number,
  flights: { airlineName: string; flightNumber: string }[]
) {
  if (await isCaptchaPage(page.url())) {
    const pages = await browser.pages();
    for (const page of pages) {
      let index: number = 0;
      if ((index === 0 || index === pages.length - 1) && pages.length > 2) {
        continue;
      } else if (pages.length <= 2) {
        break;
      }

      await page.reload();
      index++;
    }

    browser = await launchBrowser(false);

    const newPage = await openPage(
      browser,
      page.url(),
      userAgents[Math.floor(Math.random() * userAgents.length)].toString()
    );

    await delay(3500);
    await acceptCookies(newPage);

    await notifyCaptchaNeeded();
    await waitForCaptchaSolution(newPage);

    await browser.close();

    browser = await launchBrowser(true);
    await processFlexibleDates(
      browser,
      cheapestFlightPriceFoundUrl,
      saturdayIso,
      aircraftModel,
      flights,
      urlIndex
    );
  }
}

function generateDateCombinations(inputDate: string): FlightDate[] {
  const date = new Date(inputDate);

  // Generate dates ±1 day
  const getDates = (baseDate: Date): string[] => {
    const dates: string[] = [];
    for (let offset = -1; offset <= 1; offset++) {
      const newDate = new Date(baseDate);
      newDate.setDate(newDate.getDate() + offset);
      dates.push(newDate.toISOString().split("T")[0]);
    }
    return dates;
  };

  const departureDates = getDates(date);
  const midpointDates = getDates(date);
  const returnDates = getDates(date);

  const combinations: FlightDate[] = [];

  // Generate valid combinations
  for (const departureDate of departureDates) {
    for (const midpointDate of midpointDates) {
      for (const returnDate of returnDates) {
        if (
          new Date(midpointDate) >= new Date(departureDate) &&
          new Date(returnDate) >= new Date(midpointDate)
        )
          combinations.push({
            departureDate,
            midpointDate,
            returnDate,
          });
      }
    }
  }

  return combinations;
}

async function getCheapestFlightPriceForSingleFlightLeg(page: Page) {
  let cheapestFlightPrice: string = null;

  try {
    cheapestFlightPrice = await page.$eval(
      ".Hv20-value > div > span:nth-child(1)",
      (el) => el.textContent
    );
  } catch (error) {
    console.log("Selector failed. No price found. Moving on...");
  }

  return cheapestFlightPrice;
}

async function getCheapestFlightPriceForDateCombinationsAndFlexibleDates(
  page: Page,
  aircraftType: string,
  cheapestFlightPrice: string,
  airportRotation: string,
  flights: { airlineName: string; flightNumber: string }[]
) {
  return await obtainPrice(
    page,
    aircraftType,
    cheapestFlightPrice,
    airportRotation,
    flights
  );
}

async function obtainPrice(
  page: Page,
  aircraftType: string,
  cheapestFlightPrice: string,
  airportRotation: string,
  flights: { airlineName: string; flightNumber: string }[],
  startIndex: number = 0
) {
  const foundPricesButtons = (await page.$$(
    ".oVHK > .Iqt3"
  )) as ElementHandle<HTMLAnchorElement>[];

  const homeTimeZone = "Europe/Belgrade";
  const cutoffLocalTime = "09:00";

  for (const button of foundPricesButtons.slice(startIndex)) {
    await button.evaluate((btn) => btn.click());

    let flightThatOperatesTheAircraftFound = false;
    let nonSuitableTimesFound = false;

    const flightCards = await page.$$(".E69K-leg-wrapper");

    for (const flightCard of flightCards) {
      const flightDate = await flightCard.$eval(
        ".c2x94-date",
        (node) => node.innerHTML
      );

      const arrivalAirportIATA = (
        await flightCard.$eval(".c2x94-title", (node) => node.textContent)
      ).substring(6, 9);

      const flightSegments = await flightCard.$$(".NxR6-segment");

      for (const flightSegment of flightSegments) {
        const flightTime = await flightSegment.$eval(
          ".NxR6-time",
          (node) => node.innerHTML
        );

        const [departureHours, departureMinutes] = flightTime
          .substring(0, 5)
          .split(":")
          .map(Number);

        const flightStartTime = new Date();
        flightStartTime.setHours(departureHours, departureMinutes, 0, 0);

        const earliestDepartureTime = new Date();
        earliestDepartureTime.setHours(17, 0, 0, 0);

        const arrivalTimeZone = airportTz.filter(
          (airport) => airport.code === arrivalAirportIATA
        )[0]?.timezone;

        const arrivalLocalTime = flightTime.substring(8, 13);

        const arrivalInHomeTimeZone = moment
          .tz(arrivalLocalTime, "HH:mm", arrivalTimeZone)
          .tz(homeTimeZone);

        const cutoffTime = moment.tz(cutoffLocalTime, "HH:mm", homeTimeZone);

        const dateWarning = await flightSegment.$(".NxR6-date-warning");

        if (
          (flightDate.includes("Fri") &&
            flightStartTime < earliestDepartureTime) ||
          ((flightDate.includes("Mon") ||
            (dateWarning !== null &&
              (await dateWarning.evaluate((node) => node.textContent)).includes(
                "Mon"
              ))) &&
            arrivalInHomeTimeZone.isAfter(cutoffTime))
        ) {
          nonSuitableTimesFound = true;
          break;
        }
      }

      if (nonSuitableTimesFound) break;

      const airlineName = (
        await flightCard.$eval(
          ".NxR6-plane-details > div:nth-child(1)",
          (node) => node.innerText
        )
      )
        .replace(/\d+/g, "")
        .trim()
        .toLowerCase();

      const flightNumber = (
        await flightCard.$eval(
          ".NxR6-plane-details > div:nth-child(1) > span",
          (node) => node.innerText
        )
      ).trim();

      const operatedBy = (
        await flightCard.$eval(
          ".NxR6-plane-details > div:nth-child(2)",
          (node) => node.innerText
        )
      )
        .trim()
        .toLowerCase();

      const aircraftModel = (
        await flightCard.$eval(
          ".NxR6-aircraft-badge > div",
          (node) => node.innerText
        )
      ).trim();

      const availableAirlineFlights = flights.filter(
        (flight) => flight.airlineName.trim().toLowerCase() === airlineName
      );

      let exactFlight: {
        airlineName: string;
        flightNumber: string;
      } = undefined;

      if (availableAirlineFlights.length > 0) {
        exactFlight = availableAirlineFlights.find(
          (flight) =>
            flight.flightNumber.trim().replace(/\D+/g, "") === flightNumber
        );
      }

      if (
        exactFlight !== undefined ||
        (aircraftModel.includes(aircraftType) &&
          operatedBy.includes(exactFlight?.airlineName.trim().toLowerCase()))
      ) {
        flightThatOperatesTheAircraftFound = true;
        break;
      }
    }

    if (flightThatOperatesTheAircraftFound) {
      cheapestFlightPrice = await page.$eval(
        ".jnTP-display-price",
        (el) => el.textContent
      );
      break;
    }

    await page.goBack();
  }

  if (cheapestFlightPrice !== null) {
    console.log("Found the cheapest price for the desired aircraft.");
    return cheapestFlightPrice;
  } else {
    startIndex = foundPricesButtons.length;
    console.log("No prices have been found for the desired plane so far.");
    console.log("Trying to fetch more prices...");
    try {
      await page.goBack();
      await page.click(".show-more-button");
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      await obtainPrice(
        page,
        aircraftType,
        cheapestFlightPrice,
        airportRotation,
        flights,
        startIndex
      );
    } catch (error) {
      console.log("No more prices available.");
    }
  }
}

function createPriceObject(price: string, url: string): CheapestFlightPrice {
  return {
    date: saturdayIso,
    price: parseFloat(price.replace(/\D/g, "")),
    url: url,
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

function generateTableRows(items: CheapestFlightPrice[]) {
  return items.map(
    (item) => `
        <tr>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${new Date(
              item.date
            ).toLocaleDateString("sr")}</td>
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

async function sendCheapestPricesEmail(cheapestPrices: CheapestFlightPrice[]) {
  console.log(
    "Here's all the combinations found for the cheapest single leg price available so far. Sending it to you mail right away!"
  );

  await sendMail(
    "milosjeknic@hotmail.rs",
    "Hooray! New cheapest prices found.",
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
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Price (€)</th>
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Link</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${generateTableRows(cheapestPrices)}
                  </tbody>
              </table>
          </body>
        </html>`
  );
}

main();
