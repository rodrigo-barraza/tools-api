// ─── Single Source of Truth ─────────────────────────────────

// ────────────────────────────────────────────────────────────
// Interval Constants — imported as single source of truth
// for both the collectors and the dataSource metadata.
// ────────────────────────────────────────────────────────────

import {
  // Weather domain — still used by get_weather_forecast, get_canada_avalanche_forecast
  OPEN_METEO_INTERVAL_MS,
  AVALANCHE_INTERVAL_MS,
  // Product domain
  AMAZON_INTERVAL_MS,
  BESTBUY_CA_AVAILABILITY_INTERVAL_MS,
  COSTCO_INTERVAL_MS,
  // Finance domain
  FINNHUB_NEWS_INTERVAL_MS,
  FINNHUB_EARNINGS_INTERVAL_MS,
  EMOJI_KITCHEN_INTERVAL_MS,
} from "../constants.ts";
import { queryEmojiCombination } from "../caches/EmojiKitchenCache.ts";

import type {
  ToolDefinition,
  ToolIntelligenceTier,
  ToolParameters,
  ToolParameterProperty,
  ToolSchema,
  ToolSchemaForAI,
} from "../types/tools.ts";

// ────────────────────────────────────────────────────────────
// Data Source Helpers — builds the dataSource metadata
// ────────────────────────────────────────────────────────────
// type: "cached"    — background-polled on a cron interval,
//                     served from in-memory cache / database.
// type: "onDemand"  — fetched from a provider at request time.
//
// provider: the external API or "internal" for own data.
// intervalSeconds: polling interval (cached only), derived
//                  from the same constant the collector uses.
// ────────────────────────────────────────────────────────────

function cached(provider: string, intervalMs: number) {
  return {
    type: "cached" as const,
    provider,
    intervalSeconds: Math.round(intervalMs / 1000),
  };
}

function onDemand(provider: string) {
  return { type: "onDemand" as const, provider };
}

function staticDataset(name: string) {
  return { type: "static" as const, provider: "internal", dataset: name };
}

import { DOMAINS } from "@rodrigo-barraza/utilities-library/taxonomy";
import PromptLocaleService from "./PromptLocaleService.ts";

// Reverse map: domain display name → programmatic key (e.g. "Core Harness Tools" → "core_harness")
const DOMAIN_DISPLAY_NAME_TO_KEY = new Map<string, string>();
for (const entry of Object.values(DOMAINS)) {
  if (!DOMAIN_DISPLAY_NAME_TO_KEY.has(entry.displayName)) {
    DOMAIN_DISPLAY_NAME_TO_KEY.set(entry.displayName, entry.key);
  }
}

function resolveDomainKey(domain: string): string {
  return (
    DOMAIN_DISPLAY_NAME_TO_KEY.get(domain) ||
    domain
      .toLowerCase()
      .replace(new RegExp("[^a-z0-9]+", "g"), "_")
      .replace(/^_|_$/g, "")
  );
}

function compute(name: string) {
  return { type: "compute" as const, provider: "internal", runtime: name };
}

// ────────────────────────────────────────────────────────────
// Available Fields — per-tool field enums
// ────────────────────────────────────────────────────────────

const FIELDS = {
  // Weather current: from WeatherCache.getCurrent()
  WEATHER_CURRENT: [
    "temperature",
    "apparentTemperature",
    "humidity",
    "weatherCode",
    "weatherDescription",
    "cloudCover",
    "precipitation",
    "rain",
    "showers",
    "snowfall",
    "windSpeed",
    "windDirection",
    "windGust",
    "pressure",
    "isDay",
    "uvIndex",
    "sunrise",
    "sunset",
    "daylightDuration",
    "usAqi",
    "europeanAqi",
    "pm25",
    "pm10",
    "ozone",
    "carbonMonoxide",
    "nitrogenDioxide",
    "dust",
  ],

  // Weather forecast: arrays of hourly/daily forecast objects
  WEATHER_FORECAST: [
    "time",
    "temperature",
    "temperatureMax",
    "temperatureMin",
    "apparentTemperature",
    "humidity",
    "precipitationProbability",
    "precipitation",
    "weatherCode",
    "cloudCover",
    "windSpeed10m",
    "windGusts10m",
    "uvIndex",
    "sunrise",
    "sunset",
  ],

  // Air quality: from WeatherCache.getAirQuality()
  AIR_QUALITY: [
    "usAqi",
    "europeanAqi",
    "pm25",
    "pm10",
    "ozone",
    "carbonMonoxide",
    "nitrogenDioxide",
    "dust",
  ],

  // Earthquakes: from EarthquakeFetcher normalized shape
  EARTHQUAKES: [
    "usgsId",
    "magnitude",
    "magnitudeType",
    "magnitudeClass",
    "place",
    "time",
    "url",
    "felt",
    "alert",
    "tsunami",
    "significance",
    "title",
    "latitude",
    "longitude",
    "depth",
  ],

  // Space weather summary: from SpaceWeatherCache.getSpaceWeatherSummary()
  SOLAR_ACTIVITY: [
    "flareCount",
    "cmeCount",
    "stormCount",
    "strongestFlare.flrId",
    "strongestFlare.beginTime",
    "strongestFlare.peakTime",
    "strongestFlare.classType",
    "strongestFlare.sourceLocation",
    "fastestCme.activityId",
    "fastestCme.startTime",
    "fastestCme.speed",
    "fastestCme.type",
    "fastestCme.isEarthDirected",
    "fastestCme.estimatedArrival",
    "earthDirectedCmes",
    "lastFetch",
  ],

  // Aurora/Kp index: from KpIndexCache.getCurrentKp()
  AURORA: [
    "current",
    "classification",
    "peak24h",
    "peakClassification",
    "lastFetch",
  ],

  // Twilight: from TwilightFetcher
  TWILIGHT: [
    "sunrise",
    "sunset",
    "solarNoon",
    "dayLength",
    "civilTwilightBegin",
    "civilTwilightEnd",
    "nauticalTwilightBegin",
    "nauticalTwilightEnd",
    "astronomicalTwilightBegin",
    "astronomicalTwilightEnd",
  ],

  // Moon Phase: from MoonPhaseCalculator
  MOON_PHASE: [
    "phaseName",
    "phaseEmoji",
    "illuminationPercent",
    "ageInDays",
    "synodicPeriodDays",
    "isWaxing",
    "isWaning",
    "nextNewMoonUtc",
    "nextFullMoonUtc",
    "currentCycleStartUtc",
  ],

  // Tides: from TideCache.getTides()
  TIDES: ["time", "height", "type", "stationId"],

  // Wildfires: from WildfireFetcher
  WILDFIRES: [
    "eonetId",
    "title",
    "description",
    "status",
    "coordinates.lat",
    "coordinates.lng",
    "magnitudeValue",
    "magnitudeUnit",
    "date",
    "sourceUrl",
  ],

  // ISS: from IssCache.getIssData()
  ISS: [
    "position.latitude",
    "position.longitude",
    "position.timestamp",
    "astronauts.total",
    "astronauts.people",
    "lastPositionFetch",
    "lastAstrosFetch",
  ],

  // NEO: from NeoCache.getNeoSummary()
  NEO: [
    "total",
    "hazardousCount",
    "closest.name",
    "closest.missDistanceKm",
    "closest.missDistanceLunar",
    "closest.isPotentiallyHazardous",
    "closest.estimatedDiameterMaxKm",
    "closest.relativeVelocityKmPerSec",
    "largest.name",
    "largest.estimatedDiameterMaxKm",
    "lastFetch",
  ],

  // Solar Wind: from SolarWindCache.getSolarWindLatest()
  SOLAR_WIND: [
    "time",
    "speed",
    "density",
    "temperature",
    "bz",
    "bt",
    "bx",
    "by",
    "lastFetch",
  ],

  // Pollen: from PollenCache.getPollenToday()
  POLLEN: [
    "date",
    "grass.displayName",
    "grass.indexInfo.value",
    "grass.indexInfo.category",
    "grass.inSeason",
    "tree.displayName",
    "tree.indexInfo.value",
    "tree.indexInfo.category",
    "tree.inSeason",
    "weed.displayName",
    "weed.indexInfo.value",
    "weed.indexInfo.category",
    "weed.inSeason",
    "regionCode",
    "lastFetch",
  ],

  // APOD: from ApodCache.getApod()
  APOD: [
    "title",
    "explanation",
    "date",
    "url",
    "hdUrl",
    "mediaType",
    "copyright",
    "lastFetch",
  ],

  // Launches: from LaunchCache.getLaunchSummary()
  LAUNCHES: [
    "count",
    "upcomingCount",
    "next.name",
    "next.status",
    "next.net",
    "next.provider",
    "next.rocket",
    "next.mission",
    "next.missionType",
    "next.missionDescription",
    "next.padName",
    "next.padLocation",
    "next.imageUrl",
    "providers",
    "lastFetch",
  ],

  // Weather Warnings: from EnvironmentCanadaCache.getWarnings()
  WEATHER_WARNINGS: ["count", "warnings", "lastFetch"],

  // Avalanche: from AvalancheCache.getAvalanche()
  AVALANCHE: ["count", "forecasts", "lastFetch"],

  // Google Air Quality: from GoogleAirQualityCache.getGoogleAirQuality()
  GOOGLE_AIR_QUALITY: [
    "universalAqi",
    "universalAqiCategory",
    "universalAqiDominantPollutant",
    "usEpaAqi",
    "usEpaCategory",
    "usEpaDominantPollutant",
    "pollutants",
    "healthRecommendations",
    "regionCode",
    "lastFetch",
  ],

  // Events: from TicketmasterFetcher normalized schema
  EVENTS: [
    "name",
    "description",
    "source",
    "category",
    "startDate",
    "endDate",
    "url",
    "imageUrl",
    "status",
    "genres",
    "priceRange.min",
    "priceRange.max",
    "priceRange.currency",
    "venue.name",
    "venue.address",
    "venue.city",
    "venue.state",
    "venue.country",
    "venue.latitude",
    "venue.longitude",
    "mapImageUrl",
  ],

  // Event Summary: from EventCache.getEventSummary()
  EVENT_SUMMARY: [
    "total",
    "today",
    "upcoming",
    "byCategory",
    "bySource",
    "lastFetch",
  ],

  // Commodities summary: from CommodityCache.getCommoditySummary()
  COMMODITIES_SUMMARY: [
    "total",
    "gainers",
    "losers",
    "byCategory",
    "lastFetch",
  ],

  // Commodity items: individual commodity data
  COMMODITY: [
    "ticker",
    "name",
    "price",
    "change",
    "changePercent",
    "category",
    "unit",
    "dayHigh",
    "dayLow",
    "previousClose",
    "volume",
  ],

  // Commodity History: from CommoditySnapshot model
  COMMODITY_HISTORY: ["ticker", "hours", "count", "snapshots"],

  // Trends: from GoogleTrendsFetcher normalized schema
  TRENDS: [
    "name",
    "normalizedName",
    "source",
    "volume",
    "url",
    "context.subreddit",
    "context.author",
    "context.commentCount",
    "context.upvoteRatio",
    "context.flair",
    "context.created",
    "context.description",
    "context.views",
    "context.stars",
    "context.forks",
    "context.language",
    "context.publisher",
    "context.publishedAt",
    "category",
    "timestamp",
  ],

  // Products: normalized product schema
  PRODUCTS: [
    "name",
    "source",
    "category",
    "price",
    "currency",
    "rating",
    "reviewCount",
    "imageUrl",
    "productUrl",
    "description",
    "trendingScore",
    "rank",
  ],

  // Product Availability: from BestBuyCAAvailabilityCache
  PRODUCT_AVAILABILITY: ["count", "lastCheck", "inStockCount", "results"],

  // Finnhub quote: from FinnhubFetcher.fetchStockQuote()
  STOCK_QUOTE: ["symbol", "c", "d", "dp", "h", "l", "o", "pc", "t", "cached"],

  // Finnhub company profile: from Finnhub API /stock/profile2
  COMPANY_PROFILE: [
    "country",
    "currency",
    "exchange",
    "finnhubIndustry",
    "ipo",
    "logo",
    "marketCapitalization",
    "name",
    "phone",
    "shareOutstanding",
    "ticker",
    "weburl",
  ],

  // Market news articles: from Finnhub /news
  MARKET_NEWS: [
    "category",
    "datetime",
    "headline",
    "id",
    "image",
    "related",
    "source",
    "summary",
    "url",
  ],

  // Earnings calendar: from Finnhub /calendar/earnings
  EARNINGS: [
    "date",
    "epsActual",
    "epsEstimate",
    "hour",
    "quarter",
    "revenueActual",
    "revenueEstimate",
    "symbol",
    "year",
  ],

  // Analyst recommendations: from Finnhub /stock/recommendation
  RECOMMENDATION: [
    "buy",
    "hold",
    "period",
    "sell",
    "strongBuy",
    "strongSell",
    "symbol",
  ],

  // Basic financials: from Finnhub /stock/metric
  FINANCIALS: [
    "symbol",
    "metric.52WeekHigh",
    "metric.52WeekLow",
    "metric.beta",
    "metric.peAnnual",
    "metric.peNTM",
    "metric.epsAnnual",
    "metric.epsGrowthTTMYoy",
    "metric.dividendYieldIndicatedAnnual",
    "metric.marketCapitalization",
    "metric.revenuePerShareAnnual",
    "metric.roaRfy",
    "metric.roeRfy",
    "metric.currentRatioAnnual",
    "metric.debtEquityAnnual",
    "metric.10DayAverageTradingVolume",
    "metric.3MonthAverageTradingVolume",
  ],

  // ── Macroeconomics (FRED) ────────────────────────────────────

  // Macro Indicators: from FredFetcher
  MACRO_INDICATORS: ["id", "name", "category", "value", "date", "unit"],

  // Macro Series Info: from FredFetcher
  MACRO_SERIES_INFO: [
    "id",
    "title",
    "frequency",
    "units",
    "seasonalAdjustment",
    "lastUpdated",
    "observationStart",
    "observationEnd",
    "notes",
  ],

  // Macro Series Search: from FredFetcher
  MACRO_SERIES_SEARCH: [
    "id",
    "title",
    "frequency",
    "units",
    "seasonalAdjustment",
    "lastUpdated",
    "popularity",
    "notes",
  ],

  // Macro Observations: from FredFetcher
  MACRO_OBSERVATIONS: ["date", "value"],

  // ── Historical Prices ──────────────────────────────────────────

  HISTORICAL_PRICES: [
    "symbol",
    "interval",
    "period",
    "currency",
    "exchangeName",
    "count",
    "candles",
  ],

  // ── Technical Analysis ─────────────────────────────────────────

  TECHNICAL_ANALYSIS: [
    "symbol",
    "interval",
    "candleCount",
    "indicators",
    "overallSignal",
  ],

  // ── Volatility ─────────────────────────────────────────────────

  VOLATILITY: [
    "vix",
    "vvix",
    "instruments",
    "regime",
  ],

  // ── Fear & Greed ───────────────────────────────────────────────

  FEAR_GREED: [
    "current",
    "history",
  ],

  // ── SEC Filings ────────────────────────────────────────────────

  SEC_FILINGS: [
    "filer",
    "filings",
    "count",
  ],

  SEC_SEARCH: [
    "query",
    "results",
    "count",
  ],

  // ── Sector Performance ─────────────────────────────────────────

  SECTOR_PERFORMANCE: [
    "sectors",
    "topPerformers",
    "bottomPerformers",
  ],

  // Dictionary: from DictionaryFetcher.fetchDefinition()
  DICTIONARY: [
    "word",
    "found",
    "phonetic",
    "phonetics",
    "meanings",
    "sourceUrls",
  ],

  // Books: from OpenLibraryFetcher.searchBooks()
  BOOKS: [
    "key",
    "title",
    "authors",
    "firstPublishYear",
    "coverUrl",
    "subjects",
    "editionCount",
    "rating",
    "ratingCount",
    "isbn",
  ],

  // Book Details: from OpenLibraryFetcher.getBookDetails()
  BOOK_DETAILS: [
    "key",
    "title",
    "description",
    "subjects",
    "coverUrl",
    "firstPublishDate",
    "links",
  ],

  // Author: from OpenLibraryFetcher.getAuthorInfo()
  AUTHOR: [
    "key",
    "name",
    "bio",
    "birthDate",
    "deathDate",
    "photoUrl",
    "wikipedia",
    "alternateNames",
  ],

  // Countries: from RestCountriesFetcher
  COUNTRIES: [
    "name",
    "officialName",
    "cca2",
    "cca3",
    "capital",
    "region",
    "subregion",
    "population",
    "area",
    "languages",
    "currencies",
    "timezones",
    "borders",
    "flag",
    "flagPng",
    "continent",
    "callingCodes",
    "independent",
    "landlocked",
  ],

  // Papers: from ArxivFetcher.searchPapers()
  PAPERS: [
    "arxivId",
    "title",
    "abstract",
    "authors",
    "published",
    "updated",
    "primaryCategory",
    "categories",
    "pdfUrl",
    "abstractUrl",
    "doi",
    "comment",
  ],

  // Wikipedia Summary: from WikipediaSummaryFetcher
  WIKIPEDIA_SUMMARY: [
    "found",
    "title",
    "displayTitle",
    "extract",
    "description",
    "thumbnail",
    "originalImage",
    "pageUrl",
    "lastModified",
  ],

  // On This Day: from WikipediaSummaryFetcher.getOnThisDay()
  ON_THIS_DAY: ["date", "type", "count", "events"],

  // YouTube Search: from YouTubeSearchFetcher.searchYouTubeVideos()
  YOUTUBE_SEARCH: [
    "videoId",
    "url",
    "title",
    "description",
    "channelTitle",
    "channelId",
    "publishedAt",
    "thumbnailUrl",
    "viewCount",
    "likeCount",
    "commentCount",
    "duration",
    "durationSeconds",
  ],

  // YouTube Video: from YouTubeFetcher.getYouTubeVideoInfo()
  YOUTUBE_VIDEO: [
    "videoId",
    "url",
    "title",
    "author",
    "authorUrl",
    "channelId",
    "description",
    "publishDate",
    "duration",
    "genre",
    "viewCount",
    "isFamilyFriendly",
    "keywords",
    "thumbnailUrl",
    "transcript",
  ],

  // GitHub Repo: from GitHubFetcher.getGitHubRepo()
  GITHUB_REPO: [
    "fullName",
    "description",
    "url",
    "homepage",
    "stars",
    "forks",
    "openIssues",
    "watchers",
    "language",
    "languages",
    "license",
    "topics",
    "defaultBranch",
    "isArchived",
    "isFork",
    "createdAt",
    "updatedAt",
    "pushedAt",
    "sizeKb",
    "readme",
  ],

  // Reddit Thread: from RedditFetcher.getRedditThread()
  REDDIT_THREAD: [
    "title",
    "author",
    "subreddit",
    "score",
    "upvoteRatio",
    "url",
    "externalUrl",
    "selfText",
    "commentCount",
    "createdUtc",
    "flair",
    "isNsfw",
    "domain",
    "comments",
  ],

  // NPM Package: from NpmFetcher.getNpmPackage()
  NPM_PACKAGE: [
    "name",
    "version",
    "description",
    "license",
    "homepage",
    "repository",
    "keywords",
    "author",
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "engines",
    "types",
    "weeklyDownloads",
    "distTags",
    "createdAt",
    "lastPublished",
    "deprecated",
    "readme",
  ],

  // PyPI Package: from PyPiFetcher.getPyPiPackage()
  PYPI_PACKAGE: [
    "name",
    "version",
    "summary",
    "description",
    "author",
    "maintainer",
    "license",
    "homepage",
    "projectUrls",
    "keywords",
    "requiresPython",
    "requiresDist",
    "classifiers",
  ],

  // PDF: from PdfFetcher.readPdfUrl()
  PDF: ["url", "pageCount", "info", "text", "charCount", "truncated"],

  // RSS Feed: from RssFetcher.readRssFeed()
  RSS_FEED: [
    "format",
    "feedUrl",
    "title",
    "description",
    "link",
    "language",
    "itemCount",
    "items",
  ],

  // Twitter/X Post: from TwitterFetcher.getTwitterPost()
  TWITTER_POST: [
    "tweetId",
    "url",
    "author",
    "authorHandle",
    "text",
    "createdAt",
    "likes",
    "retweets",
    "replies",
    "views",
    "media",
    "quotedTweet",
  ],

  // Hacker News Thread: from HackerNewsFetcher.getHackerNewsThread()
  HACKERNEWS_THREAD: [
    "id",
    "type",
    "title",
    "url",
    "hnUrl",
    "author",
    "score",
    "commentCount",
    "time",
    "text",
    "comments",
  ],

  // Stack Overflow Question: from StackOverflowFetcher.getStackOverflowQuestion()
  STACKOVERFLOW_QUESTION: [
    "questionId",
    "title",
    "url",
    "author",
    "body",
    "tags",
    "score",
    "viewCount",
    "answerCount",
    "isAnswered",
    "acceptedAnswerId",
    "createdAt",
    "answers",
  ],

  // Anime: from JikanFetcher
  ANIME: [
    "malId",
    "title",
    "titleEnglish",
    "titleJapanese",
    "imageUrl",
    "trailerUrl",
    "synopsis",
    "type",
    "source",
    "episodes",
    "status",
    "airing",
    "airedString",
    "duration",
    "rating",
    "score",
    "scoredBy",
    "rank",
    "popularity",
    "season",
    "year",
    "studios",
    "genres",
    "themes",
  ],

  // Movies: from TMDbFetcher
  MOVIES: [
    "tmdbId",
    "title",
    "originalTitle",
    "tagline",
    "overview",
    "releaseDate",
    "status",
    "runtime",
    "voteAverage",
    "voteCount",
    "popularity",
    "posterUrl",
    "backdropUrl",
    "genres",
    "originalLanguage",
    "url",
  ],

  // Movie Details: from TMDbFetcher.getMovieDetails()
  MOVIE_DETAILS: [
    "tmdbId",
    "title",
    "originalTitle",
    "tagline",
    "overview",
    "releaseDate",
    "status",
    "runtime",
    "budget",
    "revenue",
    "voteAverage",
    "voteCount",
    "popularity",
    "posterUrl",
    "backdropUrl",
    "genres",
    "originalLanguage",
    "spokenLanguages",
    "productionCompanies",
    "productionCountries",
    "homepage",
    "imdbId",
    "url",
  ],

  // Movie Credits: from TMDbFetcher.getMovieCredits()
  MOVIE_CREDITS: [
    "cast.name",
    "cast.character",
    "cast.profileUrl",
    "cast.order",
    "crew.name",
    "crew.job",
    "crew.department",
  ],

  // TV Shows: from TMDbFetcher
  TV_SHOWS: [
    "tmdbId",
    "name",
    "originalName",
    "tagline",
    "overview",
    "firstAirDate",
    "lastAirDate",
    "status",
    "type",
    "numberOfSeasons",
    "numberOfEpisodes",
    "voteAverage",
    "voteCount",
    "popularity",
    "posterUrl",
    "backdropUrl",
    "genres",
    "networks",
    "url",
  ],

  // TV Show Details: from TMDbFetcher.getTvShowDetails()
  TV_SHOW_DETAILS: [
    "tmdbId",
    "name",
    "originalName",
    "tagline",
    "overview",
    "firstAirDate",
    "lastAirDate",
    "status",
    "type",
    "numberOfSeasons",
    "numberOfEpisodes",
    "episodeRuntime",
    "voteAverage",
    "voteCount",
    "popularity",
    "posterUrl",
    "backdropUrl",
    "genres",
    "networks",
    "productionCompanies",
    "createdBy",
    "originCountry",
    "originalLanguage",
    "homepage",
    "inProduction",
    "url",
  ],

  // TV Credits: from TMDbFetcher.getTvShowCredits()
  TV_CREDITS: [
    "cast.name",
    "cast.character",
    "cast.profileUrl",
    "cast.order",
    "crew.name",
    "crew.job",
    "crew.department",
  ],

  // TV Season: from TMDbFetcher.getTvSeasonDetails()
  TV_SEASON: [
    "seasonNumber",
    "name",
    "overview",
    "airDate",
    "posterUrl",
    "episodeCount",
    "episodes.episodeNumber",
    "episodes.name",
    "episodes.overview",
    "episodes.airDate",
    "episodes.runtime",
    "episodes.voteAverage",
  ],

  // Person: from TMDbFetcher.searchPeople() / getPersonDetails()
  PERSON: [
    "tmdbId",
    "name",
    "knownForDepartment",
    "biography",
    "birthday",
    "deathday",
    "placeOfBirth",
    "gender",
    "popularity",
    "profileUrl",
    "imdbId",
    "homepage",
    "alsoKnownAs",
    "url",
  ],

  // Person Credits: from TMDbFetcher.getPersonCredits()
  PERSON_CREDITS: [
    "cast.tmdbId",
    "cast.mediaType",
    "cast.title",
    "cast.character",
    "cast.releaseDate",
    "cast.voteAverage",
    "cast.posterUrl",
    "crew.tmdbId",
    "crew.mediaType",
    "crew.title",
    "crew.job",
    "crew.department",
    "crew.releaseDate",
  ],

  // Watch Providers: from TMDbFetcher.getWatchProviders()
  WATCH_PROVIDERS: [
    "tmdbId",
    "title",
    "region",
    "link",
    "flatrate.providerName",
    "flatrate.providerLogoUrl",
    "rent.providerName",
    "rent.providerLogoUrl",
    "buy.providerName",
    "buy.providerLogoUrl",
    "free.providerName",
    "free.providerLogoUrl",
  ],

  // Drug Labels: from OpenFdaFetcher
  DRUG_LABEL: [
    "brandName",
    "genericName",
    "manufacturer",
    "route",
    "substanceName",
    "indications",
    "warnings",
    "adverseReactions",
    "dosage",
    "contraindications",
    "drugInteractions",
  ],

  // Drug Adverse Events: from OpenFdaFetcher
  DRUG_ADVERSE_EVENTS: [
    "safetyReportId",
    "receiveDate",
    "serious",
    "seriousnessDetails",
    "reactions",
    "patientAge",
    "patientSex",
  ],

  // Drug Recalls: from OpenFdaFetcher
  DRUG_RECALLS: [
    "recallNumber",
    "status",
    "classification",
    "reportDate",
    "recallingFirm",
    "reason",
    "productDescription",
    "distribution",
  ],

  // USDA Nutrition: from NutritionFetcher (raw whole foods)
  USDA_NUTRITION: [
    "name",
    "description",
    "kingdom",
    "foodType",
    "foodSubtype",
    "part",
    "form",
    "state",
    "taxonomy.taxon",
    "taxonomy.kingdom",
    "taxonomy.phylum",
    "taxonomy.class",
    "taxonomy.order",
    "taxonomy.suborder",
    "taxonomy.family",
    "taxonomy.subfamily",
    "taxonomy.tribe",
    "taxonomy.genus",
    "taxonomy.species",
    "taxonomy.subspecies",
    "taxonomy.variety",
    "taxonomy.form",
    "taxonomy.group",
    "taxonomy.cultivar",
    "taxonomy.phenotype",
    "taxonomy.binomial",
    "taxonomy.nomial",
    "taxonomy.trinomial",
    "perHundredGrams.macros",
    "perHundredGrams.minerals",
    "perHundredGrams.vitamins",
    "perHundredGrams.aminoAcids",
    "perHundredGrams.lipidProfile",
    "perHundredGrams.carbDetails",
    "perHundredGrams.sterols",
  ],

  // USDA Taxonomy Search: from NutritionFetcher.searchByTaxonomy()
  USDA_TAXONOMY: [
    "rank",
    "value",
    "count",
    "foods.name",
    "foods.description",
    "foods.kingdom",
    "foods.taxonomy",
    "foods.perHundredGrams",
  ],

  // USDA Nutrient Ranking: from NutritionFetcher.rankByNutrient()
  USDA_NUTRIENT_RANKING: [
    "nutrient",
    "nutrientName",
    "type",
    "count",
    "foods.name",
    "foods.description",
    "foods.kingdom",
    "foods.foodType",
    "foods.value",
  ],

  // ── Transit Domain ────────────────────────────────────────────

  // Next Bus: from TransLinkFetcher
  NEXT_BUS: ["stopNo", "count", "routes"],

  // Stop Info: from TransLinkFetcher
  STOP_INFO: [
    "stopNo",
    "name",
    "city",
    "onStreet",
    "atStreet",
    "latitude",
    "longitude",
    "wheelchairAccess",
    "routes",
  ],

  // Nearby Stops: from TransLinkFetcher
  NEARBY_STOPS: ["count", "stops"],

  // Route Info: from TransLinkFetcher
  ROUTE_INFO: ["routeNo", "name", "operatingCompany", "patterns"],

  // ── Utility Domain ────────────────────────────────────────────

  // Currency Conversion: from CurrencyFetcher
  CURRENCY_CONVERT: ["from", "to", "amount", "rate", "converted", "lastUpdate"],

  // Timezone: from TimezoneFetcher
  TIMEZONE: [
    "found",
    "timezone",
    "datetime",
    "abbreviation",
    "utcOffset",
    "dayOfWeek",
    "isDaylightSavingTime",
    "daylightSavingTimeFrom",
    "daylightSavingTimeUntil",
  ],

  // IP Geolocation: from IpInfoFetcher
  IP_GEOLOCATION: [
    "ip",
    "hostname",
    "city",
    "region",
    "country",
    "latitude",
    "longitude",
    "org",
    "postal",
    "timezone",
  ],

  // Places: from PlacesFetcher
  PLACES: [
    "id",
    "name",
    "type",
    "types",
    "address",
    "shortAddress",
    "latitude",
    "longitude",
    "rating",
    "reviewCount",
    "priceLevel",
    "phone",
    "website",
    "googleMapsUrl",
    "description",
    "openNow",
  ],

  // Periodic Table: from PeriodicTableFetcher
  ELEMENTS: [
    "atomicNumber",
    "symbol",
    "name",
    "atomicMass",
    "category",
    "groupNumber",
    "period",
    "block",
    "electronConfiguration",
    "electronegativity",
    "density",
    "molarHeat",
    "electronAffinity",
    "firstIonizationEnergy",
    "phaseAtSTP",
    "meltingPoint",
    "boilingPoint",
    "appearance",
    "discoveredBy",
    "cpkHexColor",
    "summary",
  ],

  // Element Ranking: from PeriodicTableFetcher.rankElementsByProperty()
  ELEMENT_RANKING: [
    "property",
    "propertyLabel",
    "order",
    "count",
    "elements.atomicNumber",
    "elements.symbol",
    "elements.name",
    "elements.value",
    "elements.category",
  ],

  // World Bank: from WorldBankFetcher
  WORLD_BANK_COUNTRY: [
    "countryCode",
    "countryName",
    "dataYear",
    "indicators.gdp_usd",
    "indicators.gdp_per_capita_usd",
    "indicators.population",
    "indicators.life_expectancy",
    "indicators.infant_mortality_per_1k",
    "indicators.co2_per_capita_tons",
    "indicators.literacy_rate_pct",
    "indicators.internet_users_pct",
    "indicators.unemployment_pct",
    "indicators.inflation_cpi_pct",
    "indicators.forest_area_pct",
    "indicators.renewable_energy_pct",
    "indicators.gini_index",
    "indicators.electricity_access_pct",
    "indicators.health_expenditure_per_capita_usd",
  ],

  // World Bank Ranking: from WorldBankFetcher.rankCountriesByIndicator()
  WORLD_BANK_RANKING: [
    "indicator",
    "indicatorLabel",
    "unit",
    "order",
    "count",
    "countries.countryCode",
    "countries.countryName",
    "countries.value",
    "countries.dataYear",
  ],

  // ── Airport Domain ─────────────────────────────────────────────

  // Airport Search/Lookup: from AirportFetcher
  AIRPORTS: [
    "iataCode",
    "icaoCode",
    "name",
    "city",
    "countryCode",
    "continent",
    "latitude",
    "longitude",
    "elevationFt",
    "type",
    "scheduledService",
  ],

  // Nearest Airport: from AirportFetcher.getNearestAirports()
  AIRPORTS_NEAREST: [
    "iataCode",
    "icaoCode",
    "name",
    "city",
    "countryCode",
    "distanceKm",
  ],

  // ── Webcams ────────────────────────────────────────────────────────

  WEBCAMS: [
    "id",
    "name",
    "url",
    "area",
    "latitude",
    "longitude",
    "city",
    "country",
    "source",
  ],

  // ── Exoplanet Domain ───────────────────────────────────────────

  // Exoplanet Search/Lookup: from ExoplanetFetcher
  EXOPLANETS: [
    "name",
    "hostStar",
    "discoveryMethod",
    "discoveryYear",
    "discoveryFacility",
    "orbitalPeriodDays",
    "radiusEarth",
    "massEarth",
    "semiMajorAxisAU",
    "eccentricity",
    "equilibriumTempK",
    "stellarMassSolar",
    "stellarRadiusSolar",
    "stellarTempK",
    "distanceParsecs",
  ],

  // Exoplanet Ranking: from ExoplanetFetcher.rankExoplanets()
  EXOPLANET_RANKING: [
    "field",
    "label",
    "unit",
    "order",
    "count",
    "planets.name",
    "planets.hostStar",
    "planets.value",
    "planets.discoveryYear",
    "planets.method",
  ],

  // Exoplanet Discovery Stats: from ExoplanetFetcher.getDiscoveryStats()
  EXOPLANET_STATS: [
    "totalPlanets",
    "yearRange.first",
    "yearRange.latest",
    "discoveryMethods",
    "topFacilities",
  ],

  // ── FDA Drug Domain ────────────────────────────────────────────

  // FDA Drug Search: from FdaDrugFetcher
  FDA_DRUGS: [
    "productNdc",
    "genericName",
    "brandName",
    "labelerName",
    "dosageForm",
    "route",
    "productType",
    "marketingCategory",
    "activeIngredients",
    "pharmClass",
  ],

  // FDA Dosage Forms: from FdaDrugFetcher.getDosageForms()
  FDA_DOSAGE_FORMS: ["totalProducts", "dosageForms.form", "dosageForms.count"],

  // ── Gym Exercises ──────────────────────────────────────────────

  // Exercises: from ExercisesFetcher
  EXERCISES: [
    "id",
    "name",
    "force",
    "level",
    "mechanic",
    "equipment",
    "category",
    "primary_muscles",
    "secondary_muscles",
    "instructions",
  ],

  // ── Maritime Domain (AIS Stream) ──────────────────────────────

  // Tracked Vessels: from AisStreamFetcher.getTrackedVessels()
  VESSELS: [
    "mmsi",
    "shipName",
    "latitude",
    "longitude",
    "cog",
    "sog",
    "trueHeading",
    "navigationalStatus",
    "rateOfTurn",
    "imoNumber",
    "callSign",
    "shipType",
    "destination",
    "draught",
    "eta",
    "dimensions",
    "messageType",
    "timestamp",
    "receivedAt",
  ],

  // AIS Messages: raw ring buffer entries
  AIS_MESSAGES: [
    "messageType",
    "mmsi",
    "shipName",
    "latitude",
    "longitude",
    "timestamp",
    "receivedAt",
    "cog",
    "sog",
    "trueHeading",
    "safetyText",
  ],

  // ── Energy Domain (EIA) ───────────────────────────────────────

  // Energy Indicators: from EiaFetcher.getEnergyIndicators()
  ENERGY_INDICATORS: [
    "id",
    "name",
    "category",
    "value",
    "period",
    "unit",
    "description",
  ],

  // EIA Browse: from EiaFetcher.browseRoute()
  EIA_BROWSE: [
    "id",
    "name",
    "description",
    "routes",
    "frequency",
    "facets",
    "data",
    "startPeriod",
    "endPeriod",
  ],

  // EIA Facets: from EiaFetcher.getFacetValues()
  EIA_FACETS: ["route", "facetId", "totalFacets", "facets"],
};

