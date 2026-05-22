// ─── Music Metadata API Client ──────────────────────────────

import { formatMediaTimestamp } from "@rodrigo-barraza/utilities-library";
import { MusicArtist, MusicAlbum, MusicTrack } from "../../types/knowledge.ts";

const BASE_URL = "https://musicbrainz.org/ws/2";
const USER_AGENT = "SunToolsService/1.0 (rodrigo@rod.dev)";

// Cover art from Cover Art Archive (free, no auth)
const COVER_ART_BASE = "https://coverartarchive.org";

// ─── Raw API Structures ──────────────────────────────────────────

interface RawLifeSpan {
  begin?: string | null;
  end?: string | null;
  ended?: boolean;
}

interface RawTag {
  count?: number;
  name: string;
}

interface RawRelation {
  type: string;
  url?: {
    resource: string;
  } | null;
}

interface RawArtistCredit {
  artist?: {
    id: string;
    name: string;
  } | null;
}

interface RawRelease {
  id: string;
  title: string;
  date?: string | null;
}

interface RawTrack {
  position: number;
  title: string;
  length?: number | null;
}

interface RawMedia {
  tracks?: RawTrack[] | null;
}

interface RawReleaseDetail {
  media?: RawMedia[] | null;
}

interface RawMusicArtist {
  id: string;
  name: string;
  "sort-name": string;
  type: string;
  country: string;
  disambiguation?: string | null;
  "life-span"?: RawLifeSpan | null;
  relations?: RawRelation[] | null;
  "release-groups"?: Array<{
    id: string;
    title: string;
    "primary-type"?: string | null;
    "first-release-date"?: string | null;
  }> | null;
  tags?: RawTag[] | null;
  score?: number;
  gender?: string | null;
}

interface RawReleaseGroup {
  id: string;
  title: string;
  "primary-type"?: string | null;
  "secondary-types"?: string[] | null;
  "first-release-date"?: string | null;
  "artist-credit"?: RawArtistCredit[] | null;
  score?: number;
  releases?: RawRelease[] | null;
  tags?: RawTag[] | null;
}

interface RawRecording {
  id: string;
  title: string;
  length?: number | null;
  "artist-credit"?: RawArtistCredit[] | null;
  releases?: RawRelease[] | null;
  score?: number;
}

export interface ReleaseGroupItem {
  id: string;
  title: string;
  type: string;
  firstReleaseDate: string | null;
}

