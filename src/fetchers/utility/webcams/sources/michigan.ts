import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshMichiganWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://services2.arcgis.com/67lKNkQ2TO1I3lhR/arcgis/rest/services/MiDrive%20Cameras/FeatureServer/0",
    city: "Michigan",
    country: "US",
    source: "michigan.gov",
    idPrefix: "MI",
    fieldMappings: {
      id: "OBJECTID",
      name: "Location",
      url: "Image",
      area: "Route",
      latitude: "Lat",
      longitude: "Lon",
    },
  });
}
