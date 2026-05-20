// ─── Music Metadata API Client ──────────────────────────────

import { formatMediaTimestamp } from "@rodrigo-barraza/utilities-library";

const BASE_URL = "https://musicbrainz.org/ws/2";
const USER_AGENT = "SunToolsService/1.0 (rodrigo@rod.dev)";

// Cover art from Cover Art Archive (free, no auth)
const COVER_ART_BASE = "https://coverartarchive.org";

async function fetchMB(path: any, params: Record<string, any> = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("fmt", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MusicBrainz API error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

// ── Artist Search ──────────────────────────────────────────────

/**
 * Search for artists by name.
 */
export async function searchArtists(query: any, limit: any = 10) {
  const data = await fetchMB("/artist", { query, limit });
  return {
    count: data.count,
    artists: (data.artists || []).map((a: any) => ({
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
        .sort((x: any, y: any) => (y.count || 0) - (x.count || 0))
        .slice(0, 10)
        .map((t: any) => t.name),
      score: a.score,
    })),
  };
}

// ── Artist Details ─────────────────────────────────────────────

/**
 * Get detailed artist info by MusicBrainz ID (MBID).
 */
export async function getArtist(mbid: any) {
  const a = await fetchMB(`/artist/${mbid}`, {
    inc: "url-rels+release-groups+tags",
  });

  // Extract useful URLs
  const urls: Record<string, any> = {};
  for (const rel of a.relations || []) {
    if (rel.type === "wikipedia") urls.wikipedia = rel.url?.resource;
    if (rel.type === "wikidata") urls.wikidata = rel.url?.resource;
    if (rel.type === "official homepage") urls.website = rel.url?.resource;
    if (rel.type === "social network") {
      const u = rel.url?.resource || "";
      if (u.includes("twitter.com") || u.includes("x.com")) urls.twitter = u;
      if (u.includes("instagram.com")) urls.instagram = u;
      if (u.includes("facebook.com")) urls.facebook = u;
    }
    if (rel.type === "streaming music" || rel.type === "free streaming") {
      const u = rel.url?.resource || "";
      if (u.includes("spotify.com")) urls.spotify = u;
      if (u.includes("music.apple.com")) urls.appleMusic = u;
      if (u.includes("soundcloud.com")) urls.soundcloud = u;
    }
  }

  // Group release groups by type
  const releaseGroups = (a["release-groups"] || []).map((rg: any) => ({
    id: rg.id,
    title: rg.title,
    type: rg["primary-type"] || "Other",
    firstReleaseDate: rg["first-release-date"] || null,
  }));

  const byType: Record<string, any> = {};
  for (const rg of releaseGroups) {
    const type = rg.type;
    if (!byType[type]) byType[type] = [];
    byType[type].push(rg);
  }
  // Sort each type by date
  for (const type of Object.keys(byType)) {
    byType[type].sort((a: any, b: any) => (a.firstReleaseDate || "").localeCompare(b.firstReleaseDate || ""));
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
      .sort((x: any, y: any) => (y.count || 0) - (x.count || 0))
      .slice(0, 15)
      .map((t: any) => t.name),
    urls,
    discography: byType,
    totalReleaseGroups: releaseGroups.length,
  };
}

// ── Album / Release Group ──────────────────────────────────────

/**
 * Search for albums/releases by title.
 */
export async function searchAlbums(query: any, artist: any, limit: any = 10) {
  const searchQuery = artist ? `${query} AND artist:${artist}` : query;
  const data = await fetchMB("/release-group", { query: searchQuery, limit });
  return {
    count: data.count,
    albums: (data["release-groups"] || []).map((rg: any) => ({
      id: rg.id,
      title: rg.title,
      type: rg["primary-type"] || "Other",
      firstReleaseDate: rg["first-release-date"] || null,
      artists: (rg["artist-credit"] || []).map((ac: any) => ({
        id: ac.artist?.id,
        name: ac.artist?.name,
      })),
      coverArtUrl: `${COVER_ART_BASE}/release-group/${rg.id}/front-250`,
      score: rg.score,
    })),
  };
}

/**
 * Get album details by release-group MBID.
 */
export async function getAlbum(mbid: any) {
  const rg = await fetchMB(`/release-group/${mbid}`, {
    inc: "releases+artist-credits+tags",
  });

  // Get the first release's tracklist
  let tracks: any[] = [];
  if (rg.releases?.[0]) {
    try {
      const release = await fetchMB(`/release/${rg.releases[0].id}`, {
        inc: "recordings",
      });
      tracks = (release.media || []).flatMap((m: any) =>
        (m.tracks || []).map((t: any) => ({
          position: t.position,
          title: t.title,
          durationMs: t.length || null,
          duration: t.length ? formatMediaTimestamp(Math.round(t.length / 1000)) : null,
        })),
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
    artists: (rg["artist-credit"] || []).map((ac: any) => ({
      id: ac.artist?.id,
      name: ac.artist?.name,
    })),
    tags: (rg.tags || [])
      .sort((x: any, y: any) => (y.count || 0) - (x.count || 0))
      .slice(0, 10)
      .map((t: any) => t.name),
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
export async function searchTracks(query: any, artist: any, limit: any = 10) {
  const searchQuery = artist ? `${query} AND artist:${artist}` : query;
  const data = await fetchMB("/recording", { query: searchQuery, limit });
  return {
    count: data.count,
    tracks: (data.recordings || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      durationMs: r.length || null,
      duration: r.length ? formatMediaTimestamp(Math.round(r.length / 1000)) : null,
      artists: (r["artist-credit"] || []).map((ac: any) => ({
        id: ac.artist?.id,
        name: ac.artist?.name,
      })),
      releases: (r.releases || []).slice(0, 3).map((rel: any) => ({
        id: rel.id,
        title: rel.title,
        date: rel.date || null,
      })),
      score: r.score,
    })),
  };
}
