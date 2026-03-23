import CONFIG from "../../config.js";

const { LATITUDE, LONGITUDE, TIMEZONE } = CONFIG;

const AIR_QUALITY_URL =
  `https://air-quality-api.open-meteo.com/v1/air-quality` +
  `?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
  `&current=us_aqi,european_aqi,pm10,pm2_5,` +
  `carbon_monoxide,nitrogen_dioxide,ozone,dust,uv_index` +
  `&hourly=us_aqi,pm2_5,pm10,uv_index` +
  `&timezone=${TIMEZONE}` +
  `&forecast_hours=24`;

export async function fetchAirQuality() {
  const response = await fetch(AIR_QUALITY_URL);

  if (!response.ok) {
    throw new Error(`Air Quality API returned ${response.status}`);
  }

  const data = await response.json();
  const current = data.current;

  return {
    source: "airquality",
    timestamp: new Date(current.time),

    // Current air quality
    usAqi: current.us_aqi,
    europeanAqi: current.european_aqi,
    pm25: current.pm2_5,
    pm10: current.pm10,
    carbonMonoxide: current.carbon_monoxide,
    nitrogenDioxide: current.nitrogen_dioxide,
    ozone: current.ozone,
    dust: current.dust,
    uvIndex: current.uv_index,

    // Hourly AQ forecast
    hourlyAirQuality: data.hourly
      ? data.hourly.time.map((time, i) => ({
          time,
          usAqi: data.hourly.us_aqi[i],
          pm25: data.hourly.pm2_5[i],
          pm10: data.hourly.pm10[i],
          uvIndex: data.hourly.uv_index[i],
        }))
      : [],
  };
}