// ────────────────────────────────────────────────────────────
// Tool Definitions — JSON Schema + endpoint metadata
// ────────────────────────────────────────────────────────────

function createLocalizedToolDefinitions(translate: (key: string, variables?: Record<string, string>) => string): ToolDefinition[] {
  function fieldsParam(fieldEnum: string[]) {
    return {
      fields: {
        type: "string",
        description: translate("common.params.fields", { fields: fieldEnum.join(", ") }),
      },
    };
  }

  return [
  // ── Weather / Environment ──────────────────────────────────
  {
    name: "get_weather_forecast",
    dataSource: cached("Open-Meteo", OPEN_METEO_INTERVAL_MS),
    description: translate("get_weather_forecast.description"),
    endpoint: { path: "/weather/weather/forecast", queryParams: ["days"] },
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: translate("get_weather_forecast.params.days"),
        },
        ...fieldsParam(FIELDS.WEATHER_FORECAST),
      },
      required: ["fields"],
    },
  },
  {
    name: "get_canada_avalanche_forecast",
    dataSource: cached("Avalanche Canada", AVALANCHE_INTERVAL_MS),
    description: translate("get_canada_avalanche_forecast.description"),
    endpoint: { path: "/weather/avalanche", queryParams: ["region"] },
    parameters: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: translate("get_canada_avalanche_forecast.params.region"),
        },
        ...fieldsParam(FIELDS.AVALANCHE),
      },
    },
  },
  {
    name: "get_weather",
    dataSource: onDemand("Open-Meteo Geocoding + Forecast"),
    description: translate("get_weather.description"),
    endpoint: {
      path: "/weather/live",
      queryParams: ["location", "latitude", "longitude", "units"],
    },
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: translate("get_weather.params.location"),
        },
        latitude: {
          type: "number",
          description: translate("get_weather.params.latitude"),
        },
        longitude: {
          type: "number",
          description: translate("get_weather.params.longitude"),
        },
        units: {
          type: "string",
          description: translate("get_weather.params.units"),
          enum: ["metric", "imperial"],
        },
      },
    },
  },
  {
    name: "get_local_environment",
    dataSource: onDemand("Multiple APIs"),
    description: translate("get_local_environment.description"),
    endpoint: {
      path: "/weather/environment",
      queryParams: ["source"],
    },
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: translate("get_local_environment.params.source"),
          enum: [
            "current_weather",
            "air_quality",
            "earthquakes",
            "solar_activity",
            "aurora",
            "twilight",
            "tides",
            "wildfires",
            "iss",
            "neo",
            "solar_wind",
            "pollen",
            "apod",
            "launches",
            "warnings",
            "air_quality_google",
            "moon_phase",
          ],
        },
        fields: {
          type: "string",
          description: translate("get_local_environment.params.fields"),
        },
      },
      required: ["source"],
    },
  },

  // ── Earthquakes ────────────────────────────────────────────
  {
    name: "get_earthquakes",
    dataSource: onDemand("USGS Earthquake API (cached)"),
    description: translate("get_earthquakes.description"),
    endpoint: {
      path: "/weather/earthquakes/recent",
      queryParams: ["hours", "minMag", "limit", "fields"],
    },
    parameters: {
      type: "object",
      properties: {
        hours: {
          type: "number",
          description: translate("get_earthquakes.params.hours"),
        },
        minMag: {
          type: "number",
          description: translate("get_earthquakes.params.minMag"),
        },
        limit: {
          type: "number",
          description: translate("get_near_earth_objects.params.limit"),
        },
        ...fieldsParam(FIELDS.EARTHQUAKES),
      },
    },
  },

  // ── Space Weather ──────────────────────────────────────────
  {
    name: "get_solar_activity",
    dataSource: onDemand("NASA DONKI (cached)"),
    description: translate("get_solar_activity.description"),
    endpoint: {
      path: "/weather/space-weather/summary",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.SOLAR_ACTIVITY),
      },
    },
  },

  // ── Aurora / Kp Index ──────────────────────────────────────
  {
    name: "get_aurora_forecast",
    dataSource: onDemand("NOAA SWPC Kp Index (cached)"),
    description: translate("get_aurora_forecast.description"),
    endpoint: {
      path: "/weather/kp/current",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.AURORA),
      },
    },
  },

  // ── Solar Wind ─────────────────────────────────────────────
  {
    name: "get_solar_wind",
    dataSource: onDemand("NOAA DSCOVR (cached)"),
    description: translate("get_solar_wind.description"),
    endpoint: {
      path: "/weather/solar-wind/latest",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.SOLAR_WIND),
      },
    },
  },

  // ── Twilight ───────────────────────────────────────────────
  {
    name: "get_twilight",
    dataSource: onDemand("Sunrise-Sunset API (cached)"),
    description: translate("get_twilight.description"),
    endpoint: {
      path: "/weather/twilight",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.TWILIGHT),
      },
    },
  },

  // ── Tides ──────────────────────────────────────────────────
  {
    name: "get_tides",
    dataSource: onDemand("NOAA Tides & Currents (cached)"),
    description: translate("get_tides.description"),
    endpoint: {
      path: "/weather/tides",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.TIDES),
      },
    },
  },

  // ── Wildfires ──────────────────────────────────────────────
  {
    name: "get_wildfires",
    dataSource: onDemand("NASA EONET (cached)"),
    description: translate("get_wildfires.description"),
    endpoint: {
      path: "/weather/wildfires",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.WILDFIRES),
      },
    },
  },

  // ── ISS ────────────────────────────────────────────────────
  {
    name: "get_iss_location",
    dataSource: onDemand("ISS API (cached)"),
    description: translate("get_iss_location.description"),
    endpoint: {
      path: "/weather/iss",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.ISS),
      },
    },
  },

  // ── Near-Earth Objects ─────────────────────────────────────
  {
    name: "get_near_earth_objects",
    dataSource: onDemand("NASA NeoWs (cached)"),
    description: translate("get_near_earth_objects.description"),
    endpoint: {
      path: "/weather/neo/recent",
      queryParams: ["days", "hazardousOnly", "limit", "fields"],
    },
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: translate("get_near_earth_objects.params.days"),
        },
        hazardousOnly: {
          type: "boolean",
          description: translate("get_near_earth_objects.params.hazardousOnly"),
        },
        limit: {
          type: "number",
          description: translate("get_near_earth_objects.params.limit"),
        },
        ...fieldsParam(FIELDS.NEO),
      },
    },
  },

  // ── Space Launches ─────────────────────────────────────────
  {
    name: "get_space_launches",
    dataSource: onDemand("Launch Library 2 (cached)"),
    description: translate("get_space_launches.description"),
    endpoint: {
      path: "/weather/launches/summary",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.LAUNCHES),
      },
    },
  },

  // ── NASA APOD ──────────────────────────────────────────────
  {
    name: "get_nasa_apod",
    dataSource: onDemand("NASA APOD API (cached)"),
    description: translate("get_nasa_apod.description"),
    endpoint: {
      path: "/weather/apod",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.APOD),
      },
    },
  },

  // ── Moon Phase ──────────────────────────────────────────────
  {
    name: "get_moon_phase",
    dataSource: onDemand("Algorithmic (cached)"),
    description: translate("get_moon_phase.description"),
    endpoint: {
      path: "/weather/moon-phase",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.MOON_PHASE),
      },
    },
  },

  // ── Pollen Forecast ────────────────────────────────────────
  {
    name: "get_pollen_forecast",
    dataSource: onDemand("Google Pollen API (cached)"),
    description: translate("get_pollen_forecast.description"),
    endpoint: {
      path: "/weather/pollen/today",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.POLLEN),
      },
    },
  },

  // ── Weather Warnings ───────────────────────────────────────
  {
    name: "get_canada_weather_warnings",
    dataSource: onDemand("Environment Canada"),
    description: translate("get_canada_weather_warnings.description"),
    endpoint: {
      path: "/weather/warnings",
      queryParams: ["regionCode", "fields"],
    },
    parameters: {
      type: "object",
      properties: {
        regionCode: {
          type: "string",
          description: translate("get_canada_weather_warnings.params.regionCode"),
        },
        ...fieldsParam(FIELDS.WEATHER_WARNINGS),
      },
    },
  },

  // ── Detailed Air Quality ───────────────────────────────────
  {
    name: "get_detailed_air_quality",
    dataSource: onDemand("Google Air Quality API (cached)"),
    description: translate("get_detailed_air_quality.description"),
    endpoint: {
      path: "/weather/airquality/google",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.GOOGLE_AIR_QUALITY),
      },
    },
  },



  // ── RSS Feed Reader ────────────────────────────────────────
  {
    name: "read_rss_feed",
    dataSource: onDemand("xml2js"),
    description: translate("read_rss_feed.description"),
    endpoint: {
      path: "/knowledge/rss/feed",
      queryParams: ["url", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_rss_feed.params.url"),
        },
        limit: {
          type: "number",
          description: translate("read_rss_feed.params.limit"),
        },
      },
      required: ["url"],
    },
  },

  // ── PyPI Package ───────────────────────────────────────────
  {
    name: "get_pypi_package",
    dataSource: onDemand("PyPI JSON API"),
    description: translate("get_pypi_package.description"),
    endpoint: {
      path: "/knowledge/pypi/package",
      queryParams: ["name"],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: translate("get_pypi_package.params.name"),
        },
      },
      required: ["name"],
    },
  },

  // ── Events (4 → 1) ────────────────────────────────────────
  {
    name: "get_events",
    dataSource: onDemand("Beacon event aggregation"),
    description: translate("get_events.description"),
    endpoint: {
      path: "/event/events",
      queryParams: ["action", "q", "source", "category", "city", "days", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_events.params.action"),
          enum: ["search", "upcoming", "today", "summary"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        city: {
          type: "string",
          description: translate("get_events.params.city"),
        },
        source: {
          type: "string",
          description: translate("get_events.params.source"),
        },
        category: {
          type: "string",
          description: translate("get_events.params.category"),
        },
        days: {
          type: "number",
          description: translate("get_events.params.days"),
        },
        limit: { type: "number", description: translate("get_events.params.limit") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action"],
    },
  },

  // ── Commodities (5 → 1) ───────────────────────────────────
  {
    name: "get_commodities",
    dataSource: onDemand("YAML-sourced commodities"),
    description: translate("get_commodities.description"),
    endpoint: {
      path: "/market/commodities/data",
      queryParams: ["action", "category", "ticker", "hours"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["summary", "category", "ticker", "categories", "history"],
        },
        category: {
          type: "string",
          description: translate("get_commodities.params.category"),
        },
        ticker: {
          type: "string",
          description: translate("get_commodities.params.ticker"),
        },
        hours: {
          type: "number",
          description: translate("get_commodities.params.hours"),
        },
        ...fieldsParam(FIELDS.COMMODITY),
      },
      required: ["action"],
    },
  },

  // ── Trends (3 → 1) ────────────────────────────────────────
  {
    name: "get_trends",
    dataSource: onDemand("Trend aggregation"),
    description: translate("get_trends.description"),
    endpoint: {
      path: "/trend/data",
      queryParams: ["action", "source", "hours", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_trends.params.action"),
          enum: ["current", "hot", "top"],
        },
        source: {
          type: "string",
          description: translate("get_trends.params.source"),
        },
        hours: {
          type: "number",
          description: translate("get_trends.params.hours"),
        },
        limit: { type: "number", description: translate("get_trends.params.limit") },
        ...fieldsParam(FIELDS.TRENDS),
      },
      required: ["action"],
    },
  },

  // ── Products ───────────────────────────────────────────────
  {
    name: "search_products",
    dataSource: cached(
      "Amazon / eBay / Etsy / ProductHunt / Costco",
      AMAZON_INTERVAL_MS,
    ),
    description: translate("search_products.description"),
    endpoint: {
      path: "/product/products/search",
      queryParams: ["q", "category", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_products.params.q"),
        },
        category: {
          type: "string",
          description: translate("search_products.params.category"),
        },
        limit: {
          type: "number",
          description: translate("search_products.params.limit"),
        },
        ...fieldsParam(FIELDS.PRODUCTS),
      },
      required: ["fields"],
    },
  },
  {
    name: "get_trending_products",
    dataSource: cached(
      "Amazon / eBay / Etsy / ProductHunt / Costco",
      AMAZON_INTERVAL_MS,
    ),
    description: translate("get_trending_products.description"),
    endpoint: {
      path: "/product/products/trending",
      queryParams: ["limit"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: translate("get_trending_products.params.limit"),
        },
        ...fieldsParam(FIELDS.PRODUCTS),
      },
      required: ["fields"],
    },
  },
  {
    name: "get_watchlist_availability",
    dataSource: cached("Best Buy Canada", BESTBUY_CA_AVAILABILITY_INTERVAL_MS),
    description: translate("get_watchlist_availability.description"),
    endpoint: { path: "/product/products/availability" },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.PRODUCT_AVAILABILITY) },
      required: ["fields"],
    },
  },
  {
    name: "check_sku_availability",
    dataSource: onDemand("Best Buy Canada"),
    description: translate("check_sku_availability.description"),
    endpoint: {
      path: "/product/products/availability/check",
      queryParams: ["skus"],
    },
    parameters: {
      type: "object",
      properties: {
        skus: {
          type: "string",
          description: translate("check_sku_availability.params.skus"),
        },
        ...fieldsParam(FIELDS.PRODUCT_AVAILABILITY),
      },
      required: ["skus", "fields"],
    },
  },
  {
    name: "get_costco_us_products",
    dataSource: cached("Costco US", COSTCO_INTERVAL_MS),
    description: translate("get_costco_us_products.description"),
    endpoint: {
      path: "/product/products/source/costco_us",
    },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.PRODUCTS) },
      required: ["fields"],
    },
  },
  {
    name: "get_costco_ca_products",
    dataSource: cached("Costco Canada", COSTCO_INTERVAL_MS),
    description: translate("get_costco_ca_products.description"),
    endpoint: {
      path: "/product/products/source/costco_ca",
    },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.PRODUCTS) },
      required: ["fields"],
    },
  },
  {
    name: "search_amazon_products",
    dataSource: cached("Amazon", AMAZON_INTERVAL_MS),
    description: translate("search_amazon_products.description"),
    endpoint: {
      path: "/product/products/source/amazon",
    },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.PRODUCTS) },
      required: ["fields"],
    },
  },

  // ── Finance / Stocks (Finnhub) ─────────────────────────────
  {
    name: "get_market_news",
    dataSource: cached("Finnhub", FINNHUB_NEWS_INTERVAL_MS),
    description: translate("get_market_news.description"),
    endpoint: {
      path: "/finance/news",
      queryParams: ["symbol"],
    },
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: translate("get_market_news.params.symbol"),
        },
        ...fieldsParam(FIELDS.MARKET_NEWS),
      },
      required: ["fields"],
    },
  },
  {
    name: "get_earnings_calendar",
    dataSource: cached("Finnhub", FINNHUB_EARNINGS_INTERVAL_MS),
    description: translate("get_earnings_calendar.description"),
    endpoint: { path: "/finance/earnings" },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.EARNINGS) },
      required: ["fields"],
    },
  },

  // ── Finance: Stocks (4 → 1) ───────────────────────────────────
  {
    name: "get_stock",
    dataSource: onDemand("Finnhub API"),
    description: translate("get_stock.description"),
    endpoint: {
      path: "/finance/stock/data",
      queryParams: ["action", "symbol"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_stock.params.action"),
          enum: ["quote", "profile", "recommendation", "financials"],
        },
        symbol: {
          type: "string",
          description: translate("get_stock.params.symbol"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action", "symbol"],
    },
  },

  // ── Finance: Macro/FRED (4 → 1) ───────────────────────────────
  {
    name: "get_macro",
    dataSource: onDemand("FRED (Federal Reserve)"),
    description: translate("get_macro.description"),
    endpoint: {
      path: "/finance/macro/data",
      queryParams: [
        "action",
        "q",
        "seriesId",
        "limit",
        "orderBy",
        "sortOrder",
        "observationStart",
        "observationEnd",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["indicators", "search", "series", "observations"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        seriesId: {
          type: "string",
          description: translate("get_macro.params.seriesId"),
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        orderBy: { type: "string", description: translate("get_macro.params.orderBy") },
        sortOrder: {
          type: "string",
          enum: ["asc", "desc"],
          description: translate("get_macro.params.sortOrder"),
        },
        observationStart: {
          type: "string",
          description: translate("get_macro.params.observationStart"),
        },
        observationEnd: {
          type: "string",
          description: translate("get_macro.params.observationEnd"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action"],
    },
  },

  // ── Finance: Historical Prices ─────────────────────────────────
  {
    name: "get_historical_prices",
    dataSource: onDemand("Yahoo Finance"),
    description: translate("get_historical_prices.description"),
    endpoint: {
      path: "/finance/prices/:symbol",
      pathParams: ["symbol"],
      queryParams: ["interval", "period"],
    },
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: translate("get_historical_prices.params.symbol"),
        },
        interval: {
          type: "string",
          description: translate("get_historical_prices.params.interval"),
          enum: ["1m", "5m", "15m", "1h", "1d", "1wk", "1mo"],
        },
        period: {
          type: "string",
          description: translate("get_historical_prices.params.period"),
          enum: ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd", "max"],
        },
        ...fieldsParam(FIELDS.HISTORICAL_PRICES),
      },
      required: ["symbol"],
    },
  },

  // ── Finance: Technical Analysis ────────────────────────────────
  {
    name: "get_technical_analysis",
    dataSource: onDemand("Yahoo Finance + technicalindicators"),
    description: translate("get_technical_analysis.description"),
    endpoint: {
      path: "/finance/technical/:symbol",
      pathParams: ["symbol"],
      queryParams: ["indicators", "period", "interval"],
    },
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: translate("get_technical_analysis.params.symbol"),
        },
        indicators: {
          type: "string",
          description: translate("get_technical_analysis.params.indicators"),
        },
        period: {
          type: "number",
          description: translate("get_technical_analysis.params.period"),
        },
        interval: {
          type: "string",
          description: translate("get_technical_analysis.params.interval"),
          enum: ["1d", "1wk", "1mo"],
        },
        ...fieldsParam(FIELDS.TECHNICAL_ANALYSIS),
      },
      required: ["symbol"],
    },
  },

  // ── Finance: Volatility Dashboard ──────────────────────────────
  {
    name: "get_volatility",
    dataSource: onDemand("Yahoo Finance"),
    description: translate("get_volatility.description"),
    endpoint: {
      path: "/finance/volatility",
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.VOLATILITY),
      },
    },
  },

  // ── Finance: Fear & Greed Index ────────────────────────────────
  {
    name: "get_fear_greed_index",
    dataSource: onDemand("Alternative.me (cached)"),
    description: translate("get_fear_greed_index.description"),
    endpoint: {
      path: "/finance/fear-greed",
      queryParams: ["limit"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: translate("get_fear_greed_index.params.limit"),
        },
        ...fieldsParam(FIELDS.FEAR_GREED),
      },
    },
  },

  // ── Finance: SEC EDGAR Filings ─────────────────────────────────
  {
    name: "get_sec_filings",
    dataSource: onDemand("SEC EDGAR (public)"),
    description: translate("get_sec_filings.description"),
    endpoint: {
      path: "/finance/sec/filings/:cik",
      pathParams: ["cik"],
      queryParams: ["filingType", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["filings", "search", "facts"],
        },
        cik: {
          type: "string",
          description: translate("get_sec_filings.params.cik"),
        },
        "q": {
          type: "string",
          description: translate("get_sec_filings.params.q"),
        },
        filingType: {
          type: "string",
          description: translate("get_sec_filings.params.filingType"),
        },
        limit: {
          type: "number",
          description: translate("get_sec_filings.params.limit"),
        },
        ...fieldsParam(FIELDS.SEC_FILINGS),
      },
      required: ["action"],
    },
  },

  // ── Finance: Sector Performance ────────────────────────────────
  {
    name: "get_sector_performance",
    dataSource: onDemand("Yahoo Finance (Sector SPDRs)"),
    description: translate("get_sector_performance.description"),
    endpoint: {
      path: "/finance/sectors",
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.SECTOR_PERFORMANCE),
      },
    },
  },

  // ── Knowledge (consolidated tools) ────────────────────────────
  {
    name: "search_books",
    dataSource: onDemand("Open Library API"),
    description: translate("search_books.description"),
    endpoint: {
      path: "/knowledge/books/lookup",
      queryParams: ["action", "q", "workKey", "authorKey", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("search_books.params.action"),
          enum: ["search", "work", "author"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        workKey: {
          type: "string",
          description: translate("search_books.params.workKey"),
        },
        authorKey: {
          type: "string",
          description: translate("search_books.params.authorKey"),
        },
        limit: {
          type: "number",
          description: translate("search_books.params.limit"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_country",
    dataSource: onDemand("REST Countries + World Bank"),
    description: translate("get_country.description"),
    endpoint: {
      path: "/knowledge/countries/data",
      queryParams: [
        "action",
        "name",
        "code",
        "indicator",
        "countries",
        "limit",
        "order",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["info", "code", "indicators", "rank", "compare"],
        },
        name: { type: "string", description: translate("get_country.params.name") },
        code: {
          type: "string",
          description: translate("get_country.params.code"),
        },
        indicator: {
          type: "string",
          description: translate("get_country.params.indicator"),
        },
        countries: {
          type: "string",
          description: translate("get_country.params.countries"),
        },
        limit: {
          type: "number",
          description: translate("get_country.params.limit"),
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: translate("get_element.params.order"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_element",
    dataSource: staticDataset("Periodic Table (119 elements)"),
    description: translate("get_element.description"),
    endpoint: {
      path: "/knowledge/elements/data",
      queryParams: [
        "action",
        "q",
        "symbol",
        "property",
        "limit",
        "order",
        "category",
        "block",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["search", "lookup", "rank", "categories"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        symbol: {
          type: "string",
          description: translate("get_element.params.symbol"),
        },
        property: {
          type: "string",
          description: translate("get_exoplanet.params.field"),
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: translate("get_element.params.order"),
        },
        category: { type: "string", description: translate("get_element.params.category") },
        block: { type: "string", description: translate("get_element.params.block") },
        ...fieldsParam(FIELDS.ELEMENTS),
      },
      required: ["action"],
    },
  },
  {
    name: "get_exoplanet",
    dataSource: staticDataset("NASA Exoplanet Archive (~6,153 planets)"),
    description: translate("get_exoplanet.description"),
    endpoint: {
      path: "/knowledge/exoplanets/data",
      queryParams: ["action", "q", "name", "field", "limit", "order", "method"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["search", "lookup", "rank", "stats", "habitable"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        name: { type: "string", description: translate("get_exoplanet.params.name") },
        field: {
          type: "string",
          description: translate("get_exoplanet.params.field"),
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: translate("search_reddit.params.sort"),
        },
        method: {
          type: "string",
          description: translate("get_exoplanet.params.method"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_anime",
    dataSource: onDemand("Jikan (MyAnimeList)"),
    description: translate("get_anime.description"),
    endpoint: {
      path: "/knowledge/anime/data",
      queryParams: ["action", "q", "id", "limit", "year", "season"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["search", "top", "season", "schedule", "details"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        id: { type: "number", description: translate("get_anime.params.id") },
        year: { type: "number", description: translate("get_anime.params.year") },
        season: {
          type: "string",
          description: translate("get_anime.params.season"),
          enum: ["winter", "spring", "summer", "fall"],
        },
        limit: { type: "number", description: translate("get_anime.params.limit") },
        ...fieldsParam(FIELDS.ANIME),
      },
      required: ["action"],
    },
  },

  {
    name: "get_word_definition",
    dataSource: onDemand("Free Dictionary API"),
    description: translate("get_word_definition.description"),
    endpoint: {
      path: "/knowledge/dictionary/:word",
      pathParams: ["word"],
    },
    parameters: {
      type: "object",
      properties: {
        word: {
          type: "string",
          description: translate("get_word_definition.params.word"),
        },
        ...fieldsParam(FIELDS.DICTIONARY),
      },
      required: ["word"],
    },
  },
  {
    name: "search_papers",
    dataSource: onDemand("arXiv"),
    description: translate("search_papers.description"),
    endpoint: {
      path: "/knowledge/papers/search",
      queryParams: ["q", "category", "limit", "sortBy"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_papers.params.q"),
        },
        category: {
          type: "string",
          description: translate("search_papers.params.category"),
        },
        limit: {
          type: "number",
          description: translate("search_papers.params.limit"),
        },
        sortBy: {
          type: "string",
          description: translate("search_papers.params.sortBy"),
          enum: ["relevance", "lastUpdatedDate", "submittedDate"],
        },
        ...fieldsParam(FIELDS.PAPERS),
      },
      required: ["q"],
    },
  },
  {
    name: "search_youtube",
    dataSource: onDemand("YouTube Data API v3"),
    description: translate("search_youtube.description"),
    endpoint: {
      path: "/knowledge/youtube/search",
      queryParams: ["q", "limit", "order", "channelId", "publishedAfter", "publishedBefore", "videoDuration", "safeSearch", "regionCode", "relevanceLanguage"],
    },
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: translate("search_youtube.params.q"),
        },
        limit: {
          type: "number",
          description: translate("search_youtube.params.limit"),
        },
        order: {
          type: "string",
          enum: ["relevance", "date", "rating", "viewCount", "title"],
          description: translate("search_youtube.params.order"),
        },
        channelId: {
          type: "string",
          description: translate("search_youtube.params.channelId"),
        },
        publishedAfter: {
          type: "string",
          description: translate("search_youtube.params.publishedAfter"),
        },
        publishedBefore: {
          type: "string",
          description: translate("search_youtube.params.publishedBefore"),
        },
        videoDuration: {
          type: "string",
          enum: ["any", "short", "medium", "long"],
          description: translate("search_youtube.params.videoDuration"),
        },
        safeSearch: {
          type: "string",
          enum: ["moderate", "strict", "none"],
          description: translate("search_youtube.params.safeSearch"),
        },
        regionCode: {
          type: "string",
          description: translate("search_youtube.params.regionCode"),
        },
        relevanceLanguage: {
          type: "string",
          description: translate("search_youtube.params.relevanceLanguage"),
        },
        ...fieldsParam(FIELDS.YOUTUBE_SEARCH),
      },
      required: ["q"],
    },
  },
  {
    name: "get_youtube_video",
    dataSource: onDemand("YouTube oEmbed + youtube-transcript"),
    description: translate("get_youtube_video.description"),
    endpoint: {
      path: "/knowledge/youtube/video",
      queryParams: ["url", "lang", "transcript", "timestamps"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("get_youtube_video.params.url"),
        },
        lang: {
          type: "string",
          description: translate("get_youtube_video.params.lang"),
        },
        transcript: {
          type: "string",
          description: translate("get_youtube_video.params.transcript"),
          enum: ["true", "false"],
        },
        timestamps: {
          type: "string",
          description: translate("get_youtube_video.params.timestamps"),
          enum: ["true", "false"],
        },
        ...fieldsParam(FIELDS.YOUTUBE_VIDEO),
      },
      required: ["url"],
    },
  },
  {
    name: "download_video",
    dataSource: onDemand("yt-dlp + ffmpeg"),
    description: translate("download_video.description"),
    endpoint: {
      path: "/knowledge/video/download",
      queryParams: ["url", "format"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("download_video.params.url"),
        },
        format: {
          type: "string",
          enum: ["mp4", "mp3", "gif"],
          description: translate("download_video.params.format"),
        },
      },
      required: ["url"],
    },
  },
  {
    name: "trim_video",
    dataSource: onDemand("ffmpeg"),
    description: translate("trim_video.description"),
    endpoint: {
      method: "POST",
      path: "/knowledge/video/trim",
      bodyParams: ["url", "start", "end"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("trim_video.params.url"),
        },
        start: {
          type: "string",
          description: translate("trim_video.params.start"),
        },
        end: {
          type: "string",
          description: translate("trim_video.params.end"),
        },
      },
      required: ["url"],
    },
  },

  // ── Unified Web Extraction Tools ─────────────────────────────
  {
    name: "read_url",
    dataSource: onDemand("Auto-detected platform API"),
    description: translate("read_url.description"),
    endpoint: {
      path: "/knowledge/web/content",
      queryParams: [
        "url",
        "commentLimit",
        "answerLimit",
        "readme",
        "languages",
        "transcript",
        "lang",
        "maxChars",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_url.params.url"),
        },
        commentLimit: {
          type: "number",
          description: translate("read_url.params.commentLimit"),
        },
        answerLimit: {
          type: "number",
          description: translate("read_url.params.answerLimit"),
        },
        readme: {
          type: "string",
          description: translate("read_url.params.readme"),
          enum: ["true", "false"],
        },
        languages: {
          type: "string",
          description: translate("read_url.params.languages"),
          enum: ["true", "false"],
        },
        transcript: {
          type: "string",
          description: translate("read_url.params.transcript"),
          enum: ["true", "false"],
        },
        lang: {
          type: "string",
          description: translate("read_url.params.lang"),
        },
        maxChars: {
          type: "number",
          description: translate("read_url.params.maxChars"),
        },
      },
      required: ["url"],
    },
  },
  {
    name: "get_package_info",
    dataSource: onDemand("NPM Registry / PyPI JSON API"),
    description: translate("get_package_info.description"),
    endpoint: {
      path: "/knowledge/package/info",
      queryParams: ["name", "registry", "readme"],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: translate("get_package_info.params.name"),
        },
        registry: {
          type: "string",
          description: translate("get_package_info.params.registry"),
          enum: ["npm", "pypi"],
        },
        readme: {
          type: "string",
          description: translate("get_package_info.params.readme"),
          enum: ["true", "false"],
        },
      },
      required: ["name", "registry"],
    },
  },
  {
    name: "get_wikipedia_summary",
    dataSource: onDemand("Wikipedia REST API"),
    description: translate("get_wikipedia_summary.description"),
    endpoint: {
      path: "/knowledge/wikipedia/summary/:title",
      pathParams: ["title"],
    },
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: translate("get_wikipedia_summary.params.title"),
        },
        ...fieldsParam(FIELDS.WIKIPEDIA_SUMMARY),
      },
      required: ["title"],
    },
  },
  {
    name: "get_on_this_day",
    dataSource: onDemand("Wikipedia REST API"),
    description: translate("get_on_this_day.description"),
    endpoint: {
      path: "/knowledge/wikipedia/onthisday",
      queryParams: ["type", "month", "day"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: translate("get_on_this_day.params.type"),
          enum: ["selected", "births", "deaths", "events", "holidays"],
        },
        month: {
          type: "number",
          description: translate("get_on_this_day.params.month"),
        },
        day: {
          type: "number",
          description: translate("get_on_this_day.params.day"),
        },
        ...fieldsParam(FIELDS.ON_THIS_DAY),
      },
    },
  },
  {
    name: "search_reddit",
    dataSource: onDemand("Reddit API"),
    description: translate("search_reddit.description"),
    endpoint: {
      path: "/knowledge/reddit/search",
      queryParams: [
        "q",
        "subreddit",
        "type",
        "sort",
        "t",
        "limit",
        "maxPages",
        "nsfw",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        "q": { type: "string", description: translate("search_reddit.params.q") },
        subreddit: {
          type: "string",
          description: translate("search_reddit.params.subreddit"),
        },
        type: {
          type: "string",
          enum: ["link", "comment"],
          description: translate("search_reddit.params.type"),
        },
        sort: {
          type: "string",
          enum: ["relevance", "new", "hot", "top", "comments"],
          description: translate("search_reddit.params.sort"),
        },
        "t": {
          type: "string",
          enum: ["hour", "day", "week", "month", "year", "all"],
          description: translate("search_reddit.params.t"),
        },
        limit: {
          type: "number",
          description: translate("search_reddit.params.limit"),
        },
        maxPages: {
          type: "number",
          description: translate("search_reddit.params.maxPages"),
        },
        nsfw: {
          type: "string",
          enum: ["true", "false"],
          description: translate("search_reddit.params.nsfw"),
        },
      },
      required: ["q"],
    },
  },
  {
    name: "search_reddit_subreddits",
    dataSource: onDemand("Reddit API"),
    description: translate("search_reddit_subreddits.description"),
    endpoint: {
      path: "/knowledge/reddit/subreddits/search",
      queryParams: ["q", "limit", "nsfw"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_reddit_subreddits.params.q"),
        },
        limit: {
          type: "number",
          description: translate("search_reddit_subreddits.params.limit"),
        },
        nsfw: {
          type: "string",
          enum: ["true", "false"],
          description: translate("search_reddit_subreddits.params.nsfw"),
        },
      },
      required: ["q"],
    },
  },
  {
    name: "get_reddit_subreddit_info",
    dataSource: onDemand("Reddit API"),
    description: translate("get_reddit_subreddit_info.description"),
    endpoint: {
      path: "/knowledge/reddit/r/:subreddit/info",
      pathParams: ["subreddit"],
    },
    parameters: {
      type: "object",
      properties: {
        subreddit: {
          type: "string",
          description: translate("get_reddit_subreddit_info.params.subreddit"),
        },
      },
      required: ["subreddit"],
    },
  },
  {
    name: "get_reddit_subreddit_feed",
    dataSource: onDemand("Reddit API"),
    description: translate("get_reddit_subreddit_feed.description"),
    endpoint: {
      path: "/knowledge/reddit/r/:subreddit/feed",
      pathParams: ["subreddit"],
      queryParams: ["sort", "t", "limit", "pinned"],
    },
    parameters: {
      type: "object",
      properties: {
        subreddit: { type: "string", description: translate("common.params.subredditName") },
        sort: {
          type: "string",
          enum: ["hot", "new", "top", "rising", "controversial"],
          description: translate("get_reddit_subreddit_feed.params.sort"),
        },
        "t": {
          type: "string",
          enum: ["hour", "day", "week", "month", "year", "all"],
          description: translate("get_reddit_subreddit_feed.params.t"),
        },
        limit: {
          type: "number",
          description: translate("get_reddit_subreddit_feed.params.limit"),
        },
        pinned: {
          type: "string",
          enum: ["true", "false"],
          description: translate("get_reddit_subreddit_feed.params.pinned"),
        },
      },
      required: ["subreddit"],
    },
  },
  {
    name: "get_reddit_subreddit_rules",
    dataSource: onDemand("Reddit API"),
    description: translate("get_reddit_subreddit_rules.description"),
    endpoint: {
      path: "/knowledge/reddit/r/:subreddit/rules",
      pathParams: ["subreddit"],
    },
    parameters: {
      type: "object",
      properties: {
        subreddit: { type: "string", description: translate("common.params.subredditName") },
      },
      required: ["subreddit"],
    },
  },
  {
    name: "get_reddit_subreddit_wiki_pages",
    dataSource: onDemand("Reddit API"),
    description: translate("get_reddit_subreddit_wiki_pages.description"),
    endpoint: {
      path: "/knowledge/reddit/r/:subreddit/wiki",
      pathParams: ["subreddit"],
    },
    parameters: {
      type: "object",
      properties: {
        subreddit: { type: "string", description: translate("common.params.subredditName") },
      },
      required: ["subreddit"],
    },
  },
  {
    name: "get_reddit_subreddit_wiki_page",
    dataSource: onDemand("Reddit API"),
    description: translate("get_reddit_subreddit_wiki_page.description"),
    endpoint: {
      path: "/knowledge/reddit/r/:subreddit/wiki/:page",
      pathParams: ["subreddit", "page"],
    },
    parameters: {
      type: "object",
      properties: {
        subreddit: { type: "string", description: translate("common.params.subredditName") },
        page: {
          type: "string",
          description: translate("get_reddit_subreddit_wiki_page.params.page"),
        },
      },
      required: ["subreddit", "page"],
    },
  },
  {
    name: "get_reddit_user_history",
    dataSource: onDemand("Reddit API"),
    description: translate("get_reddit_user_history.description"),
    endpoint: {
      path: "/knowledge/reddit/user/:username",
      pathParams: ["username"],
      queryParams: ["category", "limit", "maxPages", "sort", "t"],
    },
    parameters: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: translate("get_reddit_user_history.params.username"),
        },
        category: {
          type: "string",
          enum: ["overview", "comments", "submitted", "gilded"],
          description: translate("get_reddit_user_history.params.category"),
        },
        limit: {
          type: "number",
          description: translate("get_reddit_user_history.params.limit"),
        },
        maxPages: {
          type: "number",
          description: translate("get_reddit_user_history.params.maxPages"),
        },
        sort: {
          type: "string",
          enum: ["new", "hot", "top", "controversial"],
          description: translate("get_reddit_user_history.params.sort"),
        },
        "t": {
          type: "string",
          enum: ["hour", "day", "week", "month", "year", "all"],
          description: translate("get_reddit_user_history.params.t"),
        },
      },
      required: ["username"],
    },
  },
  {
    name: "get_reddit_user_profile",
    dataSource: onDemand("Reddit API"),
    description: translate("get_reddit_user_profile.description"),
    endpoint: {
      path: "/knowledge/reddit/user/:username/profile",
      pathParams: ["username"],
    },
    parameters: {
      type: "object",
      properties: {
        username: { type: "string", description: translate("get_reddit_user_profile.params.username") },
      },
      required: ["username"],
    },
  },



  // ── Movies & TV (12 → 6 unified + get_tv_season_details) ──────
  {
    name: "search_media",
    dataSource: onDemand("TMDB API"),
    description: translate("search_media.description"),
    endpoint: {
      path: "/knowledge/media/search",
      queryParams: ["type", "q", "year", "page"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("search_media.params.type"),
        },
        "q": { type: "string", description: translate("search_media.params.q") },
        year: {
          type: "number",
          description: translate("search_media.params.year"),
        },
        page: { type: "number", description: translate("search_media.params.page") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type", "q"],
    },
  },
  {
    name: "get_media_details",
    dataSource: onDemand("TMDB API"),
    description: translate("get_media_details.description"),
    endpoint: {
      path: "/knowledge/media/:id",
      pathParams: ["id"],
      queryParams: ["type"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        id: { type: "number", description: translate("get_media_details.params.id") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type", "id"],
    },
  },
  {
    name: "get_media_credits",
    dataSource: onDemand("TMDB API"),
    description: translate("get_media_credits.description"),
    endpoint: {
      path: "/knowledge/media/:id/credits",
      pathParams: ["id"],
      queryParams: ["type"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        id: { type: "number", description: translate("get_media_credits.params.id") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type", "id"],
    },
  },
  {
    name: "get_trending_media",
    dataSource: onDemand("TMDB API"),
    description: translate("get_trending_media.description"),
    endpoint: {
      path: "/knowledge/media/trending",
      queryParams: ["type", "timeWindow", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        timeWindow: {
          type: "string",
          enum: ["day", "week"],
          description: translate("get_trending_media.params.timeWindow"),
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type"],
    },
  },
  {
    name: "browse_media",
    dataSource: onDemand("TMDB API"),
    description: translate("browse_media.description"),
    endpoint: {
      path: "/knowledge/media/discover",
      queryParams: [
        "type",
        "genreId",
        "year",
        "sortBy",
        "page",
        "minVoteAverage",
        "minVoteCount",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        genreId: {
          type: "number",
          description: translate("browse_media.params.genreId"),
        },
        year: { type: "number", description: translate("browse_media.params.year") },
        sortBy: {
          type: "string",
          description: translate("browse_media.params.sortBy"),
        },
        minVoteAverage: {
          type: "number",
          description: translate("browse_media.params.minVoteAverage"),
        },
        minVoteCount: { type: "number", description: translate("browse_media.params.minVoteCount") },
        page: { type: "number", description: translate("browse_media.params.page") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type"],
    },
  },
  {
    name: "get_media_genres",
    dataSource: onDemand("TMDB API"),
    description: translate("get_media_genres.description"),
    endpoint: {
      path: "/knowledge/media/genres",
      queryParams: ["type"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
      },
      required: ["type"],
    },
  },

  // ── TV Series (TV-only) ────────────────────────────────────────

  // ── Now Playing / Upcoming / Airing ────────────────────────────
  {
    name: "get_now_playing_media",
    dataSource: onDemand("TMDB API"),
    description: translate("get_now_playing_media.description"),
    endpoint: {
      path: "/knowledge/media/now-playing",
      queryParams: ["action", "region", "page", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["now_playing", "upcoming", "airing_today", "on_the_air"],
          description: translate("get_now_playing_media.params.action"),
        },
        region: {
          type: "string",
          description: translate("get_now_playing_media.params.region"),
        },
        page: { type: "number", description: translate("get_now_playing_media.params.page") },
        limit: { type: "number", description: translate("get_now_playing_media.params.limit") },
      },
      required: ["action"],
    },
  },

  // ── Media Recommendations & Similar ────────────────────────────
  {
    name: "get_media_recommendations",
    dataSource: onDemand("TMDB API"),
    description: translate("get_media_recommendations.description"),
    endpoint: {
      path: "/knowledge/media/:id/recommendations",
      pathParams: ["id"],
      queryParams: ["type", "action", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        id: { type: "number", description: translate("get_media_recommendations.params.id") },
        action: {
          type: "string",
          enum: ["recommendations", "similar"],
          description: translate("get_media_recommendations.params.action"),
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
      },
      required: ["type", "id", "action"],
    },
  },

  // ── Person / Actor Search ──────────────────────────────────────
  {
    name: "search_person",
    dataSource: onDemand("TMDB API"),
    description: translate("search_person.description"),
    endpoint: {
      path: "/knowledge/person/search",
      queryParams: ["action", "q", "id", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "details", "filmography"],
          description: translate("search_person.params.action"),
        },
        "q": { type: "string", description: translate("search_person.params.q") },
        id: { type: "number", description: translate("search_person.params.id") },
        limit: { type: "number", description: translate("search_person.params.limit") },
        ...fieldsParam(FIELDS.PERSON),
      },
      required: ["action"],
    },
  },

  // ── Watch Providers ────────────────────────────────────────────
  {
    name: "get_watch_providers",
    dataSource: onDemand("TMDB API (JustWatch data)"),
    description: translate("get_watch_providers.description"),
    endpoint: {
      path: "/knowledge/media/:id/watch-providers",
      pathParams: ["id"],
      queryParams: ["type", "region"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        id: { type: "number", description: translate("get_watch_providers.params.id") },
        region: {
          type: "string",
          description: translate("get_watch_providers.params.region"),
        },
      },
      required: ["type", "id"],
    },
  },

  // ── Health (consolidated tools) ────────────────────────────────
  {
    name: "rank_foods_by_category",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("rank_foods_by_category.description"),
    endpoint: {
      path: "/health/nutrition/top",
      queryParams: ["category", "nutrient", "limit", "kingdom", "foodType"],
    },
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: translate("rank_foods_by_category.params.category"),
          enum: [
            "macros",
            "minerals",
            "vitamins",
            "amino_acids",
            "lipids",
            "carbs",
            "sterols",
          ],
        },
        nutrient: {
          type: "string",
          description: translate("rank_foods_by_category.params.nutrient"),
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        kingdom: { type: "string", enum: ["animalia", "plantae", "fungi"] },
        foodType: { type: "string" },
        ...fieldsParam(FIELDS.USDA_NUTRIENT_RANKING),
      },
      required: ["category", "nutrient"],
    },
  },
  {
    name: "search_drugs",
    dataSource: onDemand("OpenFDA + FDA NDC API"),
    description: translate("search_drugs.description"),
    endpoint: {
      path: "/health/drugs/unified",
      queryParams: ["q", "searchBy", "limit", "dosageForm", "productType"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_drugs.params.q"),
        },
        searchBy: {
          type: "string",
          description: translate("search_drugs.params.searchBy"),
          enum: [
            "name",
            "ndc_search",
            "ndc_lookup",
            "ingredient",
            "pharm_class",
          ],
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        dosageForm: {
          type: "string",
          description: translate("search_drugs.params.dosageForm"),
        },
        productType: {
          type: "string",
          description: translate("search_drugs.params.productType"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["q"],
    },
  },

  {
    name: "get_drug_adverse_events",
    dataSource: onDemand("openFDA"),
    description: translate("get_drug_adverse_events.description"),
    endpoint: {
      path: "/health/drugs/adverse-events",
      queryParams: ["drug", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        drug: {
          type: "string",
          description: translate("get_drug_adverse_events.params.drug"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        ...fieldsParam(FIELDS.DRUG_ADVERSE_EVENTS),
      },
      required: ["drug"],
    },
  },
  {
    name: "get_drug_recalls",
    dataSource: onDemand("openFDA"),
    description: translate("get_drug_recalls.description"),
    endpoint: {
      path: "/health/drugs/recalls",
      queryParams: ["q", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("get_drug_recalls.params.q"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        ...fieldsParam(FIELDS.DRUG_RECALLS),
      },
    },
  },

  // ── Gym Exercises (Free Exercise DB & Wger) ─────────────────
  {
    name: "search_gym_exercises",
    dataSource: staticDataset("Free Exercise DB & Wger"),
    description: translate("search_gym_exercises.description"),
    endpoint: {
      path: "/health/exercises/search",
      queryParams: [
        "q",
        "limit",
        "category",
        "equipment",
        "force",
        "level",
        "mechanic",
        "muscle",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_gym_exercises.params.q"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        category: {
          type: "string",
          description: translate("search_gym_exercises.params.category"),
        },
        equipment: {
          type: "string",
          description: translate("search_gym_exercises.params.equipment"),
        },
        force: {
          type: "string",
          description: translate("search_gym_exercises.params.force"),
        },
        level: {
          type: "string",
          description: translate("search_gym_exercises.params.level"),
        },
        mechanic: {
          type: "string",
          description: translate("search_gym_exercises.params.mechanic"),
        },
        muscle: {
          type: "string",
          description: translate("search_gym_exercises.params.muscle"),
        },
        ...fieldsParam(FIELDS.EXERCISES),
      },
    },
  },
  {
    name: "get_gym_exercise_categories",
    dataSource: staticDataset("Free Exercise DB & Wger"),
    description: translate("get_gym_exercise_categories.description"),
    endpoint: {
      path: "/health/exercises/categories",
      queryParams: [],
    },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_gym_exercise_by_id",
    dataSource: staticDataset("Free Exercise DB & Wger"),
    description: translate("get_gym_exercise_by_id.description"),
    endpoint: {
      path: "/health/exercises/{id}",
      pathParams: ["id"],
    },
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: translate("get_gym_exercise_by_id.params.id"),
        },
        ...fieldsParam(FIELDS.EXERCISES),
      },
      required: ["id"],
    },
  },

  // ── USDA Nutrition (Raw Whole Foods) ────────────────────────────
  {
    name: "search_usda_nutrition",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("search_usda_nutrition.description"),
    endpoint: {
      path: "/health/nutrition/search",
      queryParams: ["q", "limit", "kingdom", "foodType", "nutrientTypes"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_usda_nutrition.params.q"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        kingdom: {
          type: "string",
          description: translate("search_usda_nutrition.params.kingdom"),
          enum: ["animalia", "plantae", "fungi"],
        },
        foodType: {
          type: "string",
          description: translate("search_usda_nutrition.params.foodType"),
        },
        nutrientTypes: {
          type: "string",
          description: translate("search_usda_nutrition.params.nutrientTypes"),
        },
        ...fieldsParam(FIELDS.USDA_NUTRITION),
      },
      required: ["q"],
    },
  },
  {
    name: "rank_foods_by_nutrient",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("rank_foods_by_nutrient.description"),
    endpoint: {
      path: "/health/nutrition/rank",
      queryParams: ["nutrient", "limit", "kingdom", "foodType"],
    },
    parameters: {
      type: "object",
      properties: {
        nutrient: {
          type: "string",
          description: translate("rank_foods_by_nutrient.params.nutrient"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        kingdom: {
          type: "string",
          description: translate("rank_foods_by_nutrient.params.kingdom"),
          enum: ["animalia", "plantae", "fungi"],
        },
        foodType: {
          type: "string",
          description: translate("rank_foods_by_nutrient.params.foodType"),
        },
        ...fieldsParam(FIELDS.USDA_NUTRIENT_RANKING),
      },
      required: ["nutrient"],
    },
  },
  {
    name: "compare_food_nutrition",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("compare_food_nutrition.description"),
    endpoint: {
      path: "/health/nutrition/compare",
      queryParams: ["foods", "nutrientTypes"],
    },
    parameters: {
      type: "object",
      properties: {
        foods: {
          type: "string",
          description: translate("compare_food_nutrition.params.foods"),
        },
        nutrientTypes: {
          type: "string",
          description: translate("compare_food_nutrition.params.nutrientTypes"),
        },
        ...fieldsParam(FIELDS.USDA_NUTRITION),
      },
      required: ["foods"],
    },
  },
  {
    name: "get_food_categories",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("get_food_categories.description"),
    endpoint: {
      path: "/health/nutrition/categories",
    },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_nutrient_types",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("get_nutrient_types.description"),
    endpoint: {
      path: "/health/nutrition/nutrient-types",
    },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_category_nutrients",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("list_category_nutrients.description"),
    endpoint: {
      path: "/health/nutrition/nutrients/:category",
      pathParams: ["category"],
    },
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: translate("list_category_nutrients.params.category"),
          enum: [
            "macros",
            "minerals",
            "vitamins",
            "amino_acids",
            "lipids",
            "carbs",
            "sterols",
          ],
        },
      },
      required: ["category"],
    },
  },
  {
    name: "search_foods_by_taxonomy",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("search_foods_by_taxonomy.description"),
    endpoint: {
      path: "/health/nutrition/taxonomy/search",
      queryParams: ["rank", "value", "limit", "nutrientTypes"],
    },
    parameters: {
      type: "object",
      properties: {
        rank: {
          type: "string",
          description: translate("search_foods_by_taxonomy.params.rank"),
          enum: [
            "kingdom",
            "phylum",
            "class",
            "order",
            "suborder",
            "family",
            "subfamily",
            "tribe",
            "genus",
            "species",
            "subspecies",
            "variety",
            "form",
            "group",
            "cultivar",
            "phenotype",
          ],
        },
        value: {
          type: "string",
          description: translate("search_foods_by_taxonomy.params.value"),
        },
        limit: {
          type: "number",
          description: translate("search_foods_by_taxonomy.params.limit"),
        },
        nutrientTypes: {
          type: "string",
          description: translate("search_usda_nutrition.params.nutrientTypes"),
        },
        ...fieldsParam(FIELDS.USDA_TAXONOMY),
      },
      required: ["rank", "value"],
    },
  },
  {
    name: "get_food_taxonomy",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("get_food_taxonomy.description"),
    endpoint: {
      path: "/health/nutrition/taxonomy/tree",
      queryParams: ["rank", "parentRank", "parentValue"],
    },
    parameters: {
      type: "object",
      properties: {
        rank: {
          type: "string",
          description: translate("get_food_taxonomy.params.rank"),
          enum: [
            "kingdom",
            "phylum",
            "class",
            "order",
            "suborder",
            "family",
            "subfamily",
            "tribe",
            "genus",
            "species",
            "subspecies",
            "variety",
            "form",
            "group",
            "cultivar",
            "phenotype",
          ],
        },
        parentRank: {
          type: "string",
          description: translate("get_food_taxonomy.params.parentRank"),
          enum: [
            "kingdom",
            "phylum",
            "class",
            "order",
            "suborder",
            "family",
            "subfamily",
            "tribe",
            "genus",
            "species",
          ],
        },
        parentValue: {
          type: "string",
          description: translate("get_food_taxonomy.params.parentValue"),
        },
      },
    },
  },
  {
    name: "get_nutritional_requirements",
    dataSource: staticDataset("Multispecies Standards Database"),
    description: translate("get_nutritional_requirements.description"),
    endpoint: {
      path: "/health/nutrition/requirements",
      queryParams: [
        "species",
        "lifeStage",
        "authority",
        "weightKg",
        "caloricIntake",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        species: {
          type: "string",
          description: translate("get_nutritional_requirements.params.species"),
          enum: ["human", "canine", "feline"],
        },
        lifeStage: {
          type: "string",
          description: translate("get_nutritional_requirements.params.lifeStage"),
          enum: [
            "adult_male",
            "adult_female",
            "adult_maintenance",
            "puppy",
            "kitten",
          ],
        },
        authority: {
          type: "string",
          description: translate("get_nutritional_requirements.params.authority"),
          enum: ["US_DRI", "AAFCO", "EFSA", "NRC", "WHO", "FEDIAF"],
        },
        weightKg: {
          type: "number",
          description: translate("get_nutritional_requirements.params.weightKg"),
        },
        caloricIntake: {
          type: "number",
          description: translate("get_nutritional_requirements.params.caloricIntake"),
        },
      },
    },
  },

  // ── Calorie Calculator (BMR/TDEE) ──────────────────────────────
  {
    name: "calculate_caloric_needs",
    dataSource: compute("Mifflin-St Jeor / TDEE"),
    description: translate("calculate_caloric_needs.description"),
    endpoint: {
      path: "/health/calories/calculate",
      queryParams: [
        "sex",
        "weightKg",
        "heightCm",
        "ageYears",
        "activityLevel",
        "goal",
        "macroSplit",
        "bodyFatPct",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        sex: {
          type: "string",
          description: translate("calculate_caloric_needs.params.sex"),
          enum: ["male", "female"],
        },
        weightKg: {
          type: "number",
          description: translate("estimate_exercise_calories.params.weightKg"),
        },
        heightCm: {
          type: "number",
          description: translate("calculate_caloric_needs.params.heightCm"),
        },
        ageYears: {
          type: "number",
          description: translate("calculate_caloric_needs.params.ageYears"),
        },
        activityLevel: {
          type: "string",
          description: translate("calculate_hydration_needs.params.activityLevel"),
          enum: ["sedentary", "light", "moderate", "active", "very_active"],
        },
        goal: {
          type: "string",
          description: translate("calculate_caloric_needs.params.goal"),
          enum: ["maintain", "cut", "aggressive_cut", "lean_bulk", "bulk"],
        },
        macroSplit: {
          type: "string",
          description: translate("calculate_caloric_needs.params.macroSplit"),
          enum: ["balanced", "high_protein", "keto", "low_fat", "zone"],
        },
        "bodyFatPct": {
          type: "number",
          description: translate("calculate_caloric_needs.params.bodyFatPct"),
        },
      },
      required: ["sex", "weightKg", "heightCm", "ageYears"],
    },
  },

  // ── Nutrient Gap Analysis ───────────────────────────────────────
  {
    name: "analyze_nutrient_gaps",
    dataSource: compute("Nutrient Gap Engine"),
    description: translate("analyze_nutrient_gaps.description"),
    endpoint: {
      path: "/health/nutrition/gap-analysis",
      queryParams: [
        "foods",
        "species",
        "lifeStage",
        "authority",
        "weightKg",
        "caloricIntake",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        foods: {
          type: "array",
          description: translate("analyze_nutrient_gaps.params.foods"),
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              grams: { type: "number" },
            },
            required: ["name", "grams"],
          },
        },
        species: {
          type: "string",
          description: translate("build_meal_plan.params.species"),
          enum: ["human", "canine", "feline"],
        },
        lifeStage: {
          type: "string",
          description: translate("build_meal_plan.params.lifeStage"),
          enum: ["adult_male", "adult_female", "adult_maintenance"],
        },
        weightKg: {
          type: "number",
          description: translate("analyze_nutrient_gaps.params.weightKg"),
        },
        caloricIntake: {
          type: "number",
          description: translate("analyze_nutrient_gaps.params.caloricIntake"),
        },
      },
      required: ["foods"],
    },
  },

  // ── Food Substitute Finder ─────────────────────────────────────
  {
    name: "search_food_substitutes",
    dataSource: compute("Nutrient Similarity Engine"),
    description: translate("search_food_substitutes.description"),
    endpoint: {
      path: "/health/nutrition/substitutes",
      queryParams: [
        "food",
        "targetNutrients",
        "dietaryPreference",
        "excludeKingdom",
        "excludeFoods",
        "limit",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        food: {
          type: "string",
          description: translate("search_food_substitutes.params.food"),
        },
        targetNutrients: {
          type: "string",
          description: translate("search_food_substitutes.params.targetNutrients"),
        },
        dietaryPreference: {
          type: "string",
          description: translate("search_food_substitutes.params.dietaryPreference"),
          enum: ["vegetarian", "vegan", "pescatarian", "plant_only"],
        },
        excludeKingdom: {
          type: "string",
          description: translate("search_food_substitutes.params.excludeKingdom"),
          enum: ["animalia", "plantae", "fungi"],
        },
        excludeFoods: {
          type: "string",
          description: translate("search_food_substitutes.params.excludeFoods"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
      },
      required: ["food"],
    },
  },

  // ── Exercise Calorie Estimator ──────────────────────────────────
  {
    name: "estimate_exercise_calories",
    dataSource: compute("Compendium of Physical Activities MET Table"),
    description: translate("estimate_exercise_calories.description"),
    endpoint: {
      path: "/health/exercises/calories",
      queryParams: [
        "exercise",
        "durationMinutes",
        "weightKg",
        "intensity",
        "category",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        exercise: {
          type: "string",
          description: translate("estimate_exercise_calories.params.exercise"),
        },
        durationMinutes: {
          type: "number",
          description: translate("estimate_exercise_calories.params.durationMinutes"),
        },
        weightKg: {
          type: "number",
          description: translate("estimate_exercise_calories.params.weightKg"),
        },
        intensity: {
          type: "string",
          description: translate("estimate_exercise_calories.params.intensity"),
          enum: ["low", "moderate", "high"],
        },
        category: {
          type: "string",
          description: translate("estimate_exercise_calories.params.category"),
        },
      },
      required: ["exercise", "durationMinutes", "weightKg"],
    },
  },

  // ── Hydration Calculator ───────────────────────────────────────
  {
    name: "calculate_hydration_needs",
    dataSource: compute("ACSM Hydration Model"),
    description: translate("calculate_hydration_needs.description"),
    endpoint: {
      path: "/health/hydration/calculate",
      queryParams: [
        "weightKg",
        "activityLevel",
        "climateTemp",
        "exerciseMinutes",
        "exerciseIntensity",
        "altitudeM",
        "pregnant",
        "breastfeeding",
        "caffeineIntakeMg",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        weightKg: {
          type: "number",
          description: translate("estimate_exercise_calories.params.weightKg"),
        },
        activityLevel: {
          type: "string",
          description: translate("calculate_hydration_needs.params.activityLevel"),
          enum: ["sedentary", "light", "moderate", "active", "very_active"],
        },
        climateTemp: {
          type: "number",
          description: translate("calculate_hydration_needs.params.climateTemp"),
        },
        exerciseMinutes: {
          type: "number",
          description: translate("calculate_hydration_needs.params.exerciseMinutes"),
        },
        exerciseIntensity: {
          type: "string",
          description: translate("calculate_hydration_needs.params.exerciseIntensity"),
          enum: ["low", "moderate", "high"],
        },
        altitudeM: {
          type: "number",
          description: translate("calculate_hydration_needs.params.altitudeM"),
        },
        pregnant: {
          type: "string",
          description: translate("calculate_hydration_needs.params.pregnant"),
          enum: ["true", "false"],
        },
        breastfeeding: {
          type: "string",
          description: translate("calculate_hydration_needs.params.breastfeeding"),
          enum: ["true", "false"],
        },
        caffeineIntakeMg: {
          type: "number",
          description: translate("calculate_hydration_needs.params.caffeineIntakeMg"),
        },
      },
      required: ["weightKg"],
    },
  },

  // ── Meal Plan Builder ──────────────────────────────────────────
  {
    name: "build_meal_plan",
    dataSource: compute("Meal Optimization Engine"),
    description: translate("build_meal_plan.description"),
    endpoint: {
      path: "/health/nutrition/meal-plan",
      queryParams: [
        "caloricTarget",
        "mealsPerDay",
        "dietaryPreference",
        "excludeFoods",
        "emphasizeNutrients",
        "species",
        "lifeStage",
        "weightKg",
        "itemsPerMeal",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        caloricTarget: {
          type: "number",
          description: translate("build_meal_plan.params.caloricTarget"),
        },
        mealsPerDay: {
          type: "number",
          description: translate("build_meal_plan.params.mealsPerDay"),
        },
        dietaryPreference: {
          type: "string",
          description: translate("search_food_substitutes.params.dietaryPreference"),
          enum: ["omnivore", "vegetarian", "vegan", "pescatarian", "keto"],
        },
        excludeFoods: {
          type: "string",
          description: translate("build_meal_plan.params.excludeFoods"),
        },
        emphasizeNutrients: {
          type: "string",
          description: translate("build_meal_plan.params.emphasizeNutrients"),
        },
        species: {
          type: "string",
          description: translate("build_meal_plan.params.species"),
          enum: ["human", "canine", "feline"],
        },
        lifeStage: {
          type: "string",
          description: translate("build_meal_plan.params.lifeStage"),
          enum: ["adult_male", "adult_female", "adult_maintenance"],
        },
        weightKg: {
          type: "number",
          description: translate("build_meal_plan.params.weightKg"),
        },
        itemsPerMeal: {
          type: "number",
          description: translate("build_meal_plan.params.itemsPerMeal"),
        },
      },
      required: ["caloricTarget"],
    },
  },

  // ── Drug-Nutrient Interactions ──────────────────────────────────
  {
    name: "check_drug_nutrient_interactions",
    dataSource: staticDataset("Drug-Nutrient Interaction DB"),
    description: translate("check_drug_nutrient_interactions.description"),
    endpoint: {
      path: "/health/drugs/nutrient-interactions",
      queryParams: ["drug", "nutrients"],
    },
    parameters: {
      type: "object",
      properties: {
        drug: {
          type: "string",
          description: translate("check_drug_nutrient_interactions.params.drug"),
        },
        nutrients: {
          type: "string",
          description: translate("check_drug_nutrient_interactions.params.nutrients"),
        },
      },
      required: ["drug"],
    },
  },

  // ── Transit (TransLink Vancouver) ──────────────────────────────
  {
    name: "get_translink_next_bus",
    dataSource: onDemand("TransLink RTTI"),
    description: translate("get_translink_next_bus.description"),
    endpoint: {
      path: "/transit/nextbus/:stopNo",
      pathParams: ["stopNo"],
      queryParams: ["route"],
    },
    parameters: {
      type: "object",
      properties: {
        stopNo: {
          type: "number",
          description: translate("get_translink_next_bus.params.stopNo"),
        },
        route: {
          type: "string",
          description: translate("get_translink_next_bus.params.route"),
        },
        ...fieldsParam(FIELDS.NEXT_BUS),
      },
      required: ["stopNo"],
    },
  },
  {
    name: "get_translink_stop_info",
    dataSource: onDemand("TransLink RTTI"),
    description: translate("get_translink_stop_info.description"),
    endpoint: {
      path: "/transit/stops/:stopNo",
      pathParams: ["stopNo"],
    },
    parameters: {
      type: "object",
      properties: {
        stopNo: {
          type: "number",
          description: translate("get_translink_stop_info.params.stopNo"),
        },
        ...fieldsParam(FIELDS.STOP_INFO),
      },
      required: ["stopNo"],
    },
  },
  {
    name: "search_translink_stops_nearby",
    dataSource: onDemand("TransLink RTTI"),
    description: translate("search_translink_stops_nearby.description"),
    endpoint: {
      path: "/transit/stops/nearby",
      queryParams: ["lat", "lng", "radius"],
    },
    parameters: {
      type: "object",
      properties: {
        lat: {
          type: "number",
          description: translate("search_translink_stops_nearby.params.lat"),
        },
        lng: {
          type: "number",
          description: translate("search_translink_stops_nearby.params.lng"),
        },
        radius: {
          type: "number",
          description: translate("search_translink_stops_nearby.params.radius"),
        },
        ...fieldsParam(FIELDS.NEARBY_STOPS),
      },
    },
  },
  {
    name: "get_translink_route_info",
    dataSource: onDemand("TransLink RTTI"),
    description: translate("get_translink_route_info.description"),
    endpoint: {
      path: "/transit/routes/:routeNo",
      pathParams: ["routeNo"],
    },
    parameters: {
      type: "object",
      properties: {
        routeNo: {
          type: "string",
          description: translate("get_translink_route_info.params.routeNo"),
        },
        ...fieldsParam(FIELDS.ROUTE_INFO),
      },
      required: ["routeNo"],
    },
  },

  // ── Utilities ──────────────────────────────────────────────────
  {
    name: "execute_python",
    dataSource: compute("Python 3 subprocess"),
    description: translate("execute_python.description"),
    endpoint: {
      method: "POST",
      path: "/utility/python/execute",
      bodyParams: ["code", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: translate("execute_python.params.code"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_python.params.timeout"),
        },
      },
      required: ["code"],
    },
  },
  {
    name: "evaluate_expression",
    dataSource: compute("bignumber.js"),
    description: translate("evaluate_expression.description"),
    endpoint: {
      path: "/utility/calculate",
      queryParams: ["operation", "a", "b"],
    },
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "add",
            "subtract",
            "multiply",
            "divide",
            "modulo",
            "power",
            "sqrt",
          ],
          description: translate("evaluate_expression.params.operation"),
        },
        "a": {
          type: "string",
          description: translate("evaluate_expression.params.a"),
        },
        b: {
          type: "string",
          description: translate("evaluate_expression.params.b"),
        },
      },
      required: ["operation", "a"],
    },
  },
  {
    name: "execute_javascript",
    dataSource: compute("Node.js vm"),
    description: translate("execute_javascript.description"),
    endpoint: {
      method: "POST",
      path: "/compute/js/execute",
      bodyParams: ["code", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: translate("execute_javascript.params.code"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_javascript.params.timeout"),
        },
      },
      required: ["code"],
    },
  },
  {
    name: "execute_shell",
    dataSource: compute("bash subprocess"),
    description: translate("execute_shell.description"),
    endpoint: {
      method: "POST",
      path: "/compute/shell/execute",
      bodyParams: ["command", "stdin", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: translate("execute_shell.params.command"),
        },
        stdin: {
          type: "string",
          description: translate("execute_shell.params.stdin"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_shell.params.timeout"),
        },
      },
      required: ["command"],
    },
  },
  {
    name: "convert_units",
    dataSource: compute("convert-units"),
    description: translate("convert_units.description"),
    endpoint: {
      path: "/compute/units/convert",
      queryParams: ["value", "from", "to"],
    },
    parameters: {
      type: "object",
      properties: {
        value: {
          type: "number",
          description: translate("convert_units.params.value"),
        },
        from: {
          type: "string",
          description: translate("convert_units.params.from"),
        },
        to: {
          type: "string",
          description: translate("convert_units.params.to"),
        },
      },
      required: ["value", "from", "to"],
    },
  },
  {
    name: "parse_datetime",
    dataSource: compute("date-fns"),
    description: translate("parse_datetime.description"),
    endpoint: {
      method: "POST",
      path: "/compute/datetime/parse",
      bodyParams: [
        "operation",
        "date",
        "date2",
        "amount",
        "unit",
        "format",
        "timezone",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "now",
            "parse",
            "format",
            "diff",
            "add",
            "subtract",
            "startOf",
            "endOf",
            "isValid",
          ],
          description: translate("parse_datetime.params.operation"),
        },
        date: {
          type: "string",
          description: translate("parse_datetime.params.date"),
        },
        date2: {
          type: "string",
          description: translate("parse_datetime.params.date2"),
        },
        amount: {
          type: "integer",
          description: translate("parse_datetime.params.amount"),
        },
        unit: {
          type: "string",
          enum: [
            "years",
            "months",
            "weeks",
            "days",
            "hours",
            "minutes",
            "seconds",
            "year",
            "month",
            "week",
            "day",
            "hour",
            "minute",
          ],
          description: translate("parse_datetime.params.unit"),
        },
        format: {
          type: "string",
          description: translate("parse_datetime.params.format"),
        },
        timezone: {
          type: "string",
          description: translate("parse_datetime.params.timezone"),
        },
      },
      required: ["operation"],
    },
  },
  {
    name: "transform_json",
    dataSource: compute("jsonpath-plus"),
    description: translate("transform_json.description"),
    endpoint: {
      method: "POST",
      path: "/compute/json/transform",
      bodyParams: ["data", "expression", "operations"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "object",
          description: translate("transform_json.params.data"),
        },
        expression: {
          type: "string",
          description: translate("transform_json.params.expression"),
        },
        operations: {
          type: "array",
          description: translate("transform_json.params.operations"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "flatten",
                  "unique",
                  "sort",
                  "filter",
                  "pick",
                  "omit",
                  "groupBy",
                  "count",
                  "sum",
                  "limit",
                  "reverse",
                ],
              },
            },
          },
        },
      },
      required: ["data"],
    },
  },
  {
    name: "generate_csv",
    dataSource: compute("internal"),
    description: translate("generate_csv.description"),
    endpoint: {
      method: "POST",
      path: "/compute/csv",
      bodyParams: ["data", "columns", "filename", "delimiter"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "array",
          description: translate("generate_csv.params.data"),
          items: { type: "object" },
        },
        columns: {
          type: "array",
          description: translate("generate_csv.params.columns"),
          items: { type: "string" },
        },
        filename: {
          type: "string",
          description: translate("generate_csv.params.filename"),
        },
        delimiter: {
          type: "string",
          description: translate("generate_csv.params.delimiter"),
        },
      },
      required: ["data"],
    },
  },
  {
    name: "generate_qr_code",
    dataSource: compute("qrcode"),
    description: translate("generate_qr_code.description"),
    endpoint: {
      method: "POST",
      path: "/compute/qr",
      bodyParams: [
        "data",
        "size",
        "errorCorrection",
        "darkColor",
        "lightColor",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: translate("generate_qr_code.params.data"),
        },
        size: {
          type: "integer",
          description: translate("generate_qr_code.params.size"),
        },
        errorCorrection: {
          type: "string",
          enum: ["L", "M", "Q", "H"],
          description: translate("generate_qr_code.params.errorCorrection"),
        },
        darkColor: {
          type: "string",
          description: translate("generate_qr_code.params.darkColor"),
        },
        lightColor: {
          type: "string",
          description: translate("generate_qr_code.params.lightColor"),
        },
      },
      required: ["data"],
    },
  },
  {
    name: "render_latex",
    dataSource: compute("KaTeX CDN"),
    description: translate("render_latex.description"),
    endpoint: {
      method: "POST",
      path: "/compute/latex",
      bodyParams: ["latex", "displayMode"],
    },
    parameters: {
      type: "object",
      properties: {
        latex: {
          type: "string",
          description: translate("render_latex.params.latex"),
        },
        displayMode: {
          type: "boolean",
          description: translate("render_latex.params.displayMode"),
        },
      },
      required: ["latex"],
    },
  },
  {
    name: "generate_diagram",
    dataSource: compute("Mermaid CDN"),
    description: translate("generate_diagram.description"),
    endpoint: {
      method: "POST",
      path: "/compute/diagram",
      bodyParams: ["definition", "theme"],
    },
    parameters: {
      type: "object",
      properties: {
        definition: {
          type: "string",
          description: translate("generate_diagram.params.definition"),
        },
        theme: {
          type: "string",
          enum: ["dark", "default", "forest", "neutral"],
          description: translate("generate_diagram.params.theme"),
        },
      },
      required: ["definition"],
    },
  },
  {
    name: "diff_text",
    dataSource: compute("diff"),
    description: translate("diff_text.description"),
    endpoint: {
      method: "POST",
      path: "/compute/diff",
      bodyParams: ["textA", "textB", "mode"],
    },
    parameters: {
      type: "object",
      properties: {
        textA: {
          type: "string",
          description: translate("diff_text.params.textA"),
        },
        textB: {
          type: "string",
          description: translate("diff_text.params.textB"),
        },
        mode: {
          type: "string",
          enum: ["lines", "words", "chars", "sentences", "json"],
          description: translate("diff_text.params.mode"),
        },
      },
      required: ["textA", "textB"],
    },
  },
  {
    name: "generate_hash",
    dataSource: compute("node:crypto"),
    description: translate("generate_hash.description"),
    endpoint: {
      path: "/compute/hash",
      queryParams: ["data", "algorithm", "encoding", "key"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: translate("generate_hash.params.data"),
        },
        algorithm: {
          type: "string",
          description: translate("generate_hash.params.algorithm"),
        },
        encoding: {
          type: "string",
          description: translate("generate_hash.params.encoding"),
        },
        key: {
          type: "string",
          description: translate("generate_hash.params.key"),
        },
      },
      required: ["data"],
    },
  },
  {
    name: "test_regex",
    dataSource: compute("native RegExp"),
    description: translate("test_regex.description"),
    endpoint: {
      method: "POST",
      path: "/compute/regex",
      bodyParams: ["pattern", "flags", "text"],
    },
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: translate("test_regex.params.pattern"),
        },
        flags: {
          type: "string",
          description: translate("test_regex.params.flags"),
        },
        text: {
          type: "string",
          description: translate("test_regex.params.text"),
        },
      },
      required: ["pattern", "text"],
    },
  },
  {
    name: "convert_encoding",
    dataSource: compute("internal"),
    description: translate("convert_encoding.description"),
    endpoint: {
      path: "/compute/encode",
      queryParams: ["data", "format", "direction"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: translate("convert_encoding.params.data"),
        },
        format: {
          type: "string",
          enum: [
            "base64",
            "base64url",
            "hex",
            "url",
            "html",
            "rot13",
            "binary",
            "jwt",
          ],
          description: translate("convert_encoding.params.format"),
        },
        direction: {
          type: "string",
          enum: ["encode", "decode"],
          description: translate("convert_encoding.params.direction"),
        },
      },
      required: ["data", "format"],
    },
  },
  {
    name: "convert_color",
    dataSource: compute("internal"),
    description: translate("convert_color.description"),
    endpoint: {
      path: "/compute/color/convert",
      queryParams: ["color", "palette"],
    },
    parameters: {
      type: "object",
      properties: {
        color: {
          type: "string",
          description: translate("convert_color.params.color"),
        },
        palette: {
          type: "string",
          enum: [
            "complementary",
            "analogous",
            "triadic",
            "splitComplementary",
            "tetradic",
            "monochromatic",
          ],
          description: translate("convert_color.params.palette"),
        },
      },
      required: ["color"],
    },
  },

  // ── Image Manipulation (Sharp + ImageMagick) ───────────────
  {
    name: "manipulate_image",
    dataSource: compute("sharp + imagemagick"),
    description: translate("manipulate_image.description"),
    endpoint: {
      method: "POST",
      path: "/compute/image/process",
      bodyParams: ["input", "operations", "outputFormat", "outputQuality"],
    },
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: translate("manipulate_image.params.input"),
        },
        operations: {
          type: "array",
          description: translate("manipulate_image.params.operations"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "resize",
                  "crop",
                  "rotate",
                  "flip",
                  "blur",
                  "sharpen",
                  "grayscale",
                  "negate",
                  "tint",
                  "adjust",
                  "gamma",
                  "trim",
                  "extend",
                  "composite",
                  "metadata",
                  "text",
                  "distort",
                  "border",
                ],
                description: translate("manipulate_image.params.operations.items.params.type"),
              },
              width: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.width"),
              },
              height: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.height"),
              },
              fit: {
                type: "string",
                enum: ["cover", "contain", "fill", "inside", "outside"],
                description: translate("manipulate_image.params.operations.items.params.fit"),
              },
              left: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.left"),
              },
              top: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.top"),
              },
              right: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.right"),
              },
              bottom: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.bottom"),
              },
              angle: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.angle"),
              },
              direction: {
                type: "string",
                enum: ["horizontal", "vertical"],
                description: translate("manipulate_image.params.operations.items.params.direction"),
              },
              sigma: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.sigma"),
              },
              color: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.color"),
              },
              background: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.background"),
              },
              brightness: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.brightness"),
              },
              saturation: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.saturation"),
              },
              hue: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.hue"),
              },
              value: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.value"),
              },
              threshold: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.threshold"),
              },
              overlayUrl: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.overlayUrl"),
              },
              gravity: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.gravity"),
              },
              blend: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.blend"),
              },
              content: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.content"),
              },
              font: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.font"),
              },
              fontSize: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.fontSize"),
              },
              strokeColor: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.strokeColor"),
              },
              strokeWidth: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.strokeWidth"),
              },
              x: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.x"),
              },
              y: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.y"),
              },
              effect: {
                type: "string",
                enum: ["swirl", "wave", "implode", "barrel"],
                description: translate("manipulate_image.params.operations.items.params.effect"),
              },
              degrees: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.degrees"),
              },
              amplitude: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.amplitude"),
              },
              wavelength: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.wavelength"),
              },
              factor: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.factor"),
              },
              params: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.params"),
              },
            },
            required: ["type"],
          },
        },
        outputFormat: {
          type: "string",
          enum: ["png", "jpeg", "webp", "avif", "tiff"],
          description: translate("manipulate_image.params.outputFormat"),
        },
        outputQuality: {
          type: "integer",
          description: translate("manipulate_image.params.outputQuality"),
        },
      },
      required: ["input", "operations"],
    },
  },

  // ── Image to ASCII Art ──────────────────────────────────────
  {
    name: "convert_image_to_ascii",
    dataSource: compute("sharp"),
    description: translate("convert_image_to_ascii.description"),
    endpoint: {
      method: "POST",
      path: "/compute/image/ascii",
      bodyParams: ["input", "width", "chars", "contrast", "reverse"],
    },
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: translate("convert_image_to_ascii.params.input"),
        },
        width: {
          type: "integer",
          description: translate("convert_image_to_ascii.params.width"),
        },
        chars: {
          type: "string",
          description: translate("convert_image_to_ascii.params.chars"),
        },
        contrast: {
          type: "number",
          description: translate("convert_image_to_ascii.params.contrast"),
        },
        reverse: {
          type: "boolean",
          description: translate("convert_image_to_ascii.params.reverse"),
        },
      },
      required: ["input"],
    },
  },

  // ── Video to GIF Conversion ────────────────────────────────
  {
    name: "convert_video_to_gif",
    dataSource: compute("ffmpeg"),
    description: translate("convert_video_to_gif.description"),
    endpoint: {
      method: "POST",
      path: "/compute/video/gif",
      bodyParams: ["input", "quality", "width", "fps"],
    },
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: translate("convert_video_to_gif.params.input"),
        },
        quality: {
          type: "string",
          enum: ["high", "low"],
          description: translate("convert_video_to_gif.params.quality"),
        },
        width: {
          type: "integer",
          description: translate("convert_video_to_gif.params.width"),
        },
        fps: {
          type: "integer",
          description: translate("convert_video_to_gif.params.fps"),
        },
      },
      required: ["input"],
    },
  },

  // ── Turtle Graphics (LOGO Language) ──────────────────────────
  {
    name: "draw_turtle_graphics",
    dataSource: compute("LOGO interpreter"),
    description: translate("draw_turtle_graphics.description"),
    endpoint: {
      method: "POST",
      path: "/compute/turtle",
      bodyParams: ["code", "drawingId", "width", "height"],
    },
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: translate("draw_turtle_graphics.params.code"),
        },
        drawingId: {
          type: "string",
          description: translate("draw_turtle_graphics.params.drawingId"),
        },
        width: {
          type: "number",
          description: translate("draw_turtle_graphics.params.width"),
        },
        height: {
          type: "number",
          description: translate("draw_turtle_graphics.params.height"),
        },
      },
      required: ["code"],
    },
  },

  // ── 3D Object Creation (Triangle Mesh) ─────────────────────
  {
    name: "create_3d_mesh",
    dataSource: compute("internal"),
    description: translate("create_3d_mesh.description"),
    endpoint: {
      method: "POST",
      path: "/compute/3d/mesh",
      bodyParams: [
        "vertices",
        "faces",
        "normals",
        "colors",
        "options",
        "sessionId",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_3d_mesh.params.sessionId"),
        },
        vertices: {
          type: "array",
          description: translate("create_3d_mesh.params.vertices"),
          items: {
            type: "array",
            items: { type: "number" },
            description: translate("create_3d_mesh.params.items"),
          },
        },
        faces: {
          type: "array",
          description: translate("create_3d_mesh.params.faces"),
          items: {
            type: "array",
            items: { type: "integer" },
            description: translate("create_3d_mesh.params.items2"),
          },
        },
        normals: {
          type: "array",
          description: translate("create_3d_mesh.params.normals"),
          items: {
            type: "array",
            items: { type: "number" },
          },
        },
        colors: {
          type: "array",
          description: translate("create_3d_mesh.params.colors"),
          items: { type: "string" },
        },
        options: {
          type: "object",
          properties: {
            wireframe: {
              type: "boolean",
              description: translate("create_3d_mesh.params.options.params.wireframe"),
            },
            flatShading: {
              type: "boolean",
              description: translate("create_3d_mesh.params.options.params.flatShading"),
            },
            autoRotate: {
              type: "boolean",
              description: translate("create_3d_mesh.params.options.params.autoRotate"),
            },
            showGrid: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showGrid"),
            },
            showAxes: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showAxes"),
            },
            background: {
              type: "string",
              description: translate("common.params.backgroundColorDefault"),
            },
            meshColor: {
              type: "string",
              description: translate("create_3d_mesh.params.options.params.meshColor"),
            },
            metalness: {
              type: "number",
              description: translate("create_3d_mesh.params.options.params.metalness"),
            },
            roughness: {
              type: "number",
              description: translate("create_3d_mesh.params.options.params.roughness"),
            },
            opacity: {
              type: "number",
              description: translate("create_3d_mesh.params.options.params.opacity"),
            },
            cameraPosition: {
              type: "array",
              items: { type: "number" },
              description: translate("create_3d_voxel.params.options.params.cameraPosition"),
            },
            title: {
              type: "string",
              description: translate("common.params.overlayTitle"),
            },
          },
          description: translate("create_3d_voxel.params.options"),
        },
      },
      required: ["vertices", "faces"],
    },
  },

  // ── 3D Voxel Grid Creation ─────────────────────────────────
  {
    name: "create_3d_voxel",
    dataSource: compute("internal"),
    description: translate("create_3d_voxel.description"),
    endpoint: {
      method: "POST",
      path: "/compute/3d/voxel",
      bodyParams: ["voxels", "shapes", "options", "sessionId"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_3d_voxel.params.sessionId"),
        },
        voxels: {
          type: "array",
          description: translate("create_3d_voxel.params.voxels"),
          items: {
            type: "object",
            properties: {
              position: {
                type: "array",
                description: translate("create_3d_voxel.params.voxels.items.params.position"),
                items: { type: "integer" },
              },
              color: {
                type: "string",
                description: translate("create_3d_voxel.params.voxels.items.params.color"),
              },
              opacity: {
                type: "number",
                description: translate("create_3d_voxel.params.voxels.items.params.opacity"),
              },
            },
            required: ["position"],
          },
        },
        shapes: {
          type: "array",
          description: translate("create_3d_voxel.params.shapes"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "box",
                  "sphere",
                  "cylinder",
                  "cone",
                  "pyramid",
                  "ellipsoid",
                  "torus",
                ],
                description: translate("create_3d_voxel.params.shapes.items.params.type"),
              },
              center: {
                type: "array",
                description: translate("create_3d_voxel.params.shapes.items.params.center"),
                items: { type: "number" },
              },
              color: {
                type: "string",
                description: translate("create_3d_voxel.params.shapes.items.params.color"),
              },
              opacity: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.opacity"),
              },
              hollow: {
                type: "boolean",
                description: translate("create_3d_voxel.params.shapes.items.params.hollow"),
              },
              size: {
                type: "array",
                description: translate("create_3d_voxel.params.shapes.items.params.size"),
                items: { type: "number" },
              },
              radius: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.radius"),
              },
              height: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.height"),
              },
              radii: {
                type: "array",
                description: translate("create_3d_voxel.params.shapes.items.params.radii"),
                items: { type: "number" },
              },
              majorRadius: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.majorRadius"),
              },
              minorRadius: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.minorRadius"),
              },
              axis: {
                type: "string",
                enum: ["x", "y", "z"],
                description: translate("create_3d_voxel.params.shapes.items.params.axis"),
              },
            },
            required: ["type", "center"],
          },
        },
        options: {
          type: "object",
          properties: {
            wireframe: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.wireframe"),
            },
            flatShading: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.flatShading"),
            },
            showGrid: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showGrid"),
            },
            showAxes: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showAxes"),
            },
            background: {
              type: "string",
              description: translate("common.params.backgroundColorDefault"),
            },
            autoRotate: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.autoRotate"),
            },
            autoRotateSpeed: {
              type: "number",
              description: translate("create_3d_voxel.params.options.params.autoRotateSpeed"),
            },
            voxelSize: {
              type: "number",
              description: translate("create_3d_voxel.params.options.params.voxelSize"),
            },
            voxelSpacing: {
              type: "number",
              description: translate("create_3d_voxel.params.options.params.voxelSpacing"),
            },
            outlineColor: {
              type: "string",
              description: translate("create_3d_voxel.params.options.params.outlineColor"),
            },
            outlineOpacity: {
              type: "number",
              description: translate("create_3d_voxel.params.options.params.outlineOpacity"),
            },
            cameraPosition: {
              type: "array",
              items: { type: "number" },
              description: translate("create_3d_voxel.params.options.params.cameraPosition"),
            },
            title: {
              type: "string",
              description: translate("common.params.overlayTitle"),
            },
          },
          description: translate("create_3d_voxel.params.options"),
        },
      },
    },
  },

  // ── 3D Object Creation (Primitive Composition) ─────────────
  {
    name: "create_3d_model",
    dataSource: compute("internal"),
    description: translate("create_3d_model.description"),
    endpoint: {
      method: "POST",
      path: "/compute/3d/model",
      bodyParams: ["objects", "options", "sessionId", "referenceTextureUrl"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_3d_model.params.sessionId"),
        },
        objects: {
          type: "array",
          description: translate("create_3d_model.params.objects"),
          items: {
            type: "object",
            properties: {
              shape: {
                type: "string",
                enum: [
                  "box",
                  "sphere",
                  "cylinder",
                  "cone",
                  "torus",
                  "torusKnot",
                  "plane",
                  "ring",
                  "circle",
                  "dodecahedron",
                  "icosahedron",
                  "octahedron",
                  "tetrahedron",
                  "capsule",
                ],
                description: translate("create_3d_voxel.params.shapes.items.params.type"),
              },
              size: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_model.params.objects.items.params.size"),
              },
              radius: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.radius"),
              },
              height: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.height"),
              },
              radiusTop: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.radiusTop"),
              },
              radiusBottom: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.radiusBottom"),
              },
              tube: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.tube"),
              },
              segments: {
                type: "integer",
                description: translate("create_3d_model.params.objects.items.params.segments"),
              },
              position: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_model.params.objects.items.params.position"),
              },
              rotation: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_model.params.objects.items.params.rotation"),
              },
              scale: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_model.params.objects.items.params.scale"),
              },
              material: {
                type: "object",
                properties: {
                  color: {
                    type: "string",
                    description: translate("create_3d_model.params.objects.items.params.material.params.color"),
                  },
                  metalness: {
                    type: "number",
                    description: translate("create_3d_model.params.objects.items.params.material.params.metalness"),
                  },
                  roughness: {
                    type: "number",
                    description: translate("create_3d_model.params.objects.items.params.material.params.roughness"),
                  },
                  opacity: {
                    type: "number",
                    description: translate("create_3d_model.params.objects.items.params.material.params.opacity"),
                  },
                  emissive: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.emissive"),
                  },
                  emissiveIntensity: {
                    type: "number",
                    description: translate("create_3d_model.params.objects.items.params.material.params.emissiveIntensity"),
                  },
                  wireframe: { type: "boolean", description: translate("create_3d_model.params.wireframe") },
                  flatShading: { type: "boolean", description: translate("create_3d_model.params.flatShading") },
                  doubleSided: {
                    type: "boolean",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.doubleSided"),
                  },
                  textureUrl: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.textureUrl"),
                  },
                },
                description: translate("create_3d_model.params.objects.items.params.material"),
              },
              name: {
                type: "string",
                description: translate("create_3d_model.params.objects.items.params.name"),
              },
            },
            required: ["shape"],
          },
        },
        options: {
          type: "object",
          properties: {
            autoRotate: {
              type: "boolean",
              description: translate("create_3d_scene.params.scene.params.camera.params.autoOrbit"),
            },
            showGrid: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showGrid"),
            },
            background: {
              type: "string",
              description: translate("common.params.backgroundColorDefault"),
            },
            enableShadows: {
              type: "boolean",
              description: translate("create_3d_scene.params.options.params.enableShadows"),
            },
            ambientLightIntensity: {
              type: "number",
              description: translate("create_3d_model.params.options.params.ambientLightIntensity"),
            },
            directionalLightIntensity: {
              type: "number",
              description: translate("create_3d_model.params.options.params.directionalLightIntensity"),
            },
            cameraPosition: {
              type: "array",
              items: { type: "number" },
              description: translate("create_3d_voxel.params.options.params.cameraPosition"),
            },
            fieldOfView: {
              type: "number",
              description: translate("create_3d_model.params.options.params.fieldOfView"),
            },
            title: {
              type: "string",
              description: translate("common.params.overlayTitle"),
            },
          },
          description: translate("create_3d_model.params.options"),
        },
      },
      required: ["objects"],
    },
  },

  // ── 3D Object Creation (Declarative Scene Graph) ───────────
  {
    name: "create_3d_scene",
    dataSource: compute("internal"),
    description: translate("create_3d_scene.description"),
    endpoint: {
      method: "POST",
      path: "/compute/3d/scene",
      bodyParams: [
        "scene",
        "objects",
        "options",
        "sessionId",
        "referenceTextureUrl",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_3d_scene.params.sessionId"),
        },
        scene: {
          type: "object",
          description: translate("create_3d_scene.params.scene"),
          properties: {
            environment: {
              type: "string",
              enum: [
                "studio",
                "outdoor",
                "night",
                "sunset",
                "dawn",
                "warehouse",
                "neutral",
              ],
              description: translate("create_3d_scene.params.scene.params.environment"),
            },
            background: {
              type: "string",
              description: translate("common.params.backgroundColorDefault"),
            },
            ground: {
              type: "object",
              properties: {
                enabled: {
                  type: "boolean",
                  description: translate("create_3d_scene.params.scene.params.ground.params.enabled"),
                },
                color: {
                  type: "string",
                  description: translate("create_3d_scene.params.scene.params.ground.params.color"),
                },
                size: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.ground.params.size"),
                },
              },
              description: translate("create_3d_scene.params.scene.params.ground"),
            },
            camera: {
              type: "object",
              properties: {
                position: {
                  type: "array",
                  items: { type: "number" },
                  description: translate("create_3d_scene.params.scene.params.camera.params.position"),
                },
                target: {
                  type: "array",
                  items: { type: "number" },
                  description: translate("create_3d_scene.params.scene.params.camera.params.target"),
                },
                fov: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.camera.params.fov"),
                },
                autoOrbit: {
                  type: "boolean",
                  description: translate("create_3d_scene.params.scene.params.camera.params.autoOrbit"),
                },
                autoOrbitSpeed: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.camera.params.autoOrbitSpeed"),
                },
              },
              description: translate("create_3d_scene.params.scene.params.camera"),
            },
            fog: {
              type: "object",
              properties: {
                enabled: {
                  type: "boolean",
                  description: translate("create_3d_scene.params.scene.params.fog.params.enabled"),
                },
                color: {
                  type: "string",
                  description: translate("create_3d_scene.params.scene.params.fog.params.color"),
                },
                near: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.fog.params.near"),
                },
                far: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.fog.params.far"),
                },
              },
              description: translate("create_3d_scene.params.scene.params.fog"),
            },
          },
        },
        objects: {
          type: "array",
          description: translate("create_3d_scene.params.objects"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "box",
                  "sphere",
                  "cylinder",
                  "cone",
                  "torus",
                  "torusKnot",
                  "plane",
                  "ring",
                  "circle",
                  "dodecahedron",
                  "icosahedron",
                  "octahedron",
                  "tetrahedron",
                  "capsule",
                  "group",
                  "text3d",
                ],
                description: translate("create_3d_scene.params.objects.items.params.type"),
              },
              name: { type: "string", description: translate("common.params.optionalName") },
              size: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_scene.params.objects.items.params.size"),
              },
              radius: {
                type: "number",
                description: translate("create_3d_scene.params.objects.items.params.radius"),
              },
              height: {
                type: "number",
                description: translate("create_3d_scene.params.objects.items.params.height"),
              },
              position: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_scene.params.objects.items.params.position"),
              },
              rotation: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_scene.params.objects.items.params.rotation"),
              },
              scale: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_scene.params.objects.items.params.scale"),
              },
              material: {
                type: "object",
                properties: {
                  color: { type: "string", description: translate("common.params.cssColor") },
                  metalness: { type: "number", description: translate("common.params.zeroToOne") },
                  roughness: { type: "number", description: translate("common.params.zeroToOne") },
                  opacity: { type: "number", description: translate("common.params.zeroToOne") },
                  emissive: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.emissive"),
                  },
                  wireframe: { type: "boolean" },
                  doubleSided: {
                    type: "boolean",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.doubleSided"),
                  },
                  textureUrl: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.textureUrl"),
                  },
                },
                description: translate("create_3d_scene.params.objects.items.params.material"),
              },
              animation: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["spin", "bounce", "orbit", "pulse", "float"],
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.type"),
                  },
                  speed: {
                    type: "number",
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.speed"),
                  },
                  axis: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.axis"),
                  },
                  amplitude: {
                    type: "number",
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.amplitude"),
                  },
                  radius: {
                    type: "number",
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.radius"),
                  },
                },
                description: translate("create_3d_scene.params.objects.items.params.animation"),
              },
              children: {
                type: "array",
                description: translate("create_3d_scene.params.objects.items.params.children"),
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: [
                        "box",
                        "sphere",
                        "cylinder",
                        "cone",
                        "torus",
                        "torusKnot",
                        "plane",
                        "ring",
                        "circle",
                        "dodecahedron",
                        "icosahedron",
                        "octahedron",
                        "tetrahedron",
                        "capsule",
                        "group",
                        "text3d",
                      ],
                      description: translate("create_3d_scene.params.objects.items.params.children.items.params.type"),
                    },
                    name: { type: "string", description: translate("common.params.optionalName") },
                    size: {
                      type: "array",
                      items: { type: "number" },
                      description: translate("create_3d_scene.params.objects.items.params.size"),
                    },
                    radius: {
                      type: "number",
                      description: translate("create_3d_scene.params.objects.items.params.radius"),
                    },
                    height: {
                      type: "number",
                      description: translate("create_3d_scene.params.objects.items.params.height"),
                    },
                    position: {
                      type: "array",
                      items: { type: "number" },
                      description: translate("create_3d_scene.params.objects.items.params.position"),
                    },
                    rotation: {
                      type: "array",
                      items: { type: "number" },
                      description: translate("create_3d_scene.params.objects.items.params.rotation"),
                    },
                    scale: {
                      type: "array",
                      items: { type: "number" },
                      description: translate("create_3d_scene.params.objects.items.params.scale"),
                    },
                    material: {
                      type: "object",
                      properties: {
                        color: { type: "string", description: translate("common.params.cssColor") },
                        metalness: { type: "number", description: translate("common.params.zeroToOne") },
                        roughness: { type: "number", description: translate("common.params.zeroToOne") },
                        opacity: { type: "number", description: translate("common.params.zeroToOne") },
                        emissive: {
                          type: "string",
                          description: translate("create_3d_scene.params.objects.items.params.material.params.emissive"),
                        },
                        wireframe: { type: "boolean" },
                        doubleSided: {
                          type: "boolean",
                          description: translate("create_3d_scene.params.objects.items.params.material.params.doubleSided"),
                        },
                        textureUrl: {
                          type: "string",
                          description: translate("create_3d_scene.params.objects.items.params.material.params.textureUrl"),
                        },
                      },
                      description: translate("create_3d_scene.params.objects.items.params.material"),
                    },
                    animation: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: ["spin", "bounce", "orbit", "pulse", "float"],
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.type"),
                        },
                        speed: {
                          type: "number",
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.speed"),
                        },
                        axis: {
                          type: "string",
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.axis"),
                        },
                        amplitude: {
                          type: "number",
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.amplitude"),
                        },
                        radius: {
                          type: "number",
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.radius"),
                        },
                      },
                      description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation"),
                    },
                    content: {
                      type: "string",
                      description: translate("create_3d_scene.params.objects.items.params.content"),
                    },
                    fontSize: {
                      type: "number",
                      description: translate("create_3d_scene.params.objects.items.params.fontSize"),
                    },
                  },
                  required: ["type"],
                },
              },
              content: {
                type: "string",
                description: translate("create_3d_scene.params.objects.items.params.content"),
              },
              fontSize: {
                type: "number",
                description: translate("create_3d_scene.params.objects.items.params.fontSize"),
              },
            },
            required: ["type"],
          },
        },
        options: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: translate("common.params.overlayTitle"),
            },
            showGrid: {
              type: "boolean",
              description: translate("create_3d_scene.params.options.params.showGrid"),
            },
            showAxes: {
              type: "boolean",
              description: translate("create_3d_scene.params.options.params.showAxes"),
            },
            enableShadows: {
              type: "boolean",
              description: translate("create_3d_scene.params.options.params.enableShadows"),
            },
          },
          description: translate("create_3d_scene.params.options"),
        },
      },
      required: ["objects"],
    },
  },
  {
    name: "convert_currency",
    dataSource: onDemand("Exchange Rate API"),
    description: translate("convert_currency.description"),
    endpoint: {
      path: "/utility/currency/convert",
      queryParams: ["amount", "from", "to"],
    },
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: translate("convert_currency.params.amount"),
        },
        from: {
          type: "string",
          description: translate("convert_currency.params.from"),
        },
        to: {
          type: "string",
          description: translate("convert_currency.params.to"),
        },
        ...fieldsParam(FIELDS.CURRENCY_CONVERT),
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_time_in_timezone",
    dataSource: onDemand("World Time API"),
    description: translate("get_time_in_timezone.description"),
    endpoint: {
      path: "/utility/timezone/:area/:location",
      pathParams: ["area", "location"],
    },
    parameters: {
      type: "object",
      properties: {
        area: {
          type: "string",
          description: translate("get_time_in_timezone.params.area"),
        },
        location: {
          type: "string",
          description: translate("get_time_in_timezone.params.location"),
        },
        ...fieldsParam(FIELDS.TIMEZONE),
      },
      required: ["area", "location"],
    },
  },
  {
    name: "get_ip_info",
    dataSource: onDemand("IPinfo.io"),
    description: translate("get_ip_info.description"),
    endpoint: {
      path: "/utility/ip/:ip",
      pathParams: ["ip"],
    },
    parameters: {
      type: "object",
      properties: {
        ip: {
          type: "string",
          description: translate("get_ip_info.params.ip"),
        },
        ...fieldsParam(FIELDS.IP_GEOLOCATION),
      },
    },
  },
  {
    name: "search_nearby_places",
    dataSource: onDemand("Google Places API"),
    description: translate("search_nearby_places.description"),
    endpoint: {
      path: "/utility/places/nearby",
      queryParams: ["type", "latitude", "longitude", "radius", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: translate("search_nearby_places.params.type"),
        },
        latitude: {
          type: "number",
          description: translate("search_nearby_places.params.latitude"),
        },
        longitude: {
          type: "number",
          description: translate("search_nearby_places.params.longitude"),
        },
        radius: {
          type: "number",
          description: translate("search_nearby_places.params.radius"),
        },
        limit: {
          type: "number",
          description: translate("search_nearby_places.params.limit"),
        },
        ...fieldsParam(FIELDS.PLACES),
      },
      required: ["type"],
    },
  },
  {
    name: "search_places",
    dataSource: onDemand("Google Places API"),
    description: translate("search_places.description"),
    endpoint: {
      path: "/utility/places/search",
      queryParams: ["q", "latitude", "longitude", "radius", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_places.params.q"),
        },
        latitude: {
          type: "number",
          description: translate("search_places.params.latitude"),
        },
        longitude: {
          type: "number",
          description: translate("search_places.params.longitude"),
        },
        radius: {
          type: "number",
          description: translate("search_places.params.radius"),
        },
        limit: {
          type: "number",
          description: translate("search_places.params.limit"),
        },
        ...fieldsParam(FIELDS.PLACES),
      },
      required: ["q"],
    },
  },
  {
    name: "generate_map",
    dataSource: onDemand("Google Static Maps API"),
    description: translate("generate_map.description"),
    endpoint: {
      path: "/utility/map",
      queryParams: ["markers", "zoom", "maptype"],
    },
    parameters: {
      type: "object",
      properties: {
        markers: {
          type: "array",
          description: translate("generate_map.params.markers"),
          items: {
            type: "object",
            properties: {
              latitude: { type: "number" },
              longitude: { type: "number" },
              label: { type: "string" },
            },
            required: ["latitude", "longitude"],
          },
        },
        zoom: {
          type: "number",
          description: translate("generate_map.params.zoom"),
        },
        maptype: {
          type: "string",
          description: translate("generate_map.params.maptype"),
          enum: ["roadmap", "satellite", "terrain", "hybrid"],
        },
      },
      required: ["markers"],
    },
  },

  // ── Chart Generation ──────────────────────────────────────
  {
    name: "generate_chart",
    dataSource: onDemand("internal"),
    description: translate("generate_chart.description"),
    endpoint: {
      method: "POST",
      path: "/utility/chart",
      bodyParams: ["type", "title", "labels", "datasets"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: translate("generate_chart.params.type"),
          enum: ["bar", "line", "pie"],
        },
        title: {
          type: "string",
          description: translate("generate_chart.params.title"),
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: translate("generate_chart.params.items"),
        },
        datasets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: translate("generate_chart.params.label"),
              },
              data: {
                type: "array",
                items: { type: "number" },
                description: translate("generate_chart.params.datasets.items.params.data"),
              },
            },
            required: ["label", "data"],
          },
          description: translate("generate_chart.params.datasets"),
        },
      },
      required: ["type", "labels", "datasets"],
    },
  },

  // ── Periodic Table ─────────────────────────────────────────

  // ── World Bank Indicators ───────────────────────────────────
  {
    name: "list_development_indicators",
    dataSource: staticDataset("World Bank"),
    description: translate("list_development_indicators.description"),
    endpoint: { path: "/knowledge/indicators/list" },
    parameters: {
      type: "object",
      properties: {},
    },
  },

  // ── Airports (4 → 1) ──────────────────────────────────────────
  {
    name: "search_airports",
    dataSource: staticDataset("OpenFlights (7,698 airports)"),
    description: translate("search_airports.description"),
    endpoint: {
      path: "/utility/airports/lookup",
      queryParams: ["action", "q", "code", "country", "lat", "lng", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("search_books.params.action"),
          enum: ["search", "code", "country", "nearest"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        code: {
          type: "string",
          description: translate("search_airports.params.code"),
        },
        lat: { type: "number", description: translate("search_airports.params.lat") },
        lng: { type: "number", description: translate("search_airports.params.lng") },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        country: {
          type: "string",
          description: translate("search_airports.params.country"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action"],
    },
  },

  {
    name: "get_public_webcams",
    dataSource: onDemand("Municipal Open Data APIs"),
    description: translate("get_public_webcams.description"),
    endpoint: { path: "/utility/webcams", queryParams: ["city", "state", "province", "region", "country", "limit"] },
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: translate("get_public_webcams.params.city"),
          enum: [
            // Canada
            "vancouver",
            "toronto",
            "calgary",
            "ottawa",
            "hamilton",
            "london-on",
            "kingston",
            "windsor-on",
            "kitchener",
            "barrie",
            "thunder-bay",
            "sudbury",
            "niagara",
            "mississauga",
            "edmonton",
            "red-deer",
            "lethbridge",
            "medicine-hat",
            "grande-prairie",
            "banff",
            "fort-mcmurray",
            // US
            "seattle",
            "austin",
            "baton-rouge",
            "nyc",
            "buffalo",
            "syracuse",
            "albany",
            "rochester",
            "utica",
            "binghamton",
            "ithaca",
            "washington-dc",
            "honolulu",
            "chicago",
            // UK
            "london",
          ],
        },
        state: {
          type: "string",
          description: translate("get_public_webcams.params.state"),
          enum: [
            "washington-state",
            "california",
            "oregon",
            "florida",
            "iowa",
            "michigan",
            "kentucky",
          ],
        },
        province: {
          type: "string",
          description: translate("get_public_webcams.params.province"),
          enum: [
            "quebec",
            "british-columbia",
            "queensland",
          ],
        },
        region: {
          type: "string",
          description: translate("get_public_webcams.params.region"),
          enum: [
            "long-island",
            "westchester",
            "montgomery-county-tx",
            "donegal",
          ],
        },
        country: {
          type: "string",
          description: translate("get_public_webcams.params.country"),
          enum: [
            "CA",
            "US",
            "GB",
            "DE",
            "FI",
            "IE",
            "NZ",
            "SG",
            "AU",
          ],
        },
        limit: {
          type: "integer",
          description: translate("get_public_webcams.params.limit"),
        },
        ...fieldsParam(FIELDS.WEBCAMS),
      },
    },
  },

  // ── Exoplanet Tools ────────────────────────────────────────────

  // ── FDA Drug NDC Tools ─────────────────────────────────────────

  {
    name: "list_drug_dosage_forms",
    dataSource: staticDataset("FDA NDC Directory"),
    description: translate("list_drug_dosage_forms.description"),
    endpoint: { path: "/health/drugs/ndc/dosage-forms" },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.FDA_DOSAGE_FORMS),
      },
    },
  },

  // ── Maritime Domain (AIS Stream) ──────────────────────────────
  {
    name: "get_tracked_vessels",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("get_tracked_vessels.description"),
    endpoint: {
      path: "/maritime/vessels",
      queryParams: ["limit"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: translate("get_vessels_in_area.params.limit"),
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
    },
  },
  {
    name: "get_vessel_by_mmsi",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("get_vessel_by_mmsi.description"),
    endpoint: {
      path: "/maritime/vessels/:mmsi",
      pathParams: ["mmsi"],
    },
    parameters: {
      type: "object",
      properties: {
        mmsi: {
          type: "string",
          description: translate("get_vessel_by_mmsi.params.mmsi"),
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
      required: ["mmsi"],
    },
  },
  {
    name: "search_vessels",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("search_vessels.description"),
    endpoint: {
      path: "/maritime/search",
      queryParams: ["q", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_vessels.params.q"),
        },
        limit: {
          type: "integer",
          description: translate("search_vessels.params.limit"),
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
      required: ["q"],
    },
  },
  {
    name: "get_vessels_in_area",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("get_vessels_in_area.description"),
    endpoint: {
      path: "/maritime/area",
      queryParams: ["minLat", "maxLat", "minLng", "maxLng", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        minLat: {
          type: "number",
          description: translate("get_vessels_in_area.params.minLat"),
        },
        maxLat: {
          type: "number",
          description: translate("get_vessels_in_area.params.maxLat"),
        },
        minLng: {
          type: "number",
          description: translate("get_vessels_in_area.params.minLng"),
        },
        maxLng: {
          type: "number",
          description: translate("get_vessels_in_area.params.maxLng"),
        },
        limit: {
          type: "integer",
          description: translate("get_vessels_in_area.params.limit"),
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
      required: ["minLat", "maxLat", "minLng", "maxLng"],
    },
  },
  {
    name: "get_ais_messages",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("get_ais_messages.description"),
    endpoint: {
      path: "/maritime/messages",
      queryParams: ["limit", "type"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: translate("get_ais_messages.params.limit"),
        },
        type: {
          type: "string",
          description: translate("get_ais_messages.params.type"),
        },
        ...fieldsParam(FIELDS.AIS_MESSAGES),
      },
    },
  },

  // ── Energy Domain (EIA) ──────────────────────────────────────
  {
    name: "get_energy_indicators",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_energy_indicators.description"),
    endpoint: { path: "/energy/indicators" },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.ENERGY_INDICATORS),
      },
    },
  },
  {
    name: "get_energy_catalog",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_energy_catalog.description"),
    endpoint: {
      path: "/energy/browse",
      queryParams: ["route"],
    },
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: translate("get_energy_catalog.params.route"),
        },
        ...fieldsParam(FIELDS.EIA_BROWSE),
      },
    },
  },
  {
    name: "get_energy_facets",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_energy_facets.description"),
    endpoint: {
      path: "/energy/facets",
      queryParams: ["route", "facetId"],
    },
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: translate("get_energy_facets.params.route"),
        },
        facetId: {
          type: "string",
          description: translate("get_energy_facets.params.facetId"),
        },
        ...fieldsParam(FIELDS.EIA_FACETS),
      },
      required: ["route", "facetId"],
    },
  },
  {
    name: "search_energy",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("search_energy.description"),
    endpoint: {
      path: "/energy/data",
      queryParams: [
        "route",
        "frequency",
        "start",
        "end",
        "sort",
        "length",
        "offset",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: translate("search_energy.params.route"),
        },
        frequency: {
          type: "string",
          description: translate("search_energy.params.frequency"),
        },
        start: {
          type: "string",
          description: translate("search_energy.params.start"),
        },
        end: {
          type: "string",
          description: translate("search_energy.params.end"),
        },
        sort: {
          type: "string",
          description: translate("search_energy.params.sort"),
        },
        length: {
          type: "integer",
          description: translate("search_energy.params.length"),
        },
        offset: {
          type: "integer",
          description: translate("search_energy.params.offset"),
        },
      },
      required: ["route"],
    },
  },
  {
    name: "get_electricity_retail_sales",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_electricity_retail_sales.description"),
    endpoint: {
      path: "/energy/electricity/retail-sales",
      queryParams: ["state", "sector", "frequency", "start", "end", "length"],
    },
    parameters: {
      type: "object",
      properties: {
        state: {
          type: "string",
          description: translate("get_electricity_retail_sales.params.state"),
        },
        sector: {
          type: "string",
          description: translate("get_electricity_retail_sales.params.sector"),
        },
        frequency: {
          type: "string",
          description: translate("get_electricity_retail_sales.params.frequency"),
        },
        start: {
          type: "string",
          description: translate("get_natural_gas_prices.params.start"),
        },
        end: {
          type: "string",
          description: translate("get_electricity_retail_sales.params.end"),
        },
        length: {
          type: "integer",
          description: translate("get_petroleum_prices.params.length"),
        },
      },
    },
  },
  {
    name: "get_petroleum_prices",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_petroleum_prices.description"),
    endpoint: {
      path: "/energy/petroleum/prices",
      queryParams: ["product", "area", "frequency", "start", "end", "length"],
    },
    parameters: {
      type: "object",
      properties: {
        product: {
          type: "string",
          description: translate("get_petroleum_prices.params.product"),
        },
        area: {
          type: "string",
          description: translate("get_petroleum_prices.params.area"),
        },
        frequency: {
          type: "string",
          description: translate("get_petroleum_prices.params.frequency"),
        },
        start: {
          type: "string",
          description: translate("get_petroleum_prices.params.start"),
        },
        end: {
          type: "string",
          description: translate("get_petroleum_prices.params.end"),
        },
        length: {
          type: "integer",
          description: translate("get_petroleum_prices.params.length"),
        },
      },
    },
  },
  {
    name: "get_natural_gas_prices",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_natural_gas_prices.description"),
    endpoint: {
      path: "/energy/natural-gas/prices",
      queryParams: ["process", "area", "frequency", "start", "end", "length"],
    },
    parameters: {
      type: "object",
      properties: {
        process: {
          type: "string",
          description: translate("get_natural_gas_prices.params.process"),
        },
        area: {
          type: "string",
          description: translate("get_natural_gas_prices.params.area"),
        },
        frequency: {
          type: "string",
          description: translate("get_natural_gas_prices.params.frequency"),
        },
        start: {
          type: "string",
          description: translate("get_natural_gas_prices.params.start"),
        },
        end: {
          type: "string",
          description: translate("get_petroleum_prices.params.end"),
        },
        length: {
          type: "integer",
          description: translate("get_petroleum_prices.params.length"),
        },
      },
    },
  },

  // ════════════════════════════════════════════════════════════════
  // AGENTIC — File System & Web Tools for AI Coding Loops
  // ════════════════════════════════════════════════════════════════

  {
    name: "read_file",
    dataSource: compute("sandboxed fs"),
    description: translate("read_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/read",
      bodyParams: ["absolutePath", "startLine", "endLine"],
    },
    parameters: {
      type: "object",
      properties: {
        absolutePath: {
          type: "string",
          description: translate("read_file.params.absolutePath"),
        },
        startLine: {
          type: "integer",
          description: translate("read_file.params.startLine"),
        },
        endLine: {
          type: "integer",
          description: translate("read_file.params.endLine"),
        },
      },
      required: ["absolutePath"],
    },
  },
  {
    name: "write_file",
    dataSource: compute("sandboxed fs"),
    description: translate("write_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/write",
      bodyParams: ["path", "content", "createDirs"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("write_file.params.path"),
        },
        content: {
          type: "string",
          description: translate("write_file.params.content"),
        },
        createDirs: {
          type: "boolean",
          description: translate("write_file.params.createDirs"),
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "replace_in_file",
    dataSource: compute("sandboxed fs"),
    description: translate("replace_in_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/str-replace",
      bodyParams: ["path", "oldString", "newString", "allowMultiple"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("replace_in_file.params.path"),
        },
        oldString: {
          type: "string",
          description: translate("replace_in_file.params.oldString"),
        },
        newString: {
          type: "string",
          description: translate("replace_in_file.params.newString"),
        },
        allowMultiple: {
          type: "boolean",
          description: translate("replace_in_file.params.allowMultiple"),
        },
      },
      required: ["path", "oldString", "newString"],
    },
  },
  {
    name: "replace_file_block",
    dataSource: compute("sandboxed fs"),
    description: translate("replace_file_block.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/block-replace",
      bodyParams: [
        "path",
        "startLine",
        "endLine",
        "targetContent",
        "replacementContent",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("replace_in_file.params.path"),
        },
        startLine: {
          type: "integer",
          description: translate("replace_file_block.params.startLine"),
        },
        endLine: {
          type: "integer",
          description: translate("replace_file_block.params.endLine"),
        },
        targetContent: {
          type: "string",
          description: translate("replace_file_block.params.targetContent"),
        },
        replacementContent: {
          type: "string",
          description: translate("replace_file_block.params.replacementContent"),
        },
      },
      required: [
        "path",
        "startLine",
        "endLine",
        "targetContent",
        "replacementContent",
      ],
    },
  },
  {
    name: "replace_file_regions",
    dataSource: compute("sandboxed fs"),
    description: translate("replace_file_regions.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/multi-replace",
      bodyParams: ["path", "chunks"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("replace_in_file.params.path"),
        },
        chunks: {
          type: "array",
          description: translate("replace_file_regions.params.chunks"),
          items: {
            type: "object",
            properties: {
              startLine: {
                type: "integer",
                description: translate("replace_file_regions.params.chunks.items.params.startLine"),
              },
              endLine: {
                type: "integer",
                description: translate("replace_file_regions.params.chunks.items.params.endLine"),
              },
              targetContent: {
                type: "string",
                description: translate("replace_file_regions.params.chunks.items.params.targetContent"),
              },
              replacementContent: {
                type: "string",
                description: translate("replace_file_regions.params.chunks.items.params.replacementContent"),
              },
            },
            required: [
              "startLine",
              "endLine",
              "targetContent",
              "replacementContent",
            ],
          },
        },
      },
      required: ["path", "chunks"],
    },
  },
  {
    name: "patch_file",
    dataSource: compute("sandboxed fs + diff"),
    description: translate("patch_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/patch",
      bodyParams: ["path", "patch"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("patch_file.params.path"),
        },
        patch: {
          type: "string",
          description: translate("patch_file.params.patch"),
        },
      },
      required: ["path", "patch"],
    },
  },
  {
    name: "list_directory",
    dataSource: compute("sandboxed fs"),
    description: translate("list_directory.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/directory/list",
      bodyParams: ["path", "recursive", "maxDepth"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("list_directory.params.path"),
        },
        recursive: {
          type: "boolean",
          description: translate("list_directory.params.recursive"),
        },
        maxDepth: {
          type: "integer",
          description: translate("list_directory.params.maxDepth"),
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search_file_contents",
    dataSource: compute("sandboxed fs"),
    description: translate("search_file_contents.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/search/grep",
      bodyParams: [
        "pattern",
        "searchPath",
        "isRegex",
        "includes",
        "caseInsensitive",
        "matchPerLine",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: translate("search_file_contents.params.pattern"),
        },
        searchPath: {
          type: "string",
          description: translate("search_file_contents.params.searchPath"),
        },
        isRegex: {
          type: "boolean",
          description: translate("search_file_contents.params.isRegex"),
        },
        includes: {
          type: "array",
          items: { type: "string" },
          description: translate("search_file_contents.params.includes"),
        },
        caseInsensitive: {
          type: "boolean",
          description: translate("search_file_contents.params.caseInsensitive"),
        },
        matchPerLine: {
          type: "boolean",
          description: translate("search_file_contents.params.matchPerLine"),
        },
      },
      required: ["pattern", "searchPath"],
    },
  },
  {
    name: "find_files",
    dataSource: compute("sandboxed fs"),
    description: translate("find_files.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/search/glob",
      bodyParams: ["pattern", "searchPath"],
    },
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: translate("find_files.params.pattern"),
        },
        searchPath: {
          type: "string",
          description: translate("find_files.params.searchPath"),
        },
      },
      required: ["pattern", "searchPath"],
    },
  },
  {
    name: "read_web_page",
    dataSource: onDemand("HTTP fetch"),
    description: translate("read_web_page.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/fetch",
      bodyParams: ["url", "selector"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_web_page.params.url"),
        },
        selector: {
          type: "string",
          description: translate("read_web_page.params.selector"),
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_pdf",
    dataSource: onDemand("pdf-parse"),
    description: translate("read_pdf.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/pdf-read",
      bodyParams: ["url", "maxPages", "maxChars", "pages", "startPage", "endPage"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_pdf.params.url"),
        },
        maxPages: {
          type: "integer",
          description: translate("read_pdf.params.maxPages"),
        },
        maxChars: {
          type: "integer",
          description: translate("read_pdf.params.maxChars"),
        },
        pages: {
          type: "array",
          items: { type: "integer" },
          description: translate("read_pdf.params.pages"),
        },
        startPage: {
          type: "integer",
          description: translate("read_pdf.params.startPage"),
        },
        endPage: {
          type: "integer",
          description: translate("read_pdf.params.endPage"),
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_docx",
    dataSource: onDemand("mammoth"),
    description: translate("read_docx.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/docx-read",
      bodyParams: ["url", "maxChars", "outputFormat"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_docx.params.url"),
        },
        maxChars: {
          type: "integer",
          description: translate("read_docx.params.maxChars"),
        },
        outputFormat: {
          type: "string",
          description: translate("read_docx.params.outputFormat"),
          enum: ["markdown", "text"],
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_spreadsheet",
    dataSource: onDemand("exceljs"),
    description: translate("read_spreadsheet.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/spreadsheet-read",
      bodyParams: [
        "url",
        "maxRows",
        "maxChars",
        "sheet",
        "includeHeaders",
        "outputFormat",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_spreadsheet.params.url"),
        },
        maxRows: {
          type: "integer",
          description: translate("read_spreadsheet.params.maxRows"),
        },
        maxChars: {
          type: "integer",
          description: translate("read_spreadsheet.params.maxChars"),
        },
        sheet: {
          type: "string",
          description: translate("read_spreadsheet.params.sheet"),
        },
        includeHeaders: {
          type: "boolean",
          description: translate("read_spreadsheet.params.includeHeaders"),
        },
        outputFormat: {
          type: "string",
          description: translate("read_spreadsheet.params.outputFormat"),
          enum: ["json", "markdown", "csv"],
        },
      },
      required: ["url"],
    },
  },
  {
    name: "search_web",
    dataSource: onDemand("Brave Search / DuckDuckGo / Google CSE"),
    description: translate("search_web.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/search",
      bodyParams: ["query", "limit", "dateRestrict", "siteSearch"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_web.params.query"),
        },
        limit: {
          type: "integer",
          description: translate("search_web.params.limit"),
        },
        dateRestrict: {
          type: "string",
          description: translate("search_web.params.dateRestrict"),
        },
        siteSearch: {
          type: "string",
          description: translate("search_web.params.siteSearch"),
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_news",
    dataSource: onDemand("Brave News / Google News RSS"),
    description: translate("search_news.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/news-search",
      bodyParams: ["query", "topic", "limit", "locale", "countryEdition"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_news.params.query"),
        },
        topic: {
          type: "string",
          description: translate("search_news.params.topic"),
        },
        limit: {
          type: "integer",
          description: translate("search_news.params.limit"),
        },
        locale: {
          type: "string",
          description: translate("search_news.params.locale"),
        },
        countryEdition: {
          type: "string",
          description: translate("search_news.params.countryEdition"),
        },
      },
      required: [],
    },
  },
  {
    name: "search_images",
    dataSource: onDemand("Brave Image Search"),
    description: translate("search_images.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/image-search",
      bodyParams: ["query", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_images.params.query"),
        },
        limit: {
          type: "integer",
          description: translate("search_images.params.limit"),
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_videos",
    dataSource: onDemand("Brave Video Search"),
    description: translate("search_videos.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/video-search",
      bodyParams: ["query", "limit", "dateRestrict"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_videos.params.query"),
        },
        limit: {
          type: "integer",
          description: translate("search_videos.params.limit"),
        },
        dateRestrict: {
          type: "string",
          description: translate("search_videos.params.dateRestrict"),
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_files",
    dataSource: compute("sandboxed fs"),
    description: translate("read_files.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/read-multi",
      bodyParams: ["files"],
    },
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              absolutePath: {
                type: "string",
                description: translate("read_files.params.files.items.params.absolutePath"),
              },
              startLine: {
                type: "integer",
                description: translate("read_files.params.files.items.params.startLine"),
              },
              endLine: {
                type: "integer",
                description: translate("read_files.params.files.items.params.endLine"),
              },
            },
            required: ["absolutePath"],
          },
          description: translate("read_files.params.files"),
        },
      },
      required: ["files"],
    },
  },
  {
    name: "get_file_info",
    dataSource: compute("sandboxed fs"),
    description: translate("get_file_info.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/info",
      bodyParams: ["path", "paths"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("get_file_info.params.path"),
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description: translate("get_file_info.params.paths"),
        },
      },
      required: [],
    },
  },
  {
    name: "diff_files",
    dataSource: compute("sandboxed fs + diff"),
    description: translate("diff_files.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/diff",
      bodyParams: ["pathA", "pathB", "content", "contextLines"],
    },
    parameters: {
      type: "object",
      properties: {
        pathA: {
          type: "string",
          description: translate("diff_files.params.pathA"),
        },
        pathB: {
          type: "string",
          description: translate("diff_files.params.pathB"),
        },
        content: {
          type: "string",
          description: translate("diff_files.params.content"),
        },
        contextLines: {
          type: "integer",
          description: translate("diff_files.params.contextLines"),
        },
      },
      required: ["pathA"],
    },
  },
  {
    name: "move_file",
    dataSource: compute("sandboxed fs"),
    description: translate("move_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/move",
      bodyParams: ["source", "destination", "createDirs"],
    },
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: translate("move_file.params.source"),
        },
        destination: {
          type: "string",
          description: translate("move_file.params.destination"),
        },
        createDirs: {
          type: "boolean",
          description: translate("move_file.params.createDirs"),
        },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "delete_file",
    dataSource: compute("sandboxed fs"),
    description: translate("delete_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/delete",
      bodyParams: ["path", "recursive"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("delete_file.params.path"),
        },
        recursive: {
          type: "boolean",
          description: translate("delete_file.params.recursive"),
        },
      },
      required: ["path"],
    },
  },
  {
    name: "execute_command",
    dataSource: compute("sandboxed subprocess"),
    description: translate("execute_command.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/command/run",
      bodyParams: ["command", "cwd", "timeout", "run_in_background"],
    },
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: translate("execute_command.params.command"),
        },
        cwd: {
          type: "string",
          description: translate("execute_command.params.cwd"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_command.params.timeout"),
        },
        run_in_background: {
          type: "boolean",
          description: translate("execute_command.params.run_in_background"),
        },
      },
      required: ["command", "cwd"],
    },
  },
  {
    name: "summarize_project",
    dataSource: compute("fs scan"),
    description: translate("summarize_project.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/project/summary",
      bodyParams: ["path"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("summarize_project.params.path"),
        },
      },
      required: ["path"],
    },
  },
  {
    name: "run_git",
    dataSource: compute("git subprocess"),
    description: translate("run_git.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/git",
      bodyParams: [
        "action",
        "path",
        "staged",
        "file",
        "ref",
        "limit",
        "author",
        "since",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("run_git.params.action"),
          enum: ["status", "diff", "log"],
        },
        path: { type: "string", description: translate("run_git.params.path") },
        staged: {
          type: "boolean",
          description: translate("run_git.params.staged"),
        },
        file: {
          type: "string",
          description: translate("run_git.params.file"),
        },
        ref: { type: "string", description: translate("run_git.params.ref") },
        limit: {
          type: "number",
          description: translate("run_git.params.limit"),
        },
        author: { type: "string", description: translate("run_git.params.author") },
        since: {
          type: "string",
          description: translate("run_git.params.since"),
        },
      },
      required: ["action", "path"],
    },
  },
  {
    name: "control_browser",
    dataSource: compute("headless Chromium (Playwright)"),
    description: translate("control_browser.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/browser/action",
      bodyParams: [
        "action",
        "sessionId",
        "url",
        "selector",
        "text",
        "pressEnter",
        "fullPage",
        "direction",
        "amount",
        "expression",
        "format",
        "timeout",
        "state",
        "limit",
        "ref",
        "value",
        "script",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("control_browser.params.action"),
          enum: [
            "navigate",
            "screenshot",
            "click",
            "type",
            "scroll",
            "evaluate",
            "get_content",
            "get_elements",
            "wait",
            "close",
            "snapshot",
            "click_ref",
            "type_ref",
            "hover_ref",
            "select_ref",
            "run_script",
          ],
        },
        sessionId: {
          type: "string",
          description: translate("control_browser.params.sessionId"),
        },
        url: {
          type: "string",
          description: translate("control_browser.params.url"),
        },
        selector: {
          type: "string",
          description: translate("control_browser.params.selector"),
        },
        ref: {
          type: "string",
          description: translate("control_browser.params.ref"),
        },
        text: {
          type: "string",
          description: translate("control_browser.params.text"),
        },
        value: {
          type: "string",
          description: translate("control_browser.params.value"),
        },
        pressEnter: {
          type: "boolean",
          description: translate("control_browser.params.pressEnter"),
        },
        fullPage: {
          type: "boolean",
          description: translate("control_browser.params.fullPage"),
        },
        direction: {
          type: "string",
          description: translate("control_browser.params.direction"),
        },
        amount: {
          type: "integer",
          description: translate("control_browser.params.amount"),
        },
        expression: {
          type: "string",
          description: translate("control_browser.params.expression"),
        },
        format: {
          type: "string",
          description: translate("control_browser.params.format"),
        },
        timeout: {
          type: "integer",
          description: translate("control_browser.params.timeout"),
        },
        state: {
          type: "string",
          description: translate("control_browser.params.state"),
        },
        limit: {
          type: "integer",
          description: translate("control_browser.params.limit"),
        },
        script: {
          type: "string",
          description: translate("control_browser.params.script"),
        },
      },
      required: ["action"],
    },
  },
  {
    name: "execute_browser_script",
    dataSource: compute("headless Chromium (Playwright subprocess)"),
    description: translate("execute_browser_script.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/browser/script",
      bodyParams: ["script", "sessionId", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: translate("execute_browser_script.params.script"),
        },
        sessionId: {
          type: "string",
          description: translate("execute_browser_script.params.sessionId"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_browser_script.params.timeout"),
        },
      },
      required: ["script"],
    },
  },

  // ── LSP Code Intelligence ────────────────────────────────
  {
    name: "query_language_server",
    dataSource: compute("LSP server (stdio JSON-RPC)"),
    description: translate("query_language_server.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/lsp/action",
      bodyParams: [
        "operation",
        "filePath",
        "line",
        "character",
        "workspacePath",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "goToDefinition",
            "findReferences",
            "hover",
            "documentSymbol",
            "goToImplementation",
          ],
          description: translate("query_language_server.params.operation"),
        },
        filePath: {
          type: "string",
          description: translate("query_language_server.params.filePath"),
        },
        line: {
          type: "integer",
          description: translate("query_language_server.params.line"),
        },
        character: {
          type: "integer",
          description: translate("query_language_server.params.character"),
        },
        workspacePath: {
          type: "string",
          description: translate("query_language_server.params.workspacePath"),
        },
      },
      required: ["operation", "filePath"],
    },
  },

  // ── Task Management ───────────────────────────────────────
  {
    name: "create_task",
    dataSource: compute("MongoDB agent_tasks"),
    description: translate("create_task.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/task/create",
      bodyParams: [
        "project",
        "subject",
        "description",
        "status",
        "activeForm",
        "metadata",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: translate("create_task.params.subject"),
        },
        description: {
          type: "string",
          description: translate("create_task.params.description"),
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed"],
          description: translate("create_task.params.status"),
        },
        activeForm: {
          type: "string",
          description: translate("create_task.params.activeForm"),
        },
        metadata: {
          type: "object",
          description: translate("create_task.params.metadata"),
        },
      },
      required: ["subject", "description"],
    },
  },
  {
    name: "list_tasks",
    dataSource: compute("MongoDB agent_tasks"),
    description: translate("list_tasks.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/task/list",
      bodyParams: ["project", "status", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed"],
          description: translate("list_tasks.params.status"),
        },
        limit: {
          type: "integer",
          description: translate("list_tasks.params.limit"),
        },
      },
      required: [],
    },
  },
  {
    name: "get_task",
    dataSource: compute("MongoDB agent_tasks"),
    description: translate("get_task.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/task/get",
      bodyParams: ["project", "taskId"],
    },
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "integer",
          description: translate("get_task.params.taskId"),
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "update_task",
    dataSource: compute("MongoDB agent_tasks"),
    description: translate("update_task.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/task/update",
      bodyParams: [
        "project",
        "taskId",
        "status",
        "subject",
        "description",
        "activeForm",
        "metadata",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "integer",
          description: translate("update_task.params.taskId"),
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "deleted"],
          description: translate("update_task.params.status"),
        },
        subject: {
          type: "string",
          description: translate("update_task.params.subject"),
        },
        description: {
          type: "string",
          description: translate("update_task.params.description"),
        },
        activeForm: {
          type: "string",
          description: translate("update_task.params.activeForm"),
        },
        metadata: {
          type: "object",
          description: translate("update_task.params.metadata"),
        },
      },
      required: ["taskId"],
    },
  },

  // ── Memory Persistence ────────────────────────────────────
  {
    name: "save_memory",
    dataSource: compute("Prism MemoryService"),
    description: translate("save_memory.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/memory/save",
      bodyParams: ["content", "type", "title"],
    },
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: translate("save_memory.params.content"),
        },
        type: {
          type: "string",
          enum: ["user", "feedback", "project", "reference"],
          description: translate("save_memory.params.type"),
        },
        title: {
          type: "string",
          description: translate("save_memory.params.title"),
        },
      },
      required: ["content"],
    },
  },

  // ── Communication (Twilio) ────────────────────────────────
  {
    name: "send_sms",
    dataSource: onDemand("Twilio"),
    description: translate("send_sms.description"),
    endpoint: { path: "/communication/sms/send", method: "POST" },
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: translate("send_sms.params.to"),
        },
        body: {
          type: "string",
          description: translate("send_sms.params.body"),
        },
        from: {
          type: "string",
          description: translate("send_sms.params.from"),
        },
      },
      required: ["to", "body"],
    },
  },
  {
    name: "list_sms_messages",
    dataSource: onDemand("Twilio"),
    description: translate("list_sms_messages.description"),
    endpoint: {
      path: "/communication/sms/messages",
      queryParams: ["to", "from", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: translate("list_sms_messages.params.to"),
        },
        from: {
          type: "string",
          description: translate("list_sms_messages.params.from"),
        },
        limit: {
          type: "integer",
          description: translate("list_sms_messages.params.limit"),
        },
      },
    },
  },
  {
    name: "get_sms_account",
    dataSource: onDemand("Twilio"),
    description: translate("get_sms_account.description"),
    endpoint: { path: "/communication/account" },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "lookup_phone_number",
    dataSource: onDemand("Twilio Lookup v2"),
    description: translate("lookup_phone_number.description"),
    endpoint: { path: "/communication/lookup/:phone", pathParams: ["phone"] },
    parameters: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: translate("lookup_phone_number.params.phone"),
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "list_phone_numbers",
    dataSource: onDemand("Twilio"),
    description: translate("list_phone_numbers.description"),
    endpoint: { path: "/communication/numbers" },
    parameters: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "get_emoji_combination",
    dataSource: cached("Google Emoji Kitchen", EMOJI_KITCHEN_INTERVAL_MS),
    description: translate("get_emoji_combination.description"),
    endpoint: {
      method: "GET",
      path: "/creative/emoji-kitchen/combine",
      queryParams: ["left", "right"],
    },
    parameters: {
      type: "object",
      properties: {
        left: {
          type: "string",
          description: translate("get_emoji_combination.params.left"),
        },
        right: {
          type: "string",
          description: translate("get_emoji_combination.params.right"),
        },
      },
      required: ["left", "right"],
    },
  },
  {
    name: "get_emoji_combinations",
    dataSource: cached("Google Emoji Kitchen", EMOJI_KITCHEN_INTERVAL_MS),
    description: translate("get_emoji_combinations.description"),
    endpoint: {
      method: "GET",
      path: "/creative/emoji-kitchen/combinations",
      queryParams: ["emoji", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        emoji: {
          type: "string",
          description: translate("get_emoji_combinations.params.emoji"),
        },
        limit: {
          type: "number",
          description: translate("get_emoji_combinations.params.limit"),
        },
      },
      required: ["emoji"],
    },
  },
  {
    name: "generate_image",

    dataSource: onDemand("Google Gemini via Prism"),
    description: translate("generate_image.description"),
    endpoint: {
      method: "POST",
      path: "/creative/generate-image",
      bodyParams: ["prompt", "referenceImages"],
    },
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: translate("generate_image.params.prompt"),
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "describe_image",
    dataSource: onDemand("Google Gemini via Prism"),
    description: translate("describe_image.description"),
    endpoint: {
      method: "POST",
      path: "/creative/describe-image",
      bodyParams: ["imageUrls", "context"],
    },
    parameters: {
      type: "object",
      properties: {
        imageUrls: {
          type: "array",
          items: { type: "string" },
          description: translate("describe_image.params.imageUrls"),
        },
        context: {
          type: "string",
          enum: ["avatar", "banner", "photo", "general"],
          description: translate("describe_image.params.context"),
        },
      },
      required: ["imageUrls"],
    },
  },

  // ── Text-to-Speech ──────────────────────────────────────────
  {
    name: "synthesize_speech",
    dataSource: onDemand("Inworld / ElevenLabs / OpenAI / Google via Prism"),
    description: translate("synthesize_speech.description"),
    endpoint: {
      path: "/creative/text-to-speech",
      method: "POST",
      bodyParams: ["text", "voice"],
    },
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: translate("synthesize_speech.params.text"),
        },
        voice: {
          type: "string",
          description: translate("synthesize_speech.params.voice"),
        },
      },
      required: ["text"],
    },
  },
  {
    name: "synthesize_speech_local",
    dataSource: compute("espeak-ng (local)"),
    description: translate("synthesize_speech_local.description"),
    endpoint: {
      path: "/creative/local-text-to-speech",
      method: "POST",
      bodyParams: ["text", "voice", "speed", "pitch", "volume", "wordGap"],
    },
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: translate("synthesize_speech_local.params.text"),
        },
        voice: {
          type: "string",
          description: translate("synthesize_speech_local.params.voice"),
        },
        speed: {
          type: "integer",
          description: translate("synthesize_speech_local.params.speed"),
        },
        pitch: {
          type: "integer",
          description: translate("synthesize_speech_local.params.pitch"),
        },
        volume: {
          type: "integer",
          description: translate("synthesize_speech_local.params.volume"),
        },
        wordGap: {
          type: "integer",
          description: translate("synthesize_speech_local.params.wordGap"),
        },
      },
      required: ["text"],
    },
  },
  {
    name: "create_vector_animation",
    dataSource: onDemand("Creative Vector Animation Engine"),
    description: translate("create_vector_animation.description"),
    endpoint: {
      method: "POST",
      path: "/creative/vector-animation",
      bodyParams: ["animation", "options", "sessionId", "referenceImageUrl"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_vector_animation.params.sessionId"),
        },
        options: {
          type: "object",
          properties: {
            loop: {
              type: "boolean",
              description: translate("create_vector_animation.params.options.params.loop"),
            },
            autoplay: {
              type: "boolean",
              description: translate("create_vector_animation.params.options.params.autoplay"),
            },
            title: {
              type: "string",
              description: translate("create_vector_animation.params.options.params.title"),
            },
          },
        },
        animation: {
          type: "object",
          description: translate("create_vector_animation.params.animation"),
          properties: {
            clearSession: {
              type: "boolean",
              description: translate("create_vector_animation.params.animation.params.clearSession"),
            },
            width: {
              type: "integer",
              description: translate("create_vector_animation.params.animation.params.width"),
            },
            height: {
              type: "integer",
              description: translate("create_vector_animation.params.animation.params.height"),
            },
            duration: {
              type: "number",
              description: translate("create_vector_animation.params.animation.params.duration"),
            },
            fps: {
              type: "integer",
              description: translate("create_vector_animation.params.animation.params.fps"),
            },
            background: {
              type: "string",
              description: translate("create_vector_animation.params.animation.params.background"),
            },
            layers: {
              type: "array",
              description: translate("create_vector_animation.params.animation.params.layers"),
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.id"),
                  },
                  action: {
                    type: "string",
                    enum: ["delete"],
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.action"),
                  },
                  replaceKeyframes: {
                    type: "boolean",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.replaceKeyframes"),
                  },
                  shapeType: {
                    type: "string",
                    enum: [
                      "rectangle",
                      "circle",
                      "ellipse",
                      "line",
                      "polygon",
                      "path",
                      "text",
                    ],
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.shapeType"),
                  },
                  shapeData: {
                    type: "object",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.shapeData"),
                  },
                  fillColor: {
                    anyOf: [
                      {
                        type: "string",
                        description: translate("create_vector_animation.params.fillColor"),
                      },
                      {
                        type: "object",
                        description: translate("create_vector_animation.params.fillGradient"),
                        properties: {
                          type: {
                            type: "string",
                            enum: ["linear", "radial"],
                          },
                          x1: {
                            type: "number",
                            description: translate("create_vector_animation.params.x1"),
                          },
                          y1: {
                            type: "number",
                            description: translate("create_vector_animation.params.y1"),
                          },
                          x2: {
                            type: "number",
                            description: translate("create_vector_animation.params.x2"),
                          },
                          y2: {
                            type: "number",
                            description: translate("create_vector_animation.params.y2"),
                          },
                          x0: {
                            type: "number",
                            description: translate("create_vector_animation.params.x0"),
                          },
                          y0: {
                            type: "number",
                            description: translate("create_vector_animation.params.y0"),
                          },
                          r0: {
                            type: "number",
                            description: translate("create_vector_animation.params.r0"),
                          },
                          r1: {
                            type: "number",
                            description: translate("create_vector_animation.params.r1"),
                          },
                          stops: {
                            type: "array",
                            description: translate("create_vector_animation.params.stops"),
                            items: {
                              type: "object",
                              properties: {
                                offset: {
                                  type: "number",
                                  description: translate("create_vector_animation.params.offset"),
                                },
                                color: {
                                  type: "string",
                                  description: translate("create_vector_animation.params.color"),
                                },
                              },
                              required: ["offset", "color"],
                            },
                          },
                        },
                        required: ["type", "stops"],
                      },
                    ],
                  },
                  strokeColor: {
                    anyOf: [
                      {
                        type: "string",
                        description: translate("create_vector_animation.params.strokeColor"),
                      },
                      {
                        type: "object",
                        description: translate("create_vector_animation.params.strokeGradient"),
                        properties: {
                          type: {
                            type: "string",
                            enum: ["linear", "radial"],
                          },
                          x1: {
                            type: "number",
                            description: translate("create_vector_animation.params.x1"),
                          },
                          y1: {
                            type: "number",
                            description: translate("create_vector_animation.params.y1"),
                          },
                          x2: {
                            type: "number",
                            description: translate("create_vector_animation.params.x22"),
                          },
                          y2: {
                            type: "number",
                            description: translate("create_vector_animation.params.y22"),
                          },
                          x0: {
                            type: "number",
                            description: translate("create_vector_animation.params.x02"),
                          },
                          y0: {
                            type: "number",
                            description: translate("create_vector_animation.params.y02"),
                          },
                          r0: {
                            type: "number",
                            description: translate("create_vector_animation.params.r02"),
                          },
                          r1: {
                            type: "number",
                            description: translate("create_vector_animation.params.r12"),
                          },
                          stops: {
                            type: "array",
                            description: translate("create_vector_animation.params.stops2"),
                            items: {
                              type: "object",
                              properties: {
                                offset: {
                                  type: "number",
                                  description: translate("create_vector_animation.params.offset2"),
                                },
                                color: {
                                  type: "string",
                                  description: translate("create_vector_animation.params.color2"),
                                },
                              },
                              required: ["offset", "color"],
                            },
                          },
                        },
                        required: ["type", "stops"],
                      },
                    ],
                  },
                  strokeWidth: {
                    type: "number",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.strokeWidth"),
                  },
                  opacity: {
                    type: "number",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.opacity"),
                  },
                  imageUrl: {
                    type: "string",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.imageUrl"),
                  },
                  keyframes: {
                    type: "array",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes"),
                    items: {
                      type: "object",
                      properties: {
                        time: {
                          type: "number",
                          description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.time"),
                        },
                        easing: {
                          type: "string",
                          description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.easing"),
                        },
                        motionPath: {
                          type: "object",
                          description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.motionPath"),
                          properties: {
                            path: {
                              type: "string",
                              description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.motionPath.params.path"),
                            },
                            orientToPath: {
                              type: "boolean",
                              description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.motionPath.params.orientToPath"),
                            },
                          },
                        },
                        properties: {
                          type: "object",
                          description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.properties"),
                        },
                      },
                      required: ["time", "properties"],
                    },
                  },
                },
                required: ["id", "shapeType"],
              },
            },
          },
          required: ["layers"],
        },
      },
      required: ["animation"],
    },
  },
  {
    name: "generate_audio",
    dataSource: compute("SoundSynthesizerService"),
    description: translate("generate_audio.description"),
    endpoint: {
      path: "/creative/generate-audio",
      method: "POST",
      bodyParams: [
        "action",
        "sessionId",
        "channelId",
        "linesPerBeat",
        "rows",
        "append",
        "startRow",
        "clearSession",
        "soundType",
        "presetEffect",
        "duration",
        "waveform",
        "frequency",
        "endFrequency",
        "modulatorFrequency",
        "modulationIndex",
        "envelope",
        "harmonics",
        "lfo",

        "delay",
        "sampleRate",
        "tempo",
        "nodes",
        "tracks",
        "instrument",
        "swing",
        "humanize",
        "timeSignature",
        "volume",
        "effects",
        "nodeChain",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        // ── Tracker workflow params (set action to use) ────────
        action: {
          type: "string",
          enum: ["init", "add_channel", "write_pattern", "render"],
          description: translate("generate_audio.params.action"),
        },
        sessionId: {
          type: "string",
          description: translate("generate_audio.params.sessionId"),
        },
        channelId: {
          type: "string",
          description: translate("generate_audio.params.channelId"),
        },
        volume: {
          type: "number",
          description: translate("generate_audio.params.volume"),
        },
        linesPerBeat: {
          type: "integer",
          description: translate("generate_audio.params.linesPerBeat"),
        },
        effects: {
          type: "object",
          description: translate("generate_audio.params.effects"),
          properties: {
            reverb: {
              type: "object",
              properties: {
                wet: { type: "number", description: translate("generate_audio.params.wet") },
                decayTime: { type: "number", description: translate("generate_audio.params.decayTime") },
              },
            },
            delay: {
              type: "object",
              properties: {
                delayTime: { type: "number", description: translate("generate_audio.params.delayTime") },
                feedback: { type: "number", description: translate("generate_audio.params.feedback") },
                pingPong: { type: "boolean", description: translate("generate_audio.params.pingPong") },
              },
            },
            filter: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["lowpass", "highpass", "bandpass"] },
                cutoff: { type: "number", description: translate("generate_audio.params.cutoff") },
                Q: { type: "number", description: translate("generate_audio.params.Q") },
              },
            },
            distortion: {
              type: "object",
              properties: {
                algorithm: { type: "string", enum: ["soft_clip", "hard_clip", "bitcrush"] },
                drive: { type: "number", description: translate("generate_audio.params.drive") },
              },
            },
          },
        },
        rows: {
          type: "array",
          description: translate("generate_audio.params.rows"),
          items: {
            type: "object",
            properties: {
              note: {
                type: "string",
                description: translate("generate_audio.params.rows.items.params.note"),
              },
              velocity: {
                type: "number",
                description: translate("generate_audio.params.rows.items.params.velocity"),
              },
              duration: {
                type: "integer",
                description: translate("generate_audio.params.rows.items.params.duration"),
              },
            },
            required: ["note", "duration"],
          },
        },
        append: {
          type: "boolean",
          description: translate("generate_audio.params.append"),
        },
        startRow: {
          type: "integer",
          description: translate("generate_audio.params.startRow"),
        },
        clearSession: {
          type: "boolean",
          description: translate("generate_audio.params.clearSession"),
        },
        // ── Direct synthesis params (no action needed) ─────────
        soundType: {
          type: "string",
          enum: [
            "synthesizer",
            "sound_effect",
            "modular",
          ],
          description: translate("generate_audio.params.soundType"),
        },
        presetEffect: {
          type: "string",
          enum: [
            "laser",
            "coin",
            "powerup",
            "jump",
            "explosion",
            "synthwave_bass",
            "ambient_pad",
            "sci_fi_sweep",
          ],
          description: translate("generate_audio.params.presetEffect"),
        },
        duration: {
          type: "number",
          description: translate("generate_audio.params.duration"),
        },
        waveform: {
          type: "string",
          enum: ["sine", "triangle", "sawtooth", "square", "noise"],
          description: translate("generate_audio.params.waveform"),
        },
        frequency: {
          type: "string",
          description: translate("generate_audio.params.frequency"),
        },
        endFrequency: {
          type: "string",
          description: translate("generate_audio.params.endFrequency"),
        },
        modulatorFrequency: {
          type: "number",
          description: translate("generate_audio.params.modulatorFrequency"),
        },
        modulationIndex: {
          type: "number",
          description: translate("generate_audio.params.modulationIndex"),
        },
        envelope: {
          type: "object",
          description: translate("generate_audio.params.envelope"),
          properties: {
            attack: {
              type: "number",
              description: translate("generate_audio.params.envelope.params.attack"),
            },
            decay: {
              type: "number",
              description: translate("generate_audio.params.envelope.params.decay"),
            },
            sustain: {
              type: "number",
              description: translate("generate_audio.params.envelope.params.sustain"),
            },
            release: {
              type: "number",
              description: translate("generate_audio.params.envelope.params.release"),
            },
          },
        },
        harmonics: {
          type: "array",
          items: { type: "number" },
          description: translate("generate_audio.params.harmonics"),
        },
        lfo: {
          type: "object",
          description: translate("generate_audio.params.lfo"),
          properties: {
            frequency: {
              type: "number",
              description: translate("generate_audio.params.lfo.params.frequency"),
            },
            pitchDepth: { type: "number", description: translate("generate_audio.params.pitchDepth") },
            amplitudeDepth: {
              type: "number",
              description: translate("generate_audio.params.lfo.params.amplitudeDepth"),
            },
          },
          required: ["frequency"],
        },

        delay: {
          type: "object",
          description: translate("generate_audio.params.delay"),
          properties: {
            delayTime: {
              type: "number",
              description: translate("generate_audio.params.delay.params.delayTime"),
            },
            feedback: {
              type: "number",
              description: translate("generate_audio.params.delay.params.feedback"),
            },
          },
          required: ["delayTime", "feedback"],
        },
        sampleRate: {
          type: "number",
          description: translate("generate_audio.params.sampleRate"),
        },
        tempo: {
          type: "number",
          description: translate("generate_audio.params.tempo"),
        },
        nodes: {
          type: "object",
          description: translate("generate_audio.params.nodes"),
        },
        tracks: {
          type: "array",
          description: translate("generate_audio.params.tracks"),
          items: {
            type: "object",
            properties: {
              nodeChain: {
                type: "array",
                items: { type: "string" },
                description: translate("generate_audio.params.tracks.items.params.nodeChain"),
              },
              notes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    time: {
                      type: "string",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.time"),
                    },
                    duration: {
                      type: "string",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.duration"),
                    },
                    note: {
                      type: "string",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.note"),
                    },
                    velocity: {
                      type: "number",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.velocity"),
                    },
                    pitchBend: {
                      type: "object",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.pitchBend"),
                      properties: {
                        target: {
                          type: "string",
                          description: translate("generate_audio.params.tracks.items.params.notes.items.params.pitchBend.params.target"),
                        },
                        startTime: {
                          type: "number",
                          description: translate("generate_audio.params.tracks.items.params.notes.items.params.pitchBend.params.startTime"),
                        },
                        endTime: {
                          type: "number",
                          description: translate("generate_audio.params.tracks.items.params.notes.items.params.pitchBend.params.endTime"),
                        },
                      },
                      required: ["target"],
                    },
                  },
                  required: ["time", "duration", "note"],
                },
              },
              volume: {
                type: "number",
                description: translate("generate_audio.params.tracks.items.params.volume"),
              },
              repeat: {
                type: "integer",
                description: translate("generate_audio.params.tracks.items.params.repeat"),
              },
            },
            required: ["nodeChain", "notes"],
          },
        },
        instrument: {
          type: "string",
          enum: [
            "acoustic_guitar",
            "electric_guitar",
            "nylon_guitar",
            "piano",
            "electric_piano",
            "organ",
            "trumpet",
            "violin",
            "cello",
            "flute",
            "clarinet",
            "synth_lead",
            "synth_pad",
            "synth_bass",
            "bass_guitar",
            "marimba",
            "vibraphone",
            "harmonica",
          ],
          description: translate("generate_audio.params.instrument"),
        },
        swing: {
          type: "number",
          description: translate("generate_audio.params.swing"),
        },
        humanize: {
          type: "number",
          description: translate("generate_audio.params.humanize"),
        },
        timeSignature: {
          type: "array",
          items: { type: "integer" },
          description: translate("generate_audio.params.timeSignature"),
        },
      },
    },
  },

  // ── Audio Remix / Effects Pipeline ──────────────────────────
  {
    name: "remix_audio",
    dataSource: compute("ffmpeg"),
    description: translate("remix_audio.description"),
    endpoint: {
      path: "/creative/remix-audio",
      method: "POST",
      bodyParams: ["input", "operations", "preset", "outputFormat", "sampleRate"],
    },
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: translate("remix_audio.params.input"),
        },
        operations: {
          type: "array",
          description: translate("remix_audio.params.operations"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "pitch_shift", "tempo", "speed", "reverb", "echo",
                  "lowpass", "highpass", "bandpass", "equalizer",
                  "bass_boost", "treble_boost", "distortion",
                  "chorus", "flanger", "phaser", "tremolo", "vibrato",
                  "compressor", "normalize", "reverse",
                  "fade_in", "fade_out", "trim", "volume",
                  "stereo_pan", "bitcrush", "crystalizer",
                ],
                description: translate("remix_audio.params.operations.items.params.type"),
              },
              semitones: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.semitones"),
              },
              factor: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.factor"),
              },
              delay: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.delay"),
              },
              decay: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.decay"),
              },
              delays: {
                type: "array",
                items: { type: "number" },
                description: translate("remix_audio.params.operations.items.params.delays"),
              },
              decays: {
                type: "array",
                items: { type: "number" },
                description: translate("remix_audio.params.operations.items.params.decays"),
              },
              frequency: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.frequency"),
              },
              width: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.width"),
              },
              gain: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.gain"),
              },
              color: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.color"),
              },
              depth: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.depth"),
              },
              speed: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.speed"),
              },
              threshold: { type: "number", description: translate("remix_audio.params.threshold") },
              ratio: { type: "number", description: translate("remix_audio.params.ratio") },
              attack: { type: "number", description: translate("remix_audio.params.attack") },
              release: { type: "number", description: translate("remix_audio.params.release") },
              duration: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.duration"),
              },
              start: { type: "number", description: translate("remix_audio.params.start") },
              end: { type: "number", description: translate("remix_audio.params.end") },
              level: { type: "number", description: translate("remix_audio.params.level") },
              pan: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.pan"),
              },
              bits: { type: "number", description: translate("remix_audio.params.bits") },
              sampleRate: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.sampleRate"),
              },
              intensity: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.intensity"),
              },
            },
            required: ["type"],
          },
        },
        preset: {
          type: "string",
          enum: [
            "chipmunk", "demon_voice", "nightcore", "vaporwave",
            "slowed_reverb", "underwater", "radio", "telephone",
            "robot", "cave", "vinyl", "megaphone",
          ],
          description: translate("remix_audio.params.preset"),
        },
        outputFormat: {
          type: "string",
          enum: ["wav", "mp3", "ogg", "opus"],
          description: translate("remix_audio.params.outputFormat"),
        },
        sampleRate: {
          type: "number",
          description: translate("remix_audio.params.sampleRate"),
        },
      },
      required: ["input"],
    },
  },

  // ── Speech-to-Text ──────────────────────────────────────────
  {
    name: "transcribe_audio",
    dataSource: onDemand("OpenAI Whisper / Google via Prism"),
    description: translate("transcribe_audio.description"),
    endpoint: {
      path: "/creative/speech-to-text",
      method: "POST",
      bodyParams: ["audioUrl", "audio", "provider", "model", "language"],
    },
    parameters: {
      type: "object",
      properties: {
        audioUrl: {
          type: "string",
          description: translate("transcribe_audio.params.audioUrl"),
        },
        audio: {
          type: "string",
          description: translate("transcribe_audio.params.audio"),
        },
        provider: {
          type: "string",
          description: translate("transcribe_audio.params.provider"),
          enum: ["openai", "google"],
        },
        model: {
          type: "string",
          description: translate("transcribe_audio.params.model"),
        },
        language: {
          type: "string",
          description: translate("transcribe_audio.params.language"),
        },
      },
    },
  },

  // ── Discord (Lupos DB) ──────────────────────────────────────
  {
    name: "search_discord_messages",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("search_discord_messages.description"),
    endpoint: {
      path: "/discord/messages/search",
      queryParams: [
        "guildId",
        "channelId",
        "userId",
        "username",
        "query",
        "before",
        "after",
        "limit",
        "mode",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("search_discord_messages.params.guildId"),
        },
        channelId: {
          type: "string",
          description: translate("search_discord_messages.params.channelId"),
        },
        userId: {
          type: "string",
          description: translate("search_discord_messages.params.userId"),
        },
        username: {
          type: "string",
          description: translate("search_discord_messages.params.username"),
        },
        query: {
          type: "string",
          description: translate("search_discord_messages.params.query"),
        },
        before: {
          type: "string",
          description: translate("search_discord_messages.params.before"),
        },
        after: {
          type: "string",
          description: translate("search_discord_messages.params.after"),
        },
        limit: {
          type: "number",
          description: translate("search_discord_messages.params.limit"),
        },
        mode: {
          type: "string",
          enum: ["messages", "count", "compact"],
          description: translate("search_discord_messages.params.mode"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_message_analytics",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_message_analytics.description"),
    endpoint: {
      path: "/discord/messages/analytics",
      queryParams: [
        "guildId",
        "channelId",
        "userId",
        "username",
        "query",
        "before",
        "after",
        "groupBy",
        "topN",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_server_activity.params.guildId"),
        },
        channelId: {
          type: "string",
          description: translate("search_discord_messages.params.channelId"),
        },
        userId: {
          type: "string",
          description: translate("search_discord_messages.params.userId"),
        },
        username: {
          type: "string",
          description: translate("get_discord_message_analytics.params.username"),
        },
        query: {
          type: "string",
          description: translate("get_discord_message_analytics.params.query"),
        },
        before: {
          type: "string",
          description: translate("get_discord_message_analytics.params.before"),
        },
        after: {
          type: "string",
          description: translate("get_discord_message_analytics.params.after"),
        },
        groupBy: {
          type: "string",
          enum: ["user", "channel", "day", "hour", "weekday", "month"],
          description: translate("get_discord_message_analytics.params.groupBy"),
        },
        topN: {
          type: "number",
          description: translate("get_discord_message_analytics.params.topN"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_server_activity",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_server_activity.description"),
    endpoint: {
      path: "/discord/activity",
      queryParams: ["guildId", "channelId", "days", "topN"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_server_activity.params.guildId"),
        },
        channelId: {
          type: "string",
          description: translate("get_discord_server_activity.params.channelId"),
        },
        days: {
          type: "number",
          description: translate("get_discord_server_activity.params.days"),
        },
        topN: {
          type: "number",
          description: translate("get_discord_server_activity.params.topN"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_guild_channels",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_guild_channels.description"),
    endpoint: {
      path: "/discord/guild/channels",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_guild_channels.params.guildId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_guild_members",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_guild_members.description"),
    endpoint: {
      path: "/discord/guild/members",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_guild_members.params.guildId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_guild_emojis",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_guild_emojis.description"),
    endpoint: {
      path: "/discord/guild/emojis",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_guild_emojis.params.guildId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_bot_stats",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_bot_stats.description"),
    endpoint: {
      path: "/discord/bot/stats",
      queryParams: [],
    },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_bot_guilds",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_bot_guilds.description"),
    endpoint: {
      path: "/discord/bot/guilds",
      queryParams: [],
    },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_bot_activity_timeline",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_bot_activity_timeline.description"),
    endpoint: {
      path: "/discord/bot/activity",
      queryParams: [],
    },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_discord_user_heatmap_data",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_user_heatmap_data.description"),
    endpoint: {
      path: "/discord/guild/heatmap",
      queryParams: [
        "guildId",
        "userId",
        "channelId",
        "years",
        "months",
        "days",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("common.params.discordGuildId"),
        },
        userId: {
          type: "string",
          description: translate("get_discord_word_frequencies.params.userId"),
        },
        channelId: {
          type: "string",
          description: translate("get_discord_user_heatmap_data.params.channelId"),
        },
        years: {
          type: "number",
          description: translate("common.params.yearsOfHistory"),
        },
        months: {
          type: "number",
          description: translate("common.params.monthsOfHistory"),
        },
        days: {
          type: "number",
          description: translate("common.params.daysOfHistory"),
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "get_discord_mention_leaderboard",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_mention_leaderboard.description"),
    endpoint: {
      path: "/discord/guild/mentions",
      queryParams: [
        "guildId",
        "userId",
        "years",
        "months",
        "days",
        "channelId",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("common.params.discordGuildId"),
        },
        userId: {
          type: "string",
          description: translate("get_discord_mention_leaderboard.params.userId"),
        },
        years: {
          type: "number",
          description: translate("common.params.yearsOfHistory"),
        },
        months: {
          type: "number",
          description: translate("common.params.monthsOfHistory"),
        },
        days: {
          type: "number",
          description: translate("common.params.daysOfHistory"),
        },
        channelId: {
          type: "string",
          description: translate("get_discord_user_heatmap_data.params.channelId"),
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "get_discord_message_leaderboard",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_message_leaderboard.description"),
    endpoint: {
      path: "/discord/guild/leaderboard",
      queryParams: ["guildId", "years", "months", "days", "channelId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("common.params.discordGuildId"),
        },
        years: {
          type: "number",
          description: translate("common.params.yearsOfHistory"),
        },
        months: {
          type: "number",
          description: translate("common.params.monthsOfHistory"),
        },
        days: {
          type: "number",
          description: translate("common.params.daysOfHistory"),
        },
        channelId: {
          type: "string",
          description: translate("get_discord_message_leaderboard.params.channelId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_word_frequencies",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_word_frequencies.description"),
    endpoint: {
      path: "/discord/guild/word-frequencies",
      queryParams: ["guildId", "userId", "years", "months", "days", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("common.params.discordGuildId"),
        },
        userId: {
          type: "string",
          description: translate("get_discord_word_frequencies.params.userId"),
        },
        years: {
          type: "number",
          description: translate("common.params.yearsOfHistory"),
        },
        months: {
          type: "number",
          description: translate("common.params.monthsOfHistory"),
        },
        days: {
          type: "number",
          description: translate("common.params.daysOfHistory"),
        },
        limit: {
          type: "number",
          description: translate("get_discord_word_frequencies.params.limit"),
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "react_to_discord_message",
    dataSource: onDemand("Discord Live API"),
    description: translate("react_to_discord_message.description"),
    endpoint: {
      path: "/discord/guild/react",
      method: "POST",
      bodyParams: ["guildId", "channelId", "messageId", "emoji"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("react_to_discord_message.params.guildId"),
        },
        channelId: {
          type: "string",
          description: translate("react_to_discord_message.params.channelId"),
        },
        messageId: {
          type: "string",
          description: translate("react_to_discord_message.params.messageId"),
        },
        emoji: {
          type: "string",
          description: translate("react_to_discord_message.params.emoji"),
        },
      },
      required: ["guildId", "channelId", "messageId", "emoji"],
    },
  },
  {
    name: "get_discord_voice_channel_members",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_voice_channel_members.description"),
    endpoint: {
      path: "/discord/guild/voice-members",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_voice_channel_members.params.guildId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_user_profile",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_user_profile.description"),
    endpoint: {
      path: "/discord/guild/user-profile",
      queryParams: ["guildId", "userId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_user_profile.params.guildId"),
        },
        userId: {
          type: "string",
          description: translate("get_discord_user_profile.params.userId"),
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "get_discord_channel_activity_stats",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_channel_activity_stats.description"),
    endpoint: {
      path: "/discord/guild/channel-stats",
      queryParams: ["guildId", "days"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_channel_activity_stats.params.guildId"),
        },
        days: {
          type: "number",
          description: translate("get_discord_channel_activity_stats.params.days"),
        },
      },
      required: ["guildId"],
    },
  },
  // ── Smart Home (LIFX Lights) ────────────────────────────────
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

  // ── Agent Management ──────────────────────────────────────
  {
    name: "create_custom_agent",
    dataSource: onDemand("Prism CustomAgentService"),
    description: translate("create_custom_agent.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/custom-agent/create",
      bodyParams: [
        "name",
        "description",
        "project",
        "icon",
        "avatar",
        "color",
        "backgroundImage",
        "identity",
        "guidelines",
        "toolPolicy",
        "enabledTools",
        "usesDirectoryTree",
        "usesCodingGuidelines",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: translate("create_custom_agent.params.name"),
        },
        description: {
          type: "string",
          description: translate("create_custom_agent.params.description"),
        },
        project: {
          type: "string",
          description: translate("create_custom_agent.params.project"),
        },
        icon: {
          type: "string",
          description: translate("create_custom_agent.params.icon"),
        },
        avatar: {
          type: "string",
          description: translate("create_custom_agent.params.avatar"),
        },
        color: {
          type: "string",
          description: translate("create_custom_agent.params.color"),
        },
        backgroundImage: {
          type: "string",
          description: translate("create_custom_agent.params.backgroundImage"),
        },
        identity: {
          type: "string",
          description: translate("create_custom_agent.params.identity"),
        },
        guidelines: {
          type: "string",
          description: translate("create_custom_agent.params.guidelines"),
        },
        toolPolicy: {
          type: "string",
          description: translate("create_custom_agent.params.toolPolicy"),
        },
        enabledTools: {
          type: "array",
          items: { type: "string" },
          description: translate("create_custom_agent.params.enabledTools"),
        },
        usesDirectoryTree: {
          type: "boolean",
          description: translate("create_custom_agent.params.usesDirectoryTree"),
        },
        usesCodingGuidelines: {
          type: "boolean",
          description: translate("create_custom_agent.params.usesCodingGuidelines"),
        },
      },
      required: ["name", "identity"],
    },
  },
  {
    name: "list_custom_agents",
    dataSource: onDemand("Prism CustomAgentService"),
    description: translate("list_custom_agents.description"),
    endpoint: {
      path: "/agentic/custom-agent/list",
    },
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_agents",
    dataSource: onDemand("Prism AgentPersonaRegistry"),
    description: translate("list_agents.description"),
    endpoint: {
      path: "/agentic/agent/list",
    },
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "update_custom_agent",
    dataSource: onDemand("Prism CustomAgentService"),
    description: translate("update_custom_agent.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/custom-agent/update",
      bodyParams: [
        "id",
        "name",
        "description",
        "project",
        "icon",
        "avatar",
        "color",
        "backgroundImage",
        "identity",
        "guidelines",
        "toolPolicy",
        "enabledTools",
        "usesDirectoryTree",
        "usesCodingGuidelines",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: translate("update_custom_agent.params.id"),
        },
        name: {
          type: "string",
          description: translate("update_custom_agent.params.name"),
        },
        description: {
          type: "string",
          description: translate("update_custom_agent.params.description"),
        },
        project: {
          type: "string",
          description: translate("update_custom_agent.params.project"),
        },
        icon: {
          type: "string",
          description: translate("update_custom_agent.params.icon"),
        },
        avatar: {
          type: "string",
          description: translate("update_custom_agent.params.avatar"),
        },
        color: {
          type: "string",
          description: translate("update_custom_agent.params.color"),
        },
        backgroundImage: {
          type: "string",
          description: translate("update_custom_agent.params.backgroundImage"),
        },
        identity: {
          type: "string",
          description: translate("update_custom_agent.params.identity"),
        },
        guidelines: {
          type: "string",
          description: translate("update_custom_agent.params.guidelines"),
        },
        toolPolicy: {
          type: "string",
          description: translate("update_custom_agent.params.toolPolicy"),
        },
        enabledTools: {
          type: "array",
          items: { type: "string" },
          description: translate("update_custom_agent.params.enabledTools")
        },
        usesDirectoryTree: {
          type: "boolean",
          description: translate("update_custom_agent.params.usesDirectoryTree"),
        },
        usesCodingGuidelines: {
          type: "boolean",
          description: translate("update_custom_agent.params.usesCodingGuidelines"),
        },
      },
      required: ["id"],
    },
  },

  // ── Tool Discovery (Meta-Tool) ────────────────────────────
  {
    name: "search_tools",
    dataSource: onDemand("ToolSchemaService"),
    description: translate("search_tools.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/tool/search",
      bodyParams: ["query", "domain", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_tools.params.query"),
        },
        domain: {
          type: "string",
          description: translate("search_tools.params.domain"),
        },
        limit: {
          type: "number",
          description: translate("search_tools.params.limit"),
        },
      },
      required: [],
    },
  },

  // ── Cron Jobs ──────────────────────────────────────────────
  {
    name: "create_cron_job",
    dataSource: onDemand("AgenticSchedulerService"),
    description: translate("create_cron_job.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/scheduled-task/create",
      bodyParams: [
        "project",
        "name",
        "prompt",
        "scheduleType",
        "cronExpression",
        "scheduleTime",
        "scheduleDay",
        "scheduleDate",
        "agent",
        "provider",
        "model",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: translate("create_cron_job.params.name"),
        },
        prompt: {
          type: "string",
          description: translate("create_cron_job.params.prompt"),
        },
        scheduleType: {
          type: "string",
          enum: ["hourly", "daily", "weekly", "cron", "trigger", "once"],
          description: translate("create_cron_job.params.scheduleType"),
        },
        cronExpression: {
          type: "string",
          description: translate("create_cron_job.params.cronExpression"),
        },
        scheduleTime: {
          type: "string",
          description: translate("create_cron_job.params.scheduleTime"),
        },
        scheduleDay: {
          type: "number",
          description: translate("create_cron_job.params.scheduleDay"),
        },
        scheduleDate: {
          type: "string",
          description: translate("create_cron_job.params.scheduleDate"),
        },
        agent: {
          type: "string",
          description: translate("create_cron_job.params.agent"),
        },
        provider: {
          type: "string",
          description: translate("create_cron_job.params.provider"),
        },
        model: {
          type: "string",
          description: translate("create_cron_job.params.model"),
        },
      },
      required: ["name", "prompt", "scheduleType"],
    },
  },
  {
    name: "list_cron_jobs",
    dataSource: onDemand("AgenticSchedulerService"),
    description: translate("list_cron_jobs.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/scheduled-task/list",
      bodyParams: ["project"],
    },
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "delete_cron_job",
    dataSource: onDemand("AgenticSchedulerService"),
    description: translate("delete_cron_job.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/scheduled-task/delete",
      bodyParams: ["project", "scheduleId"],
    },
    parameters: {
      type: "object",
      properties: {
        scheduleId: {
          type: "string",
          description: translate("delete_cron_job.params.scheduleId"),
        },
      },
      required: ["scheduleId"],
    },
  },
  {
    name: "trigger_cron_job",
    dataSource: onDemand("AgenticSchedulerService"),
    description: translate("trigger_cron_job.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/scheduled-task/trigger",
      bodyParams: ["project", "triggerName", "payload"],
    },
    parameters: {
      type: "object",
      properties: {
        triggerName: {
          type: "string",
          description: translate("trigger_cron_job.params.triggerName"),
        },
        payload: {
          type: "object",
          description: translate("trigger_cron_job.params.payload"),
        },
      },
      required: ["triggerName"],
    },
  },

  // ── Notebook Editing ──────────────────────────────────────
  {
    name: "edit_notebook",
    dataSource: onDemand("AgenticNotebookService"),
    description: translate("edit_notebook.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/notebook/edit",
      bodyParams: ["path", "action", "cellIndex", "content", "cellType"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("edit_notebook.params.path"),
        },
        action: {
          type: "string",
          enum: [
            "list_cells",
            "get_cell",
            "insert_cell",
            "replace_cell",
            "delete_cell",
          ],
          description: translate("edit_notebook.params.action"),
        },
        cellIndex: {
          type: "number",
          description: translate("edit_notebook.params.cellIndex"),
        },
        content: {
          type: "string",
          description: translate("edit_notebook.params.content"),
        },
        cellType: {
          type: "string",
          enum: ["code", "markdown", "raw"],
          description: translate("edit_notebook.params.cellType"),
        },
      },
      required: ["path", "action"],
    },
  },

  // ── Agentic: Orchestrator Utilities ───────────────────────
  // Stateless tools migrated from Prism's local tool registry.
  // These don't mutate loop state — they're pure compute/echo.

  {
    name: "think",
    dataSource: compute("echo"),
    description: translate("think.description"),
    endpoint: {
      method: "POST",
      path: "/compute/think",
      bodyParams: ["thought"],
    },
    parameters: {
      type: "object",
      properties: {
        thought: {
          type: "string",
          description: translate("think.params.thought"),
        },
      },
      required: ["thought"],
    },
  },
  {
    name: "sleep",
    dataSource: compute("timer"),
    description: translate("sleep.description"),
    endpoint: {
      method: "POST",
      path: "/compute/sleep",
      bodyParams: ["duration_seconds", "reason"],
    },
    parameters: {
      type: "object",
      properties: {
        duration_seconds: {
          type: "number",
          description: translate("sleep.params.duration_seconds"),
        },
        reason: {
          type: "string",
          description: translate("sleep.params.reason"),
        },
      },
      required: ["duration_seconds"],
    },
  },
  {
    name: "emit_structured_output",
    dataSource: compute("json-schema"),
    description: translate("emit_structured_output.description"),
    endpoint: {
      method: "POST",
      path: "/compute/synthetic-output",
      bodyParams: ["schema", "data", "label"],
    },
    parameters: {
      type: "object",
      properties: {
        schema: {
          type: "object",
          description: translate("emit_structured_output.params.schema"),
        },
        data: {
          type: "object",
          description: translate("emit_structured_output.params.data"),
        },
        label: {
          type: "string",
          description: translate("emit_structured_output.params.label"),
        },
      },
      required: ["data"],
    },
  },

  // ── Cron Expression Parser ─────────────────────────────────
  {
    name: "parse_cron_expression",
    dataSource: compute("internal"),
    description: translate("parse_cron_expression.description"),
    endpoint: {
      path: "/compute/cron/parse",
      queryParams: ["expression", "count", "from"],
    },
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: translate("parse_cron_expression.params.expression"),
        },
        count: {
          type: "number",
          description: translate("parse_cron_expression.params.count"),
        },
        from: {
          type: "string",
          description: translate("parse_cron_expression.params.from"),
        },
      },
      required: ["expression"],
    },
  },

  // ── Dota 2 (OpenDota) ─────────────────────────────────────────
  {
    name: "get_dota",
    dataSource: onDemand("OpenDota"),
    description: translate("get_dota.description"),
    endpoint: {
      path: "/gaming/dota",
      queryParams: [
        "action",
        "query",
        "heroId",
        "accountId",
        "matchId",
        "limit",
        "role",
        "attr",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "heroes",
            "hero",
            "matchups",
            "player",
            "player_matches",
            "match",
            "pro_matches",
          ],
          description: translate("get_steam_profile.params.action"),
        },
        query: {
          type: "string",
          description: translate("get_dota.params.query"),
        },
        heroId: {
          type: "number",
          description: translate("get_dota.params.heroId"),
        },
        accountId: {
          type: "number",
          description: translate("get_dota.params.accountId"),
        },
        matchId: {
          type: "number",
          description: translate("get_dota.params.matchId"),
        },
        limit: {
          type: "number",
          description: translate("get_dota.params.limit"),
        },
        role: {
          type: "string",
          description: translate("get_dota.params.role"),
        },
        attr: {
          type: "string",
          enum: ["str", "agi", "int", "all"],
          description: translate("get_dota.params.attr"),
        },
      },
      required: ["action"],
    },
  },

  // ── Steam Profile Lookup ─────────────────────────────────────
  {
    name: "get_steam_profile",
    dataSource: onDemand("Steam Web API"),
    description: translate("get_steam_profile.description"),
    endpoint: {
      path: "/gaming/steam",
      queryParams: ["action", "steamId", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "profile",
            "owned_games",
            "recent_games",
            "bans",
            "resolve_vanity",
          ],
          description: translate("get_steam_profile.params.action"),
        },
        steamId: {
          type: "string",
          description: translate("get_steam_profile.params.steamId"),
        },
        limit: {
          type: "number",
          description: translate("get_steam_profile.params.limit"),
        },
      },
      required: ["action", "steamId"],
    },
  },

  // ── Bonfire (Cozy Fire Pit) ───────────────────────────────────
  {
    name: "create_bonfire",
    dataSource: compute("Bonfire Generator"),
    description: translate("create_bonfire.description"),
    endpoint: {
      method: "POST",
      path: "/gaming/bonfire",
      bodyParams: [
        "woodType",
        "logsCount",
        "breezeSpeed",
        "fireColor",
        "intensity",
        "marshmallows",
        "itemToBurn",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        woodType: {
          type: "string",
          enum: ["oak", "pine", "birch", "driftwood", "magical"],
          description: translate("create_bonfire.params.woodType"),
        },
        logsCount: {
          type: "number",
          description: translate("create_bonfire.params.logsCount"),
        },
        breezeSpeed: {
          type: "number",
          description: translate("create_bonfire.params.breezeSpeed"),
        },
        fireColor: {
          type: "string",
          enum: ["classic", "emerald", "sapphire", "amethyst", "ghostly"],
          description: translate("create_bonfire.params.fireColor"),
        },
        intensity: {
          type: "string",
          enum: ["ember", "spark", "cozy", "blazing", "inferno"],
          description: translate("create_bonfire.params.intensity"),
        },
        marshmallows: {
          type: "number",
          description: translate("create_bonfire.params.marshmallows"),
        },
        itemToBurn: {
          type: "string",
          description: translate("create_bonfire.params.itemToBurn"),
        },
      },
    },
  },

  // ── Music (MusicBrainz) ────────────────────────────────────────
  {
    name: "get_music",
    dataSource: onDemand("MusicBrainz"),
    description: translate("get_music.description"),
    endpoint: {
      path: "/knowledge/music",
      queryParams: ["action", "q", "mbid", "artist", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "search_artists",
            "artist",
            "search_albums",
            "album",
            "search_tracks",
          ],
          description: translate("get_music.params.action"),
        },
        "q": {
          type: "string",
          description: translate("get_music.params.q"),
        },
        mbid: {
          type: "string",
          description: translate("get_music.params.mbid"),
        },
        artist: {
          type: "string",
          description: translate("get_music.params.artist"),
        },
        limit: {
          type: "number",
          description: translate("get_music.params.limit"),
        },
      },
      required: ["action"],
    },
  },

  // ── Wayback Machine ────────────────────────────────────────────
  {
    name: "get_wayback_snapshot",
    dataSource: onDemand("Internet Archive"),
    description: translate("get_wayback_snapshot.description"),
    endpoint: {
      path: "/knowledge/wayback",
      queryParams: ["action", "url", "timestamp", "limit", "from", "to"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["snapshot", "history"],
          description: translate("get_wayback_snapshot.params.action"),
        },
        url: {
          type: "string",
          description: translate("get_wayback_snapshot.params.url"),
        },
        timestamp: {
          type: "string",
          description: translate("get_wayback_snapshot.params.timestamp"),
        },
        limit: {
          type: "number",
          description: translate("get_wayback_snapshot.params.limit"),
        },
        from: {
          type: "string",
          description: translate("get_wayback_snapshot.params.from"),
        },
        to: {
          type: "string",
          description: translate("get_wayback_snapshot.params.to"),
        },
      },
      required: ["action", "url"],
    },
  },

  // ── Torrent Search & Download (qBittorrent) ────────────────────
  {
    name: "search_torrents",
    dataSource: onDemand("qBittorrent"),
    description: translate("search_torrents.description"),
    endpoint: {
      path: "/torrent",
      queryParams: ["action", "q", "category", "plugins", "limit", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search"],
          description: translate("search_torrents.params.action"),
        },
        "q": {
          type: "string",
          description: translate("search_torrents.params.q"),
        },
        category: {
          type: "string",
          enum: [
            "all",
            "movies",
            "tv",
            "music",
            "games",
            "anime",
            "software",
            "pictures",
            "books",
          ],
          description: translate("search_torrents.params.category"),
        },
        plugins: {
          type: "string",
          description: translate("search_torrents.params.plugins"),
        },
        limit: {
          type: "number",
          description: translate("search_torrents.params.limit"),
        },
        timeout: {
          type: "number",
          description: translate("search_torrents.params.timeout"),
        },
      },
      required: ["action", "q"],
    },
  },
  {
    name: "download_torrent",
    dataSource: onDemand("qBittorrent"),
    description: translate("download_torrent.description"),
    endpoint: {
      method: "POST",
      path: "/torrent/download",
      bodyParams: ["url", "savePath", "category", "tags", "paused"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("download_torrent.params.url"),
        },
        savePath: {
          type: "string",
          description: translate("download_torrent.params.savePath"),
        },
        category: {
          type: "string",
          description: translate("download_torrent.params.category"),
        },
        tags: {
          type: "string",
          description: translate("download_torrent.params.tags"),
        },
        paused: {
          type: "boolean",
          description: translate("download_torrent.params.paused"),
        },
      },
      required: ["url"],
    },
  },
  {
    name: "get_torrent_status",
    dataSource: onDemand("qBittorrent"),
    description: translate("get_torrent_status.description"),
    endpoint: {
      path: "/torrent",
      queryParams: ["action", "filter", "category", "sort", "limit", "hashes"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["status", "plugins", "transfer", "pause", "resume"],
          description: translate("get_torrent_status.params.action"),
        },
        filter: {
          type: "string",
          enum: [
            "all",
            "downloading",
            "seeding",
            "completed",
            "paused",
            "active",
            "inactive",
            "errored",
          ],
          description: translate("get_torrent_status.params.filter"),
        },
        category: {
          type: "string",
          description: translate("get_torrent_status.params.category"),
        },
        sort: {
          type: "string",
          description: translate("get_torrent_status.params.sort"),
        },
        limit: {
          type: "number",
          description: translate("get_torrent_status.params.limit"),
        },
        hashes: {
          type: "string",
          description: translate("get_torrent_status.params.hashes"),
        },
      },
      required: ["action"],
    },
  },
  // ── Network Intelligence ──────────────────────────────────
  {
    name: "dns_lookup",
    dataSource: compute("dns"),
    description: translate("dns_lookup.description"),
    endpoint: {
      path: "/utility/dns/:hostname",
      pathParams: ["hostname"],
      queryParams: ["type"],
    },
    parameters: {
      type: "object",
      properties: {
        hostname: {
          type: "string",
          description: translate("dns_lookup.params.hostname"),
        },
        type: {
          type: "string",
          enum: ["A", "AAAA", "MX", "CNAME", "TXT", "NS", "SOA", "SRV", "CAA", "PTR"],
          description: translate("dns_lookup.params.type"),
        },
      },
      required: ["hostname"],
    },
  },
  {
    name: "whois_lookup",
    dataSource: compute("whois"),
    description: translate("whois_lookup.description"),
    endpoint: {
      path: "/utility/whois/:domain",
      pathParams: ["domain"],
    },
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: translate("whois_lookup.params.domain"),
        },
      },
      required: ["domain"],
    },
  },
  {
    name: "ssl_certificate_check",
    dataSource: compute("tls"),
    description: translate("ssl_certificate_check.description"),
    endpoint: {
      path: "/utility/ssl/:hostname",
      pathParams: ["hostname"],
      queryParams: ["port"],
    },
    parameters: {
      type: "object",
      properties: {
        hostname: {
          type: "string",
          description: translate("ssl_certificate_check.params.hostname"),
        },
        port: {
          type: "number",
          description: translate("ssl_certificate_check.params.port"),
        },
      },
      required: ["hostname"],
    },
  },
  {
    name: "port_scan",
    dataSource: compute("tcp"),
    description: translate("port_scan.description"),
    endpoint: {
      path: "/utility/ports/:host",
      pathParams: ["host"],
      queryParams: ["ports"],
    },
    parameters: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: translate("port_scan.params.host"),
        },
        ports: {
          type: "string",
          description: translate("port_scan.params.ports"),
        },
      },
      required: ["host"],
    },
  },
  {
    name: "http_headers",
    dataSource: compute("http"),
    description: translate("http_headers.description"),
    endpoint: {
      path: "/utility/headers",
      queryParams: ["url"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("http_headers.params.url"),
        },
      },
      required: ["url"],
    },
  },
  {
    name: "ping_host",
    dataSource: compute("icmp"),
    description: translate("ping_host.description"),
    endpoint: {
      path: "/utility/ping/:host",
      pathParams: ["host"],
      queryParams: ["count"],
    },
    parameters: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: translate("ping_host.params.host"),
        },
        count: {
          type: "number",
          description: translate("ping_host.params.count"),
        },
      },
      required: ["host"],
    },
  },
  // ── Security ─────────────────────────────────────────────────
  {
    name: "check_breach",
    dataSource: onDemand("Have I Been Pwned"),
    description: translate("check_breach.description"),
    endpoint: {
      path: "/utility/breach/check",
      queryParams: ["type", "value"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["password", "email"],
          description: translate("check_breach.params.type"),
        },
        value: {
          type: "string",
          description: translate("check_breach.params.value"),
        },
      },
      required: ["type", "value"],
    },
  },
  // ── Communication ────────────────────────────────────────────
  {
    name: "send_push_notification",
    dataSource: onDemand("ntfy.sh"),
    description: translate("send_push_notification.description"),
    endpoint: {
      path: "/communication/push",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: translate("send_push_notification.params.topic"),
        },
        message: {
          type: "string",
          description: translate("send_push_notification.params.message"),
        },
        title: {
          type: "string",
          description: translate("send_push_notification.params.title"),
        },
        priority: {
          type: "string",
          enum: ["min", "low", "default", "high", "urgent"],
          description: translate("send_push_notification.params.priority"),
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: translate("send_push_notification.params.tags"),
        },
        clickUrl: {
          type: "string",
          description: translate("send_push_notification.params.clickUrl"),
        },
      },
      required: ["topic", "message"],
    },
  },
  {
    name: "send_webhook",
    dataSource: compute("http"),
    description: translate("send_webhook.description"),
    endpoint: {
      path: "/communication/webhook",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("send_webhook.params.url"),
        },
        payload: {
          type: "object",
          description: translate("send_webhook.params.payload"),
        },
        method: {
          type: "string",
          enum: ["POST", "PUT", "PATCH"],
          description: translate("send_webhook.params.method"),
        },
        headers: {
          type: "object",
          description: translate("send_webhook.params.headers"),
        },
      },
      required: ["url", "payload"],
    },
  },
  // ── Calendar ─────────────────────────────────────────────────
  {
    name: "get_calendar_events",
    dataSource: onDemand("Google Calendar"),
    description: translate("get_calendar_events.description"),
    endpoint: {
      path: "/utility/calendar/events",
      queryParams: ["calendarId", "timeMin", "timeMax", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: translate("get_calendar_events.params.calendarId"),
        },
        timeMin: {
          type: "string",
          description: translate("get_calendar_events.params.timeMin"),
        },
        timeMax: {
          type: "string",
          description: translate("get_calendar_events.params.timeMax"),
        },
        limit: {
          type: "number",
          description: translate("get_calendar_events.params.limit"),
        },
      },
      required: [],
    },
  },
  {
    name: "create_calendar_event",
    dataSource: onDemand("Google Calendar"),
    description: translate("create_calendar_event.description"),
    endpoint: {
      path: "/utility/calendar/events",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: translate("create_calendar_event.params.summary"),
        },
        startDateTime: {
          type: "string",
          description: translate("create_calendar_event.params.startDateTime"),
        },
        endDateTime: {
          type: "string",
          description: translate("create_calendar_event.params.endDateTime"),
        },
        description: {
          type: "string",
          description: translate("create_calendar_event.params.description"),
        },
        location: {
          type: "string",
          description: translate("create_calendar_event.params.location"),
        },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: translate("create_calendar_event.params.attendees"),
        },
        calendarId: {
          type: "string",
          description: translate("get_calendar_events.params.calendarId"),
        },
        timeZone: {
          type: "string",
          description: translate("create_calendar_event.params.timeZone"),
        },
      },
      required: ["summary", "startDateTime", "endDateTime"],
    },
  },
  {
    name: "get_free_busy",
    dataSource: onDemand("Google Calendar"),
    description: translate("get_free_busy.description"),
    endpoint: {
      path: "/utility/calendar/freebusy",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        calendarIds: {
          type: "array",
          items: { type: "string" },
          description: translate("get_free_busy.params.calendarIds"),
        },
        timeMin: {
          type: "string",
          description: translate("get_free_busy.params.timeMin"),
        },
        timeMax: {
          type: "string",
          description: translate("get_free_busy.params.timeMax"),
        },
      },
      required: ["calendarIds", "timeMin", "timeMax"],
    },
  },
  // ── GitHub Trending ──────────────────────────────────────────
  {
    name: "get_github_trending",
    dataSource: onDemand("GitHub"),
    description: translate("get_github_trending.description"),
    endpoint: {
      path: "/trend/github/trending",
      queryParams: ["language", "since", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          description: translate("get_github_trending.params.language"),
        },
        since: {
          type: "string",
          enum: ["daily", "weekly", "monthly"],
          description: translate("get_github_trending.params.since"),
        },
        limit: {
          type: "number",
          description: translate("get_github_trending.params.limit"),
        },
      },
      required: [],
    },
  },
  // ── Data & Analysis ──────────────────────────────────────────
  {
    name: "analyze_csv",
    dataSource: compute("statistics"),
    description: translate("analyze_csv.description"),
    endpoint: {
      path: "/compute/csv/analyze",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: translate("analyze_csv.params.data"),
        },
        columns: {
          type: "array",
          items: { type: "string" },
          description: translate("analyze_csv.params.columns"),
        },
      },
      required: ["data"],
    },
  },
  {
    name: "compare_json",
    dataSource: compute("diff"),
    description: translate("compare_json.description"),
    endpoint: {
      path: "/compute/json/compare",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        "a": {
          type: "object",
          description: translate("compare_json.params.a"),
        },
        b: {
          type: "object",
          description: translate("compare_json.params.b"),
        },
      },
      required: ["a", "b"],
    },
  },
  {
    name: "validate_json_schema",
    dataSource: compute("ajv"),
    description: translate("validate_json_schema.description"),
    endpoint: {
      path: "/compute/json/validate",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "object",
          description: translate("validate_json_schema.params.data"),
        },
        schema: {
          type: "object",
          description: translate("validate_json_schema.params.schema"),
        },
      },
      required: ["data", "schema"],
    },
  },
  // ── Knowledge ────────────────────────────────────────────────
  {
    name: "get_stackoverflow_questions",
    dataSource: onDemand("Stack Exchange"),
    description: translate("get_stackoverflow_questions.description"),
    endpoint: {
      path: "/knowledge/stackoverflow/questions",
      queryParams: ["q", "tagged", "sort", "order", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("get_stackoverflow_questions.params.q"),
        },
        tagged: {
          type: "string",
          description: translate("get_stackoverflow_questions.params.tagged"),
        },
        sort: {
          type: "string",
          enum: ["activity", "votes", "creation", "hot", "week", "month"],
          description: translate("get_stackoverflow_questions.params.sort"),
        },
        limit: {
          type: "number",
          description: translate("get_stackoverflow_questions.params.limit"),
        },
      },
      required: ["q"],
    },
  },
  {
    name: "search_patents",
    dataSource: onDemand("USPTO"),
    description: translate("search_patents.description"),
    endpoint: {
      path: "/knowledge/patents/search",
      queryParams: ["q", "inventor", "assignee", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_patents.params.q"),
        },
        inventor: {
          type: "string",
          description: translate("search_patents.params.inventor"),
        },
        assignee: {
          type: "string",
          description: translate("search_patents.params.assignee"),
        },
        limit: {
          type: "number",
          description: translate("search_patents.params.limit"),
        },
      },
      required: ["q"],
    },
  },
  // ── Satellite Imagery ────────────────────────────────────────
  {
    name: "get_satellite_imagery",
    dataSource: onDemand("NASA Earth"),
    description: translate("get_satellite_imagery.description"),
    endpoint: {
      path: "/weather/satellite",
      queryParams: ["action", "latitude", "longitude", "date", "dimension", "startDate", "endDate"],
    },
    parameters: {
      type: "object",
      properties: {
        latitude: {
          type: "number",
          description: translate("get_satellite_imagery.params.latitude"),
        },
        longitude: {
          type: "number",
          description: translate("get_satellite_imagery.params.longitude"),
        },
        action: {
          type: "string",
          enum: ["imagery", "assets"],
          description: translate("get_satellite_imagery.params.action"),
        },
        date: {
          type: "string",
          description: translate("get_satellite_imagery.params.date"),
        },
        dimension: {
          type: "number",
          description: translate("get_satellite_imagery.params.dimension"),
        },
      },
      required: ["latitude", "longitude"],
    },
  },
  // ── Flight Status ────────────────────────────────────────────
  {
    name: "get_flight_status",
    dataSource: onDemand("AviationStack"),
    description: translate("get_flight_status.description"),
    endpoint: {
      path: "/transit/flights",
      queryParams: ["flight", "departure", "arrival", "airline", "status", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        flight: {
          type: "string",
          description: translate("get_flight_status.params.flight"),
        },
        departure: {
          type: "string",
          description: translate("get_flight_status.params.departure"),
        },
        arrival: {
          type: "string",
          description: translate("get_flight_status.params.arrival"),
        },
        airline: {
          type: "string",
          description: translate("get_flight_status.params.airline"),
        },
        status: {
          type: "string",
          enum: ["scheduled", "active", "landed", "cancelled", "incident", "diverted"],
          description: translate("get_flight_status.params.status"),
        },
        limit: {
          type: "number",
          description: translate("get_flight_status.params.limit"),
        },
      },
      required: [],
    },
  },

  // ── Infrastructure Observability ────────────────────────────
  {
    name: "get_infrastructure_status",
    dataSource: onDemand("Portal Service"),
    description: translate("get_infrastructure_status.description"),
    endpoint: {
      path: "/infrastructure/status",
      queryParams: ["action"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_infrastructure_status.params.action"),
          enum: ["services", "devices", "summary"],
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_container_diagnostics",
    dataSource: onDemand("Portal Service / Docker Engine API"),
    description: translate("get_container_diagnostics.description"),
    endpoint: {
      path: "/infrastructure/containers",
      queryParams: ["action", "container", "device", "range", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_container_diagnostics.params.action"),
          enum: ["stats", "metrics", "history", "system"],
        },
        container: {
          type: "string",
          description: translate("get_container_diagnostics.params.container"),
        },
        device: {
          type: "string",
          description: translate("get_container_diagnostics.params.device"),
        },
        range: {
          type: "string",
          description: translate("get_container_diagnostics.params.range"),
          enum: ["1h", "6h", "24h", "7d"],
        },
        limit: {
          type: "number",
          description: translate("get_container_diagnostics.params.limit"),
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_container_logs",
    dataSource: onDemand("Portal Service / Docker Engine API"),
    description: translate("get_container_logs.description"),
    endpoint: {
      path: "/infrastructure/logs",
      queryParams: ["container", "device", "tail", "level", "search", "since"],
    },
    parameters: {
      type: "object",
      properties: {
        container: {
          type: "string",
          description: translate("get_container_logs.params.container"),
        },
        device: {
          type: "string",
          description: translate("get_container_logs.params.device"),
        },
        tail: {
          type: "number",
          description: translate("get_container_logs.params.tail"),
        },
        level: {
          type: "string",
          enum: ["error", "warn", "info", "debug"],
          description: translate("get_container_logs.params.level"),
        },
        search: {
          type: "string",
          description: translate("get_container_logs.params.search"),
        },
        since: {
          type: "string",
          description: translate("get_container_logs.params.since"),
        },
      },
      required: [],
    },
  },
  ];
}

// Per-locale definition cache — rebuilt once per locale, never on hot path
const localizedDefinitionsCache = new Map<string, ToolDefinition[]>();

function getLocalizedToolDefinitions(locale: string): ToolDefinition[] {
  let definitions = localizedDefinitionsCache.get(locale);
  if (!definitions) {
    const translate = (key: string, variables?: Record<string, string>) =>
      PromptLocaleService.get(locale, `tools.${key}`, variables);
    definitions = createLocalizedToolDefinitions(translate);
    localizedDefinitionsCache.set(locale, definitions);
  }
  return definitions;
}

// Default English definitions — backwards-compatible direct access
const TOOL_DEFINITIONS: ToolDefinition[] = getLocalizedToolDefinitions(PromptLocaleService.getDefaultLocale());



// ────────────────────────────────────────────────────────────
// Domain Taxonomy — groups tools by functional area
// ────────────────────────────────────────────────────────────

const TOOL_DOMAINS = {
  // Weather & Environment
  get_weather: "Weather & Environment",
  get_local_environment: "Weather & Environment",
  get_weather_forecast: "Weather & Environment",
  get_canada_avalanche_forecast: "Weather & Environment",
  get_earthquakes: "Weather & Environment",
  get_solar_activity: "Weather & Environment",
  get_aurora_forecast: "Weather & Environment",
  get_solar_wind: "Weather & Environment",
  get_twilight: "Weather & Environment",
  get_tides: "Weather & Environment",
  get_wildfires: "Weather & Environment",
  get_iss_location: "Weather & Environment",
  get_near_earth_objects: "Weather & Environment",
  get_space_launches: "Weather & Environment",
  get_nasa_apod: "Weather & Environment",
  get_canada_weather_warnings: "Weather & Environment",
  get_detailed_air_quality: "Weather & Environment",
  get_weather_history: "Weather & Environment",
  get_weather_marine: "Weather & Environment",
  get_weather_astronomy: "Weather & Environment",
  get_weather_alerts: "Weather & Environment",
  get_moon_phase: "Weather & Environment",

  // Events
  get_events: "Events",

  // Sports
  get_live_scores: "Sports",
  get_upcoming_matches: "Sports",
  get_recent_results: "Sports",
  get_league_standings: "Sports",
  get_match_details: "Sports",
  get_head_to_head: "Sports",
  search_teams: "Sports",
  search_players: "Sports",
  get_team_squad: "Sports",
  get_league_top_scorers: "Sports",

  // Markets & Commodities
  get_commodities: "Markets & Commodities",

  // Trends
  get_trends: "Trends",

  // Products
  search_products: "Products",
  get_trending_products: "Products",
  get_watchlist_availability: "Products",
  check_sku_availability: "Products",
  get_costco_us_products: "Products",
  get_costco_ca_products: "Products",
  search_amazon_products: "Products",

  // Finance
  get_stock: "Finance",
  get_macro: "Finance",
  get_market_news: "Finance",
  get_earnings_calendar: "Finance",
  get_historical_prices: "Finance",
  get_technical_analysis: "Finance",
  get_volatility: "Finance",
  get_fear_greed_index: "Finance",
  get_sec_filings: "Finance",
  get_sector_performance: "Finance",

  // Knowledge
  search_books: "Knowledge",
  get_country: "Knowledge",
  get_element: "Knowledge",
  get_exoplanet: "Knowledge",
  get_anime: "Knowledge",
  get_word_definition: "Knowledge",
  search_papers: "Knowledge",
  get_wikipedia_summary: "Knowledge",
  get_on_this_day: "Knowledge",
  list_development_indicators: "Knowledge",
  search_youtube: "Knowledge",
  get_youtube_video: "Knowledge",
  download_video: "Knowledge",
  trim_video: "Knowledge",
  read_url: "Core Harness Tools",
  get_package_info: "Knowledge",

  read_rss_feed: "Knowledge",
  get_pypi_package: "Knowledge",

  // Reddit
  search_reddit: "Reddit",
  search_reddit_subreddits: "Reddit",
  get_reddit_subreddit_info: "Reddit",
  get_reddit_subreddit_feed: "Reddit",
  get_reddit_subreddit_rules: "Reddit",
  get_reddit_subreddit_wiki_pages: "Reddit",
  get_reddit_subreddit_wiki_page: "Reddit",
  get_reddit_user_history: "Reddit",
  get_reddit_user_profile: "Reddit",


  // Movies & TV
  search_media: "Movies & TV",
  get_media_details: "Movies & TV",
  get_media_credits: "Movies & TV",
  get_trending_media: "Movies & TV",
  browse_media: "Movies & TV",
  get_media_genres: "Movies & TV",
  get_now_playing_media: "Movies & TV",
  get_media_recommendations: "Movies & TV",
  search_person: "Movies & TV",
  get_watch_providers: "Movies & TV",

  // Health
  rank_foods_by_category: "Health",
  search_drugs: "Health",
  get_drug_adverse_events: "Health",
  get_drug_recalls: "Health",
  search_usda_nutrition: "Health",
  rank_foods_by_nutrient: "Health",
  compare_food_nutrition: "Health",
  get_food_categories: "Health",
  get_nutrient_types: "Health",
  list_category_nutrients: "Health",
  search_foods_by_taxonomy: "Health",
  get_food_taxonomy: "Health",
  get_nutritional_requirements: "Health",
  list_drug_dosage_forms: "Health",
  search_gym_exercises: "Health",
  get_gym_exercise_categories: "Health",
  get_gym_exercise_by_id: "Health",
  calculate_caloric_needs: "Health",
  analyze_nutrient_gaps: "Health",
  search_food_substitutes: "Health",
  estimate_exercise_calories: "Health",
  calculate_hydration_needs: "Health",
  build_meal_plan: "Health",
  check_drug_nutrient_interactions: "Health",
  get_pollen_forecast: "Health",

  // Transit
  get_translink_next_bus: "Transit",
  get_translink_stop_info: "Transit",
  search_translink_stops_nearby: "Transit",
  get_translink_route_info: "Transit",

  // Utilities
  search_airports: "Utilities",
  evaluate_expression: "Core Harness Tools",
  convert_currency: "Utilities",
  get_time_in_timezone: "Utilities",
  get_ip_info: "Utilities",
  search_nearby_places: "Utilities",
  search_places: "Utilities",
  generate_map: "Utilities",
  generate_chart: "Utilities",
  get_public_webcams: "Utilities",
  // Compute
  execute_python: "Core Harness Tools",
  execute_javascript: "Core Harness Tools",
  execute_shell: "Compute",
  convert_units: "Compute",
  parse_datetime: "Compute",
  transform_json: "Compute",
  generate_csv: "Compute",
  render_latex: "Compute",
  generate_diagram: "Compute",
  diff_text: "Compute",
  generate_hash: "Compute",
  test_regex: "Compute",
  convert_encoding: "Compute",
  convert_video_to_gif: "Compute",
  parse_cron_expression: "Compute",
  think: "Core Harness Tools",
  sleep: "Core Harness Tools",
  emit_structured_output: "Core Harness Tools",

  // Gaming
  get_dota: "Gaming",
  get_steam_profile: "Gaming",
  create_bonfire: "Gaming",

  // Music
  get_music: "Knowledge",

  // Wayback Machine
  get_wayback_snapshot: "Knowledge",

  // Torrent
  search_torrents: "Torrent",
  download_torrent: "Torrent",
  get_torrent_status: "Torrent",

  // Maritime
  get_tracked_vessels: "Maritime",
  get_vessel_by_mmsi: "Maritime",
  search_vessels: "Maritime",
  get_vessels_in_area: "Maritime",
  get_ais_messages: "Maritime",

  // Energy
  get_energy_indicators: "Energy",
  get_energy_catalog: "Energy",
  get_energy_facets: "Energy",
  search_energy: "Energy",
  get_electricity_retail_sales: "Energy",
  get_petroleum_prices: "Energy",
  get_natural_gas_prices: "Energy",

  // Agentic — Workspace
  read_file: "Core Workspace Tools",
  write_file: "Core Workspace Tools",
  replace_in_file: "Core Workspace Tools",
  replace_file_block: "Core Workspace Tools",
  replace_file_regions: "Core Workspace Tools",
  patch_file: "Core Workspace Tools",
  read_files: "Core Workspace Tools",
  get_file_info: "Core Workspace Tools",
  diff_files: "Core Workspace Tools",
  move_file: "Core Workspace Tools",
  delete_file: "Core Workspace Tools",

  // Agentic — Workspace Search
  list_directory: "Core Workspace Tools",
  search_file_contents: "Core Workspace Tools",
  find_files: "Core Workspace Tools",
  summarize_project: "Core Workspace Tools",

  // Agentic — Web
  read_web_page: "Web",
  read_pdf: "Web",
  read_docx: "Web",
  read_spreadsheet: "Web",
  search_web: "Core Harness Tools",
  search_news: "Web",
  search_images: "Web",
  search_videos: "Web",

  // Agentic — Command Execution
  execute_command: "Core Workspace Tools",

  // Agentic — Git

  run_git: "Core Workspace Tools",
  // Agentic — Browser Automation
  control_browser: "Browser",
  execute_browser_script: "Browser",

  // Agentic — Code Intelligence (LSP)
  query_language_server: "Core Workspace Tools",

  // Agentic — Task Management
  create_task: "Core Task Tools",
  get_task: "Core Task Tools",
  list_tasks: "Core Task Tools",
  update_task: "Core Task Tools",

  // Agentic — Memory Persistence
  save_memory: "Core Harness Tools",

  // Agentic — Agent Management
  create_custom_agent: "Agent Management",
  list_custom_agents: "Agent Management",
  list_agents: "Agent Management",
  update_custom_agent: "Agent Management",


  // Agentic — Tool Discovery
  search_tools: "Core Discover Tools",

  // Core Schedule Tools
  create_cron: "Core Schedule Tools",
  remote_trigger: "Core Schedule Tools",
  create_cron_job: "Core Schedule Tools",
  list_cron_jobs: "Core Schedule Tools",
  delete_cron_job: "Core Schedule Tools",
  trigger_cron_job: "Core Schedule Tools",

  // Agentic — Notebook Editing
  edit_notebook: "Core Workspace Tools",

  // Communication (Twilio)
  send_sms: "Communication",
  list_sms_messages: "Communication",
  get_sms_account: "Communication",
  lookup_phone_number: "Communication",
  list_phone_numbers: "Communication",

  // Creative (Image Generation, Vision, Audio, 3D, Visual)
  get_emoji_combination: "Creative",
  get_emoji_combinations: "Creative",
  generate_image: "Creative",
  describe_image: "Creative",
  synthesize_speech: "Creative",
  synthesize_speech_local: "Creative",
  generate_audio: "Creative",
  remix_audio: "Creative",
  create_vector_animation: "Creative",
  transcribe_audio: "Creative",
  generate_qr_code: "Creative",
  convert_color: "Creative",
  manipulate_image: "Creative",
  convert_image_to_ascii: "Creative",
  draw_turtle_graphics: "Creative",
  create_3d_mesh: "Creative",
  create_3d_scene: "Creative",
  create_3d_model: "Creative",
  create_3d_voxel: "Creative",

  // Discord (Lupos DB)
  search_discord_messages: "Discord",
  get_discord_message_analytics: "Discord",
  get_discord_server_activity: "Discord",
  get_discord_guild_channels: "Discord",
  get_discord_guild_members: "Discord",
  get_discord_guild_emojis: "Discord",
  get_bot_stats: "Discord",
  get_bot_guilds: "Discord",
  get_bot_activity_timeline: "Discord",
  get_discord_user_heatmap_data: "Discord",
  get_discord_mention_leaderboard: "Discord",
  get_discord_message_leaderboard: "Discord",
  get_discord_word_frequencies: "Discord",
  react_to_discord_message: "Discord",
  get_discord_voice_channel_members: "Discord",
  get_discord_user_profile: "Discord",
  get_discord_channel_activity_stats: "Discord",

  // Smart Home (LIFX Lights)
  list_lights: "Smart Home",
  set_light_state: "Smart Home",
  toggle_light_power: "Smart Home",
  start_light_breathe_effect: "Smart Home",
  start_light_pulse_effect: "Smart Home",
  start_light_move_effect: "Smart Home",
  start_light_flame_effect: "Smart Home",
  start_light_morph_effect: "Smart Home",
  set_light_states: "Smart Home",
  adjust_light_state: "Smart Home",
  stop_light_effects: "Smart Home",
  list_light_scenes: "Smart Home",
  activate_light_scene: "Smart Home",
  enable_light_night_lock: "Smart Home",
  get_light_health: "Smart Home",

  // Network Intelligence
  dns_lookup: "Network Intelligence",
  whois_lookup: "Network Intelligence",
  ssl_certificate_check: "Network Intelligence",
  port_scan: "Network Intelligence",
  http_headers: "Network Intelligence",
  ping_host: "Network Intelligence",

  // Security
  check_breach: "Security",

  // Communication (new tools)
  send_push_notification: "Communication",
  send_webhook: "Communication",

  // Calendar
  get_calendar_events: "Calendar",
  create_calendar_event: "Calendar",
  get_free_busy: "Calendar",

  // Trends (new tool)
  get_github_trending: "Trends",

  // Compute (new tools)
  analyze_csv: "Compute",
  compare_json: "Compute",
  validate_json_schema: "Compute",

  // Knowledge (new tools)
  get_stackoverflow_questions: "Knowledge",
  search_patents: "Knowledge",

  // Weather & Environment (new tool)
  get_satellite_imagery: "Weather & Environment",

  // Transit (new tool)
  get_flight_status: "Transit",

  // Infrastructure Observability
  get_infrastructure_status: "Infrastructure",
  get_container_diagnostics: "Infrastructure",
  get_container_logs: "Infrastructure",
};

// ────────────────────────────────────────────────────────────
// Post-init patch — resolve all dynamic placeholders in the
// search_tools schema from TOOL_DEFINITIONS and TOOL_DOMAINS.
// Runs synchronously at module load, before any consumer reads.
// ────────────────────────────────────────────────────────────

const searchToolsDefinition = TOOL_DEFINITIONS.find(
  (tool) => tool.name === "search_tools",
);

if (searchToolsDefinition) {
  const toolCount = String(TOOL_DEFINITIONS.length);

  const domainToToolNames = new Map<string, string[]>();
  for (const [toolName, domain] of Object.entries(TOOL_DOMAINS)) {
    if (!domainToToolNames.has(domain)) {
      domainToToolNames.set(domain, []);
    }
    domainToToolNames.get(domain)!.push(toolName);
  }

  const uniqueDomains = [...new Set(Object.values(TOOL_DOMAINS))].sort();

  const domainCapabilities = uniqueDomains
    .map((domain) => {
      const toolNames = domainToToolNames.get(domain) || [];
      const humanizedToolNames = toolNames.join(", ");
      return `${domain.toLowerCase()} (${humanizedToolNames})`;
    })
    .join(", ");

  const queryExamples = uniqueDomains
    .flatMap((domain) => {
      const toolNames = domainToToolNames.get(domain) || [];
      return toolNames
        .slice(0, 2)
        .map((name) => `'${name}' `);
    })
    .slice(0, 30)
    .map((example) => example.trim())
    .join(", ");

  const knownDomains = uniqueDomains
    .map((domain) => `'${domain}'`)
    .join(", ");

  searchToolsDefinition.description = searchToolsDefinition.description
    .replace("{{TOOL_COUNT}}", toolCount)
    .replace("{{DOMAIN_CAPABILITIES}}", domainCapabilities);

  const queryProperty = searchToolsDefinition.parameters?.properties?.query;
  if (queryProperty?.description) {
    queryProperty.description = queryProperty.description.replace(
      "{{QUERY_EXAMPLES}}",
      queryExamples,
    );
  }

  const domainProperty = searchToolsDefinition.parameters?.properties?.domain;
  if (domainProperty?.description) {
    domainProperty.description = domainProperty.description.replace(
      "{{KNOWN_DOMAINS}}",
      knownDomains,
    );
  }
}

// ────────────────────────────────────────────────────────────
// Tool Emojis — per-tool emoji displayed in the client UI
// ────────────────────────────────────────────────────────────

const TOOL_EMOJIS: Record<string, string | [string, string]> = {
  get_weather: "🌤️",
  get_local_environment: ["🌍", "💻"],
  get_weather_forecast: ["🌤️", "📅"],
  get_canada_avalanche_forecast: ["🏔️", "💻"],
  get_earthquakes: ["🌋", "💻"],
  get_solar_activity: "☀️",
  get_aurora_forecast: ["🌌", "💻"],
  get_solar_wind: "💨",
  get_twilight: "🌅",
  get_tides: ["🌊", "💻"],
  get_wildfires: ["🌲", "🔥"],
  get_iss_location: ["🛸", "💻"],
  get_near_earth_objects: ["☄️", "💻"],
  get_space_launches: ["🚀", "🌌"],
  get_nasa_apod: "🔭",
  get_canada_weather_warnings: ["🌤️", "⚠️"],
  get_detailed_air_quality: ["🫁", "💻"],
  get_pollen_forecast: ["🌸", "💻"],
  get_weather_history: ["🌤️", "📊"],
  get_weather_marine: ["⚓", "💻"],
  get_weather_astronomy: "🌙",
  get_weather_alerts: ["🚨", "💻"],
  get_moon_phase: ["🌙", "🌓"],
  get_events: ["🎟️", "💻"],
  get_live_scores: ["⚽", "💻"],
  get_upcoming_matches: ["⚽", "📅"],
  get_recent_results: ["🏆", "💻"],
  get_league_standings: ["🏆", "📋"],
  get_match_details: ["⚽", "📺"],
  get_head_to_head: "⚔️",
  search_teams: ["🏟️", "💻"],
  search_players: "🧑‍🤝‍🧑",
  get_team_squad: "👥",
  get_league_top_scorers: ["⭐", "💻"],
  get_commodities: ["📦", "📈"],
  get_trends: ["📈", "🔍"],
  search_products: ["🔍", "🛒"],
  get_trending_products: ["🔥", "🛒"],
  get_watchlist_availability: ["👁️", "📋"],
  check_sku_availability: ["✅", "💻"],
  get_costco_us_products: ["🏪", "🇺🇸"],
  get_costco_ca_products: ["🏪", "🇨🇦"],
  search_amazon_products: ["📦", "🛒"],
  get_stock: "💹",
  get_macro: ["🏛️", "💻"],
  get_market_news: ["💹", "📰"],
  get_earnings_calendar: "💰",
  get_historical_prices: "🕯️",
  get_technical_analysis: "📊",
  get_volatility: "🌊",
  get_fear_greed_index: "😰",
  get_sec_filings: "🏛️",
  get_sector_performance: ["📊", "🗺️"],
  search_books: ["📚", "💻"],
  get_country: ["🌐", "🗺️"],
  get_element: "⚛️",
  get_exoplanet: ["🪐", "💻"],
  get_anime: "🎌",
  get_word_definition: ["📖", "🔤"],
  search_papers: ["🎓", "💻"],
  get_wikipedia_summary: "📘",
  get_on_this_day: ["🕰️", "📜"],
  list_development_indicators: ["📈", "🌐"],
  search_youtube: ["▶️", "🔍"],
  get_youtube_video: "▶️",
  download_video: ["🎬", "📥"],
  trim_video: ["✂️", "🎬"],
  read_url: "🌐",
  get_package_info: ["📦", "ℹ️"],
  read_rss_feed: "📡",
  get_pypi_package: ["🐍", "📦"],
  get_music: "🎵",
  get_wayback_snapshot: ["🕰️", "💻"],
  search_reddit: ["🤖", "💬"],
  search_reddit_subreddits: ["🤖", "🔍"],
  get_reddit_subreddit_info: "ℹ️",
  get_reddit_subreddit_feed: ["🤖", "📰"],
  get_reddit_subreddit_rules: ["🤖", "⚖️"],
  get_reddit_subreddit_wiki_pages: ["🤖", "📄"],
  get_reddit_subreddit_wiki_page: ["🤖", "📖"],
  get_reddit_user_history: ["🤖", "📜"],
  get_reddit_user_profile: "👤",

  search_media: ["🎬", "🔍"],
  get_media_details: "🎥",
  get_media_credits: ["🌟", "💻"],
  get_trending_media: ["🔥", "🎬"],
  browse_media: ["🍿", "💻"],
  get_media_genres: ["🎭", "🍿"],
  get_now_playing_media: ["🎬", "🍿"],
  get_media_recommendations: ["🍿", "💡"],
  search_person: ["🧑‍🎤", "💻"],
  get_watch_providers: ["📺", "ℹ️"],
  rank_foods_by_category: ["🥗", "💻"],
  search_drugs: "💊",
  get_drug_adverse_events: "⚕️",
  get_drug_recalls: "🚫",
  search_usda_nutrition: ["🍎", "💻"],
  rank_foods_by_nutrient: ["🥦", "📊"],
  compare_food_nutrition: ["⚖️", "🍎"],
  get_food_categories: ["🥗", "🗂️"],
  get_nutrient_types: ["🧬", "💻"],
  list_category_nutrients: ["🥗", "📋"],
  search_foods_by_taxonomy: ["🌿", "🔍"],
  get_food_taxonomy: ["🌿", "💻"],
  get_nutritional_requirements: ["📏", "💻"],
  list_drug_dosage_forms: "💉",
  search_gym_exercises: "🏋️",
  get_gym_exercise_categories: ["🏋️", "🗂️"],
  get_gym_exercise_by_id: ["🎯", "💻"],
  calculate_caloric_needs: "🔢",
  analyze_nutrient_gaps: ["📉", "💻"],
  search_food_substitutes: ["🔄", "🍎"],
  estimate_exercise_calories: "🏃",
  calculate_hydration_needs: ["💧", "💻"],
  build_meal_plan: ["🍽️", "💻"],
  check_drug_nutrient_interactions: ["💊", "⚠️"],
  get_translink_next_bus: ["🚌", "💻"],
  get_translink_stop_info: "🚏",
  search_translink_stops_nearby: ["🚌", "📍"],
  get_translink_route_info: ["🚌", "🗺️"],
  search_airports: ["✈️", "💻"],
  evaluate_expression: "🧮",
  convert_currency: "💱",
  get_time_in_timezone: "🕐",
  get_ip_info: ["🔎", "🌐"],
  search_nearby_places: ["🔍", "📍"],
  search_places: ["🔍", "🗺️"],
  generate_map: ["🎨", "🗺️"],
  generate_chart: ["📊", "📉"],
  get_public_webcams: ["📷", "💻"],
  execute_python: ["🐍", "💻"],
  execute_javascript: ["⚡", "💻"],
  execute_shell: "🖥️",
  convert_units: "📐",
  parse_datetime: ["📅", "⏰"],
  transform_json: ["🔧", "💻"],
  generate_csv: ["📋", "🔢"],
  generate_qr_code: ["💻", "📱"],
  render_latex: ["📐", "✍️"],
  generate_diagram: ["📊", "🧩"],
  diff_text: "🔀",
  generate_hash: "🔐",
  test_regex: "🔣",
  convert_encoding: "🔁",
  convert_color: ["🎨", "🌈"],
  manipulate_image: ["🖼️", "🎨"],
  convert_image_to_ascii: ["🎨", "💻"],
  convert_video_to_gif: ["🎬", "🔁"],
  parse_cron_expression: ["⏰", "🔣"],
  draw_turtle_graphics: ["🐢", "💻"],
  create_3d_mesh: "🔺",
  create_3d_scene: ["🌐", "🧱"],
  create_3d_model: ["🧊", "💻"],
  create_3d_voxel: ["🧱", "🧊"],
  think: ["🧠", "💭"],
  sleep: "💤",
  emit_structured_output: "📝",
  get_dota: ["🎮", "💻"],
  get_steam_profile: ["🎮", "🔍"],
  create_bonfire: ["🔥", "🏕️"],
  search_torrents: ["🧲", "🔍"],
  download_torrent: "⬇️",
  get_torrent_status: ["⬇️", "📊"],
  get_tracked_vessels: "🚢",
  get_vessel_by_mmsi: ["🚢", "🆔"],
  search_vessels: "⛵",
  get_vessels_in_area: ["🚢", "🗺️"],
  get_ais_messages: ["📡", "💬"],
  get_energy_indicators: ["⚡", "🔋"],
  get_energy_catalog: ["⚡", "📊"],
  get_energy_facets: ["🔋", "💻"],
  search_energy: ["⚡", "🔍"],
  get_electricity_retail_sales: ["🔌", "⚡"],
  get_petroleum_prices: "🛢️",
  get_natural_gas_prices: ["🔥", "💰"],
  read_file: "📄",
  write_file: ["✏️", "💻"],
  replace_in_file: ["🔧", "📄"],
  replace_file_block: ["🧱", "📄"],
  replace_file_regions: ["🩹", "📄"],
  patch_file: "🩹",
  read_files: "📑",
  get_file_info: ["📄", "ℹ️"],
  diff_files: ["🔀", "📄"],
  move_file: "📂",
  delete_file: ["💻", "🗑️"],
  edit_notebook: "📓",
  list_directory: "📁",
  search_file_contents: ["📄", "🔍"],
  find_files: ["💻", "🔎"],
  summarize_project: "📋",
  read_web_page: ["🌐", "📄"],
  read_pdf: ["📄", "📕"],
  read_docx: ["📝", "📄"],
  read_spreadsheet: ["📄", "📊"],
  search_web: ["🌐", "🔍"],
  search_news: ["📰", "🔍"],
  search_images: ["🖼️", "🔍"],
  search_videos: ["🎬", "🔍"],
  execute_command: ["▶️", "🖥️"],
  run_git: ["📦", "🔀"],
  control_browser: ["🌐", "🖱️"],
  execute_browser_script: ["🌐", "📜"],
  query_language_server: ["🧩", "💻"],
  create_task: "➕",
  get_task: ["📋", "📌"],
  list_tasks: ["📝", "📋"],
  update_task: ["✏️", "📋"],
  save_memory: ["💻", "🧠"],
  create_custom_agent: ["💻", "🤖"],
  list_custom_agents: ["🤖", "📋"],
  list_agents: ["🤖", "📋"],
  update_custom_agent: ["✏️", "🤖"],
  search_tools: ["🛠️", "🔍"],
  create_cron: ["⏰", "💻"],
  remote_trigger: ["📡", "🚀"],
  create_cron_job: "🗓️",
  list_cron_jobs: ["⏰", "📋"],
  delete_cron_job: ["⏰", "🗑️"],
  trigger_cron_job: ["💻", "🚀"],
  send_sms: ["💬", "💻"],
  list_sms_messages: "📨",
  get_sms_account: ["📱", "💬"],
  lookup_phone_number: "📞",
  list_phone_numbers: "📲",
  get_emoji_combination: ["🍳", "💻"],
  get_emoji_combinations: "🧑‍🍳",
  generate_image: ["💻", "🖼️"],
  describe_image: ["👁️", "💻"],
  synthesize_speech: "🔊",
  synthesize_speech_local: ["🗣️", "💻"],
  generate_audio: ["🔊", "🎵"],
  remix_audio: ["🎛️", "🔊"],
  create_vector_animation: ["🎬", "🎨"],
  transcribe_audio: ["🎤", "💻"],
  search_discord_messages: ["💬", "🔍"],
  get_discord_message_analytics: ["💬", "📊"],
  get_discord_server_activity: ["💬", "📈"],
  get_discord_guild_channels: ["📁", "💬"],
  get_discord_guild_members: ["👥", "💬"],
  get_discord_guild_emojis: ["💻", "😀"],
  get_bot_stats: ["🤖", "📊"],
  get_bot_guilds: ["🌐", "🤖"],
  get_bot_activity_timeline: ["🤖", "📈"],
  get_discord_user_heatmap_data: ["🔥", "📊"],
  get_discord_mention_leaderboard: ["💬", "🏆"],
  get_discord_message_leaderboard: ["🏆", "📊"],
  get_discord_word_frequencies: ["🗣️", "📊"],
  react_to_discord_message: ["🎭", "💬"],
  get_discord_voice_channel_members: ["🔊", "👥"],
  get_discord_user_profile: ["👤", "💬"],
  get_discord_channel_activity_stats: ["📁", "📊"],
  list_lights: ["💡", "📋"],
  set_light_state: "🎚️",
  toggle_light_power: ["🔌", "💡"],
  start_light_breathe_effect: ["🌬️", "💻"],
  start_light_pulse_effect: ["💥", "💻"],
  start_light_move_effect: ["🔄", "💡"],
  start_light_flame_effect: ["🔥", "💡"],
  start_light_morph_effect: ["🌈", "💻"],
  set_light_states: ["💡", "⚙️"],
  adjust_light_state: ["💡", "📊"],
  stop_light_effects: "⏹️",
  list_light_scenes: ["🎬", "💡"],
  activate_light_scene: ["▶️", "💡"],
  enable_light_night_lock: ["🔒", "💡"],
  get_light_health: ["❤️", "💻"],

  // Network Intelligence
  dns_lookup: ["🌐", "🔎"],
  whois_lookup: ["🌐", "📋"],
  ssl_certificate_check: ["🔒", "🌐"],
  port_scan: ["🔌", "🔍"],
  http_headers: ["📡", "🔎"],
  ping_host: ["📶", "🌐"],

  // Security
  check_breach: ["🔓", "🔍"],

  // Communication (new tools)
  send_push_notification: ["🔔", "📱"],
  send_webhook: ["🪝", "🌐"],

  // Calendar
  get_calendar_events: ["📅", "🔎"],
  create_calendar_event: ["📅", "➕"],
  get_free_busy: ["📅", "⏰"],

  // Trends (new tool)
  get_github_trending: ["🔥", "💻"],

  // Compute (new tools)
  analyze_csv: ["📊", "🔢"],
  compare_json: ["🔀", "📋"],
  validate_json_schema: ["✅", "📋"],

  // Knowledge (new tools)
  get_stackoverflow_questions: ["💬", "📚"],
  search_patents: ["📜", "🔍"],

  // Weather & Environment (new tool)
  get_satellite_imagery: ["🛰️", "🌍"],

  // Transit (new tool)
  get_flight_status: ["✈️", "📍"],

  // Infrastructure Observability
  get_infrastructure_status: ["🌀", "📊"],
  get_container_diagnostics: ["🐳", "📈"],
  get_container_logs: ["📋", "🔍"],
};

// ────────────────────────────────────────────────────────────
// API Key Gating — maps tools to required CONFIG keys
// ────────────────────────────────────────────────────────────
// Tools listed here will be excluded from schema responses
// when their required API keys are missing (falsy) in CONFIG.
// Tools NOT listed here are always available (public APIs,
// in-memory datasets, compute tools, scrapers, etc.).
// ────────────────────────────────────────────────────────────

import CONFIG, { ToolsServiceConfig } from "../config.ts";
import logger from "../logger.ts";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const TOOL_REQUIRED_KEYS = {
  // Movies & TV (all require TMDb API key — unified media tools)
  search_media: ["TMDB_API_KEY"],
  get_media_details: ["TMDB_API_KEY"],
  get_media_credits: ["TMDB_API_KEY"],
  get_trending_media: ["TMDB_API_KEY"],
  browse_media: ["TMDB_API_KEY"],
  get_media_genres: ["TMDB_API_KEY"],
  get_now_playing_media: ["TMDB_API_KEY"],
  get_media_recommendations: ["TMDB_API_KEY"],
  search_person: ["TMDB_API_KEY"],
  get_watch_providers: ["TMDB_API_KEY"],

  // Finance — Finnhub
  get_stock_quote: ["FINNHUB_API_KEY"],
  get_company_profile: ["FINNHUB_API_KEY"],
  get_market_news: ["FINNHUB_API_KEY"],
  get_earnings_calendar: ["FINNHUB_API_KEY"],
  get_stock_recommendation: ["FINNHUB_API_KEY"],
  get_stock_financials: ["FINNHUB_API_KEY"],

  // Finance — FRED
  get_macro_indicators: ["FRED_API_KEY"],
  search_macro_series: ["FRED_API_KEY"],
  get_macro_series_info: ["FRED_API_KEY"],
  get_macro_observations: ["FRED_API_KEY"],

  // Transit (all require TransLink API key)
  get_translink_next_bus: ["TRANSLINK_API_KEY"],
  get_translink_stop_info: ["TRANSLINK_API_KEY"],
  search_translink_stops_nearby: ["TRANSLINK_API_KEY"],
  get_translink_route_info: ["TRANSLINK_API_KEY"],

  // Places (require Google Places API key)
  search_nearby_places: ["GOOGLE_CLOUD_API_KEY"],
  search_places: ["GOOGLE_CLOUD_API_KEY"],
  generate_map: ["GOOGLE_CLOUD_API_KEY"],

  // YouTube (requires Google API key with YouTube Data API v3 enabled)
  search_youtube: ["GOOGLE_CLOUD_API_KEY"],

  // Weather (only specific Google-powered tools)
  get_detailed_air_quality: ["GOOGLE_CLOUD_API_KEY"],
  get_pollen_forecast: ["GOOGLE_CLOUD_API_KEY"],

  // Maritime (all require AIS Stream API key)
  get_tracked_vessels: ["AIS_STREAM_API_KEY"],
  get_vessel_by_mmsi: ["AIS_STREAM_API_KEY"],
  search_vessels: ["AIS_STREAM_API_KEY"],
  get_vessels_in_area: ["AIS_STREAM_API_KEY"],
  get_ais_messages: ["AIS_STREAM_API_KEY"],

  // Energy (all require EIA API key)
  get_energy_indicators: ["EIA_API_KEY"],
  get_energy_catalog: ["EIA_API_KEY"],
  get_energy_facets: ["EIA_API_KEY"],
  search_energy: ["EIA_API_KEY"],
  get_electricity_retail_sales: ["EIA_API_KEY"],
  get_petroleum_prices: ["EIA_API_KEY"],
  get_natural_gas_prices: ["EIA_API_KEY"],

  // Communication (Twilio — all require account SID + auth token)
  send_sms: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  list_sms_messages: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  get_sms_account: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  lookup_phone_number: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  list_phone_numbers: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],

  // Creative (require Prism as LLM backend)
  generate_image: ["PRISM_SERVICE_URL"],
  describe_image: ["PRISM_SERVICE_URL"],
  synthesize_speech: ["PRISM_SERVICE_URL"],
  synthesize_speech_local: [],
  transcribe_audio: ["PRISM_SERVICE_URL"],

  // Agent Management (require Prism for CustomAgentService)
  create_custom_agent: ["PRISM_SERVICE_URL"],
  list_custom_agents: ["PRISM_SERVICE_URL"],
  list_agents: ["PRISM_SERVICE_URL"],
  update_custom_agent: ["PRISM_SERVICE_URL"],


  // Torrent (all require qBittorrent connection)
  search_torrents: ["QBITTORRENT_URL"],
  download_torrent: ["QBITTORRENT_URL"],
  get_torrent_status: ["QBITTORRENT_URL"],

  // Reddit
  search_reddit: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  search_reddit_subreddits: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  get_reddit_subreddit_info: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  get_reddit_subreddit_feed: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  get_reddit_subreddit_rules: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  get_reddit_subreddit_wiki_pages: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  get_reddit_subreddit_wiki_page: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  get_reddit_user_history: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  get_reddit_user_profile: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],

  // Calendar (Google Calendar API)
  get_calendar_events: ["GOOGLE_CALENDAR_CREDENTIALS"],
  create_calendar_event: ["GOOGLE_CALENDAR_CREDENTIALS"],
  get_free_busy: ["GOOGLE_CALENDAR_CREDENTIALS"],

  // Satellite Imagery (NASA)
  get_satellite_imagery: ["NASA_API_KEY"],

  // Flight Status (AviationStack)
  get_flight_status: ["AVIATIONSTACK_API_KEY"],

  // Infrastructure Observability (requires Portal Service)
  get_infrastructure_status: ["PORTAL_SERVICE_URL"],
  get_container_diagnostics: ["PORTAL_SERVICE_URL"],
  get_container_logs: ["PORTAL_SERVICE_URL"],
};

