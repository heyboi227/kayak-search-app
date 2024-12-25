import { Page, Browser, ElementHandle } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { launchBrowser, openPage } from "./prepareBrowser";
import { delay, loadData } from "./helpers";
import { restrictedAirports } from "./restrictedAirports";
import UserAgent from "user-agents";

type CheapestMainFlightPrice = {
  date: string;
  price: number;
  url: string;
  flightInfo: {
    flightTime: string;
    flightRoute: string;
    flightNum: string;
    aircraft: string;
  };
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
};

let mainCheapestFlightPrices: CheapestMainFlightPrice[] = [];
let adjacentCheapestFlightPrices: CheapestAdjacentFlightPrice[] = [];

const aircraftModel = "787"; // aircraft model value in the Kayak string search
const aircraftModelToOpen = "B788"; // aircraft model value JSON file suffix
const aircraftModelStringSearch = "787-8"; // aircraft model substring value to search in flights

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

const wantedStartDateIso = "2024-12-21";
const wantedEndDateIso = "2024-12-26";

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

    const browser = await launchBrowser(false);

    await lookForFlights(
      urlsToOpen,
      flights,
      wantedStartDateIso,
      wantedEndDateIso
    );

    await browser.close();
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
  let cheapestDepartingFlightPriceFound: number = Infinity;
  let cheapestReturningFlightPriceFound: number = Infinity;

  let isDepartingFlightCheaper = false;

  const departUserAgent =
    userAgents[Math.floor(Math.random() * userAgents.length)].toString();

  const returnUserAgent =
    userAgents[Math.floor(Math.random() * userAgents.length)].toString();

  try {
    for (let i = 0; i < urlsToOpen.slice(startIndex).length; i += 2) {
      let browser = await launchBrowser(false);

      let departPage = await openPage(
        browser,
        urlsToOpen[i].url,
        departUserAgent
      );

      console.log(`Opened depart URL at: ${urlsToOpen[i].url}.`);

      let returnPage = await openPage(
        browser,
        urlsToOpen[i + 1].url,
        returnUserAgent
      );

      console.log(`Opened return URL at: ${urlsToOpen[i + 1].url}.`);

      await departPage.bringToFront();

      departPage = await handleCaptcha(departPage, urlsToOpen[i].url);

      await delay(500);

      await returnPage.bringToFront();

      returnPage = await handleCaptcha(returnPage, urlsToOpen[i + 1].url);

      if (
        (!departPage || departPage.isClosed()) &&
        (!returnPage || returnPage.isClosed())
      ) {
        console.error("Pages are invalid after captcha handling. Skipping...");
        continue;
      }

      await delay(500);

      await departPage.bringToFront();

      const departPageCookies = await browser.cookies();
      await browser.setCookie(...departPageCookies);

      await acceptCookies(departPage);

      const firstDepartSelector = departPage
        .waitForSelector(".c8MCw-header-text")
        .catch(() => null);

      const secondDepartSelector = departPage
        .waitForSelector(".IVAL-title")
        .catch(() => null);

      const departResult = await Promise.race([
        firstDepartSelector,
        secondDepartSelector,
      ]);

      if (departResult) {
        const headerText = await departPage
          .$eval(".c8MCw-header-text", (el) => el.textContent)
          .catch(() => null);

        const titleText = await departPage
          .$eval(".IVAL-title", (el) => el.textContent)
          .catch(() => null);

        if (
          (headerText &&
            (headerText.includes("No matching results found") ||
              headerText.includes("No matching flights found"))) ||
          titleText
        ) {
          console.log("No prices available. Proceeding to the next link.");
          await departPage.close();
        }
      }

      await returnPage.bringToFront();

      const returnPageCookies = await browser.cookies();
      await browser.setCookie(...returnPageCookies);

      await acceptCookies(returnPage);

      const firstReturnSelector = returnPage
        .waitForSelector(".c8MCw-header-text")
        .catch(() => null);

      const secondReturnSelector = returnPage
        .waitForSelector(".IVAL-title")
        .catch(() => null);

      const returnResult = await Promise.race([
        firstReturnSelector,
        secondReturnSelector,
      ]);

      if (returnResult) {
        const headerText = await returnPage
          .$eval(".c8MCw-header-text", (el) => el.textContent)
          .catch(() => null);

        const titleText = await returnPage
          .$eval(".IVAL-title", (el) => el.textContent)
          .catch(() => null);

        if (
          (headerText &&
            (headerText.includes("No matching results found") ||
              headerText.includes("No matching flights found"))) ||
          titleText
        ) {
          console.log("No prices available. Proceeding to the next link.");
          await returnPage.close();
          continue;
        }
      }

      await delay(Math.floor(Math.random() * 30000 + 90000));

      if (!departPage.isClosed()) {
        await departPage.bringToFront();

        if (Math.random() > 0.5) {
          await departPage.goBack();
          await delay(2000);
          await departPage.goForward();
        }

        if (Math.random() > 0.5) {
          await simulateMouseMovement(departPage);
          await delay(2000);
        }
      }

      await returnPage.bringToFront();

      if (!returnPage.isClosed()) {
        if (Math.random() > 0.5) {
          await returnPage.goBack();
          await delay(2000);
          await returnPage.goForward();
        }

        if (Math.random() > 0.5) {
          await simulateMouseMovement(returnPage);
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

      if (!departPage.isClosed() && !returnPage.isClosed()) {
        await departPage.bringToFront();
        const departCheapestFlightPrice = await obtainPriceForMainRotation(
          browser,
          departPage,
          flights,
          urlsToOpen,
          urlsToOpen[i].airportRotation
        );

        await returnPage.bringToFront();
        const returnCheapestFlightPrice = await obtainPriceForMainRotation(
          browser,
          returnPage,
          flights,
          urlsToOpen,
          urlsToOpen[i + 1].airportRotation
        );

        if (
          departCheapestFlightPrice !== null &&
          departCheapestFlightPrice !== undefined &&
          returnCheapestFlightPrice !== null &&
          returnCheapestFlightPrice !== undefined
        ) {
          let departPriceObj = createMainPriceObject(
            departCheapestFlightPrice.dateIso,
            departCheapestFlightPrice.cheapestFlightPrice,
            urlsToOpen[i].url,
            departCheapestFlightPrice.flightInfoObj
          );

          let returnPriceObj = createMainPriceObject(
            returnCheapestFlightPrice.dateIso,
            returnCheapestFlightPrice.cheapestFlightPrice,
            urlsToOpen[i + 1].url,
            returnCheapestFlightPrice.flightInfoObj
          );

          if (departPriceObj.price < cheapestDepartingFlightPriceFound) {
            cheapestDepartingFlightPriceFound = departPriceObj.price;
          }
          if (returnPriceObj.price < cheapestReturningFlightPriceFound) {
            cheapestReturningFlightPriceFound = returnPriceObj.price;
          }

          if (
            cheapestDepartingFlightPriceFound <
            cheapestReturningFlightPriceFound
          ) {
            isDepartingFlightCheaper = true;
          }

          await delay(Math.floor(Math.random() * 30000 + 90000));

          await browser.close();

          if (isDepartingFlightCheaper) {
            mainCheapestFlightPrices.push(departPriceObj);

            console.log(
              "Found the cheaper main flight price on the departing leg. Trying to obtain prices from adjacent flights..."
            );

            await lookForAdjacentFlights(
              urlsToOpen[i],
              departCheapestFlightPrice.dateIso,
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
              returnCheapestFlightPrice.dateIso,
              returnCheapestFlightPrice.dateTime,
              wantedStartDateIso,
              2 * 60 * 60 * 1000
            );
          }
        }
      }
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
  mainFlightDateIso: string,
  dateIso: string,
  dateTime: string,
  otherLegDateIso: string,
  timeCheck: number
) {
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
    let browser = await launchBrowser(false);

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

      await delay(Math.floor(Math.random() * 30000 + 90000));

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
          flightInfo,
          browser,
          page,
          mainFlightDateIso,
          link.dateIso,
          dateTime,
          link.flightType,
          otherLegDateIso,
          timeCheck,
          links.indexOf(link)
        );

        if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
          const priceObj = createAdjacentPriceObject(
            cheapestFlightPrice.flightDateIso,
            cheapestFlightPrice.cheapestFlightPrice,
            link.url,
            cheapestFlightPrice.flightInfoArr
          );
          adjacentCheapestFlightPrices.push(priceObj);
          console.log("Added the adjacent flight's price.");
        }

        await page.close();
      }
    }

    await browser.close();

    await delay(Math.floor(Math.random() * 30000 + 90000));
  } catch (error) {
    console.log("An error occured.", error);
  }

  if (
    mainCheapestFlightPrices.length > 0 &&
    adjacentCheapestFlightPrices.length > 0
  ) {
    await sendCheapestPricesEmail();
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

async function obtainPriceForMainRotation(
  browser: Browser,
  page: Page,
  flights: { airlineName: string; flightNumber: string }[],
  urlsToOpen: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[],
  airportRotation: string
) {
  const airlines: Object = await loadData("airlines.json");

  let foundPricesButtons: ElementHandle<HTMLAnchorElement>[] = [];

  foundPricesButtons = (await page.$$(
    ".oVHK > .Iqt3"
  )) as ElementHandle<HTMLAnchorElement>[];

  let buttonsFetchAttempts = 0;

  while (foundPricesButtons.length === 0) {
    ++buttonsFetchAttempts;

    await page.reload();
    await delay(Math.floor(Math.random() * 30000 + 90000));

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
      wantedStartDateIso,
      wantedEndDateIso,
      urlsToOpen.findIndex((url) => url.airportRotation === airportRotation)
    );
  }

  let cheapestFlightPrice = null;
  let flightThatOperatesTheAircraftFound = false;

  let dateIso = "";
  let dateTime = "";

  let flightInfoObj: {
    flightTime: string;
    flightRoute: string;
    flightNum: string;
    aircraft: string;
  } = {
    flightTime: "",
    flightRoute: "",
    flightNum: "",
    aircraft: "",
  };

  for (const foundPricesButton of foundPricesButtons) {
    try {
      const innerText = await foundPricesButton.evaluate(
        (btn) => btn.textContent
      );

      if (innerText === "View Deal") continue;

      await foundPricesButton.evaluate((btn) => btn.click());
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      const flightCard = await page.$(".E69K-leg-wrapper");

      const flightTime = (
        await flightCard.$eval(".NxR6-time", (node) => node.textContent)
      ).substring(0, 13);

      const flightRoute = await flightCard.$eval(
        ".NxR6-airport",
        (node) => node.textContent
      );

      const flightNum = await flightCard.$eval(
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
        flightNum,
        aircraft,
      };

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
          (node) => node.textContent
        )
      )
        .replace(/\d+/g, "")
        .trim();

      const airlineCode = Object.keys(airlines).find(
        (key) => airlines[key] === airlineName
      );

      const flightNumber = (
        await flightCard.$eval(
          ".NxR6-plane-details > div:nth-child(1) > span",
          (node) => node.textContent
        )
      ).trim();

      const fullFlightNumber = `${airlineCode}${flightNumber}`;

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
        exactFlight !== undefined ||
        (aircraftOperating.includes(aircraftModelStringSearch) &&
          operatedBy?.includes(exactFlight?.airlineName.trim().toLowerCase()))
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
      flightInfoObj,
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
  browser: Browser,
  page: Page,
  mainFlightDateIso: string,
  dateIso: string,
  dateTime: string,
  flightType: "depart" | "return",
  otherLegDateIso: string,
  timeCheck: number,
  startIndex: number = 0,
  buttonsStartIndex: number = 0
) {
  let foundPricesButtons: ElementHandle<HTMLAnchorElement>[] = [];

  foundPricesButtons = (await page.$$(
    ".oVHK > .Iqt3"
  )) as ElementHandle<HTMLAnchorElement>[];

  let buttonsFetchAttempts = 0;

  while (foundPricesButtons.length === 0) {
    ++buttonsFetchAttempts;

    await page.reload();
    await delay(Math.floor(Math.random() * 30000 + 90000));

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
      dateIso,
      dateTime,
      otherLegDateIso,
      timeCheck
    );
  }

  let cheapestFlightPrice: string = null;

  let flightDateIso: string = "";

  let flightInfoArr: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  }[] = [];

  for (const foundPricesButton of foundPricesButtons.slice(buttonsStartIndex)) {
    try {
      const innerText = await foundPricesButton.evaluate(
        (btn) => btn.textContent
      );

      let foundNonAircraftDeal = false;

      if (innerText === "View Deal") continue;

      await foundPricesButton.evaluate((btn) => btn.click());
      await page.waitForNavigation({ waitUntil: "networkidle2" });

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

      const flightDate = await flightCard.$eval(
        ".c2x94-date",
        (node) => node.textContent
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

          const [adjacentFlightArrivalHours, adjacentFlightArrivalMinutes] =
            lastLegFlightSegmentArrivalTime.split(":").map(Number);

          const mainFlightDepartureTimeDate = new Date(mainFlightDateIso);
          const adjacentFlightArrivalTimeDate = new Date(dateIso);

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
            firstLegFlightSegmentDepartureTime.split(":").map(Number);

          const mainFlightReturnTimeDate = new Date(mainFlightDateIso);
          const adjacentFlightDepartureTimeDate = new Date(dateIso);

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
      flightDateIso,
      dateTime,
      flightInfoArr,
    };
  } else {
    buttonsStartIndex = foundPricesButtons.length;
    flightInfoArr.length = 0;
    console.log("No prices have been found for the desired plane so far.");
    console.log("Trying to fetch more prices...");
    try {
      await page.click(".show-more-button");
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      return await obtainPriceForAdjacentFlight(
        flightInfo,
        browser,
        page,
        mainFlightDateIso,
        dateIso,
        dateTime,
        flightType,
        otherLegDateIso,
        timeCheck,
        startIndex,
        buttonsStartIndex
      );
    } catch (error) {
      console.log("No more prices available.");

      const date = new Date(dateIso);

      if (flightType === "depart") {
        date.setDate(date.getDate() - 1);
        date.setHours(12);
      } else {
        date.setDate(date.getDate() + 1);
        date.setHours(12);
      }

      const newDateIso = date.toISOString().substring(0, 10);

      adjacentCheapestFlightPrices.length = 0;
      flightInfoArr.length = 0;

      await page.close();

      await lookForAdjacentFlights(
        flightInfo,
        mainFlightDateIso,
        newDateIso,
        dateTime,
        otherLegDateIso,
        0
      );
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
    flightNum: string;
    aircraft: string;
  }
): CheapestMainFlightPrice {
  return {
    date,
    price: parseFloat(price.replace(/\D/g, "")),
    url,
    flightInfo,
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
  }[]
): CheapestAdjacentFlightPrice {
  return {
    date,
    price: parseFloat(price.replace(/\D/g, "")),
    url,
    flightInfo,
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

function generateMainFlightTableRows(items: CheapestMainFlightPrice[]) {
  return items.map(
    (item) => `
        <tr>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${new Date(
              item.date
            ).toLocaleDateString("sr")}</td>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">
              <span>${item.flightInfo.flightNum}</span><br>
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
    `
  );
}

function generateAdjacentFlightTableRows(items: CheapestAdjacentFlightPrice[]) {
  return items.map(
    (item) => `
        <tr>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${new Date(
              item.date
            ).toLocaleDateString("sr")}</td>
            <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${item.flightInfo.map(
              (flightInfoObj) =>
                `<span>${flightInfoObj.flightNumber}</span><br>
                 <span>${flightInfoObj.flightTime}</span><br>
                 <span>${flightInfoObj.flightRoute}</span><br>
                 <span>${flightInfoObj.aircraft}</span><br><br>`
            )}</td>
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

async function sendCheapestPricesEmail() {
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
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Flight info</th>
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Price (€)</th>
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Link</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${generateMainFlightTableRows(mainCheapestFlightPrices)}
                      ${generateAdjacentFlightTableRows(
                        adjacentCheapestFlightPrices
                      )}
                  </tbody>
              </table>
              <p>Total price (€): ${
                mainCheapestFlightPrices.reduce(
                  (prev, curr) => prev + curr.price,
                  0
                ) +
                adjacentCheapestFlightPrices.reduce(
                  (prev, curr) => prev + curr.price,
                  0
                )
              }</p>
          </body>
        </html>`
  );
}

main();
