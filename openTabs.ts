import { Browser, Page } from "puppeteer-core";
import prepareCodes from "./codesHelper";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { userAgents } from "./userAgents";
import { launchBrowser, openPage } from "./prepareBrowser";

async function main() {
  const { airportCodes, airportCities, aircraftCode } = await prepareCodes([
    "B788",
    "B789",
    "B78X",
  ]);

  const restrictedAirportCodes: string[] = [
    "AAO",
    "AAQ",
    "AAY",
    "ABA",
    "ABD",
    "ACP",
    "ACS",
    "ACZ",
    "ADE",
    "ADH",
    "ADU",
    "AEE",
    "AER",
    "AEU",
    "AFZ",
    "AGV",
    "AIG",
    "AJK",
    "AKF",
    "AKY",
    "ALP",
    "AMV",
    "ARH",
    "ARL",
    "ASB",
    "ASF",
    "AVI",
    "AWZ",
    "AXK",
    "AZD",
    "BAX",
    "BBO",
    "BBT",
    "BBY",
    "BCA",
    "BCF",
    "BCQ",
    "BDH",
    "BEM",
    "BEN",
    "BEY",
    "BGF",
    "BGN",
    "BGU",
    "BGW",
    "BHN",
    "BIV",
    "BJB",
    "BKA",
    "BKN",
    "BKO",
    "BLA",
    "BMF",
    "BMO",
    "BND",
    "BNR",
    "BNS",
    "BOP",
    "BOY",
    "BOZ",
    "BQG",
    "BQJ",
    "BQS",
    "BQT",
    "BRM",
    "BSM",
    "BSN",
    "BSR",
    "BSX",
    "BTG",
    "BTK",
    "BUK",
    "BUO",
    "BUZ",
    "BWO",
    "BWW",
    "BXR",
    "BXX",
    "BYD",
    "BYM",
    "BZK",
    "CAJ",
    "CAP",
    "CBL",
    "CBS",
    "CCC",
    "CCS",
    "CEE",
    "CEK",
    "CER",
    "CFG",
    "CKH",
    "CKT",
    "CLZ",
    "CMW",
    "CQD",
    "CRF",
    "CRZ",
    "CSH",
    "CSY",
    "CUM",
    "CUP",
    "CUV",
    "CXA",
    "CYA",
    "CYO",
    "CYX",
    "CZE",
    "DAM",
    "DEE",
    "DEF",
    "DEZ",
    "DGU",
    "DIP",
    "DKS",
    "DOR",
    "DPT",
    "DSO",
    "DYR",
    "EAB",
    "EBL",
    "EGO",
    "EIE",
    "EIK",
    "EKS",
    "EOR",
    "EOZ",
    "ERA",
    "ERG",
    "ESL",
    "ETM",
    "EUN",
    "EYA",
    "EYK",
    "EYL",
    "EZV",
    "FAZ",
    "FNG",
    "FNJ",
    "GAO",
    "GAQ",
    "GAW",
    "GBT",
    "GCH",
    "GDA",
    "GDI",
    "GDO",
    "GDX",
    "GDZ",
    "GER",
    "GHT",
    "GME",
    "GNA",
    "GOJ",
    "GRV",
    "GSM",
    "GSV",
    "GUD",
    "GUI",
    "GUQ",
    "GWA",
    "GXF",
    "GYG",
    "GZW",
    "HAV",
    "HDM",
    "HDR",
    "HEH",
    "HFA",
    "HGA",
    "HGE",
    "HIN",
    "HMA",
    "HOD",
    "HOG",
    "HOX",
    "HTA",
    "HTG",
    "HUQ",
    "IAA",
    "IAR",
    "ICA",
    "ICC",
    "IFH",
    "IFN",
    "IGT",
    "IHN",
    "IHR",
    "IIL",
    "IJK",
    "IKA",
    "IKS",
    "IKT",
    "IMO",
    "IMQ",
    "INA",
    "IRM",
    "IRO",
    "ISU",
    "ITU",
    "IWA",
    "JAK",
    "JAR",
    "JEE",
    "JOK",
    "JSK",
    "JUB",
    "JWN",
    "JYR",
    "KAC",
    "KAM",
    "KAV",
    "KAW",
    "KCK",
    "KDY",
    "KEA",
    "KEJ",
    "KER",
    "KET",
    "KGD",
    "KGP",
    "KHA",
    "KHC",
    "KHD",
    "KHK",
    "KHM",
    "KHV",
    "KHY",
    "KIH",
    "KIK",
    "KJA",
    "KKS",
    "KLF",
    "KLM",
    "KMV",
    "KMW",
    "KNR",
    "KNZ",
    "KOL",
    "KPW",
    "KRO",
    "KRR",
    "KRW",
    "KSH",
    "KSS",
    "KSZ",
    "KTV",
    "KTX",
    "KUF",
    "KVK",
    "KVM",
    "KVX",
    "KXK",
    "KYE",
    "KYP",
    "KYS",
    "KYT",
    "KYZ",
    "KZN",
    "LAQ",
    "LCL",
    "LDG",
    "LED",
    "LFM",
    "LFR",
    "LGN",
    "LIW",
    "LMQ",
    "LNX",
    "LPK",
    "LRR",
    "LRV",
    "LSH",
    "LSP",
    "LTD",
    "LTK",
    "LVP",
    "MAK",
    "MAR",
    "MCX",
    "MDL",
    "MGK",
    "MGU",
    "MGZ",
    "MHD",
    "MHP",
    "MJI",
    "MJZ",
    "MKI",
    "MMK",
    "MNU",
    "MOA",
    "MOE",
    "MOG",
    "MQF",
    "MQJ",
    "MRA",
    "MRD",
    "MRV",
    "MRX",
    "MSQ",
    "MUN",
    "MVQ",
    "MWQ",
    "MYC",
    "MYN",
    "MYP",
    "MYT",
    "MZI",
    "MZO",
    "N0M",
    "NAL",
    "NBC",
    "NDL",
    "NEF",
    "NER",
    "NFG",
    "NGK",
    "NIX",
    "NLI",
    "NMS",
    "NMT",
    "NNM",
    "NOJ",
    "NOZ",
    "NRM",
    "NSH",
    "NSK",
    "NUX",
    "NVR",
    "NYA",
    "NYM",
    "NYR",
    "NYT",
    "NYU",
    "NYW",
    "NJC",
    "NJF",
    "ODA",
    "ODJ",
    "ODO",
    "OEL",
    "OGZ",
    "OHH",
    "OHO",
    "OKT",
    "OLZ",
    "OMH",
    "OMI",
    "OMS",
    "ONK",
    "OSM",
    "OSW",
    "OUA",
    "OUG",
    "OVB",
    "OVS",
    "PAA",
    "PAP",
    "PAU",
    "PAX",
    "PBL",
    "PBU",
    "PDZ",
    "PEE",
    "PES",
    "PEX",
    "PEZ",
    "PFQ",
    "PGU",
    "PKC",
    "PKK",
    "PKV",
    "PMV",
    "PPH",
    "PPU",
    "PPZ",
    "PRU",
    "PTM",
    "PUP",
    "PVS",
    "PWE",
    "PYH",
    "PYJ",
    "PYK",
    "PZO",
    "QSN",
    "QUB",
    "RAS",
    "RAT",
    "RBX",
    "REN",
    "RFA",
    "RGK",
    "RGN",
    "RGO",
    "RIY",
    "RJN",
    "ROV",
    "RTW",
    "RUD",
    "RVH",
    "RVI",
    "RXA",
    "RYB",
    "RZN",
    "RZR",
    "SAH",
    "SBB",
    "SBT",
    "SCI",
    "SCT",
    "SCU",
    "SCW",
    "SDG",
    "SEB",
    "SEK",
    "SFD",
    "SGC",
    "SIP",
    "SKX",
    "SLY",
    "SMW",
    "SNF",
    "SNU",
    "SNV",
    "SNW",
    "SNX",
    "SOM",
    "SQZ",
    "SRX",
    "SRY",
    "STB",
    "STD",
    "STW",
    "SUK",
    "SUR",
    "SVX",
    "SVZ",
    "SWT",
    "SWV",
    "SXI",
    "SYE",
    "SYJ",
    "SYS",
    "SYZ",
    "SZJ",
    "TAI",
    "TAZ",
    "TBW",
    "TBZ",
    "TCX",
    "TEG",
    "TGK",
    "TGP",
    "THL",
    "THR",
    "THX",
    "TIO",
    "TIP",
    "TJM",
    "TLK",
    "TLV",
    "TMO",
    "TMQ",
    "TND",
    "TOB",
    "TOF",
    "TOM",
    "TQL",
    "TUQ",
    "TUV",
    "TVY",
    "TYD",
    "UCT",
    "UEN",
    "UFA",
    "UIK",
    "UJU",
    "UKG",
    "UKR",
    "UKS",
    "UKX",
    "ULK",
    "ULV",
    "ULY",
    "UMA",
    "UMS",
    "UPB",
    "URJ",
    "URM",
    "URS",
    "USK",
    "USR",
    "USS",
    "UUA",
    "UUD",
    "UUS",
    "VBA",
    "VBC",
    "VCR",
    "VDP",
    "VGD",
    "VHV",
    "VIG",
    "VIL",
    "VKT",
    "VLI",
    "VLN",
    "VLU",
    "VLV",
    "VOG",
    "VOZ",
    "VRA",
    "VRI",
    "VTB",
    "VTU",
    "VUS",
    "VVO",
    "VYI",
    "WAX",
    "WOS",
    "WUU",
    "XAR",
    "XBG",
    "XBJ",
    "XBO",
    "XDE",
    "XDJ",
    "XGA",
    "XGG",
    "XKA",
    "XKY",
    "XLU",
    "XNH",
    "XNU",
    "XPA",
    "XSE",
    "XYE",
    "XZA",
    "YEH",
    "YES",
    "YJS",
    "YKS",
    "ZAH",
    "ZBR",
    "ZIS",
    "ZIX",
    "ZKP",
    "ZLG",
    "ZZO",
  ];

  const restrictedAirportCities = ["MOW", "IEV"];

  const originAirportsAndCities: string[] = ["BEG", "KVO", "TSR"];

  const saturday = new Date("2024-05-18");
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

    const filteredAirportCodes = airportCodes.filter(
      (airportCode) =>
        !originAirportsAndCities.includes(airportCode) &&
        !restrictedAirportCodes.includes(airportCode)
    );

    for (
      let i = firstCodeIndexPerLoop;
      i < filteredAirportCodes.length && count < 15;
      i += 3
    ) {
      const slicedCodes = filteredAirportCodes.slice(i, i + 3);

      if (slicedCodes.length === 0) break;

      const codesString = slicedCodes.join(",");
      const link = generateLink(codesString, aircraftCode, true);
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

    const filteredAirportCities = airportCities.filter(
      (airportCity) =>
        !originAirportsAndCities.includes(airportCity) &&
        !restrictedAirportCities.includes(airportCity)
    );

    for (
      let i = firstCodeIndexPerLoop;
      i < filteredAirportCities.length && count < 15;
      i++
    ) {
      const link = generateLink(filteredAirportCities[i], aircraftCode, false);
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
    return `https://www.kayak.ie/flights/${originAirportsAndCities.join()}-${destination}/${saturdayIso}-flexible-1day/${saturdayIso}-flexible-1day?sort=price_a&fs=eqmodel=~${aircraftModel};${sameAirportsParam}virtualinterline=-virtualinterline;baditin=baditin;triplength=-1`;
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
        await delay(2000);
        await page.click("div.P4zO-submit-buttons > button:nth-child(1)");
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
                        ${generateTableRows(
                          cheapestPricesUnderThePercentile.sort(
                            (a, b) => a.price - b.price
                          )
                        )}
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