// ────────────────────────────────────────────────────────────
// Static Data File Gating — disables tools whose backing
// CSV/data files are missing at runtime (e.g. when the Docker
// build fails to copy the data/ directories into dist/).
// Paths are relative to the project src/ root.
// ────────────────────────────────────────────────────────────

const TOOL_REQUIRED_DATA_FILES: Record<string, string[]> = {
  get_element: ["fetchers/knowledge/data/digest_elements.csv"],
  get_exoplanet: ["fetchers/knowledge/data/digest_exoplanets.csv"],
  get_country: ["fetchers/knowledge/data/digest_world_indicators.csv"],
  list_development_indicators: [
    "fetchers/knowledge/data/digest_world_indicators.csv",
  ],
  rank_foods_by_nutrient: ["fetchers/health/data/digest_food.csv"],
  search_food_substitutes: ["fetchers/health/data/digest_food.csv"],
  build_meal_plan: ["fetchers/health/data/digest_food.csv"],
};

const serviceRootDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

function validateRequiredDataFiles(): void {
  for (const [toolName, requiredFiles] of Object.entries(
    TOOL_REQUIRED_DATA_FILES,
  )) {
    for (const relativeFilePath of requiredFiles) {
      const absoluteFilePath = resolve(serviceRootDirectory, relativeFilePath);
      if (!existsSync(absoluteFilePath)) {
        disableToolRuntime(
          toolName,
          `Missing required data file: ${relativeFilePath}`,
        );
        break;
      }
    }
  }
}

