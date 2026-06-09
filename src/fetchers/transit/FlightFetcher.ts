// ─── Flight Status Fetcher ─────────────────────────────────────────
// Uses AviationStack API (free tier: 100 req/mo).

const AVIATIONSTACK_API_BASE = "http://api.aviationstack.com/v1";

interface FlightAirport {
  iata: string;
  icao: string | null;
  airport: string;
  timezone: string | null;
  terminal: string | null;
  gate: string | null;
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  delay: number | null;
}

interface FlightInfo {
  flightNumber: string;
  flightIata: string;
  flightIcao: string | null;
  airline: string;
  airlineIata: string;
  status: string;
  departure: FlightAirport;
  arrival: FlightAirport;
  flightDate: string;
  aircraft: string | null;
  isLive: boolean;
  liveLatitude: number | null;
  liveLongitude: number | null;
  liveAltitude: number | null;
  liveDirection: number | null;
  liveSpeedKmh: number | null;
}

interface FlightStatusResult {
  count: number;
  flights: FlightInfo[];
}

function mapAirport(
  airportData: Record<string, unknown> | null,
): FlightAirport {
  if (!airportData) {
    return {
      iata: "",
      icao: null,
      airport: "",
      timezone: null,
      terminal: null,
      gate: null,
      scheduled: null,
      estimated: null,
      actual: null,
      delay: null,
    };
  }
  return {
    iata: (airportData.iata as string) || "",
    icao: (airportData.icao as string) || null,
    airport: (airportData.airport as string) || "",
    timezone: (airportData.timezone as string) || null,
    terminal: (airportData.terminal as string) || null,
    gate: (airportData.gate as string) || null,
    scheduled: (airportData.scheduled as string) || null,
    estimated: (airportData.estimated as string) || null,
    actual: (airportData.actual as string) || null,
    delay: airportData.delay != null ? Number(airportData.delay) : null,
  };
}

export async function getFlightStatus(
  apiKey: string,
  options: {
    flightIata?: string;
    departureIata?: string;
    arrivalIata?: string;
    airlineIata?: string;
    flightStatus?: string;
    limit?: number;
  } = {},
): Promise<FlightStatusResult> {
  const queryParams = new URLSearchParams({
    access_key: apiKey,
  });

  if (options.flightIata) queryParams.set("flight_iata", options.flightIata);
  if (options.departureIata) queryParams.set("dep_iata", options.departureIata);
  if (options.arrivalIata) queryParams.set("arr_iata", options.arrivalIata);
  if (options.airlineIata) queryParams.set("airline_iata", options.airlineIata);
  if (options.flightStatus) queryParams.set("flight_status", options.flightStatus);
  if (options.limit) queryParams.set("limit", String(Math.min(options.limit, 100)));

  const response = await fetch(
    `${AVIATIONSTACK_API_BASE}/flights?${queryParams}`,
    { signal: AbortSignal.timeout(15_000) },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `AviationStack API error ${response.status}: ${errorBody}`,
    );
  }

  const responseData = (await response.json()) as {
    data: Array<Record<string, unknown>>;
    error?: { message: string };
  };

  if (responseData.error) {
    throw new Error(`AviationStack API error: ${responseData.error.message}`);
  }

  const flights: FlightInfo[] = (responseData.data || []).map(
    (flightData) => {
      const departure = flightData.departure as Record<string, unknown> | null;
      const arrival = flightData.arrival as Record<string, unknown> | null;
      const airline = flightData.airline as Record<string, unknown> | null;
      const flight = flightData.flight as Record<string, unknown> | null;
      const aircraft = flightData.aircraft as Record<string, unknown> | null;
      const liveData = flightData.live as Record<string, unknown> | null;

      return {
        flightNumber: (flight?.number as string) || "",
        flightIata: (flight?.iata as string) || "",
        flightIcao: (flight?.icao as string) || null,
        airline: (airline?.name as string) || "",
        airlineIata: (airline?.iata as string) || "",
        status: (flightData.flight_status as string) || "unknown",
        departure: mapAirport(departure),
        arrival: mapAirport(arrival),
        flightDate: (flightData.flight_date as string) || "",
        aircraft: (aircraft?.registration as string) || null,
        isLive: liveData != null,
        liveLatitude: liveData
          ? (liveData.latitude as number) || null
          : null,
        liveLongitude: liveData
          ? (liveData.longitude as number) || null
          : null,
        liveAltitude: liveData
          ? (liveData.altitude as number) || null
          : null,
        liveDirection: liveData
          ? (liveData.direction as number) || null
          : null,
        liveSpeedKmh: liveData
          ? (liveData.speed_horizontal as number) || null
          : null,
      };
    },
  );

  return {
    count: flights.length,
    flights,
  };
}
