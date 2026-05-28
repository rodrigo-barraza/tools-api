import CONFIG from "../../config.ts";
import { TRANSLINK_BASE_URL } from "../../constants.ts";

/**
 * TransLink RTTI API fetcher.
 * https://developer.translink.ca/ — requires free API key.
 * Returns real-time bus arrivals, stop info, and route data for Metro Vancouver.
 */

// ─── TransLink API Response Types ──────────────────────────────────

interface TransLinkSchedule {
  ExpectedLeaveTime?: string;
  ExpectedCountdown?: number;
  ScheduleStatus?: string;
  CancelledTrip?: boolean;
  CancelledStop?: string;
  AddedTrip?: boolean;
  AddedStop?: string;
  Destination?: string;
}

interface TransLinkEstimate {
  RouteNo?: string;
  RouteName?: string;
  Direction?: string;
  Schedules?: TransLinkSchedule[];
}

interface TransLinkStop {
  StopNo?: number;
  Name?: string;
  City?: string;
  OnStreet?: string;
  AtStreet?: string;
  Latitude?: number;
  Longitude?: number;
  Distance?: number;
  Routes?: string;
}

interface TransLinkPattern {
  PatternNo?: string;
  Destination?: string;
  Direction?: string;
  RouteMap?: { Href?: string };
}

// ─── Helpers ───────────────────────────────────────────────────────

async function get(path: string) {
  if (!CONFIG.TRANSLINK_API_KEY) {
    throw new Error("TransLink API key not configured");
  }

  const separator = path.includes("?") ? "&" : "?";
  const url = `${TRANSLINK_BASE_URL}${path}${separator}apikey=${CONFIG.TRANSLINK_API_KEY}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `TransLink API ${path} → ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

// ─── Get Next Bus at Stop ──────────────────────────────────────────

/**
 * Get real-time arrival estimates for a bus stop.


 */
export async function getNextBus(
  stopNo: string | number,
  routeNo?: string | number,
) {
  let path = `/stops/${stopNo}/estimates`;
  if (routeNo) {
    path += `?routeNo=${encodeURIComponent(routeNo)}`;
  }

  const data = await get(path);
  const estimates = Array.isArray(data) ? data : [];

  return {
    stopNo,
    count: estimates.length,
    routes: estimates.map((r: TransLinkEstimate) => ({
      routeNo: r.RouteNo,
      routeName: r.RouteName,
      direction: r.Direction,
      schedules: (r.Schedules || []).map((s: TransLinkSchedule) => ({
        expectedLeaveTime: s.ExpectedLeaveTime,
        expectedCountdown: s.ExpectedCountdown,
        scheduleStatus: s.ScheduleStatus, // "*" = on time, "-" = late, "+" = early
        cancelledTrip: s.CancelledTrip || false,
        cancelledStop: s.CancelledStop || "",
        addedTrip: s.AddedTrip || false,
        addedStop: s.AddedStop || "",
        destination: s.Destination,
      })),
    })),
  };
}

// ─── Get Stop Info ─────────────────────────────────────────────────

/**
 * Get stop details by stop number.


 */
export async function getStopInfo(stopNo: string | number) {
  const data = await get(`/stops/${stopNo}`);

  return {
    stopNo: data.StopNo,
    name: data.Name,
    bayNo: data.BayNo || null,
    city: data.City,
    onStreet: data.OnStreet,
    atStreet: data.AtStreet,
    latitude: data.Latitude,
    longitude: data.Longitude,
    wheelchairAccess: data.WheelchairAccess === 1,
    distance: data.Distance || null,
    routes: data.Routes
      ? String(data.Routes)
          .split(",")
          .map((r: string) => r.trim())
      : [],
  };
}

// ─── Find Stops Near Location ──────────────────────────────────────

/**
 * Find transit stops near a lat/lng coordinate.


 */
export async function findStopsNearby(
  lat: number,
  lng: number,
  radius: number = 500,
) {
  const path = `/stops?lat=${lat}&long=${lng}&radius=${Math.min(radius, 2000)}`;
  const data = await get(path);
  const stops = Array.isArray(data) ? data : [];

  return {
    count: stops.length,
    stops: stops.slice(0, 20).map((s: TransLinkStop) => ({
      stopNo: s.StopNo,
      name: s.Name,
      city: s.City,
      onStreet: s.OnStreet,
      atStreet: s.AtStreet,
      latitude: s.Latitude,
      longitude: s.Longitude,
      distance: s.Distance,
      routes: s.Routes
        ? String(s.Routes)
            .split(",")
            .map((r: string) => r.trim())
        : [],
    })),
  };
}

// ─── Get Route Info ────────────────────────────────────────────────

/**
 * Get details about a specific transit route.


 */
export async function getRouteInfo(routeNo: string | number) {
  const data = await get(`/routes/${encodeURIComponent(routeNo)}`);

  return {
    routeNo: data.RouteNo,
    name: data.Name,
    operatingCompany: data.OperatingCompany,
    patterns: (data.Patterns || []).map((p: TransLinkPattern) => ({
      patternNo: p.PatternNo,
      destination: p.Destination,
      direction: p.Direction,
      routeMap: p.RouteMap?.Href || null,
    })),
  };
}
