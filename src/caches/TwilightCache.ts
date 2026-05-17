import { createSimpleCache } from "./createSimpleCache.ts";

const { update, setError, get, getHealth } = createSimpleCache<any>();

export {
  update as updateTwilight,
  setError as setTwilightError,
  get as getTwilight,
  getHealth as getTwilightHealth,
};
