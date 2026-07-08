import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshNewZealandWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/LiveCamerasNZTA_Public_View/FeatureServer/0",
    city: "New Zealand",
    country: "NZ",
    source: "nzta.govt.nz",
    idPrefix: "NZ",
    fieldMappings: {
      id: "id",
      name: "name",
      url: "imageurl",
      area: "region",
    },
  });
}
