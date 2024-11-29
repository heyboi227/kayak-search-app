import { Page, Browser, ElementHandle } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { launchBrowser, openPage } from "./prepareBrowser";
import { delay, loadData } from "./helpers";
import { restrictedAirports } from "./restrictedAirports";
import UserAgent from "user-agents";

type CheapestFlightPrice = { date: string; price: number; url: string };

let mainCheapestFlightPrices: CheapestFlightPrice[] = [];
let adjacentCheapestFlightPrices: CheapestFlightPrice[] = [];
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

const wantedStartDate = new Date("2024-12-21");
let wantedStartDateIso = wantedStartDate.toISOString().substring(0, 10);

const wantedEndDate = new Date("2024-12-30");
let wantedEndDateIso = wantedEndDate.toISOString().substring(0, 10);

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

    let urlsToOpen: {
      url: string;
      flightType: "depart" | "return";
      dateIso: string;
      airportRotation: string;
    }[] = [];

    await prepareUrls(
      airportRotations,
      restrictedAirportCodes,
      wantedStartDateIso,
      wantedEndDateIso,
      urlsToOpen
    );

    await lookForFlights(
      urlsToOpen,
      flights,
      wantedStartDateIso,
      wantedEndDateIso
    );
  } catch (error) {
    console.error("An error occurred in the main function.", error);
  }
}

async function prepareUrls(
  airportRotations: string[],
  restrictedAirportCodes: string[],
  wantedStartDateIso: string,
  wantedEndDateIso: string,
  mainUrlsToOpen: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[]
) {
  mainUrlsToOpen.length = 0;
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

  for (const airportRotation of airportRotationsSet) {
    const departUrl = `https://www.kayak.ie/flights/${airportRotation}/${wantedStartDateIso}-flexible-3days?fs=stops=~0;eqmodel=~${aircraftModel};bfc=1&sort=price_a`;
    const returnUrl = `https://www.kayak.ie/flights/${airportRotation}/${wantedEndDateIso}-flexible-3days?fs=stops=~0;eqmodel=~${aircraftModel};bfc=1&sort=price_a`;

    const urls: {
      url: string;
      flightType: "depart" | "return";
      dateIso: string;
      airportRotation: string;
    }[] = [
      {
        url: departUrl,
        flightType: "depart",
        dateIso: wantedStartDateIso,
        airportRotation,
      },
      {
        url: returnUrl,
        flightType: "return",
        dateIso: wantedEndDateIso,
        airportRotation,
      },
    ];

    mainUrlsToOpen.push(...urls);
  }
}

