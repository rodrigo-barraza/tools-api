import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshFloridaWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://services.arcgis.com/O1JpcwDW8sjYuddV/arcgis/rest/services/FL511_Traffic_Cameras/FeatureServer/0",
    city: "Florida",
    country: "US",
    source: "fl511.com",
    idPrefix: "FL",
    fieldMappings: {
      id: "OBJECTID",
      name: "CameraName",
      url: "CameraURL",
      area: "RoadName",
    },
  });
}
