import { createSimpleCache } from "./createSimpleCache.js";

const { update, setError, get, getHealth } = createSimpleCache();

export {
  update as updateTwilight,
  setError as setTwilightError,
  get as getTwilight,
  getHealth as getTwilightHealth,
};
