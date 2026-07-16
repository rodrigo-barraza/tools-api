// ────────────────────────────────────────────────────────────
// Tool Definitions — Smart Home
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getSmartHomeTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "list_lights",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("list_lights.description"),
    endpoint: {
      path: "/lights/list",
      queryParams: ["selector"],
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("list_lights.params.selector"),
        },
      },
      required: [],
    },
  },
  {
    name: "set_light_state",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("set_light_state.description"),
    endpoint: {
      path: "/lights/state",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("set_light_state.params.selector"),
        },
        power: {
          type: "string",
          enum: ["on", "off"],
          description: translate("set_light_state.params.power"),
        },
        color: {
          type: "string",
          description: translate("set_light_state.params.color"),
        },
        brightness: {
          type: "number",
          description: translate("set_light_state.params.brightness"),
        },
        duration: {
          type: "number",
          description: translate("set_light_state.params.duration"),
        },
        kelvin: {
          type: "number",
          description: translate("set_light_state.params.kelvin"),
        },
      },
      required: [],
    },
  },
  {
    name: "toggle_light_power",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("toggle_light_power.description"),
    endpoint: {
      path: "/lights/toggle",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("common.params.lifxSelector"),
        },
        duration: {
          type: "number",
          description: translate("toggle_light_power.params.duration"),
        },
      },
      required: [],
    },
  },
  {
    name: "start_light_breathe_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("start_light_breathe_effect.description"),
    endpoint: {
      path: "/lights/effects/breathe",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("common.params.lifxSelector"),
        },
        color: {
          type: "string",
          description: translate("start_light_breathe_effect.params.color"),
        },
        fromColor: {
          type: "string",
          description: translate("start_light_breathe_effect.params.fromColor"),
        },
        period: {
          type: "number",
          description: translate("start_light_breathe_effect.params.period"),
        },
        cycles: {
          type: "number",
          description: translate("start_light_breathe_effect.params.cycles"),
        },
        persist: {
          type: "boolean",
          description: translate("start_light_breathe_effect.params.persist"),
        },
        powerOn: {
          type: "boolean",
          description: translate("start_light_breathe_effect.params.powerOn"),
        },
        peak: {
          type: "number",
          description: translate("start_light_breathe_effect.params.peak"),
        },
      },
      required: ["color"],
    },
  },
  {
    name: "start_light_pulse_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("start_light_pulse_effect.description"),
    endpoint: {
      path: "/lights/effects/pulse",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("common.params.lifxSelector"),
        },
        color: {
          type: "string",
          description: translate("start_light_pulse_effect.params.color"),
        },
        fromColor: {
          type: "string",
          description: translate("start_light_pulse_effect.params.fromColor"),
        },
        period: {
          type: "number",
          description: translate("start_light_pulse_effect.params.period"),
        },
        cycles: {
          type: "number",
          description: translate("start_light_pulse_effect.params.cycles"),
        },
        persist: {
          type: "boolean",
          description: translate("start_light_pulse_effect.params.persist"),
        },
        powerOn: {
          type: "boolean",
          description: translate("common.params.lifxAutoOn"),
        },
      },
      required: ["color"],
    },
  },
  {
    name: "stop_light_effects",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("stop_light_effects.description"),
    endpoint: {
      path: "/lights/effects/off",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("common.params.lifxSelector"),
        },
        powerOff: {
          type: "boolean",
          description: translate("stop_light_effects.params.powerOff"),
        },
      },
      required: [],
    },
  },
  {
    name: "list_light_scenes",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("list_light_scenes.description"),
    endpoint: {
      path: "/lights/scenes",
    },
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "activate_light_scene",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("activate_light_scene.description"),
    endpoint: {
      path: "/lights/scenes/activate",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        sceneId: {
          type: "string",
          description: translate("activate_light_scene.params.sceneId"),
        },
        duration: {
          type: "number",
          description: translate("activate_light_scene.params.duration"),
        },
        ignore: {
          type: "array",
          items: { type: "string" },
          description: translate("activate_light_scene.params.ignore"),
        },
      },
      required: ["sceneId"],
    },
  },
  {
    name: "start_light_move_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("start_light_move_effect.description"),
    endpoint: {
      path: "/lights/effects/move",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("common.params.lifxSelector"),
        },
        direction: {
          type: "string",
          enum: ["forward", "backward"],
          description: translate("start_light_move_effect.params.direction"),
        },
        period: {
          type: "number",
          description: translate("start_light_move_effect.params.period"),
        },
        cycles: {
          type: "number",
          description: translate("start_light_move_effect.params.cycles"),
        },
        powerOn: {
          type: "boolean",
          description: translate("common.params.lifxAutoOn"),
        },
      },
      required: [],
    },
  },
  {
    name: "start_light_flame_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("start_light_flame_effect.description"),
    endpoint: {
      path: "/lights/effects/flame",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("common.params.lifxSelector"),
        },
        period: {
          type: "number",
          description: translate("start_light_flame_effect.params.period"),
        },
        duration: {
          type: "number",
          description: translate("start_light_morph_effect.params.duration"),
        },
        powerOn: {
          type: "boolean",
          description: translate("common.params.lifxAutoOn"),
        },
      },
      required: [],
    },
  },
  {
    name: "start_light_morph_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("start_light_morph_effect.description"),
    endpoint: {
      path: "/lights/effects/morph",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("common.params.lifxSelector"),
        },
        palette: {
          type: "array",
          items: { type: "string" },
          description: translate("start_light_morph_effect.params.palette"),
        },
        period: {
          type: "number",
          description: translate("start_light_morph_effect.params.period"),
        },
        duration: {
          type: "number",
          description: translate("start_light_morph_effect.params.duration"),
        },
        powerOn: {
          type: "boolean",
          description: translate("common.params.lifxAutoOn"),
        },
      },
      required: [],
    },
  },
  {
    name: "set_light_states",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("set_light_states.description"),
    endpoint: {
      path: "/lights/states",
      method: "PUT",
    },
    parameters: {
      type: "object",
      properties: {
        states: {
          type: "array",
          items: {
            type: "object",
            properties: {
              selector: {
                type: "string",
                description: translate("set_light_states.params.states.items.params.selector"),
              },
              power: { type: "string", enum: ["on", "off"] },
              color: { type: "string", description: translate("set_light_states.params.color") },
              brightness: { type: "number", description: translate("set_light_states.params.brightness") },
              duration: { type: "number", description: translate("set_light_states.params.duration") },
              kelvin: {
                type: "number",
                description: translate("set_light_states.params.states.items.params.kelvin"),
              },
            },
          },
          description: translate("set_light_states.params.states"),
        },
        defaults: {
          type: "object",
          description: translate("set_light_states.params.defaults"),
        },
      },
      required: ["states"],
    },
  },
  // Photo → lighting scene: node-vibrant palette extraction
  // (https://github.com/Vibrant-Colors/node-vibrant) distributed across the
  // room's lights via the existing batch states endpoint.
  {
    name: "paint_lights_from_image",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("paint_lights_from_image.description"),
    endpoint: {
      method: "POST",
      path: "/lights/paint-from-image",
      bodyParams: ["input", "selector", "brightness", "duration"],
    },
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: translate("paint_lights_from_image.params.input"),
        },
        selector: {
          type: "string",
          description: translate("common.params.lifxSelector"),
        },
        brightness: {
          type: "number",
          description: translate("paint_lights_from_image.params.brightness"),
        },
        duration: {
          type: "number",
          description: translate("paint_lights_from_image.params.duration"),
        },
      },
      required: ["input"],
    },
    display: {
      activeVerb: "Painting lights from",
      completedVerb: "Painted lights from",
      subjectParam: "input",
      subjectFormat: "truncate",
    },
  },
  {
    name: "adjust_light_state",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("adjust_light_state.description"),
    endpoint: {
      path: "/lights/state/delta",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: translate("common.params.lifxSelector"),
        },
        hue: {
          type: "number",
          description: translate("adjust_light_state.params.hue"),
        },
        saturation: {
          type: "number",
          description: translate("adjust_light_state.params.saturation"),
        },
        brightness: {
          type: "number",
          description: translate("adjust_light_state.params.brightness"),
        },
        kelvin: {
          type: "number",
          description: translate("adjust_light_state.params.kelvin"),
        },
        duration: {
          type: "number",
          description: translate("toggle_light_power.params.duration"),
        },
      },
      required: [],
    },
  },
  {
    name: "enable_light_night_lock",
    dataSource: onDemand("LIFX Cloud API"),
    description: translate("enable_light_night_lock.description"),
    endpoint: {
      path: "/lights/nightlock",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["status", "toggle", "set"],
          description: translate("enable_light_night_lock.params.action"),
        },
        locked: {
          type: "boolean",
          description: translate("enable_light_night_lock.params.locked"),
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_light_health",
    dataSource: onDemand("Lights Service"),
    description: translate("get_light_health.description"),
    endpoint: {
      path: "/lights/health",
    },
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  ];
}
