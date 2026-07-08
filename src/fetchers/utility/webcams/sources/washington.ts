import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshWashingtonWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather/FeatureServer/0",
    city: "Washington",
    country: "US",
    source: "data.wsdot.wa.gov",
    idPrefix: "WA",
    fieldMappings: {
      id: "OBJECTID",
      name: "CameraTitle",
      url: "ImageURL",
      area: "CompassDirection",
    },
  });
}
