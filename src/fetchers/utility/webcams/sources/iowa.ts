import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshIowaWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://services.arcgis.com/8lRhdTsQyJpSA2Has/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0",
    city: "Iowa",
    country: "US",
    source: "data.iowadot.gov",
    idPrefix: "IA",
    fieldMappings: {
      id: "OBJECTID",
      name: "CAMERA_NAME",
      url: "ImageURL",
      area: "ROUTE",
    },
  });
}
