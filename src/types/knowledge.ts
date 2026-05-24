/**
 * Knowledge Domain TypeScript Definitions
 */

// ─── TMDb Types ──────────────────────────────────────────────────

export interface MovieResult {
  tmdbId: number;
  title: string | null;
  originalTitle: string | null;
  tagline: string | null;
  overview: string | null;
  releaseDate: string | null;
  status: string | null;
  runtime: number | null;
  budget: number | null;
  revenue: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  originalLanguage: string | null;
  spokenLanguages: string[];
  productionCompanies: string[];
  productionCountries: string[];
  homepage: string | null;
  imdbId: string | null;
  url: string;
}

export interface TvShowResult {
  tmdbId: number;
  name: string | null;
  originalName: string | null;
  tagline: string | null;
  overview: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  status: string | null;
  type: string | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  episodeRuntime: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  networks: string[];
  productionCompanies: string[];
  createdBy: string[];
  originCountry: string[];
  originalLanguage: string | null;
  homepage: string | null;
  inProduction: boolean;
  url: string;
}

export interface CastMember {
  tmdbId: number;
  name: string;
  character: string | null;
  profileUrl: string | null;
  order: number | null;
  knownForDepartment: string | null;
}

export interface CrewMember {
  tmdbId: number;
  name: string;
  job: string | null;
  department: string | null;
  profileUrl: string | null;
}

export interface TvEpisode {
  episodeNumber: number;
  name: string;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
  voteAverage: number | null;
  stillUrl: string | null;
}

export interface TvSeason {
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  posterUrl: string | null;
  episodeCount: number;
  episodes: TvEpisode[];
}

// ─── Periodic Table Types ─────────────────────────────────────────

export interface PeriodicElement {
  atomic_number: number;
  symbol: string;
  name: string;
  atomic_mass: number;
  category: string;
  group_number: number | null;
  period: number;
  block: string;
  electron_configuration: string;
  electronegativity: number | null;
  density_g_cm3: number | null;
  molar_heat_j_mol_k: number | null;
  electron_affinity_kj_mol: number | null;
  first_ionization_energy_kj_mol: number | null;
  phase_at_stp: string;
  melting_point_k: number | null;
  boiling_point_k: number | null;
  appearance: string | null;
  discovered_by: string | null;
  cpk_hex_color: string | null;
  summary: string | null;
  [key: string]: string | number | null | undefined;
}

export interface FormattedElement {
  atomicNumber: number;
  symbol: string;
  name: string;
  atomicMass: number;
  category: string;
  groupNumber: number | null;
  period: number;
  block: string;
  electronConfiguration: string;
  electronegativity: number | null;
  density: number | null;
  molarHeat: number | null;
  electronAffinity: number | null;
  firstIonizationEnergy: number | null;
  phaseAtSTP: string;
  meltingPoint: number | null;
  boilingPoint: number | null;
  appearance: string | null;
  discoveredBy: string | null;
  cpkHexColor: string | null;
  summary: string | null;
}

// ─── NASA Exoplanet Archive Types ──────────────────────────────────

export interface ExoplanetRecord {
  pl_name: string;
  hostname: string;
  discoverymethod: string;
  disc_year: number;
  disc_facility: string;
  pl_orbper: number | null;
  pl_rade: number | null;
  pl_bmasse: number | null;
  pl_orbsmax: number | null;
  pl_orbeccen: number | null;
  pl_eqt: number | null;
  sy_vmag: number | null;
  st_mass: number | null;
  st_rad: number | null;
  st_teff: number | null;
  sy_dist: number | null;
  ra: number | null;
  dec: number | null;
  [key: string]: string | number | null | undefined;
}

export interface FormattedPlanet {
  name: string;
  hostStar: string;
  discoveryMethod: string;
  discoveryYear: number;
  discoveryFacility: string;
  orbitalPeriodDays: number | null;
  radiusEarth: number | null;
  massEarth: number | null;
  semiMajorAxisAU: number | null;
  eccentricity: number | null;
  equilibriumTempK: number | null;
  stellarMassSolar: number | null;
  stellarRadiusSolar: number | null;
  stellarTempK: number | null;
  distanceParsecs: number | null;
}

