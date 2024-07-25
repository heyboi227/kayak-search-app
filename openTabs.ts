import { Page, Browser } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { launchBrowser, openPage } from "./prepareBrowser";
import { delay, getRandomUserAgent, loadData } from "./helpers";
import { restrictedAirports } from "./restrictedAirports";

type CheapestFlightPrice = { date: string; price: number; url: string };
type FlightDate = {
  departureDate: string;
  midpointDate: string;
  returnDate: string;
};

let cheapestFlightPrices: CheapestFlightPrice[] = [];
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
  urlsToOpen: { url: string; airportRotation: string }[]
) {
  let browser: Browser;
  if (browser) {
    await browser.close();
  }

  browser = await launchBrowser(true);

  for (const { url } of urlsToOpen) {
    const page = await openPage(browser, url, getRandomUserAgent());
    console.log(`Opened URL at: ${url}.`);

    await delay(500);
    await acceptCookies(page);
    await delay(Math.floor(Math.random() * 15000 + 45000));

    const cheapestFlightPrice = await getCheapestFlightPrice(page);
    if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
      const cheapestFlightPriceFoundUrl = page.url();

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
  aircraftModel: string
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

  for (const url of urlsToOpenForCombinations) {
    const page = await openPage(browser, url, getRandomUserAgent());
    console.log(`Opened URL at: ${url}.`);

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
  await sendCheapestPricesEmail(cheapestFlightPrices);
  cheapestFlightPrices.length = 0;

  await browser.close();
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
  if (cheapestFlightPrices.length > 0) {
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
  } else {
    console.log(
      "Uh-oh! There doesn't seem to be a single flight available for this date combination. Moving on..."
    );

    await sendMail(
      "milosjeknic@hotmail.rs",
      "Aw! No cheapest prices found.",
      `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
          </head>
          <body>
              <p>Unfortunately, i wasn't able to find any prices for ${saturdayIso}. Please try some other date.</p>
          </body>
        </html>`
    );
  }
}

main();
