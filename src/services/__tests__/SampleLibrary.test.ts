import { describe, it, expect, afterEach } from "vitest";
import {
  SAMPLE_PRESETS,
  listSamplePresets,
  isSamplePresetRef,
  resolveSamplePreset,
} from "../SampleLibraryService.ts";
import {
  createTrackerSession,
  addTrackerChannel,
  writeTrackerPattern,
  toSynthesizerConfig,
  deleteTrackerSession,
} from "../AudioTrackerSessionManager.ts";

const createdSessions: string[] = [];

afterEach(() => {
  while (createdSessions.length > 0) {
    deleteTrackerSession(createdSessions.pop()!);
  }
});

describe("sample preset library", () => {
  it("decodes every preset in the manifest to non-silent PCM", async () => {
    for (const presetName of listSamplePresets()) {
      const sample = await resolveSamplePreset(`preset:${presetName}`, 44100);
      expect(sample.durationSeconds).toBeGreaterThan(0.05);
      expect(sample.rootNote).toBe(SAMPLE_PRESETS[presetName].rootNote);
      expect(sample.sourceLabel).toBe(`preset:${presetName}`);
      let peak = 0;
      for (const value of sample.pcm) peak = Math.max(peak, Math.abs(value));
      expect(peak).toBeGreaterThan(0.3);
    }
  }, 30_000);

  it("caches decoded presets per sample rate", async () => {
    const first = await resolveSamplePreset("preset:kick", 44100);
    const second = await resolveSamplePreset("preset:kick", 44100);
    expect(second).toBe(first);

    const resampled = await resolveSamplePreset("preset:kick", 22050);
    expect(resampled).not.toBe(first);
    // Half the rate → roughly half the samples for the same duration
    expect(resampled.pcm.length).toBeLessThan(first.pcm.length * 0.6);
  });

  it("recognizes preset refs case-insensitively and rejects unknown names with the list", async () => {
    expect(isSamplePresetRef("preset:kick")).toBe(true);
    expect(isSamplePresetRef(" Preset:BELL ")).toBe(true);
    expect(isSamplePresetRef("https://example.com/a.wav")).toBe(false);

    await expect(resolveSamplePreset("preset:banjo", 44100)).rejects.toThrow(
      /Valid presets: .*guitar_pluck/,
    );
  });

  it("flows into a tracker channel with the preset's natural root note", async () => {
    const session = createTrackerSession();
    createdSessions.push(session.sessionId);

    const sample = await resolveSamplePreset("preset:guitar_pluck", session.sampleRate);
    const added = addTrackerChannel(session.sessionId, {
      channelId: "gtr",
      sample: { ...sample },
    });
    expect(added.success).toBe(true);

    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "gtr",
      rows: [{ note: "C3" }, { note: "E3" }, { note: "G3" }],
    });

    const { config } = toSynthesizerConfig(session.sessionId);
    expect(config!.nodes!["gtr_sampler"]).toMatchObject({
      type: "sampler",
      rootNote: "C3",
    });
    expect(config!.nodes!["gtr_sampler"].samplePcm!.length).toBeGreaterThan(1000);
  });
});