// ─── MusicBrainz Types ────────────────────────────────────────────

export interface MusicArtist {
  id: string;
  name: string;
  sortName: string;
  type: string;
  country: string;
  disambiguation: string | null;
  beginDate: string | null;
  endDate: string | null;
  ended: boolean;
  tags: string[];
  score?: number;
  gender?: string | null;
  urls?: Record<string, string>;
  discography?: Record<string, MusicAlbum[]>;
  totalReleaseGroups?: number;
}

export interface MusicAlbum {
  id: string;
  title: string;
  type: string;
  firstReleaseDate: string | null;
  artists: Array<{ id: string; name: string }>;
  coverArtUrl: string;
  score?: number;
  secondaryTypes?: string[];
  releaseCount?: number;
  tracks?: MusicTrack[];
  trackCount?: number;
  tags?: string[];
}

export interface MusicTrack {
  id?: string;
  position?: number;
  title: string;
  durationMs: number | null;
  duration: string | null;
  artists?: Array<{ id: string; name: string }>;
  releases?: Array<{ id: string; title: string; date: string | null }>;
  score?: number;
}

// ─── World Bank Types ─────────────────────────────────────────────

export interface WorldBankCountry {
  country_code: string;
  country_name: string;
  data_year: number;
  [key: string]: string | number | null | undefined;
}

export interface FormattedCountry {
  countryCode: string;
  countryName: string;
  dataYear: number;
  indicators: Record<
    string,
    {
      label: string;
      value: number;
      unit: string;
    }
  >;
}

// ─── Jikan Anime Types ────────────────────────────────────────────

export interface RawJikanAnime {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  images?: {
    jpg?: {
      large_image_url?: string | null;
      image_url?: string | null;
    } | null;
  } | null;
  trailer?: {
    url?: string | null;
  } | null;
  synopsis?: string | null;
  type?: string | null;
  source?: string | null;
  episodes?: number | null;
  status?: string | null;
  airing?: boolean;
  aired?: {
    string?: string | null;
  } | null;
  duration?: string | null;
  rating?: string | null;
  score?: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  season?: string | null;
  year?: number | null;
  studios?: Array<{ name: string }> | null;
  genres?: Array<{ name: string }> | null;
  themes?: Array<{ name: string }> | null;
}

export interface JikanAnime {
  malId: number | null;
  title: string | null;
  titleEnglish: string | null;
  titleJapanese: string | null;
  imageUrl: string | null;
  trailerUrl: string | null;
  synopsis: string | null;
  type: string | null;
  source: string | null;
  episodes: number | null;
  status: string | null;
  airing: boolean;
  airedString: string | null;
  duration: string | null;
  rating: string | null;
  score: number | null;
  scoredBy: number | null;
  rank: number | null;
  popularity: number | null;
  season: string | null;
  year: number | null;
  studios: string[];
  genres: string[];
  themes: string[];
}

// ─── Rest Countries Types ─────────────────────────────────────────

export interface RawRestCountryName {
  common?: string | null;
  official?: string | null;
  nativeName?: Record<string, { common?: string | null }> | null;
}

export interface RawRestCountryCurrency {
  name?: string | null;
  symbol?: string | null;
}

export interface RawRestCountry {
  name?: RawRestCountryName | null;
  cca2?: string | null;
  cca3?: string | null;
  capital?: string[] | null;
  region?: string | null;
  subregion?: string | null;
  population?: number;
  area?: number | null;
  languages?: Record<string, string> | null;
  currencies?: Record<string, RawRestCountryCurrency> | null;
  timezones?: string[] | null;
  borders?: string[] | null;
  flag?: string | null;
  flags?: {
    png?: string | null;
    svg?: string | null;
  } | null;
  coatOfArms?: {
    png?: string | null;
    svg?: string | null;
  } | null;
  maps?: {
    googleMaps?: string | null;
  } | null;
  idd?: {
    root?: string | null;
    suffixes?: string[] | null;
  } | null;
  continents?: string[] | null;
  independent?: boolean | null;
  unMember?: boolean | null;
  landlocked?: boolean | null;
  car?: {
    side?: string | null;
  } | null;
  startOfWeek?: string | null;
}

