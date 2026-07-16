import { describe, it, expect } from "vitest";
import {
  parseSpotifyId,
  toSpotifyUri,
  mapTrack,
  mapArtist,
  mapAlbum,
  mapPlaylist,
} from "../SpotifyFetcher.ts";

// ─── parseSpotifyId ────────────────────────────────────────────────

describe("parseSpotifyId", () => {
  it("parses spotify: URIs", () => {
    expect(parseSpotifyId("spotify:track:4uLU6hMCjMI75M1A2tKUQC")).toEqual({
      type: "track",
      id: "4uLU6hMCjMI75M1A2tKUQC",
    });
    expect(parseSpotifyId("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toEqual({
      type: "playlist",
      id: "37i9dQZF1DXcBWIGoYBM5M",
    });
  });

  it("parses open.spotify.com URLs, including intl paths and query strings", () => {
    expect(
      parseSpotifyId("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123"),
    ).toEqual({ type: "track", id: "4uLU6hMCjMI75M1A2tKUQC" });
    expect(
      parseSpotifyId("https://open.spotify.com/intl-fr/artist/1dfeR4HaWDbWqFHLkxsg1d"),
    ).toEqual({ type: "artist", id: "1dfeR4HaWDbWqFHLkxsg1d" });
  });

  it("accepts bare IDs with a fallback type", () => {
    expect(parseSpotifyId("4uLU6hMCjMI75M1A2tKUQC", "track")).toEqual({
      type: "track",
      id: "4uLU6hMCjMI75M1A2tKUQC",
    });
    expect(parseSpotifyId("4uLU6hMCjMI75M1A2tKUQC")).toEqual({
      type: null,
      id: "4uLU6hMCjMI75M1A2tKUQC",
    });
  });

  it("rejects garbage, unknown types, and empty input", () => {
    expect(parseSpotifyId("")).toBeNull();
    expect(parseSpotifyId("   ")).toBeNull();
    expect(parseSpotifyId("not a spotify id at all")).toBeNull();
    expect(parseSpotifyId("spotify:banana:4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
    expect(parseSpotifyId("https://open.spotify.com/banana/4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
  });
});

// ─── toSpotifyUri ──────────────────────────────────────────────────

describe("toSpotifyUri", () => {
  it("normalizes URL, URI, and bare ID to a URI", () => {
    const expected = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";
    expect(toSpotifyUri("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "track")).toBe(expected);
    expect(toSpotifyUri("spotify:track:4uLU6hMCjMI75M1A2tKUQC", "album")).toBe(expected);
    expect(toSpotifyUri("4uLU6hMCjMI75M1A2tKUQC", "track")).toBe(expected);
  });

  it("returns null for unparseable input", () => {
    expect(toSpotifyUri("???", "track")).toBeNull();
  });
});

// ─── Result mappers ────────────────────────────────────────────────

describe("result mappers", () => {
  it("maps a raw track, tolerating missing optional fields", () => {
    const track = mapTrack({
      id: "t1",
      uri: "spotify:track:t1",
      name: "Song",
      artists: [{ name: "Artist A" }, { name: "Artist B" }],
      album: { name: "Album", release_date: "2020-01-01", images: [{ url: "http://img" }] },
      duration_ms: 123000,
      popularity: 55,
      external_urls: { spotify: "http://open" },
    });
    expect(track).toMatchObject({
      id: "t1",
      name: "Song",
      artists: ["Artist A", "Artist B"],
      album: "Album",
      durationMs: 123000,
      popularity: 55,
      url: "http://open",
      imageUrl: "http://img",
    });
  });

  it("returns null for null/undefined inputs (Spotify pads pages with nulls)", () => {
    expect(mapTrack(null)).toBeNull();
    expect(mapArtist(undefined)).toBeNull();
    expect(mapAlbum(null)).toBeNull();
    expect(mapPlaylist(null)).toBeNull();
  });

  it("maps artists and playlists with sensible fallbacks", () => {
    const artist = mapArtist({ id: "a1", name: "Artist", followers: { total: 10 } });
    expect(artist).toMatchObject({ id: "a1", name: "Artist", followers: 10, genres: [] });

    const playlist = mapPlaylist({
      id: "p1",
      name: "Mix",
      owner: { id: "owner-id" },
      tracks: { total: 42 },
    });
    expect(playlist).toMatchObject({ id: "p1", owner: "owner-id", totalTracks: 42 });
  });
});
