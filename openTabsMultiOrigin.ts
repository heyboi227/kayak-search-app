import { Page, Browser, ElementHandle } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { launchBrowser, openPage } from "./prepareBrowser";
import {
  containsExactMatch,
  convertHomeMomentToLocal,
  convertTimeNotation,
  delay,
  extractRotationFromUrl,
  findEarliestZone,
  getTimezoneForAirport,
  loadData,
  makeLocalMoment,
  parseDayFrag,
} from "./helpers";
import { restrictedAirports } from "./restrictedAirports";
import moment from "moment-timezone";
import { indexOf } from "lodash";

type MainFlightPrice = {
  date: string;
  price: number;
  url: string;
  flightInfo: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
  };
  arrAirport: string;
  depAirport: string;
};

type AdjacentFlightPrice = {
  date: string;
  price: number;
  url: string;
  flightInfo: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
    departsNextDay: boolean;
  }[];
  flightType: "depart" | "return";
  marginMs: number;
  connectAirport: string;
  homeAirport: string;
};

export const SearchTypes = {
  Cheapest: "CHEAPEST",
  Best: "BEST",
} as const;

export type SearchType = (typeof SearchTypes)[keyof typeof SearchTypes];

const SEARCH_TYPE: SearchType = "BEST" as SearchType;

const sortProp = SEARCH_TYPE === "CHEAPEST" ? "price_a" : "bestflight_a";

const PREFER_ADJACENT_NON_STOP_FLIGHTS: boolean = true;
const PREFER_ADJACENT_MAX_FLIGHT_MARGINS: boolean = true;
const INCLUDE_CABIN_BAGGAGE: boolean = false;
const INCLUDE_CHECKED_BAGGAGE: boolean = false;
const EXCLUDE_SELF_TRANSFERS: boolean = false;
const SET_MIN_LAYOVER_TIME: boolean = false;
const SET_MAX_LAYOVER_TIME: boolean = false;

const minLayoverTime = "165";
const maxLayoverTime = "360";

let errorMessage: string = "";

function setErrorMessage(message: string) {
  errorMessage = message;
  console.log(errorMessage);
}

let mainFlightPrices: MainFlightPrice[] = [];
let adjacentFlightPrices: AdjacentFlightPrice[] = [];

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

const homeDepartParams: { homeAirport: string; numOfAdults: number }[] = [
  { homeAirport: "BEG", numOfAdults: 5 },
  { homeAirport: "ABZ", numOfAdults: 1 },
];

const earliestTimeZone = findEarliestZone(
  homeDepartParams.map((homeDepartParam) =>
    getTimezoneForAirport(homeDepartParam.homeAirport)
  )
);

const startDate = new Date("2025-09-19");
let startDateIso = startDate.toISOString().substring(0, 10);

const endDate = new Date("2025-09-22");
let endDateIso = endDate.toISOString().substring(0, 10);

const startWeekday = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
}).format(new Date(startDateIso));

const endWeekday = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
}).format(new Date(endDateIso));

