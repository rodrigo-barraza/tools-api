import { refreshVancouverWebcams } from "./sources/vancouver.ts";
import { refreshSeattleWebcams } from "./sources/seattle.ts";
import { refreshTorontoWebcams } from "./sources/toronto.ts";
import { refreshCalgaryWebcams } from "./sources/calgary.ts";
import { refreshAustinWebcams } from "./sources/austin.ts";

// Ontario 511 cities
import { refreshOttawaWebcams } from "./sources/ottawa.ts";
import { refreshHamiltonWebcams } from "./sources/hamilton.ts";
import { refreshLondonONWebcams } from "./sources/london_on.ts";
import { refreshKingstonWebcams } from "./sources/kingston.ts";
import { refreshWindsorONWebcams } from "./sources/windsor_on.ts";
import { refreshKitchenerWebcams } from "./sources/kitchener.ts";
import { refreshBarrieWebcams } from "./sources/barrie.ts";
import { refreshThunderBayWebcams } from "./sources/thunder_bay.ts";
import { refreshSudburyWebcams } from "./sources/sudbury.ts";
import { refreshNiagaraWebcams } from "./sources/niagara.ts";
import { refreshMississaugaWebcams } from "./sources/mississauga.ts";

// Alberta 511 cities
import { refreshEdmontonWebcams } from "./sources/edmonton.ts";
import { refreshRedDeerWebcams } from "./sources/red_deer.ts";
import { refreshLethbridgeWebcams } from "./sources/lethbridge.ts";
import { refreshMedicineHatWebcams } from "./sources/medicine_hat.ts";
import { refreshGrandePrairieWebcams } from "./sources/grande_prairie.ts";
import { refreshBanffWebcams } from "./sources/banff.ts";
import { refreshFortMcMurrayWebcams } from "./sources/fort_mcmurray.ts";

// US Socrata
import { refreshBatonRougeWebcams } from "./sources/baton_rouge.ts";

// New York 511 cities
import { refreshNYCWebcams } from "./sources/nyc.ts";
import { refreshBuffaloWebcams } from "./sources/buffalo.ts";
import { refreshSyracuseWebcams } from "./sources/syracuse.ts";
import { refreshAlbanyWebcams } from "./sources/albany.ts";
import { refreshRochesterWebcams } from "./sources/rochester.ts";
import { refreshLongIslandWebcams } from "./sources/long_island.ts";
import { refreshWestchesterWebcams } from "./sources/westchester.ts";
import { refreshUticaWebcams } from "./sources/utica.ts";
import { refreshBinghamtonWebcams } from "./sources/binghamton.ts";
import { refreshIthacaWebcams } from "./sources/ithaca.ts";

/**
 * Registry mapping normalized city names to their specific
 * refresh functions. Each function handles fetching and upserting
 * its data into the MongoDB 'webcams' collection.
 */
export const WEBCAM_REGISTRY = {
  // Original cities
  vancouver: refreshVancouverWebcams,
  seattle: refreshSeattleWebcams,
  toronto: refreshTorontoWebcams,
  calgary: refreshCalgaryWebcams,
  austin: refreshAustinWebcams,

  // Ontario 511
  ottawa: refreshOttawaWebcams,
  hamilton: refreshHamiltonWebcams,
  "london-on": refreshLondonONWebcams,
  kingston: refreshKingstonWebcams,
  "windsor-on": refreshWindsorONWebcams,
  kitchener: refreshKitchenerWebcams,
  barrie: refreshBarrieWebcams,
  "thunder-bay": refreshThunderBayWebcams,
  sudbury: refreshSudburyWebcams,
  niagara: refreshNiagaraWebcams,
  mississauga: refreshMississaugaWebcams,

  // Alberta 511
  edmonton: refreshEdmontonWebcams,
  "red-deer": refreshRedDeerWebcams,
  lethbridge: refreshLethbridgeWebcams,
  "medicine-hat": refreshMedicineHatWebcams,
  "grande-prairie": refreshGrandePrairieWebcams,
  banff: refreshBanffWebcams,
  "fort-mcmurray": refreshFortMcMurrayWebcams,

  // US - Louisiana Socrata
  "baton-rouge": refreshBatonRougeWebcams,

  // New York 511
  nyc: refreshNYCWebcams,
  buffalo: refreshBuffaloWebcams,
  syracuse: refreshSyracuseWebcams,
  albany: refreshAlbanyWebcams,
  rochester: refreshRochesterWebcams,
  "long-island": refreshLongIslandWebcams,
  westchester: refreshWestchesterWebcams,
  utica: refreshUticaWebcams,
  binghamton: refreshBinghamtonWebcams,
  ithaca: refreshIthacaWebcams,
};

export function getSupportedCities() {
  return Object.keys(WEBCAM_REGISTRY);
}
