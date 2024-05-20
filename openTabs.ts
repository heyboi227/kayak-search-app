import { Browser, Page } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { userAgents } from "./userAgents";
import { delay, launchBrowser, openPage } from "./prepareBrowser";
import { loadData } from "./helpers";

async function main() {
  try {
    const airportRotations: string[] = await loadData("rotations.json");

    type CheapestFlightPrices = { date: string; price: number; url: string };

    let cheapestFlightPrices: CheapestFlightPrices[] = [];

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
      "DME",
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
      "IEV",
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
      "KBP",
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
      "NJC",
      "NJF",
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
      "OSF",
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
      "SVO",
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
      "VKO",
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
      "ZIA",
      "ZIS",
      "ZIX",
      "ZKP",
      "ZLG",
      "ZZO",
    ];

    const aircraftModel = "787";

    const saturday = new Date("2024-05-18");
    let saturdayIso = saturday.toISOString().substring(0, 10);

    let urlsToOpen: string[] = [];

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
      urlsToOpen.length = 0;

      try {
        const filteredAirportCodes = airportRotations.filter(
          (airportCode) => !restrictedAirportCodes.includes(airportCode)
        );

        for (let i = 0; i < filteredAirportCodes.length; i += 2) {
          const slicedCodes = filteredAirportCodes.slice(i, i + 3);

          if (slicedCodes.length === 0) break;

          const codesString = slicedCodes.join("-");
          const link = generateLink(codesString, aircraftModel);
          urlsToOpen.push(link);
        }
      } catch (error) {
        console.error("There has been an error.", error);
      }
    }

    function generateLink(originAndDestination: string, aircraftModel: string) {
      return `https://www.kayak.ie/flights/${originAndDestination}/${saturdayIso}-flexible-1day?sort=price_a&fs=eqmodel=~${aircraftModel};stops=~0`;
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

        await addCheapestPrice(browser, cheapestFlightPrices, true);

        await browser.close();
        browser = await launchBrowser(false);

        const newPage = await openPage(
          browser,
          page.url(),
          userAgents[Math.floor(Math.random() * userAgents.length)].useragent
        );

        await delay(3500);
        await acceptCookies(newPage);

        await notifyCaptchaNeeded();
        await waitForCaptchaSolution(newPage);

        await browser.close();
        await openTabs(urlsToOpen, urlIndex);
      }
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
          console.log(
            "Second selector also failed. No price found. Moving on..."
          );
        }
      }

      return cheapestFlightPrice;
    }

    async function addCheapestPrice(
      browser: Browser,
      priceArray: CheapestFlightPrices[],
      interruptedByCaptcha: boolean
    ) {
      try {
        const pages = await browser.pages();

        for (const [index, page] of pages.entries()) {
          if (pages.length <= 2) {
            break;
          }
          if (
            shouldInterruptByCaptcha(interruptedByCaptcha, index, pages.length)
          ) {
            continue;
          }

          const cheapestFlightPrice = await getCheapestFlightPrice(page);
          if (
            cheapestFlightPrice !== null &&
            cheapestFlightPrice !== undefined
          ) {
            const cheapestFlightPriceObj = createPriceObject(
              cheapestFlightPrice,
              page.url()
            );
            priceArray.push(cheapestFlightPriceObj);
          }
        }

        console.log("\nAdded cheapest price.");
      } catch (error) {
        console.error("There has been an error.", error);
      }
    }

    function shouldInterruptByCaptcha(
      interruptedByCaptcha: boolean,
      index: number,
      length: number
    ): boolean {
      return (
        interruptedByCaptcha &&
        (index === 0 || index === length - 1) &&
        length > 2
      );
    }

    function createPriceObject(price: string, url: string) {
      return {
        date: saturdayIso,
        price: parseFloat(price.substring(1).replace(/,/g, "")),
        url: url,
      };
    }

    async function openTabs(
      urls: string[],
      startIndex: number = 0
    ): Promise<void> {
      console.log("Starting batch processing of URLs.\n");

      const batchSize = 10;
      const browser = await launchBrowser(true);

      for (let i = startIndex; i < urls.length; i += batchSize) {
        const batchEndIndex = i + batchSize;
        const currentBatch = urls.slice(i, batchEndIndex);

        console.log(`Processing batch from index ${i} to ${batchEndIndex - 1}`);
        await processBatch(browser, currentBatch, i);

        if (batchEndIndex >= urls.length) {
          await browser.close();
          updateDateAndRestart();
        }
      }
    }

    async function processBatch(
      browser: Browser,
      currentBatch: string[],
      batchStartIndex: number
    ) {
      console.log("Browser launched for current batch.\n");

      for (const [batchIndex, url] of currentBatch.entries()) {
        const globalIndex = batchStartIndex + batchIndex;
        await processUrl(browser, url, globalIndex, batchIndex);
      }

      console.log("Opened the whole batch. Obtaining prices...");

      await reloadPages(browser);
      await addCheapestPrice(browser, cheapestFlightPrices, false);
      await closePages(browser);

      console.log("Closing the current batch.");
      await delay(Math.floor(Math.random() * 30000 + 60000));
    }

    async function processUrl(
      browser: Browser,
      url: string,
      globalIndex: number,
      batchIndex: number
    ) {
      console.log(
        `Processing URL at batch index ${batchIndex} (global index ${globalIndex}): ${url}`
      );
      if (batchIndex !== 0)
        await delay(Math.floor(Math.random() * 7500 + 7500));

      try {
        const page = await openPage(
          browser,
          url,
          userAgents[Math.floor(Math.random() * userAgents.length)].useragent
        );
        console.log(`Opened URL at: ${url}.`);

        if (batchIndex === 0) await acceptCookies(page);
        if (
          (await page.$eval("html", (page) => page.innerHTML)).includes(
            "expired"
          )
        )
          await page.reload();
        await simulateMouseMovement(page);
        await handleCaptcha(browser, page, globalIndex);
      } catch (error) {
        console.error(`Error processing URL ${url}:`, error);
      }
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

    async function reloadPages(browser: Browser) {
      for (const [index, page] of (await browser.pages()).entries()) {
        if (index > 0) {
          await delay(Math.floor(Math.random() * 5000 + 5000));
          await page.reload();
        }
      }
      await delay(Math.floor(Math.random() * 15000 + 45000));
    }

    async function closePages(browser: Browser) {
      for (const [index, page] of (await browser.pages()).entries()) {
        if (index > 0) {
          await delay(Math.floor(Math.random() * 2000 + 1000));
          await page.close();
        }
      }
    }

    function updateDateAndRestart() {
      saturday.setDate(saturday.getDate() + 7);
      saturdayIso = saturday.toISOString().substring(0, 10);
      prepareUrls().then(() => openTabs(urlsToOpen));
    }

    await prepareUrls().then(() => openTabs(urlsToOpen));
  } catch (error) {
    console.error("An error occured in the main function.", error);
  }
}

main();