async function main() {
  try {
    const airportRotations: string[] = await loadData(
      `rotations-${aircraftModelToOpen}.json`
    );

    const flights: { airlineName: string; flightNumber: string }[] =
      await loadData(`flights-${aircraftModelToOpen}.json`);

    const restrictedAirportCodes: string[] = restrictedAirports;

    const urlsByRotation = prepareUrls(
      airportRotations,
      restrictedAirportCodes
    );

    const browser = await launchBrowser(false);

    for (const [rotation, urls] of Object.entries(urlsByRotation)) {
      mainFlightPrices = [];
      adjacentFlightPrices = [];

      console.log(`Processing rotation ${rotation}...\n`);

      await lookForFlights(
        urls.map((url) => ({
          ...url,
          airportRotation: rotation,
        })),
        flights,
        browser
      );
    }

    await browser.close();
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

function getIsoLocalDateString(date: Date): string {
  const dtf = new Intl.DateTimeFormat("sv-SE");
  return dtf.format(date);
}

function getIsoDateRangeIntl(startIso: string, endIso: string): string[] {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  const dates: string[] = [];
  let current = new Date(startDate);

  while (current <= endDate) {
    dates.push(getIsoLocalDateString(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function prepareUrls(
  airportRotations: string[],
  restrictedAirportCodes: string[]
): Record<string, { url: string }[]> {
  const map: Record<string, { url: string }[]> = {};
  const dates = getIsoDateRangeIntl(startDateIso, endDateIso);

  const dateObjects = dates.map((d) => new Date(d).getTime());
  const latestTimestamp = Math.max(...dateObjects);
  const latestDate = new Date(latestTimestamp);
  latestDate.setHours(12, 0, 0, 0);
  const mondayDateProp = latestDate.toISOString().slice(5, 10).replace("-", "");

  const rotations = Array.from(
    prepareRotations(airportRotations, restrictedAirportCodes)
  );

  const totalNumOfAdults = homeDepartParams.reduce(
    (prev, curr) => prev + curr.numOfAdults,
    0
  );

  for (const rotation of rotations) {
    map[rotation] = [];
    let pendingTakeoff: string | null = null;
    let pendingLanding: string | null = null;

    for (const date of dates) {
      const [departAirport, arriveAirport] = rotation.split("-");
      const weekday = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
      }).format(new Date(date));

      const takeoffProp =
        weekday === "Friday" && startWeekday === "Friday"
          ? `takeoff=${convertTimeNotation(
              "1830",
              earliestTimeZone,
              getTimezoneForAirport(departAirport)
            )},`
          : null;

      const landingTime = convertTimeNotation(
        "0730",
        earliestTimeZone,
        getTimezoneForAirport(arriveAirport)
      );

      const landingProp =
        endWeekday === "Monday"
          ? weekday === "Monday"
            ? `landing=,${landingTime}`
            : `landing=,${mondayDateProp}@${landingTime}`
          : null;

      if (weekday === "Friday" && startWeekday === "Friday") {
        const homeFri = moment.tz(
          `${date} 18:30`,
          "YYYY-MM-DD HH:mm",
          earliestTimeZone
        );
        const localFri = homeFri
          .clone()
          .tz(getTimezoneForAirport(departAirport));
        if (localFri.format("YYYY-MM-DD") !== date) {
          pendingTakeoff = takeoffProp;
          continue;
        }
      }

      if (weekday === "Monday" && endWeekday === "Monday") {
        const homeMon = moment.tz(
          `${date} 07:30`,
          "YYYY-MM-DD HH:mm",
          earliestTimeZone
        );
        const localMon = homeMon
          .clone()
          .tz(getTimezoneForAirport(arriveAirport));
        const localDateMon = localMon.format("YYYY-MM-DD");
        if (localDateMon !== date) {
          pendingLanding = landingProp;
          continue;
        }
      }

      const props: string[] = [];

      if (takeoffProp && weekday === "Friday") props.push(takeoffProp);

      if (pendingTakeoff) {
        props.push(pendingTakeoff);
        pendingTakeoff = null;
      }

      if (landingProp) props.push(landingProp);

      if (pendingLanding) {
        props.push(pendingLanding);
        pendingLanding = null;
      }

      const fsStr = props.length > 0 ? props.join(";") + ";" : "";

      const url = `https://www.kayak.ie/flights/${rotation}/${date}${
        totalNumOfAdults > 1 ? `/${totalNumOfAdults}adults` : ""
      }?fs=${fsStr}stops=~0;eqmodel=~${aircraftModel}&sort=price_a`;
      map[rotation].push({ url });
    }
  }

  return map;
}

async function findAdjacentForMain(
  mainCandidate: MainFlightPrice,
  browser: Browser,
  homeAirport: string,
  numOfAdults: number
) {
  const links = await prepareAdjacentFlightLinks(
    extractRotationFromUrl(mainCandidate.url),
    mainCandidate.date,
    mainCandidate.flightInfo.flightTime,
    homeAirport,
    numOfAdults
  );

  await lookForAdjacentFlights(
    mainCandidate.date,
    mainCandidate.depAirport,
    mainCandidate.arrAirport,
    mainCandidate.flightInfo.flightTime.split(" – ")[0],
    mainCandidate.flightInfo.flightTime.split(" – ")[1],
    browser,
    links.filter((l) => l.flightType === "depart"),
    homeAirport
  );

  if (
    adjacentFlightPrices.filter(
      (adjacentFlightPrice) =>
        adjacentFlightPrice.homeAirport === homeAirport &&
        adjacentFlightPrice.flightType === "depart"
    ).length === 0
  ) {
    setErrorMessage(
      "No suitable depart combination has been found. Exiting.\n"
    );
    return;
  }

  await lookForAdjacentFlights(
    mainCandidate.date,
    mainCandidate.depAirport,
    mainCandidate.arrAirport,
    mainCandidate.flightInfo.flightTime.split(" – ")[0],
    mainCandidate.flightInfo.flightTime.split(" – ")[1],
    browser,
    links.filter((l) => l.flightType === "return"),
    homeAirport
  );
}

async function lookForFlights(
  urlsToOpen: {
    url: string;
    airportRotation: string;
  }[],
  flights: { airlineName: string; flightNumber: string }[],
  browser: Browser,
  startIndex: number = 0
) {
  try {
    for (let i = startIndex; i < urlsToOpen.slice(startIndex).length; i++) {
      const { url } = urlsToOpen[i];
      let page = await openPage(browser, url);

      console.log(`Opened URL at: ${url}.\n`);

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

      await delay(10000);

      while (page.url().endsWith("bestflight_a") || page.url() !== url) {
        await page.close();
        await delay(5000);
        page = await openPage(browser, url);
        await delay(10000);
      }

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
          if (i !== urlsToOpen.slice(startIndex).length - 1) {
            setErrorMessage(
              "No prices available. Proceeding to the next link.\n"
            );
          } else {
            setErrorMessage("No prices available.\n");
          }
          await delay(5000);
          await page.close();
        }
      }
    }

    await delay(Math.floor(Math.random() * 5000 + 40000));

    const pages = (await browser.pages()).slice(1);

    for (const page of pages) {
      const airportRotation = extractRotationFromUrl(page.url());

      if (!page.isClosed()) {
        await page.bringToFront();

        if (Math.random() > 0.5) {
          await simulateMouseMovement(page);
          await delay(2000);
        }

        if (Math.random() > 0.5) {
          await delay(Math.random() * 5000 + 2000);
          const newPage = await browser.newPage();
          await newPage.goto("https://www.google.com");
          await delay(Math.random() * 5000 + 2000);
          await newPage.close();
        }

        await page.bringToFront();

        console.log(`Checking out ${page.url()}.\n`);
        const offers = await obtainAllPricesForMainRotation(
          browser,
          page,
          flights,
          urlsToOpen,
          airportRotation
        );

        if (offers === null || offers.length === 0) {
          setErrorMessage(
            "Cannot find any offers for this main flight link. Skipping...\n"
          );

          await page.close();
          continue;
        } else {
          console.log("Added all the offers for this main flight link.\n");

          mainFlightPrices.push(...offers);
          await page.close();
        }
      }
    }

    if (mainFlightPrices.length > 0) {
      console.log(
        "Added all the offers for all main flight links. Proceeding to look for adjacent flight combinations...\n"
      );
    } else {
      setErrorMessage(
        "No valid main flight price offers found for any of the links. Moving to the next rotation...\n"
      );
      return;
    }

    await delay(Math.floor(Math.random() * 5000 + 5000));

    let winner: {
      main: MainFlightPrice;
      adjacent: {
        homeAirport: string;
        adjacentPrices: AdjacentFlightPrice[];
      }[];
      totalPrice: number;
    } | null = null;

    let flightCandidates: {
      main: MainFlightPrice;
      adjacent: {
        homeAirport: string;
        adjacentPrices: AdjacentFlightPrice[];
      }[];
      totalPrice: number;
    }[] = [];

    for (const mainCandidate of mainFlightPrices) {
      let noCompleteRoundtripFlightsFound: boolean = false;

      adjacentFlightPrices.length = 0;

      for (const homeDepartParam of homeDepartParams) {
        console.log(
          `Finding adjacent ${
            homeDepartParam.homeAirport
          } flight combinations for ${JSON.stringify({
            flightDate: mainCandidate.date,
            flightRoute: mainCandidate.flightInfo.flightRoute,
            flightTime: mainCandidate.flightInfo.flightTime,
            flightNumber: mainCandidate.flightInfo.flightNumber,
          })}...\n`
        );

        await findAdjacentForMain(
          mainCandidate,
          browser,
          homeDepartParam.homeAirport,
          homeDepartParam.numOfAdults
        );

        let filteredHomeAirportDepartPrices: AdjacentFlightPrice[] = [];
        let filteredHomeAirportReturnPrices: AdjacentFlightPrice[] = [];

        const filteredHomeAirportPrices = adjacentFlightPrices.filter(
          (adjacentFlightPrice) =>
            adjacentFlightPrice.homeAirport === homeDepartParam.homeAirport
        );

        if (filteredHomeAirportPrices.length === 0) {
          noCompleteRoundtripFlightsFound = true;
          break;
        } else {
          filteredHomeAirportDepartPrices = filteredHomeAirportPrices.filter(
            (adjacentFlightPrice) => adjacentFlightPrice.flightType === "depart"
          );

          filteredHomeAirportReturnPrices = filteredHomeAirportPrices.filter(
            (adjacentFlightPrice) => adjacentFlightPrice.flightType === "return"
          );

          if (
            filteredHomeAirportDepartPrices.length === 0 ||
            filteredHomeAirportReturnPrices.length === 0
          ) {
            noCompleteRoundtripFlightsFound = true;
            break;
          }
        }
      }

      if (noCompleteRoundtripFlightsFound) {
        setErrorMessage(
          "Wasn't able to find any complete roundtrip (depart + return) adjacent flight options for one of the departure home airports. Skipping this main flight offer.\n"
        );
        continue;
      }

      let totalPrice: number =
        mainCandidate.price *
        homeDepartParams.reduce((prev, curr) => prev + curr.numOfAdults, 0);

      let adjacentFlights: {
        homeAirport: string;
        adjacentPrices: AdjacentFlightPrice[];
      }[] = [];

      const pickBestMargin = (
        arr: AdjacentFlightPrice[]
      ): AdjacentFlightPrice => {
        const bestMargin = Math.max(...arr.map((el) => el.marginMs));

        return arr.find((el) => el.marginMs === bestMargin);
      };

      const pickCheapestThenBestMargin = (
        arr: AdjacentFlightPrice[]
      ): AdjacentFlightPrice => {
        const cheapestPrice = Math.min(...arr.map((el) => el.price));

        const cheapestFiltered = arr.filter((el) => el.price === cheapestPrice);

        const bestMargin = Math.max(
          ...cheapestFiltered.map((el) => el.marginMs)
        );

        return cheapestFiltered.find((el) => el.marginMs === bestMargin);
      };

      for (const homeDepartParam of homeDepartParams) {
        const filteredHomeAirportPrices = adjacentFlightPrices.filter(
          (adjacentFlightPrice) =>
            adjacentFlightPrice.homeAirport === homeDepartParam.homeAirport
        );

        if (filteredHomeAirportPrices.length > 0) {
          const departLegs = filteredHomeAirportPrices.filter(
            (p) => p.flightType === "depart"
          );

          const returnLegs = filteredHomeAirportPrices.filter(
            (p) => p.flightType === "return"
          );

          const bestDepart =
            SEARCH_TYPE === "BEST"
              ? pickBestMargin(departLegs)
              : pickCheapestThenBestMargin(departLegs);

          const bestReturn =
            SEARCH_TYPE === "BEST"
              ? pickBestMargin(returnLegs)
              : pickCheapestThenBestMargin(returnLegs);

          console.log(
            `Picked the best depart flight for ${
              homeDepartParam.homeAirport
            }:\n${JSON.stringify(bestDepart)}\n`
          );

          console.log(
            `Picked the best return flight for ${
              homeDepartParam.homeAirport
            }:\n${JSON.stringify(bestReturn)}\n`
          );

          adjacentFlights.push({
            homeAirport: homeDepartParam.homeAirport,
            adjacentPrices: [
              {
                ...bestDepart,
                price: bestDepart.price * homeDepartParam.numOfAdults,
              },
              {
                ...bestReturn,
                price: bestReturn.price * homeDepartParam.numOfAdults,
              },
            ],
          });

          totalPrice +=
            (bestDepart.price + bestReturn.price) * homeDepartParam.numOfAdults;
        }
      }

      flightCandidates.push({
        main: {
          ...mainCandidate,
          price:
            mainCandidate.price *
            homeDepartParams.reduce((prev, curr) => prev + curr.numOfAdults, 0),
        },
        adjacent: adjacentFlights,
        totalPrice: totalPrice,
      });
    }

    let bestCandidate: {
      main: MainFlightPrice;
      adjacent: {
        homeAirport: string;
        adjacentPrices: AdjacentFlightPrice[];
      }[];
      totalPrice: number;
    } | null = null;

    const minimalTotalPrice = Math.min(
      ...flightCandidates.map((flightCandidate) => flightCandidate.totalPrice)
    );

    const cheapestFlightCandidates = flightCandidates.filter(
      (flightCandidate) => flightCandidate.totalPrice === minimalTotalPrice
    );

    const flattenedCheapestSum = cheapestFlightCandidates
      .map((flightCandidate) =>
        flightCandidate.adjacent.map((adjacentFlight) =>
          adjacentFlight.adjacentPrices.reduce(
            (prev, curr) => prev + curr.marginMs,
            0
          )
        )
      )
      .map((nestedSum) => nestedSum.reduce((prev, curr) => prev + curr, 0));

    const highestMarginCheapestSum = Math.max(...flattenedCheapestSum);

    const flattenedSum = flightCandidates
      .map((flightCandidate) =>
        flightCandidate.adjacent.map((adjacentFlight) =>
          adjacentFlight.adjacentPrices.reduce(
            (prev, curr) => prev + curr.marginMs,
            0
          )
        )
      )
      .map((nestedSum) => nestedSum.reduce((prev, curr) => prev + curr, 0));

    const highestMarginSum = Math.max(...flattenedSum);

    if (SEARCH_TYPE === "CHEAPEST") {
      if (PREFER_ADJACENT_MAX_FLIGHT_MARGINS) {
        bestCandidate = cheapestFlightCandidates.find((candidate) => {
          const reduced = candidate.adjacent.map((adjacentFlight) =>
            adjacentFlight.adjacentPrices.reduce(
              (prev, curr) => prev + curr.marginMs,
              0
            )
          );

          return (
            reduced.reduce((prev, curr) => prev + curr, 0) ===
            highestMarginCheapestSum
          );
        });
      } else {
        bestCandidate = cheapestFlightCandidates.find(
          (flightCandidate) => flightCandidate.totalPrice === minimalTotalPrice
        );
      }
    } else {
      if (PREFER_ADJACENT_MAX_FLIGHT_MARGINS) {
        bestCandidate = flightCandidates.find((candidate) => {
          const reduced = candidate.adjacent.map((adjacentFlight) =>
            adjacentFlight.adjacentPrices.reduce(
              (prev, curr) => prev + curr.marginMs,
              0
            )
          );

          return (
            reduced.reduce((prev, curr) => prev + curr, 0) === highestMarginSum
          );
        });
      } else {
        bestCandidate = flightCandidates.find(
          (flightCandidate) => flightCandidate.totalPrice === minimalTotalPrice
        );
      }
    }

    if (bestCandidate) {
      winner = bestCandidate;

      console.log(
        `Picked rotation ${extractRotationFromUrl(winner.main.url)} @ ${
          winner.main.date
        } ` +
          `with the total price of ${winner.totalPrice}€ (adjacent included).\n`
      );

      await sendCheapestPriceCombinationEmail(
        winner.main,
        winner.adjacent,
        winner.totalPrice
      );
    }
  } catch (error) {
    console.log("\nAn error occured.", error);
  }
}

async function prepareAdjacentFlightLinks(
  airportRotation: string,
  mainFlightDateIso: string,
  mainFlightTime: string,
  homeAirport: string,
  numOfAdults: number
) {
  const links: {
    url: string;
    fallbackUrl?: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[] = [];

  const usedIsoDateValues = new Set<string>();

  const directProp: string = "stops=~0";

  let [mainFlightDepTime, mainFlightArrTime] = mainFlightTime.split(" – ");
  const mainDate = moment(mainFlightDateIso, "YYYY-MM-DD");

  let daysLater: string = "";

  if (/\+\d+/g.test(mainFlightArrTime)) {
    daysLater = mainFlightArrTime.substring(mainFlightArrTime.length - 1);
  }

  const returnBaseDateIso = daysLater
    ? mainDate
        .clone()
        .add(daysLater, parseInt(daysLater) === 1 ? "day" : "days")
        .format("YYYY-MM-DD")
    : mainFlightDateIso;

  mainFlightArrTime = mainFlightArrTime.replaceAll(/\+\d+/g, "");

  const dates = getIsoDateRangeIntl(startDateIso, endDateIso);

  const dateObjects = dates.map((dateStr) => new Date(dateStr).getTime());

  const latestDateTimestamp = new Date(Math.max(...dateObjects));

  let latestDate = new Date(latestDateTimestamp);

  latestDate.setHours(12, 0, 0, 0);

  const mondayDateProp = latestDate
    .toISOString()
    .substring(5, 10)
    .split("-")
    .join("");

  const fridayCheck = (date: string, departTimeProps: string[]) => {
    if (
      new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
        new Date(date)
      ) === "Friday"
    ) {
      departTimeProps.push(`takeoff=1830,`);
    }
  };

  const mondayCheck = (date: string, arriveTimeProps: string[]) => {
    if (
      new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
        new Date(date)
      ) === "Monday"
    ) {
      arriveTimeProps.push(`landing=,0730`);
    } else {
      arriveTimeProps.push(`landing=,${mondayDateProp}@0730`);
    }
  };

  const cabinProp = INCLUDE_CABIN_BAGGAGE ? ";cfc=1;" : "";
  const checkedProp = INCLUDE_CHECKED_BAGGAGE ? ";bfc=1;" : "";
  const noSelfTransferProp = EXCLUDE_SELF_TRANSFERS
    ? "virtualinterline=-virtualinterline"
    : "";

  const layoverTimeProp =
    !SET_MIN_LAYOVER_TIME && !SET_MAX_LAYOVER_TIME
      ? ""
      : `;layoverdur=${SET_MIN_LAYOVER_TIME ? minLayoverTime : ""}-${
          SET_MAX_LAYOVER_TIME ? maxLayoverTime : ""
        };`;

  for (const date of dates) {
    const isBeforeMain = new Date(date) < new Date(mainFlightDateIso);
    const isSameDay = date === mainFlightDateIso;
    const isAfterMain = new Date(date) > new Date(mainFlightDateIso);

    if (isBeforeMain || isSameDay) {
      const departProps: string[] = [];
      const arriveProps: string[] = [];

      fridayCheck(date, departProps);

      const depPropTime = mainFlightDepTime.replace(":", "");

      arriveProps.push(
        `landing=,${
          isSameDay
            ? depPropTime
            : mainFlightDateIso.substring(5).replace("-", "") +
              "@" +
              depPropTime
        }`
      );

      const fs = [...departProps, ...arriveProps].join(";");

      links.push({
        url: `https://www.kayak.ie/flights/${homeAirport}-${
          airportRotation.split("-")[0]
        }/${date}${
          numOfAdults > 1 ? `/${numOfAdults}adults` : ""
        }?fs=${fs}${cabinProp}${checkedProp}${noSelfTransferProp}${layoverTimeProp}${
          PREFER_ADJACENT_NON_STOP_FLIGHTS ? ";" + directProp : ""
        }&sort=${sortProp}`,

        fallbackUrl: PREFER_ADJACENT_NON_STOP_FLIGHTS
          ? `https://www.kayak.ie/flights/${homeAirport}-${
              airportRotation.split("-")[0]
            }/${date}${
              numOfAdults > 1 ? `/${numOfAdults}adults` : ""
            }?fs=${fs}${cabinProp}${checkedProp}${noSelfTransferProp}${layoverTimeProp}&sort=${sortProp}`
          : undefined,

        flightType: "depart",
        dateIso: date,
        airportRotation,
      });
    }

    if (isAfterMain || isSameDay) {
      const departProps: string[] = [];
      const arriveProps: string[] = [];

      mondayCheck(date, arriveProps);

      const arrPropTime = mainFlightArrTime.replace(":", "");

      const dateIso = isSameDay ? returnBaseDateIso : date;

      if (!usedIsoDateValues.has(dateIso)) {
        if (isSameDay) {
          departProps.push(`takeoff=${arrPropTime},`);
        }

        const fs = [...departProps, ...arriveProps].join(";");

        links.push({
          url: `https://www.kayak.ie/flights/${
            airportRotation.split("-")[1]
          }-${homeAirport}/${dateIso}${
            numOfAdults > 1 ? `/${numOfAdults}adults` : ""
          }?fs=${fs}${cabinProp}${checkedProp}${noSelfTransferProp}${layoverTimeProp}${
            PREFER_ADJACENT_NON_STOP_FLIGHTS ? ";" + directProp : ""
          }&sort=${sortProp}`,

          fallbackUrl: PREFER_ADJACENT_NON_STOP_FLIGHTS
            ? `https://www.kayak.ie/flights/${
                airportRotation.split("-")[1]
              }-${homeAirport}/${dateIso}${
                numOfAdults > 1 ? `/${numOfAdults}adults` : ""
              }?fs=${fs}${cabinProp}${checkedProp}${noSelfTransferProp}${layoverTimeProp}&sort=${sortProp}`
            : undefined,

          flightType: "return",
          dateIso,
          airportRotation,
        });

        usedIsoDateValues.add(dateIso);
      }
    }
  }

  return links;
}

async function handleAdjacentPage(
  browser: Browser,
  url: string,
  link: {
    url: string;
    fallbackUrl?: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  },
  links: {
    url: string;
    fallbackUrl?: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[]
) {
  let page = await openPage(browser, url);
  console.log(`Opened URL at: ${url}.\n`);

  await handleCaptcha(page, url);

  const cookies = await browser.cookies();
  await browser.setCookie(...cookies);

  await delay(500);
  await acceptCookies(page);

  await delay(10000);

  while (
    (SEARCH_TYPE === "CHEAPEST" && page.url().endsWith("bestflight_a")) ||
    page.url() !== url
  ) {
    await page.close();
    await delay(5000);
    page = await openPage(browser, url);
    await delay(10000);
  }

  const firstSelector = page
    .waitForSelector(".c8MCw-header-text")
    .catch(() => null);

  const secondSelector = page.waitForSelector(".IVAL-title").catch(() => null);

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
      if (indexOf(links, link) !== links.length - 1) {
        setErrorMessage("No prices available. Proceeding to the next link.\n");
      } else {
        setErrorMessage("No prices available.\n");
      }
      await delay(5000);
      await page.close();
    }
  }

  return page;
}

