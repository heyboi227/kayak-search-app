import { Browser, Page } from "puppeteer-core";
import prepareCodes from "./codesHelper";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { userAgents } from "./userAgents";
import { launchBrowser, openPage } from "./prepareBrowser";

async function main() {
  const { airportCodes, airportCities } = await prepareCodes();

  const saturday = new Date("2024-05-11");
  let saturdayIso = saturday.toISOString().substring(0, 10);

  let openAirports: boolean = true;
  let openCities: boolean = false;

  let stillOpenAirports: boolean = false;
  let stillOpenCities: boolean = false;

  let urlsToOpen: string[] = [];

  let firstCodeIndexPerLoop: number = 0;

  type CheapestFlightPrices = { price: number; url: string };

  let cheapestFlightPrices: CheapestFlightPrices[] = [];

  let urlIncludedSiteCaptcha: boolean = false;

  function delay(time: number) {
    return new Promise(function (resolve) {
      setTimeout(resolve, time);
    });
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

  async function prepareUrls() {
    try {
      if (openAirports) {
        await processAirports();
      } else {
        await processCities();
      }
    } catch (error) {
      console.error("There has been an error.", error);
    }
  }

  async function processAirports() {
    urlsToOpen.length = 0;

    let count: number = 0;

    stillOpenAirports = true;

    for (
      let i = firstCodeIndexPerLoop;
      i < airportCodes.length && count < 15;
      i += 3
    ) {
      const slicedCodes = airportCodes.slice(i, i + 3);

      if (slicedCodes.length === 0) break;

      const codesString = slicedCodes.join(",");
      const link = generateLink(codesString, "A350", true);
      urlsToOpen.push(link);

      count++;

      firstCodeIndexPerLoop = i + 3;
    }

    if (count < 15) {
      firstCodeIndexPerLoop = 0;
      stillOpenAirports = false;
    }
  }

  async function processCities() {
    urlsToOpen.length = 0;

    let count: number = 0;

    stillOpenCities = true;

    for (
      let i = firstCodeIndexPerLoop;
      i < airportCities.length && count < 15;
      i++
    ) {
      const link = generateLink(airportCities[i], "A350", false);
      urlsToOpen.push(link);

      count++;
    }

    firstCodeIndexPerLoop += 15;

    if (count < 15) {
      firstCodeIndexPerLoop = 0;
      stillOpenCities = false;
    }
  }

  function findCheapPricesByPercentile(
    data: number[],
    percentile: number
  ): number[] {
    const sortedPrices = [...data].sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sortedPrices.length);
    const cutoff = sortedPrices[index];
    return data.filter((price) => price <= cutoff);
  }

  function findObjectsWithCheapFlightPrices(
    cheapestFlightPrices: CheapestFlightPrices[]
  ): CheapestFlightPrices[] {
    if (cheapestFlightPrices.length === 0) return undefined;

    const cheapestPrices = findCheapPricesByPercentile(
      cheapestFlightPrices.map(
        (cheapestFlightPrice) => cheapestFlightPrice.price
      ),
      10
    );

    return cheapestFlightPrices.filter((cheapestFlightPrice) =>
      cheapestPrices.includes(cheapestFlightPrice.price)
    );
  }

  function generateLink(
    destination: string,
    aircraftModel: string,
    areSameAirports: boolean
  ) {
    const sameAirportsParam = areSameAirports ? "sameair=sameair;" : "";
    return `https://www.kayak.ie/flights/BEG-${destination}/${saturdayIso}-flexible-1day/${saturdayIso}-flexible-1day?sort=price_a&fs=eqmodel=~${aircraftModel};${sameAirportsParam}virtualinterline=-virtualinterline;baditin=baditin;triplength=-1`;
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

  async function handleCaptcha(browser: Browser, page: Page) {
    const url = page.url();

    async function isCaptchaPage() {
      return url.includes("security/check") || url.includes("sitecaptcha");
    }

    if (await isCaptchaPage()) {
      if (url.includes("sitecaptcha")) urlIncludedSiteCaptcha = true;
      await notifyCaptchaNeeded();
      await waitForCaptchaSolution(page);

      const firstSecurityCheckCodeForNextCycle: string = url.substring(57, 60);

      if (url.includes("security/check")) {
        firstCodeIndexPerLoop =
          airportCodes.indexOf(firstSecurityCheckCodeForNextCycle) === -1
            ? airportCities.indexOf(firstSecurityCheckCodeForNextCycle)
            : airportCodes.indexOf(firstSecurityCheckCodeForNextCycle);
        await browser.close();
        beginAutomatization();
      }
    }
  }

  async function addCheapestPrices(browser: Browser) {
    async function getCheapestFlightPrice(page: Page) {
      let cheapestFlightPrice: string = null;

      try {
        cheapestFlightPrice = await page.$eval(
          "#listWrapper > div > div.Hv20 > div:nth-child(1) > div > div.Hv20-value > div > span:nth-child(1)",
          (el) => el.innerHTML
        );
      } catch (error) {
        console.log("First selector failed, trying second selector...");
        try {
          cheapestFlightPrice = await page.$eval(
            "div > div.Hv20-option.Hv20-mod-state-active > div > div.Hv20-value > div > span:nth-child(1)",
            (el) => el.innerHTML
          );
        } catch (secondError) {
          console.log(
            "Second selector also failed. No price found. Moving on..."
          );
        }
      }

      return cheapestFlightPrice;
    }

    for (const page of await browser.pages()) {
      try {
        const cheapestFlightPrice = await getCheapestFlightPrice(page);

        if (cheapestFlightPrice === null || cheapestFlightPrice === undefined)
          continue;

        const cheapestFlightPriceObj = {
          price: parseFloat(cheapestFlightPrice.substring(1).replace(/,/g, "")),
          url: page.url(),
        };

        cheapestFlightPrices.push(cheapestFlightPriceObj);
      } catch (error) {
        console.error("There has been an error.", error);
      }
    }
  }

  async function processPages(
    browser: Browser,
    urls: string[],
    randomUserAgents: typeof userAgents
  ) {
    let index: number = 0;

    for (const url of urls) {
      if (index !== 0) await delay(Math.random() * 5000 + 2000);
      let page = await openPage(
        browser,
        url,
        randomUserAgents[Math.floor(Math.random() * randomUserAgents.length)]
          .useragent
      );
      console.log(`Page opened at: ${url}`);

      if (index === 0) {
        const pages = await browser.pages();
        if (pages.length > 0) await pages[0].close();
        await delay(3000);
        await page.mouse.click(500, 470);
        console.log("Accepted all cookies, unfortunately.\n");
      }

      await handleCaptcha(browser, page);

      index++;
    }
  }

  async function reloadExpiredResultsPages(browser: Browser) {
    const pages = await browser.pages();
    for (const page of pages) {
      if ((await page.$eval("html", (el) => el.innerHTML)).includes("expired"))
        await page.reload({ timeout: 0 });
    }
  }

  function generateTableRows(data: CheapestFlightPrices[]) {
    return data
      .map(
        (item) => `
      <tr>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${item.price}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">
              <a href="${item.url}" target="_blank">${item.url}</a>
          </td>
      </tr>
  `
      )
      .join("");
  }

  async function openTabsInEdge(urls: string[]): Promise<void> {
    try {
      console.log("Here we go!\n");
      const browser = await launchBrowser(false);

      console.log("Opening URLs. Please wait...\n");

      await processPages(browser, urls, userAgents);

      console.log("Opened all URLs. Now doing some magic...");

      if (urlIncludedSiteCaptcha) await reloadExpiredResultsPages(browser);
      await delay(Math.floor(Math.random() * 15000 + 45000));

      await addCheapestPrices(browser);
      const cheapestPricesUnderThePercentile =
        findObjectsWithCheapFlightPrices(cheapestFlightPrices);

      if (!stillOpenAirports && !stillOpenCities) {
        openAirports = !openAirports;
        openCities = !openCities;
      }

      if (!stillOpenAirports && !stillOpenCities && openAirports) {
        console.log(
          "I have sent you some flight prices via mail. Thank me later."
        );

        await sendMail(
          "milosjeknic@hotmail.rs",
          `Cheapest prices for ${new Date(saturdayIso).toLocaleDateString(
            "sr"
          )}`,
          `<!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8">
            </head>
            <body>
                <p>Hey there! Here are some of the prices I could find:</p>
                <h2>Price Overview</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f2f2f2;">
                            <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Price (€)</th>
                            <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Link</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Data rows will go here -->
                        ${generateTableRows(cheapestPricesUnderThePercentile)}
                    </tbody>
                </table>
            </body>
          </html>`
        );

        cheapestFlightPrices.length = 0;
        saturday.setDate(saturday.getDate() + 7);
        saturdayIso = saturday.toISOString().substring(0, 10);
      }

      await browser.close();
      beginAutomatization();
    } catch (error) {
      console.error("Failed to open tabs:", error);
    }
  }

  function beginAutomatization() {
    urlIncludedSiteCaptcha = false;
    prepareUrls();
    openTabsInEdge(urlsToOpen);
  }

  beginAutomatization();
}

main();