// ────────────────────────────────────────────────────────────
// Runtime Tool Health Registry
// ────────────────────────────────────────────────────────────
// Collectors call disableToolRuntime() when they detect
// persistent failures (403 blocked API, 410 Gone, bot detection)
// that make a tool permanently unusable for this session.
// This supplements the static TOOL_REQUIRED_KEYS check.
// ────────────────────────────────────────────────────────────

const TOOL_DISABLED_RUNTIME = new Map<string, string>();

/**
 * Mark a tool as disabled at runtime due to a persistent failure.
 * The reason is logged and included in getDisabledTools() diagnostics.
 */
export function disableToolRuntime(toolName: string, reason: string): void {
  if (!TOOL_DISABLED_RUNTIME.has(toolName)) {
    TOOL_DISABLED_RUNTIME.set(toolName, reason);
    logger.warn(
      `[ToolSchema] 🚫 Disabled tool "${toolName}" at runtime: ${reason}`,
    );
  }
}

/**
 * Re-enable a previously runtime-disabled tool (e.g., after a successful fetch).
 */
export function enableToolRuntime(toolName: string): void {
  if (TOOL_DISABLED_RUNTIME.delete(toolName)) {
    logger.info(`[ToolSchema] ✅ Re-enabled tool "${toolName}" at runtime`);
  }
}

