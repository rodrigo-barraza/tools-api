const SUPPORTED_OPERATION_TYPES = new Set([
  "pitch_shift",
  "tempo",
  "speed",
  "reverb",
  "echo",
  "lowpass",
  "highpass",
  "bandpass",
  "equalizer",
  "bass_boost",
  "treble_boost",
  "distortion",
  "chorus",
  "flanger",
  "phaser",
  "tremolo",
  "vibrato",
  "compressor",
  "normalize",
  "reverse",
  "fade_in",
  "fade_out",
  "trim",
  "volume",
  "stereo_pan",
  "bitcrush",
  "crystalizer",
]);

const SUPPORTED_PRESETS = new Set([
  "chipmunk",
  "demon_voice",
  "nightcore",
  "vaporwave",
  "slowed_reverb",
  "underwater",
  "radio",
  "telephone",
  "robot",
  "cave",
  "vinyl",
  "megaphone",
]);

const SUPPORTED_OUTPUT_FORMATS = new Set(["wav", "mp3", "ogg", "opus"]);

interface AudioRemixValidationInput {
  input?: string;
  operations?: Array<Record<string, unknown>>;
  preset?: string;
  outputFormat?: string;
  sampleRate?: number;
}

export function validateAudioRemixInput(
  validationInput: AudioRemixValidationInput,
): string | null {
  const { input, operations, preset, outputFormat, sampleRate } = validationInput;

  if (!input || typeof input !== "string" || input.trim().length === 0) {
    return "Missing required parameter: 'input' (URL, base64 data URI, or file path)";
  }

  const trimmedInput = input.trim();
  const isValidInputSource =
    trimmedInput.startsWith("http://") ||
    trimmedInput.startsWith("https://") ||
    trimmedInput.startsWith("data:") ||
    trimmedInput.startsWith("/");

  if (!isValidInputSource) {
    return "Invalid 'input': must be a URL (http/https), base64 data URI (data:audio/...), or absolute file path";
  }

  if (preset !== undefined && preset !== null) {
    if (typeof preset !== "string" || !SUPPORTED_PRESETS.has(preset)) {
      return `Invalid preset '${preset}'. Supported presets: ${[...SUPPORTED_PRESETS].join(", ")}`;
    }
  }

  if (outputFormat !== undefined && outputFormat !== null) {
    if (typeof outputFormat !== "string" || !SUPPORTED_OUTPUT_FORMATS.has(outputFormat)) {
      return `Invalid outputFormat '${outputFormat}'. Supported formats: ${[...SUPPORTED_OUTPUT_FORMATS].join(", ")}`;
    }
  }

  if (sampleRate !== undefined && sampleRate !== null) {
    const numericSampleRate = Number(sampleRate);
    if (isNaN(numericSampleRate) || numericSampleRate < 8000 || numericSampleRate > 48000) {
      return "Invalid sampleRate: must be between 8000 and 48000 Hz";
    }
  }

  if (operations !== undefined && operations !== null) {
    if (!Array.isArray(operations)) {
      return "'operations' must be an array of effect objects";
    }

    for (let index = 0; index < operations.length; index++) {
      const operation = operations[index];
      const operationLabel = `operations[${index}]`;

      if (!operation || typeof operation !== "object") {
        return `${operationLabel}: must be an object with at least a 'type' property`;
      }

      const operationType = operation.type as string | undefined;
      if (!operationType || typeof operationType !== "string") {
        return `${operationLabel}: missing required 'type' property`;
      }

      if (!SUPPORTED_OPERATION_TYPES.has(operationType)) {
        return `${operationLabel}: unknown operation type '${operationType}'. Supported: ${[...SUPPORTED_OPERATION_TYPES].join(", ")}`;
      }

      const operationError = validateOperationParameters(operationType, operation, operationLabel);
      if (operationError) {
        return operationError;
      }
    }
  }

  return null;
}

