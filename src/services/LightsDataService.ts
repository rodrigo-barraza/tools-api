import CONFIG from "../config.ts";

// ═══════════════════════════════════════════════════════════════
//  Lights Data Service
//
//  HTTP client that proxies tool calls to the Lights API (port 4444).
//  The Lights service handles LIFX auth, rate limiting, and night-lock.
//  Follows the same pattern as DiscordDataService.
// ═══════════════════════════════════════════════════════════════

const TIMEOUT_MS = 10_000;

/**
 * Fetch JSON from the Lights API with timeout.


 */
async function lightsApiFetch(method: any, path: any, body: any = null) {
  const url = `${CONFIG.LIGHTS_SERVICE_URL}${path}`;
  const options: Record<string, unknown> = {
    method,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(
      errBody.error || `Lights API returned ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}

const LightsDataService = {
  /**
   * List lights and their current state.

   */
  async listLights(selector: any = "all") {
    const data = await lightsApiFetch("GET", `/lights/${encodeURIComponent(selector)}`);

    // Normalize the response into a clean shape for the agent
    if (!Array.isArray(data)) return data;

    return data.map((light: any) => ({
      id: light.id,
      label: light.label,
      power: light.power,
      brightness: light.brightness,
      color: light.color
        ? {
          hue: Math.round(light.color.hue),
          saturation: Math.round(light.color.saturation * 100) / 100,
          kelvin: light.color.kelvin,
        }
        : null,
      group: light.group?.name || null,
      location: light.location?.name || null,
      connected: light.connected,
      product: light.product?.name || null,
      effect: light.effect || null,
    }));
  },

  /**
   * Set the state of lights.


   */
  async setState({ selector = "all", power, color, brightness, duration, kelvin }: any) {
    const body: Record<string, unknown> = {};
    if (power !== undefined) body.power = power;
    if (color !== undefined) body.color = color;
    if (brightness !== undefined) body.brightness = brightness;
    if (duration !== undefined) body.duration = duration;
    if (kelvin !== undefined) body.color = `kelvin:${kelvin}`;

    return lightsApiFetch("PUT", `/lights/${encodeURIComponent(selector)}/state`, body);
  },

  /**
   * Set state delta — relative adjustments to current light state.


   */
  async setStateDelta({ selector = "all", hue, saturation, brightness, kelvin, duration }: any) {
    const body: Record<string, unknown> = {};
    if (hue !== undefined) body.hue = hue;
    if (saturation !== undefined) body.saturation = saturation;
    if (brightness !== undefined) body.brightness = brightness;
    if (kelvin !== undefined) body.kelvin = kelvin;
    if (duration !== undefined) body.duration = duration;

    return lightsApiFetch("POST", `/lights/${encodeURIComponent(selector)}/state/delta`, body);
  },

  /**
   * Set different states on multiple selectors in a single request.


   */
  async setStates(states: any, defaults: any = null) {
    const body: Record<string, unknown> = { states };
    if (defaults) body.defaults = defaults;
    return lightsApiFetch("PUT", "/lights/states", body);
  },

  /**
   * Toggle power on/off.


   */
  async togglePower(selector: any = "all", duration: any = 1) {
    return lightsApiFetch("POST", `/lights/${encodeURIComponent(selector)}/toggle`, { duration });
  },

  /**
   * Breathe effect — slowly fades between two colors.


   */
  async breatheEffect({ selector = "all", color, fromColor, period, cycles, persist, powerOn, peak }: any) {
    const body: Record<string, unknown> = {};
    if (color !== undefined) body.color = color;
    if (fromColor !== undefined) body.fromColor = fromColor;
    if (period !== undefined) body.period = period;
    if (cycles !== undefined) body.cycles = cycles;
    if (persist !== undefined) body.persist = persist;
    if (powerOn !== undefined) body.powerOn = powerOn;
    if (peak !== undefined) body.peak = peak;

    return lightsApiFetch("POST", `/lights/${encodeURIComponent(selector)}/effects/breathe`, body);
  },

  /**
   * Pulse effect — quickly flashes between two colors.


   */
  async pulseEffect({ selector = "all", color, fromColor, period, cycles, persist, powerOn }: any) {
    const body: Record<string, unknown> = {};
    if (color !== undefined) body.color = color;
    if (fromColor !== undefined) body.fromColor = fromColor;
    if (period !== undefined) body.period = period;
    if (cycles !== undefined) body.cycles = cycles;
    if (persist !== undefined) body.persist = persist;
    if (powerOn !== undefined) body.powerOn = powerOn;

    return lightsApiFetch("POST", `/lights/${encodeURIComponent(selector)}/effects/pulse`, body);
  },

  /**
   * Move effect — flowing color animation for strip products (LIFX Z, Beam).


   */
  async moveEffect({ selector = "all", direction, period, cycles, powerOn }: any) {
    const body: Record<string, unknown> = {};
    if (direction !== undefined) body.direction = direction;
    if (period !== undefined) body.period = period;
    if (cycles !== undefined) body.cycles = cycles;
    if (powerOn !== undefined) body.powerOn = powerOn;

    return lightsApiFetch("POST", `/lights/${encodeURIComponent(selector)}/effects/move`, body);
  },

  /**
   * Flame effect — flickering fire animation for matrix devices.


   */
  async flameEffect({ selector = "all", period, duration, powerOn }: any) {
    const body: Record<string, unknown> = {};
    if (period !== undefined) body.period = period;
    if (duration !== undefined) body.duration = duration;
    if (powerOn !== undefined) body.powerOn = powerOn;

    return lightsApiFetch("POST", `/lights/${encodeURIComponent(selector)}/effects/flame`, body);
  },

  /**
   * Morph effect — continuous color-blending for matrix devices.


   */
  async morphEffect({ selector = "all", palette, period, duration, powerOn }: any) {
    const body: Record<string, unknown> = {};
    if (palette !== undefined) body.palette = palette;
    if (period !== undefined) body.period = period;
    if (duration !== undefined) body.duration = duration;
    if (powerOn !== undefined) body.powerOn = powerOn;

    return lightsApiFetch("POST", `/lights/${encodeURIComponent(selector)}/effects/morph`, body);
  },

  /**
   * Stop all running effects.


   */
  async effectsOff(selector: any = "all", powerOff: any = false) {
    const body: Record<string, unknown> = {};
    if (powerOff) body.powerOff = true;

    return lightsApiFetch("POST", `/lights/${encodeURIComponent(selector)}/effects/off`, body);
  },

  /**
   * List all saved LIFX scenes.
   */
  async listScenes() {
    const data = await lightsApiFetch("GET", "/scenes");

    if (!Array.isArray(data)) return data;

    // Normalize into a clean shape
    return data.map((scene: any) => ({
      uuid: scene.uuid,
      name: scene.name,
      lightCount: scene.states?.length || 0,
      updatedAt: scene.updated_at,
    }));
  },

  /**
   * Activate a saved scene.


   */
  async activateScene(sceneId: any, duration: any = 1, ignore: any = null) {
    const body: Record<string, unknown> = {};
    if (duration !== undefined) body.duration = duration;
    if (ignore) body.ignore = ignore;

    return lightsApiFetch("PUT", `/scenes/${sceneId}/activate`, body);
  },

  /**
   * Get night lock status.
   */
  async getNightLockStatus() {
    return lightsApiFetch("GET", "/nightlock");
  },

  /**
   * Toggle night lock on/off.
   */
  async toggleNightLock() {
    return lightsApiFetch("POST", "/nightlock/toggle");
  },

  /**
   * Explicitly set night lock state.


   */
  async setNightLock(locked: any) {
    const path = locked ? "/nightlock/lock" : "/nightlock/unlock";
    return lightsApiFetch("POST", path);
  },

  /**
   * Get service health and diagnostics.
   */
  async getHealth() {
    return lightsApiFetch("GET", "/health");
  },
};

export default LightsDataService;