async function lookForFlights(
  urlsToOpen: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[],
  flights: { airlineName: string; flightNumber: string }[],
  wantedStartDateIso: string,
  wantedEndDateIso: string,
  startIndex: number = 0
) {
  const browser = await launchBrowser(true);

  let cheapestDepartingFlightPriceFound: number = Infinity;
  let cheapestReturningFlightPriceFound: number = Infinity;

  let isDepartingFlightCheaper = false;

  try {
    for (let i = 0; i < urlsToOpen.slice(startIndex).length; i += 2) {
      const departPage = await openPage(
        browser,
        urlsToOpen[i].url,
        userAgents[Math.floor(Math.random() * userAgents.length)].toString()
      );
      console.log(`Opened depart URL at: ${urlsToOpen[i].url}.`);

      const returnPage = await openPage(
        browser,
        urlsToOpen[i + 1].url,
        userAgents[Math.floor(Math.random() * userAgents.length)].toString()
      );
      console.log(`Opened return URL at: ${urlsToOpen[i + 1].url}.`);

      await departPage.bringToFront();

      await handleCaptcha(browser, departPage, urlsToOpen, i, flights);

      await delay(500);

      await returnPage.bringToFront();

      await handleCaptcha(browser, returnPage, urlsToOpen, i + 1, flights);

      await delay(500);

      await departPage.bringToFront();

      const departPageCookies = await departPage.cookies();
      await departPage.setCookie(...departPageCookies);

      await acceptCookies(departPage);

      await returnPage.bringToFront();

      const returnPageCookies = await returnPage.cookies();
      await returnPage.setCookie(...returnPageCookies);

      await acceptCookies(returnPage);

      const delayPromise = delay(Math.floor(Math.random() * 30000 + 90000));

      await departPage.bringToFront();

      if (Math.random() > 0.5) {
        await departPage.goBack();
        await delay(2000);
        await departPage.goForward();
      }

      if (Math.random() > 0.5) {
        await simulateMouseMovement(departPage);
      }

      await returnPage.bringToFront();

      if (Math.random() > 0.5) {
        await returnPage.goBack();
        await delay(2000);
        await returnPage.goForward();
      }

      if (Math.random() > 0.5) {
        await simulateMouseMovement(returnPage);
      }

      if (Math.random() > 0.5) {
        const newPage = await browser.newPage();
        await newPage.goto("https://www.google.com");
        await delay(Math.random() * 5000 + 2000);
        await newPage.close();
      }

      await delayPromise;

      await departPage.bringToFront();
      const departCheapestFlightPrice = await obtainPriceForMainRotation(
        departPage,
        aircraftModel,
        flights
      );

      await returnPage.bringToFront();
      const returnCheapestFlightPrice = await obtainPriceForMainRotation(
        returnPage,
        aircraftModel,
        flights
      );

      if (
        departCheapestFlightPrice !== null &&
        departCheapestFlightPrice !== undefined &&
        returnCheapestFlightPrice !== null &&
        returnCheapestFlightPrice !== undefined
      ) {
        let departPriceObj = createPriceObject(
          departCheapestFlightPrice.dateIso,
          departCheapestFlightPrice.cheapestFlightPrice,
          urlsToOpen[i].url
        );

        let returnPriceObj = createPriceObject(
          returnCheapestFlightPrice.dateIso,
          returnCheapestFlightPrice.cheapestFlightPrice,
          urlsToOpen[i + 1].url
        );

        if (departPriceObj.price < cheapestDepartingFlightPriceFound) {
          cheapestDepartingFlightPriceFound = departPriceObj.price;
        }
        if (returnPriceObj.price < cheapestReturningFlightPriceFound) {
          cheapestReturningFlightPriceFound = returnPriceObj.price;
        }

        if (
          cheapestDepartingFlightPriceFound < cheapestReturningFlightPriceFound
        ) {
          isDepartingFlightCheaper = true;
        }

        if (isDepartingFlightCheaper) {
          mainCheapestFlightPrices.push(departPriceObj);

          console.log(
            "Found the cheaper main flight price on the departing leg. Trying to obtain prices from adjacent flights..."
          );

          await lookForAdjacentFlights(
            urlsToOpen[i],
            departCheapestFlightPrice.dateIso,
            departCheapestFlightPrice.dateTime,
            wantedEndDateIso,
            2 * 60 * 60 * 1000
          );
        } else {
          mainCheapestFlightPrices.push(returnPriceObj);

          console.log(
            "Found the cheaper main flight price on the returning leg. Trying to obtain prices from adjacent flights..."
          );

          await lookForAdjacentFlights(
            urlsToOpen[i + 1],
            returnCheapestFlightPrice.dateIso,
            returnCheapestFlightPrice.dateTime,
            wantedStartDateIso,
            2 * 60 * 60 * 1000
          );
        }
      }

      await returnPage.close();
      await departPage.close();
    }
  } catch (error) {
    console.log("An error occured.", error);
  }
}