validateRequiredDataFiles();

/**
 * Check if a tool is available.
 * Returns false if required API keys are missing OR the tool
 * has been disabled at runtime by a collector.
 */
function isToolAvailable(toolName: string) {
  if (TOOL_DISABLED_RUNTIME.has(toolName)) return false;
  const keys = TOOL_REQUIRED_KEYS[toolName as keyof typeof TOOL_REQUIRED_KEYS];
  if (!keys) return true;
  return keys.every((key: string) =>
    Boolean(CONFIG[key as keyof ToolsServiceConfig]),
  );
}


// ────────────────────────────────────────────────────────────
// Intelligence Tier — Dynamic Complexity Scoring Algorithm
// ────────────────────────────────────────────────────────────
// Computes each tool's intelligence tier from its JSON Schema
// definition via recursive schema introspection. Scores both
// structural complexity (nesting, enums, arrays) and semantic
// parameter types (code generation, expression syntax, etc.)
// detected from parameter descriptions.
// ────────────────────────────────────────────────────────────

// ── Structural Scoring Weights ──────────────────────────────

const COMPLEXITY_WEIGHTS = {
  PARAMETER_COUNT: 1,
  REQUIRED_PARAMETER: 1.5,
  NESTED_OBJECT: 3,
  ENUM_PARAMETER: 2,
  ENUM_OPTION: 0.2,
  ARRAY_PARAMETER: 3,
  ANY_OF_UNION: 4,
  NESTED_ARRAY_OBJECT: 4,
} as const;

