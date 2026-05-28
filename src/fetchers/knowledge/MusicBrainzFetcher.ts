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
    throw new Error(
      `MusicBrainz API error ${response.status}: ${text.slice(0, 200)}`,
    );
  }
  return response.json() as Promise<T>;
}

// ── Artist Search ──────────────────────────────────────────────

/**
 * Search for artists by name.
 */
export async function searchArtists(query: string, limit: number = 10) {
  const data = await fetchMB<{ count: number; artists?: RawMusicArtist[] }>(
    "/artist",
    {
      query,
      limit,
    },
  );
  return {
    count: data.count,
    artists: (data.artists || []).map(
      (artist): MusicArtist => ({
        id: artist.id,
        name: artist.name,
        sortName: artist["sort-name"],
        type: artist.type,
        country: artist.country,
        disambiguation: artist.disambiguation || null,
        beginDate: artist["life-span"]?.begin || null,
        endDate: artist["life-span"]?.end || null,
        ended: artist["life-span"]?.ended || false,
        tags: (artist.tags || [])
          .sort((x, y) => (y.count || 0) - (x.count || 0))
          .slice(0, 10)
          .map((tag) => tag.name),
        score: artist.score,
      }),
    ),
  };
}

// ── Artist Details ─────────────────────────────────────────────

/**
 * Get detailed artist info by MusicBrainz ID (MBID).
 */
export async function getArtist(mbid: string) {
  const artistData = await fetchMB<RawMusicArtist>(`/artist/${mbid}`, {
    inc: "url-rels+release-groups+tags",
  });

  // Extract useful URLs
  const urls: Record<string, string> = {};
  for (const relation of artistData.relations || []) {
    if (relation.type === "wikipedia" && relation.url?.resource)
      urls.wikipedia = relation.url.resource;
    if (relation.type === "wikidata" && relation.url?.resource)
      urls.wikidata = relation.url.resource;
    if (relation.type === "official homepage" && relation.url?.resource)
      urls.website = relation.url.resource;
    if (relation.type === "social network" && relation.url?.resource) {
      const socialUrl = relation.url.resource;
      if (socialUrl.includes("twitter.com") || socialUrl.includes("x.com"))
        urls.twitter = socialUrl;
      if (socialUrl.includes("instagram.com")) urls.instagram = socialUrl;
      if (socialUrl.includes("facebook.com")) urls.facebook = socialUrl;
    }
    if (
      (relation.type === "streaming music" ||
        relation.type === "free streaming") &&
      relation.url?.resource
    ) {
      const streamingUrl = relation.url.resource;
      if (streamingUrl.includes("spotify.com")) urls.spotify = streamingUrl;
      if (streamingUrl.includes("music.apple.com"))
        urls.appleMusic = streamingUrl;
      if (streamingUrl.includes("soundcloud.com"))
        urls.soundcloud = streamingUrl;
    }
  }

  // Group release groups by type
  const releaseGroups: ReleaseGroupItem[] = (
    artistData["release-groups"] || []
  ).map((releaseGroup) => ({
    id: releaseGroup.id,
    title: releaseGroup.title,
    type: releaseGroup["primary-type"] || "Other",
    firstReleaseDate: releaseGroup["first-release-date"] || null,
  }));

  const byType: Record<string, ReleaseGroupItem[]> = {};
  for (const releaseGroup of releaseGroups) {
    const type = releaseGroup.type;
    if (!byType[type]) byType[type] = [];
    byType[type].push(releaseGroup);
  }
  // Sort each type by date
  for (const type of Object.keys(byType)) {
    byType[type].sort((x, y) =>
      (x.firstReleaseDate || "").localeCompare(y.firstReleaseDate || ""),
    );
  }

  return {
    id: artistData.id,
    name: artistData.name,
    sortName: artistData["sort-name"],
    type: artistData.type,
    country: artistData.country,
    disambiguation: artistData.disambiguation || null,
    beginDate: artistData["life-span"]?.begin || null,
    endDate: artistData["life-span"]?.end || null,
    ended: artistData["life-span"]?.ended || false,
    gender: artistData.gender || null,
    tags: (artistData.tags || [])
      .sort((x, y) => (y.count || 0) - (x.count || 0))
      .slice(0, 15)
      .map((tag) => tag.name),
    urls,
    discography: byType,
    totalReleaseGroups: releaseGroups.length,
  };
}