function validateOperationParameters(
  operationType: string,
  operation: Record<string, unknown>,
  label: string,
): string | null {
  switch (operationType) {
    case "pitch_shift": {
      const semitones = operation.semitones as number | undefined;
      if (semitones !== undefined && (typeof semitones !== "number" || semitones < -24 || semitones > 24)) {
        return `${label}: 'semitones' must be between -24 and 24`;
      }
      break;
    }

    case "tempo":
    case "speed": {
      const factor = operation.factor as number | undefined;
      if (factor !== undefined && (typeof factor !== "number" || factor < 0.25 || factor > 4.0)) {
        return `${label}: 'factor' must be between 0.25 and 4.0`;
      }
      break;
    }

    case "reverb": {
      const delay = operation.delay as number | undefined;
      if (delay !== undefined && (typeof delay !== "number" || delay < 1 || delay > 500)) {
        return `${label}: 'delay' must be between 1 and 500 ms`;
      }
      const decay = operation.decay as number | undefined;
      if (decay !== undefined && (typeof decay !== "number" || decay < 0 || decay > 0.9)) {
        return `${label}: 'decay' must be between 0.0 and 0.9`;
      }
      break;
    }

    case "echo": {
      const delays = operation.delays as number[] | undefined;
      const decays = operation.decays as number[] | undefined;
      if (delays !== undefined && !Array.isArray(delays)) {
        return `${label}: 'delays' must be an array of numbers`;
      }
      if (decays !== undefined && !Array.isArray(decays)) {
        return `${label}: 'decays' must be an array of numbers`;
      }
      if (delays && decays && delays.length !== decays.length) {
        return `${label}: 'delays' and 'decays' arrays must have the same length`;
      }
      if (decays) {
        for (const decayValue of decays) {
          if (typeof decayValue !== "number" || decayValue < 0 || decayValue > 0.9) {
            return `${label}: each 'decays' value must be between 0.0 and 0.9`;
          }
        }
      }
      break;
    }

    case "lowpass":
    case "highpass": {
      const frequency = operation.frequency as number | undefined;
      if (frequency !== undefined && (typeof frequency !== "number" || frequency < 20 || frequency > 20000)) {
        return `${label}: 'frequency' must be between 20 and 20000 Hz`;
      }
      break;
    }

    case "bandpass":
    case "equalizer": {
      const frequency = operation.frequency as number | undefined;
      if (frequency !== undefined && (typeof frequency !== "number" || frequency < 20 || frequency > 20000)) {
        return `${label}: 'frequency' must be between 20 and 20000 Hz`;
      }
      const width = operation.width as number | undefined;
      if (width !== undefined && (typeof width !== "number" || width < 1 || width > 10000)) {
        return `${label}: 'width' must be between 1 and 10000 Hz`;
      }
      if (operationType === "equalizer") {
        const gain = operation.gain as number | undefined;
        if (gain !== undefined && (typeof gain !== "number" || gain < -20 || gain > 20)) {
          return `${label}: 'gain' must be between -20 and 20 dB`;
        }
      }
      break;
    }

    case "bass_boost":
    case "treble_boost": {
      const gain = operation.gain as number | undefined;
      if (gain !== undefined && (typeof gain !== "number" || gain < -20 || gain > 20)) {
        return `${label}: 'gain' must be between -20 and 20 dB`;
      }
      break;
    }

    case "distortion": {
      const gain = operation.gain as number | undefined;
      if (gain !== undefined && (typeof gain !== "number" || gain < 0 || gain > 100)) {
        return `${label}: 'gain' must be between 0 and 100`;
      }
      const color = operation.color as number | undefined;
      if (color !== undefined && (typeof color !== "number" || color < 0 || color > 100)) {
        return `${label}: 'color' must be between 0 and 100`;
      }
      break;
    }

    case "tremolo":
    case "vibrato": {
      const frequency = operation.frequency as number | undefined;
      if (frequency !== undefined && (typeof frequency !== "number" || frequency < 0.1 || frequency > 20000)) {
        return `${label}: 'frequency' must be between 0.1 and 20000 Hz`;
      }
      const depth = operation.depth as number | undefined;
      if (depth !== undefined && (typeof depth !== "number" || depth < 0 || depth > 1)) {
        return `${label}: 'depth' must be between 0.0 and 1.0`;
      }
      break;
    }

    case "volume": {
      const level = operation.level as number | undefined;
      if (level !== undefined && (typeof level !== "number" || level < 0 || level > 3.0)) {
        return `${label}: 'level' must be between 0.0 and 3.0`;
      }
      break;
    }

    case "fade_in":
    case "fade_out": {
      const duration = operation.duration as number | undefined;
      if (duration !== undefined && (typeof duration !== "number" || duration < 0.01 || duration > 60)) {
        return `${label}: 'duration' must be between 0.01 and 60 seconds`;
      }
      break;
    }

    case "trim": {
      const start = operation.start as number | undefined;
      const end = operation.end as number | undefined;
      if (start !== undefined && (typeof start !== "number" || start < 0)) {
        return `${label}: 'start' must be >= 0`;
      }
      if (end !== undefined && (typeof end !== "number" || end < 0)) {
        return `${label}: 'end' must be >= 0`;
      }
      if (start !== undefined && end !== undefined && start >= end) {
        return `${label}: 'start' must be less than 'end'`;
      }
      break;
    }

    case "stereo_pan": {
      const pan = operation.pan as number | undefined;
      if (pan !== undefined && (typeof pan !== "number" || pan < -1 || pan > 1)) {
        return `${label}: 'pan' must be between -1.0 (left) and 1.0 (right)`;
      }
      break;
    }

    case "bitcrush": {
      const bits = operation.bits as number | undefined;
      if (bits !== undefined && (typeof bits !== "number" || bits < 1 || bits > 16)) {
        return `${label}: 'bits' must be between 1 and 16`;
      }
      const crushSampleRate = operation.sampleRate as number | undefined;
      if (crushSampleRate !== undefined && (typeof crushSampleRate !== "number" || crushSampleRate < 100 || crushSampleRate > 48000)) {
        return `${label}: 'sampleRate' must be between 100 and 48000`;
      }
      break;
    }

    case "crystalizer": {
      const intensity = operation.intensity as number | undefined;
      if (intensity !== undefined && (typeof intensity !== "number" || intensity < -10 || intensity > 10)) {
        return `${label}: 'intensity' must be between -10 and 10`;
      }
      break;
    }
  }

  return null;
}