// ── Semantic Parameter Type Detection ───────────────────────
// Detects what KIND of content a parameter expects the model
// to generate, scored by generation difficulty.

const SEMANTIC_PARAMETER_TYPES = [
  {
    label: "code-generation",
    weight: 9,
    pattern: /\bsource\s+code\b|\bcode\s+to\s+(?:execute|run)\b|\bscript\s+(?:to|body)\b/i,
  },
  {
    label: "shell-command",
    weight: 8,
    pattern: /\bshell\s+command|\bcommand\s+to\s+(?:execute|run)\b/i,
  },
  {
    label: "expression-syntax",
    weight: 6,
    pattern: /\bcron\s+expression\b|\bregex\b|\bregular\s+expression\b|\bjsonpath\s+expression\b|\bmermaid\b.*\bsyntax\b|\bturtle\s+command/i,
  },
  {
    label: "structured-schema",
    weight: 5,
    pattern: /\bjson\s+schema\s+definition\b/i,
  },
  {
    label: "precise-text-match",
    weight: 4,
    pattern: /\bexact\s+(?:text|string|content)\b|\btext\s+to\s+(?:find|replace|match)\b|\breplacement\s+chunk/i,
  },
] as const;

function scoreSemanticComplexity(description?: string): number {
  if (!description) return 0;

  for (const semanticType of SEMANTIC_PARAMETER_TYPES) {
    if (semanticType.pattern.test(description)) {
      return semanticType.weight;
    }
  }

  return 0;
}

