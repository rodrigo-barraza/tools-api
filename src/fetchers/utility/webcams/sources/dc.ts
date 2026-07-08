import { fetchArcGISCameras } from "./_arcgis_helper.ts";

export async function refreshDCWebcams() {
  await fetchArcGISCameras({
    serviceUrl:
      "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_Sensors_WebMercator/MapServer/93",
    city: "Washington DC",
    country: "US",
    source: "dcgis.dc.gov",
    idPrefix: "DC",
    fieldMappings: {
      id: "OBJECTID",
      name: "FACILITYID",
      area: "CAMERATYPE",
    },
  });
}
