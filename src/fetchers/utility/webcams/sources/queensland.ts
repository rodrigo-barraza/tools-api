import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshQueenslandWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://services1.arcgis.com/vkTwD8kHw2woKBqV/arcgis/rest/services/TMR_Traffic_Cameras_RO/FeatureServer/0",
    city: "Queensland",
    country: "AU",
    source: "qldtraffic.qld.gov.au",
    idPrefix: "QLD",
    fieldMappings: {
      id: "id",
      name: "description",
      url: "image_url",
      area: "typecamera",
    },
  });
}