const TIER_THRESHOLDS = {
  FRONTIER: 25,
  HIGH: 12,
  MEDIUM: 5,
} as const;

// ── Schema Introspection ────────────────────────────────────

function scorePropertyComplexity(
  property: ToolParameterProperty,
  currentDepth: number,
): number {
  let score = 0;

  score += scoreSemanticComplexity(property.description);

  if (property.enum) {
    score += COMPLEXITY_WEIGHTS.ENUM_PARAMETER;
    score += property.enum.length * COMPLEXITY_WEIGHTS.ENUM_OPTION;
  }

  if (property.anyOf) {
    score += COMPLEXITY_WEIGHTS.ANY_OF_UNION;
    for (const variant of property.anyOf) {
      score += scorePropertyComplexity(variant, currentDepth + 1);
    }
  }

  if (property.type === "array") {
    score += COMPLEXITY_WEIGHTS.ARRAY_PARAMETER;

    if (property.items) {
      const itemSchema = property.items as ToolParameterProperty;
      if (itemSchema.type === "object" && itemSchema.properties) {
        score += COMPLEXITY_WEIGHTS.NESTED_ARRAY_OBJECT;
        score += scoreObjectProperties(
          itemSchema.properties,
          itemSchema.required,
          currentDepth + 1,
        );
      } else {
        score += scorePropertyComplexity(itemSchema, currentDepth + 1);
      }
    }
  }

  if (property.type === "object" && property.properties) {
    score += COMPLEXITY_WEIGHTS.NESTED_OBJECT;
    score += scoreObjectProperties(
      property.properties,
      property.required,
      currentDepth + 1,
    );
  }

  return score;
}

