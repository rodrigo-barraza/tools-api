import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshDonegalWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://services2.arcgis.com/WRtfelnPg3R7bCEW/arcgis/rest/services/TrafficCameras/FeatureServer/0",
    city: "Donegal",
    country: "IE",
    source: "donegalcoco.ie",
    idPrefix: "DGL",
    fieldMappings: {
      id: "ID",
      name: "Name",
      url: "link",
    },
  });
}
