import CONFIG from "../../config.ts";

const BASE_URL = "https://tidesandcurrents.noaa.gov/api/datagetter";

export interface TidePrediction {
  time: string;
  height: number;
  type: "high" | "low";
  stationId: string;
}

interface RawTidePrediction {
  t: string;
  v: string;
  type: "H" | "L" | string;
}

/**
 * Fetch today's high/low tide predictions from NOAA CO-OPS.
 * Free API, no key required.
 */
export async function fetchTides(): Promise<TidePrediction[]> {
  const stationId = CONFIG.TIDE_STATION_ID || "";
  const url =
    `${BASE_URL}?date=today&station=${stationId}` +
    "&product=predictions&datum=MLLW&time_zone=lst_ldt" +
    "&units=metric&format=json&interval=hilo";

  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`NOAA CO-OPS ${response.status}: ${response.statusText}`);
  const json = (await response.json()) as {
    predictions?: RawTidePrediction[];
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(
      `NOAA CO-OPS: ${json.error.message || JSON.stringify(json.error)}`,
    );
  }

  return (json.predictions || []).map(
    (p: RawTidePrediction): TidePrediction => ({
      time: p.t,
      height: parseFloat(p.v),
      type: p.type === "H" ? "high" : "low",
      stationId,
    }),
  );
}