async function fetchMB<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined | null> = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("fmt", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MusicBrainz API error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

// ── Artist Search ──────────────────────────────────────────────

/**
 * Search for artists by name.
 */
export async function searchArtists(query: string, limit: number = 10) {
  const data = await fetchMB<{ count: number; artists?: RawMusicArtist[] }>("/artist", {
    query,
    limit,
  });
  return {
    count: data.count,
    artists: (data.artists || []).map(
      (a): MusicArtist => ({
        id: a.id,
        name: a.name,
        sortName: a["sort-name"],
        type: a.type,
        country: a.country,
        disambiguation: a.disambiguation || null,
        beginDate: a["life-span"]?.begin || null,
        endDate: a["life-span"]?.end || null,
        ended: a["life-span"]?.ended || false,
        tags: (a.tags || [])
          .sort((x, y) => (y.count || 0) - (x.count || 0))
          .slice(0, 10)
          .map((t) => t.name),
        score: a.score,
      }),
    ),
  };
}

// ── Artist Details ─────────────────────────────────────────────

/**
 * Get detailed artist info by MusicBrainz ID (MBID).
 */
export async function getArtist(mbid: string) {
  const a = await fetchMB<RawMusicArtist>(`/artist/${mbid}`, {
    inc: "url-rels+release-groups+tags",
  });

  // Extract useful URLs
  const urls: Record<string, string> = {};
  for (const rel of a.relations || []) {
    if (rel.type === "wikipedia" && rel.url?.resource) urls.wikipedia = rel.url.resource;
    if (rel.type === "wikidata" && rel.url?.resource) urls.wikidata = rel.url.resource;
    if (rel.type === "official homepage" && rel.url?.resource) urls.website = rel.url.resource;
    if (rel.type === "social network" && rel.url?.resource) {
      const u = rel.url.resource;
      if (u.includes("twitter.com") || u.includes("x.com")) urls.twitter = u;
      if (u.includes("instagram.com")) urls.instagram = u;
      if (u.includes("facebook.com")) urls.facebook = u;
    }
    if ((rel.type === "streaming music" || rel.type === "free streaming") && rel.url?.resource) {
      const u = rel.url.resource;
      if (u.includes("spotify.com")) urls.spotify = u;
      if (u.includes("music.apple.com")) urls.appleMusic = u;
      if (u.includes("soundcloud.com")) urls.soundcloud = u;
    }
  }

  // Group release groups by type
  const releaseGroups: ReleaseGroupItem[] = (a["release-groups"] || []).map((rg) => ({
    id: rg.id,
    title: rg.title,
    type: rg["primary-type"] || "Other",
    firstReleaseDate: rg["first-release-date"] || null,
  }));

  const byType: Record<string, ReleaseGroupItem[]> = {};
  for (const rg of releaseGroups) {
    const type = rg.type;
    if (!byType[type]) byType[type] = [];
    byType[type].push(rg);
  }
  // Sort each type by date
  for (const type of Object.keys(byType)) {
    byType[type].sort((x, y) => (x.firstReleaseDate || "").localeCompare(y.firstReleaseDate || ""));
  }

  return {
    id: a.id,
    name: a.name,
    sortName: a["sort-name"],
    type: a.type,
    country: a.country,
    disambiguation: a.disambiguation || null,
    beginDate: a["life-span"]?.begin || null,
    endDate: a["life-span"]?.end || null,
    ended: a["life-span"]?.ended || false,
    gender: a.gender || null,
    tags: (a.tags || [])
      .sort((x, y) => (y.count || 0) - (x.count || 0))
      .slice(0, 15)
      .map((t) => t.name),
    urls,
    discography: byType,
    totalReleaseGroups: releaseGroups.length,
  };
}

// ── Album / Release Group ──────────────────────────────────────

/**
 * Search for albums/releases by title.
 */
export async function searchAlbums(query: string, artist?: string, limit: number = 10) {
  const searchQuery = artist ? `${query} AND artist:${artist}` : query;
  const data = await fetchMB<{ count: number; "release-groups"?: RawReleaseGroup[] }>(
    "/release-group",
    { query: searchQuery, limit },
  );
  return {
    count: data.count,
    albums: (data["release-groups"] || []).map(
      (rg): MusicAlbum => ({
        id: rg.id,
        title: rg.title,
        type: rg["primary-type"] || "Other",
        firstReleaseDate: rg["first-release-date"] || null,
        artists: (rg["artist-credit"] || []).map((ac) => ({
          id: ac.artist?.id || "",
          name: ac.artist?.name || "",
        })),
        coverArtUrl: `${COVER_ART_BASE}/release-group/${rg.id}/front-250`,
        score: rg.score,
      }),
    ),
  };
}

/**
 * Get album details by release-group MBID.
 */
export async function getAlbum(mbid: string) {
  const rg = await fetchMB<RawReleaseGroup>(`/release-group/${mbid}`, {
    inc: "releases+artist-credits+tags",
  });

  // Get the first release's tracklist
  let tracks: MusicTrack[] = [];
  if (rg.releases?.[0]) {
    try {
      const release = await fetchMB<RawReleaseDetail>(`/release/${rg.releases[0].id}`, {
        inc: "recordings",
      });
      tracks = (release.media || []).flatMap((m) =>
        (m.tracks || []).map(
          (t): MusicTrack => ({
            position: t.position,
            title: t.title,
            durationMs: t.length || null,
            duration: t.length ? formatMediaTimestamp(Math.round(t.length / 1000)) : null,
          }),
        ),
      );
    } catch {
      // Track fetch can fail — continue without it
    }
  }

  return {
    id: rg.id,
    title: rg.title,
    type: rg["primary-type"] || "Other",
    secondaryTypes: rg["secondary-types"] || [],
    firstReleaseDate: rg["first-release-date"] || null,
    artists: (rg["artist-credit"] || []).map((ac) => ({
      id: ac.artist?.id || "",
      name: ac.artist?.name || "",
    })),
    tags: (rg.tags || [])
      .sort((x, y) => (y.count || 0) - (x.count || 0))
      .slice(0, 10)
      .map((t) => t.name),
    coverArtUrl: `${COVER_ART_BASE}/release-group/${rg.id}/front-500`,
    releaseCount: rg.releases?.length || 0,
    tracks,
    trackCount: tracks.length,
  };
}

// ── Recording / Track Search ───────────────────────────────────

/**
 * Search for tracks/recordings by title.
 */
export async function searchTracks(query: string, artist?: string, limit: number = 10) {
  const searchQuery = artist ? `${query} AND artist:${artist}` : query;
  const data = await fetchMB<{ count: number; recordings?: RawRecording[] }>("/recording", {
    query: searchQuery,
    limit,
  });
  return {
    count: data.count,
    tracks: (data.recordings || []).map(
      (r): MusicTrack => ({
        id: r.id,
        title: r.title,
        durationMs: r.length || null,
        duration: r.length ? formatMediaTimestamp(Math.round(r.length / 1000)) : null,
        artists: (r["artist-credit"] || []).map((ac) => ({
          id: ac.artist?.id || "",
          name: ac.artist?.name || "",
        })),
        releases: (r.releases || []).slice(0, 3).map((rel) => ({
          id: rel.id,
          title: rel.title,
          date: rel.date || null,
        })),
        score: r.score,
      }),
    ),
  };
}
