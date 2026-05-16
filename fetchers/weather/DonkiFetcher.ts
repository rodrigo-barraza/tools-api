import CONFIG from "../../config.js";

const { NASA_API_KEY } = CONFIG;
const DONKI_BASE = "https://api.nasa.gov/DONKI";

/**
 * Get a date string N days ago in YYYY-MM-DD format.
 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

/**
 * Fetch solar flares from the past 7 days.
 */
export async function fetchSolarFlares() {
  const url =
    `${DONKI_BASE}/FLR?startDate=${daysAgo(7)}` +
    `&endDate=${daysAgo(0)}&api_key=${NASA_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DONKI FLR returned ${response.status}`);
  }

  const data = await response.json();

  return data.map((flr) => ({
    flrId: flr.flrID,
    beginTime: flr.beginTime ? new Date(flr.beginTime) : null,
    peakTime: flr.peakTime ? new Date(flr.peakTime) : null,
    endTime: flr.endTime ? new Date(flr.endTime) : null,
    classType: flr.classType,
    sourceLocation: flr.sourceLocation,
    activeRegionNum: flr.activeRegionNum,
    instruments: flr.instruments?.map((i) => i.displayName) || [],
    linkedEvents: flr.linkedEvents?.map((e) => e.activityID) || [],
    note: flr.note || null,
    link: flr.link,
  }));
}

/**
 * Fetch coronal mass ejections from the past 7 days.
 */
export async function fetchCmes() {
  const url =
    `${DONKI_BASE}/CME?startDate=${daysAgo(7)}` +
    `&endDate=${daysAgo(0)}&api_key=${NASA_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DONKI CME returned ${response.status}`);
  }

  const data = await response.json();

  return data.map((cme) => {
    const analysis =
      cme.cmeAnalyses?.find((a) => a.isMostAccurate) ||
      cme.cmeAnalyses?.[0] ||
      {};
    const enlil = analysis.enlilList?.[0] || {};

    return {
      activityId: cme.activityID,
      startTime: cme.startTime ? new Date(cme.startTime) : null,
      sourceLocation: cme.sourceLocation || null,
      activeRegionNum: cme.activeRegionNum,
      instruments: cme.instruments?.map((i) => i.displayName) || [],
      note: cme.note || null,
      link: cme.link,
      // Analysis data
      speed: analysis.speed ?? null,
      latitude: analysis.latitude ?? null,
      longitude: analysis.longitude ?? null,
      halfAngle: analysis.halfAngle ?? null,
      type: analysis.type ?? null,
      // Earth impact
      isEarthDirected: enlil.isEarthGB || false,
      isEarthMinorImpact: enlil.isEarthMinorImpact || false,
      estimatedArrival: enlil.estimatedShockArrivalTime
        ? new Date(enlil.estimatedShockArrivalTime)
        : null,
      estimatedDuration: enlil.estimatedDuration ?? null,
      kp90: enlil.kp_90 ?? null,
      kp135: enlil.kp_135 ?? null,
      kp180: enlil.kp_180 ?? null,
      linkedEvents: cme.linkedEvents?.map((e) => e.activityID) || [],
    };
  });
}

/**
 * Fetch geomagnetic storms from the past 30 days.
 */
export async function fetchGeomagneticStorms() {
  const url =
    `${DONKI_BASE}/GST?startDate=${daysAgo(30)}` +
    `&endDate=${daysAgo(0)}&api_key=${NASA_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DONKI GST returned ${response.status}`);
  }

  const data = await response.json();

  return data.map((gst) => ({
    gstId: gst.gstID,
    startTime: gst.startTime ? new Date(gst.startTime) : null,
    kpIndices:
      gst.allKpIndex?.map((kp) => ({
        observedTime: new Date(kp.observedTime),
        kpIndex: kp.kpIndex,
        source: kp.source,
      })) || [],
    linkedEvents: gst.linkedEvents?.map((e) => e.activityID) || [],
    link: gst.link,
  }));
}

/**
 * Fetch all DONKI data in parallel.
 */
export async function fetchAllDonki() {
  const [flares, cmes, storms] = await Promise.all([
    fetchSolarFlares(),
    fetchCmes(),
    fetchGeomagneticStorms(),
  ]);

  return { flares, cmes, storms };
}
