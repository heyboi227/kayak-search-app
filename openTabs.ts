import { Browser, ElementHandle, Page } from "puppeteer-core";
import * as nodemailer from "nodemailer";
import { MailConfigurationParameters } from "./config.mail";
import { userAgents } from "./userAgents";
import { delay, launchBrowser, openPage } from "./prepareBrowser";

async function main() {
  let airportAndCityCodes: Set<string> = new Set<string>();

  type CheapestFlightPrices = { date: string; price: number; url: string };

  let cheapestFlightPrices: CheapestFlightPrices[] = [];

  async function retrievePricesForAircraftTypes(aircraftTypes: string[]) {
    console.log("Let's grab these flights, shall we?");
    console.log("Pray that the FlightRadar24 developers will not catch us.");
    console.log(
      "This is going to be a long one, so you'd better make some popcorn and go watch your favorite movie. Or two. Or get some good sleep, whatever pleases you."
    );

    for (const aircraftType of aircraftTypes) {
      const browser = await launchBrowser(true);

      const pages = await browser.pages();
      if (pages.length > 1) await pages[0].close();

      await obtainCodes(browser, aircraftType);
      await sendPricesEmail(cheapestFlightPrices);

      await browser.close();
    }

    console.log(
      `Succesfully added ${airportAndCityCodes.size} airports. Let's go!`
    );

    // updateDateAndRestart(aircraftTypes);
  }

  function updateDateAndRestart(aircraftTypes: string[]) {
    saturday.setDate(saturday.getDate() + 7);
    saturdayIso = saturday.toISOString().substring(0, 10);
    retrievePricesForAircraftTypes(aircraftTypes);
  }

  function saveCurrentState(index: number) {
    return {
      index,
    };
  }

  async function acceptCookiesAfterVerification(page: Page) {
    try {
      await page.click("#onetrust-accept-btn-handler");
      console.log("Accepted all cookies, unfortunately.");
      await delay(1500);
    } catch {}
  }

  async function processLinks(
    browser: Browser,
    links: { aircraftReg: string; link: string }[],
    aircraftType: string,
    startIndex: number = 0
  ) {
    let index = startIndex;

    for (const link of links.slice(
      startIndex > 0 ? ++startIndex : startIndex
    )) {
      console.log(`Opening data for ${link.aircraftReg}.`);
      const detailPage = await openPage(
        browser,
        link.link,
        getRandomUserAgent()
      );

      await delay(Math.floor(Math.random() * 2000 + 1000));

      if (
        (await detailPage.$eval("html", (page) => page.innerHTML)).includes(
          "Verifying"
        )
      ) {
        let savedState = saveCurrentState(index);

        await delay(Math.floor(Math.random() * 10000 + 15000));

        acceptCookiesAfterVerification(detailPage);

        await browser.close();
        await delay(Math.floor(Math.random() * 5000 + 10000));
        browser = await launchBrowser(true);

        await processLinks(browser, links, aircraftType, savedState.index);
      } else {
        await delay(1500);
        acceptCookiesAfterVerification(detailPage);
      }

      index++;

      try {
        const airportCodes = await extractAirportCodes(
          browser,
          detailPage,
          aircraftType
        );
        for (let i = 0; i < airportCodes.length; i += 2) {
          await processAirportCode(
            browser,
            `https://www.kayak.ie/flights/${airportCodes[i]}-${
              airportCodes[i + 1]
            }/${saturdayIso}-flexible-1day?sort=price_a&fs=eqmodel=~787;stops=~0`,
            airportCodes[i]
          );
        }
      } catch (error) {
        console.error("Error processing link", link, error);
      } finally {
        await detailPage.close();
      }
    }
  }

  async function checkIfAirportsShouldBeAdded(
    browser: Browser,
    url: string,
    aircraftType: string
  ): Promise<boolean> {
    await delay(Math.floor(Math.random() * 2000 + 3000));
    const page = await openPage(browser, url, getRandomUserAgent());

    const detailTable = await page.$("#tbl-datatable");
    if (!detailTable) return;

    const detailRows = await detailTable.$$("tbody > tr");
    const aircraftOperatingTheFlight: string[] = [];

    for (const detailRow of detailRows) {
      const aircraftTypeCell = await detailRow.$("td:nth-child(6)");
      const aircraftType = (await getCellText(aircraftTypeCell)).trim();
      const aircraftTypeIata = aircraftType.slice(0, 4);

      aircraftOperatingTheFlight.push(aircraftTypeIata);
    }

    await page.close();
    await delay(Math.floor(Math.random() * 1000 + 2000));

    if (
      aircraftOperatingTheFlight.filter((aircraft) =>
        aircraftType.includes(aircraft)
      ).length /
        aircraftOperatingTheFlight.length >=
      0.5
    ) {
      return true;
    } else {
      return false;
    }
  }

  async function extractAirportCodes(
    browser: Browser,
    page: Page,
    aircraftType: string
  ) {
    console.log("Obtaining flight prices. Please wait...");
    const processedRotations = new Set<string>();

    const detailTable = await page.$("#tbl-datatable");
    if (!detailTable) return [];

    const detailRows = await detailTable.$$("tbody > tr");
    const airportCodes: string[] = [];

    for (const detailRow of detailRows) {
      const cells:
        | []
        | [
            ElementHandle<HTMLTableCellElement>,
            ElementHandle<HTMLTableCellElement>,
            ElementHandle<HTMLAnchorElement>
          ] = await Promise.all([
        detailRow.$("td:nth-child(4)"),
        detailRow.$("td:nth-child(5)"),
        detailRow.$("td:nth-child(6) > a"),
      ]).catch(() => []);
      const [originCell, destinationCell, flightLinkCell] = cells;

      try {
        if (originCell && destinationCell && flightLinkCell) {
          const originCode = (await getCellText(originCell))
            .trim()
            .slice(-4, -1);
          const destinationCode = (await getCellText(destinationCell))
            .trim()
            .slice(-4, -1);
          const flightLink = await getCellLink(flightLinkCell);

          const shouldAddAirports = await checkIfAirportsShouldBeAdded(
            browser,
            flightLink,
            aircraftType
          );

          if (shouldAddAirports) {
            const forwardRotation = `${originCode}-${destinationCode}`;
            const returnRotation = `${destinationCode}-${originCode}`;

            if (
              !processedRotations.has(forwardRotation) &&
              !processedRotations.has(returnRotation)
            ) {
              airportCodes.push(originCode);
              airportCodes.push(destinationCode);

              airportCodes.push(destinationCode);
              airportCodes.push(originCode);

              processedRotations.add(forwardRotation);
              processedRotations.add(returnRotation);
            }
          }
        }
      } catch (error) {
        console.error("Error processing link", error);
      }
    }

    return airportCodes;
  }

  async function processAirportCode(
    browser: Browser,
    url: string,
    code: string
  ) {
    await openTab(browser, url);
    if (!airportAndCityCodes.has(code)) {
      console.log(`Airport code ${code} added to table.`);
    }
    airportAndCityCodes.add(code);
  }

  async function getCellLink(cell: ElementHandle<HTMLAnchorElement>) {
    return await cell.evaluate((cell) => cell.href.trim());
  }

  async function getCellText(cell: ElementHandle) {
    return await cell.evaluate((cell) => cell.textContent.trim());
  }

  function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)].useragent;
  }

  let cookiesAccepted: boolean = false;

  async function obtainCodes(browser: Browser, aircraftType: string) {
    cookiesAccepted = false;

    try {
      const page = await openPage(
        browser,
        `https://www.flightradar24.com/data/aircraft/${aircraftType}`,
        getRandomUserAgent()
      );

      console.log(`Opened page at ${page.url()}`);

      if (!cookiesAccepted) {
        await page.click("#onetrust-accept-btn-handler");
        console.log("Accepted all cookies, unfortunately.");
        cookiesAccepted = true;
      }

      const table = await page.$("#cnt-list-aircraft > table");
      if (!table) {
        console.error("Table not found");
        return;
      }

      const rows = await table.$$("tbody > tr");
      const links: { aircraftReg: string; link: string }[] = [];

      for (const row of rows) {
        const linkElement = await row.$("td:nth-child(2) > a");
        if (linkElement) {
          const link = (await linkElement.evaluate((a) => a.href)).trim();
          const aircraftReg = (
            await linkElement.evaluate((a) => a.textContent)
          ).trim();
          const linkObj = { aircraftReg, link };
          links.push(linkObj);
        }
      }

      console.log(`Found ${links.length} aircraft to process.`);

      await processLinks(browser, links, aircraftType);
      if (cheapestFlightPrices.length > 0)
        await sendPricesEmail(cheapestFlightPrices);
    } catch (error) {
      console.error("An error occurred in obtainCodes:", error);
    }
  }

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

  const restrictedAirportCities = ["MOW", "IEV", "THR"];

  const saturday = new Date("2024-05-18");
  let saturdayIso = saturday.toISOString().substring(0, 10);

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

  async function handleCaptcha(browser: Browser, page: Page) {
    if (await isCaptchaPage(page.url())) {
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
      await openTab(browser, page.url());
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
        if (
          shouldInterruptByCaptcha(interruptedByCaptcha, index, pages.length)
        ) {
          continue;
        } else if (
          shouldInterruptByCaptcha(interruptedByCaptcha, index, pages.length) &&
          pages.length <= 2
        ) {
          break;
        }

        const cheapestFlightPrice = await getCheapestFlightPrice(page);
        if (cheapestFlightPrice !== null && cheapestFlightPrice !== undefined) {
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

  function generateTableRows(items: CheapestFlightPrices[]) {
    return `
      <tr>
          ${items.map(
            (
              item
            ) => `<td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${new Date(
              item.date
            ).toLocaleDateString("sr")}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${
            item.price
          }</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">
              <a href="${item.url}" target="_blank">${item.url}</a>
          </td>`
          )}
      </tr>
  `;
  }

  async function openTab(browser: Browser, url: string): Promise<void> {
    console.log(`Opening URL tab at: ${url}\n`);

    await processUrl(browser, url);
  }

  async function processUrl(browser: Browser, url: string) {
    console.log(`Processing URL: ${url}`);
    try {
      const page = await openPage(
        browser,
        url,
        userAgents[Math.floor(Math.random() * userAgents.length)].useragent
      );
      console.log(`Opened URL at: ${url}.`);

      await acceptCookies(page);
      if (
        (await page.$eval("html", (page) => page.textContent)).includes(
          "search results"
        )
      )
        await page.reload();
      await simulateMouseMovement(page);
      await handleCaptcha(browser, page);

      await delay(Math.floor(Math.random() * 15000 + 45000));
      await addCheapestPrice(browser, cheapestFlightPrices, false);

      await page.close();
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

  async function sendPricesEmail(cheapestPrices: CheapestFlightPrices[]) {
    console.log(
      "New cheapest price found! Sending it to your mail right away."
    );

    await sendMail(
      "milosjeknic@hotmail.rs",
      `Hooray! New cheapest price found.`,
      `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
          </head>
          <body>
              <p>Hey there! This is the cheapest price that I've managed to find so far. Check it out.</p>
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

  await retrievePricesForAircraftTypes(["B788", "B789", "B78X"]);
}

main();
