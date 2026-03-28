import { Router } from "express";
import {
  convertCurrency,
  listCurrencies,
} from "../fetchers/utility/CurrencyFetcher.js";
import {
  getTimeInTimezone,
  listTimezones,
} from "../fetchers/utility/TimezoneFetcher.js";
import { lookupIp, batchLookupIps } from "../fetchers/utility/IpInfoFetcher.js";

const router = Router();

// ─── Currency Conversion ───────────────────────────────────────────

router.get("/currency/convert", async (req, res) => {
  const { amount, from, to } = req.query;
  if (!from || !to) {
    return res
      .status(400)
      .json({ error: "Query parameters 'from' and 'to' are required" });
  }
  try {
    const result = await convertCurrency(parseFloat(amount) || 1, from, to);
    res.json(result);
  } catch (err) {
    res
      .status(502)
      .json({ error: `Currency conversion failed: ${err.message}` });
  }
});

router.get("/currency/list", async (_req, res) => {
  try {
    const currencies = await listCurrencies();
    res.json({ count: currencies.length, currencies });
  } catch (err) {
    res.status(502).json({ error: `Currency list failed: ${err.message}` });
  }
});

// ─── Timezone ──────────────────────────────────────────────────────

router.get("/timezone/:area/:location", async (req, res) => {
  const timezone = `${req.params.area}/${req.params.location}`;
  try {
    const result = await getTimeInTimezone(timezone);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Timezone lookup failed: ${err.message}` });
  }
});

router.get("/timezone/list", async (req, res) => {
  try {
    const timezones = await listTimezones(req.query.area);
    res.json({
      count: Array.isArray(timezones) ? timezones.length : 0,
      timezones,
    });
  } catch (err) {
    res.status(502).json({ error: `Timezone list failed: ${err.message}` });
  }
});

// ─── IP Geolocation (IPinfo) ───────────────────────────────────────

router.get("/ip/batch", async (req, res) => {
  const ips = req.query.ips;
  if (!ips) {
    return res
      .status(400)
      .json({ error: "Query parameter 'ips' (comma-separated) is required" });
  }
  try {
    const ipArray = ips
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    const result = await batchLookupIps(ipArray);
    res.json({ count: result.length, results: result });
  } catch (err) {
    res.status(502).json({ error: `Batch IP lookup failed: ${err.message}` });
  }
});

router.get("/ip/:ip", async (req, res) => {
  try {
    const ip = req.params.ip === "self" ? "" : req.params.ip;
    const result = await lookupIp(ip);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `IP lookup failed: ${err.message}` });
  }
});

// ─── Health ────────────────────────────────────────────────────────

export function getUtilityHealth() {
  return {
    currency: "on-demand",
    timezone: "on-demand",
    ipinfo: "on-demand",
  };
}

export default router;