async function lookForAdjacentFlights(
  flightInfo: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  },
  dateIso: string,
  dateTime: string,
  otherLegDateIso: string,
  timeCheck: number,
  startIndex: number = 0
) {
  const browser = await launchBrowser(true);

  const links: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
  }[] = [];

  let departUrl = "";
  let returnUrl = "";

  if (flightInfo.flightType === "depart") {
    departUrl = `https://www.kayak.ie/flights/BEG-${
      flightInfo.airportRotation.split("-")[0]
    }/${dateIso}?fs=bfc=1&sort=price_a`;

    returnUrl = `https://www.kayak.ie/flights/${
      flightInfo.airportRotation.split("-")[1]
    }-BEG/${otherLegDateIso}-flexible-3days?fs=bfc=1&sort=price_a`;
  } else {
    departUrl = `https://www.kayak.ie/flights/BEG-${
      flightInfo.airportRotation.split("-")[0]
    }/${otherLegDateIso}-flexible-3days?fs=bfc=1&sort=price_a`;

    returnUrl = `https://www.kayak.ie/flights/${
      flightInfo.airportRotation.split("-")[1]
    }-BEG/${dateIso}?fs=bfc=1&sort=price_a`;
  }

  links.push({
    url: departUrl,
    flightType: "depart",
    dateIso: flightInfo.flightType === "depart" ? dateIso : otherLegDateIso,
  });
  links.push({
    url: returnUrl,
    flightType: "return",
    dateIso: flightInfo.flightType === "depart" ? otherLegDateIso : dateIso,
  });

  try {
    for (const link of links.slice(startIndex)) {
      const page = await openPage(
        browser,
        link.url,
        userAgents[Math.floor(Math.random() * userAgents.length)].toString()
      );
      console.log(`Opened URL at: ${link.url}.`);

      await handleAdjacentFlightsCaptcha(
        browser,
        page,
        flightInfo,
        dateIso,
        dateTime,
        otherLegDateIso,
        timeCheck,
        links.indexOf(link)
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

      const cheapestFlightPrice = await obtainPriceForAdjacentFlight(
        flightInfo,
        page,
        dateIso,
        link.dateIso,
        dateTime,
        link.flightType,
        otherLegDateIso,
        timeCheck,
        links.indexOf(link)
      );

      if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
        const priceObj = createPriceObject(
          cheapestFlightPrice.flightDateIso,
          cheapestFlightPrice.cheapestFlightPrice,
          link.url
        );
        adjacentCheapestFlightPrices.push(priceObj);
        console.log("Added the adjacent flight's price.");
      }

      await page.close();
    }
  } catch (error) {
    console.log("An error occured.", error);
  }

  const cheapestFlightPrices = mainCheapestFlightPrices.concat(
    adjacentCheapestFlightPrices
  );

  if (cheapestFlightPrices.length > 0) {
    await sendCheapestPricesEmail(cheapestFlightPrices);
    cheapestFlightPrices.length = 0;
    mainCheapestFlightPrices.length = 0;
    adjacentCheapestFlightPrices.length = 0;
  } else {
    console.log(
      "Wasn't able to find any prices for this rotation. Moving on..."
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
  urlsToOpen: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[],
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
    await lookForFlights(
      urlsToOpen,
      flights,
      wantedStartDateIso,
      wantedEndDateIso,
      urlIndex
    );
  }
}

async function handleAdjacentFlightsCaptcha(
  browser: Browser,
  page: Page,
  flightInfo: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  },
  dateIso: string,
  dateTime: string,
  otherLegDateIso: string,
  timeCheck: number,
  startIndex: number
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
    await lookForAdjacentFlights(
      flightInfo,
      dateIso,
      dateTime,
      otherLegDateIso,
      timeCheck,
      startIndex
    );
  }
}

async function obtainPriceForMainRotation(
  page: Page,
  aircraftType: string,
  flights: { airlineName: string; flightNumber: string }[]
) {
  const foundPricesButtons = (await page.$$(
    ".oVHK > .Iqt3"
  )) as ElementHandle<HTMLAnchorElement>[];

  let cheapestFlightPrice = null;
  let flightThatOperatesTheAircraftFound = false;

  let dateIso = "";
  let dateTime = "";

  for (const foundPricesButton of foundPricesButtons) {
    try {
      await foundPricesButton.evaluate((btn) => btn.click());
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      const flightCard = await page.$(".E69K-leg-wrapper");

      const dateString = await flightCard.$eval(
        ".c2x94-date",
        (node) => node.textContent
      );

      const dateWarning = await flightCard.$(".NxR6-date-warning");

      let dateWarningText = "";

      if (dateWarning !== null) {
        dateWarningText = await dateWarning.evaluate(
          (node) => node.textContent
        );
      }

      dateTime = await flightCard.$eval(
        ".NxR6-time",
        (node) => node.textContent
      );

      const currentYear = new Date().getFullYear();

      const now = new Date();

      let date = new Date(`${dateString} ${currentYear}`);
      date.setHours(12);

      if (date.getTime() < now.getTime()) {
        date = new Date(`${dateString} ${currentYear + 1}`);
        date.setHours(12);
      }

      if (dateWarningText !== "") {
        date.setDate(date.getDate() + 1);
      }

      dateIso = date.toISOString().substring(0, 10);

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

      await page.goBack();
    } catch (error) {
      console.log("An error occured.", error);
    }
  }

  if (flightThatOperatesTheAircraftFound) {
    cheapestFlightPrice = await page.$eval(
      ".jnTP-display-price",
      (el) => el.textContent
    );

    return {
      cheapestFlightPrice,
      dateIso,
      dateTime,
    };
  }
}