// ── Album / Release Group ──────────────────────────────────────

/**
 * Search for albums/releases by title.
 */
export async function searchAlbums(
  query: string,
  artist?: string,
  limit: number = 10,
) {
  const searchQuery = artist ? `${query} AND artist:${artist}` : query;
  const data = await fetchMB<{
    count: number;
    "release-groups"?: RawReleaseGroup[];
  }>("/release-group", { query: searchQuery, limit });
  return {
    count: data.count,
    albums: (data["release-groups"] || []).map(
      (releaseGroup): MusicAlbum => ({
        id: releaseGroup.id,
        title: releaseGroup.title,
        type: releaseGroup["primary-type"] || "Other",
        firstReleaseDate: releaseGroup["first-release-date"] || null,
        artists: (releaseGroup["artist-credit"] || []).map((artistCredit) => ({
          id: artistCredit.artist?.id || "",
          name: artistCredit.artist?.name || "",
        })),
        coverArtUrl: `${COVER_ART_BASE}/release-group/${releaseGroup.id}/front-250`,
        score: releaseGroup.score,
      }),
    ),
  };
}

/**
 * Get album details by release-group MBID.
 */
export async function getAlbum(mbid: string) {
  const releaseGroupData = await fetchMB<RawReleaseGroup>(
    `/release-group/${mbid}`,
    {
      inc: "releases+artist-credits+tags",
    },
  );

  // Get the first release's tracklist
  let tracks: MusicTrack[] = [];
  if (releaseGroupData.releases?.[0]) {
    try {
      const release = await fetchMB<RawReleaseDetail>(
        `/release/${releaseGroupData.releases[0].id}`,
        {
          inc: "recordings",
        },
      );
      tracks = (release.media || []).flatMap((media) =>
        (media.tracks || []).map(
          (track): MusicTrack => ({
            position: track.position,
            title: track.title,
            durationMs: track.length || null,
            duration: track.length
              ? formatMediaTimestamp(Math.round(track.length / 1000))
              : null,
          }),
        ),
      );
    } catch {
      // Track fetch can fail — continue without it
    }
  }

  return {
    id: releaseGroupData.id,
    title: releaseGroupData.title,
    type: releaseGroupData["primary-type"] || "Other",
    secondaryTypes: releaseGroupData["secondary-types"] || [],
    firstReleaseDate: releaseGroupData["first-release-date"] || null,
    artists: (releaseGroupData["artist-credit"] || []).map((artistCredit) => ({
      id: artistCredit.artist?.id || "",
      name: artistCredit.artist?.name || "",
    })),
    tags: (releaseGroupData.tags || [])
      .sort((x, y) => (y.count || 0) - (x.count || 0))
      .slice(0, 10)
      .map((tag) => tag.name),
    coverArtUrl: `${COVER_ART_BASE}/release-group/${releaseGroupData.id}/front-500`,
    releaseCount: releaseGroupData.releases?.length || 0,
    tracks,
    trackCount: tracks.length,
  };
}

// ── Recording / Track Search ───────────────────────────────────

/**
 * Search for tracks/recordings by title.
 */
export async function searchTracks(
  query: string,
  artist?: string,
  limit: number = 10,
) {
  const searchQuery = artist ? `${query} AND artist:${artist}` : query;
  const data = await fetchMB<{ count: number; recordings?: RawRecording[] }>(
    "/recording",
    {
      query: searchQuery,
      limit,
    },
  );
  return {
    count: data.count,
    tracks: (data.recordings || []).map(
      (recording): MusicTrack => ({
        id: recording.id,
        title: recording.title,
        durationMs: recording.length || null,
        duration: recording.length
          ? formatMediaTimestamp(Math.round(recording.length / 1000))
          : null,
        artists: (recording["artist-credit"] || []).map((artistCredit) => ({
          id: artistCredit.artist?.id || "",
          name: artistCredit.artist?.name || "",
        })),
        releases: (recording.releases || []).slice(0, 3).map((release) => ({
          id: release.id,
          title: release.title,
          date: release.date || null,
        })),
        score: recording.score,
      }),
    ),
  };
}