function scoreObjectProperties(
  properties: Record<string, ToolParameterProperty>,
  requiredFields?: string[],
  currentDepth: number = 0,
): number {
  let score = 0;
  const propertyNames = Object.keys(properties);

  score += propertyNames.length * COMPLEXITY_WEIGHTS.PARAMETER_COUNT;

  if (requiredFields) {
    score += requiredFields.length * COMPLEXITY_WEIGHTS.REQUIRED_PARAMETER;
  }

  for (const propertyName of propertyNames) {
    score += scorePropertyComplexity(properties[propertyName], currentDepth);
  }

  return score;
}

export function calculateToolComplexityScore(
  parameters?: ToolParameters,
): number {
  if (!parameters?.properties) return 0;

  return scoreObjectProperties(
    parameters.properties,
    parameters.required,
    0,
  );
}

function tierFromScore(score: number): ToolIntelligenceTier {
  if (score >= TIER_THRESHOLDS.FRONTIER) return "frontier";
  if (score >= TIER_THRESHOLDS.HIGH) return "high";
  if (score >= TIER_THRESHOLDS.MEDIUM) return "medium";
  return "low";
}

// ── Tier Resolution ─────────────────────────────────────────

function resolveToolIntelligenceTier(
  _toolName: string,
  parameters?: ToolParameters,
): { intelligenceTier: ToolIntelligenceTier; complexityScore: number } {
  const complexityScore = calculateToolComplexityScore(parameters);

  return {
    complexityScore,
    intelligenceTier: tierFromScore(complexityScore),
  };
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

// Re-export taxonomy registries for testing and downstream consumers
export {
  TOOL_DOMAINS,
  TOOL_EMOJIS,
  TOOL_DEFINITIONS,
  COMPLEXITY_WEIGHTS,
  SEMANTIC_PARAMETER_TYPES,
  TIER_THRESHOLDS,
};

export function getToolDefinitionCount(): number {
  return TOOL_DEFINITIONS.length;
}

/**
 * Get all tool schemas with endpoint metadata.
 * Used by clients (like Prism Client) to build dynamic executors.
 * Filters out tools whose required API keys are not configured.
 */
/**
 * Resolves a tool's emoji. If it's mapped to a pair (like ["🌤️", "🌡️"]), it checks
 * the Google Emoji Kitchen cache for a combined static URL. Falls back to the first
 * emoji character in the pair if the cache is empty or the mashup isn't found.
 */
export function resolveToolEmoji(toolName: string): string | null {
  const emojiValue = TOOL_EMOJIS[toolName as keyof typeof TOOL_EMOJIS];
  if (!emojiValue) return null;

  if (Array.isArray(emojiValue)) {
    try {
      const combination = queryEmojiCombination(emojiValue[0], emojiValue[1]);
      if (combination && combination.gStaticUrl) {
        return combination.gStaticUrl;
      }
    } catch {
      // Graceful fallback on error
    }
    return emojiValue[0];
  }

  return emojiValue;
}


export function getToolSchemas(locale?: string): ToolSchema[] {
  const definitions = locale
    ? getLocalizedToolDefinitions(locale)
    : TOOL_DEFINITIONS;

  return definitions.filter((tool) => isToolAvailable(tool.name)).map(
    (tool) => {
      const domain =
        TOOL_DOMAINS[tool.name as keyof typeof TOOL_DOMAINS] || "Other";
      const { intelligenceTier, complexityScore } =
        resolveToolIntelligenceTier(tool.name, tool.parameters);
      return {
        ...tool,
        domain,
        domainKey: resolveDomainKey(domain),
        emoji: resolveToolEmoji(tool.name),
        intelligenceTier,
        complexityScore,
      };
    },
  );
}

/**
 * Get tool schemas cleaned for LLM consumption.
 * Strips the `endpoint` property since the AI doesn't need routing info.
 * Filters out tools whose required API keys are not configured.
 */
export function getToolSchemasForAI(locale?: string): ToolSchemaForAI[] {
  const definitions = locale
    ? getLocalizedToolDefinitions(locale)
    : TOOL_DEFINITIONS;

  return definitions.filter((tool) => isToolAvailable(tool.name)).map(
    ({ endpoint: _endpoint, dataSource: _dataSource, ...rest }) => {
      const { intelligenceTier, complexityScore } =
        resolveToolIntelligenceTier(rest.name, rest.parameters);
      return {
        ...rest,
        intelligenceTier,
        complexityScore,
      };
    },
  );
}

export interface TransformedDisabledTool {
  name: string;
  domain: string;
  missingKeys: string[];
  runtimeDisabled?: string;
}

/**
 * Get tools that are disabled due to missing API keys or runtime failures.
 * Useful for admin diagnostics and health checks.
 */
export function getDisabledTools(): TransformedDisabledTool[] {
  return TOOL_DEFINITIONS.filter((tool) => !isToolAvailable(tool.name)).map(
    (tool) => {
      const requiredKeys =
        TOOL_REQUIRED_KEYS[tool.name as keyof typeof TOOL_REQUIRED_KEYS] || [];
      const runtimeReason = TOOL_DISABLED_RUNTIME.get(tool.name);

      return {
        name: tool.name,
        domain: TOOL_DOMAINS[tool.name as keyof typeof TOOL_DOMAINS] || "Other",
        missingKeys: requiredKeys.filter(
          (key: string) => !CONFIG[key as keyof ToolsServiceConfig],
        ),
        ...(runtimeReason && { runtimeDisabled: runtimeReason }),
      };
    },
  );
}

/**
 * Get the available fields map.
 */
export function getFields() {
  return FIELDS;
}
