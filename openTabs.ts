import { Page, Browser } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { launchBrowser, openPage } from "./prepareBrowser";
import { delay, loadData } from "./helpers";
import { restrictedAirports } from "./restrictedAirports";
import UserAgent from "user-agents";

type CheapestFlightPrice = { date: string; price: number; url: string };
type FlightDate = {
  departureDate: string;
  midpointDate: string;
  returnDate: string;
};

let cheapestFlightPrices: CheapestFlightPrice[] = [];
let cheapestFlightPriceFoundUrl: string = "";
const aircraftModel = "787";

const saturday = new Date("2024-08-17");
let saturdayIso = saturday.toISOString().substring(0, 10);

async function main() {
  try {
    const airportRotations: string[] = await loadData("rotations.json");

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
      await lookForSingleFlights(urlsToOpen);

      saturday.setDate(saturday.getDate() + 7);
      saturdayIso = saturday.toISOString().substring(0, 10);
      await prepareUrls(
        airportRotations,
        restrictedAirportCodes,
        aircraftModel,
        saturdayIso,
        urlsToOpen
      );

      await lookForSingleFlights(urlsToOpen);
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

  for (const airportRotation of filteredAirportRotations) {
    const linkAndAirportRotationObj = {
      url: `https://www.kayak.ie/flights/${airportRotation}/${saturdayIso}-flexible-1day?fs=eqmodel=~${aircraftModel};stops=~0&sort=price_a`,
      airportRotation: airportRotation,
    };
    urlsToOpen.push(linkAndAirportRotationObj);
  }
}

async function lookForSingleFlights(
  urlsToOpen: { url: string; airportRotation: string }[],
  startIndex: number = 0
) {
  const browser = await launchBrowser(true);

  for (const url of urlsToOpen.slice(startIndex)) {
    const page = await openPage(browser, url.url, new UserAgent().toString());
    console.log(`Opened URL at: ${url.url}.`);

    await handleCaptcha(browser, page, urlsToOpen, urlsToOpen.indexOf(url));

    const cookies = await page.cookies();
    await page.setCookie(...cookies);

    await delay(500);
    await acceptCookies(page);
    await delay(Math.floor(Math.random() * 15000 + 45000));

    if (
      (await page.$eval("html", (page) => page.innerHTML)).includes("expired")
    ) {
      await page.reload();
    }
    await simulateMouseMovement(page);

    const cheapestFlightPrice = await getCheapestFlightPrice(page);
    if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
      cheapestFlightPriceFoundUrl = url.url;

      await processDateCombinations(
        cheapestFlightPriceFoundUrl,
        saturdayIso,
        aircraftModel
      );

      await page.close();
    } else {
      await page.close();
    }
  }
}

async function processDateCombinations(
  singleFlightCheapestPriceUrl: string,
  saturdayIso: string,
  aircraftModel: string,
  startIndex: number = 0
) {
  const browser = await launchBrowser(true);
  const dateCombinations = generateDateCombinations(saturdayIso);
  let urlsToOpenForCombinations: string[] = [];

  for (const dateCombination of dateCombinations) {
    const airportRotation = singleFlightCheapestPriceUrl
      .split("/flights/")[1]
      .split("/")[0];
    const midpoints = airportRotation.split("-");
    const firstMidpoint = midpoints[0];
    const secondMidpoint = midpoints[1];

    const url = `https://www.kayak.ie/flights/BEG,TSR,KVO-${firstMidpoint}/${dateCombination.departureDate}/${airportRotation}/${dateCombination.midpointDate}/${secondMidpoint}-BEG,TSR,KVO/${dateCombination.returnDate}?fs=baditin=baditin;virtualinterline=-virtualinterline;eqmodel=~${aircraftModel}&sort=price_a`;
    urlsToOpenForCombinations.push(url);
  }

  for (const url of urlsToOpenForCombinations.slice(startIndex)) {
    const page = await openPage(browser, url, new UserAgent().toString());
    console.log(`Opened URL at: ${url}.`);

    await handleDateCombinationsCaptcha(
      browser,
      page,
      urlsToOpenForCombinations.indexOf(url)
    );

    const cookies = await page.cookies();
    await page.setCookie(...cookies);

    await delay(500);
    await acceptCookies(page);
    await delay(Math.floor(Math.random() * 15000 + 45000));

    if (
      (await page.$eval("html", (page) => page.innerHTML)).includes("expired")
    ) {
      await page.reload();
    }
    await simulateMouseMovement(page);

    const cheapestFlightPrice = await getCheapestFlightPrice(page);
    if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
      const priceObj = createPriceObject(cheapestFlightPrice, url);
      cheapestFlightPrices.push(priceObj);
    }

    await page.close();
  }

  cheapestFlightPrices.sort((a, b) => a.price - b.price);
  if (cheapestFlightPrices.length > 0) {
    await sendCheapestPricesEmail(cheapestFlightPrices);
    cheapestFlightPrices.length = 0;
  }

  await browser.close();
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
  urlIndex: number
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
      new UserAgent().toString()
    );

    await delay(3500);
    await acceptCookies(newPage);

    await notifyCaptchaNeeded();
    await waitForCaptchaSolution(newPage);

    await browser.close();
    await lookForSingleFlights(urlsToOpen, urlIndex);
  }
}

async function handleDateCombinationsCaptcha(
  browser: Browser,
  page: Page,
  urlIndex: number
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
      new UserAgent().toString()
    );

    await delay(3500);
    await acceptCookies(newPage);

    await notifyCaptchaNeeded();
    await waitForCaptchaSolution(newPage);

    await browser.close();
    await processDateCombinations(
      cheapestFlightPriceFoundUrl,
      saturdayIso,
      aircraftModel,
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

async function getCheapestFlightPrice(page: Page) {
  let cheapestFlightPrice: string = null;

  try {
    cheapestFlightPrice = await page.$eval(
      "div.Hv20 > div:nth-child(1) > div > div.Hv20-value > div > span:nth-child(1)",
      (el) => el.innerHTML
    );
  } catch (error) {
    console.log("First selector failed, trying second selector...");
    try {
      cheapestFlightPrice = await page.$eval(
        "div.Hv20-option.Hv20-mod-state-active > div > div.Hv20-value > div > span:nth-child(1)",
        (el) => el.innerHTML
      );
    } catch (secondError) {
      console.log("Second selector also failed. No price found. Moving on...");
    }
  }

  return cheapestFlightPrice;
}

function createPriceObject(price: string, url: string): CheapestFlightPrice {
  return {
    date: saturdayIso,
    price: parseFloat(price.substring(1).replace(/,/g, "")),
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
