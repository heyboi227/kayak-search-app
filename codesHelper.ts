import { saveData } from "./helpers";
import { delay, launchBrowser, openPage } from "./prepareBrowser";
import { Browser, ElementHandle, Page } from "puppeteer-core";
import { userAgents } from "./userAgents";

async function obtainRotations() {
  const airportRotations: string[] = [];

  async function retrieveRotationsForAircraftTypes(aircraftTypes: string[]) {
    console.log("Let's grab these rotations, shall we?");
    console.log("Pray that the FlightRadar24 developers will not catch us.");
    console.log(
      "This is going to be a long one, so you'd better make some popcorn and go watch your favorite movie."
    );

    for (const aircraftType of aircraftTypes) {
      const browser = await launchBrowser(true);

      const pages = await browser.pages();
      if (pages.length > 1) await pages[0].close();

      await obtainRotations(browser, aircraftType);

      await browser.close();
    }

    console.log(`Succesfully added the airports. Let's go!`);
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
      }

      index++;

      try {
        await extractAirportRotations(browser, detailPage, aircraftType);
      } catch (error) {
        console.error("Error processing link", link, error);
      } finally {
        await detailPage.close();
        console.log(`Processed ${link.aircraftReg}.`);
      }
    }
  }

  async function checkIfAirportsShouldBeAdded(
    browser: Browser,
    url: string,
    aircraftTypeICAO: string
  ): Promise<boolean> {
    const page = await openPage(browser, url, getRandomUserAgent());

    const detailTable = await page.$("#tbl-datatable");
    if (!detailTable) return;

    const detailRows = await detailTable.$$("tbody > tr");
    const aircraftOperating: string[] = [];

    const aircraftMappings: { ICAO: string; IATA: string }[] = [
      { ICAO: "A124", IATA: "A4F" },
      { ICAO: "A140", IATA: "A40" },
      { ICAO: "A148", IATA: "A81" },
      { ICAO: "A158", IATA: "A58" },
      { ICAO: "A19N", IATA: "31N" },
      { ICAO: "A20N", IATA: "32N" },
      { ICAO: "A21N", IATA: "32Q" },
      { ICAO: "A225", IATA: "A5F" },
      { ICAO: "A306", IATA: "AB6" },
      { ICAO: "A306", IATA: "ABY" },
      { ICAO: "A30B", IATA: "AB4" },
      { ICAO: "A310", IATA: "312" },
      { ICAO: "A310", IATA: "313" },
      { ICAO: "A318", IATA: "318" },
      { ICAO: "A318", IATA: "32C" },
      { ICAO: "A319", IATA: "319" },
      { ICAO: "A319", IATA: "32D" },
      { ICAO: "A320", IATA: "320" },
      { ICAO: "A320", IATA: "32A" },
      { ICAO: "A321", IATA: "321" },
      { ICAO: "A321", IATA: "32B" },
      { ICAO: "A332", IATA: "332" },
      { ICAO: "A333", IATA: "333" },
      { ICAO: "A332", IATA: "33X" },
      { ICAO: "A333", IATA: "33Y" },
      { ICAO: "A337", IATA: "[to be determined]" },
      { ICAO: "A338", IATA: "338" },
      { ICAO: "A339", IATA: "339" },
      { ICAO: "A342", IATA: "342" },
      { ICAO: "A343", IATA: "343" },
      { ICAO: "A345", IATA: "345" },
      { ICAO: "A346", IATA: "346" },
      { ICAO: "A359", IATA: "359" },
      { ICAO: "A35K", IATA: "351" },
      { ICAO: "A388", IATA: "388" },
      { ICAO: "A3ST", IATA: "ABB" },
      { ICAO: "A400", IATA: "—" },
      { ICAO: "A748", IATA: "HS7" },
      { ICAO: "AC68", IATA: "ACP" },
      { ICAO: "AC90", IATA: "ACT" },
      { ICAO: "AJ27", IATA: "C27" },
      { ICAO: "AN12", IATA: "ANF" },
      { ICAO: "AN24", IATA: "AN4" },
      { ICAO: "AN26", IATA: "A26" },
      { ICAO: "AN28", IATA: "A28" },
      { ICAO: "AN30", IATA: "A30" },
      { ICAO: "AN32", IATA: "A32" },
      { ICAO: "AN72", IATA: "AN7" },
      { ICAO: "AS32", IATA: "APH" },
      { ICAO: "AS50", IATA: "NDE" },
      { ICAO: "AT43", IATA: "AT4" },
      { ICAO: "AT45", IATA: "AT5" },
      { ICAO: "AT46", IATA: "ATR" },
      { ICAO: "AT72", IATA: "AT7" },
      { ICAO: "AT73", IATA: "ATR" },
      { ICAO: "AT75", IATA: "ATR" },
      { ICAO: "AT76", IATA: "ATR" },
      { ICAO: "ATP", IATA: "ATP" },
      { ICAO: "B06", IATA: "—" },
      { ICAO: "B06T", IATA: "—" },
      { ICAO: "B105", IATA: "MBH" },
      { ICAO: "B190", IATA: "BEH" },
      { ICAO: "B212", IATA: "BH2" },
      { ICAO: "B37M", IATA: "7M7" },
      { ICAO: "B38M", IATA: "7M8" },
      { ICAO: "B39M", IATA: "7M9" },
      { ICAO: "B3XM", IATA: "7MJ" },
      { ICAO: "B412", IATA: "BH2" },
      { ICAO: "B429", IATA: "BH2" },
      { ICAO: "B461", IATA: "141" },
      { ICAO: "B462", IATA: "142" },
      { ICAO: "B463", IATA: "143" },
      { ICAO: "B52", IATA: "—" },
      { ICAO: "B703", IATA: "703" },
      { ICAO: "B712", IATA: "717" },
      { ICAO: "B720", IATA: "B72" },
      { ICAO: "B721", IATA: "721" },
      { ICAO: "B722", IATA: "722" },
      { ICAO: "B732", IATA: "732" },
      { ICAO: "B732", IATA: "73F" },
      { ICAO: "B733", IATA: "733" },
      { ICAO: "B733", IATA: "73C" },
      { ICAO: "B733", IATA: "73Y" },
      { ICAO: "B734", IATA: "734" },
      { ICAO: "B734", IATA: "73P" },
      { ICAO: "B735", IATA: "735" },
      { ICAO: "B735", IATA: "73E" },
      { ICAO: "B736", IATA: "736" },
      { ICAO: "B738", IATA: "738" },
      { ICAO: "B739", IATA: "739" },
      { ICAO: "B737", IATA: "73G" },
      { ICAO: "B737", IATA: "73W" },
      { ICAO: "B738", IATA: "73H" },
      { ICAO: "B738", IATA: "73K" },
      { ICAO: "B738", IATA: "73U" },
      { ICAO: "B739", IATA: "73J" },
      { ICAO: "B741", IATA: "741" },
      { ICAO: "B741", IATA: "74T" },
      { ICAO: "B742", IATA: "742" },
      { ICAO: "B742", IATA: "74C" },
      { ICAO: "B742", IATA: "74X" },
      { ICAO: "B743", IATA: "743" },
      { ICAO: "B743", IATA: "74D" },
      { ICAO: "B744", IATA: "744" },
      { ICAO: "B744", IATA: "74E" },
      { ICAO: "B744", IATA: "74Y" },
      { ICAO: "B748", IATA: "74H" },
      { ICAO: "B748", IATA: "74N" },
      { ICAO: "B74R", IATA: "74R" },
      { ICAO: "B74R", IATA: "74V" },
      { ICAO: "B74S", IATA: "74L" },
      { ICAO: "B752", IATA: "752" },
      { ICAO: "B752", IATA: "75F" },
      { ICAO: "B753", IATA: "753" },
      { ICAO: "B762", IATA: "762" },
      { ICAO: "B762", IATA: "76X" },
      { ICAO: "B763", IATA: "763" },
      { ICAO: "B763", IATA: "76W" },
      { ICAO: "B763", IATA: "76Y" },
      { ICAO: "B764", IATA: "764" },
      { ICAO: "B772", IATA: "772" },
      { ICAO: "B773", IATA: "773" },
      { ICAO: "B778", IATA: "778" },
      { ICAO: "B779", IATA: "779" },
      { ICAO: "B77L", IATA: "77X" },
      { ICAO: "B77L", IATA: "77L" },
      { ICAO: "B77W", IATA: "77W" },
      { ICAO: "B788", IATA: "788" },
      { ICAO: "B789", IATA: "789" },
      { ICAO: "B78X", IATA: "781" },
      { ICAO: "BA11", IATA: "B11" },
      { ICAO: "BCS1", IATA: "221" },
      { ICAO: "BCS3", IATA: "223" },
      { ICAO: "BE20", IATA: "—" },
      { ICAO: "BE40", IATA: "—" },
      { ICAO: "BE55", IATA: "—" },
      { ICAO: "BE58", IATA: "—" },
      { ICAO: "BE76", IATA: "—" },
      { ICAO: "BE99", IATA: "—" },
      { ICAO: "BELF", IATA: "SHB" },
      { ICAO: "BER2", IATA: "—" },
      { ICAO: "BLCF", IATA: "74B" },
      { ICAO: "BN2P", IATA: "BNI" },
      { ICAO: "C130", IATA: "LOH" },
      { ICAO: "C208", IATA: "CN1" },
      { ICAO: "C212", IATA: "CS2" },
      { ICAO: "C25A", IATA: "CNJ" },
      { ICAO: "C25B", IATA: "CNJ" },
      { ICAO: "C25C", IATA: "CNJ" },
      { ICAO: "C30J", IATA: "LOH" },
      { ICAO: "C310", IATA: "—" },
      { ICAO: "C46", IATA: "CWC" },
      { ICAO: "C5M", IATA: "N/A" },
      { ICAO: "C500", IATA: "CNJ" },
      { ICAO: "C510", IATA: "CNJ" },
      { ICAO: "C525", IATA: "CNJ" },
      { ICAO: "C550", IATA: "CNJ" },
      { ICAO: "C560", IATA: "CNJ" },
      { ICAO: "C56X", IATA: "CNJ" },
      { ICAO: "C650", IATA: "CNJ" },
      { ICAO: "C680", IATA: "CNJ" },
      { ICAO: "C700", IATA: "CNJ" },
      { ICAO: "C750", IATA: "CNJ" },
      { ICAO: "C919", IATA: "919" },
      { ICAO: "CL2T", IATA: "—" },
      { ICAO: "CL30", IATA: "—" },
      { ICAO: "CL60", IATA: "CCJ" },
      { ICAO: "CN35", IATA: "CS5" },
      { ICAO: "CONI", IATA: "L49" },
      { ICAO: "CRJ1", IATA: "CR1" },
      { ICAO: "CRJ2", IATA: "CR2" },
      { ICAO: "CRJ7", IATA: "CR7" },
      { ICAO: "CRJ9", IATA: "CR9" },
      { ICAO: "CRJX", IATA: "CRK" },
      { ICAO: "CVLP", IATA: "CV4" },
      { ICAO: "CVLT", IATA: "CV5" },
      { ICAO: "D228", IATA: "D28" },
      { ICAO: "D328", IATA: "D38" },
      { ICAO: "DA42", IATA: "—" },
      { ICAO: "DA62", IATA: "—" },
      { ICAO: "DC10", IATA: "D11" },
      { ICAO: "DC10", IATA: "D1C" },
      { ICAO: "DC10", IATA: "D1M" },
      { ICAO: "DC10", IATA: "D1X" },
      { ICAO: "DC10", IATA: "D1Y" },
      { ICAO: "DC3", IATA: "D3F" },
      { ICAO: "DC6", IATA: "D6F" },
      { ICAO: "DC85", IATA: "D8T" },
      { ICAO: "DC86", IATA: "D8L" },
      { ICAO: "DC87", IATA: "D8Q" },
      { ICAO: "DC91", IATA: "D91" },
      { ICAO: "DC92", IATA: "D92" },
      { ICAO: "DC93", IATA: "D93" },
      { ICAO: "DC94", IATA: "D94" },
      { ICAO: "DC95", IATA: "D95" },
      { ICAO: "DH2T", IATA: "DHR" },
      { ICAO: "DH8A", IATA: "DH1" },
      { ICAO: "DH8B", IATA: "DH2" },
      { ICAO: "DH8C", IATA: "DH3" },
      { ICAO: "DH8D", IATA: "DH4" },
      { ICAO: "DHC4", IATA: "DHC" },
      { ICAO: "DHC5", IATA: "DHC" },
      { ICAO: "DHC6", IATA: "DHT" },
      { ICAO: "DHC7", IATA: "DH7" },
      { ICAO: "DOVE", IATA: "DHD" },
      { ICAO: "E110", IATA: "EMB" },
      { ICAO: "E120", IATA: "EM2" },
      { ICAO: "E135", IATA: "ER3" },
      { ICAO: "E135", IATA: "ERD" },
      { ICAO: "E145", IATA: "ER4" },
      { ICAO: "E170", IATA: "E70" },
      { ICAO: "E190", IATA: "E90" },
      { ICAO: "E195", IATA: "E95" },
      { ICAO: "E290", IATA: "290" },
      { ICAO: "E295", IATA: "295" },
      { ICAO: "E35L", IATA: "ER3" },
      { ICAO: "E50P", IATA: "EP1" },
      { ICAO: "E545", IATA: "—" },
      { ICAO: "E550", IATA: "—" },
      { ICAO: "E55P", IATA: "EP3" },
      { ICAO: "E75L", IATA: "E7W" },
      { ICAO: "E75S", IATA: "E75" },
      { ICAO: "EA50", IATA: "—" },
      { ICAO: "EC20", IATA: "—" },
      { ICAO: "EC25", IATA: "—" },
      { ICAO: "EC30", IATA: "—" },
      { ICAO: "EC35", IATA: "—" },
      { ICAO: "EC45", IATA: "—" },
      { ICAO: "EC55", IATA: "—" },
      { ICAO: "EC75", IATA: "—" },
      { ICAO: "EXPL", IATA: "MD9" },
      { ICAO: "F100", IATA: "100" },
      { ICAO: "F27", IATA: "F27" },
      { ICAO: "F28", IATA: "F21" },
      { ICAO: "F2TH", IATA: "D20" },
      { ICAO: "F406", IATA: "CNT" },
      { ICAO: "F50", IATA: "F50" },
      { ICAO: "F70", IATA: "F70" },
      { ICAO: "F900", IATA: "DF9" },
      { ICAO: "FA50", IATA: "DF3" },
      { ICAO: "FA7X", IATA: "DF7" },
      { ICAO: "G159", IATA: "GRS" },
      { ICAO: "G21", IATA: "GRG" },
      { ICAO: "G280", IATA: "GR3" },
      { ICAO: "G73T", IATA: "GRM" },
      { ICAO: "GL5T", IATA: "CCX" },
      { ICAO: "GLEX", IATA: "CCX" },
      { ICAO: "GLF4", IATA: "GJ4" },
      { ICAO: "GLF5", IATA: "GJ5" },
      { ICAO: "GLF6", IATA: "GJ6" },
      { ICAO: "H25B", IATA: "H25" },
      { ICAO: "H25C", IATA: "H25" },
      { ICAO: "HDJT", IATA: "HHJ" },
      { ICAO: "HERN", IATA: "DHH" },
      { ICAO: "I114", IATA: "I14" },
      { ICAO: "IL18", IATA: "IL8" },
      { ICAO: "IL62", IATA: "IL6" },
      { ICAO: "IL76", IATA: "IL7" },
      { ICAO: "IL86", IATA: "ILW" },
      { ICAO: "IL96", IATA: "I93" },
      { ICAO: "J328", IATA: "FRJ" },
      { ICAO: "JS31", IATA: "J31" },
      { ICAO: "JS32", IATA: "J32" },
      { ICAO: "JS41", IATA: "J41" },
      { ICAO: "JU52", IATA: "JU5" },
      { ICAO: "K35R", IATA: "K35" },
      { ICAO: "L101", IATA: "L10" },
      { ICAO: "L188", IATA: "LOE" },
      { ICAO: "L410", IATA: "L4T" },
      { ICAO: "LJ35", IATA: "LRJ" },
      { ICAO: "LJ60", IATA: "LRJ" },
      { ICAO: "MD11", IATA: "M11" },
      { ICAO: "MD11", IATA: "M1F" },
      { ICAO: "MD11", IATA: "M1M" },
      { ICAO: "MD81", IATA: "M81" },
      { ICAO: "MD82", IATA: "M82" },
      { ICAO: "MD83", IATA: "M83" },
      { ICAO: "MD87", IATA: "M87" },
      { ICAO: "MD88", IATA: "M88" },
      { ICAO: "MD90", IATA: "M90" },
      { ICAO: "MI24", IATA: "—" },
      { ICAO: "MI8", IATA: "MIH" },
      { ICAO: "MU2", IATA: "MU2" },
      { ICAO: "N262", IATA: "ND2" },
      { ICAO: "NOMA", IATA: "CD2" },
      { ICAO: "P06T", IATA: "—" },
      { ICAO: "P8", IATA: "—" },
      { ICAO: "P180", IATA: "P18" },
      { ICAO: "P212", IATA: "T12" },
      { ICAO: "P68", IATA: "PN6" },
      { ICAO: "PA31", IATA: "PA2" },
      { ICAO: "PA34", IATA: "—" },
      { ICAO: "PA44", IATA: "—" },
      { ICAO: "PC12", IATA: "PL2" },
      { ICAO: "PC6T", IATA: "PL6" },
      { ICAO: "PC24", IATA: "PL4" },
      { ICAO: "RJ1H", IATA: "AR1" },
      { ICAO: "RJ70", IATA: "AR7" },
      { ICAO: "RJ85", IATA: "AR8" },
      { ICAO: "S58T", IATA: "S58" },
      { ICAO: "S601", IATA: "NDC" },
      { ICAO: "S61", IATA: "S61" },
      { ICAO: "S65C", IATA: "NDH" },
      { ICAO: "S76", IATA: "S76" },
      { ICAO: "S92", IATA: "S92" },
      { ICAO: "SB20", IATA: "S20" },
      { ICAO: "SC7", IATA: "SHS" },
      { ICAO: "SF34", IATA: "SF3" },
      { ICAO: "SF50", IATA: "—" },
      { ICAO: "SH33", IATA: "SH3" },
      { ICAO: "SH36", IATA: "SH6" },
      { ICAO: "SU95", IATA: "SU9" },
      { ICAO: "SW4", IATA: "SW4" },
      { ICAO: "T134", IATA: "TU3" },
      { ICAO: "T154", IATA: "TU5" },
      { ICAO: "T204", IATA: "T20" },
      { ICAO: "TBM7", IATA: "—" },
      { ICAO: "TBM8", IATA: "—" },
      { ICAO: "TBM9", IATA: "—" },
      { ICAO: "TBM9", IATA: "—" },
      { ICAO: "TBM9", IATA: "—" },
      { ICAO: "TBM9", IATA: "—" },
      { ICAO: "TBM9", IATA: "—" },
      { ICAO: "TRIS", IATA: "BNT" },
      { ICAO: "WW24", IATA: "WWP" },
      { ICAO: "Y12", IATA: "YN2" },
      { ICAO: "YK40", IATA: "YK4" },
      { ICAO: "YK42", IATA: "YK2" },
      { ICAO: "YS11", IATA: "YS1" },
    ];

    for (const detailRow of detailRows) {
      const aircraftTypeCell = await detailRow.$("td:nth-child(6)");
      const aircraftType = (await getCellText(aircraftTypeCell)).trim();

      let aircraftTypeNormalized = aircraftType;
      for (const mapping of aircraftMappings) {
        if (
          aircraftType.includes(mapping.IATA) ||
          aircraftType.includes(mapping.ICAO)
        ) {
          aircraftTypeNormalized = mapping.ICAO;
          break;
        }
      }

      aircraftOperating.push(aircraftTypeNormalized);
    }

    await page.close();
    await delay(Math.floor(Math.random() * 1000 + 2000));

    const count = aircraftOperating.filter(
      (aircraft) => aircraft === aircraftTypeICAO
    ).length;

    const percentage = (count / aircraftOperating.length) * 100;

    if (percentage >= 50) {
      return true;
    } else {
      return false;
    }
  }

  async function extractAirportRotations(
    browser: Browser,
    page: Page,
    aircraftType: string
  ) {
    const processedRotations = new Set<string>();

    const detailTable = await page.$("#tbl-datatable");
    if (!detailTable) return;

    const detailRows = await detailTable.$$("tbody > tr");

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
          const originCellText = (await getCellText(originCell)).trim();
          const destinationCellText = (
            await getCellText(destinationCell)
          ).trim();
          if (originCellText !== "" && destinationCellText !== "") {
            const originCode = originCellText.slice(-4, -1);
            const destinationCode = destinationCellText.slice(-4, -1);
            const flightLink = await getCellLink(flightLinkCell);

            const shouldAddAirports = await checkIfAirportsShouldBeAdded(
              browser,
              flightLink,
              aircraftType
            );

            if (shouldAddAirports) {
              const rotation = `${originCode}-${destinationCode}`;

              if (!processedRotations.has(rotation)) {
                airportRotations.push(rotation);
                processedRotations.add(rotation);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error processing link", error);
      }
    }
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

  async function obtainRotations(browser: Browser, aircraftType: string) {
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
      console.log(`Obtaining the aircraft's rotations. Please wait...`);

      await processLinks(browser, links, aircraftType);
      await saveData(airportRotations, "rotations.json");
    } catch (error) {
      console.error("An error occurred in obtainCodes:", error);
    }
  }

  retrieveRotationsForAircraftTypes(["B788", "B789", "B78X"]);
}

obtainRotations();
