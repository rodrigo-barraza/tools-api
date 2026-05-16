import { createSimpleCache } from "./createSimpleCache.js";

const { update, setError, get, getHealth } = createSimpleCache();

export {
  update as updateApod,
  setError as setApodError,
  get as getApod,
  getHealth as getApodHealth,
};
