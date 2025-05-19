import { Page, Browser, ElementHandle } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { launchBrowser, openPage } from "./prepareBrowser";
import { containsExactMatch, delay, loadData } from "./helpers";
import { restrictedAirports } from "./restrictedAirports";
import UserAgent from "user-agents";

type CheapestFlightPrice = {
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

type TwoFlightDate = {
  departureDate: string;
  returnDate: string;
};

let cheapestFlightPrices: CheapestFlightPrice[] = [];

const aircraftModelToOpen = "A359";
const aircraftModelStringSearch = "A350-900";

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

const userAgent = new UserAgent({ deviceCategory: "desktop" });
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

    const airportRotationsSet = await prepareRotations(
      airportRotations,
      restrictedAirportCodes
    );

    while (true) {
      const browser = await launchBrowser(false);

      await lookForFlights(browser, saturdayIso, flights, airportRotationsSet);

      await browser.close();

      saturday.setDate(saturday.getDate() + 7);
      saturdayIso = saturday.toISOString().substring(0, 10);
    }
  } catch (error) {
    console.error("An error occurred in the main function.", error);
  }
}

async function prepareRotations(
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

    splitAirportRotation.forEach((airportRotation) =>
      airportRotationsSet.add(airportRotation)
    );
  }

  return airportRotationsSet;
}

async function lookForFlights(
  browser: Browser,
  saturdayIso: string,
  flights: { airlineName: string; flightNumber: string }[],
  airportRotationsSet: Set<string>
) {
  const dateCombinations = generateDateCombinations(saturdayIso);

  const allDates = dateCombinations.flatMap((flight) => [
    flight.departureDate,
    flight.returnDate,
  ]);

  const dateObjects = allDates.map((dateStr) => new Date(dateStr).getTime());

  const latestDateTimestamp = new Date(Math.max(...dateObjects));

  let latestDate = new Date(latestDateTimestamp);

  latestDate.setHours(12, 0, 0, 0);

  const mondayDateProp = latestDate
    .toISOString()
    .substring(5, 10)
    .split("-")
    .join("");

  for (const airportRotation of airportRotationsSet) {
    if (airportRotation === homeAirport) continue;

    for (const dateCombination of dateCombinations) {
      let departOrLandingTimeProps: string[] = [];

      departOrLandingTimeProps.push(`landing=____,${mondayDateProp}@0700`);

      if (
        Object.values(dateCombination).some(
          (dateCombinationProp) =>
            new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
              new Date(dateCombinationProp)
            ) === "Friday"
        )
      ) {
        departOrLandingTimeProps.push("takeoff=1800,____");
      }

      const departOrLandingTimePropsStr = departOrLandingTimeProps.join(";");

      const url = `https://www.kayak.ie/flights/${homeAirport}-${airportRotation}/${dateCombination.departureDate}/${dateCombination.returnDate}?fs=${departOrLandingTimePropsStr};baditin=baditin&sort=price_a`;

      try {
        let page = await openPage(
          browser,
          url,
          userAgents[Math.floor(Math.random() * userAgents.length)].toString()
        );
        console.log(`Opened URL at: ${url}.`);

        page = await handleCaptcha(page, url);

        if (!page || page.isClosed()) {
          console.error("Page is invalid after captcha handling. Skipping...");
          continue;
        }

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
            console.log("No prices found. Proceeding to the next link.");
            await delay(Math.floor(Math.random() * 1000 + 4000));
            if (!page.isClosed()) await page.close();
            await delay(Math.floor(Math.random() * 1000 + 4000));
            continue;
          }
        }

        await delay(Math.floor(Math.random() * 10000 + 30000));
      } catch (error) {
        console.log("An error occured.", error);
      }
    }

    try {
      for (const page of (await browser.pages()).slice(1)) {
        if (!page.isClosed()) {
          await page.bringToFront();

          if (Math.random() > 0.5) await simulateMouseMovement(page);

          if (Math.random() > 0.5) {
            const newPage = await browser.newPage();
            await newPage.goto("https://www.google.com");
            await delay(Math.random() * 5000 + 2000);
            await newPage.close();
            await page.bringToFront();
          }

          console.log(`Looking for prices at: ${page.url()}.`);

          const cheapestFlightPrice = await obtainPrice(
            browser,
            page,
            null,
            flights,
            true
          );

          if (
            cheapestFlightPrice !== null &&
            cheapestFlightPrice !== undefined
          ) {
            const priceObj = createPriceObject(
              cheapestFlightPrice.cheapestFlightPrice,
              page.url(),
              cheapestFlightPrice.flightInfoArr
            );
            cheapestFlightPrices.push(priceObj);
            console.log("Added the link.");
          } else {
            console.log("No prices found for this link.");
          }

          await delay(Math.floor(Math.random() * 1000 + 4000));

          await page.close();
        }
      }

      if (cheapestFlightPrices.length > 0) {
        cheapestFlightPrices.sort((a, b) => a.price - b.price);
        await sendCheapestPricesEmail(cheapestFlightPrices);
        cheapestFlightPrices.length = 0;
      } else {
        console.log(
          "Wasn't able to find prices for any of the rotations. Moving on..."
        );
      }
    } catch (error) {
      console.log("An error occured.", error);
    }
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

    page = await handleCaptcha(page, pageUrl);

    await delay(Math.floor(Math.random() * 5000 + 10000));
  }

  return page;
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

