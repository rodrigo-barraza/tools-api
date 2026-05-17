import { createSimpleCache } from "./createSimpleCache.ts";

const { update, setError, get, getHealth } = createSimpleCache<any>();

export {
  update as updateApod,
  setError as setApodError,
  get as getApod,
  getHealth as getApodHealth,
};