export interface RestCountry {
  name: string | null;
  officialName: string | null;
  nativeNames: string[];
  cca2: string | null;
  cca3: string | null;
  capital: string[];
  region: string | null;
  subregion: string | null;
  population: number;
  area: number | null;
  languages: string[];
  currencies: Array<{
    code: string;
    name: string;
    symbol?: string;
  }>;
  timezones: string[];
  borders: string[];
  flag: string | null;
  flagPng: string | null;
  flagSvg: string | null;
  coatOfArms: string | null;
  googleMaps: string | null;
  callingCodes: string[];
  continent: string | null;
  independent: boolean | null;
  unMember: boolean | null;
  landlocked: boolean | null;
  carSide: string | null;
  startOfWeek: string | null;
}

// ─── YouTube Types ────────────────────────────────────────────────

export interface YouTubeVideoInfo {
  videoId: string;
  url: string;
  title: string | null;
  author: string | null;
  authorUrl: string | null;
  channelId: string | null;
  description: string | null;
  publishDate: string | null;
  duration: string | null;
  genre: string | null;
  viewCount: number | null;
  isFamilyFriendly: boolean | null;
  keywords: string[] | null;
  thumbnailUrl: string | null;
  transcript?: {
    available: boolean;
    segmentCount: number;
    language: string;
    text: string;
    error?: string;
  };
  error?: string;
}

export interface YouTubeOembed {
  title: string | null;
  author: string | null;
  authorUrl: string | null;
  thumbnailUrl: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  providerName: string;
}

export interface YouTubePageMetadata {
  description: string | null;
  publishDate: string | null;
  genre: string | null;
  duration: string | null;
  isFamilyFriendly: boolean | null;
  viewCount: number | null;
  keywords: string[] | null;
  channelId: string | null;
}

export interface YouTubeTranscriptSegment {
  timestamp: string;
  offsetMs: number;
  durationMs: number;
  text: string;
}

export interface YouTubeTranscriptResult {
  available: boolean;
  segmentCount?: number;
  segments: YouTubeTranscriptSegment[];
  text: string;
  timestampedText?: string;
  error?: string;
}

// ─── Open Library Types ──────────────────────────────────────────

export interface RawOpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
  language?: string[];
  edition_count?: number;
  ratings_average?: number;
  ratings_count?: number;
  isbn?: string[];
}

export interface RawOpenLibrarySearchResponse {
  numFound: number;
  docs: RawOpenLibraryDoc[];
}

export interface OpenLibraryBook {
  key: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  coverUrl: string | null;
  subjects: string[];
  languages: string[];
  editionCount: number;
  rating: number | null;
  ratingCount: number;
  isbn: string | null;
}

export interface OpenLibrarySearchResponse {
  totalResults: number;
  books: OpenLibraryBook[];
}

export interface RawOpenLibraryLink {
  title: string;
  url: string;
}

export interface RawOpenLibraryWork {
  key: string;
  title: string;
  description?: string | { type?: string; value?: string };
  subjects?: string[];
  covers?: number[];
  first_publish_date?: string;
  links?: RawOpenLibraryLink[];
}

export interface OpenLibraryBookDetails {
  key: string;
  title: string;
  description: string | null;
  subjects: string[];
  coverUrl: string | null;
  firstPublishDate: string | null;
  links: Array<{ title: string; url: string }>;
}

export interface RawOpenLibraryAuthor {
  key: string;
  name: string;
  bio?: string | { type?: string; value?: string };
  birth_date?: string;
  death_date?: string;
  photos?: number[];
  wikipedia?: string;
  alternate_names?: string[];
}

export interface OpenLibraryAuthor {
  key: string;
  name: string;
  bio: string | null;
  birthDate: string | null;
  deathDate: string | null;
  photoUrl: string | null;
  wikipedia: string | null;
  alternateNames: string[];
}
