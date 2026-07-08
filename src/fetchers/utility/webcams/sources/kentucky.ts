import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshKentuckyWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_WebCams_WGS84WM/MapServer/0",
    city: "Kentucky",
    country: "US",
    source: "kytc.ky.gov",
    idPrefix: "KY",
    fieldMappings: {
      id: "id",
      name: "name",
      url: "snapshot",
      area: "highway",
    },
  });
}
