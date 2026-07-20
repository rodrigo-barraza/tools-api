import type { SynthesizerConfig } from "./SoundSynthesizerService.ts";
import { INSTRUMENT_PRESETS } from "./SoundSynthesizerService.ts";

const VALID_SOUND_TYPES = new Set([
  "synthesizer",
  "sound_effect",
  "modular",
]);

const VALID_WAVEFORMS = new Set([
  "sine",
  "triangle",
  "sawtooth",
  "square",
  "noise",
]);

const VALID_PRESET_EFFECTS = new Set([
  "laser",
  "coin",
  "powerup",
  "jump",
  "explosion",
  "synthwave_bass",
  "ambient_pad",
  "sci_fi_sweep",
]);

const VALID_NODE_TYPES = new Set([
  "oscillator",
  "noise",
  "biquad_filter",
  "envelope",
  "delay",
  "stereo_panner",
  "gain",
  "reverb",
  "drum_synth",
  "distortion",
  "sampler",
]);

export function validateSynthesizerInput(config: SynthesizerConfig): string | null {
  if (!config || typeof config !== "object") {
    return "Invalid input: config must be a non-null object";
  }

  if (config.soundType && !VALID_SOUND_TYPES.has(config.soundType)) {
    return `Invalid soundType '${config.soundType}'. Valid: ${[...VALID_SOUND_TYPES].join(", ")}`;
  }

  if (config.waveform && !VALID_WAVEFORMS.has(config.waveform)) {
    return `Invalid waveform '${config.waveform}'. Valid: ${[...VALID_WAVEFORMS].join(", ")}`;
  }

  if (config.presetEffect && !VALID_PRESET_EFFECTS.has(config.presetEffect)) {
    return `Invalid presetEffect '${config.presetEffect}'. Valid: ${[...VALID_PRESET_EFFECTS].join(", ")}`;
  }

  if (config.instrument && !Object.hasOwn(INSTRUMENT_PRESETS, config.instrument)) {
    return (
      `Invalid instrument '${config.instrument}'. Valid: ${Object.keys(INSTRUMENT_PRESETS).join(", ")}`
    );
  }

  if (config.frequency !== undefined && config.frequency !== null) {
    const frequencyValue = typeof config.frequency === "string"
      ? null
      : Number(config.frequency);
    if (frequencyValue !== null) {
      if (isNaN(frequencyValue) || frequencyValue < 1 || frequencyValue > 22050) {
        return `Invalid frequency ${config.frequency}. Must be a number between 1 and 22050 Hz, or a note name like 'C4', 'A#3'`;
      }
    }
  }

  if (config.duration !== undefined && config.duration !== null) {
    const durationValue = Number(config.duration);
    if (isNaN(durationValue) || durationValue < 0.01 || durationValue > 60.0) {
      return `Invalid duration ${config.duration}. Must be between 0.01 and 60.0 seconds`;
    }
  }

  if (config.sampleRate !== undefined && config.sampleRate !== null) {
    const sampleRateValue = Number(config.sampleRate);
    if (isNaN(sampleRateValue) || sampleRateValue < 8000 || sampleRateValue > 48000) {
      return `Invalid sampleRate ${config.sampleRate}. Must be between 8000 and 48000`;
    }
  }

  if (config.tempo !== undefined && config.tempo !== null) {
    const tempoValue = Number(config.tempo);
    if (isNaN(tempoValue) || tempoValue < 20 || tempoValue > 999) {
      return `Invalid tempo ${config.tempo}. Must be between 20 and 999 BPM`;
    }
  }


  const isModularMode =
    config.soundType === "modular" ||
    (config.tracks && config.tracks.length > 0) ||
    (config.nodes && Object.keys(config.nodes).length > 0);

  if (isModularMode) {
    if (!config.tracks || !Array.isArray(config.tracks) || config.tracks.length === 0) {
      return "Modular mode requires a non-empty 'tracks' array, each with a 'nodeChain' and 'notes' array";
    }

    if (!config.nodes || typeof config.nodes !== "object" || Object.keys(config.nodes).length === 0) {
      return (
        "Modular mode requires a 'nodes' object defining DSP node configurations. " +
        "Each name in a track's nodeChain must have a corresponding entry in 'nodes' " +
        'with its type and parameters. Example: { "osc": { "type": "oscillator", "waveform": "sine" } }'
      );
    }

    for (const [nodeName, nodeConfig] of Object.entries(config.nodes)) {
      if (!nodeConfig || !nodeConfig.type) {
        return `Node '${nodeName}' is missing its 'type' property`;
      }
      if (!VALID_NODE_TYPES.has(nodeConfig.type)) {
        return `Node '${nodeName}' has invalid type '${nodeConfig.type}'. Valid: ${[...VALID_NODE_TYPES].join(", ")}`;
      }
    }

    const unresolvedNodeNames: string[] = [];
    for (let trackIndex = 0; trackIndex < config.tracks.length; trackIndex++) {
      const track = config.tracks[trackIndex];

      if (!track.nodeChain || !Array.isArray(track.nodeChain) || track.nodeChain.length === 0) {
        return `Track at index ${trackIndex} must have a non-empty 'nodeChain' array`;
      }

      if (!track.notes || !Array.isArray(track.notes) || track.notes.length === 0) {
        return `Track at index ${trackIndex} must have a non-empty 'notes' array`;
      }

      for (const chainNodeName of track.nodeChain) {
        if (chainNodeName === "destination") continue;
        if (!config.nodes[chainNodeName]) {
          unresolvedNodeNames.push(chainNodeName);
        }
      }
    }

    if (unresolvedNodeNames.length > 0) {
      const uniqueUnresolved = [...new Set(unresolvedNodeNames)];
      const definedNodeNames = Object.keys(config.nodes);
      return (
        `Track nodeChain references undefined nodes: [${uniqueUnresolved.join(", ")}]. ` +
        `Each name must have a matching entry in the 'nodes' object. ` +
        `Defined nodes: [${definedNodeNames.length > 0 ? definedNodeNames.join(", ") : "(none)"}].`
      );
    }
  }

  return null;
}