function generateDateCombinations(inputDate: string): TwoFlightDate[] {
  const date = new Date(inputDate);

  const departureDates = getDates(date);
  const returnDates = getDates(date);

  const combinations: TwoFlightDate[] = [];

  // Generate valid combinations
  for (const departureDate of departureDates) {
    for (const returnDate of returnDates) {
      if (new Date(returnDate) >= new Date(departureDate))
        combinations.push({
          departureDate,
          returnDate,
        });
    }
  }

  return combinations;
}

async function obtainPrice(
  browser: Browser,
  page: Page,
  cheapestFlightPrice: string,
  flights: { airlineName: string; flightNumber: string }[],
  firstSearch: boolean,
  startIndex: number = 0
): Promise<{
  cheapestFlightPrice: string;
  flightInfoArr: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  }[];
}> | null {
  const airlines: Object = await loadData("airlines.json");

  if (firstSearch) {
    const takeoffTimesElements = await page.$$(
      ".oKiy-mod-visible .iKtq-inner > div:nth-child(2)"
    );

    await delay(2000);

    if ((await page.$(".oKiy-radios > div > span:nth-child(2)")) !== null) {
      await page.click(".oKiy-radios > div > span:nth-child(2)");
    } else {
      return null;
    }

    const landingTimesElements = await page.$$(
      ".oKiy-mod-visible .iKtq-inner > div:nth-child(2)"
    );

    if (takeoffTimesElements !== null && landingTimesElements !== null) {
      const homeAirportTakeoffTimeElement = takeoffTimesElements[0];
      const homeAirportLandingTimeElement =
        landingTimesElements[2] ?? landingTimesElements[1];

      const homeAirportTakeoffStr = (
        await homeAirportTakeoffTimeElement.evaluate((node) => node.textContent)
      ).trim();

      const homeAirportLandingStr = (
        await homeAirportLandingTimeElement.evaluate((node) => node.textContent)
      ).trim();

      const homeAirportTakeoffDay = homeAirportTakeoffStr.substring(0, 3);
      const homeAirportLandingDay = homeAirportLandingStr.substring(0, 3);

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
        direction: "takeoff" | "landing"
      ): number {
        const [dayStr, timeStr] = s.split(" ");
        let dayNum = dayMap[dayStr];

        if (!dayNum) {
          if (direction === "takeoff") {
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

      const firstDepMinutes = parseDayTime(
        homeAirportTakeoffStr.substring(0, 9),
        "takeoff"
      );
      const lastArrMinutes = parseDayTime(
        homeAirportLandingStr.substring(12),
        "landing"
      );

      if (firstDepMinutes < MIN_DEPARTURE || lastArrMinutes > MAX_ARRIVAL) {
        return null;
      }
    }
  }

  const foundPricesButtons = (await page.$$(
    ".oVHK > .Iqt3"
  )) as ElementHandle<HTMLAnchorElement>[];

  if (foundPricesButtons.length === 0) {
    await browser.close();
    browser = await launchBrowser(false);
    page = await openPage(
      browser,
      page.url(),
      userAgents[Math.floor(Math.random() * userAgents.length)].toString()
    );
  }

  let flightInfoArr: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  }[] = [];

  for (const button of foundPricesButtons.slice(startIndex)) {
    await button.evaluate((btn) => btn.click());

    await delay(5000);

    let flightThatOperatesTheAircraftFound = false;

    let foundNonAircraftDeal = false;

    const flightCards = await page.$$(".E69K-leg-wrapper");

    for (const flightCard of flightCards) {
      const flightSegments = await flightCard.$$(".NxR6-segment");

      for (const flightSegment of flightSegments) {
        const badgeInfo = await flightSegment.$(".NxR6-badge");

        if (
          badgeInfo !== null &&
          (await badgeInfo.evaluate((node) => node.textContent)) ===
            "Train ride"
        ) {
          foundNonAircraftDeal = true;
          break;
        }

        const airlineName = (
          await flightSegment.$eval(
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
          await flightSegment.$eval(
            ".NxR6-plane-details > div:nth-child(1) > span",
            (node) => node.textContent
          )
        ).trim();

        const fullFlightNumber = `${airlineCode}${flightNumber}`;

        let operatedBy = "";
        let aircraftOperating = "";

        if (
          (await flightSegment.$(".NxR6-plane-details > div:nth-child(2)")) !==
          null
        )
          operatedBy = (
            await flightSegment.$eval(
              ".NxR6-plane-details > div:nth-child(2)",
              (node) => node.textContent
            )
          )
            .trim()
            .toLowerCase();

        if ((await flightSegment.$(".NxR6-aircraft-badge > div")) !== null)
          aircraftOperating = (
            await flightSegment.$eval(
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

        const flightTime = (
          await flightSegment.$eval(".NxR6-time", (node) => node.textContent)
        ).substring(0, 13);

        const flightRoute = await flightSegment.$eval(
          ".NxR6-airport",
          (node) => node.textContent
        );

        let aircraft = "";

        if ((await flightSegment.$(".NxR6-aircraft-badge")) !== null)
          aircraft = await flightSegment.$eval(
            ".NxR6-aircraft-badge",
            (node) => node.textContent
          );

        flightInfoArr.push({
          flightTime,
          flightRoute,
          flightNumber: fullFlightNumber,
          aircraft,
        });
      }

      if (foundNonAircraftDeal) {
        break;
      }
    }

    if (flightThatOperatesTheAircraftFound && !foundNonAircraftDeal) {
      cheapestFlightPrice = await page.$eval(
        ".jnTP-display-price",
        (el) => el.textContent
      );
      break;
    }

    flightInfoArr.length = 0;
    await page.goBack();
  }

  if (cheapestFlightPrice !== null) {
    console.log("Found the cheapest price for the desired aircraft.");
    return { cheapestFlightPrice, flightInfoArr };
  } else {
    startIndex = foundPricesButtons.length;
    console.log("No prices have been found for the desired plane so far.");
    console.log("Trying to fetch more prices...");
    try {
      await page.click(".show-more-button");
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      return await obtainPrice(
        browser,
        page,
        cheapestFlightPrice,
        flights,
        false,
        startIndex
      );
    } catch (error) {
      console.log("No more prices available.");
    }
  }
}

function createPriceObject(
  price: string,
  url: string,
  flightInfo: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  }[]
): CheapestFlightPrice {
  return {
    date: saturdayIso,
    price: parseFloat(price.replace(/\D/g, "")),
    url: url,
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

function generateTableRows(items: CheapestFlightPrice[]) {
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
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Flight info</th>
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Price (€)</th>
                          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Link</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${generateTableRows(cheapestPrices).join("")}
                  </tbody>
              </table>
          </body>
        </html>`
  );
}

main();