async function obtainPriceForAdjacentFlight(
  flightInfo: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  },
  page: Page,
  mainFlightDateIso: string,
  dateIso: string,
  dateTime: string,
  flightType: "depart" | "return",
  otherLegDateIso: string,
  timeCheck: number,
  startIndex: number = 0
) {
  const foundPricesButtons = (await page.$$(
    ".oVHK > .Iqt3"
  )) as ElementHandle<HTMLAnchorElement>[];

  let cheapestFlightPrice: string = null;

  let flightDateIso: string = "";

  for (const foundPricesButton of foundPricesButtons.slice(startIndex)) {
    await foundPricesButton.evaluate((btn) => btn.click());
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    const flightCards = await page.$$(".E69K-leg-wrapper");

    const firstLegFlightCard = flightCards[0];
    const lastLegFlightCard = flightCards[flightCards.length - 1];

    const flightDate = await firstLegFlightCard.$eval(
      ".c2x94-date",
      (node) => node.innerHTML
    );

    const currentYear = new Date().getFullYear();

    const now = new Date();

    let date = new Date(`${flightDate} ${currentYear}`);
    date.setHours(12);

    if (date.getTime() < now.getTime()) {
      date = new Date(`${flightDate} ${currentYear + 1}`);
      date.setHours(12);
    }

    flightDateIso = date.toISOString().substring(0, 10);

    const firstLegFlightCardDepartureTime = (
      await firstLegFlightCard.$eval(".NxR6-time", (node) => node.textContent)
    )
      .trim()
      .substring(0, 5);

    const lastLegFlightCardArrivalTime = (
      await lastLegFlightCard.$eval(".NxR6-time", (node) => node.textContent)
    )
      .trim()
      .substring(8, 13);

    if (mainFlightDateIso === dateIso) {
      if (flightType === "depart") {
        const [mainFlightDepartHours, mainFlightDepartMinutes] = dateTime
          .substring(0, 5)
          .split(":")
          .map(Number);

        const [adjacentFlightArrivalHours, adjacentFlightArrivalMinutes] =
          lastLegFlightCardArrivalTime.split(":").map(Number);

        const mainFlightDepartureTimeDate = new Date();
        const adjacentFlightArrivalTimeDate = new Date();

        mainFlightDepartureTimeDate.setHours(
          mainFlightDepartHours,
          mainFlightDepartMinutes
        );
        adjacentFlightArrivalTimeDate.setHours(
          adjacentFlightArrivalHours,
          adjacentFlightArrivalMinutes
        );

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

        const [adjacentFlightDepartureHours, adjacentFlightDepartureMinutes] =
          firstLegFlightCardDepartureTime.split(":").map(Number);

        const mainFlightReturnTimeDate = new Date();
        const adjacentFlightDepartureTimeDate = new Date();

        mainFlightReturnTimeDate.setHours(
          mainFlightReturnHours,
          mainFlightReturnMinutes
        );
        adjacentFlightDepartureTimeDate.setHours(
          adjacentFlightDepartureHours,
          adjacentFlightDepartureMinutes
        );

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

    await page.goBack();
  }

  if (cheapestFlightPrice !== null) {
    return {
      cheapestFlightPrice,
      flightDateIso,
      dateTime,
    };
  } else {
    startIndex = foundPricesButtons.length;
    console.log("No prices have been found for the desired plane so far.");
    console.log("Trying to fetch more prices...");
    try {
      await page.click(".show-more-button");
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      return await obtainPriceForAdjacentFlight(
        flightInfo,
        page,
        mainFlightDateIso,
        dateIso,
        dateTime,
        flightType,
        otherLegDateIso,
        timeCheck,
        startIndex
      );
    } catch (error) {
      console.log("No more prices available.", error);

      const date = new Date(mainFlightDateIso);

      date.setDate(date.getDate() + 1);
      date.setHours(12);

      const newDateIso = date.toISOString().substring(0, 10);

      adjacentCheapestFlightPrices.length = 0;

      timeCheck = 0;

      await lookForAdjacentFlights(
        flightInfo,
        newDateIso,
        dateTime,
        otherLegDateIso,
        timeCheck,
        startIndex
      );
    }
  }
}

function createPriceObject(
  date: string,
  price: string,
  url: string
): CheapestFlightPrice {
  return {
    date,
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
    "Here's all the prices found for the airport rotation. Sending it to you mail right away!"
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
              <p>Total price (€): ${cheapestPrices.reduce(
                (prev, curr) => prev + curr.price,
                0
              )}</p>
          </body>
        </html>`
  );
}

main();