async function checkAdjacentPage(
  browser: Browser,
  link: {
    url: string;
    fallbackUrl?: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  },
  links: {
    url: string;
    fallbackUrl?: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[],
  mainFlightDateIso: string,
  mainFlightDepAirport: string,
  mainFlightArrAirport: string,
  mainFlightDepTime: string,
  mainFlightArrTime: string,
  homeAirport: string
) {
  const tryUrls =
    PREFER_ADJACENT_NON_STOP_FLIGHTS && link.fallbackUrl
      ? [link.url, link.fallbackUrl]
      : [link.url];

  let page: Page;

  for (const url of tryUrls) {
    try {
      if (
        url === link.fallbackUrl &&
        errorMessage === "No suitable flight offers found.\n"
      ) {
        break;
      }

      page = await handleAdjacentPage(browser, url, link, links);

      if (page?.isClosed()) continue;

      await delay(Math.floor(Math.random() * 5000 + 40000));

      if (!page?.isClosed()) {
        if (Math.random() > 0.5) {
          await simulateMouseMovement(page);
        }

        if (Math.random() > 0.5) {
          const newPage = await browser.newPage();
          await newPage.goto("https://www.google.com");
          await delay(Math.random() * 5000 + 2000);
          await newPage.close();
        }

        const flightPrice = await obtainPriceForAdjacentFlight(
          browser,
          page,
          mainFlightDateIso,
          mainFlightDepAirport,
          mainFlightArrAirport,
          link.dateIso,
          mainFlightDepTime,
          mainFlightArrTime,
          link.flightType,
          true,
          extractRotationFromUrl(link.url),
          links,
          homeAirport
        );

        if (flightPrice !== null && flightPrice !== undefined) {
          const priceObj = createAdjacentPriceObject(
            flightPrice.adjacentFlightBaseDateIso,
            flightPrice.flightPrice,
            flightPrice.flightInfoArr.length > 1
              ? link.fallbackUrl
                ? link.fallbackUrl
                : link.url
              : link.url,
            flightPrice.flightInfoArr,
            flightPrice.flightType,
            flightPrice.marginMs,
            flightPrice.connectAirport,
            flightPrice.homeAirport
          );
          adjacentFlightPrices.push(priceObj);
          console.log(
            `Added the adjacent flight combination's price: ${JSON.stringify(
              priceObj
            )}\n`
          );
          break;
        }
      }
    } finally {
      if (!page?.isClosed()) await page.close();
    }
  }
}

async function lookForAdjacentFlights(
  mainFlightDateIso: string,
  mainFlightDepAirport: string,
  mainFlightArrAirport: string,
  mainFlightDepTime: string,
  mainFlightArrTime: string,
  browser: Browser,
  links: {
    url: string;
    fallbackUrl?: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[],
  homeAirport: string
) {
  try {
    for (const link of links) {
      await checkAdjacentPage(
        browser,
        link,
        links,
        mainFlightDateIso,
        mainFlightDepAirport,
        mainFlightArrAirport,
        mainFlightDepTime,
        mainFlightArrTime,
        homeAirport
      );
    }
    await delay(Math.floor(Math.random() * 5000 + 5000));
    const allPages = (await browser.pages()).slice(1);
    await Promise.all(allPages.map((p) => p.close()));
  } catch (error) {
    console.log("\nAn error occured.", error);
  }
}

async function notifyCaptchaNeeded() {
  sendMail(
    "milosjeknic@hotmail.rs",
    "CAPTCHA solving needed",
    "This might not be your lucky day. You will need to solve the CAPTCHA to proceed."
  );
  console.log("\nOops, there seems to be a CAPTCHA here. Try to solve it.\n");
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
    airportRotation: string;
  }[],
  airportRotation: string
) {
  const airlines: Object = await loadData("airlines.json");

  const offers: MainFlightPrice[] = [];

  if (startWeekday === "Friday" || endWeekday === "Monday") {
    const urlObj = new URL(page.url());
    const mainFlightDateIso = urlObj.pathname.split("/")[3];
    const [origAirport, destAirport] = airportRotation.split("-");

    let minDepartureMoment: moment.MomentInput;
    let maxArrivalMoment: moment.MomentInput;

    const mainFlightDateIsoMoment = moment(mainFlightDateIso);

    const fridayDateIso = mainFlightDateIsoMoment
      .clone()
      .day(mainFlightDateIsoMoment.day() >= 5 ? 5 : -2)
      .format("YYYY-MM-DD");

    const mondayDateIso = mainFlightDateIsoMoment
      .clone()
      .day(mainFlightDateIsoMoment.day() >= 2 ? 8 : 1)
      .format("YYYY-MM-DD");

    if (startWeekday === "Friday") {
      minDepartureMoment = convertHomeMomentToLocal(
        fridayDateIso,
        "18:30",
        earliestTimeZone,
        getTimezoneForAirport(origAirport)
      );
    }

    if (endWeekday === "Monday") {
      maxArrivalMoment = convertHomeMomentToLocal(
        mondayDateIso,
        "07:30",
        earliestTimeZone,
        getTimezoneForAirport(destAirport)
      );
    }

    const takeoffTimeElement = (
      await page.$$(".oKiy-mod-visible .iKtq-inner > div:nth-child(2)")
    )[0];

    const landingTimeElement = (
      await page.$$(".oKiy-mod-visible .iKtq-inner > div:nth-child(2)")
    )[1];

    let firstDepMoment: moment.Moment;
    let lastDepMoment: moment.Moment;

    let firstArrMoment: moment.Moment;
    let lastArrMoment: moment.Moment;

    if (takeoffTimeElement && minDepartureMoment) {
      const raw = (
        await takeoffTimeElement.evaluate((n) => n.textContent)
      ).trim();

      const firstTime = raw.substring(0, 9);
      const lastTime = raw.substring(12);

      firstDepMoment = parseDayFrag(
        firstTime,
        mainFlightDateIso,
        getTimezoneForAirport(origAirport)
      );

      lastDepMoment = parseDayFrag(
        lastTime,
        mainFlightDateIso,
        getTimezoneForAirport(origAirport),
        firstDepMoment
      );

      if (
        firstDepMoment.isBefore(minDepartureMoment) ||
        lastDepMoment.isBefore(minDepartureMoment)
      ) {
        setErrorMessage("No suitable flight offers found.");
        return null;
      }
    }

    if (landingTimeElement && maxArrivalMoment) {
      const raw = (
        await landingTimeElement.evaluate((n) => n.textContent)
      ).trim();

      const firstTime = raw.substring(0, 9);
      const lastTime = raw.substring(12);

      firstArrMoment = parseDayFrag(
        firstTime,
        mainFlightDateIso,
        getTimezoneForAirport(destAirport)
      );

      lastArrMoment = parseDayFrag(
        lastTime,
        mainFlightDateIso,
        getTimezoneForAirport(destAirport),
        firstArrMoment
      );

      if (
        firstArrMoment.isAfter(maxArrivalMoment) ||
        lastArrMoment.isAfter(maxArrivalMoment)
      ) {
        setErrorMessage("No suitable flight offers found.");
        return null;
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
    await lookForFlights(
      urlsToOpen,
      flights,
      browser,
      urlsToOpen.findIndex((url) => url.airportRotation === airportRotation)
    );
  }

  let mainFlightBaseDateIso = "";

  for (const foundPricesButton of foundPricesButtons) {
    try {
      const flightTimeElement = (await page.$$(".vmXl-mod-variant-large"))[
        indexOf(foundPricesButtons, foundPricesButton)
      ];

      const flightTime = await flightTimeElement.evaluate(
        (node) => node.textContent
      );

      const innerText = await foundPricesButton.evaluate(
        (btn) => btn.textContent
      );

      if (innerText === "View Deal") continue;

      await foundPricesButton.evaluate((btn) => btn.click());
      await page.waitForNavigation();

      await delay(5000);

      const flightCard = await page.$(".E69K-leg-wrapper");

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

      let flightInfoObj: {
        flightTime: string;
        flightRoute: string;
        flightNumber: string;
        aircraft: string;
      } = {
        flightTime,
        flightRoute,
        flightNumber,
        aircraft,
      };

      const routeAndDateString = await flightCard.$eval(
        ".c2x94-title",
        (node) => node.textContent
      );

      const rawAirports = (
        await flightCard.$eval(
          ".c2x94-title > span:nth-child(1)",
          (node) => node.textContent
        )
      ).trim();

      const [depAirport, arrAirport] = rawAirports.split(" → ");

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
        ).trim();

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

      const airlinesOperating = new Set(
        flights.map((flight) => flight.airlineName)
      );

      const addPrice = async () => {
        const rawPrice = await page.$eval(
          ".jnTP-display-price",
          (el) => el.textContent
        );

        console.log(
          `Added a price for this rotation: ${JSON.stringify(
            createMainPriceObject(
              mainFlightBaseDateIso,
              rawPrice,
              page.url(),
              flightInfoObj,
              depAirport,
              arrAirport
            )
          )}\n`
        );

        offers.push(
          createMainPriceObject(
            mainFlightBaseDateIso,
            rawPrice,
            page.url(),
            flightInfoObj,
            depAirport,
            arrAirport
          )
        );
      };

      const operatingAirline = operatedBy.replace("Operated by ", "");

      if (containsExactMatch(aircraftOperating, aircraftModelStringSearch)) {
        if (
          (exactFlight !== undefined ||
            airlinesOperating.has(operatingAirline)) &&
          (!offers.some(
            (offer) => offer.flightInfo.flightTime === flightTime
          ) ||
            !offers.some((offer) =>
              offer.flightInfo.flightTime
                .split(" – ")
                .some((flightTimePart) =>
                  flightTime.split(" – ").includes(flightTimePart)
                )
            ))
        ) {
          await addPrice();
        } else {
          setErrorMessage(
            "Same times... Probably a codeshare offer. Skipping this.\n"
          );
        }
      }
    } catch (error) {
      console.log("\nAn error occured.", error);
    }

    await page.goBack();
  }

  return offers;
}

async function obtainPriceForAdjacentFlight(
  browser: Browser,
  page: Page,
  mainFlightDateIso: string,
  mainFlightDepAirport: string,
  mainFlightArrAirport: string,
  dateIso: string,
  mainFlightDepTime: string,
  mainFlightArrTime: string,
  flightType: "depart" | "return",
  firstSearch: boolean,
  airportRotation: string,
  adjacentFlightLinks: {
    url: string;
    flightType: "depart" | "return";
    dateIso: string;
    airportRotation: string;
  }[],
  homeAirport: string,
  startIndex: number = 0,
  buttonsStartIndex: number = 0
) {
  let daysLater: string = "";

  if (/\+\d+/g.test(mainFlightArrTime)) {
    daysLater = mainFlightArrTime.substring(mainFlightArrTime.length - 1);
    mainFlightArrTime = mainFlightArrTime.replaceAll(/\+\d+/g, "");
  }

  const mainFlightDepMoment = makeLocalMoment(
    mainFlightDateIso,
    mainFlightDepTime,
    getTimezoneForAirport(mainFlightDepAirport)
  );

  const mainFlightArrMoment = makeLocalMoment(
    daysLater
      ? moment(mainFlightDateIso)
          .add(daysLater, parseInt(daysLater) === 1 ? "day" : "days")
          .format("YYYY-MM-DD")
      : mainFlightDateIso,
    mainFlightArrTime,
    getTimezoneForAirport(mainFlightArrAirport)
  );

  if (firstSearch) {
    const [origAirport, destAirport] = airportRotation.split("-");

    let minHomeDepMoment: moment.MomentInput;
    let maxHomeArrMoment: moment.MomentInput;

    const dateIsoMoment = moment(dateIso);

    const fridayDateIso = dateIsoMoment
      .day(dateIsoMoment.day() >= 5 ? 5 : -2)
      .format("YYYY-MM-DD");

    const mondayDateIso = dateIsoMoment
      .day(dateIsoMoment.day() >= 2 ? 8 : 1)
      .format("YYYY-MM-DD");

    if (startWeekday === "Friday") {
      minHomeDepMoment = makeLocalMoment(
        fridayDateIso,
        "18:30",
        getTimezoneForAirport(homeAirport)
      );
    }

    if (endWeekday === "Monday") {
      maxHomeArrMoment = makeLocalMoment(
        mondayDateIso,
        "07:30",
        getTimezoneForAirport(homeAirport)
      );
    }

    const takeoffTimeElement = (
      await page.$$(".oKiy-mod-visible .iKtq-inner > div:nth-child(2)")
    )[0];

    const landingTimeElement = (
      await page.$$(".oKiy-mod-visible .iKtq-inner > div:nth-child(2)")
    )[1];

    let firstDepMoment: moment.Moment;
    let lastDepMoment: moment.Moment;

    let firstArrMoment: moment.Moment;
    let lastArrMoment: moment.Moment;

    if (takeoffTimeElement && landingTimeElement) {
      const takeoffRaw = (
        await takeoffTimeElement.evaluate((n) => n.textContent)
      ).trim();

      const landingRaw = (
        await landingTimeElement.evaluate((n) => n.textContent)
      ).trim();

      const firstTakeoffTime = takeoffRaw.substring(0, 9);
      const lastTakeoffTime = takeoffRaw.substring(12);

      const firstLandingTime = landingRaw.substring(0, 9);
      const lastLandingTime = landingRaw.substring(12);

      firstDepMoment = parseDayFrag(
        firstTakeoffTime,
        dateIso,
        getTimezoneForAirport(origAirport)
      );

      lastDepMoment = parseDayFrag(
        lastTakeoffTime,
        dateIso,
        getTimezoneForAirport(origAirport),
        firstDepMoment
      );

      firstArrMoment = parseDayFrag(
        firstLandingTime,
        dateIso,
        getTimezoneForAirport(destAirport)
      );

      lastArrMoment = parseDayFrag(
        lastLandingTime,
        dateIso,
        getTimezoneForAirport(destAirport),
        firstArrMoment
      );

      const nonSuitableDepartDates =
        firstDepMoment.isBefore(minHomeDepMoment) ||
        lastDepMoment.isBefore(minHomeDepMoment) ||
        firstArrMoment.isAfter(mainFlightDepMoment) ||
        lastArrMoment.isAfter(mainFlightDepMoment);

      const nonSuitableReturnDates =
        firstArrMoment.isAfter(maxHomeArrMoment) ||
        lastArrMoment.isAfter(maxHomeArrMoment) ||
        firstDepMoment.isBefore(mainFlightArrMoment) ||
        lastDepMoment.isBefore(mainFlightArrMoment);

      if (
        (flightType === "depart" && nonSuitableDepartDates) ||
        (flightType === "return" && nonSuitableReturnDates)
      ) {
        setErrorMessage("No suitable flight offers found.\n");
        return null;
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
      mainFlightDateIso,
      mainFlightDepAirport,
      mainFlightArrAirport,
      mainFlightDepTime,
      mainFlightArrTime,
      browser,
      adjacentFlightLinks,
      homeAirport
    );
  }

  let flightPrice: string = null;

  let adjacentFlightBaseDateIso: string = "";
  let adjacentFlightDateIso: string = "";

  let flightInfoArr: {
    flightTime: string;
    flightRoute: string;
    flightNumber: string;
    aircraft: string;
    departsNextDay: boolean;
  }[] = [];

  let marginMs: number;

  let connectAirport: string = "";

  for (const foundPricesButton of foundPricesButtons.slice(buttonsStartIndex)) {
    try {
      const innerText = await foundPricesButton.evaluate(
        (btn) => btn.textContent
      );

      let foundNonAircraftDeal = false;
      let airportCodes: string[] = [];

      if (innerText === "View Deal") continue;

      await foundPricesButton.evaluate((btn) => btn.click());
      await page.waitForNavigation();

      await delay(5000);

      const flightCard = await page.$(".E69K-leg-wrapper");

      const flightSegments = await flightCard.$$(".NxR6-segment");

      const rawAirports = (
        await flightCard.$eval(
          ".c2x94-title > span:nth-child(1)",
          (node) => node.textContent
        )
      ).trim();

      if (flightType === "depart") {
        connectAirport = rawAirports.split(" → ")[1];
      } else {
        connectAirport = rawAirports.split(" → ")[0];
      }

      const routeAndDateString = await flightCard.$eval(
        ".c2x94-title",
        (node) => node.textContent
      );

      const currentYear = new Date().getFullYear();

      let flightDate = routeAndDateString.substring(9);

      let baseDate = new Date(`${flightDate} ${currentYear}`);
      baseDate.setHours(12);

      if (baseDate.getTime() < new Date().getTime()) {
        baseDate = new Date(`${flightDate} ${currentYear + 1}`);
        baseDate.setHours(12);
      }

      adjacentFlightBaseDateIso = baseDate.toISOString().substring(0, 10);
      adjacentFlightDateIso = adjacentFlightBaseDateIso;

      const adjustDate = () => {
        const now = new Date();

        let date = new Date(`${flightDate} ${currentYear}`);
        date.setHours(12);

        if (date.getTime() < now.getTime()) {
          date = new Date(`${flightDate} ${currentYear + 1}`);
          date.setHours(12);
        }

        adjacentFlightDateIso = date.toISOString().substring(0, 10);
      };

      const dateChangeCheck = (
        dateWarningTexts: string[],
        stringToSearch: string
      ) => {
        if (
          dateWarningTexts.some((dateWarningText) =>
            dateWarningText.includes(stringToSearch)
          )
        ) {
          flightDate = dateWarningTexts[
            dateWarningTexts.findIndex((dateWarningText) =>
              dateWarningText.includes(stringToSearch)
            )
          ]
            .trim()
            .substring(8);
        }

        adjustDate();
      };

      for (const flightSegment of flightSegments) {
        let flightTime = (
          await flightSegment.$eval(".NxR6-time", (node) => node.textContent)
        ).substring(0, 13);

        let [departFlightTime, arriveFlightTime] = flightTime.split(" - ");

        const flightRoute = await flightSegment.$eval(
          ".NxR6-airport",
          (node) => node.textContent
        );

        airportCodes = flightRoute.match(/[A-Z]{3}/g);

        const dateWarnings = await flightSegment.$$(".NxR6-date-warning");
        let dateWarningTexts: string[] = [];

        if (dateWarnings.length > 0) {
          for (const dateWarning of dateWarnings) {
            dateWarningTexts.push(
              await dateWarning.evaluate((node) => node.textContent)
            );
          }
        }

        dateChangeCheck(dateWarningTexts, "Departs");

        const segmentDepartureDayMoment = makeLocalMoment(
          adjacentFlightDateIso,
          departFlightTime,
          getTimezoneForAirport(airportCodes[0])
        );

        dateChangeCheck(dateWarningTexts, "Arrives");

        let segmentArrivalDayMoment = makeLocalMoment(
          adjacentFlightDateIso,
          arriveFlightTime,
          getTimezoneForAirport(airportCodes[0])
        );

        while (!segmentArrivalDayMoment.isAfter(segmentDepartureDayMoment)) {
          segmentArrivalDayMoment = segmentArrivalDayMoment
            .clone()
            .add(1, "day");
        }

        const segmentDepartureDayMidnight = segmentDepartureDayMoment
          .clone()
          .startOf("day");

        const segmentArrivalDayMidnight = segmentArrivalDayMoment
          .clone()
          .startOf("day");

        const segmentDaysDiff = segmentArrivalDayMidnight.diff(
          segmentDepartureDayMidnight,
          "days"
        );

        if (
          segmentDaysDiff >= 1 &&
          (!dateWarningTexts.some((dateWarningText) =>
            dateWarningText.includes("Departs")
          ) ||
            dateWarningTexts.some(
              (dateWarningText) =>
                dateWarningText.includes("Departs") &&
                dateWarningTexts.some((dateWarningText) =>
                  dateWarningText.includes("Arrives")
                )
            ))
        ) {
          arriveFlightTime += `+${segmentDaysDiff}`;
        }

        flightTime = [departFlightTime, arriveFlightTime].join(" - ");

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
          departsNextDay: dateWarningTexts.some((dateWarningText) =>
            dateWarningText.includes("Departs")
          )
            ? true
            : false,
        });
      }

      if (foundNonAircraftDeal) {
        flightInfoArr.length = 0;
        await page.goBack();

        await delay(5000);
        continue;
      }

      const firstLegFlightSegment = flightSegments[0];
      const lastLegFlightSegment = flightSegments[flightSegments.length - 1];

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

      if (flightType === "depart") {
        const adjArr = makeLocalMoment(
          adjacentFlightDateIso,
          lastLegFlightSegmentArrivalTime,
          getTimezoneForAirport(mainFlightDepAirport)
        );

        const minMs =
          (connectAirport === mainFlightDepAirport ? 2 : 5) * 60 * 60 * 1000;

        marginMs = mainFlightDepMoment.diff(adjArr);

        if (marginMs < minMs) {
          flightInfoArr.length = 0;
          await page.goBack();

          await delay(5000);
          continue;
        }

        const priceDisplay = await page.$(".jnTP-display-price");

        if (priceDisplay !== null && priceDisplay !== undefined) {
          flightPrice = await priceDisplay.evaluate((node) => node.textContent);
          break;
        }
      } else {
        const adjDep = makeLocalMoment(
          adjacentFlightBaseDateIso,
          firstLegFlightSegmentDepartureTime,
          getTimezoneForAirport(mainFlightArrAirport)
        );

        const minMs =
          (connectAirport === mainFlightArrAirport ? 2 : 5) * 60 * 60 * 1000;

        marginMs = adjDep.diff(mainFlightArrMoment);

        if (marginMs < minMs) {
          flightInfoArr.length = 0;
          await page.goBack();

          await delay(5000);
          continue;
        }

        const priceDisplay = await page.$(".jnTP-display-price");

        if (priceDisplay !== null && priceDisplay !== undefined) {
          flightPrice = await priceDisplay.evaluate((node) => node.textContent);
          break;
        }
      }

      flightInfoArr.length = 0;
      await page.goBack();

      await delay(5000);
    } catch (error) {
      console.log("\nAn error occurred.", error);
    }
  }

  if (flightPrice !== null) {
    console.log(
      "Found a suitable price for one of the adjacent flight combinations.\n"
    );
    return {
      flightPrice,
      adjacentFlightBaseDateIso,
      mainFlightTime: mainFlightDepTime,
      flightInfoArr,
      marginMs,
      flightType,
      connectAirport,
      homeAirport,
    };
  } else {
    buttonsStartIndex = foundPricesButtons.length;
    flightInfoArr.length = 0;
    console.log("No prices have been found for the desired plane so far.");
    console.log("Trying to fetch more prices...\n");

    const showMoreButton = await page.$(".show-more-button");

    if (showMoreButton === null) {
      setErrorMessage("No more prices available.\n");
      return null;
    } else {
      await showMoreButton.click();
      await page.waitForNavigation();

      return await obtainPriceForAdjacentFlight(
        browser,
        page,
        mainFlightDateIso,
        mainFlightDepAirport,
        mainFlightArrAirport,
        dateIso,
        mainFlightDepTime,
        mainFlightArrTime,
        flightType,
        false,
        airportRotation,
        adjacentFlightLinks,
        homeAirport,
        startIndex,
        buttonsStartIndex
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
    flightNumber: string;
    aircraft: string;
  },
  depAirport: string,
  arrAirport: string
): MainFlightPrice {
  return {
    date,
    price: parseFloat(price.replace(/\D/g, "")),
    url,
    flightInfo,
    depAirport,
    arrAirport,
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
    departsNextDay: boolean;
  }[],
  flightType: "depart" | "return",
  marginMs: number,
  connectAirport: string,
  homeAirport: string
): AdjacentFlightPrice {
  return {
    date,
    price: parseFloat(price.replace(/\D/g, "")),
    url,
    flightInfo,
    flightType,
    marginMs,
    connectAirport,
    homeAirport,
  };
}

async function acceptCookies(page: Page) {
  try {
    await delay(3500);
    await page.click("div.P4zO-submit-buttons > button:nth-child(1)");
    console.log("Accepted all cookies.\n");
  } catch {
    console.log("Cookies already accepted.\n");
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

function generateMainFlightTable(item: MainFlightPrice) {
  return `
        <h1>Main flight:</h1>
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
          </tbody>
        </table>
    `;
}

function generateAdjacentFlightTables(
  items: {
    homeAirport: string;
    adjacentPrices: AdjacentFlightPrice[];
  }[]
) {
  return items
    .map(
      (item) => `
        <h1>${item.homeAirport} flights:</h1>
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
          ${item.adjacentPrices
            .map((adjacentPrice) => {
              const adjacentDate = new Date(adjacentPrice.date);

              return `<tr>
                <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${adjacentDate.toLocaleDateString(
                  "sr"
                )}</td>
                <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">
                  ${adjacentPrice.flightInfo
                    .map(
                      (flightInfo) =>
                        `<p>${
                          flightInfo.departsNextDay
                            ? `<span>Departs on ${(() => {
                                adjacentDate.setDate(
                                  adjacentDate.getDate() + 1
                                );

                                return adjacentDate.toLocaleDateString("sr");
                              })()}</span><br><br>`
                            : ""
                        }<span>${flightInfo.flightNumber}</span><br>
                      <span>${flightInfo.flightTime}</span><br>
                      <span>${flightInfo.flightRoute}</span><br>
                      <span>${flightInfo.aircraft}</span></p>`
                    )
                    .join("")}
                </td>
                <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${
                  adjacentPrice.price
                }</td>
                <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">
                    <a href="${adjacentPrice.url}" target="_blank">${
                adjacentPrice.url
              }</a>
                </td>
              </tr>`;
            })
            .join("")}
          </tbody>
        </table>
        <br><br>
    `
    )
    .join("");
}

async function sendCheapestPriceCombinationEmail(
  mainPrice: MainFlightPrice,
  adjacentPrices: {
    homeAirport: string;
    adjacentPrices: AdjacentFlightPrice[];
  }[],
  totalPrice: number
) {
  console.log(
    "Here's the cheapest flight combination found for this main rotation. Sending it to you mail right away!\n"
  );

  await sendMail(
    "milosjeknic@hotmail.rs",
    `Cheapest price combination found: ${totalPrice}€`,
    `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
          </head>
          <body>
              <p>Hey there! This is the cheapest flights combination I was able to find for the main rotation. Check it out.</p>
              <h2>Price Overview</h2>
              ${generateMainFlightTable(mainPrice)}
              ${generateAdjacentFlightTables(adjacentPrices)}
              <p>Total price (€): ${totalPrice}</p>
          </body>
        </html>`
  );
}

main();
