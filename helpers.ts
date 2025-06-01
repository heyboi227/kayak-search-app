import fs from "fs";
import path from "path";
import airportTimezoneData from "airport-timezone";
import moment from "moment";

export async function saveData(data: any, filename: string): Promise<void> {
  const filePath = path.resolve(__dirname, filename);
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving file ${filePath}:`, error);
    throw error;
  }
}

export async function loadData(filename: string): Promise<any> {
  const filePath = path.resolve(__dirname, filename);
  try {
    const data = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading file ${filePath}:`, error);
    throw error;
  }
}

export function delay(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

export function containsExactMatch(text: string, search: string): boolean {
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escapedSearch}\\b`);
  return pattern.test(text);
}

export function getTimezoneForAirport(iata: string): string {
  const entry = airportTimezoneData.find(
    (a: { code: string; timezone: string }) => a.code === iata
  );
  return entry?.timezone ?? "UTC";
}

export function convertTimeNotation(
  timeStr: string, // e.g. "0700"
  fromZone: string, // e.g. "Europe/Belgrade"
  toZone: string // e.g. "Asia/Dubai"
): string {
  // parse `timeStr` in the source zone…
  const m = moment.tz(`${timeStr}`, "HHmm", fromZone);
  // …then shift to the destination zone and format as “HHmm”
  return m.tz(toZone).format("HHmm");
}

export function extractRotationFromUrl(url: string): string {
  const m = url.match(/\/flights\/([^\/]+)\//);
  return m ? m[1] : "";
}

export function parseDayTime(
  dayMap: Record<string, number>,
  s: string,
  homeAirportTakeoffDay?: string,
  homeAirportLandingDay?: string
): number {
  const [dayStr, timeStr] = s.split(" ");
  let dayNum = dayMap[dayStr];

  if (!dayNum) {
    if (homeAirportTakeoffDay) {
      dayNum = dayMap[homeAirportTakeoffDay];
    } else {
      dayNum = dayMap[homeAirportLandingDay];
    }
  }

  let [hours, mins] = [0, 0];

  if (timeStr === undefined) {
    [hours, mins] = dayStr.split(":").map(Number);
  } else {
    [hours, mins] = timeStr.split(":").map(Number);
  }

  return ((dayNum - 1) * 24 + hours) * 60 + mins;
}

export function convertDepartureToDestZone(
  dayMap: Record<string, number>,
  departureStr: string,
  rotation: string
): string {
  const [orgIata] = rotation.split("-");
  const orgTz = getTimezoneForAirport(orgIata);

  const [dayAbbr, timePart] = departureStr.split(" ");
  const [hour, minute] = timePart.split(":").map(Number);

  const belgradeNow = moment.tz("Europe/Belgrade");

  let departMoment = belgradeNow
    .clone()
    .day(dayMap[dayAbbr])
    .hour(hour)
    .minute(minute)
    .second(0);

  if (departMoment.isBefore(belgradeNow)) {
    departMoment.add(7, "days");
  }

  const orgMoment = departMoment.clone().tz(orgTz);
  return orgMoment.format("ddd HH:mm");
}

export function convertArrivalToDestZone(
  dayMap: Record<string, number>,
  arrivalStr: string,
  rotation: string
): string {
  const [, destIata] = rotation.split("-");
  const destTz = getTimezoneForAirport(destIata);

  const [dayAbbr, timePart] = arrivalStr.split(" ");
  const [hour, minute] = timePart.split(":").map(Number);

  const belgradeNow = moment.tz("Europe/Belgrade");

  let departMoment = belgradeNow
    .clone()
    .day(dayMap[dayAbbr])
    .hour(hour)
    .minute(minute)
    .second(0);

  if (departMoment.isBefore(belgradeNow)) {
    departMoment.add(7, "days");
  }

  const destMoment = departMoment.clone().tz(destTz);
  return destMoment.format("ddd HH:mm");
}

export function convertHomeMomentToLocal(
  dateIso: string,
  time: string,
  homeTz: string,
  localTz: string
): moment.Moment {
  return moment
    .tz(`${dateIso} ${time}`, "YYYY-MM-DD HH:mm", homeTz)
    .tz(localTz);
}

export function makeLocalMoment(
  dateIso: string,
  time: string,
  tz: string
): moment.Moment {
  return moment.tz(`${dateIso} ${time}`, "YYYY-MM-DD HH:mm", tz);
}

const ISO_DAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/**
 * Parse a fragment that’s either
 *   • "Day hh:mm"  (e.g. "Fri 18:00"), or
 *   • "hh:mm"      (e.g. "15:00")
 * into a Moment in `tz`, anchored to the first occurrence of that weekday
 * **on or after** `baseDateIso`.  If you pass in `prevM`, and the frag has
 * no weekday, it will clone `prevM`’s date and apply the new time.
 */
export function parseDayFrag(
  frag: string,
  baseDateIso: string,
  tz: string,
  prevM?: moment.Moment
): moment.Moment {
  const parts = frag.trim().split(" ");
  let m: moment.Moment;

  if (parts.length === 2) {
    // full "Day hh:mm"
    const [dayAbbr, timeStr] = parts;
    const targetIsoDay = ISO_DAY[dayAbbr];
    if (targetIsoDay == null) {
      throw new Error(`Unknown day abbreviation "${dayAbbr}"`);
    }

    // midnight of base in the right zone
    const base = moment.tz(baseDateIso, "YYYY-MM-DD", tz);
    const baseIsoDay = base.isoWeekday(); // 1=Mon … 7=Sun
    const dayOffset = (targetIsoDay - baseIsoDay + 7) % 7;

    const [hh, mm] = timeStr.split(":").map((x) => parseInt(x, 10));
    m = base.clone().add(dayOffset, "days").hour(hh).minute(mm);
  } else if (parts.length === 1 && prevM) {
    // partial "hh:mm" → use prevM's date
    const timeStr = parts[0];
    const [hh, mm] = timeStr.split(":").map((x) => parseInt(x, 10));
    m = prevM.clone().hour(hh).minute(mm);
  } else {
    throw new Error(
      `Cannot parse fragment "${frag}". ` +
        `Use "Day hh:mm" or supply a prevM for bare "hh:mm".`
    );
  }

  return m;
}

export function findEarliestZone(zones: string[]): string {
  let earliestTimeZone: string = "";

  earliestTimeZone = zones.reduce((currentEarliest, zone) => {
    const zoneOffset = moment().tz(zone).utcOffset();
    const earliestOffset = moment().tz(currentEarliest).utcOffset();

    return zoneOffset < earliestOffset ? zone : currentEarliest;
  }, zones[0]);

  return earliestTimeZone;
}
