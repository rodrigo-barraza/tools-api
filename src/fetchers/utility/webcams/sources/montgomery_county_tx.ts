import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshMontgomeryCountyWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://services1.arcgis.com/PRoAPGnMSUqvTrzq/arcgis/rest/services/MCTX_Live_Cameras/FeatureServer/0",
    city: "Montgomery County TX",
    country: "US",
    source: "mctx.org",
    idPrefix: "MCTX",
    fieldMappings: {
      id: "OBJECTID",
      name: "SITENAME",
      url: "FEEDURL",
      area: "CAMERATYP",
    },
  });
}
