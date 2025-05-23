declare module "airport-timezone" {
  export interface AirportTZ {
    code: string;
    timezone: string;
    offset: {
      gmt: number;
      dst: number;
    };
  }

  const data: AirportTZ[];
  export default data;
}
