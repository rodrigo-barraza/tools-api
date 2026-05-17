import { Router } from "express";
import { asyncHandler, HealthTracker } from "@rodrigo-barraza/utilities-library/express";
import LightsDataService from "../services/LightsDataService.js";

const router = Router();

// ─── Health ─────────────────────────────────────────────────────

const health = new HealthTracker();

export function getLightsHealth() {
  return health.getHealth();
}

// ─── GET /list ──────────────────────────────────────────────────
// List lights and their current state.
// Query: ?selector=all (default: all)

router.get("/list", asyncHandler(async (req) => {
  const selector = req.query.selector as string || "all";
  return await LightsDataService.listLights(selector);
}, "List lights", { errorStatus: 502, health }));

// ─── POST /state ────────────────────────────────────────────────
// Set the state of lights (power, color, brightness, duration, kelvin).

router.post("/state", asyncHandler(async (req) => {
  const { selector, power, color, brightness, duration, kelvin } = req.body;
  return await LightsDataService.setState({
    selector,
    power,
    color,
    brightness,
    duration,
    kelvin,
  });
}, "Set light state", { errorStatus: 502, health }));

// ─── POST /state/delta ──────────────────────────────────────────
// Set light state delta — relative adjustments to current values.

router.post("/state/delta", asyncHandler(async (req) => {
  const { selector, hue, saturation, brightness, kelvin, duration } = req.body;
  return await LightsDataService.setStateDelta({
    selector,
    hue,
    saturation,
    brightness,
    kelvin,
    duration,
  });
}, "Set light state delta", { errorStatus: 502, health }));

// ─── PUT /states ────────────────────────────────────────────────
// Set different states on multiple selectors in a single request.

router.put("/states", asyncHandler(async (req, res) => {
  const { states, defaults } = req.body;
  if (!Array.isArray(states) || states.length === 0) {
    return res.status(400).json({ error: "states must be a non-empty array" });
  }
  return await LightsDataService.setStates(states, defaults);
}, "Set multi-light states", { errorStatus: 502, health }));

// ─── POST /toggle ───────────────────────────────────────────────
// Toggle power on/off.

router.post("/toggle", asyncHandler(async (req) => {
  const { selector, duration } = req.body;
  return await LightsDataService.togglePower(selector, duration);
}, "Toggle lights", { errorStatus: 502, health }));

// ─── POST /effects/breathe ──────────────────────────────────────
// Breathe effect — slowly fades between two colors.

router.post("/effects/breathe", asyncHandler(async (req) => {
  const { selector, color, fromColor, period, cycles, persist, powerOn, peak } = req.body;
  return await LightsDataService.breatheEffect({
    selector,
    color,
    fromColor,
    period,
    cycles,
    persist,
    powerOn,
    peak,
  });
}, "Breathe effect", { errorStatus: 502, health }));

// ─── POST /effects/pulse ────────────────────────────────────────
// Pulse effect — quickly flashes between two colors.

router.post("/effects/pulse", asyncHandler(async (req) => {
  const { selector, color, fromColor, period, cycles, persist, powerOn } = req.body;
  return await LightsDataService.pulseEffect({
    selector,
    color,
    fromColor,
    period,
    cycles,
    persist,
    powerOn,
  });
}, "Pulse effect", { errorStatus: 502, health }));

// ─── POST /effects/move ─────────────────────────────────────────
// Move effect — flowing color animation for strip products.

router.post("/effects/move", asyncHandler(async (req) => {
  const { selector, direction, period, cycles, powerOn } = req.body;
  return await LightsDataService.moveEffect({
    selector,
    direction,
    period,
    cycles,
    powerOn,
  });
}, "Move effect", { errorStatus: 502, health }));

// ─── POST /effects/flame ────────────────────────────────────────
// Flame effect — flickering fire animation for matrix devices.

router.post("/effects/flame", asyncHandler(async (req) => {
  const { selector, period, duration, powerOn } = req.body;
  return await LightsDataService.flameEffect({
    selector,
    period,
    duration,
    powerOn,
  });
}, "Flame effect", { errorStatus: 502, health }));

// ─── POST /effects/morph ────────────────────────────────────────
// Morph effect — continuous color-blending for matrix devices.

router.post("/effects/morph", asyncHandler(async (req) => {
  const { selector, palette, period, duration, powerOn } = req.body;
  return await LightsDataService.morphEffect({
    selector,
    palette,
    period,
    duration,
    powerOn,
  });
}, "Morph effect", { errorStatus: 502, health }));

// ─── POST /effects/off ──────────────────────────────────────────
// Stop all running effects.

router.post("/effects/off", asyncHandler(async (req) => {
  const { selector, powerOff } = req.body;
  return await LightsDataService.effectsOff(selector, powerOff);
}, "Effects off", { errorStatus: 502, health }));

// ─── GET /scenes ────────────────────────────────────────────────
// List all saved LIFX scenes.

router.get("/scenes", asyncHandler(async () => {
  return await LightsDataService.listScenes();
}, "List scenes", { errorStatus: 502, health }));

// ─── POST /scenes/activate ──────────────────────────────────────
// Activate a saved scene.

router.post("/scenes/activate", asyncHandler(async (req, res) => {
  const { sceneId, duration, ignore } = req.body;
  if (!sceneId) {
    return res.status(400).json({ error: "sceneId is required" });
  }
  return await LightsDataService.activateScene(sceneId, duration, ignore);
}, "Activate scene", { errorStatus: 502, health }));

// ─── POST /nightlock ────────────────────────────────────────────
// Unified nightlock dispatcher — handles action param from tool schema.

router.post("/nightlock", asyncHandler(async (req, res) => {
  const { action, locked } = req.body;

  switch (action) {
    case "toggle":
      return await LightsDataService.toggleNightLock();
    case "set":
      if (locked === undefined) {
        return res.status(400).json({ error: "locked (boolean) is required when action is 'set'" });
      }
      return await LightsDataService.setNightLock(locked);
    case "status":
    default:
      return await LightsDataService.getNightLockStatus();
  }
}, "Night lock", { errorStatus: 502, health }));

// ─── GET /nightlock ─────────────────────────────────────────────
// Get night lock status.

router.get("/nightlock", asyncHandler(async () => {
  return await LightsDataService.getNightLockStatus();
}, "Night lock status", { errorStatus: 502, health }));

// ─── POST /nightlock/toggle ─────────────────────────────────────
// Toggle night lock on/off.

router.post("/nightlock/toggle", asyncHandler(async () => {
  return await LightsDataService.toggleNightLock();
}, "Night lock toggle", { errorStatus: 502, health }));

// ─── POST /nightlock/set ────────────────────────────────────────
// Explicitly lock or unlock.

router.post("/nightlock/set", asyncHandler(async (req, res) => {
  const { locked } = req.body;
  if (locked === undefined) {
    return res.status(400).json({ error: "locked (boolean) is required" });
  }
  return await LightsDataService.setNightLock(locked);
}, "Night lock set", { errorStatus: 502, health }));

// ─── GET /health ────────────────────────────────────────────────
// Service health and diagnostics.

router.get("/health", asyncHandler(async () => {
  return await LightsDataService.getHealth();
}, "Lights health", { errorStatus: 502, health }));

export default router;
