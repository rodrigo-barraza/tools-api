import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshCaliforniaWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://gisdata.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/FeatureServer/0",
    city: "California",
    country: "US",
    source: "gisdata.dot.ca.gov",
    idPrefix: "CA",
    fieldMappings: {
      id: "index_",
      name: "locationName",
      url: "currentImageURL",
      area: "nearbyPlace",
      latitude: "latitude",
      longitude: "longitude",
    },
  });
}
