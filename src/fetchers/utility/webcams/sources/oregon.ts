import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshOregonWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://services.arcgis.com/uUvqNMGPm7axC2dD/arcgis/rest/services/TripCheck_Cameras/FeatureServer/0",
    city: "Oregon",
    country: "US",
    source: "tripcheck.com",
    idPrefix: "OR",
    fieldMappings: {
      id: "attributes_cameraId",
      name: "attributes_title",
      url: "attributes_publishedImageId",
      area: "attributes_route",
      latitude: "attributes_latitude",
      longitude: "attributes_longitude",
    },
  });
}
