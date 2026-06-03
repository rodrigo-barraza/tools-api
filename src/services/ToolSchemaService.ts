// ─── Single Source of Truth ─────────────────────────────────

// ────────────────────────────────────────────────────────────
// Interval Constants — imported as single source of truth
// for both the collectors and the dataSource metadata.
// ────────────────────────────────────────────────────────────

import {
  // Weather domain — still used by get_weather_forecast, get_avalanche_forecast
  OPEN_METEO_INTERVAL_MS,
  AVALANCHE_INTERVAL_MS,
  // Product domain
  BESTBUY_INTERVAL_MS,
  BESTBUY_CA_AVAILABILITY_INTERVAL_MS,
  COSTCO_INTERVAL_MS,
  // Finance domain
  FINNHUB_NEWS_INTERVAL_MS,
  FINNHUB_EARNINGS_INTERVAL_MS,
  EMOJI_KITCHEN_INTERVAL_MS,
} from "../constants.ts";

import type {
  ToolDefinition,
  ToolIntelligenceTier,
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

// Reverse map: domain display name → programmatic key (e.g. "Core Tools" → "core")
const DOMAIN_DISPLAY_NAME_TO_KEY = new Map<string, string>();
for (const entry of Object.values(DOMAINS)) {
  if (!DOMAIN_DISPLAY_NAME_TO_KEY.has(entry.displayName)) {
    DOMAIN_DISPLAY_NAME_TO_KEY.set(entry.displayName, entry.key);
  }
}

function resolveDomainKey(domain: string): string {
  return DOMAIN_DISPLAY_NAME_TO_KEY.get(domain) || domain.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
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

  // Products: from BestBuyFetcher normalized schema
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

  // ── Knowledge Domain ──────────────────────────────────────────

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
    "isDst",
    "dstFrom",
    "dstUntil",
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
// Helper — builds field description for tool parameters
// ────────────────────────────────────────────────────────────

function fieldsParam(fieldEnum: string[]) {
  return {
    fields: {
      type: "string",
      description: `Comma-separated list of fields to return. Available: ${fieldEnum.join(", ")}`,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Tool Definitions — JSON Schema + endpoint metadata
// ────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS: ToolDefinition[] = [
  // ── Weather / Environment ──────────────────────────────────
  {
    name: "get_weather_forecast",
    dataSource: cached("Open-Meteo", OPEN_METEO_INTERVAL_MS),
    description:
      "Get multi-day weather forecast. Each forecast entry includes temperature highs/lows, precipitation probability, wind, and conditions.",
    endpoint: { path: "/weather/weather/forecast", queryParams: ["days"] },
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of forecast days (default: 7, max: 14)",
        },
        ...fieldsParam(FIELDS.WEATHER_FORECAST),
      },
      required: ["fields"],
    },
  },
  {
    name: "get_avalanche_forecast",
    dataSource: cached("Avalanche Canada", AVALANCHE_INTERVAL_MS),
    description:
      "Get Avalanche Canada forecast for BC regions including danger ratings (alpine/treeline/below treeline), problems, and highlights.",
    endpoint: { path: "/weather/avalanche" },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.AVALANCHE) },
      required: ["fields"],
    },
  },
  {
    name: "get_weather",
    dataSource: onDemand("Open-Meteo Geocoding + Forecast"),
    description:
      "Get live current weather and 3-day forecast for any location worldwide. Accepts a city name (geocoded automatically) or direct latitude/longitude coordinates. Returns temperature, humidity, wind, precipitation, UV index, pressure, cloud cover, sunrise/sunset, and daily forecasts. Supports metric and imperial units.",
    endpoint: {
      path: "/weather/live",
      queryParams: ["location", "latitude", "longitude", "units"],
    },
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "City name, optionally with country code (e.g. 'Tokyo', 'Paris, FR', 'New York')",
        },
        latitude: {
          type: "number",
          description:
            "Latitude (use instead of location for precise coordinates)",
        },
        longitude: {
          type: "number",
          description:
            "Longitude (use instead of location for precise coordinates)",
        },
        units: {
          type: "string",
          description:
            "Unit system: metric (°C, km/h, mm) or imperial (°F, mph, inch). Default: metric",
          enum: ["metric", "imperial"],
        },
      },
    },
  },
  {
    name: "get_local_environment",
    dataSource: onDemand("Multiple APIs"),
    description:
      "Get cached environmental, weather, or space data for the server's local area. This returns pre-fetched data for the server's IP-based location — for weather at a specific place, use get_weather instead. Select a source: current_weather (temp/wind/humidity), air_quality (AQI/pollutants), earthquakes (seismic), solar_activity (flares/storms), aurora (Kp index), twilight (sunrise/sunset), tides, wildfires, iss (ISS position), neo (near-Earth objects), solar_wind, pollen, apod (NASA pic of the day), launches (rockets), warnings (NWS alerts), air_quality_google.",
    endpoint: {
      path: "/weather/environment",
      queryParams: ["source"],
    },
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Which environmental data source to query",
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
          ],
        },
        fields: {
          type: "string",
          description: "Comma-separated fields to return (varies by source)",
        },
      },
      required: ["source"],
    },
  },

  // ── Earthquakes ────────────────────────────────────────────
  {
    name: "get_earthquakes",
    dataSource: onDemand("USGS Earthquake API (cached)"),
    description:
      "Get recent earthquake data from the USGS. Returns seismic events with magnitude, location, depth, " +
      "tsunami alerts, and significance. Supports filtering by lookback hours, minimum magnitude, and result limit.",
    endpoint: {
      path: "/weather/earthquakes/recent",
      queryParams: ["hours", "minMag", "limit", "fields"],
    },
    parameters: {
      type: "object",
      properties: {
        hours: {
          type: "number",
          description: "Lookback period in hours (default: 24, max: 168)",
        },
        minMag: {
          type: "number",
          description:
            "Minimum magnitude filter (e.g. 4.0 for significant quakes only)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 100)",
        },
        ...fieldsParam(FIELDS.EARTHQUAKES),
      },
    },
  },

  // ── Space Weather ──────────────────────────────────────────
  {
    name: "get_solar_activity",
    dataSource: onDemand("NASA DONKI (cached)"),
    description:
      "Get current space weather activity including solar flares, coronal mass ejections (CMEs), " +
      "geomagnetic storms, and earth-directed events. Returns a summary with counts, strongest flare, " +
      "fastest CME, and estimated arrival times.",
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
    description:
      "Get the current planetary Kp index and aurora forecast. The Kp index (0-9) indicates geomagnetic " +
      "activity — Kp ≥ 5 means a geomagnetic storm with possible aurora visibility at lower latitudes. " +
      "Returns current Kp, classification (quiet/unsettled/storm), and 24h peak.",
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
    description:
      "Get real-time solar wind data from the DSCOVR satellite at the L1 Lagrange point. " +
      "Returns speed (km/s), density (protons/cm³), temperature, and interplanetary magnetic field components (Bz, Bt). " +
      "A southward Bz (negative) and high speed (>500 km/s) indicate conditions favorable for aurora.",
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
    description:
      "Get sunrise, sunset, twilight times, solar noon, and day length for the server's location. " +
      "Includes civil, nautical, and astronomical twilight begin/end times. " +
      "Useful for circadian light automation, photography golden hour, and astronomical observation planning.",
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
    description:
      "Get current and upcoming tide predictions for the configured tide station. " +
      "Returns tide times, heights, and type (high/low). Use get_tides for the full schedule, " +
      "or request via get_local_environment with source='tides' for the cached version.",
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
    description:
      "Get active wildfire events worldwide from NASA's Earth Observatory. " +
      "Returns fire name, coordinates, status (open/closed), magnitude, and source URLs. " +
      "Data is refreshed from the EONET API automatically.",
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
    description:
      "Get the current position of the International Space Station (latitude, longitude, timestamp) " +
      "and the list of astronauts currently aboard. Position is updated frequently via the ISS-Now API.",
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
    description:
      "Get near-Earth objects (asteroids) tracked by NASA. Returns total count, hazardous count, " +
      "closest approach details (miss distance in km and lunar distances), largest object, " +
      "and relative velocities. Supports filtering by lookback days and hazardous-only.",
    endpoint: {
      path: "/weather/neo/recent",
      queryParams: ["days", "hazardousOnly", "limit", "fields"],
    },
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Lookback period in days (default: 7)",
        },
        hazardousOnly: {
          type: "boolean",
          description: "If true, only return potentially hazardous asteroids",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 100)",
        },
        ...fieldsParam(FIELDS.NEO),
      },
    },
  },

  // ── Space Launches ─────────────────────────────────────────
  {
    name: "get_space_launches",
    dataSource: onDemand("Launch Library 2 (cached)"),
    description:
      "Get upcoming and recent space launches worldwide. Returns launch name, status, provider, " +
      "rocket, mission description, pad location, and images. Use the summary endpoint for a quick " +
      "overview including the next upcoming launch.",
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
    description:
      "Get NASA's Astronomy Picture of the Day. Returns the title, explanation, image URL " +
      "(standard and HD), media type (image/video), date, and copyright info. " +
      "A new picture is posted each day by NASA.",
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

  // ── Pollen Forecast ────────────────────────────────────────
  {
    name: "get_pollen_forecast",
    dataSource: onDemand("Google Pollen API (cached)"),
    description:
      "Get current pollen levels for grass, tree, and weed allergens. Returns index values (0-5), " +
      "categories (None/Very Low/Low/Moderate/High/Very High), and whether each type is in season. " +
      "Useful for allergy sufferers and outdoor activity planning.",
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
    name: "get_weather_warnings",
    dataSource: onDemand("Environment Canada (cached)"),
    description:
      "Get active weather warnings and advisories from Environment Canada. " +
      "Returns warning count and details including type, severity, and affected areas. " +
      "Useful for severe weather awareness.",
    endpoint: {
      path: "/weather/warnings",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.WEATHER_WARNINGS),
      },
    },
  },

  // ── Detailed Air Quality ───────────────────────────────────
  {
    name: "get_detailed_air_quality",
    dataSource: onDemand("Google Air Quality API (cached)"),
    description:
      "Get detailed air quality data from Google's Air Quality API. Returns the Universal AQI, " +
      "US EPA AQI, dominant pollutant, and individual pollutant concentrations (PM2.5, PM10, O3, NO2, SO2, CO). " +
      "More granular than the standard air quality from get_local_environment.",
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

  // ── PDF Reader ─────────────────────────────────────────────
  {
    name: "read_pdf_url",
    dataSource: onDemand("pdf-parse"),
    description:
      "Fetch and extract text content from a PDF file at a given URL. Returns the full text, " +
      "page count, and metadata. Useful for reading research papers, reports, documentation, " +
      "and any PDF accessible via a public URL. Supports limiting the number of pages extracted.",
    endpoint: {
      path: "/knowledge/pdf/read",
      queryParams: ["url", "maxPages"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL of the PDF file to read",
        },
        maxPages: {
          type: "number",
          description:
            "Maximum number of pages to extract (default: all pages)",
        },
      },
      required: ["url"],
    },
  },

  // ── RSS Feed Reader ────────────────────────────────────────
  {
    name: "read_rss_feed",
    dataSource: onDemand("xml2js"),
    description:
      "Fetch and parse an RSS or Atom feed from a URL. Returns the feed title, description, " +
      "and a list of entries with title, link, published date, and content/summary. " +
      "Useful for reading blog posts, news feeds, podcast feeds, and any syndicated content.",
    endpoint: {
      path: "/knowledge/rss/feed",
      queryParams: ["url", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL of the RSS or Atom feed",
        },
        limit: {
          type: "number",
          description: "Maximum number of feed entries to return (default: 20)",
        },
      },
      required: ["url"],
    },
  },

  // ── PyPI Package ───────────────────────────────────────────
  {
    name: "get_pypi_package",
    dataSource: onDemand("PyPI JSON API"),
    description:
      "Look up a Python package on PyPI. Returns the package name, version, summary, author, " +
      "license, homepage, repository URL, Python version requirements, and dependencies. " +
      "Similar to get_package_info but specifically for the PyPI registry.",
    endpoint: {
      path: "/knowledge/pypi/package",
      queryParams: ["name"],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "PyPI package name (e.g. 'numpy', 'requests', 'fastapi')",
        },
      },
      required: ["name"],
    },
  },

  // ── Events (4 → 1) ────────────────────────────────────────
  {
    name: "get_events",
    dataSource: onDemand("Beacon event aggregation"),
    description:
      "Get community events. Actions: 'search' (full-text with optional source/category), 'upcoming' (next N days), 'today' (today's events), 'summary' (aggregate stats).",
    endpoint: {
      path: "/event/events",
      queryParams: ["action", "q", "source", "category", "days", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Event query mode",
          enum: ["search", "upcoming", "today", "summary"],
        },
        q: { type: "string", description: "Search query (action=search)" },
        source: {
          type: "string",
          description: "Event source filter (action=search)",
        },
        category: {
          type: "string",
          description: "Category filter (action=search)",
        },
        days: {
          type: "number",
          description: "Days ahead (action=upcoming, default: 7)",
        },
        limit: { type: "number", description: "Max results (default: 20)" },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["action"],
    },
  },

  // ── Commodities (5 → 1) ───────────────────────────────────
  {
    name: "get_commodities",
    dataSource: onDemand("YAML-sourced commodities"),
    description:
      "Get commodity market data. Actions: 'summary' (all overview), 'category' (by category), 'ticker' (specific ticker), 'categories' (list categories), 'history' (price history).",
    endpoint: {
      path: "/market/commodities/data",
      queryParams: ["action", "category", "ticker", "hours"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Query mode",
          enum: ["summary", "category", "ticker", "categories", "history"],
        },
        category: {
          type: "string",
          description: "Category name (action=category)",
        },
        ticker: {
          type: "string",
          description: "Commodity ticker (action=ticker or history)",
        },
        hours: {
          type: "number",
          description: "Lookback hours (action=history, default: 24)",
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
    description:
      "Get trending topics. Actions: 'current' (by source), 'hot' (hottest), 'top' (top over N hours).",
    endpoint: {
      path: "/trend/data",
      queryParams: ["action", "source", "hours", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Trend query mode",
          enum: ["current", "hot", "top"],
        },
        source: {
          type: "string",
          description: "Source filter (action=current)",
        },
        hours: {
          type: "number",
          description: "Lookback hours (action=top, default: 24)",
        },
        limit: { type: "number", description: "Max results (default: 20)" },
        ...fieldsParam(FIELDS.TRENDS),
      },
      required: ["action"],
    },
  },

  // ── Products ───────────────────────────────────────────────
  {
    name: "search_products",
    dataSource: cached(
      "Best Buy / Amazon / eBay / Etsy / ProductHunt / Costco",
      BESTBUY_INTERVAL_MS,
    ),
    description:
      "Search for products with pricing, ratings, and deal information from Best Buy, Amazon, eBay, Etsy, Product Hunt, Costco US, and Costco Canada.",
    endpoint: {
      path: "/product/products/search",
      queryParams: ["q", "category", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Product search query",
        },
        category: {
          type: "string",
          description: "Product category filter",
        },
        limit: {
          type: "number",
          description: "Maximum number of products to return (default: 20)",
        },
        ...fieldsParam(FIELDS.PRODUCTS),
      },
      required: ["fields"],
    },
  },
  {
    name: "get_trending_products",
    dataSource: cached(
      "Best Buy / Amazon / eBay / Etsy / ProductHunt / Costco",
      BESTBUY_INTERVAL_MS,
    ),
    description:
      "Get currently trending products ranked by trending score. Shows top deals and popular items.",
    endpoint: {
      path: "/product/products/trending",
      queryParams: ["limit"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of products to return (default: 50)",
        },
        ...fieldsParam(FIELDS.PRODUCTS),
      },
      required: ["fields"],
    },
  },
  {
    name: "get_watchlist_availability",
    dataSource: cached("Best Buy Canada", BESTBUY_CA_AVAILABILITY_INTERVAL_MS),
    description:
      "Get Best Buy Canada product availability for all monitored watchlist items. Shows in-stock/out-of-stock status.",
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
    description:
      "Check Best Buy Canada availability for specific SKUs on demand. Useful for checking arbitrary products not on the watchlist.",
    endpoint: {
      path: "/product/products/availability/check",
      queryParams: ["skus"],
    },
    parameters: {
      type: "object",
      properties: {
        skus: {
          type: "string",
          description: "Comma-separated list of Best Buy SKU numbers to check",
        },
        ...fieldsParam(FIELDS.PRODUCT_AVAILABILITY),
      },
      required: ["skus", "fields"],
    },
  },
  {
    name: "get_costco_us_products",
    dataSource: cached("Costco US", COSTCO_INTERVAL_MS),
    description:
      "Get products from Costco US (costco.com) including laptops, desktops, TVs, phones, tablets, headphones, speakers, cameras, video games, and appliances. Shows name, price (USD), rating, and product URL.",
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
    description:
      "Get products from Costco Canada (costco.ca) including laptops, desktops, TVs, phones, tablets, headphones, speakers, cameras, video games, and appliances. Shows name, price (CAD), rating, and product URL.",
    endpoint: {
      path: "/product/products/source/costco_ca",
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
    description:
      "Get latest market news articles. Can optionally filter by company symbol for company-specific news.",
    endpoint: {
      path: "/finance/news",
      queryParams: ["symbol"],
    },
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description:
            "Optional stock symbol to get company-specific news instead of general market news",
        },
        ...fieldsParam(FIELDS.MARKET_NEWS),
      },
      required: ["fields"],
    },
  },
  {
    name: "get_earnings_calendar",
    dataSource: cached("Finnhub", FINNHUB_EARNINGS_INTERVAL_MS),
    description:
      "Get upcoming earnings calendar showing which companies are reporting earnings, with estimated and actual EPS and revenue.",
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
    description:
      "Get stock market data by symbol. Actions: 'quote' (real-time price/change), 'profile' (company info, sector, market cap), 'recommendation' (analyst consensus), 'financials' (key financial metrics).",
    endpoint: {
      path: "/finance/stock/data",
      queryParams: ["action", "symbol"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Data type to retrieve",
          enum: ["quote", "profile", "recommendation", "financials"],
        },
        symbol: {
          type: "string",
          description: "Stock ticker symbol (e.g. 'AAPL', 'MSFT', 'TSLA')",
        },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["action", "symbol"],
    },
  },

  // ── Finance: Macro/FRED (4 → 1) ───────────────────────────────
  {
    name: "get_macro",
    dataSource: onDemand("FRED (Federal Reserve)"),
    description:
      "Access macroeconomic data from FRED. Actions: 'indicators' (key indicator summary), 'search' (search data series), 'series' (series metadata by ID), 'observations' (time series data points).",
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
          description: "Query mode",
          enum: ["indicators", "search", "series", "observations"],
        },
        q: { type: "string", description: "Search query (action=search)" },
        seriesId: {
          type: "string",
          description:
            "FRED series ID like 'GDP', 'UNRATE' (action=series or observations)",
        },
        limit: { type: "number", description: "Max results (default: 10)" },
        orderBy: { type: "string", description: "Sort field (action=search)" },
        sortOrder: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort direction (action=observations)",
        },
        observationStart: {
          type: "string",
          description: "Start date YYYY-MM-DD (action=observations)",
        },
        observationEnd: {
          type: "string",
          description: "End date YYYY-MM-DD (action=observations)",
        },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["action"],
    },
  },

  // ── Knowledge (consolidated tools) ────────────────────────────
  {
    name: "search_books",
    dataSource: onDemand("Open Library API"),
    description:
      "Search or look up books/authors from Open Library. Actions: 'search' (full-text search), 'work' (book details by work key), 'author' (author info by key).",
    endpoint: {
      path: "/knowledge/books/lookup",
      queryParams: ["action", "q", "workKey", "authorKey", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Lookup mode",
          enum: ["search", "work", "author"],
        },
        q: { type: "string", description: "Search query (action=search)" },
        workKey: {
          type: "string",
          description: "Open Library work key like 'OL45804W' (action=work)",
        },
        authorKey: {
          type: "string",
          description:
            "Open Library author key like 'OL34184A' (action=author)",
        },
        limit: {
          type: "number",
          description: "Max results (action=search, default: 10)",
        },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_country",
    dataSource: onDemand("REST Countries + World Bank"),
    description:
      "Look up country info or development indicators. Actions: 'info' (by name), 'code' (by ISO code), 'indicators' (development data for a country), 'rank' (rank countries by indicator), 'compare' (compare multiple countries).",
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
          description: "Query mode",
          enum: ["info", "code", "indicators", "rank", "compare"],
        },
        name: { type: "string", description: "Country name (action=info)" },
        code: {
          type: "string",
          description: "ISO 2/3-letter code (action=code or indicators)",
        },
        indicator: {
          type: "string",
          description: "World Bank indicator ID (action=rank or compare)",
        },
        countries: {
          type: "string",
          description: "Comma-separated country codes (action=compare)",
        },
        limit: {
          type: "number",
          description: "Max results (action=rank, default: 10)",
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order (action=rank)",
        },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_element",
    dataSource: staticDataset("Periodic Table (119 elements)"),
    description:
      "Query the periodic table. Actions: 'search' (text search), 'lookup' (by symbol), 'rank' (rank by property), 'categories' (list categories).",
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
          description: "Query mode",
          enum: ["search", "lookup", "rank", "categories"],
        },
        q: { type: "string", description: "Search query (action=search)" },
        symbol: {
          type: "string",
          description: "Element symbol like 'Fe', 'Au' (action=lookup)",
        },
        property: {
          type: "string",
          description: "Property to rank by (action=rank)",
        },
        limit: { type: "number", description: "Max results (default: 10)" },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order (action=rank)",
        },
        category: { type: "string", description: "Filter by element category" },
        block: { type: "string", description: "Filter by block (s, p, d, f)" },
        ...fieldsParam(FIELDS.ELEMENTS),
      },
      required: ["action"],
    },
  },
  {
    name: "get_exoplanet",
    dataSource: staticDataset("NASA Exoplanet Archive (~6,153 planets)"),
    description:
      "Query the NASA exoplanet database. Actions: 'search' (text search), 'lookup' (by name), 'rank' (rank by property), 'stats' (discovery statistics), 'habitable' (habitable zone planets).",
    endpoint: {
      path: "/knowledge/exoplanets/data",
      queryParams: ["action", "q", "name", "field", "limit", "order", "method"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Query mode",
          enum: ["search", "lookup", "rank", "stats", "habitable"],
        },
        q: { type: "string", description: "Search query (action=search)" },
        name: { type: "string", description: "Planet name (action=lookup)" },
        field: {
          type: "string",
          description: "Property to rank by (action=rank)",
        },
        limit: { type: "number", description: "Max results (default: 10)" },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order",
        },
        method: {
          type: "string",
          description: "Discovery method filter (action=search)",
        },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_anime",
    dataSource: onDemand("Jikan (MyAnimeList)"),
    description:
      "Search and browse anime. Actions: 'search' (text search), 'top' (top rated), 'season' (current season), 'details' (full details by MAL ID).",
    endpoint: {
      path: "/knowledge/anime/data",
      queryParams: ["action", "q", "id", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Query mode",
          enum: ["search", "top", "season", "details"],
        },
        q: { type: "string", description: "Search query (action=search)" },
        id: { type: "number", description: "MyAnimeList ID (action=details)" },
        limit: { type: "number", description: "Max results (default: 10)" },
        ...fieldsParam(FIELDS.ANIME),
      },
      required: ["action"],
    },
  },

  {
    name: "get_word_definition",
    dataSource: onDemand("Free Dictionary API"),
    description:
      "Look up a word's definition, pronunciation, phonetics (with audio URLs), synonyms, antonyms, etymology, and usage examples using the Free Dictionary API.",
    endpoint: {
      path: "/knowledge/dictionary/:word",
      pathParams: ["word"],
    },
    parameters: {
      type: "object",
      properties: {
        word: {
          type: "string",
          description: "The word to look up",
        },
        ...fieldsParam(FIELDS.DICTIONARY),
      },
      required: ["word"],
    },
  },
  {
    name: "search_papers",
    dataSource: onDemand("arXiv"),
    description:
      "Search academic papers on arXiv. Returns titles, abstracts, authors, publication dates, PDF links, and category classifications. Covers CS, physics, math, biology, economics, and more.",
    endpoint: {
      path: "/knowledge/papers/search",
      queryParams: ["q", "category", "limit", "sortBy"],
    },
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query for paper titles/abstracts",
        },
        category: {
          type: "string",
          description:
            "arXiv category filter (e.g. cs.AI, cs.LG, cs.CL, cs.CV, cs.SE, physics, math, econ, stat)",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10, max: 30)",
        },
        sortBy: {
          type: "string",
          description: "Sort order: relevance, lastUpdatedDate, submittedDate",
          enum: ["relevance", "lastUpdatedDate", "submittedDate"],
        },
        ...fieldsParam(FIELDS.PAPERS),
      },
      required: ["q"],
    },
  },
  {
    name: "get_youtube_video",
    dataSource: onDemand("YouTube oEmbed + youtube-transcript"),
    description:
      "Get full metadata and transcript for a YouTube video. Returns title, author, description, publish date, duration, view count, keywords, and the full timestamped transcript/captions. Accepts any YouTube URL format (youtube.com/watch, youtu.be, shorts, live) or a raw 11-character video ID. Useful for summarizing video content, extracting quotes, or analyzing spoken content without watching.",
    endpoint: {
      path: "/knowledge/youtube/video",
      queryParams: ["url", "lang", "transcript", "timestamps"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "YouTube video URL or 11-character video ID (e.g. 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', or 'dQw4w9WgXcQ')",
        },
        lang: {
          type: "string",
          description:
            "Preferred transcript language code (e.g. 'en', 'es', 'fr'). Defaults to 'en'.",
        },
        transcript: {
          type: "string",
          description:
            "Set to 'false' to skip transcript fetching and only return metadata. Defaults to true.",
          enum: ["true", "false"],
        },
        timestamps: {
          type: "string",
          description:
            "Set to 'false' to get plain text without timestamps. Defaults to true (timestamped format).",
          enum: ["true", "false"],
        },
        ...fieldsParam(FIELDS.YOUTUBE_VIDEO),
      },
      required: ["url"],
    },
  },

  // ── Unified Web Extraction Tools ─────────────────────────────
  {
    name: "read_url",
    dataSource: onDemand("Auto-detected platform API"),
    description:
      "Extract structured content from any URL. Auto-detects platform and uses the best extraction method: GitHub (repo metadata + README + languages), Reddit (post + comments), Twitter/X (tweet + metrics + media), Hacker News (post + comments), Stack Overflow (question + answers with code blocks), YouTube (metadata + transcript). For any other URL (news articles, blogs, documentation, etc.), extracts the page title, metadata, and main readable text using lightweight HTML parsing — no headless browser needed.",
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
          description:
            "Any URL. Supported platforms are auto-detected: GitHub (URL or owner/repo), Reddit, Twitter/X, Hacker News, Stack Overflow, YouTube. All other URLs use generic article extraction.",
        },
        commentLimit: {
          type: "number",
          description:
            "Max comments to fetch (Reddit default: 20, HN default: 25)",
        },
        answerLimit: {
          type: "number",
          description:
            "Max answers to fetch for Stack Overflow (default: 5, max: 10)",
        },
        readme: {
          type: "string",
          description: "Include repository README for GitHub (default: true)",
          enum: ["true", "false"],
        },
        languages: {
          type: "string",
          description: "Include language breakdown for GitHub (default: true)",
          enum: ["true", "false"],
        },
        transcript: {
          type: "string",
          description: "Include video transcript for YouTube (default: true)",
          enum: ["true", "false"],
        },
        lang: {
          type: "string",
          description:
            "Preferred transcript language for YouTube (default: 'en')",
        },
        maxChars: {
          type: "number",
          description:
            "Max characters of extracted text for generic pages (default: 15000)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "get_package_info",
    dataSource: onDemand("NPM Registry / PyPI JSON API"),
    description:
      "Look up a package on NPM or PyPI. Returns version, description, dependencies, license, README, weekly downloads (NPM), Python version requirements (PyPI), and more. Specify the registry to search.",
    endpoint: {
      path: "/knowledge/package/info",
      queryParams: ["name", "registry", "readme"],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Package name (e.g. 'express', '@types/node', 'requests', 'numpy')",
        },
        registry: {
          type: "string",
          description: "Which package registry to search",
          enum: ["npm", "pypi"],
        },
        readme: {
          type: "string",
          description: "Include README content (NPM only, default: true)",
          enum: ["true", "false"],
        },
      },
      required: ["name", "registry"],
    },
  },
  {
    name: "get_wikipedia_summary",
    dataSource: onDemand("Wikipedia REST API"),
    description:
      "Get a summary of any Wikipedia article including extract text, thumbnail image, description, and page URL. Good for quick factual lookups.",
    endpoint: {
      path: "/knowledge/wikipedia/summary/:title",
      pathParams: ["title"],
    },
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Wikipedia article title (e.g. 'Albert Einstein', 'Machine learning')",
        },
        ...fieldsParam(FIELDS.WIKIPEDIA_SUMMARY),
      },
      required: ["title"],
    },
  },
  {
    name: "get_on_this_day",
    dataSource: onDemand("Wikipedia REST API"),
    description:
      "Get historical events, births, deaths, or holidays that happened on a specific date from Wikipedia. Defaults to today if no date specified.",
    endpoint: {
      path: "/knowledge/wikipedia/onthisday",
      queryParams: ["type", "month", "day"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Type of events: selected, births, deaths, events, holidays",
          enum: ["selected", "births", "deaths", "events", "holidays"],
        },
        month: {
          type: "number",
          description: "Month (1-12), defaults to today",
        },
        day: {
          type: "number",
          description: "Day (1-31), defaults to today",
        },
        ...fieldsParam(FIELDS.ON_THIS_DAY),
      },
    },
  },

  // ── Movies & TV (12 → 6 unified + get_tv_season_details) ──────
  {
    name: "search_media",
    dataSource: onDemand("TMDB API"),
    description:
      "Search for movies or TV shows by title. Returns matching results with overview, release date, ratings, and poster images.",
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
          description: "Search movies or TV shows",
        },
        q: { type: "string", description: "Search query (title)" },
        year: {
          type: "number",
          description: "Filter by release/first air date year",
        },
        page: { type: "number", description: "Page number (default: 1)" },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["type", "q"],
    },
  },
  {
    name: "get_media_details",
    dataSource: onDemand("TMDB API"),
    description:
      "Get full details for a movie or TV show by TMDB ID — overview, genres, runtime, ratings, revenue, production companies, seasons (TV).",
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
          description: "Movie or TV show",
        },
        id: { type: "number", description: "TMDB ID" },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["type", "id"],
    },
  },
  {
    name: "get_media_credits",
    dataSource: onDemand("TMDB API"),
    description: "Get cast and crew credits for a movie or TV show by TMDB ID.",
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
          description: "Movie or TV show",
        },
        id: { type: "number", description: "TMDB ID" },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["type", "id"],
    },
  },
  {
    name: "get_trending_media",
    dataSource: onDemand("TMDB API"),
    description: "Get trending movies or TV shows for the day or week.",
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
          description: "Movie or TV show",
        },
        timeWindow: {
          type: "string",
          enum: ["day", "week"],
          description: "Trending window (default: week)",
        },
        limit: { type: "number", description: "Max results (default: 10)" },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "browse_media",
    dataSource: onDemand("TMDB API"),
    description:
      "Discover movies or TV shows by genre, year, rating, and vote count. Useful for browsing, not by name.",
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
          description: "Movie or TV show",
        },
        genreId: {
          type: "number",
          description: "Genre ID (use get_media_genres)",
        },
        year: { type: "number", description: "Release/first air date year" },
        sortBy: {
          type: "string",
          description: "Sort: popularity.desc, vote_average.desc, etc.",
        },
        minVoteAverage: {
          type: "number",
          description: "Min vote average (0-10)",
        },
        minVoteCount: { type: "number", description: "Min vote count" },
        page: { type: "number", description: "Page number (default: 1)" },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "get_media_genres",
    dataSource: onDemand("TMDB API"),
    description:
      "Get the list of genre IDs and names for movies or TV shows. Use these IDs with browse_media.",
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
          description: "Movie or TV show",
        },
      },
      required: ["type"],
    },
  },

  // ── TV Series (TV-only) ────────────────────────────────────────

  // ── Health (consolidated tools) ────────────────────────────────
  {
    name: "rank_foods_by_category",
    dataSource: staticDataset("USDA SR Legacy"),
    description:
      "Find foods highest in a specific nutrient. Choose a category (macros, minerals, vitamins, amino_acids, lipids, carbs, sterols) and nutrient to rank by. Examples: 'foods high in protein' → category='macros', nutrient='protein'. 'Best omega-3 sources' → category='lipids', nutrient='c22_d6_n3_dha'. Use list_category_nutrients to discover valid nutrient names per category.",
    endpoint: {
      path: "/health/nutrition/top",
      queryParams: ["category", "nutrient", "limit", "kingdom", "foodType"],
    },
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Nutrient category",
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
          description:
            "Specific nutrient to rank by (use list_category_nutrients for valid values)",
        },
        limit: { type: "number", description: "Max results (default: 10)" },
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
    description:
      "Search for drug information. Use searchBy to control mode: 'name' (general search), 'ndc_search' (FDA NDC directory), 'ndc_lookup' (exact NDC code), 'ingredient' (by active ingredient), 'pharm_class' (by pharmacological class).",
    endpoint: {
      path: "/health/drugs/unified",
      queryParams: ["q", "searchBy", "limit", "dosageForm", "productType"],
    },
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Search query — drug name, NDC code, ingredient, or class",
        },
        searchBy: {
          type: "string",
          description: "Search mode",
          enum: [
            "name",
            "ndc_search",
            "ndc_lookup",
            "ingredient",
            "pharm_class",
          ],
        },
        limit: { type: "number", description: "Max results (default: 10)" },
        dosageForm: {
          type: "string",
          description: "Dosage form filter (ndc_search only)",
        },
        productType: {
          type: "string",
          description: "Product type filter (ndc_search only)",
        },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["q"],
    },
  },

  {
    name: "get_drug_adverse_events",
    dataSource: onDemand("openFDA"),
    description:
      "Get FDA adverse event reports for a drug, including reported reactions, seriousness (death, hospitalization, life-threatening), and patient demographics.",
    endpoint: {
      path: "/health/drugs/adverse-events",
      queryParams: ["drug", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        drug: {
          type: "string",
          description: "Drug name (brand or generic)",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
        },
        ...fieldsParam(FIELDS.DRUG_ADVERSE_EVENTS),
      },
      required: ["drug"],
    },
  },
  {
    name: "get_drug_recalls",
    dataSource: onDemand("openFDA"),
    description:
      "Get FDA drug recall and enforcement actions. Returns recall classification, reason, affected products, and recalling firm.",
    endpoint: {
      path: "/health/drugs/recalls",
      queryParams: ["q", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Optional search term for recalls (drug name or keyword)",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
        },
        ...fieldsParam(FIELDS.DRUG_RECALLS),
      },
    },
  },

  // ── Gym Exercises (Free Exercise DB & Wger) ─────────────────
  {
    name: "search_gym_exercises",
    dataSource: staticDataset("Free Exercise DB & Wger"),
    description:
      "Search for gym exercises by keyword, category, equipment, target muscle, or difficulty level. Returns detailed instructions and muscle group targets.",
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
        q: {
          type: "string",
          description: "Optional search query (e.g. 'curl', 'bench')",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
        },
        category: {
          type: "string",
          description: "Filter by category (e.g. 'strength', 'stretching')",
        },
        equipment: {
          type: "string",
          description:
            "Filter by equipment (e.g. 'dumbbell', 'barbell', 'body only')",
        },
        force: {
          type: "string",
          description: "Filter by force (e.g. 'push', 'pull', 'static')",
        },
        level: {
          type: "string",
          description:
            "Filter by level (e.g. 'beginner', 'intermediate', 'expert')",
        },
        mechanic: {
          type: "string",
          description: "Filter by mechanic (e.g. 'compound', 'isolation')",
        },
        muscle: {
          type: "string",
          description:
            "Filter by target muscle (e.g. 'chest', 'biceps', 'abdominals')",
        },
        ...fieldsParam(FIELDS.EXERCISES),
      },
    },
  },
  {
    name: "get_gym_exercise_categories",
    dataSource: staticDataset("Free Exercise DB & Wger"),
    description:
      "Get all available gym exercise categories, equipment types, and muscle groups.",
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
    description: "Get details for a specific gym exercise by its exact ID.",
    endpoint: {
      path: "/health/exercises/{id}",
      pathParams: ["id"],
    },
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Exact exercise ID (e.g. 'Biceps_Curl')",
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
    description:
      "Search USDA's curated database of ~1,346 raw whole foods (fruits, vegetables, meats, fish, nuts, grains, fungi) for detailed nutritional information. Returns per-100g nutrient values including macros, minerals, vitamins, amino acids, lipid profiles, and more. Use nutrientTypes parameter to request specific nutrient categories. For ranking foods by a specific nutrient (e.g. 'highest iron'), use the top_foods_by_* tools instead.",
    endpoint: {
      path: "/health/nutrition/search",
      queryParams: ["q", "limit", "kingdom", "foodType", "nutrientTypes"],
    },
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Food name to search (e.g. 'chicken', 'spinach', 'salmon', 'almond')",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
        },
        kingdom: {
          type: "string",
          description:
            "Filter by biological kingdom: animalia, plantae, or fungi",
          enum: ["animalia", "plantae", "fungi"],
        },
        foodType: {
          type: "string",
          description: "Filter by food type: animal, plant, or fungus",
        },
        nutrientTypes: {
          type: "string",
          description:
            "Comma-separated nutrient categories to include: macros, minerals, vitamins, amino_acids, lipids, carbs, sterols. Omit for all.",
        },
        ...fieldsParam(FIELDS.USDA_NUTRITION),
      },
      required: ["q"],
    },
  },
  {
    name: "rank_foods_by_nutrient",
    dataSource: staticDataset("USDA SR Legacy"),
    description:
      "Rank raw whole foods by a specific nutrient content (highest first). Great for answering questions like 'what foods are highest in iron?' or 'best sources of vitamin C'. Supports ~1,346 USDA foods with ~150 nutrient columns.",
    endpoint: {
      path: "/health/nutrition/rank",
      queryParams: ["nutrient", "limit", "kingdom", "foodType"],
    },
    parameters: {
      type: "object",
      properties: {
        nutrient: {
          type: "string",
          description:
            "Nutrient column name (e.g. 'protein', 'calcium', 'iron', 'vitamin_b6', 'ascorbic_acid', 'potassium', 'fiber', 'kilocalories', 'c22_d6_n3_dha')",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
        },
        kingdom: {
          type: "string",
          description: "Filter by kingdom: animalia, plantae, fungi",
          enum: ["animalia", "plantae", "fungi"],
        },
        foodType: {
          type: "string",
          description: "Filter by food type: animal, plant, fungus",
        },
        ...fieldsParam(FIELDS.USDA_NUTRIENT_RANKING),
      },
      required: ["nutrient"],
    },
  },
  {
    name: "compare_food_nutrition",
    dataSource: staticDataset("USDA SR Legacy"),
    description:
      "Compare nutritional profiles side-by-side between 2+ raw whole foods. Example: compare chicken vs salmon vs tofu. Returns matched foods with their per-100g nutrient values.",
    endpoint: {
      path: "/health/nutrition/compare",
      queryParams: ["foods", "nutrientTypes"],
    },
    parameters: {
      type: "object",
      properties: {
        foods: {
          type: "string",
          description:
            "Comma-separated food names to compare (e.g. 'chicken,salmon,tofu')",
        },
        nutrientTypes: {
          type: "string",
          description:
            "Comma-separated nutrient categories: macros, minerals, vitamins, amino_acids, lipids, carbs, sterols. Omit for all.",
        },
        ...fieldsParam(FIELDS.USDA_NUTRITION),
      },
      required: ["foods"],
    },
  },
  {
    name: "get_food_categories",
    dataSource: staticDataset("USDA SR Legacy"),
    description:
      "List all available food categories, kingdoms, types, and parts in the USDA nutrition database. Useful for discovering what filters are available before searching.",
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
    description:
      "List all available nutrient type categories (macros, minerals, vitamins, amino_acids, lipids, carbs, sterols) and database stats. Use this to understand what nutrient data is available.",
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
    description:
      "List all available nutrients within a specific category (e.g. all minerals, all vitamins). Returns column names and human-readable labels. Use this to discover which nutrients you can query with the top_foods_by_* tools.",
    endpoint: {
      path: "/health/nutrition/nutrients/:category",
      pathParams: ["category"],
    },
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Nutrient category to list",
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
    description:
      "Find all foods matching a specific biological taxonomic classification. Filter by any Linnaean rank — kingdom, phylum, class, order, family, subfamily, tribe, genus, species, subspecies, variety, cultivar, etc. Example: rank='family', value='Rosaceae' returns all rose-family foods (apples, pears, cherries, etc). Use get_food_taxonomy first to discover available values.",
    endpoint: {
      path: "/health/nutrition/taxonomy/search",
      queryParams: ["rank", "value", "limit", "nutrientTypes"],
    },
    parameters: {
      type: "object",
      properties: {
        rank: {
          type: "string",
          description: "Taxonomic rank to filter on",
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
          description:
            "Value to match at the specified rank (case-insensitive). E.g. 'Rosaceae', 'Brassica', 'animalia', 'Chordata'",
        },
        limit: {
          type: "number",
          description: "Max results (default: 25)",
        },
        nutrientTypes: {
          type: "string",
          description:
            "Comma-separated nutrient categories to include: macros, minerals, vitamins, amino_acids, lipids, carbs, sterols. Omit for all.",
        },
        ...fieldsParam(FIELDS.USDA_TAXONOMY),
      },
      required: ["rank", "value"],
    },
  },
  {
    name: "get_food_taxonomy",
    dataSource: staticDataset("USDA SR Legacy"),
    description:
      "Discover available biological taxonomy values in the USDA food database. Without parameters, returns the full taxonomy tree with all ranks and their unique values. Optionally filter to a single rank, or scope by a parent rank (e.g. rank='genus', parentRank='family', parentValue='Rosaceae' to see all genera within the Rosaceae family). Use this to explore before using search_foods_by_taxonomy.",
    endpoint: {
      path: "/health/nutrition/taxonomy/tree",
      queryParams: ["rank", "parentRank", "parentValue"],
    },
    parameters: {
      type: "object",
      properties: {
        rank: {
          type: "string",
          description: "Optional: return only values for this specific rank",
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
          description:
            "Optional: filter by parent taxonomic rank (requires parentValue)",
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
          description:
            "Value to match at the parent rank (e.g. parentRank='family', parentValue='Rosaceae')",
        },
      },
    },
  },
  {
    name: "get_nutritional_requirements",
    dataSource: staticDataset("Multispecies Standards Database"),
    description:
      "Calculate dynamic nutritional requirement boundaries (minimums, maximums, RDAs) across 140+ nutrients (macronutrients, vitamins, minerals, amino acids, sterols). Essential for evaluating complete diets. Required scaling parameters like body weight are handled automatically based on authoritative standards (e.g., US DRI for humans, AAFCO for dogs/cats).",
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
          description: "Target species. Default: human.",
          enum: ["human", "canine", "feline"],
        },
        lifeStage: {
          type: "string",
          description: "Target life stage or demographic. Default: adult_male.",
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
          description:
            "Authoritative standard body. Defaults to US_DRI for humans, AAFCO for pets.",
          enum: ["US_DRI", "AAFCO", "EFSA", "NRC", "WHO", "FEDIAF"],
        },
        weightKg: {
          type: "number",
          description:
            "Target body weight in kg. Essential for scaling human amino acid limits.",
        },
        caloricIntake: {
          type: "number",
          description:
            "Estimated daily caloric intake (kcal). Essential for scaling AAFCO standards.",
        },
      },
    },
  },

  // ── Calorie Calculator (BMR/TDEE) ──────────────────────────────
  {
    name: "calculate_caloric_needs",
    dataSource: compute("Mifflin-St Jeor / TDEE"),
    description:
      "Calculate Basal Metabolic Rate (BMR) and Total Daily Energy Expenditure (TDEE) using the Mifflin-St Jeor equation. Returns caloric targets, macronutrient split (protein/carbs/fat in grams), BMI, and optional body composition. Essential first step for nutrition planning — feed the TDEE into get_nutritional_requirements as caloricIntake.",
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
          description: "Biological sex for BMR calculation",
          enum: ["male", "female"],
        },
        weightKg: {
          type: "number",
          description: "Body weight in kilograms",
        },
        heightCm: {
          type: "number",
          description: "Height in centimeters",
        },
        ageYears: {
          type: "number",
          description: "Age in years",
        },
        activityLevel: {
          type: "string",
          description: "Physical activity level",
          enum: ["sedentary", "light", "moderate", "active", "very_active"],
        },
        goal: {
          type: "string",
          description: "Caloric goal (affects daily target)",
          enum: ["maintain", "cut", "aggressive_cut", "lean_bulk", "bulk"],
        },
        macroSplit: {
          type: "string",
          description: "Macronutrient ratio preset",
          enum: ["balanced", "high_protein", "keto", "low_fat", "zone"],
        },
        bodyFatPct: {
          type: "number",
          description: "Optional body fat percentage for lean mass calculation",
        },
      },
      required: ["sex", "weightKg", "heightCm", "ageYears"],
    },
  },

  // ── Nutrient Gap Analysis ───────────────────────────────────────
  {
    name: "analyze_nutrient_gaps",
    dataSource: compute("Nutrient Gap Engine"),
    description:
      "Analyze dietary adequacy by comparing consumed foods against nutritional requirements. Accepts a food log (array of foods with grams eaten), calculates total nutrient intake, then diffs against DRI/AAFCO targets. Returns per-nutrient status: deficient (<50% DRI), low (50-89%), adequate (90-110%), surplus (>110%), or over_UL. Essential for identifying nutritional deficiencies.",
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
          type: "string",
          description:
            'JSON array of foods eaten: [{"name":"chicken breast","grams":200},{"name":"brown rice","grams":150}]',
        },
        species: {
          type: "string",
          description: "Target species",
          enum: ["human", "canine", "feline"],
        },
        lifeStage: {
          type: "string",
          description: "Life stage",
          enum: ["adult_male", "adult_female", "adult_maintenance"],
        },
        weightKg: {
          type: "number",
          description:
            "Body weight in kg (for scaling amino acid requirements)",
        },
        caloricIntake: {
          type: "number",
          description:
            "Daily caloric intake target (for scaling AAFCO standards)",
        },
      },
      required: ["foods"],
    },
  },

  // ── Food Substitute Finder ─────────────────────────────────────
  {
    name: "search_food_substitutes",
    dataSource: compute("Nutrient Similarity Engine"),
    description:
      "Find nutritionally similar food substitutes using cosine similarity on nutrient profile vectors. Useful for dietary restrictions, allergies, or preferences: 'What plant foods have a similar nutrient profile to salmon?' Supports dietary preference filtering (vegetarian, vegan, pescatarian) and nutrient emphasis.",
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
          description:
            "Source food to find substitutes for (e.g. 'salmon', 'beef', 'milk')",
        },
        targetNutrients: {
          type: "string",
          description:
            "Comma-separated nutrients to emphasize in matching (e.g. 'protein,iron,omega3')",
        },
        dietaryPreference: {
          type: "string",
          description: "Dietary preference filter",
          enum: ["vegetarian", "vegan", "pescatarian", "plant_only"],
        },
        excludeKingdom: {
          type: "string",
          description: "Exclude a biological kingdom from results",
          enum: ["animalia", "plantae", "fungi"],
        },
        excludeFoods: {
          type: "string",
          description:
            "Comma-separated food names to exclude (allergies, etc.)",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
        },
      },
      required: ["food"],
    },
  },

  // ── Exercise Calorie Estimator ──────────────────────────────────
  {
    name: "estimate_exercise_calories",
    dataSource: compute("Compendium of Physical Activities MET Table"),
    description:
      "Estimate calories burned during exercise using Metabolic Equivalent of Task (MET) values from the Compendium of Physical Activities. Includes EPOC (afterburn) estimation and post-exercise recovery recommendations (protein, carbs, water). Chain with calculate_caloric_needs to adjust daily targets.",
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
          description:
            "Exercise name (e.g. 'barbell squat', 'running', 'swimming', 'yoga')",
        },
        durationMinutes: {
          type: "number",
          description: "Exercise duration in minutes",
        },
        weightKg: {
          type: "number",
          description: "Body weight in kilograms",
        },
        intensity: {
          type: "string",
          description: "Exercise intensity level",
          enum: ["low", "moderate", "high"],
        },
        category: {
          type: "string",
          description:
            "Optional exercise category hint (e.g. 'strength', 'cardio', 'stretching')",
        },
      },
      required: ["exercise", "durationMinutes", "weightKg"],
    },
  },

  // ── Hydration Calculator ───────────────────────────────────────
  {
    name: "calculate_hydration_needs",
    dataSource: compute("ACSM Hydration Model"),
    description:
      "Calculate daily water intake recommendation based on body weight, activity level, climate, exercise, altitude, and special conditions (pregnancy, breastfeeding). Uses ACSM/IOM guidelines. Returns total recommendation with timing distribution.",
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
          description: "Body weight in kilograms",
        },
        activityLevel: {
          type: "string",
          description: "Physical activity level",
          enum: ["sedentary", "light", "moderate", "active", "very_active"],
        },
        climateTemp: {
          type: "number",
          description: "Ambient temperature in °C (adjusts for heat/cold)",
        },
        exerciseMinutes: {
          type: "number",
          description: "Daily exercise duration in minutes",
        },
        exerciseIntensity: {
          type: "string",
          description: "Exercise intensity",
          enum: ["low", "moderate", "high"],
        },
        altitudeM: {
          type: "number",
          description: "Altitude in meters (>2500m increases water needs)",
        },
        pregnant: {
          type: "string",
          description: "Is the person pregnant? (+300mL/day)",
          enum: ["true", "false"],
        },
        breastfeeding: {
          type: "string",
          description: "Is the person breastfeeding? (+700mL/day)",
          enum: ["true", "false"],
        },
        caffeineIntakeMg: {
          type: "number",
          description:
            "Daily caffeine intake in mg (offset for diuretic effect)",
        },
      },
      required: ["weightKg"],
    },
  },

  // ── Meal Plan Builder ──────────────────────────────────────────
  {
    name: "build_meal_plan",
    dataSource: compute("Meal Optimization Engine"),
    description:
      "Automatically generate a daily meal plan that covers nutritional targets within a caloric budget. Uses a greedy nutrient-coverage optimizer to select foods that maximally fill remaining nutrient gaps. Supports dietary preferences (omnivore, vegetarian, vegan, pescatarian, keto) and nutrient emphasis. Use calculate_caloric_needs first to determine the caloric target.",
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
          description: "Daily caloric target in kcal (e.g. 2000)",
        },
        mealsPerDay: {
          type: "number",
          description: "Number of meals per day (default: 3, max: 8)",
        },
        dietaryPreference: {
          type: "string",
          description: "Dietary preference filter",
          enum: ["omnivore", "vegetarian", "vegan", "pescatarian", "keto"],
        },
        excludeFoods: {
          type: "string",
          description: "Comma-separated foods to exclude (allergies, etc.)",
        },
        emphasizeNutrients: {
          type: "string",
          description:
            "Comma-separated nutrients to prioritize (e.g. 'iron,protein,calcium')",
        },
        species: {
          type: "string",
          description: "Target species",
          enum: ["human", "canine", "feline"],
        },
        lifeStage: {
          type: "string",
          description: "Life stage",
          enum: ["adult_male", "adult_female", "adult_maintenance"],
        },
        weightKg: {
          type: "number",
          description: "Body weight in kg",
        },
        itemsPerMeal: {
          type: "number",
          description: "Number of food items per meal (default: 4)",
        },
      },
      required: ["caloricTarget"],
    },
  },

  // ── Drug-Nutrient Interactions ──────────────────────────────────
  {
    name: "check_drug_nutrient_interactions",
    dataSource: staticDataset("Drug-Nutrient Interaction DB"),
    description:
      "Screen for drug-nutrient interactions (DNI). Checks if a medication depletes nutrients, blocks absorption, or interacts with specific vitamins/minerals. Covers ~60 clinically significant interactions across statins, metformin, PPIs, diuretics, antibiotics, anticonvulsants, corticosteroids, blood thinners, and more. Returns severity (major/moderate/minor), effect type, and recommendations.",
    endpoint: {
      path: "/health/drugs/nutrient-interactions",
      queryParams: ["drug", "nutrients"],
    },
    parameters: {
      type: "object",
      properties: {
        drug: {
          type: "string",
          description:
            "Drug name — brand or generic (e.g. 'metformin', 'omeprazole', 'lisinopril', 'prednisone')",
        },
        nutrients: {
          type: "string",
          description:
            "Optional: comma-separated nutrients to check specifically (e.g. 'calcium,iron'). Omit for all.",
        },
      },
      required: ["drug"],
    },
  },

  // ── Transit (TransLink Vancouver) ──────────────────────────────
  {
    name: "get_next_bus",
    dataSource: onDemand("TransLink RTTI"),
    description:
      "Get real-time bus arrival estimates for a TransLink (Vancouver) bus stop. Shows route, direction, expected arrival time, countdown, schedule status, and whether the trip is cancelled.",
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
          description: "5-digit TransLink bus stop number (e.g. 51479)",
        },
        route: {
          type: "string",
          description: "Optional route number filter (e.g. '99', '014')",
        },
        ...fieldsParam(FIELDS.NEXT_BUS),
      },
      required: ["stopNo"],
    },
  },
  {
    name: "get_transit_stop_info",
    dataSource: onDemand("TransLink RTTI"),
    description:
      "Get details about a TransLink bus stop including name, street intersection, city, coordinates, wheelchair access, and which routes serve it.",
    endpoint: {
      path: "/transit/stops/:stopNo",
      pathParams: ["stopNo"],
    },
    parameters: {
      type: "object",
      properties: {
        stopNo: {
          type: "number",
          description: "5-digit TransLink bus stop number",
        },
        ...fieldsParam(FIELDS.STOP_INFO),
      },
      required: ["stopNo"],
    },
  },
  {
    name: "search_transit_stops_nearby",
    dataSource: onDemand("TransLink RTTI"),
    description:
      "Find TransLink bus stops near a location. Returns nearby stops with names, distances, and route numbers. Defaults to Vancouver downtown if no coordinates provided.",
    endpoint: {
      path: "/transit/stops/nearby",
      queryParams: ["lat", "lng", "radius"],
    },
    parameters: {
      type: "object",
      properties: {
        lat: {
          type: "number",
          description: "Latitude (default: Vancouver downtown)",
        },
        lng: {
          type: "number",
          description: "Longitude (default: Vancouver downtown)",
        },
        radius: {
          type: "number",
          description: "Search radius in meters (default: 500, max: 2000)",
        },
        ...fieldsParam(FIELDS.NEARBY_STOPS),
      },
    },
  },
  {
    name: "get_transit_route_info",
    dataSource: onDemand("TransLink RTTI"),
    description:
      "Get details about a TransLink bus/SkyTrain route including name, operating company, and pattern destinations.",
    endpoint: {
      path: "/transit/routes/:routeNo",
      pathParams: ["routeNo"],
    },
    parameters: {
      type: "object",
      properties: {
        routeNo: {
          type: "string",
          description: "Route number (e.g. '99', '014', 'R4')",
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
    description:
      "Execute Python code in a sandboxed interpreter. Use this for complex calculations, data transformations, statistical analysis, string manipulation, date/time operations, or any task that benefits from programmatic computation. The interpreter has access to Python's standard library (math, json, datetime, collections, itertools, statistics, decimal, fractions, re, textwrap, csv, io, etc.) but network access and dangerous modules (subprocess, shutil, ctypes) are blocked. Code runs with a 30-second default timeout (max 60s) and 256 MB memory limit. Print results to stdout — the output is captured and returned.",
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
          description:
            "Python 3 source code to execute. Use print() to produce output. The full standard library is available (math, json, datetime, statistics, collections, itertools, decimal, fractions, re, csv, io, etc.). Network and subprocess access is blocked.",
        },
        timeout: {
          type: "integer",
          description:
            "Execution timeout in milliseconds (min 1000, max 60000, default 30000). Increase for computationally intensive tasks.",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "calculate_precise",
    dataSource: compute("bignumber.js"),
    description:
      "Perform highly precise mathematical calculations using bignumber.js. Supports arbitrary-precision arithmetic. Passed numbers should be strings to prevent precision loss. For sqrt, 'b' is ignored.",
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
          description: "The mathematical operation to perform",
        },
        a: {
          type: "string",
          description: "The first operand (must be a valid numeric string)",
        },
        b: {
          type: "string",
          description:
            "The second operand (must be a valid numeric string). Optional for sqrt.",
        },
      },
      required: ["operation", "a"],
    },
  },
  {
    name: "execute_javascript",
    dataSource: compute("Node.js vm"),
    description:
      "Execute JavaScript code in a sandboxed Node.js vm context. Much faster than Python for quick data transforms, JSON manipulation, regex, and math. Has access to JSON, Math, Date, RegExp, Array, Object, Map, Set, typed arrays, TextEncoder/TextDecoder, console.log, and all core JS builtins. No access to require, import, process, fetch, setTimeout, filesystem, or network. Use logger.info() to produce output. Returns both captured output and the expression result.",
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
          description:
            "JavaScript source code to execute. Use logger.info() to produce output. The last expression value is returned as 'result'. Full standard JS built-ins available (JSON, Math, Date, RegExp, Array methods, Map, Set, etc.). No require/import/fetch/process/setTimeout.",
        },
        timeout: {
          type: "integer",
          description:
            "Execution timeout in milliseconds (min 100, max 30000, default 5000).",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "execute_shell",
    dataSource: compute("bash subprocess"),
    description:
      "Execute allowlisted shell commands for text processing. Supports pipes (|) between commands. Allowed binaries: awk, sed, grep, cut, tr, sort, uniq, wc, head, tail, jq, bc, expr, base64, md5sum, sha256sum, date, cal, echo, printf, cat, paste, column, fold, nl, rev, tac, seq, shuf, factor, and more. No filesystem mutation, no network access. Input data can be piped via stdin.",
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
          description:
            "Shell command to execute. Pipes (|) are allowed between allowlisted binaries. Example: 'echo \"hello world\" | tr a-z A-Z' or 'sort | uniq -c | sort -rn | head -10'. Shell metacharacters (;, &, `, $, etc.) are blocked for security.",
        },
        stdin: {
          type: "string",
          description:
            "Optional input data to pipe to the command's stdin. Useful for processing text data with awk/sed/grep/sort/jq pipelines. Max 1 MB.",
        },
        timeout: {
          type: "integer",
          description:
            "Execution timeout in milliseconds (min 500, max 30000, default 10000).",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "convert_units",
    dataSource: compute("convert-units"),
    description:
      "Convert between physical measurement units. Supports length, mass, volume, temperature, time, speed, area, pressure, energy, power, frequency, data, acceleration, current, voltage, and more. LLMs frequently hallucinate unit conversions — use this tool for accuracy.",
    endpoint: {
      path: "/compute/units/convert",
      queryParams: ["value", "from", "to"],
    },
    parameters: {
      type: "object",
      properties: {
        value: {
          type: "number",
          description: "The numeric value to convert",
        },
        from: {
          type: "string",
          description:
            "Source unit abbreviation (e.g. 'mi', 'km', 'lb', 'kg', 'F', 'C', 'gal', 'l', 'psi', 'Pa', 'GB', 'MB')",
        },
        to: {
          type: "string",
          description:
            "Target unit abbreviation (e.g. 'km', 'mi', 'kg', 'lb', 'C', 'F', 'l', 'gal')",
        },
      },
      required: ["value", "from", "to"],
    },
  },
  {
    name: "parse_datetime",
    dataSource: compute("date-fns"),
    description:
      "Parse, format, compare, and perform arithmetic on dates and times. Operations: 'now' (current time), 'parse' (analyze a date), 'format' (custom formatting), 'diff' (difference between two dates in all units), 'add'/'subtract' (date arithmetic), 'startOf'/'endOf' (period boundaries), 'isValid' (validation). Supports timezone conversion. LLMs frequently get date math wrong — use this tool for accuracy.",
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
          description: "The date/time operation to perform",
        },
        date: {
          type: "string",
          description:
            "Date input — ISO 8601 string (e.g. '2024-03-15T10:30:00Z'), Unix timestamp (number), or 'now'. Required for most operations.",
        },
        date2: {
          type: "string",
          description:
            "Second date for 'diff' operation. Same format as 'date'.",
        },
        amount: {
          type: "integer",
          description:
            "Amount to add/subtract (for 'add' and 'subtract' operations)",
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
          description: "Time unit for add/subtract/startOf/endOf operations",
        },
        format: {
          type: "string",
          description:
            "Output format string using date-fns tokens (e.g. 'yyyy-MM-dd', 'EEEE, MMMM do yyyy', 'HH:mm:ss'). See date-fns format docs.",
        },
        timezone: {
          type: "string",
          description:
            "IANA timezone for output (e.g. 'America/Vancouver', 'Europe/London', 'Asia/Tokyo'). If omitted, uses UTC.",
        },
      },
      required: ["operation"],
    },
  },
  {
    name: "transform_json",
    dataSource: compute("jsonpath-plus"),
    description:
      "Transform, filter, reshape, and aggregate JSON data using JSONPath expressions and/or chained operations. Useful for extracting specific fields from complex API responses, reshaping data structures, filtering arrays, grouping, sorting, and aggregating. Operations: flatten, unique, sort, filter, pick, omit, groupBy, count, sum, limit, reverse.",
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
          description: "The JSON data to transform (object or array)",
        },
        expression: {
          type: "string",
          description:
            "JSONPath expression to extract data (e.g. '$.store.book[*].author', '$..price', '$.items[?(@.active==true)]'). Optional — can use operations alone.",
        },
        operations: {
          type: "array",
          description:
            "Array of chained operations to apply. Each operation: { type: 'flatten'|'unique'|'sort'|'filter'|'pick'|'omit'|'groupBy'|'count'|'sum'|'limit'|'reverse', ...params }. Sort: { key, order:'asc'|'desc' }. Filter: { key, value, operator:'eq'|'gt'|'lt'|'contains' }. Pick/Omit: { keys:[] }. GroupBy: { key }. Sum: { key }. Limit: { count }.",
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
    description:
      "Convert an array of objects into a downloadable CSV file. Returns a download URL. Use this when the user needs data exported for spreadsheets, reports, or external tools. Supports custom column ordering and delimiter.",
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
          description:
            "Array of objects to convert to CSV. Each object becomes one row.",
          items: { type: "object" },
        },
        columns: {
          type: "array",
          description:
            "Optional explicit column order. If omitted, uses keys from the first object.",
          items: { type: "string" },
        },
        filename: {
          type: "string",
          description: "Download filename (default: 'export.csv')",
        },
        delimiter: {
          type: "string",
          description: "Column delimiter (default: ','). Use '\\t' for TSV.",
        },
      },
      required: ["data"],
    },
  },
  {
    name: "generate_qr_code",
    dataSource: compute("qrcode"),
    description:
      "Generate a QR code PNG image from text, URLs, WiFi credentials, vCards, or any string data. Returns a qrImageUrl — render it with ![QR](qrImageUrl) markdown syntax so the user sees the QR code inline.",
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
          description:
            "The data to encode. URL, text, WiFi config (WIFI:T:WPA;S:MyNetwork;P:MyPassword;;), vCard, etc. Max ~4296 chars.",
        },
        size: {
          type: "integer",
          description: "Image width/height in pixels (default: 400, max: 1024)",
        },
        errorCorrection: {
          type: "string",
          enum: ["L", "M", "Q", "H"],
          description:
            "Error correction level: L (7%), M (15%, default), Q (25%), H (30%)",
        },
        darkColor: {
          type: "string",
          description: "Foreground color as hex (default: '#000000')",
        },
        lightColor: {
          type: "string",
          description: "Background color as hex (default: '#ffffff')",
        },
      },
      required: ["data"],
    },
  },
  {
    name: "render_latex",
    dataSource: compute("KaTeX CDN"),
    description:
      "Render LaTeX mathematical expressions as a beautiful embedded page using KaTeX. Use this to display equations, formulas, and mathematical notation. Returns a latexEmbedUrl — render it with ![LaTeX](latexEmbedUrl) markdown syntax so the user sees the rendered math inline.",
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
          description:
            "LaTeX math expression to render. Examples: '\\\\int_0^1 x^2 dx = \\\\frac{1}{3}', 'E = mc^2', '\\\\sum_{i=1}^{n} i = \\\\frac{n(n+1)}{2}'",
        },
        displayMode: {
          type: "boolean",
          description:
            "If true (default), renders as a display-style equation (centered, larger). If false, renders inline-style.",
        },
      },
      required: ["latex"],
    },
  },
  {
    name: "generate_diagram",
    dataSource: compute("Mermaid CDN"),
    description:
      "Render Mermaid diagrams (flowcharts, sequence diagrams, class diagrams, ER diagrams, Gantt charts, state diagrams, pie charts, git graphs) as interactive embedded pages. Returns a diagramEmbedUrl — render it with ![Diagram](diagramEmbedUrl) markdown syntax so the user sees the diagram inline.",
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
          description:
            "Mermaid diagram syntax. Examples: 'graph TD\\n  A[Start] --> B{Decision}\\n  B -->|Yes| C[OK]\\n  B -->|No| D[End]' or 'sequenceDiagram\\n  Alice->>Bob: Hello\\n  Bob-->>Alice: Hi back' or 'pie\\n  \"Dogs\" : 386\\n  \"Cats\" : 85'",
        },
        theme: {
          type: "string",
          enum: ["dark", "default", "forest", "neutral"],
          description: "Mermaid color theme (default: 'dark')",
        },
      },
      required: ["definition"],
    },
  },
  {
    name: "diff_text",
    dataSource: compute("diff"),
    description:
      "Compare two text inputs and produce a structured diff showing additions, deletions, and unchanged content. Also generates a unified patch. Supports character-level, word-level, line-level, sentence-level, and JSON diffs.",
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
          description: "The original text (or JSON string for json mode)",
        },
        textB: {
          type: "string",
          description: "The modified text (or JSON string for json mode)",
        },
        mode: {
          type: "string",
          enum: ["lines", "words", "chars", "sentences", "json"],
          description: "Diff granularity (default: 'lines')",
        },
      },
      required: ["textA", "textB"],
    },
  },
  {
    name: "generate_hash",
    dataSource: compute("node:crypto"),
    description:
      "Generate cryptographic hashes and HMACs. Supports MD5, SHA-1, SHA-256, SHA-512, and all Node.js crypto algorithms. Outputs in hex, base64, or other encodings. Use for checksums, data verification, and fingerprinting.",
    endpoint: {
      path: "/compute/hash",
      queryParams: ["data", "algorithm", "encoding", "key"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: "The data to hash",
        },
        algorithm: {
          type: "string",
          description:
            "Hash algorithm: md5, sha1, sha256, sha512, sha3-256, etc. (default: sha256)",
        },
        encoding: {
          type: "string",
          description: "Output encoding: hex (default), base64, base64url",
        },
        key: {
          type: "string",
          description:
            "Optional HMAC key. If provided, computes HMAC instead of plain hash.",
        },
      },
      required: ["data"],
    },
  },
  {
    name: "test_regex",
    dataSource: compute("native RegExp"),
    description:
      "Test a regular expression pattern against input text. Returns all matches with indices, captured groups, and named groups. Validates regex syntax. Useful for pattern matching, data extraction, and regex debugging.",
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
          description:
            "Regular expression pattern (without delimiters). Example: '\\\\d{3}-\\\\d{4}' or '(?<name>[A-Z]\\\\w+)'",
        },
        flags: {
          type: "string",
          description:
            "Regex flags: g (global), i (case-insensitive), m (multiline), s (dotAll), u (unicode). Default: 'g'",
        },
        text: {
          type: "string",
          description: "The input text to test the pattern against",
        },
      },
      required: ["pattern", "text"],
    },
  },
  {
    name: "encode_decode",
    dataSource: compute("internal"),
    description:
      "Encode or decode data between formats: Base64, Base64URL, hex, URL encoding, HTML entities, ROT13, binary, and JWT decode (no verification). Bidirectional — specify encode or decode direction.",
    endpoint: {
      path: "/compute/encode",
      queryParams: ["data", "format", "direction"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: "The data to encode or decode",
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
          description: "The encoding format",
        },
        direction: {
          type: "string",
          enum: ["encode", "decode"],
          description:
            "Direction of transformation (default: 'encode'). JWT only supports 'decode'.",
        },
      },
      required: ["data", "format"],
    },
  },
  {
    name: "convert_color",
    dataSource: compute("internal"),
    description:
      "Convert colors between HEX, RGB, HSL, HSV, and CMYK formats. Also generates color palettes: complementary, analogous, triadic, split-complementary, tetradic, and monochromatic. Accepts any common color input format including CSS named colors.",
    endpoint: {
      path: "/compute/color/convert",
      queryParams: ["color", "palette"],
    },
    parameters: {
      type: "object",
      properties: {
        color: {
          type: "string",
          description:
            "Color value in any format: HEX ('#ff6347'), RGB ('rgb(255,99,71)'), HSL ('hsl(9,100%,64%)'), or CSS name ('tomato')",
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
          description:
            "Optional — generate a color harmony palette based on the input color",
        },
      },
      required: ["color"],
    },
  },

  // ── Image Manipulation (Sharp + ImageMagick) ───────────────
  {
    name: "manipulate_image",
    dataSource: compute("sharp + imagemagick"),
    description:
      "Manipulate, transform, and process images using a hybrid Sharp + ImageMagick engine. " +
      "Accepts an image from a URL, base64 data URI, or a previous imageId (for chaining operations). " +
      "Supports resize, crop, rotate, flip, blur, sharpen, grayscale, negate, tint, brightness/saturation/hue adjustments, " +
      "gamma correction, trim whitespace, extend canvas, composite/overlay images, format conversion " +
      "(PNG, JPEG, WebP, AVIF, TIFF), text overlay with font control, distortion effects (swirl, wave, implode, barrel), " +
      "and border addition. Multiple operations can be chained in a single call. " +
      "Returns an imageUrl — render it with ![Image](imageUrl) markdown syntax so the user sees the result inline. " +
      "Use the 'metadata' operation to inspect image dimensions, format, color space, and channel info without transforming it.",
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
          description:
            "Image source: a public URL (http/https), a base64 data URI (data:image/png;base64,...), " +
            "or an imageId returned from a previous manipulate_image call (for chaining operations on the same image).",
        },
        operations: {
          type: "array",
          description:
            "Array of operations to apply sequentially. Each operation is an object with a 'type' field and type-specific parameters. " +
            "Operations are applied in order, enabling pipelines like resize → blur → format conversion in one call.",
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
                description:
                  "The operation type. " +
                  "Sharp operations (fast): resize, crop, rotate, flip, blur, sharpen, grayscale, negate, tint, adjust, gamma, trim, extend, composite, metadata. " +
                  "ImageMagick operations (advanced): text (rich text overlay), distort (swirl/wave/implode/barrel), border.",
              },
              width: {
                type: "integer",
                description: "Width in pixels (resize, crop, extend)",
              },
              height: {
                type: "integer",
                description: "Height in pixels (resize, crop, extend)",
              },
              fit: {
                type: "string",
                enum: ["cover", "contain", "fill", "inside", "outside"],
                description:
                  "Resize fit strategy (resize only, default: 'cover')",
              },
              left: {
                type: "integer",
                description: "Left offset in pixels (crop, extend, composite)",
              },
              top: {
                type: "integer",
                description: "Top offset in pixels (crop, extend, composite)",
              },
              right: {
                type: "integer",
                description: "Right padding in pixels (extend)",
              },
              bottom: {
                type: "integer",
                description: "Bottom padding in pixels (extend)",
              },
              angle: {
                type: "number",
                description: "Rotation angle in degrees (rotate)",
              },
              direction: {
                type: "string",
                enum: ["horizontal", "vertical"],
                description: "Flip direction (flip only, default: 'vertical')",
              },
              sigma: {
                type: "number",
                description:
                  "Blur/sharpen sigma (blur: 0.3-100, sharpen: default 1)",
              },
              color: {
                type: "string",
                description:
                  "Color as hex string, e.g. '#ff6347' (tint, border, text)",
              },
              background: {
                type: "string",
                description: "Background color as hex (rotate, resize, extend)",
              },
              brightness: {
                type: "number",
                description: "Brightness multiplier (adjust, default: 1.0)",
              },
              saturation: {
                type: "number",
                description: "Saturation multiplier (adjust, default: 1.0)",
              },
              hue: {
                type: "number",
                description: "Hue rotation in degrees (adjust)",
              },
              value: {
                type: "number",
                description: "Gamma value (gamma, default: 2.2)",
              },
              threshold: {
                type: "integer",
                description: "Trim threshold (trim, default: 10)",
              },
              overlayUrl: {
                type: "string",
                description: "URL of overlay image (composite)",
              },
              gravity: {
                type: "string",
                description:
                  "Placement gravity (composite, text): north, south, east, west, center, northeast, northwest, southeast, southwest",
              },
              blend: {
                type: "string",
                description:
                  "Blend mode (composite): over, multiply, screen, etc.",
              },
              content: {
                type: "string",
                description: "Text content to render (text)",
              },
              font: {
                type: "string",
                description:
                  "Font family name (text, default: 'Liberation-Sans')",
              },
              fontSize: {
                type: "integer",
                description: "Font size in points (text, default: 32)",
              },
              strokeColor: {
                type: "string",
                description: "Text stroke/outline color (text)",
              },
              strokeWidth: {
                type: "integer",
                description: "Text stroke width in pixels (text, default: 2)",
              },
              x: {
                type: "integer",
                description: "X offset for text positioning (text)",
              },
              y: {
                type: "integer",
                description: "Y offset for text positioning (text)",
              },
              effect: {
                type: "string",
                enum: ["swirl", "wave", "implode", "barrel"],
                description: "Distortion effect type (distort)",
              },
              degrees: {
                type: "number",
                description: "Swirl degrees (distort swirl, default: 90)",
              },
              amplitude: {
                type: "number",
                description: "Wave amplitude (distort wave, default: 10)",
              },
              wavelength: {
                type: "number",
                description: "Wave wavelength (distort wave, default: 100)",
              },
              factor: {
                type: "number",
                description: "Implode factor (distort implode, default: 0.5)",
              },
              params: {
                type: "string",
                description: "Raw distort params string (distort barrel)",
              },
            },
            required: ["type"],
          },
        },
        outputFormat: {
          type: "string",
          enum: ["png", "jpeg", "webp", "avif", "tiff"],
          description:
            "Output image format (default: 'png'). JPEG/WebP/AVIF use lossy compression controlled by outputQuality.",
        },
        outputQuality: {
          type: "integer",
          description:
            "Output quality 1-100 for lossy formats (JPEG/WebP/AVIF). Default: 80. Ignored for PNG.",
        },
      },
      required: ["input", "operations"],
    },
  },

  // ── Image to ASCII Art ──────────────────────────────────────
  {
    name: "convert_image_to_ascii",
    dataSource: compute("sharp"),
    description:
      "Convert an image into high-fidelity ASCII art. Supports loading images from URLs, base64 data URIs, or " +
      "previous imageId tokens. Features customizable output character width, custom character sets, contrast " +
      "enhancements, density inversion, and truecolor support. Returns raw ASCII text, ANSI terminal string, and a " +
      "dynamic, interactive HTML embed that renders automatically in the tool result panel.",
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
          description:
            "The input image source: public HTTP/HTTPS URL, base64 data URI (data:image/png;base64,...), " +
            "or an imageId from a prior manipulate_image/image_process call.",
        },
        width: {
          type: "integer",
          description:
            "Number of output characters wide (aspect ratio is automatically adjusted). Default: 100, Range: 10-250.",
        },
        chars: {
          type: "string",
          description:
            "Custom character gradient string ordered from densest to sparsest. " +
            "Default: high-fidelity gradient containing 70 distinct structural weights.",
        },
        contrast: {
          type: "number",
          description:
            "Contrast adjustment factor (e.g. 1.5 increases contrast, 0.5 decreases). Default: 1.0.",
        },
        reverse: {
          type: "boolean",
          description:
            "Invert density/brightness mapping (useful when displaying on light vs dark terminal themes). Default: false.",
        },
      },
      required: ["input"],
    },
  },

  // ── Video to GIF Conversion ────────────────────────────────
  {
    name: "convert_video_to_gif",
    dataSource: compute("ffmpeg"),
    description:
      "Convert a video (MP4, WebM, MOV, etc.) into an animated GIF using an optimized two-pass palette mapping pipeline. " +
      "Supports high-quality conversion (custom 256-color palette generated dynamically from video) and low-file-size conversion " +
      "(128 colors, reduced frame rate, no dithering). Accepts public URLs or local workspace video paths. " +
      "Returns an imageUrl — render it with ![GIF](imageUrl) markdown syntax so the user sees the GIF inline.",
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
          description:
            "The source video input: a public HTTP/HTTPS URL, file:// URL, or a local workspace absolute path (e.g. /home/rodrigo/development/...)",
        },
        quality: {
          type: "string",
          enum: ["high", "low"],
          description:
            "Conversion quality preset. 'high' uses 256 colors and sierra2_4a dithering. 'low' uses 128 colors and no dithering to drastically reduce file size. Default: 'high'.",
        },
        width: {
          type: "integer",
          description:
            "Target width in pixels. Aspect ratio is automatically preserved. Default: 480 for 'high', 320 for 'low'. Range: 64-1280.",
        },
        fps: {
          type: "integer",
          description:
            "Target frame rate (frames per second). Default: 15 for 'high', 10 for 'low'. Range: 1-30.",
        },
      },
      required: ["input"],
    },
  },

  // ── LOGO Turtle Graphics ───────────────────────────────────
  {
    name: "draw_turtle",
    dataSource: compute("internal"),
    description:
      "Draw graphics using LOGO Turtle commands on an HTML5 canvas. The turtle starts at center facing north. " +
      "IMPORTANT: You MUST draw incrementally — break the drawing into logical parts (e.g. each shape, each side, " +
      "each layer) and call this tool multiple times using the sessionId returned from the first call. " +
      "Send at most 20-30 commands per call. Between calls, briefly describe what you just drew and what comes next. " +
      "This lets the user follow along as the drawing builds up piece by piece. " +
      "Do NOT send the entire drawing in a single call. " +
      "Workflow: 1) First call without sessionId → creates session. " +
      "2) Each subsequent call passes the sessionId to append. " +
      "3) Only render the FINAL turtleEmbedUrl with ![Turtle Drawing](url) in your last message. " +
      "Available commands: forward/fd (distance), backward/bk (distance), right/rt (angle°), left/lt (angle°), " +
      "penup/pu, pendown/pd, color (CSS color), width (pixels), goto (x,y from center), setheading/seth (angle°), " +
      "circle (radius), arc (radius, extent°), dot/stamp (size), label/write (text), " +
      "begin_fill, end_fill, fillcolor, speed (1-10), hideturtle/ht, showturtle/st, home, reset, clear. " +
      "Each command is an object with 'action' and relevant value fields.",
    endpoint: {
      method: "POST",
      path: "/compute/turtle",
      bodyParams: ["commands", "options", "sessionId"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description:
            "Optional session ID returned from a previous draw_turtle call. " +
            "Pass this to append new commands to an existing drawing. " +
            "Omit to start a new drawing session.",
        },
        commands: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: {
                type: "string",
                description:
                  "Turtle command: forward, fd, backward, bk, right, rt, left, lt, " +
                  "penup, pu, pendown, pd, color, width, goto, setheading, seth, " +
                  "circle, arc, dot, stamp, label, write, begin_fill, end_fill, fillcolor, " +
                  "speed, hideturtle, ht, showturtle, st, home, reset, clear",
              },
              value: {
                type: "string",
                description:
                  "Primary value: distance (forward/backward), angle (right/left/setheading), " +
                  "radius (circle/arc), size (dot), speed (1-10), or CSS color string (color/fillcolor)",
              },
              value2: {
                type: "string",
                description:
                  "Secondary value: arc extent in degrees, or y-coordinate for goto",
              },
              x: {
                type: "number",
                description:
                  "X coordinate for goto (relative to center, positive = right)",
              },
              y: {
                type: "number",
                description:
                  "Y coordinate for goto (relative to center, positive = up)",
              },
              color: {
                type: "string",
                description:
                  "CSS color for color/fillcolor commands (e.g. '#ff6347', 'red', 'hsl(120,100%,50%)')",
              },
              text: {
                type: "string",
                description: "Text string for label/write commands",
              },
              fontSize: {
                type: "number",
                description:
                  "Font size in pixels for label/write (default: 14)",
              },
            },
            required: ["action"],
          },
          description:
            "Array of turtle commands to execute sequentially. " +
            'Example: [{"action":"forward","value":100},{"action":"right","value":90}]',
        },
        options: {
          type: "object",
          properties: {
            canvasWidth: {
              type: "number",
              description: "Canvas width in pixels (default: 800, max: 1920)",
            },
            canvasHeight: {
              type: "number",
              description: "Canvas height in pixels (default: 600, max: 1080)",
            },
            background: {
              type: "string",
              description: "Canvas background color (default: '#0f172a')",
            },
            animated: {
              type: "boolean",
              description:
                "Animate step-by-step (default: true). Set false for instant render.",
            },
            stepDelay: {
              type: "number",
              description:
                "Milliseconds between animated steps (default: 40, range: 5-500)",
            },
            title: {
              type: "string",
              description: "Optional title displayed above the canvas",
            },
          },
          description: "Optional canvas configuration",
        },
      },
      required: ["commands"],
    },
  },

  // ── 3D Object Creation (Triangle Mesh) ─────────────────────
  {
    name: "create_3d_mesh",
    dataSource: compute("internal"),
    description:
      "Create a 3D object from raw triangle mesh data — vertices and face indices. " +
      "IMPORTANT: You can build the 3D mesh incrementally — break the generation into logical parts (e.g. base, wings, " +
      "details, sections) and call this tool multiple times using the sessionId returned from the first call. " +
      "Pass the sessionId to append new vertices and faces. " +
      "Note: Face indices in subsequent calls are absolute (0-based indexing relative to the total accumulated vertices). " +
      "Between calls, briefly describe what you just added and what comes next so the user can follow along. " +
      "Omit sessionId to start a new 3D mesh session. " +
      "The response contains a sceneEmbedUrl — render it with ![3D Mesh](sceneEmbedUrl) markdown so the user sees the interactive 3D scene inline. " +
      "Max 50,000 total vertices and 100,000 total faces per session.",
    endpoint: {
      method: "POST",
      path: "/compute/3d/mesh",
      bodyParams: ["vertices", "faces", "normals", "colors", "options", "sessionId"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description:
            "Optional session ID returned from a prior create_3d_mesh call. " +
            "Pass this to append new vertices and faces to an existing mesh. " +
            "Omit to start a new 3D mesh session.",
        },
        vertices: {
          type: "array",
          description:
            "Array of vertex positions. Each vertex is [x, y, z]. Example: [[0,1,0], [1,-1,0], [-1,-1,0]]",
          items: {
            type: "array",
            items: { type: "number" },
            description: "[x, y, z] position",
          },
        },
        faces: {
          type: "array",
          description:
            "Array of triangle face indices. Each face is [v0, v1, v2] referencing vertex indices. Example: [[0,1,2]]",
          items: {
            type: "array",
            items: { type: "integer" },
            description: "[vertexIndex0, vertexIndex1, vertexIndex2]",
          },
        },
        normals: {
          type: "array",
          description:
            "Optional per-vertex normals [nx, ny, nz]. Must match vertex count. Omit to auto-compute.",
          items: {
            type: "array",
            items: { type: "number" },
          },
        },
        colors: {
          type: "array",
          description:
            "Optional per-vertex colors as CSS color strings. Must match vertex count. Example: ['#ff6347', '#38bdf8', '#4ade80']",
          items: { type: "string" },
        },
        options: {
          type: "object",
          properties: {
            wireframe: { type: "boolean", description: "Render as wireframe (default: false)" },
            flatShading: { type: "boolean", description: "Use flat shading for faceted look (default: true)" },
            autoRotate: { type: "boolean", description: "Auto-rotate the mesh (default: true)" },
            showGrid: { type: "boolean", description: "Show ground grid (default: true)" },
            showAxes: { type: "boolean", description: "Show XYZ axes helper (default: false)" },
            background: { type: "string", description: "Background color (default: '#0f172a')" },
            meshColor: { type: "string", description: "Mesh color if no vertex colors (default: '#38bdf8')" },
            metalness: { type: "number", description: "Material metalness 0-1 (default: 0.2)" },
            roughness: { type: "number", description: "Material roughness 0-1 (default: 0.6)" },
            opacity: { type: "number", description: "Material opacity 0-1 (default: 1.0)" },
            cameraPosition: {
              type: "array",
              items: { type: "number" },
              description: "Camera position [x, y, z]. Omit for auto-fit.",
            },
            title: { type: "string", description: "Title displayed in the overlay" },
          },
          description: "Rendering options",
        },
      },
      required: ["vertices", "faces"],
    },
  },

  // ── 3D Voxel Grid Creation ─────────────────────────────────
  {
    name: "create_3d_voxel",
    dataSource: compute("internal"),
    description:
      "Create a 3D object from a voxel grid. You can specify a list of explicit voxel coordinates, and/or a list of declarative primitive shapes (box, sphere, cylinder, cone, pyramid, ellipsoid, torus) that will be rasterized into voxels. " +
      "IMPORTANT: You can build the 3D voxel grid incrementally — break the generation into logical parts (e.g. terrain, walls, " +
      "decorations, modular additions) and call this tool multiple times using the sessionId returned from the first call. " +
      "Pass the sessionId to append new voxels and shapes progressively. " +
      "Between calls, briefly describe what you just added and what comes next so the user can follow along. " +
      "Omit sessionId to start a new 3D voxel session. " +
      "Features highly optimized rendering using GPU-based Three.js InstancedMesh for thousands of voxels. " +
      "Supports customizable voxel sizing, spacing, outline borders, wireframes, flat shading, colors, opacity, and ambient/directional light casting. " +
      "The response contains a sceneEmbedUrl — render it with ![3D Voxel Grid](sceneEmbedUrl) markdown so the user sees the interactive 3D voxel grid inline. " +
      "Max 100,000 total voxels per session.",
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
          description:
            "Optional session ID returned from a previous create_3d_voxel call. " +
            "Pass this to append new voxels and shapes to an existing voxel grid progressively. " +
            "Omit to start a new 3D voxel session.",
        },
        voxels: {
          type: "array",
          description:
            "Array of individual voxel coordinates and styling. Example: [{\"position\": [0,0,0], \"color\": \"#ff6347\"}]",
          items: {
            type: "object",
            properties: {
              position: {
                type: "array",
                description: "Discrete integer grid coordinate [x, y, z] for the voxel",
                items: { type: "integer" },
              },
              color: {
                type: "string",
                description: "CSS color for the individual voxel, e.g. '#ff6347' or 'red'",
              },
              opacity: {
                type: "number",
                description: "Voxel opacity 0.0 to 1.0 (default: 1.0)",
              },
            },
            required: ["position"],
          },
        },
        shapes: {
          type: "array",
          description:
            "Array of declarative primitive voxel shapes to be rasterized into the grid.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["box", "sphere", "cylinder", "cone", "pyramid", "ellipsoid", "torus"],
                description: "The primitive shape type",
              },
              center: {
                type: "array",
                description: "Voxel grid center coordinate [x, y, z] for the shape",
                items: { type: "number" },
              },
              color: {
                type: "string",
                description: "CSS color for the shape, e.g. '#38bdf8'",
              },
              opacity: {
                type: "number",
                description: "Shape opacity 0.0 to 1.0 (default: 1.0)",
              },
              hollow: {
                type: "boolean",
                description: "If true, only render the outer boundary shell of the shape (default: false)",
              },
              size: {
                type: "array",
                description: "Dimensions [width, height, depth] for box shape",
                items: { type: "number" },
              },
              radius: {
                type: "number",
                description: "Radius for sphere, cylinder, or cone shape",
              },
              height: {
                type: "number",
                description: "Height for cylinder, cone, or pyramid shape",
              },
              radii: {
                type: "array",
                description: "Radii [radiusX, radiusY, radiusZ] for ellipsoid shape",
                items: { type: "number" },
              },
              majorRadius: {
                type: "number",
                description: "Major ring radius for torus shape",
              },
              minorRadius: {
                type: "number",
                description: "Minor tube radius for torus shape",
              },
              axis: {
                type: "string",
                enum: ["x", "y", "z"],
                description: "Orientation axis for cylinder, cone, or torus shape (default: 'y')",
              },
            },
            required: ["type", "center"],
          },
        },
        options: {
          type: "object",
          properties: {
            wireframe: { type: "boolean", description: "Render voxels as wireframes (default: false)" },
            flatShading: { type: "boolean", description: "Use flat shading for a clean voxel look (default: true)" },
            showGrid: { type: "boolean", description: "Show ground grid (default: true)" },
            showAxes: { type: "boolean", description: "Show XYZ axes helper (default: false)" },
            background: { type: "string", description: "Background color (default: '#0f172a')" },
            autoRotate: { type: "boolean", description: "Auto-rotate the camera (default: true)" },
            autoRotateSpeed: { type: "number", description: "Camera auto-rotation speed (default: 1.0)" },
            voxelSize: { type: "number", description: "Multiplier for size of each voxel cube (default: 0.95 to leave small gaps)" },
            voxelSpacing: { type: "number", description: "Gap spacing distance multiplier between voxels (default: 0.0)" },
            outlineColor: { type: "string", description: "Voxel outline/contour border color (default: '#000000', empty to disable)" },
            outlineOpacity: { type: "number", description: "Voxel outline/contour opacity (default: 0.35)" },
            cameraPosition: {
              type: "array",
              items: { type: "number" },
              description: "Camera position [x, y, z]. Omit for auto-fit.",
            },
            title: { type: "string", description: "Title displayed in the overlay" },
          },
          description: "Rendering options",
        },
      },
    },
  },

  // ── 3D Object Creation (Primitive Composition) ─────────────
  {
    name: "create_3d_scene",
    dataSource: compute("internal"),
    description:
      "Compose a 3D scene from built-in primitive shapes with PBR materials and transforms. " +
      "Available shapes: box, sphere, cylinder, cone, torus, torusKnot, plane, ring, circle, " +
      "dodecahedron, icosahedron, octahedron, tetrahedron, capsule. " +
      "Each object supports position, rotation (degrees), scale, and material properties (color, metalness, roughness, " +
      "opacity, emissive, wireframe, flatShading). " +
      "Use cases: architectural mockups, abstract sculptures, game prototyping, educational geometry, product showcases. " +
      "The response contains a sceneEmbedUrl — render it with ![3D Scene](sceneEmbedUrl) markdown so the user sees the interactive 3D scene inline. " +
      "Max 200 objects per call. Supports shadow casting, ambient/directional lighting control, and auto-orbit camera. " +
      "Supports progressive, step-by-step incremental building using a sessionId (analogous to the draw_turtle graphics tool) where subsequent calls with the same sessionId append new objects to the existing scene rather than overwriting it.",
    endpoint: {
      method: "POST",
      path: "/compute/3d/scene",
      bodyParams: ["objects", "options", "sessionId"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description:
            "Optional session ID returned from a previous create_3d_scene call. " +
            "Pass this to append new objects to an existing 3D scene progressively. " +
            "Omit to start a new 3D scene session.",
        },
        objects: {
          type: "array",
          description: "Array of primitive shape objects to compose into a scene.",
          items: {
            type: "object",
            properties: {
              shape: {
                type: "string",
                enum: [
                  "box", "sphere", "cylinder", "cone", "torus", "torusKnot",
                  "plane", "ring", "circle", "dodecahedron", "icosahedron",
                  "octahedron", "tetrahedron", "capsule",
                ],
                description: "The primitive shape type",
              },
              size: {
                type: "array",
                items: { type: "number" },
                description: "Dimensions [width, height, depth] for box shapes",
              },
              radius: { type: "number", description: "Radius for spherical/cylindrical shapes (default: 0.5)" },
              height: { type: "number", description: "Height for cylinder/cone/capsule (default: 1)" },
              radiusTop: { type: "number", description: "Top radius for cylinder (default: radius)" },
              radiusBottom: { type: "number", description: "Bottom radius for cylinder (default: radius)" },
              tube: { type: "number", description: "Tube radius for torus/torusKnot (default: 0.15)" },
              segments: { type: "integer", description: "Geometry segment count (default: 32)" },
              position: {
                type: "array",
                items: { type: "number" },
                description: "Position [x, y, z] in world space",
              },
              rotation: {
                type: "array",
                items: { type: "number" },
                description: "Rotation [x, y, z] in degrees",
              },
              scale: {
                type: "array",
                items: { type: "number" },
                description: "Scale [x, y, z] multipliers",
              },
              material: {
                type: "object",
                properties: {
                  color: { type: "string", description: "CSS color (default: '#38bdf8')" },
                  metalness: { type: "number", description: "0-1 (default: 0.2)" },
                  roughness: { type: "number", description: "0-1 (default: 0.6)" },
                  opacity: { type: "number", description: "0-1 (default: 1.0)" },
                  emissive: { type: "string", description: "Emissive glow color" },
                  emissiveIntensity: { type: "number", description: "Emissive intensity (default: 0)" },
                  wireframe: { type: "boolean", description: "Wireframe mode" },
                  flatShading: { type: "boolean", description: "Flat shading" },
                },
                description: "PBR material properties",
              },
              name: { type: "string", description: "Optional name for the object" },
            },
            required: ["shape"],
          },
        },
        options: {
          type: "object",
          properties: {
            autoRotate: { type: "boolean", description: "Auto-orbit camera (default: true)" },
            showGrid: { type: "boolean", description: "Show ground grid (default: true)" },
            background: { type: "string", description: "Background color (default: '#0f172a')" },
            enableShadows: { type: "boolean", description: "Enable shadow casting (default: true)" },
            ambientLightIntensity: { type: "number", description: "Ambient light intensity (default: 0.5)" },
            directionalLightIntensity: { type: "number", description: "Key light intensity (default: 0.8)" },
            cameraPosition: {
              type: "array",
              items: { type: "number" },
              description: "Camera position [x, y, z]. Omit for auto-fit.",
            },
            fieldOfView: { type: "number", description: "Camera FOV in degrees (default: 50)" },
            title: { type: "string", description: "Title displayed in the overlay" },
          },
          description: "Scene rendering options",
        },
      },
      required: ["objects"],
    },
  },

  // ── 3D Object Creation (Declarative Scene Graph) ───────────
  {
    name: "create_3d_model",
    dataSource: compute("internal"),
    description:
      "Create a rich 3D scene using a declarative scene graph with hierarchical grouping, built-in animations, " +
      "environment lighting presets, ground planes, and 3D text labels. This is the highest-level 3D tool. " +
      "Object types: box, sphere, cylinder, cone, torus, torusKnot, plane, ring, circle, dodecahedron, " +
      "icosahedron, octahedron, tetrahedron, capsule, group (container for children), text3d (3D text label). " +
      "Built-in animations: spin, bounce, orbit, pulse, float — applied per-object with configurable speed/amplitude. " +
      "Environment presets: studio, outdoor, night, sunset, dawn, warehouse, neutral — control ambient, " +
      "directional, fill, and hemisphere lighting automatically. " +
      "Supports ground plane with shadows, fog, camera FOV control, and auto-orbit. " +
      "Use cases: product showcases, animated explainers, data visualization, artistic compositions, holiday scenes. " +
      "The response contains a sceneEmbedUrl — render it with ![3D Model](sceneEmbedUrl) markdown so the user sees the interactive 3D scene inline. " +
      "Max 300 total objects (including nested children), max 5 levels of nesting. " +
      "Supports progressive, step-by-step incremental building using a sessionId (analogous to the draw_turtle graphics tool) where subsequent calls with the same sessionId append new objects to the existing scene rather than overwriting it.",
    endpoint: {
      method: "POST",
      path: "/compute/3d/model",
      bodyParams: ["scene", "objects", "options", "sessionId"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description:
            "Optional session ID returned from a previous create_3d_model call. " +
            "Pass this to append new objects to an existing 3D scene progressively. " +
            "Omit to start a new 3D scene session.",
        },
        scene: {
          type: "object",
          description: "Scene-level configuration: environment, background, ground, camera, fog.",
          properties: {
            environment: {
              type: "string",
              enum: ["studio", "outdoor", "night", "sunset", "dawn", "warehouse", "neutral"],
              description: "Lighting environment preset (default: 'studio')",
            },
            background: { type: "string", description: "Background color (default: '#0f172a')" },
            ground: {
              type: "object",
              properties: {
                enabled: { type: "boolean", description: "Show ground plane (default: true)" },
                color: { type: "string", description: "Ground color (default: '#1e293b')" },
                size: { type: "number", description: "Ground plane size (default: 10)" },
              },
              description: "Ground plane configuration",
            },
            camera: {
              type: "object",
              properties: {
                position: { type: "array", items: { type: "number" }, description: "Camera [x,y,z]. Omit for auto-fit." },
                target: { type: "array", items: { type: "number" }, description: "Look-at target [x,y,z] (default: [0,0,0])" },
                fov: { type: "number", description: "Field of view in degrees (default: 50)" },
                autoOrbit: { type: "boolean", description: "Auto-orbit camera (default: true)" },
                autoOrbitSpeed: { type: "number", description: "Orbit speed (default: 1.0)" },
              },
              description: "Camera configuration",
            },
            fog: {
              type: "object",
              properties: {
                enabled: { type: "boolean", description: "Enable fog (default: false)" },
                color: { type: "string", description: "Fog color (defaults to background)" },
                near: { type: "number", description: "Fog start distance (default: 10)" },
                far: { type: "number", description: "Fog end distance (default: 50)" },
              },
              description: "Fog configuration",
            },
          },
        },
        objects: {
          type: "array",
          description:
            "Array of scene objects. Each can be a shape, a group (with children), or text3d.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "box", "sphere", "cylinder", "cone", "torus", "torusKnot",
                  "plane", "ring", "circle", "dodecahedron", "icosahedron",
                  "octahedron", "tetrahedron", "capsule", "group", "text3d",
                ],
                description: "Object type. 'group' nests children. 'text3d' renders 3D text.",
              },
              name: { type: "string", description: "Optional name" },
              size: { type: "array", items: { type: "number" }, description: "Box dimensions [w,h,d]" },
              radius: { type: "number", description: "Radius for round shapes" },
              height: { type: "number", description: "Height for cylinder/cone/capsule" },
              position: { type: "array", items: { type: "number" }, description: "Position [x,y,z]" },
              rotation: { type: "array", items: { type: "number" }, description: "Rotation [x,y,z] in degrees" },
              scale: { type: "array", items: { type: "number" }, description: "Scale [x,y,z]" },
              material: {
                type: "object",
                properties: {
                  color: { type: "string", description: "CSS color" },
                  metalness: { type: "number", description: "0-1" },
                  roughness: { type: "number", description: "0-1" },
                  opacity: { type: "number", description: "0-1" },
                  emissive: { type: "string", description: "Emissive glow color" },
                  wireframe: { type: "boolean" },
                },
                description: "PBR material",
              },
              animation: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["spin", "bounce", "orbit", "pulse", "float"],
                    description: "Animation type",
                  },
                  speed: { type: "number", description: "Animation speed multiplier (default: 1.0)" },
                  axis: { type: "string", description: "Rotation axis for spin: 'x', 'y', or 'z' (default: 'y')" },
                  amplitude: { type: "number", description: "Movement amplitude (default: 0.5)" },
                  radius: { type: "number", description: "Orbit radius (default: 2)" },
                },
                description: "Built-in animation. Applied every frame.",
              },
              children: {
                type: "array",
                description: "Child objects (only for type='group'). Same structure as parent objects array.",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: [
                        "box", "sphere", "cylinder", "cone", "torus", "torusKnot",
                        "plane", "ring", "circle", "dodecahedron", "icosahedron",
                        "octahedron", "tetrahedron", "capsule", "group", "text3d",
                      ],
                      description: "Object type",
                    },
                    name: { type: "string", description: "Optional name" },
                    size: { type: "array", items: { type: "number" }, description: "Box dimensions [w,h,d]" },
                    radius: { type: "number", description: "Radius for round shapes" },
                    height: { type: "number", description: "Height for cylinder/cone/capsule" },
                    position: { type: "array", items: { type: "number" }, description: "Position [x,y,z]" },
                    rotation: { type: "array", items: { type: "number" }, description: "Rotation [x,y,z] in degrees" },
                    scale: { type: "array", items: { type: "number" }, description: "Scale [x,y,z]" },
                    material: {
                      type: "object",
                      properties: {
                        color: { type: "string", description: "CSS color" },
                        metalness: { type: "number", description: "0-1" },
                        roughness: { type: "number", description: "0-1" },
                        opacity: { type: "number", description: "0-1" },
                        emissive: { type: "string", description: "Emissive glow color" },
                        wireframe: { type: "boolean" },
                      },
                      description: "PBR material",
                    },
                    animation: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: ["spin", "bounce", "orbit", "pulse", "float"],
                          description: "Animation type",
                        },
                        speed: { type: "number", description: "Animation speed multiplier (default: 1.0)" },
                        axis: { type: "string", description: "Rotation axis for spin: 'x', 'y', or 'z' (default: 'y')" },
                        amplitude: { type: "number", description: "Movement amplitude (default: 0.5)" },
                        radius: { type: "number", description: "Orbit radius (default: 2)" },
                      },
                      description: "Built-in animation",
                    },
                    content: { type: "string", description: "Text content (type='text3d' only)" },
                    fontSize: { type: "number", description: "Text size (type='text3d', default: 0.5)" },
                  },
                  required: ["type"],
                },
              },
              content: { type: "string", description: "Text content (type='text3d' only)" },
              fontSize: { type: "number", description: "Text size (type='text3d', default: 0.5)" },
            },
            required: ["type"],
          },
        },
        options: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title displayed in the overlay" },
            showGrid: { type: "boolean", description: "Show ground grid (default: false)" },
            showAxes: { type: "boolean", description: "Show XYZ axes (default: false)" },
            enableShadows: { type: "boolean", description: "Enable shadow casting (default: true)" },
          },
          description: "Additional rendering options",
        },
      },
      required: ["objects"],
    },
  },
  {
    name: "convert_currency",
    dataSource: onDemand("Exchange Rate API"),
    description:
      "Convert an amount between any two currencies using real-time exchange rates. Supports 161 currencies including USD, CAD, EUR, GBP, JPY, etc.",
    endpoint: {
      path: "/utility/currency/convert",
      queryParams: ["amount", "from", "to"],
    },
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Amount to convert (default: 1)",
        },
        from: {
          type: "string",
          description: "Source currency code (e.g. 'USD', 'CAD', 'EUR')",
        },
        to: {
          type: "string",
          description: "Target currency code (e.g. 'CAD', 'JPY', 'GBP')",
        },
        ...fieldsParam(FIELDS.CURRENCY_CONVERT),
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_time_in_timezone",
    dataSource: onDemand("World Time API"),
    description:
      "Get the current time in any timezone worldwide. Returns datetime, UTC offset, DST status, abbreviation, and day of week.",
    endpoint: {
      path: "/utility/timezone/:area/:location",
      pathParams: ["area", "location"],
    },
    parameters: {
      type: "object",
      properties: {
        area: {
          type: "string",
          description:
            "Timezone area (e.g. 'America', 'Europe', 'Asia', 'Pacific')",
        },
        location: {
          type: "string",
          description:
            "Timezone location (e.g. 'Vancouver', 'Tokyo', 'London', 'New_York')",
        },
        ...fieldsParam(FIELDS.TIMEZONE),
      },
      required: ["area", "location"],
    },
  },
  {
    name: "get_ip_info",
    dataSource: onDemand("IPinfo.io"),
    description:
      "Look up geolocation and network information for an IP address. Returns city, region, country, coordinates, and ISP/organization info. For your own server IP, omit the ip parameter or use 'self'.",
    endpoint: {
      path: "/utility/ip/:ip",
      pathParams: ["ip"],
    },
    parameters: {
      type: "object",
      properties: {
        ip: {
          type: "string",
          description:
            "The IP address to look up (e.g. '8.8.8.8'). Leave empty or use 'self' for the caller's IP.",
        },
        ...fieldsParam(FIELDS.IP_GEOLOCATION),
      },
    },
  },
  {
    name: "search_nearby_places",
    dataSource: onDemand("Google Places API"),
    description:
      "Search for nearby places/businesses by type (e.g. restaurant, cafe, pharmacy, gas_station, grocery_store, gym, hospital, park, shopping_mall, bar, hotel, bank, library). Returns name, address, rating, reviews, price level, phone, website, and whether currently open. To show results on a map, follow up with the generate_map tool using the returned coordinates.",
    endpoint: {
      path: "/utility/places/nearby",
      queryParams: ["type", "latitude", "longitude", "radius", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Google Places type to search for. Common types: restaurant, cafe, bar, bakery, pharmacy, gas_station, grocery_store, supermarket, gym, hospital, dentist, park, shopping_mall, hotel, bank, library, museum, movie_theater, night_club, spa, car_repair, car_wash, laundry, post_office, veterinary_care",
        },
        latitude: {
          type: "number",
          description:
            "Center latitude for the search (defaults to server location)",
        },
        longitude: {
          type: "number",
          description:
            "Center longitude for the search (defaults to server location)",
        },
        radius: {
          type: "number",
          description: "Search radius in meters (default: 5000, max: 50000)",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20, max: 20)",
        },
        ...fieldsParam(FIELDS.PLACES),
      },
      required: ["type"],
    },
  },
  {
    name: "search_places",
    dataSource: onDemand("Google Places API"),
    description:
      "Search for places using a natural language text query (e.g. 'best sushi near downtown', 'coffee shops with wifi', '24 hour pharmacy'). More flexible than nearby search — supports descriptive queries. Returns name, address, rating, reviews, price level, phone, website, and whether currently open. To show results on a map, follow up with the generate_map tool using the returned coordinates.",
    endpoint: {
      path: "/utility/places/search",
      queryParams: ["q", "latitude", "longitude", "radius", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Natural language search query (e.g. 'italian restaurants', 'best coffee shops', '24 hour pharmacy near me')",
        },
        latitude: {
          type: "number",
          description:
            "Bias latitude for the search (defaults to server location)",
        },
        longitude: {
          type: "number",
          description:
            "Bias longitude for the search (defaults to server location)",
        },
        radius: {
          type: "number",
          description: "Bias radius in meters (default: 10000, max: 50000)",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 10, max: 20)",
        },
        ...fieldsParam(FIELDS.PLACES),
      },
      required: ["q"],
    },
  },
  {
    name: "generate_map",
    dataSource: onDemand("Google Static Maps API"),
    description:
      "Generate an interactive Google Map with labeled markers for a set of locations. Use this AFTER a places search, IP lookup, or any query that yields coordinates. Pass the locations as a JSON markers array. The response contains a mapEmbedUrl — you MUST render it in your response using ![Map](mapEmbedUrl) markdown syntax so the user sees the interactive map inline.",
    endpoint: {
      path: "/utility/map",
      queryParams: ["markers", "zoom", "maptype"],
    },
    parameters: {
      type: "object",
      properties: {
        markers: {
          type: "string",
          description:
            'JSON array of marker objects. Each marker: { "latitude": number, "longitude": number, "label": "optional string" }. Example: [{"latitude":49.28,"longitude":-123.12,"label":"Miku"},{"latitude":49.27,"longitude":-123.11,"label":"Ramen Danbo"}]',
        },
        zoom: {
          type: "number",
          description:
            "Optional zoom level (1-20). If omitted, auto-fits to markers.",
        },
        maptype: {
          type: "string",
          description:
            "Map type: roadmap, satellite, terrain, hybrid (default: roadmap)",
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
    description:
      "Generate an interactive chart (bar, line, or pie) from structured data. Use this to visualize comparisons, trends, distributions, or any numeric data the user asks to see as a chart. Pass labels (category names or x-axis values) and one or more datasets (each with a label and numeric data array). The response contains a chartImageUrl — you MUST render it in your response using ![Chart](chartImageUrl) markdown syntax so the user sees the chart image inline.",
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
          description: "The chart type to generate",
          enum: ["bar", "line", "pie"],
        },
        title: {
          type: "string",
          description: "Optional chart title displayed at the top",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description:
            'Category labels (bar/pie) or x-axis values (line). Example: ["Jan", "Feb", "Mar", "Apr"]',
        },
        datasets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description:
                  'Dataset name shown in the legend (e.g. "Revenue", "Temperature")',
              },
              data: {
                type: "array",
                items: { type: "number" },
                description:
                  "Numeric values corresponding to each label. Length must match labels array.",
              },
            },
            required: ["label", "data"],
          },
          description:
            'One or more data series. For pie charts use a single dataset. Example: [{"label": "Sales", "data": [120, 190, 300, 500]}]',
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
    description:
      "List all available World Bank development indicators with coverage statistics. Use this for discovery before querying or ranking.",
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
    description:
      "Look up airports. Actions: 'search' (by name/city), 'code' (by IATA/ICAO code), 'country' (list by country), 'nearest' (find nearest to coordinates).",
    endpoint: {
      path: "/utility/airports/lookup",
      queryParams: ["action", "q", "code", "country", "lat", "lng", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Lookup mode",
          enum: ["search", "code", "country", "nearest"],
        },
        q: { type: "string", description: "Search query (action=search)" },
        code: {
          type: "string",
          description:
            "IATA/ICAO code or country code (action=code or country)",
        },
        lat: { type: "number", description: "Latitude (action=nearest)" },
        lng: { type: "number", description: "Longitude (action=nearest)" },
        limit: { type: "number", description: "Max results (default: 10)" },
        country: {
          type: "string",
          description: "Country code filter (action=search)",
        },
        fields: {
          type: "string",
          description: "Comma-separated fields to return",
        },
      },
      required: ["action"],
    },
  },

  {
    name: "get_public_webcams",
    dataSource: onDemand("Municipal Open Data APIs"),
    description:
      "Get a list of public traffic and scenic webcams for a specific city across North America. Returns camera name, location, coordinates, and the URL to the camera page or image. Covers 33 cities across Canada and the US.",
    endpoint: { path: "/utility/webcams", queryParams: ["city", "limit"] },
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City/area name. Default: vancouver.",
          enum: [
            "vancouver",
            "seattle",
            "toronto",
            "calgary",
            "austin",
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
            "baton-rouge",
            "nyc",
            "buffalo",
            "syracuse",
            "albany",
            "rochester",
            "long-island",
            "westchester",
            "utica",
            "binghamton",
            "ithaca",
          ],
        },
        limit: {
          type: "integer",
          description: "Max number of webcams to return. Default 100.",
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
    description:
      "List all available drug dosage forms (tablet, capsule, injection, etc.) with counts. Use for discovery.",
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
    description:
      "Get the latest known positions and data for all maritime vessels currently tracked via AIS (Automatic Identification System). Returns vessels sorted by most recently seen. Data streams in real-time via WebSocket from nearby ship transponders.",
    endpoint: {
      path: "/maritime/vessels",
      queryParams: ["limit"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Max vessels to return (default 100)",
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
    },
  },
  {
    name: "get_vessel_by_mmsi",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description:
      "Get detailed data for a specific vessel by its MMSI (Maritime Mobile Service Identity) number. Returns position, speed, heading, destination, ship type, dimensions, and ETA if available.",
    endpoint: {
      path: "/maritime/vessels/:mmsi",
      pathParams: ["mmsi"],
    },
    parameters: {
      type: "object",
      properties: {
        mmsi: {
          type: "string",
          description: "9-digit Maritime Mobile Service Identity number",
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
      required: ["mmsi"],
    },
  },
  {
    name: "search_vessels",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description:
      "Search tracked vessels by name (case-insensitive partial match). Useful for finding specific ships currently in the monitored area.",
    endpoint: {
      path: "/maritime/search",
      queryParams: ["q", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Vessel name search query (partial match)",
        },
        limit: {
          type: "integer",
          description: "Max results (default 20)",
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
      required: ["q"],
    },
  },
  {
    name: "get_vessels_in_area",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description:
      "Get all tracked vessels within a geographic bounding box. Useful for monitoring ship traffic in a specific sea area, port, or strait.",
    endpoint: {
      path: "/maritime/area",
      queryParams: ["minLat", "maxLat", "minLng", "maxLng", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        minLat: {
          type: "number",
          description: "Southern boundary latitude (e.g. 48.0)",
        },
        maxLat: {
          type: "number",
          description: "Northern boundary latitude (e.g. 50.0)",
        },
        minLng: {
          type: "number",
          description: "Western boundary longitude (e.g. -125.0)",
        },
        maxLng: {
          type: "number",
          description: "Eastern boundary longitude (e.g. -122.0)",
        },
        limit: {
          type: "integer",
          description: "Max vessels to return (default 100)",
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
      required: ["minLat", "maxLat", "minLng", "maxLng"],
    },
  },
  {
    name: "get_ais_messages",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description:
      "Get recent raw AIS messages from the stream buffer. Each message includes vessel identification, position, and type-specific data (position reports, static data, safety broadcasts).",
    endpoint: {
      path: "/maritime/messages",
      queryParams: ["limit", "type"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Max messages to return (default 50)",
        },
        type: {
          type: "string",
          description:
            "Filter by AIS message type: PositionReport, ShipStaticData, StandardClassBPositionReport, ExtendedClassBPositionReport, SafetyBroadcastMessage, StandardSearchAndRescueAircraftReport, BaseStationReport",
        },
        ...fieldsParam(FIELDS.AIS_MESSAGES),
      },
    },
  },

  // ── Energy Domain (EIA) ──────────────────────────────────────
  {
    name: "get_energy_indicators",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description:
      "Get a curated snapshot of key U.S. energy indicators including gasoline prices, diesel prices, crude oil (WTI/Brent), natural gas prices and storage, average electricity price, coal production, and nuclear outage percentage. Data is sourced from the EIA API.",
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
    description:
      "Browse the EIA data catalog tree. Start with no route to see top-level categories (petroleum, electricity, natural-gas, coal, nuclear-outages, etc.), then drill down into sub-routes to discover available datasets, frequencies, and facets.",
    endpoint: {
      path: "/energy/browse",
      queryParams: ["route"],
    },
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description:
            "Data route path to browse (e.g. 'electricity', 'petroleum/pri', 'natural-gas/stor'). Leave empty for top-level categories.",
        },
        ...fieldsParam(FIELDS.EIA_BROWSE),
      },
    },
  },
  {
    name: "get_energy_facets",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description:
      "Get available facet values for an EIA data route. Use this to discover valid filter values (e.g. state IDs, sector IDs, product codes) before querying energy data.",
    endpoint: {
      path: "/energy/facets",
      queryParams: ["route", "facetId"],
    },
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description:
            "EIA data route (e.g. 'electricity/retail-sales', 'petroleum/pri/gnd')",
        },
        facetId: {
          type: "string",
          description:
            "Facet identifier (e.g. 'stateid', 'sectorid', 'product', 'duoarea')",
        },
        ...fieldsParam(FIELDS.EIA_FACETS),
      },
      required: ["route", "facetId"],
    },
  },
  {
    name: "search_energy",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description:
      "Query EIA energy data for a specific route with optional facet filters, date range, and frequency. Returns time-series data points. Use get_energy_catalog first to discover routes and get_energy_facets to find valid filter values.",
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
          description:
            "EIA data route (e.g. 'electricity/retail-sales', 'petroleum/pri/gnd', 'natural-gas/pri/sum')",
        },
        frequency: {
          type: "string",
          description:
            "Data frequency: 'daily', 'weekly', 'monthly', 'quarterly', 'annual'",
        },
        start: {
          type: "string",
          description: "Start period (e.g. '2024-01', '2024')",
        },
        end: {
          type: "string",
          description: "End period (e.g. '2024-12', '2025')",
        },
        sort: {
          type: "string",
          description:
            "Sort column and direction (e.g. 'period:desc', 'value:asc')",
        },
        length: {
          type: "integer",
          description: "Max rows to return (default 100, max 5000)",
        },
        offset: {
          type: "integer",
          description: "Pagination offset (default 0)",
        },
      },
      required: ["route"],
    },
  },
  {
    name: "get_electricity_retail_sales",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description:
      "Get U.S. electricity retail sales data including price (cents/kWh), revenue, sales volume, and customer counts. Filter by state and sector (residential, commercial, industrial, transportation).",
    endpoint: {
      path: "/energy/electricity/retail-sales",
      queryParams: ["state", "sector", "frequency", "start", "end", "length"],
    },
    parameters: {
      type: "object",
      properties: {
        state: {
          type: "string",
          description:
            "State code (e.g. 'CA', 'TX', 'NY') or 'US' for national",
        },
        sector: {
          type: "string",
          description:
            "Sector: 'RES' (residential), 'COM' (commercial), 'IND' (industrial), 'TRA' (transportation), 'ALL' (total)",
        },
        frequency: {
          type: "string",
          description:
            "Data frequency: 'monthly', 'quarterly', 'annual' (default: monthly)",
        },
        start: {
          type: "string",
          description: "Start period (e.g. '2024-01')",
        },
        end: {
          type: "string",
          description: "End period (e.g. '2024-12')",
        },
        length: {
          type: "integer",
          description: "Max rows (default 50)",
        },
      },
    },
  },
  {
    name: "get_petroleum_prices",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description:
      "Get U.S. petroleum/gasoline prices including regular, midgrade, premium, and diesel retail prices. Filter by product type and geographic area.",
    endpoint: {
      path: "/energy/petroleum/prices",
      queryParams: ["product", "area", "frequency", "start", "end", "length"],
    },
    parameters: {
      type: "object",
      properties: {
        product: {
          type: "string",
          description:
            "Product code (e.g. 'EPM0' for regular gasoline, 'EPD2DXL0' for diesel)",
        },
        area: {
          type: "string",
          description:
            "Geographic area code (e.g. 'NUS' for U.S., 'R10' for PADD 1)",
        },
        frequency: {
          type: "string",
          description: "Data frequency: 'weekly', 'monthly' (default: weekly)",
        },
        start: {
          type: "string",
          description: "Start period (e.g. '2024-01-01')",
        },
        end: {
          type: "string",
          description: "End period",
        },
        length: {
          type: "integer",
          description: "Max rows (default 50)",
        },
      },
    },
  },
  {
    name: "get_natural_gas_prices",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description:
      "Get U.S. natural gas prices. Filter by process type and geographic area.",
    endpoint: {
      path: "/energy/natural-gas/prices",
      queryParams: ["process", "area", "frequency", "start", "end", "length"],
    },
    parameters: {
      type: "object",
      properties: {
        process: {
          type: "string",
          description: "Process type (e.g. 'FRC' for futures contract 1)",
        },
        area: {
          type: "string",
          description: "Geographic area code",
        },
        frequency: {
          type: "string",
          description:
            "Data frequency: 'daily', 'weekly', 'monthly', 'annual' (default: monthly)",
        },
        start: {
          type: "string",
          description: "Start period (e.g. '2024-01')",
        },
        end: {
          type: "string",
          description: "End period",
        },
        length: {
          type: "integer",
          description: "Max rows (default 50)",
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
    description:
      "Read the content of a file from the local filesystem. Returns numbered lines for easy reference. Supports optional line range selection for targeted reading of large files. Use this to inspect code, understand context, or identify where to make changes. Maximum 800 lines per read — use startLine/endLine for large files.",
    endpoint: {
      method: "POST",
      path: "/agentic/file/read",
      bodyParams: ["path", "startLine", "endLine"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Absolute path to the file to read. Must be within the allowed workspace roots.",
        },
        startLine: {
          type: "integer",
          description:
            "Optional 1-indexed start line (inclusive). Use with endLine to read a specific portion of a large file.",
        },
        endLine: {
          type: "integer",
          description:
            "Optional 1-indexed end line (inclusive). Maximum 800 lines will be returned per read.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    dataSource: compute("sandboxed fs"),
    description:
      "Create a new file or overwrite an existing file with the provided content. Parent directories are created automatically. Use this for creating new files — for targeted edits to existing files, prefer str_replace_file instead (it's safer and more token-efficient). Maximum file size: 5 MB.",
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
          description:
            "Absolute path for the file to create/overwrite. Must be within allowed workspace roots.",
        },
        content: {
          type: "string",
          description: "The complete file content to write.",
        },
        createDirs: {
          type: "boolean",
          description:
            "Create parent directories if they don't exist (default: true).",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "str_replace_file",
    dataSource: compute("sandboxed fs"),
    description:
      "Perform a targeted string replacement in a file. Finds the exact 'oldStr' and replaces it with 'newStr'. The oldStr must match EXACTLY (including whitespace and indentation). This is the preferred method for editing existing files — it's safer than write_file because it can't accidentally overwrite the entire file, and it's more token-efficient. If multiple occurrences are found and allowMultiple is false, it returns an error asking you to provide more context for a unique match.",
    endpoint: {
      method: "POST",
      path: "/agentic/file/str-replace",
      bodyParams: ["path", "oldStr", "newStr", "allowMultiple"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to edit.",
        },
        oldStr: {
          type: "string",
          description:
            "The exact string to find and replace. Must match the file content exactly, including whitespace, indentation, and line breaks. Include enough surrounding context to ensure a unique match.",
        },
        newStr: {
          type: "string",
          description:
            "The replacement string. This replaces the oldStr entirely.",
        },
        allowMultiple: {
          type: "boolean",
          description:
            "If true, replace ALL occurrences of oldStr. If false (default), error if multiple matches are found.",
        },
      },
      required: ["path", "oldStr", "newStr"],
    },
  },
  {
    name: "block_replace_file",
    dataSource: compute("sandboxed fs"),
    description:
      "Perform a highly precise, line-bounded block replacement in a file. It searches for 'targetContent' within the exact line range [startLine, endLine] (1-indexed, inclusive). The targetContent must match the file content in that range EXACTLY, including leading and trailing whitespace and line breaks. Returns an error if the content in that range doesn't match targetContent, and outputs a numbered line preview of the actual content inside the range to help you self-correct. This is the safest way to modify a contiguous block of text without affecting the rest of the file.",
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
          description: "Absolute path to the file to edit.",
        },
        startLine: {
          type: "integer",
          description:
            "The 1-indexed starting line number of the block to edit.",
        },
        endLine: {
          type: "integer",
          description:
            "The 1-indexed ending line number of the block to edit (inclusive).",
        },
        targetContent: {
          type: "string",
          description:
            "The exact string to be replaced. Must match the file content within the startLine and endLine range exactly.",
        },
        replacementContent: {
          type: "string",
          description:
            "The replacement content to insert in place of the targetContent.",
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
    name: "multi_replace_file",
    dataSource: compute("sandboxed fs"),
    description:
      "Perform multiple, non-contiguous block replacements in a single file atomically. The operations are processed from bottom-to-top to ensure that modifications do not shift the line numbers for subsequent chunks. Each chunk defines a range and targetContent, similar to block_replace_file. Use this tool ONLY when making multiple separate, non-adjacent modifications in a single file.",
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
          description: "Absolute path to the file to edit.",
        },
        chunks: {
          type: "array",
          description: "An array of replacement chunks to apply.",
          items: {
            type: "object",
            properties: {
              startLine: {
                type: "integer",
                description:
                  "The 1-indexed starting line number of this chunk.",
              },
              endLine: {
                type: "integer",
                description:
                  "The 1-indexed ending line number of this chunk (inclusive).",
              },
              targetContent: {
                type: "string",
                description:
                  "The exact string to find in this range. Must match the file content within the range exactly.",
              },
              replacementContent: {
                type: "string",
                description: "The replacement content for this chunk.",
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
    description:
      "Apply a unified diff patch to a file. Useful for complex, multi-hunk edits where str_replace_file would require multiple calls. The patch must be in standard unified diff format (as produced by 'diff -u' or git). The file content must match the diff context lines for the patch to apply.",
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
          description: "Absolute path to the file to patch.",
        },
        patch: {
          type: "string",
          description:
            "A unified diff string (standard diff -u format). Must include @@ hunk headers and context lines that match the current file content.",
        },
      },
      required: ["path", "patch"],
    },
  },
  {
    name: "list_directory",
    dataSource: compute("sandboxed fs"),
    description:
      "List the contents of a directory, showing all files and subdirectories with metadata (name, size, type). Use this to explore project structure, find files, or understand codebase organization. Results are capped at 500 entries. Supports recursive listing with configurable depth.",
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
          description: "Absolute path to the directory to list.",
        },
        recursive: {
          type: "boolean",
          description:
            "If true, list contents recursively (default: false). Use with maxDepth to control depth.",
        },
        maxDepth: {
          type: "integer",
          description:
            "Maximum recursion depth when recursive=true (default: 3, max: 5).",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "grep_search",
    dataSource: compute("sandboxed fs"),
    description:
      "Search for a literal string or regex pattern across files in a directory. Returns matching lines with file paths and line numbers. Use this to find function definitions, usage patterns, imports, variable references, or any text across the codebase. Automatically skips node_modules, .git, and binary files. Results capped at 50 matches.",
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
          description:
            "The search pattern — a literal string or regex. Use isRegex=true for regex mode.",
        },
        searchPath: {
          type: "string",
          description: "Absolute path to search in (file or directory).",
        },
        isRegex: {
          type: "boolean",
          description:
            "If true, treat pattern as a regular expression. If false (default), treat as a literal string.",
        },
        includes: {
          type: "array",
          items: { type: "string" },
          description:
            "Glob patterns to filter files (e.g. ['*.js', '*.ts']). Only files matching these patterns will be searched.",
        },
        caseInsensitive: {
          type: "boolean",
          description:
            "If true, perform case-insensitive search (default: false).",
        },
        matchPerLine: {
          type: "boolean",
          description:
            "If true (default), return each matching line with file and line number. If false, return only the names of matching files.",
        },
      },
      required: ["pattern", "searchPath"],
    },
  },
  {
    name: "glob_files",
    dataSource: compute("sandboxed fs"),
    description:
      "Find files by name pattern using glob syntax. Supports *, **, and ? wildcards. Use this to find files by extension, naming convention, or path pattern. Automatically skips node_modules and .git. Results capped at 200 matches.",
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
          description:
            "Glob pattern to match filenames (e.g. '*.test.js', '**/*.css', 'README*'). Supports * (any except /), ** (any including /), ? (single char).",
        },
        searchPath: {
          type: "string",
          description: "Absolute path to the root directory to search from.",
        },
      },
      required: ["pattern", "searchPath"],
    },
  },
  {
    name: "read_web_page",
    dataSource: onDemand("HTTP fetch"),
    description:
      "Fetch content from a URL via HTTP request. Automatically converts HTML pages to clean markdown, strips scripts/styles/navigation, and extracts the main content. JSON responses are returned formatted. Use this to read documentation, web pages, and API responses. Supports optional CSS selector to extract specific page sections. Maximum output: 100,000 characters.",
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
          description: "The URL to fetch (must be http or https).",
        },
        selector: {
          type: "string",
          description:
            "Optional CSS selector to extract specific content from the page (e.g. 'article', '.main-content', '#docs'). If omitted, the tool automatically finds the main content area.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_pdf",
    dataSource: onDemand("pdf-parse"),
    description:
      "Download a PDF from a URL and extract its text content to allow reading PDFs for models that do not support PDF input modality natively. Supports optional maxPages and maxChars parameters to control download and extraction limits. Maximum output text length is 100,000 characters by default.",
    endpoint: {
      method: "POST",
      path: "/agentic/web/pdf-read",
      bodyParams: ["url", "maxPages", "maxChars"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the PDF to download and read (must be http or https).",
        },
        maxPages: {
          type: "integer",
          description: "Optional maximum number of pages to extract from the PDF.",
        },
        maxChars: {
          type: "integer",
          description: "Optional maximum characters of text to return (default: 100,000).",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_docx",
    dataSource: onDemand("mammoth"),
    description:
      "Download a DOCX (Microsoft Word) file from a URL and extract its content as clean markdown or plain text. Useful for reading Word documents, reports, and formatted documents that agents cannot process natively. Supports markdown output (preserving headings, bold, italic, lists, tables) or plain text extraction. Maximum output: 100,000 characters.",
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
          description: "The URL of the DOCX file to download and read (must be http or https).",
        },
        maxChars: {
          type: "integer",
          description: "Optional maximum characters of text to return (default: 100,000).",
        },
        outputFormat: {
          type: "string",
          description: "Output format: 'markdown' (default, preserves formatting) or 'text' (plain text only).",
          enum: ["markdown", "text"],
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_spreadsheet",
    dataSource: onDemand("exceljs"),
    description:
      "Download a spreadsheet file (Excel .xlsx/.xls or CSV/TSV) from a URL and extract its tabular data as structured JSON, markdown tables, or CSV text. Supports multi-sheet workbooks, header detection, row limiting, and sheet selection. Use this to read data files, reports, and tabular documents. Maximum 1,000 rows per sheet, 100,000 characters total output.",
    endpoint: {
      method: "POST",
      path: "/agentic/web/spreadsheet-read",
      bodyParams: ["url", "maxRows", "maxChars", "sheet", "includeHeaders", "outputFormat"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the spreadsheet file to download and read (must be http or https). Supports .xlsx, .xls, .csv, and .tsv formats.",
        },
        maxRows: {
          type: "integer",
          description: "Maximum number of data rows to extract per sheet (default: 1000).",
        },
        maxChars: {
          type: "integer",
          description: "Maximum characters of total output to return (default: 100,000).",
        },
        sheet: {
          type: "string",
          description: "Specific sheet to extract — by name (e.g. 'Sheet1') or 0-based index (e.g. '0'). If omitted, all sheets are extracted.",
        },
        includeHeaders: {
          type: "boolean",
          description: "If true (default), treat the first row as column headers and return data rows as objects keyed by header values. If false, return raw arrays.",
        },
        outputFormat: {
          type: "string",
          description: "Output format: 'json' (default, structured objects), 'markdown' (pipe-delimited tables), or 'csv' (raw CSV text).",
          enum: ["json", "markdown", "csv"],
        },
      },
      required: ["url"],
    },
  },
  {
    name: "search_web",
    dataSource: onDemand("Brave Search / Google CSE"),
    description:
      "Search the web using Brave Search (primary, whole-web) with Google Custom Search fallback. Returns results with titles, URLs, and snippets. Use this for researching topics, finding documentation, looking up current information, or verifying facts. Supports date filtering and site-specific search.",
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
          description: "The search query.",
        },
        limit: {
          type: "integer",
          description:
            "Maximum number of results to return (default: 5, max: 10).",
        },
        dateRestrict: {
          type: "string",
          description:
            "Restrict results by age. Examples: 'd7' (past 7 days), 'w2' (past 2 weeks), 'm1' (past month), 'y1' (past year).",
        },
        siteSearch: {
          type: "string",
          description:
            "Restrict search to a specific domain (e.g. 'stackoverflow.com', 'developer.mozilla.org').",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "multi_file_read",
    dataSource: compute("sandboxed fs"),
    description:
      "Read multiple files in a single call. Returns numbered lines for each file. Much more efficient than calling read_file multiple times — use this when you need to read 2-20 files for context (e.g. a component, its CSS module, and the service it imports). Each file supports optional line range selection. Maximum 20 files per batch, 800 lines per file.",
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
              path: {
                type: "string",
                description: "Absolute path to the file.",
              },
              startLine: {
                type: "integer",
                description: "Optional 1-indexed start line.",
              },
              endLine: {
                type: "integer",
                description: "Optional 1-indexed end line.",
              },
            },
            required: ["path"],
          },
          description: "Array of file read requests. Maximum 20 files.",
        },
      },
      required: ["files"],
    },
  },
  {
    name: "file_info",
    dataSource: compute("sandboxed fs"),
    description:
      "Get metadata about one or more files without reading their content. Returns: exists, isFile, isDirectory, sizeBytes, lines, lastModified, extension, isBinary. Use this to check if files exist, determine file sizes, or inspect metadata before deciding whether to read the full content. Supports batch queries (up to 20 paths).",
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
          description: "Absolute path to inspect. Use this for a single file.",
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of absolute paths to inspect (max 20). Use this for batch queries instead of 'path'.",
        },
      },
      required: [],
    },
  },
  {
    name: "file_diff",
    dataSource: compute("sandboxed fs + diff"),
    description:
      "Generate a unified diff between two files, or between a file and provided content. Returns additions/deletions counts and the unified diff output. Use this to compare file versions, review changes before committing, or verify that edits had the intended effect.",
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
          description:
            "Absolute path to the first file (the 'old' side of the diff).",
        },
        pathB: {
          type: "string",
          description:
            "Absolute path to the second file (the 'new' side). Use this OR 'content', not both.",
        },
        content: {
          type: "string",
          description:
            "Content string to diff against pathA. Use this OR 'pathB', not both.",
        },
        contextLines: {
          type: "integer",
          description:
            "Number of context lines in the diff output (default: 3, max: 10).",
        },
      },
      required: ["pathA"],
    },
  },
  {
    name: "move_file",
    dataSource: compute("sandboxed fs"),
    description:
      "Move or rename a file within the allowed workspace. Parent directories at the destination are created automatically. The destination must not already exist. Use this for refactoring operations like renaming component files or reorganizing project structure.",
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
          description: "Absolute path of the file to move/rename.",
        },
        destination: {
          type: "string",
          description: "Absolute path of the new location/name.",
        },
        createDirs: {
          type: "boolean",
          description:
            "Create parent directories at destination if needed (default: true).",
        },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "delete_file",
    dataSource: compute("sandboxed fs"),
    description:
      "Delete a file or directory from the allowed workspace. Returns the file size that was deleted (or 0 for directories). Use this when cleaning up generated files, removing folders, or deleting obsolete code.",
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
          description: "Absolute path of the file or directory to delete.",
        },
        recursive: {
          type: "boolean",
          description:
            "If true, recursively delete a directory and all of its contents. If false (default), only delete individual files.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "run_command",
    dataSource: compute("sandboxed subprocess"),
    description:
      "Execute a command in a workspace subprocess. Supports any shell or terminal command (e.g. running tests, compiling, starting dev servers, package management, workspace file/directory organization, administrative operations). The working directory must be within the allowed workspace. Timeout default: 60s, max: 120s. For dev servers and long-running watchers, set run_in_background: true — the command will start, collect ~2.5s of initial output, then return immediately with a process ID while the server continues running. Commands that exceed the timeout without run_in_background are also auto-backgrounded instead of killed.",
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
          description: "The command to execute.",
        },
        cwd: {
          type: "string",
          description:
            "Absolute path of the working directory. Must be within allowed workspace roots.",
        },
        timeout: {
          type: "integer",
          description: "Timeout in milliseconds (default: 60000, max: 120000).",
        },
        run_in_background: {
          type: "boolean",
          description:
            "Set to true to run this command in the background. The command starts, collects ~2.5 seconds of initial output (so you can verify it started correctly), then returns immediately with a process ID while the command continues running. Use this for dev servers (npm run dev, next dev, vite), watchers, or any long-running process that doesn't terminate on its own.",
        },
      },
      required: ["command", "cwd"],
    },
  },
  {
    name: "project_summary",
    dataSource: compute("fs scan"),
    description:
      "Scan a project directory and return structured metadata: package.json info (scripts, dependencies, frameworks), directory structure, entry points, config files, and README excerpt. Use this as the FIRST tool when starting work on a new project to understand its structure and technology stack in a single call, instead of multiple list_directory + read_file calls.",
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
          description: "Absolute path to the project root directory.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "git",
    dataSource: compute("git subprocess"),
    description:
      "Run git operations on a repository. Actions: 'status' (branch, staged/unstaged/untracked files), 'diff' (show changes — optionally staged, specific file, or against a ref), 'log' (commit history — filter by author, date, file).",
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
          description: "Git operation",
          enum: ["status", "diff", "log"],
        },
        path: { type: "string", description: "Absolute path to the repo root" },
        staged: {
          type: "boolean",
          description: "Show staged changes only (diff)",
        },
        file: {
          type: "string",
          description: "Specific file to diff or filter log",
        },
        ref: { type: "string", description: "Git ref to diff against" },
        limit: {
          type: "number",
          description: "Max commits (log, default: 10)",
        },
        author: { type: "string", description: "Filter by author (log)" },
        since: {
          type: "string",
          description: "Since date, e.g. '2 weeks ago' (log)",
        },
      },
      required: ["action", "path"],
    },
  },
  {
    name: "browser_action",
    dataSource: compute("headless Chromium (Playwright)"),
    description:
      "Control a headless Chromium browser for web automation, E2E testing, visual QA, and interacting with JavaScript-rendered pages that read_web_page cannot handle. Each call performs ONE action. The browser session persists between calls (same sessionId) so you can build multi-step flows.\n\n" +
      "RECOMMENDED WORKFLOW: navigate → snapshot → click_ref/type_ref. The 'snapshot' action returns an ARIA accessibility tree (roles, names, states) which is ~4x more token-efficient than screenshots. It outputs elements like: heading \"Title\" [level=1], button \"Submit\", textbox \"Search\". Use 'click_ref' or 'type_ref' with a 'role:name' ref string (e.g. ref=\"button:Submit\") to interact with elements from the snapshot — no CSS selectors needed.\n\n" +
      "ALTERNATIVE WORKFLOW: navigate → get_elements → click/type (uses CSS selectors instead of ARIA refs).\n\n" +
      "For complex multi-step browser automation, use the 'browser_script' tool instead — it executes a full Playwright script in a single call. Sessions auto-close after 5 minutes of inactivity.",
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
          description:
            "The browser action to perform. SNAPSHOT FLOW: 'snapshot' (get ARIA accessibility tree — preferred over screenshot for page understanding), 'click_ref' (click element by role:name ref), 'type_ref' (type into element by ref), 'hover_ref' (hover element by ref), 'select_ref' (select dropdown option by ref). SELECTOR FLOW: 'click' (click by CSS selector), 'type' (type by CSS selector), 'get_elements' (discover interactive elements). GENERAL: 'navigate' (go to URL), 'screenshot' (capture viewport as image), 'scroll' (scroll page), 'evaluate' (run JS), 'get_content' (extract text/HTML), 'wait' (wait for element/time), 'run_script' (execute Playwright script), 'close' (end session).",
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
          description:
            "Optional session identifier for reusing the same browser page across calls. Defaults to 'default'. Use distinct IDs for parallel browser tasks.",
        },
        url: {
          type: "string",
          description: "URL to navigate to (required for 'navigate' action).",
        },
        selector: {
          type: "string",
          description:
            "CSS selector targeting an element (used by 'click', 'type', 'screenshot', 'scroll', 'get_content', 'wait', 'snapshot').",
        },
        ref: {
          type: "string",
          description:
            "Element ref from an ARIA snapshot, formatted as 'role:name' (e.g. 'button:Submit', 'link:Home', 'textbox:Search'). Used by 'click_ref', 'type_ref', 'hover_ref', 'select_ref' actions. Get these from the 'snapshot' action output.",
        },
        text: {
          type: "string",
          description:
            "Text to type (required for 'type' and 'type_ref' actions).",
        },
        value: {
          type: "string",
          description:
            "Option value to select (required for 'select_ref' action).",
        },
        pressEnter: {
          type: "boolean",
          description:
            "If true, press Enter after typing (for 'type' and 'type_ref' actions). Useful for submitting search forms.",
        },
        fullPage: {
          type: "boolean",
          description:
            "If true, capture the full scrollable page instead of just the viewport (for 'screenshot' action).",
        },
        direction: {
          type: "string",
          description:
            "Scroll direction: 'up' or 'down' (for 'scroll' action, default: 'down').",
        },
        amount: {
          type: "integer",
          description: "Pixels to scroll (for 'scroll' action, default: 500).",
        },
        expression: {
          type: "string",
          description:
            "JavaScript expression to evaluate in the page context (for 'evaluate' action). The return value is serialized to JSON.",
        },
        format: {
          type: "string",
          description:
            "Content format: 'text' (default) or 'html' (for 'get_content' action).",
        },
        timeout: {
          type: "integer",
          description:
            "Timeout in milliseconds (for 'wait' and 'run_script' actions, default: 10000/60000, max: 30000/120000).",
        },
        state: {
          type: "string",
          description:
            "Element state to wait for: 'visible' (default), 'hidden', 'attached', 'detached' (for 'wait' action).",
        },
        limit: {
          type: "integer",
          description:
            "Maximum number of elements to return (for 'get_elements' action, default: 50, max: 100).",
        },
        script: {
          type: "string",
          description:
            "Playwright script body to execute (for 'run_script' action). The script runs inside an async IIFE with 'browser', 'context', and 'page' already available. Use logger.info() for output. Example: await page.goto('https://example.com'); logger.info(await page.title());",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "browser_script",
    dataSource: compute("headless Chromium (Playwright subprocess)"),
    description:
      "Write and execute a complete Playwright script for complex multi-step browser automation that would be too many round-trips with browser_action. The script runs in a Node.js subprocess connected to the existing headless browser session.\n\n" +
      "The script body executes inside an async context with 'browser', 'context', and 'page' already initialized. Use logger.info() to return data. " +
      "Use this for: scraping multi-page data, filling complex forms with validation, running E2E test sequences, browser-based data extraction pipelines, or any workflow requiring 3+ sequential browser actions.\n\n" +
      "Example script:\n" +
      "await page.goto('https://news.ycombinator.com');\n" +
      "const titles = await page.$$eval('.titleline > a', els => els.slice(0,10).map(e => e.textContent));\n" +
      "logger.info(JSON.stringify(titles, null, 2));",
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
          description:
            "The Playwright script body. Runs inside async IIFE with 'browser', 'context', 'page' pre-initialized. Use standard Playwright API: page.goto(), page.click(), page.fill(), page.$$eval(), page.locator(), etc. Use logger.info() to output results.",
        },
        sessionId: {
          type: "string",
          description:
            "Optional session identifier. The script connects to the existing browser and uses the first available page, or creates a new one.",
        },
        timeout: {
          type: "integer",
          description:
            "Script execution timeout in milliseconds (default: 60000, max: 120000).",
        },
      },
      required: ["script"],
    },
  },

  // ── LSP Code Intelligence ────────────────────────────────
  {
    name: "lsp_action",
    dataSource: compute("LSP server (stdio JSON-RPC)"),
    description:
      "Interact with Language Server Protocol (LSP) servers for precise, compiler-grade code intelligence. " +
      "Use this instead of grep_search when you need EXACT semantic information about symbols — it understands " +
      "types, scopes, and cross-file relationships that text search cannot. Supports JavaScript, TypeScript, Python, Rust, Go, C/C++, and Lua. " +
      "Servers start lazily on first request (may take a few seconds). Provide 1-based line and character positions.\n\n" +
      "Operations:\n" +
      "• goToDefinition — Jump to where a symbol (function, variable, class, import) is defined. Returns file path and line.\n" +
      "• findReferences — Find ALL usages of a symbol across the entire workspace. Returns list of locations.\n" +
      "• hover — Get the type signature, documentation, and inferred type of a symbol at a position.\n" +
      "• documentSymbol — Get an outline of all symbols (functions, classes, variables, exports) in a file. Does NOT require line/character.\n" +
      "• goToImplementation — Find concrete implementations of an interface, abstract class, or overridden method.",
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
          description:
            "The LSP operation to perform. Use 'goToDefinition' to find where something is defined, " +
            "'findReferences' to find all usages, 'hover' for type info, 'documentSymbol' for file outline, " +
            "'goToImplementation' for concrete implementations.",
        },
        filePath: {
          type: "string",
          description: "Absolute path to the source file to query.",
        },
        line: {
          type: "integer",
          description:
            "Line number (1-based) of the symbol to query. Required for all operations except 'documentSymbol'.",
        },
        character: {
          type: "integer",
          description:
            "Character offset (1-based) within the line. Position the cursor ON the symbol name. " +
            "Required for all operations except 'documentSymbol'.",
        },
        workspacePath: {
          type: "string",
          description:
            "Optional workspace root path. If omitted, auto-detected from the file's location within allowed roots.",
        },
      },
      required: ["operation", "filePath"],
    },
  },

  // ── Task Management ───────────────────────────────────────
  {
    name: "create_task",
    dataSource: compute("MongoDB agent_tasks"),
    description:
      "Create a persistent task to track a work item across agentic iterations. Tasks survive context window " +
      "truncation and memory consolidation, providing reliable Working Memory for complex multi-step workflows. " +
      "Use this when starting a complex task to maintain a checklist of sub-goals, track progress on multi-file " +
      "refactors, or record items that must not be forgotten if context is lost. Returns the created task with a " +
      "unique numeric ID.",
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
          description:
            "A brief title for the task (e.g. 'Migrate auth middleware to JWT').",
        },
        description: {
          type: "string",
          description: "Detailed description of what needs to be done.",
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed"],
          description: "Initial status (default: 'pending').",
        },
        activeForm: {
          type: "string",
          description:
            "Present continuous form shown as spinner text when in_progress (e.g. 'Running tests', 'Refactoring auth module').",
        },
        metadata: {
          type: "object",
          description:
            "Optional arbitrary key-value metadata to attach to the task.",
        },
      },
      required: ["subject", "description"],
    },
  },
  {
    name: "list_tasks",
    dataSource: compute("MongoDB agent_tasks"),
    description:
      "List all tasks for a project, optionally filtered by status. Returns tasks sorted by ID with a summary " +
      "showing counts per status (pending, in_progress, completed). Use this at the start of a new agentic " +
      "session to recall what was previously in progress, or after completing a batch of work to audit remaining items.",
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
          description: "Optional filter — only return tasks with this status.",
        },
        limit: {
          type: "integer",
          description:
            "Maximum number of tasks to return (default: 50, max: 200).",
        },
      },
      required: [],
    },
  },
  {
    name: "get_task",
    dataSource: compute("MongoDB agent_tasks"),
    description:
      "Get a single task by its numeric ID. Returns the full task document including subject, description, " +
      "status, metadata, and timestamps. Use this to check the current state of a specific task before updating it, " +
      "or to retrieve detailed metadata attached to a task.",
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
          description: "The numeric ID of the task to retrieve.",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "update_task",
    dataSource: compute("MongoDB agent_tasks"),
    description:
      "Update an existing task's status, subject, description, or metadata. Use this to mark tasks as " +
      "'in_progress' when you start working on them, 'completed' when done, or to refine the description " +
      "as your understanding of the task evolves. Metadata is merged (not replaced) — you can incrementally " +
      "add key-value pairs without losing existing metadata.",
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
          description: "The numeric ID of the task to update.",
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "deleted"],
          description:
            "New status for the task. Setting 'deleted' removes the task entirely.",
        },
        subject: {
          type: "string",
          description: "Updated title for the task.",
        },
        description: {
          type: "string",
          description: "Updated description of what needs to be done.",
        },
        activeForm: {
          type: "string",
          description:
            "Present continuous form shown as spinner text when in_progress (e.g. 'Running tests', 'Migrating schemas').",
        },
        metadata: {
          type: "object",
          description: "Key-value pairs to merge into existing task metadata.",
        },
      },
      required: ["taskId"],
    },
  },

  // ── Memory Persistence ────────────────────────────────────
  {
    name: "upsert_memory",
    dataSource: compute("Prism MemoryService"),
    description:
      "Persist a piece of information to long-term agent memory. Call this tool in TWO cases:\n" +
      "1. **Explicit requests**: The user says 'remember', 'save', 'note', 'store', 'keep in mind', or 'don't forget'.\n" +
      "2. **Implicit preference signals**: The user reveals a personal preference, opinion, or fact about themselves — " +
      "even without asking you to remember it. Trigger words/patterns include: 'I like ...', 'I love ...', 'I hate ...', " +
      "'I dislike ...', 'I prefer ...', 'I enjoy ...', 'I can\\'t stand ...', 'I always ...', 'I never ...', " +
      "'my favorite ...', 'I\\'m allergic to ...', 'I\\'m a ... person', or any statement expressing a personal taste, " +
      "habit, identity trait, or strong opinion. When in doubt, SAVE IT — over-remembering is better than forgetting.\n\n" +
      "Memories are deduplicated automatically — calling this with content that already exists is safe and will " +
      "not create duplicates. Returns the stored memory document or null if a near-duplicate was detected.",
    endpoint: {
      method: "POST",
      path: "/agentic/memory/upsert",
      bodyParams: ["content", "type", "title"],
    },
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "The memory content to persist. Should be a clear, self-contained statement " +
            "(e.g. 'User prefers tabs over spaces' or 'The auth service uses JWT with RS256').",
        },
        type: {
          type: "string",
          enum: ["user", "feedback", "project", "reference"],
          description:
            "Memory category. 'user' for personal preferences, 'feedback' for corrections/style guidance, " +
            "'project' for codebase conventions, 'reference' for technical facts. Defaults to 'project'.",
        },
        title: {
          type: "string",
          description:
            "Optional short label for the memory (e.g. 'Indentation preference'). " +
            "Improves discoverability during semantic search.",
        },
      },
      required: ["content"],
    },
  },

  // ── Communication (Twilio) ────────────────────────────────
  {
    name: "twilio_send_sms",
    dataSource: onDemand("Twilio"),
    description:
      "Send an SMS text message to a phone number. The recipient must be in E.164 international format (e.g. +14155551234). " +
      "Returns the message SID, delivery status, and metadata. Message body is limited to 1,600 characters.",
    endpoint: { path: "/communication/sms/send", method: "POST" },
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description:
            "Destination phone number in E.164 format (e.g. +14155551234)",
        },
        body: {
          type: "string",
          description: "The SMS message body text (max 1,600 characters)",
        },
        from: {
          type: "string",
          description:
            "Optional sender phone number in E.164 format. If omitted, uses the first available Twilio number on the account.",
        },
      },
      required: ["to", "body"],
    },
  },
  {
    name: "twilio_list_messages",
    dataSource: onDemand("Twilio"),
    description:
      "List recent SMS messages sent and received on the Twilio account. " +
      "Can filter by sender or recipient phone number. Returns message SIDs, bodies, statuses, and timestamps.",
    endpoint: {
      path: "/communication/sms/messages",
      queryParams: ["to", "from", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Filter by destination phone number (E.164 format)",
        },
        from: {
          type: "string",
          description: "Filter by sender phone number (E.164 format)",
        },
        limit: {
          type: "integer",
          description:
            "Maximum number of messages to return (default: 20, max: 100)",
        },
      },
    },
  },
  {
    name: "twilio_get_account",
    dataSource: onDemand("Twilio"),
    description:
      "Get Twilio account information including account SID, friendly name, status, " +
      "account type, balance, and currency. Useful for checking remaining credits.",
    endpoint: { path: "/communication/account" },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "twilio_lookup_number",
    dataSource: onDemand("Twilio Lookup v2"),
    description:
      "Look up detailed information about a phone number using Twilio Lookup API v2. " +
      "Returns the phone number's country code, national format, validity, carrier info, " +
      "and line type intelligence (mobile, landline, VoIP, etc.).",
    endpoint: { path: "/communication/lookup/:phone", pathParams: ["phone"] },
    parameters: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description:
            "Phone number to look up in E.164 format (e.g. +14155551234)",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "twilio_list_numbers",
    dataSource: onDemand("Twilio"),
    description:
      "List all phone numbers owned by the Twilio account. Returns phone number SIDs, " +
      "formatted numbers, friendly names, and capabilities (SMS, MMS, voice, fax).",
    endpoint: { path: "/communication/numbers" },
    parameters: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "get_emoji_combination",
    dataSource: cached("Google Emoji Kitchen", EMOJI_KITCHEN_INTERVAL_MS),
    description:
      "Combine two emojis to get their Google Emoji Kitchen mashup image. " +
      "Accepts emoji characters (e.g. '🐼', '❄️') or hex codepoint strings (e.g. '1f43c', '2744-fe0f'). " +
      "Returns the static PNG image URL, GBoard order, and metadata.",
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
          description:
            "The first emoji character or hex codepoint (e.g., '🐼' or '1f43c')",
        },
        right: {
          type: "string",
          description:
            "The second emoji character or hex codepoint (e.g., '❄️' or '2744-fe0f')",
        },
      },
      required: ["left", "right"],
    },
  },
  {
    name: "get_emoji_combinations",
    dataSource: cached("Google Emoji Kitchen", EMOJI_KITCHEN_INTERVAL_MS),
    description:
      "Get all supported GBoard Emoji Kitchen combinations for a single emoji. " +
      "Accepts an emoji character (e.g. '🐼') or a hex codepoint (e.g. '1f43c'). " +
      "Returns a list of other emojis it can combine with, along with their mashup image URLs.",
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
          description:
            "The emoji character or hex codepoint to check (e.g., '🐼' or '1f43c')",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of combinations to return (default: 50, max: 500)",
        },
      },
      required: ["emoji"],
    },
  },
  {
    name: "generate_image",

    dataSource: onDemand("Google Gemini via Prism"),
    description:
      "Generate or edit an image using AI image generation. " +
      "When reference images are attached in the conversation, they are automatically passed to the image model — " +
      "write a SHORT edit instruction (e.g. 'Redraw this with bigger eyes', 'Make this character blue'). " +
      "Do NOT re-describe the attached image; the model can already see it. " +
      "When NO reference images are attached, write a rich, detailed prompt from scratch. " +
      "The generated image will be delivered to the user automatically. " +
      "IMPORTANT: Do NOT call this tool unless the user's current message explicitly asks for an " +
      "image, drawing, painting, illustration, or artwork. Never call it for greetings, " +
      "questions, or casual conversation.",
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
          description:
            "When reference images are attached: write a SHORT edit instruction describing what to change " +
            "(e.g. 'Redraw this with bigger eyes', 'Make this pink'). Do NOT re-describe the image contents. " +
            "When NO images are attached: write a detailed prompt describing style, composition, subjects, " +
            "colors, mood, lighting, and artistic direction.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "describe_image",
    dataSource: onDemand("Google Gemini via Prism"),
    description:
      "Describe the visual contents of one or more images (avatars, banners, photos, etc.) " +
      "by URL. Returns a text description of each image. Use this when you need to understand " +
      "what someone looks like (their avatar or banner) before generating artwork, or when " +
      "you need to describe any image from a URL. IMPORTANT: Always batch ALL image URLs " +
      "into a single call — pass all URLs in the imageUrls array at once. " +
      "Never make multiple separate calls for individual URLs.",
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
          description:
            "Array of image URLs to describe. Can be Discord avatar URLs, " +
            "banner URLs, or any publicly accessible image URL.",
        },
        context: {
          type: "string",
          enum: ["avatar", "banner", "photo", "general"],
          description:
            "What kind of image this is, to tailor the description. " +
            "Use 'avatar' for profile pictures, 'banner' for profile banners, " +
            "'photo' for user-uploaded photos, 'general' for anything else.",
        },
      },
      required: ["imageUrls"],
    },
  },

  // ── Text-to-Speech ──────────────────────────────────────────
  {
    name: "text_to_speech",
    dataSource: onDemand("ElevenLabs / OpenAI via Prism"),
    description:
      "Convert text into spoken audio using a text-to-speech provider. Returns base64-encoded audio data. " +
      "Use this when the user asks you to read something aloud, narrate text, or generate audio from text. " +
      "Supports multiple voices and providers.",
    endpoint: {
      path: "/creative/text-to-speech",
      method: "POST",
      bodyParams: ["text", "voice", "provider", "model"],
    },
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "The text to convert to speech. Keep under 5000 characters for best results.",
        },
        voice: {
          type: "string",
          description:
            "Voice identifier (e.g. 'alloy', 'echo', 'shimmer' for OpenAI; ElevenLabs voice ID for ElevenLabs). Omit for default voice.",
        },
        provider: {
          type: "string",
          description: "TTS provider to use",
          enum: ["elevenlabs", "openai", "google"],
        },
        model: {
          type: "string",
          description: "Model name (optional — uses provider default)",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "create_vector_animation",
    dataSource: onDemand("Creative Vector Animation Engine"),
    description:
      "Create interactive, vector-based keyframe animations in HTML5 Canvas. " +
      "Supports multiple layers, shapes (rectangle, circle, ellipse, line, polygon, path, text), keyframes, " +
      "frame-by-frame animations, and shape/transform tweening (translation, scale, rotation, color, opacity) " +
      "along linear, Bezier curve, or custom paths. Subsequent calls with the same sessionId append/edit keyframes " +
      "to build complex animations incrementally.",
    endpoint: {
      method: "POST",
      path: "/creative/vector-animation",
      bodyParams: ["animation", "options", "sessionId"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Optional session ID to update/append to an existing animation sequence. If omitted, a new animation is started.",
        },
        options: {
          type: "object",
          properties: {
            loop: {
              type: "boolean",
              description: "Whether the animation should loop during playback (default: true).",
            },
            autoplay: {
              type: "boolean",
              description: "Whether playback should start automatically (default: true).",
            },
            title: {
              type: "string",
              description: "Optional title for the animation player window.",
            },
          },
        },
        animation: {
          type: "object",
          description: "The vector animation definition.",
          properties: {
            clearSession: {
              type: "boolean",
              description: "Optional. If true, clears the entire session animation state and resets it to this new input definition.",
            },
            width: {
              type: "integer",
              description: "Canvas width in pixels (default: 800, max: 1920).",
            },
            height: {
              type: "integer",
              description: "Canvas height in pixels (default: 600, max: 1080).",
            },
            duration: {
              type: "number",
              description: "Total duration of the animation in seconds (default: 5.0).",
            },
            fps: {
              type: "integer",
              description: "Frames per second for calculation (default: 24, range: 12-60).",
            },
            background: {
              type: "string",
              description: "Canvas background color (CSS value, default: '#0f172a').",
            },
            layers: {
              type: "array",
              description: "List of animated vector layers/objects.",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier for this layer.",
                  },
                  action: {
                    type: "string",
                    enum: ["delete"],
                    description: "Optional. Set to 'delete' to remove this layer from the session.",
                  },
                  replaceKeyframes: {
                    type: "boolean",
                    description: "Optional. If true, overwrites all keyframes of the layer instead of merging them.",
                  },
                  shapeType: {
                    type: "string",
                    enum: ["rectangle", "circle", "ellipse", "line", "polygon", "path", "text"],
                    description: "The type of shape rendered by this layer.",
                  },
                  shapeData: {
                    type: "object",
                    description: "Static properties of the shape (e.g. {width: 100, height: 100} for rectangle, {radius: 50} for circle, {points: [[0,0], [50,100], [100,0]]} for polygon, {path: 'M 10 10 L 90 90'} for path, {text: 'hello'} for text).",
                  },
                  fillColor: {
                    anyOf: [
                      {
                        type: "string",
                        description: "Default fill color (CSS color, e.g. '#ef4444', 'rgba(0,0,0,0.5)', 'transparent').",
                      },
                      {
                        type: "object",
                        description: "Linear or radial gradient fill definition.",
                        properties: {
                          type: {
                            type: "string",
                            enum: ["linear", "radial"],
                          },
                          x1: { type: "number", description: "X coordinate of linear end point or radial end center." },
                          y1: { type: "number", description: "Y coordinate of linear end point or radial end center." },
                          x2: { type: "number", description: "X coordinate of linear end point." },
                          y2: { type: "number", description: "Y coordinate of linear end point." },
                          x0: { type: "number", description: "X coordinate of radial start center." },
                          y0: { type: "number", description: "Y coordinate of radial start center." },
                          r0: { type: "number", description: "Radius of radial start circle." },
                          r1: { type: "number", description: "Radius of radial end circle." },
                          stops: {
                            type: "array",
                            description: "Color stops for the gradient.",
                            items: {
                              type: "object",
                              properties: {
                                offset: { type: "number", description: "Stop position from 0.0 to 1.0." },
                                color: { type: "string", description: "CSS color string." },
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
                        description: "Default stroke/outline color (CSS color, e.g. '#ffffff', 'rgba(255,255,255,0.8)', 'transparent').",
                      },
                      {
                        type: "object",
                        description: "Linear or radial gradient stroke/outline definition.",
                        properties: {
                          type: {
                            type: "string",
                            enum: ["linear", "radial"],
                          },
                          x1: { type: "number", description: "X coordinate of linear end point or radial end center." },
                          y1: { type: "number", description: "Y coordinate of linear end point or radial end center." },
                          x2: { type: "number", description: "X coordinate of linear end point." },
                          y2: { type: "number", description: "Y coordinate of linear end point." },
                          x0: { type: "number", description: "X coordinate of radial start center." },
                          y0: { type: "number", description: "Y coordinate of radial start center." },
                          r0: { type: "number", description: "Radius of radial start circle." },
                          r1: { type: "number", description: "Radius of radial end circle." },
                          stops: {
                            type: "array",
                            description: "Color stops for the gradient.",
                            items: {
                              type: "object",
                              properties: {
                                offset: { type: "number", description: "Stop position from 0.0 to 1.0." },
                                color: { type: "string", description: "CSS color string." },
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
                    description: "Default outline stroke width in pixels.",
                  },
                  opacity: {
                    type: "number",
                    description: "Default opacity multiplier (0.0 to 1.0, default: 1.0).",
                  },
                  keyframes: {
                    type: "array",
                    description: "Keyframe timeline defining animated transitions for properties.",
                    items: {
                      type: "object",
                      properties: {
                        time: {
                          type: "number",
                          description: "Time in seconds for this keyframe (must be between 0.0 and duration).",
                        },
                        easing: {
                          type: "string",
                          description: "Easing function to transition to the NEXT keyframe (e.g. 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'step', 'cubic-bezier(x1,y1,x2,y2)').",
                        },
                        motionPath: {
                          type: "object",
                          description: "Optional SVG path along which the shape's coordinate should glide to the next keyframe.",
                          properties: {
                            path: {
                              type: "string",
                              description: "SVG path data (d attribute, e.g. 'M 0 0 C 100 0, 100 200, 200 200').",
                            },
                            orientToPath: {
                              type: "boolean",
                              description: "Whether to rotate the shape automatically to follow the curve tangent (default: false).",
                            },
                          },
                        },
                        properties: {
                          type: "object",
                          description: "The target property values at this keyframe. Supported keys: x, y, scaleX, scaleY, rotation, opacity, fillColor, strokeColor, strokeWidth, width, height, radius, points, text, fontSize.",
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
    description:
      "Generate creative audio/sound clips (in WAV format) natively in JavaScript. " +
      "Use this to generate custom sounds, chiptunes, retro arcade effects, " +
      "musical melodies/arpeggios, or full multi-track compositions. Returns a base64-encoded WAV audio clip. " +
      "Features: FM synthesis, ADSR envelopes, additive harmonics, LFOs, filters (LP/HP/BP), distortion (soft clip/hard clip/bitcrush), " +
      "Schroeder reverb, stereo panning, delay (tempo-synced with beat fractions like '1/8' or '1/4d'), " +
      "per-note velocity and pitch bend, swing/humanize, track repeat/looping, " +
      "chord notation (e.g. 'Cmaj7', 'Am', 'G7'), REST/SILENCE notes, time signatures, and " +
      "18 instrument presets (acoustic_guitar, electric_guitar, nylon_guitar, piano, electric_piano, organ, " +
      "trumpet, violin, cello, flute, clarinet, synth_lead, synth_pad, synth_bass, bass_guitar, marimba, vibraphone, harmonica).",
    endpoint: {
      path: "/creative/generate-audio",
      method: "POST",
      bodyParams: [
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
        "melody",
        "delay",
        "sampleRate",
        "tempo",
        "nodes",
        "tracks",
        "instrument",
        "swing",
        "humanize",
        "timeSignature",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        soundType: {
          type: "string",
          enum: [
            "synthesizer",
            "arpeggio",
            "melody",
            "sound_effect",
            "modular",
          ],
          description:
            "The synthesis mode. Use 'sound_effect' or omit for quick presets; 'synthesizer' for custom single tones; 'arpeggio' or 'melody' for multi-note sequences; 'modular' for advanced multi-track node graph patching.",
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
          description:
            "High-fidelity retro game sound preset. If provided, this overrides custom waveform synthesizer parameters.",
        },
        duration: {
          type: "number",
          description:
            "Total sound duration in seconds (default: 1.0, range: 0.1 to 60.0).",
        },
        waveform: {
          type: "string",
          enum: ["sine", "triangle", "sawtooth", "square", "noise"],
          description:
            "Primary carrier oscillator wave shape (default: 'sine').",
        },
        frequency: {
          type: "string",
          description:
            "Starting carrier frequency in Hz (e.g. '440' or 440) or note pitch name (e.g., 'C4', 'A#3').",
        },
        endFrequency: {
          type: "string",
          description:
            "Ending frequency for exponential pitch sweep / glide (e.g., '220' or 'A3'). Perfect for lasers or jump sounds.",
        },
        modulatorFrequency: {
          type: "number",
          description: "FM Synthesizer: Modulator wave frequency in Hz.",
        },
        modulationIndex: {
          type: "number",
          description:
            "FM Synthesizer: Depth of frequency modulation (suggested range: 0 to 500).",
        },
        envelope: {
          type: "object",
          description: "ADSR Amplitude Envelope controls volume over time.",
          properties: {
            attack: {
              type: "number",
              description:
                "Attack ramp-up duration in seconds (default: 0.05).",
            },
            decay: {
              type: "number",
              description:
                "Decay ramp-down duration in seconds (default: 0.1).",
            },
            sustain: {
              type: "number",
              description:
                "Sustain amplitude hold level, from 0.0 to 1.0 (default: 0.8).",
            },
            release: {
              type: "number",
              description:
                "Release ramp-down duration in seconds (default: 0.15).",
            },
          },
        },
        harmonics: {
          type: "array",
          items: { type: "number" },
          description:
            "Additive Synthesis: Relative amplitude of upper harmonics (e.g. [1.0, 0.5, 0.25]).",
        },
        lfo: {
          type: "object",
          description: "Low-Frequency Oscillator configurations.",
          properties: {
            frequency: {
              type: "number",
              description: "LFO oscillation rate in Hz (e.g., 5.0).",
            },
            pitchDepth: { type: "number", description: "Vibrato depth in Hz." },
            amplitudeDepth: {
              type: "number",
              description: "Tremolo depth from 0.0 to 1.0.",
            },
          },
          required: ["frequency"],
        },
        melody: {
          type: "array",
          description:
            "Melodic note sequence. Used if soundType is 'melody' or 'arpeggio'. " +
            "Notes can be pitch names ('C4'), raw Hz, chord names ('Am7'), or 'REST' for silence.",
          items: {
            type: "object",
            properties: {
              note: {
                type: "string",
                description:
                  "Note name (e.g. 'C4'), chord name (e.g. 'Cmaj7', 'Am', 'G7' — auto-expands to constituent notes), " +
                  "raw frequency in Hz, or 'REST'/'SILENCE' for a silent gap.",
              },
              duration: {
                type: "number",
                description: "Duration of this note step in seconds.",
              },
              velocity: {
                type: "number",
                description:
                  "Note loudness from 0.0 (silent) to 1.0 (full volume). Default: 1.0.",
              },
            },
            required: ["note", "duration"],
          },
        },
        delay: {
          type: "object",
          description: "Echo/Feedback Delay effect.",
          properties: {
            delayTime: {
              type: "number",
              description: "Echo delay offset in seconds (e.g., 0.25).",
            },
            feedback: {
              type: "number",
              description:
                "Feedback coefficient from 0.0 to 0.95 (default: 0.4).",
            },
          },
          required: ["delayTime", "feedback"],
        },
        sampleRate: {
          type: "number",
          description:
            "Audio sample rate in Hz (default: 44100, range: 8000 to 48000).",
        },
        tempo: {
          type: "number",
          description:
            "Tempo in beats per minute (BPM) for resolving bar-beat-sixteenth grid markers (default: 120).",
        },
        nodes: {
          type: "object",
          description:
            "Modular Audio Graph Nodes definition. Keys are unique custom node names. Values describe the node type and properties. " +
            "Supported node types: 'oscillator' (waveform, detune, frequency), 'noise' (noiseType: white|pink), " +
            "'biquad_filter' (filterType: lowpass|highpass|bandpass, cutoff, Q, modulate: {cutoff: 'envelope_name'}), " +
            "'envelope' (attack, decay, sustain, release), 'gain' (gain, modulate: {gain: 'envelope_name'}), " +
            "'distortion' (algorithm: soft_clip|hard_clip|bitcrush, drive: 1-100, bitDepth: 2-16, downsample: 1-32), " +
            "'stereo_panner' (pan: -1.0 to 1.0), 'delay' (delayTime: seconds or beat fraction '1/8'|'1/4d', feedback, pingPong), " +
            "'reverb' (wet: 0-1, decay: 0-1), 'drum_synth' (triggered by note name: KICK, SNARE, HAT).",
        },
        tracks: {
          type: "array",
          description:
            "Timeline sequences for polyphonic multi-tracking. Each track has a nodeChain, notes list, optional volume (0.0–2.0), and optional repeat count.",
          items: {
            type: "object",
            properties: {
              nodeChain: {
                type: "array",
                items: { type: "string" },
                description:
                  "Array of node names in series connecting generator to effects, ending with 'destination' (e.g., ['osc', 'env', 'filter', 'destination']).",
              },
              notes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    time: {
                      type: "string",
                      description:
                        "Grid marker time to trigger (e.g. '1.1.1' or numeric seconds).",
                    },
                    duration: {
                      type: "string",
                      description:
                        "Grid duration of the note (e.g. '0.2.0' or numeric seconds).",
                    },
                    note: {
                      type: "string",
                      description:
                        "Note name (e.g. 'C4', 'Bb3'), chord name (e.g. 'Am7', 'Cmaj7' — auto-expands), " +
                        "raw frequency, drum trigger ('KICK', 'SNARE', 'HAT'), or 'REST'/'SILENCE'.",
                    },
                    velocity: {
                      type: "number",
                      description:
                        "Note loudness from 0.0 to 1.0 (default: 1.0). Controls dynamics and expression.",
                    },
                    pitchBend: {
                      type: "object",
                      description:
                        "Pitch bend/glide to a target note during playback. Enables guitar bends, slides, and portamento.",
                      properties: {
                        target: {
                          type: "string",
                          description:
                            "Target note name or frequency to bend toward (e.g. 'G3', 440).",
                        },
                        startTime: {
                          type: "number",
                          description:
                            "Fraction of note duration when bend starts (0.0–1.0, default: 0.0).",
                        },
                        endTime: {
                          type: "number",
                          description:
                            "Fraction of note duration when bend reaches target (0.0–1.0, default: 1.0).",
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
                description:
                  "Track volume multiplier (0.0–2.0, default: 1.0). Use to balance tracks in the mix.",
              },
              repeat: {
                type: "integer",
                description:
                  "Number of times to repeat this track's note pattern (default: 1). A 1-bar drum loop with repeat: 8 produces 8 bars.",
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
          description:
            "Musical instrument preset. Provides pre-tuned waveform, harmonics, envelope, FM, and LFO settings " +
            "that approximate the instrument's timbre. User-specified params (waveform, harmonics, envelope, etc.) override the preset. " +
            "Works in 'synthesizer', 'melody', and 'arpeggio' modes.",
        },
        swing: {
          type: "number",
          description:
            "Groove swing amount (0.0–1.0). Shifts every other 16th note forward in time. " +
            "0.0 = straight timing, 0.5 = triplet shuffle, 1.0 = extreme swing. Only applies to modular mode.",
        },
        humanize: {
          type: "number",
          description:
            "Timing humanization amount (0.0–1.0). Adds random per-note timing jitter (±20ms at max). " +
            "Makes rigid grid timing feel more natural and organic. Only applies to modular mode.",
        },
        timeSignature: {
          type: "array",
          items: { type: "integer" },
          description:
            "Time signature as [beatsPerBar, beatUnit]. Examples: [4, 4] for 4/4, [3, 4] for 3/4 waltz, [6, 8] for 6/8. " +
            "Affects bar duration in grid marker notation (e.g. '1.1.1'). Default: [4, 4].",
        },
      },
    },
  },

  // ── Speech-to-Text ──────────────────────────────────────────
  {
    name: "speech_to_text",
    dataSource: onDemand("OpenAI Whisper / Google via Prism"),
    description:
      "Transcribe audio into text using a speech-to-text provider. Accepts either a URL to an audio file " +
      "or base64-encoded audio data. Use this when the user asks to transcribe a recording, podcast, " +
      "voice message, or any audio content.",
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
          description:
            "URL to the audio file to transcribe (MP3, WAV, M4A, WEBM, etc.)",
        },
        audio: {
          type: "string",
          description:
            "Base64-encoded audio data (alternative to audioUrl). Can be a data URL.",
        },
        provider: {
          type: "string",
          description: "STT provider to use",
          enum: ["openai", "google"],
        },
        model: {
          type: "string",
          description:
            "Model name (optional — uses provider default, e.g. 'whisper-1')",
        },
        language: {
          type: "string",
          description:
            "Language hint in ISO 639-1 format (e.g. 'en', 'es', 'fr'). Improves accuracy for non-English audio.",
        },
      },
    },
  },

  // ── Discord (Lupos DB) ──────────────────────────────────────
  {
    name: "discord_message_search",
    dataSource: onDemand("Lupos MongoDB"),
    description:
      "Search Discord message history from the server's stored messages. " +
      "Filter by guild, channel, user, time range, and keyword. " +
      "Supports three response modes: 'messages' returns full message objects (default), " +
      "'count' returns ONLY the matching count with zero message bodies (use this when " +
      "users ask 'how many' questions), and 'compact' returns minimal per-message data " +
      "(author, truncated content, timestamp) for scanning large result sets. " +
      "Max 200 results per call in messages/compact modes.",
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
          description: "Discord guild/server ID to search within",
        },
        channelId: {
          type: "string",
          description: "Filter to a specific channel ID",
        },
        userId: {
          type: "string",
          description: "Filter to messages by a specific user ID",
        },
        username: {
          type: "string",
          description:
            "Filter by username or display name (case-insensitive). " +
            "Use this when you know the person's name but not their user ID. " +
            "Searches across username, global name, and server nickname.",
        },
        query: {
          type: "string",
          description: "Text search query — matches against message content",
        },
        before: {
          type: "string",
          description:
            "ISO date string — only messages before this date (e.g. '2025-03-01')",
        },
        after: {
          type: "string",
          description:
            "ISO date string — only messages after this date (e.g. '2025-01-01')",
        },
        limit: {
          type: "number",
          description:
            "Max results to return (default: 50, max: 200). Not used in 'count' mode.",
        },
        mode: {
          type: "string",
          enum: ["messages", "count", "compact"],
          description:
            "Response mode. 'messages' (default) returns full message objects. " +
            "'count' returns only the total matching count — use for 'how many' questions. " +
            "'compact' returns minimal data (author name, first 120 chars, date) — " +
            "use when scanning many messages without needing full detail.",
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_message_analytics",
    dataSource: onDemand("Lupos MongoDB"),
    description:
      "Aggregate Discord message history with group-by queries. " +
      "Groups messages by a chosen dimension (user, channel, day, hour, weekday, month) " +
      "and returns counted results sorted by count descending. " +
      "Supports all the same filters as discord_message_search (guild, channel, user, " +
      "time range, keyword). Use this for questions like 'who talks the most?', " +
      "'who says X the most?', 'which channel is most active?', " +
      "'what day of the week has the most messages?', or 'show monthly message trends'.",
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
          description: "Discord guild/server ID to analyze",
        },
        channelId: {
          type: "string",
          description: "Filter to a specific channel ID",
        },
        userId: {
          type: "string",
          description: "Filter to messages by a specific user ID",
        },
        username: {
          type: "string",
          description: "Filter by username or display name (case-insensitive)",
        },
        query: {
          type: "string",
          description:
            "Text filter — only count messages containing this text. " +
            "Use this for questions like 'who says lmao the most?' or 'how often do people mention pizza?'",
        },
        before: {
          type: "string",
          description: "ISO date string — only messages before this date",
        },
        after: {
          type: "string",
          description: "ISO date string — only messages after this date",
        },
        groupBy: {
          type: "string",
          enum: ["user", "channel", "day", "hour", "weekday", "month"],
          description:
            "Dimension to group by. 'user' = per-author counts, 'channel' = per-channel counts, " +
            "'day' = per-day (YYYY-MM-DD), 'hour' = by hour of day (0-23 UTC), " +
            "'weekday' = by day of week (Mon-Sun), 'month' = by month (YYYY-MM). Default: 'user'.",
        },
        topN: {
          type: "number",
          description: "Max number of groups to return (default: 25, max: 100)",
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "discord_server_activity",
    dataSource: onDemand("Lupos MongoDB"),
    description:
      "Get Discord server activity statistics including top users (by message count), " +
      "channel breakdown, hourly activity distribution, and engagement metrics. " +
      "Useful for leaderboards, identifying active users, analyzing server health, " +
      "and finding which channels or time periods are most active. " +
      "Supports configurable lookback period (default: 7 days).",
    endpoint: {
      path: "/discord/activity",
      queryParams: ["guildId", "channelId", "days", "topN"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to analyze",
        },
        channelId: {
          type: "string",
          description: "Narrow analysis to a specific channel ID",
        },
        days: {
          type: "number",
          description: "Lookback period in days (default: 7, max: 365)",
        },
        topN: {
          type: "number",
          description: "Number of top users to return (default: 15, max: 50)",
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_guild_channels",
    dataSource: onDemand("Discord Live API"),
    description:
      "List all text channels in a Discord guild/server including their name, topic, " +
      "category (parent ID/name), and position index. Use this to discover where to post " +
      "or search before reading or writing to the server.",
    endpoint: {
      path: "/discord/guild/channels",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to list channels from",
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_guild_members",
    dataSource: onDemand("Discord Live API"),
    description:
      "Get the list of online/idle/dnd members in a Discord server, grouped by their hoisted roles, " +
      "including their custom display name, status, current game/activity name, and any profile badges. " +
      "Use this to see who is currently active or what people are playing/doing.",
    endpoint: {
      path: "/discord/guild/members",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to list members from",
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_guild_emojis",
    dataSource: onDemand("Discord Live API"),
    description:
      "List all custom emojis in a Discord server including their name, ID, and animated status. " +
      "Use this to find custom emojis to react to messages with or include in text.",
    endpoint: {
      path: "/discord/guild/emojis",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to list custom emojis from",
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_bot_stats",
    dataSource: onDemand("Discord Live API"),
    description:
      "Retrieve the bot's own simulated biology metrics (mood, hunger, thirst, energy, bathroom, alcohol) " +
      "and general database telemetry (total archived messages, unique users, transcriptions, media). " +
      "Use this to check your own internal emotional/physical state and operational statistics.",
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
    description:
      "List all Discord servers/guilds that the bot is currently a member of, including their " +
      "name, ID, member count, and owner ID.",
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
    description:
      "Retrieve 24-hour activity timeline metrics for the bot, detailing hourly counts of messages, " +
      "voice transcriptions, image generations, and active unique users.",
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
    description:
      "Get hourly and monthly activity heatmap data for a user on a Discord server. " +
      "Returns a 7x48 hourly grid (days x 30-min intervals) and month-by-month activity metrics. " +
      "Use this to analyze when a user is most active on the server.",
    endpoint: {
      path: "/discord/guild/heatmap",
      queryParams: ["guildId", "userId", "channelId", "years", "months", "days"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to query",
        },
        userId: {
          type: "string",
          description: "Discord user ID to analyze",
        },
        channelId: {
          type: "string",
          description: "Optional channel ID to filter by",
        },
        years: {
          type: "number",
          description: "Years of history to look back",
        },
        months: {
          type: "number",
          description: "Months of history to look back",
        },
        days: {
          type: "number",
          description: "Days of history to look back",
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "get_discord_mention_leaderboard",
    dataSource: onDemand("Lupos MongoDB"),
    description:
      "Get the top users who mention a specific user in a server, along with unique mentioner counts, " +
      "average mentions per user, and percentage distribution.",
    endpoint: {
      path: "/discord/guild/mentions",
      queryParams: ["guildId", "userId", "years", "months", "days", "channelId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to query",
        },
        userId: {
          type: "string",
          description: "Discord user ID to check mentions for",
        },
        years: {
          type: "number",
          description: "Years of history to look back",
        },
        months: {
          type: "number",
          description: "Months of history to look back",
        },
        days: {
          type: "number",
          description: "Days of history to look back",
        },
        channelId: {
          type: "string",
          description: "Optional channel ID to filter by",
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "get_discord_message_leaderboard",
    dataSource: onDemand("Lupos MongoDB"),
    description:
      "Get the top contributors by message count on a server for a specified lookback window, " +
      "including total messages, active users, and average messages per user.",
    endpoint: {
      path: "/discord/guild/leaderboard",
      queryParams: ["guildId", "years", "months", "days", "channelId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to query",
        },
        years: {
          type: "number",
          description: "Years of history to look back",
        },
        months: {
          type: "number",
          description: "Months of history to look back",
        },
        days: {
          type: "number",
          description: "Days of history to look back",
        },
        channelId: {
          type: "string",
          description: "Optional channel ID to filter by (defaults to all)",
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_word_frequencies",
    dataSource: onDemand("Lupos MongoDB"),
    description:
      "Get word frequency analysis (most common words) for a user in a Discord server, " +
      "excluding common English stop words. Useful for seeing what topics or phrases a user " +
      "uses the most.",
    endpoint: {
      path: "/discord/guild/word-frequencies",
      queryParams: ["guildId", "userId", "years", "months", "days", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to query",
        },
        userId: {
          type: "string",
          description: "Discord user ID to analyze",
        },
        years: {
          type: "number",
          description: "Years of history to look back",
        },
        months: {
          type: "number",
          description: "Months of history to look back",
        },
        days: {
          type: "number",
          description: "Days of history to look back",
        },
        limit: {
          type: "number",
          description: "Max number of words to return (default: 150)",
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "react_to_discord_message",
    dataSource: onDemand("Discord Live API"),
    description:
      "Add an emoji reaction to a specific message in a server via the Lupos bot account. " +
      "Rate-limited to 1 reaction per 2 seconds. The reaction will automatically sync to " +
      "the database archive.",
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
          description: "Discord guild/server ID where the message resides",
        },
        channelId: {
          type: "string",
          description: "Discord channel ID where the message was sent",
        },
        messageId: {
          type: "string",
          description: "The unique ID of the message to react to",
        },
        emoji: {
          type: "string",
          description:
            "The emoji to react with. Can be a standard Unicode emoji character (e.g. '👍') " +
            "or a custom Discord emoji identifier in the format 'name:id' (e.g. 'luposLurk:1234567890')",
        },
      },
      required: ["guildId", "channelId", "messageId", "emoji"],
    },
  },
  {
    name: "get_discord_voice_channel_members",
    dataSource: onDemand("Discord Live API"),
    description:
      "Get a real-time list of all voice and stage channels in the Discord server that currently " +
      "have active members, including the name/username and voice states (muted, deafened, streaming, camera) of each participant. " +
      "Use this to see who is currently talking, streaming, or hanging out in voice.",
    endpoint: {
      path: "/discord/guild/voice-members",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to list voice members from",
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_user_profile",
    dataSource: onDemand("Discord Live API"),
    description:
      "Retrieve a comprehensive and detailed profile of a Discord user in a specific server. " +
      "Includes display names, custom statuses, current active platform, roles list, highest role, " +
      "voice state, joins/boost timestamps, profile/accent colors, and moderation/kickable permissions. " +
      "Use this when you need detailed context about a user's role or server presence, replacing heavy system prompt injections.",
    endpoint: {
      path: "/discord/guild/user-profile",
      queryParams: ["guildId", "userId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID where the user is a member",
        },
        userId: {
          type: "string",
          description: "The unique Discord user ID to fetch the profile for",
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "get_discord_channel_activity_stats",
    dataSource: onDemand("Lupos MongoDB"),
    description:
      "Analyze historical message activity per-channel over a specified lookback window (default 7 days). " +
      "Returns metrics for each active channel, including total message counts, unique active users, " +
      "average messages per day, and the top yapper/contributor user. " +
      "Use this to answer questions about channel popularity, server activity patterns, or identifying the most active rooms.",
    endpoint: {
      path: "/discord/guild/channel-stats",
      queryParams: ["guildId", "days"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: "Discord guild/server ID to query channel stats for",
        },
        days: {
          type: "number",
          description: "Lookback window in days (default: 7, max: 90)",
        },
      },
      required: ["guildId"],
    },
  },
  // ── Smart Home (LIFX Lights) ────────────────────────────────
  {
    name: "lifx_list_lights",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "List LIFX smart lights and their current state including power, color (hue/saturation/kelvin), " +
      "brightness, label, group, location, and connection status. Use this to discover available lights " +
      "before controlling them, or to check the current state before making changes. " +
      "Supports LIFX selectors: 'all', 'label:Kitchen', 'group:Bedroom', 'location:Home', 'id:d073d5xxxxxx'.",
    endpoint: {
      path: "/lights/list",
      queryParams: ["selector"],
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "LIFX selector to filter lights. Examples: 'all' (default), 'label:Desk Lamp', " +
            "'group:Living Room', 'location:Home', 'id:d073d5xxxxxx'. " +
            "Use 'all' to see every light.",
        },
      },
      required: [],
    },
  },
  {
    name: "lifx_set_state",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Set the state of LIFX lights — power, color, brightness, and color temperature. " +
      "This is the primary control tool. Colors can be specified as: named colors ('red', 'blue', 'warm_white'), " +
      "hex codes ('#FF5500'), HSBK ('hue:120 saturation:1.0 brightness:0.5'), " +
      "kelvin ('kelvin:2700' for warm, 'kelvin:6500' for daylight), or RGB ('rgb:255,128,0'). " +
      "Brightness ranges from 0.0 to 1.0. Duration controls transition time in seconds.",
    endpoint: {
      path: "/lights/state",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "LIFX selector targeting which lights to control. " +
            "Default: 'all'. Examples: 'label:Desk Lamp', 'group:Bedroom'.",
        },
        power: {
          type: "string",
          enum: ["on", "off"],
          description: "Set power state to 'on' or 'off'.",
        },
        color: {
          type: "string",
          description:
            "Color to set. Supports: named colors ('red', 'purple', 'warm_white'), " +
            "hex ('#FF5500'), HSBK ('hue:240 saturation:1.0 brightness:0.8'), " +
            "kelvin ('kelvin:2700'), RGB ('rgb:255,128,0').",
        },
        brightness: {
          type: "number",
          description:
            "Brightness level from 0.0 (off) to 1.0 (max). Overrides brightness in color if set.",
        },
        duration: {
          type: "number",
          description:
            "Transition time in seconds (default: 1). Use 0 for instant, larger values for smooth fades.",
        },
        kelvin: {
          type: "number",
          description:
            "Color temperature from 2500 (warm/candle) to 9000 (cool/daylight). " +
            "Common values: 2700 (warm white), 4000 (neutral), 5500 (daylight), 6500 (cool).",
        },
      },
      required: [],
    },
  },
  {
    name: "lifx_toggle_power",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Toggle LIFX light power — turns off lights that are on, or turns on lights that are off. " +
      "All matched lights share the same power state after toggling.",
    endpoint: {
      path: "/lights/toggle",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "LIFX selector. Default: 'all'.",
        },
        duration: {
          type: "number",
          description: "Transition time in seconds (default: 1).",
        },
      },
      required: [],
    },
  },
  {
    name: "lifx_breathe_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Run a breathe effect — slowly fades between two colors in a smooth sine wave pattern. " +
      "Perfect for ambient mood lighting, meditation, relaxation, sunrise simulation, or gentle notifications. " +
      "The effect oscillates between the current color (or fromColor) and the target color.",
    endpoint: {
      path: "/lights/effects/breathe",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "LIFX selector. Default: 'all'.",
        },
        color: {
          type: "string",
          description:
            "Target color for the breathe peak. Required. Examples: 'blue', '#FF0000', 'kelvin:2700'.",
        },
        fromColor: {
          type: "string",
          description:
            "Starting color. If omitted, uses the light's current color.",
        },
        period: {
          type: "number",
          description:
            "Time in seconds for one full breathe cycle (default: 1). Use 3-5 for relaxing, 0.5-1 for energetic.",
        },
        cycles: {
          type: "number",
          description:
            "Number of breathe cycles to perform (default: 1). Use 10+ for extended ambient effects.",
        },
        persist: {
          type: "boolean",
          description:
            "If true, keep the final color after the effect ends. If false (default), revert to the original color.",
        },
        powerOn: {
          type: "boolean",
          description:
            "If true (default), turn the light on if it's off before starting the effect.",
        },
        peak: {
          type: "number",
          description:
            "Where in the cycle the target color peaks (0.0 to 1.0, default: 0.5). " +
            "0.5 = symmetric, lower = faster ramp up, higher = faster ramp down.",
        },
      },
      required: ["color"],
    },
  },
  {
    name: "lifx_pulse_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Run a pulse effect — quickly flashes between two colors with a sharp square wave pattern. " +
      "Great for alerts, notifications, party lighting, or attention-grabbing effects. " +
      "More dramatic and abrupt than the breathe effect.",
    endpoint: {
      path: "/lights/effects/pulse",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "LIFX selector. Default: 'all'.",
        },
        color: {
          type: "string",
          description:
            "Target flash color. Required. Examples: 'red', '#00FF00', 'hue:0 saturation:1'.",
        },
        fromColor: {
          type: "string",
          description:
            "Starting color between flashes. If omitted, uses the light's current color.",
        },
        period: {
          type: "number",
          description:
            "Time in seconds for one flash cycle (default: 1). Use 0.3-0.5 for rapid strobe, 1-2 for slow pulse.",
        },
        cycles: {
          type: "number",
          description:
            "Number of flash cycles (default: 1). Use 5-10 for a noticeable alert.",
        },
        persist: {
          type: "boolean",
          description:
            "If true, keep the flash color after the effect ends. Default: false.",
        },
        powerOn: {
          type: "boolean",
          description: "If true (default), turn the light on if it's off.",
        },
      },
      required: ["color"],
    },
  },
  {
    name: "lifx_effects_off",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Stop all running effects (breathe, pulse, move, morph, flame) on the selected lights. " +
      "Optionally also power off the lights. Use this to cancel any active animation.",
    endpoint: {
      path: "/lights/effects/off",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "LIFX selector. Default: 'all'.",
        },
        powerOff: {
          type: "boolean",
          description:
            "If true, also turn off the lights after stopping effects. Default: false.",
        },
      },
      required: [],
    },
  },
  {
    name: "lifx_list_scenes",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "List all saved LIFX scenes in the user's account. Scenes are pre-configured light states " +
      "(color, brightness, power) that can be activated with lifx_activate_scene. " +
      "Returns scene UUID (needed for activation), name, and light count.",
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
    name: "lifx_activate_scene",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Activate a saved LIFX scene by its UUID. Scenes apply pre-configured states " +
      "(color, brightness, power) to specific lights. Use lifx_list_scenes first to discover " +
      "available scenes and their UUIDs.",
    endpoint: {
      path: "/lights/scenes/activate",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        sceneId: {
          type: "string",
          description: "Scene UUID from lifx_list_scenes.",
        },
        duration: {
          type: "number",
          description:
            "Transition time in seconds to fade into the scene (default: 1).",
        },
        ignore: {
          type: "array",
          items: { type: "string" },
          description:
            "Properties to NOT change when applying the scene. " +
            "Options: 'power', 'infrared', 'duration', 'intensity', 'hue', 'saturation', 'brightness', 'kelvin'.",
        },
      },
      required: ["sceneId"],
    },
  },
  {
    name: "lifx_move_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Run a move effect — flowing color animation along LIFX strip products (Z, Beam). " +
      "The existing color pattern moves forward or backward along the strip. " +
      "Perfect for ambient flowing light effects. Only works on multizone strip products.",
    endpoint: {
      path: "/lights/effects/move",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "LIFX selector. Default: 'all'.",
        },
        direction: {
          type: "string",
          enum: ["forward", "backward"],
          description:
            "Direction of movement along the strip. Default: 'forward'.",
        },
        period: {
          type: "number",
          description:
            "Seconds per movement cycle (default: 1). Lower = faster flow.",
        },
        cycles: {
          type: "number",
          description:
            "Number of cycles to run. Omit for infinite (until stopped with lifx_effects_off).",
        },
        powerOn: {
          type: "boolean",
          description: "If true (default), turn the light on if it's off.",
        },
      },
      required: [],
    },
  },
  {
    name: "lifx_flame_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Run a flame effect — flickering fire animation that runs on LIFX matrix device firmware " +
      "(Tile, Candle). Creates a realistic candle/fireplace simulation. " +
      "Only works on matrix-capable products.",
    endpoint: {
      path: "/lights/effects/flame",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "LIFX selector. Default: 'all'.",
        },
        period: {
          type: "number",
          description:
            "Speed of the flame in seconds (default: 5). Lower = more active flame.",
        },
        duration: {
          type: "number",
          description:
            "How long to run in seconds. Omit for indefinite (until stopped with lifx_effects_off).",
        },
        powerOn: {
          type: "boolean",
          description: "If true (default), turn the light on if it's off.",
        },
      },
      required: [],
    },
  },
  {
    name: "lifx_morph_effect",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Run a morph effect — continuous color-blending animation on LIFX matrix devices " +
      "(Tile, Candle). Smoothly transitions between provided palette colors. " +
      "Great for ambient mood lighting with multiple colors. Only works on matrix-capable products.",
    endpoint: {
      path: "/lights/effects/morph",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "LIFX selector. Default: 'all'.",
        },
        palette: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of color strings to blend between. Examples: ['red', 'blue', 'green'], " +
            "['#FF0000', '#00FF00', '#0000FF'], ['kelvin:2700', 'kelvin:6500'].",
        },
        period: {
          type: "number",
          description:
            "Seconds per blend cycle (default: 5). Lower = faster transitions.",
        },
        duration: {
          type: "number",
          description:
            "How long to run in seconds. Omit for indefinite (until stopped with lifx_effects_off).",
        },
        powerOn: {
          type: "boolean",
          description: "If true (default), turn the light on if it's off.",
        },
      },
      required: [],
    },
  },
  {
    name: "lifx_set_states",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Set different states on multiple LIFX light selectors in a single API call. " +
      "Allows setting up to 50 different light states simultaneously — each with its own " +
      "selector, power, color, brightness, and duration. Much more efficient than calling " +
      "lifx_set_state multiple times. Use 'defaults' to set common values across all entries.",
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
                description: "LIFX selector for this state entry.",
              },
              power: { type: "string", enum: ["on", "off"] },
              color: { type: "string", description: "Color string." },
              brightness: { type: "number", description: "0.0 to 1.0." },
              duration: { type: "number", description: "Transition seconds." },
              kelvin: {
                type: "number",
                description: "Color temperature 2500-9000.",
              },
            },
          },
          description:
            "Array of state objects (max 50). Each must have a selector and any " +
            "combination of power/color/brightness/duration/kelvin.",
        },
        defaults: {
          type: "object",
          description:
            "Default values applied to all state entries. Same properties as individual states " +
            "(power, color, brightness, duration, kelvin). Individual entries override defaults.",
        },
      },
      required: ["states"],
    },
  },
  {
    name: "lifx_set_state_delta",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Make relative adjustments to the current state of LIFX lights — increase/decrease brightness, " +
      "shift hue, adjust saturation, or change color temperature by a delta value. " +
      "Unlike lifx_set_state (which sets absolute values), this adds or subtracts from the current state. " +
      "Example: brightness +0.2 makes lights 20% brighter than they currently are.",
    endpoint: {
      path: "/lights/state/delta",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "LIFX selector. Default: 'all'.",
        },
        hue: {
          type: "number",
          description: "Hue adjustment from -360 to 360 degrees.",
        },
        saturation: {
          type: "number",
          description: "Saturation adjustment from -1.0 to 1.0.",
        },
        brightness: {
          type: "number",
          description:
            "Brightness adjustment from -1.0 to 1.0. Positive = brighter, negative = dimmer.",
        },
        kelvin: {
          type: "number",
          description:
            "Color temperature adjustment from -9000 to 9000. Positive = cooler, negative = warmer.",
        },
        duration: {
          type: "number",
          description: "Transition time in seconds (default: 1).",
        },
      },
      required: [],
    },
  },
  {
    name: "lifx_night_lock",
    dataSource: onDemand("LIFX Cloud API"),
    description:
      "Check, toggle, or set the night lock status on the smart lighting system. " +
      "When locked, external requests to turn lights on are blocked (the automation engine " +
      "handles sleep-time lockout automatically). Use action 'status' to check, 'toggle' to flip, " +
      "or 'set' to explicitly lock/unlock.",
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
          description:
            "Action to perform. 'status': check current state. 'toggle': flip lock. 'set': explicitly set.",
        },
        locked: {
          type: "boolean",
          description:
            "Required when action is 'set'. True to lock, false to unlock.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "lifx_health",
    dataSource: onDemand("Lights Service"),
    description:
      "Get health and diagnostics from the smart lighting service — uptime, current automation phase " +
      "(sleep/sunrise/daytime/sunset/nighttime), night lock status, LIFX API rate limit usage, " +
      "sunrise/sunset times, and current weather conditions affecting lighting.",
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
    description:
      "Create a new custom AI agent persona. Custom agents allow tailoring the system prompt identity, " +
      "response guidelines, tool policy, enabled tools, and visual branding (icon, accent color, background image). " +
      "The agent is persisted to the database and immediately registered for use. " +
      "Use this when the user asks to create, set up, or define a new specialized agent, assistant, or persona. " +
      "The created agent will appear in the agent picker and can be selected for future conversations.",
    endpoint: {
      method: "POST",
      path: "/agentic/custom-agent/create",
      bodyParams: [
        "name",
        "description",
        "project",
        "icon",
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
          description:
            "Display name for the agent (e.g. 'DevOps Engineer', 'Creative Writer'). " +
            "Must be unique. A stable ID is auto-derived as CUSTOM_<UPPERCASED_NAME>.",
        },
        description: {
          type: "string",
          description:
            "Short description shown in the agent picker (1-2 sentences). " +
            "Helps the user understand what this agent specializes in.",
        },
        project: {
          type: "string",
          description:
            "Project scope for sessions created with this agent. Default: 'coding'. " +
            "Examples: 'coding', 'writing', 'research'.",
        },
        icon: {
          type: "string",
          description:
            "Lucide icon name for visual branding. Default: 'Bot'. " +
            "Examples: 'Brain', 'Rocket', 'Shield', 'Palette', 'Microscope', 'Code2', " +
            "'Flame', 'Zap', 'GraduationCap', 'Hammer', 'Sparkles', 'Crown', 'Atom', " +
            "'Briefcase', 'Heart', 'Star', 'Telescope', 'FlaskConical', 'Lightbulb', " +
            "'Music', 'Gamepad2', 'Camera', 'Leaf', 'Dog', 'Cat', 'Coffee', 'Swords'.",
        },
        color: {
          type: "string",
          description:
            "Hex color code for accent theming (icon background, UI accents). " +
            "Examples: '#6366f1' (Indigo), '#8b5cf6' (Violet), '#ef4444' (Red), " +
            "'#f97316' (Orange), '#22c55e' (Green), '#06b6d4' (Cyan), '#3b82f6' (Blue), " +
            "'#ec4899' (Pink), '#eab308' (Yellow), '#14b8a6' (Teal). " +
            "Leave empty for default gradient.",
        },
        backgroundImage: {
          type: "string",
          description:
            "URL to a background image displayed behind chat messages. " +
            "Use a subtle, dark image for best readability. Leave empty for default.",
        },
        identity: {
          type: "string",
          description:
            "Core personality and role prompt — injected at the top of the system prompt. " +
            "Example: 'You are a senior backend engineer specializing in distributed systems...'",
        },
        guidelines: {
          type: "string",
          description:
            "Behavioral instructions for how the agent should respond. Always injected into the system prompt. " +
            "Example: '## Guidelines\n- Always explain your reasoning\n- Use bullet points for clarity'",
        },
        toolPolicy: {
          type: "string",
          description:
            "Instructions for how the agent should use its tools. " +
            "Example: '# Tool Usage\n- Use read_file before editing\n- Always run tests after changes'",
        },
        enabledTools: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of tool names this agent can use. If empty, the agent has no tool access. " +
            "Pass specific tool names from the tool schema registry (e.g. ['read_file', 'write_file', 'search_web']). " +
            "The user can also configure tools later via the settings UI.",
        },
        usesDirectoryTree: {
          type: "boolean",
          description:
            "If true, inject the workspace file/directory structure into the agent's context. " +
            "Useful for coding agents that need to navigate project structure. Default: false.",
        },
        usesCodingGuidelines: {
          type: "boolean",
          description:
            "If true, inject generic coding conventions and coordinator orchestration mode " +
            "into the system prompt. Default: false.",
        },
      },
      required: ["name", "identity"],
    },
  },
  {
    name: "list_custom_agents",
    dataSource: onDemand("Prism CustomAgentService"),
    description:
      "List all custom AI agent personas. Returns every custom agent registered in the system " +
      "with their name, agentId, description, icon, color, identity prompt, guidelines, tool policy, " +
      "enabled tools, and timestamps. Use this to discover which custom agents exist before creating " +
      "a new one (to avoid duplicates), or when the user asks to see, review, or pick from available agents.",
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
    name: "update_custom_agent",
    dataSource: onDemand("Prism CustomAgentService"),
    description:
      "Update an existing custom agent persona. Accepts partial updates — only the fields " +
      "you provide will be changed. Use list_custom_agents first to find the agent's ID. " +
      "Common updates include adding new tools to enabledTools (e.g. after creating a custom tool), " +
      "modifying the identity prompt, changing guidelines, or updating visual branding.",
    endpoint: {
      method: "POST",
      path: "/agentic/custom-agent/update",
      bodyParams: [
        "id",
        "name",
        "description",
        "project",
        "icon",
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
          description:
            "MongoDB ObjectId of the agent to update (from list_custom_agents).",
        },
        name: {
          type: "string",
          description:
            "Updated display name. Leave unset to keep the current name.",
        },
        description: {
          type: "string",
          description: "Updated description shown in the agent picker.",
        },
        project: {
          type: "string",
          description: "Updated project scope (e.g. 'coding', 'writing').",
        },
        icon: {
          type: "string",
          description:
            "Updated Lucide icon name (e.g. 'Brain', 'Rocket', 'Code2').",
        },
        color: {
          type: "string",
          description: "Updated hex color code for accent theming.",
        },
        backgroundImage: {
          type: "string",
          description: "Updated background image URL.",
        },
        identity: {
          type: "string",
          description: "Updated core personality and role prompt.",
        },
        guidelines: {
          type: "string",
          description: "Updated behavioral instructions.",
        },
        toolPolicy: {
          type: "string",
          description: "Updated tool usage instructions.",
        },
        enabledTools: {
          type: "array",
          items: { type: "string" },
          description:
            "Updated array of tool names this agent can use. Replaces the entire list. " +
            "Include both built-in tool names (e.g. 'read_file', 'search_web') and " +
            "custom tool names (created via create_custom_tool). " +
            "Use list_custom_tools to find custom tool names.",
        },
        usesDirectoryTree: {
          type: "boolean",
          description:
            "Whether to inject workspace structure into the agent's context.",
        },
        usesCodingGuidelines: {
          type: "boolean",
          description:
            "Whether to inject coding conventions into the system prompt.",
        },
      },
      required: ["id"],
    },
  },

  {
    name: "create_custom_tool",
    dataSource: onDemand("Prism custom_tools collection"),
    description:
      "Create a new sandboxed custom tool with executable JavaScript code. The code runs in an " +
      "isolated vm context — no network access, no filesystem, no require(). " +
      "Tool arguments from the LLM are injected as a global `args` object. " +
      "Use console.log() to produce output and return a value as the last expression. " +
      "Once created, the tool is persisted and available in future agent sessions. " +
      "Use this when the user wants a reusable computation, formatter, converter, validator, " +
      "or any deterministic pure logic the agent can call by name. " +
      "For tools that need network access, filesystem, or require() — use create_privileged_tool instead.",
    endpoint: {
      method: "POST",
      path: "/agentic/custom-tool/create",
      bodyParams: ["name", "description", "code", "parameters", "enabled"],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Unique tool name (snake_case). This becomes the function name the LLM calls. " +
            "Example: 'celsius_to_fahrenheit', 'format_currency', 'validate_email'.",
        },
        description: {
          type: "string",
          description:
            "Human-readable description of what the tool does. This is shown to the LLM to " +
            "decide when to call the tool. Be specific about inputs, outputs, and use cases.",
        },
        code: {
          type: "string",
          description:
            "JavaScript source code to execute. Runs in a sandboxed vm with no network, " +
            "filesystem, or require() access. Available globals: args (tool arguments), " +
            "console.log/warn/error, JSON, Math, Date, RegExp, Array, Object, Map, Set, " +
            "String, Number, Boolean, Promise, TextEncoder, TextDecoder. " +
            "The last expression's value becomes the tool's return value. " +
            "Example: 'const { celsius } = args; (celsius * 9/5) + 32'",
        },
        parameters: {
          type: "array",
          description:
            "Array of parameter definitions. Each parameter has a name, type, description, " +
            "and whether it's required. These become the args the LLM passes when calling the tool.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  "Parameter name (becomes a key on the `args` object)",
              },
              type: {
                type: "string",
                description: "JSON Schema type",
                enum: ["string", "number", "boolean", "integer"],
              },
              description: {
                type: "string",
                description: "Description shown to the LLM for this parameter",
              },
              required: {
                type: "boolean",
                description:
                  "Whether this parameter is required. Default: false",
              },
              enum: {
                type: "array",
                items: { type: "string" },
                description: "Optional array of allowed values",
              },
            },
            required: ["name", "type", "description"],
          },
        },
        enabled: {
          type: "boolean",
          description:
            "Whether the tool is active and available for use. Default: true.",
        },
      },
      required: ["name", "description", "code"],
    },
  },
  {
    name: "create_privileged_tool",
    dataSource: onDemand("Prism custom_tools collection"),
    description:
      "Create a new privileged custom tool with full Node.js access. Unlike create_custom_tool " +
      "(sandboxed), privileged tools can use require(), fetch(), process, setTimeout, Buffer, " +
      "child_process, fs, and all other Node.js built-ins. " +
      "Tool arguments from the LLM are injected as a global `args` object. " +
      "Use console.log() to produce output and return a value as the last expression. " +
      "Once created, the tool is persisted and available in future agent sessions. " +
      "Use this when the tool needs network access (HTTP/fetch), filesystem operations, " +
      "shell commands (child_process), or any Node.js module. " +
      "For pure computation without system access, prefer create_custom_tool instead.",
    endpoint: {
      method: "POST",
      path: "/agentic/privileged-tool/create",
      bodyParams: ["name", "description", "code", "parameters", "enabled"],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Unique tool name (snake_case). This becomes the function name the LLM calls. " +
            "Example: 'ping_host', 'fetch_api_data', 'check_disk_space'.",
        },
        description: {
          type: "string",
          description:
            "Human-readable description of what the tool does. This is shown to the LLM to " +
            "decide when to call the tool. Be specific about inputs, outputs, and use cases.",
        },
        code: {
          type: "string",
          description:
            "JavaScript source code to execute with full Node.js access. Available globals: " +
            "args (tool arguments), require() (Node.js modules), fetch() (HTTP requests), " +
            "process, Buffer, URL, setTimeout/setInterval, AbortController, and all standard " +
            "JS built-ins. Use require('child_process') for shell commands, require('fs') for " +
            "file operations, etc. The last expression's value becomes the tool's return value. " +
            "Example: 'const res = await fetch(args.url); const data = await res.json(); data'",
        },
        parameters: {
          type: "array",
          description:
            "Array of parameter definitions. Each parameter has a name, type, description, " +
            "and whether it's required. These become the args the LLM passes when calling the tool.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  "Parameter name (becomes a key on the `args` object)",
              },
              type: {
                type: "string",
                description: "JSON Schema type",
                enum: ["string", "number", "boolean", "integer"],
              },
              description: {
                type: "string",
                description: "Description shown to the LLM for this parameter",
              },
              required: {
                type: "boolean",
                description:
                  "Whether this parameter is required. Default: false",
              },
              enum: {
                type: "array",
                items: { type: "string" },
                description: "Optional array of allowed values",
              },
            },
            required: ["name", "type", "description"],
          },
        },
        enabled: {
          type: "boolean",
          description:
            "Whether the tool is active and available for use. Default: true.",
        },
      },
      required: ["name", "description", "code"],
    },
  },
  {
    name: "list_custom_tools",
    dataSource: onDemand("Prism custom_tools collection"),
    description:
      "List all custom tools defined for the current project and user. Returns each tool's " +
      "name, description, code, parameters, enabled status, and MongoDB ID. " +
      "Use this to discover existing custom tools before creating new ones (to avoid duplicates), " +
      "or when the user asks to see, review, or manage their custom tool definitions.",
    endpoint: {
      path: "/agentic/custom-tool/list",
    },
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "update_custom_tool",
    dataSource: onDemand("Prism custom_tools collection"),
    description:
      "Update an existing custom tool definition (sandboxed or privileged). Accepts partial updates — only the fields " +
      "you provide will be changed. Use list_custom_tools first to find the tool's ID. " +
      "Common updates include fixing bugs in the code, modifying parameters, updating the " +
      "description, changing the execution tier, or enabling/disabling the tool.",
    endpoint: {
      method: "POST",
      path: "/agentic/custom-tool/update",
      bodyParams: [
        "id",
        "name",
        "description",
        "code",
        "parameters",
        "execution",
        "enabled",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "MongoDB ObjectId of the tool to update (from list_custom_tools).",
        },
        name: {
          type: "string",
          description:
            "New tool name (snake_case). Leave unset to keep the current name.",
        },
        description: {
          type: "string",
          description:
            "Updated description. Leave unset to keep the current description.",
        },
        code: {
          type: "string",
          description:
            "Updated JavaScript code. Leave unset to keep the current code.",
        },
        parameters: {
          type: "array",
          description:
            "Updated parameter definitions (replaces existing parameters entirely).",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: {
                type: "string",
                enum: ["string", "number", "boolean", "integer"],
              },
              description: { type: "string" },
              required: { type: "boolean" },
              enum: { type: "array", items: { type: "string" } },
            },
            required: ["name", "type", "description"],
          },
        },
        execution: {
          type: "string",
          enum: ["sandboxed", "privileged"],
          description:
            "Execution tier. 'sandboxed': isolated vm with no network/fs/require. " +
            "'privileged': full Node.js access with require, fetch, process, etc. " +
            "Leave unset to keep the current tier.",
        },
        enabled: {
          type: "boolean",
          description: "Set to false to disable the tool without deleting it.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_custom_tool",
    dataSource: onDemand("Prism custom_tools collection"),
    description:
      "Permanently delete a custom tool definition. The tool will no longer appear in the " +
      "agent's tool suite. Use list_custom_tools first to find the tool's ID. " +
      "This action cannot be undone.",
    endpoint: {
      method: "POST",
      path: "/agentic/custom-tool/delete",
      bodyParams: ["id"],
    },
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "MongoDB ObjectId of the tool to delete (from list_custom_tools).",
        },
      },
      required: ["id"],
    },
  },

  // ── Tool Discovery (Meta-Tool) ────────────────────────────
  {
    name: "search_tools",
    dataSource: onDemand("ToolSchemaService"),
    description:
      "Search for available tools by keyword, domain, or label. Returns matching tool names, " +
      "descriptions, and schemas. Use this to discover what capabilities are available when " +
      "you need a tool you haven't used before, or to find domain-specific tools (e.g. weather, " +
      "finance, health). This is a read-only discovery tool — it does not execute anything.",
    endpoint: {
      method: "POST",
      path: "/agentic/tool/search",
      bodyParams: ["query", "domain", "label", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search keyword(s) to match against tool names and descriptions. " +
            "Example: 'weather', 'file read', 'stock price', 'image generation'.",
        },
        domain: {
          type: "string",
          description:
            "Filter by tool domain. Known domains include: 'Weather & Environment', " +
            "'Finance & Markets', 'Health & Nutrition', 'Knowledge & Reference', " +
            "'Workspace', 'Web', 'Browser', 'Task Management', 'Communication', 'Creative', etc.",
        },
        label: {
          type: "string",
          description:
            "Filter by label category (e.g. 'coding', 'web', 'smart_home').",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (1–50). Default: 20.",
        },
      },
      required: [],
    },
  },

  // ── Cron Jobs ──────────────────────────────────────────────
  {
    name: "create_cron_job",
    dataSource: onDemand("AgenticSchedulerService"),
    description:
      "Create a persistent cron job or a manual/event-driven remote trigger. " +
      "Cron jobs persist across sessions and execute unattended in the background. " +
      "Supports hourly, daily (at scheduleTime), weekly (on scheduleDay at scheduleTime), " +
      "cron expression (via cronExpression), or trigger (fire manually/remotely using trigger_cron_job).",
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
          description:
            "Human-readable name for this cron job (e.g. 'Daily Git Status check').",
        },
        prompt: {
          type: "string",
          description:
            "The prompt to send to the background agent. Must be self-contained since " +
            "there is no prior conversation context for the background run.",
        },
        scheduleType: {
          type: "string",
          enum: ["hourly", "daily", "weekly", "cron", "trigger", "once"],
          description:
            "The schedule type: 'hourly' runs at minute 0; 'daily' runs every day at scheduleTime; " +
            "'weekly' runs on scheduleDay at scheduleTime; 'cron' uses standard 5-field cronExpression; " +
            "'trigger' only fires when triggered manually or remotely; 'once' runs a single time at a specific scheduleDate and scheduleTime.",
        },
        cronExpression: {
          type: "string",
          description:
            "Standard 5-field cron expression (e.g. '0 9 * * *' for daily at 9 AM). Required for 'cron' type.",
        },
        scheduleTime: {
          type: "string",
          description:
            "Time of day in HH:MM format (e.g. '09:00' or '17:30'). Used for 'daily', 'weekly', and 'once' types.",
        },
        scheduleDay: {
          type: "number",
          description:
            "Day of the week as 0-6 (0 is Sunday, 6 is Saturday). Used for 'weekly' type.",
        },
        scheduleDate: {
          type: "string",
          description:
            "Date of the single execution in YYYY-MM-DD format (e.g. '2026-05-25'). Required for 'once' type.",
        },
        agent: {
          type: "string",
          description:
            "Optional agent persona to run (e.g. 'CODING'). Default: 'CODING'.",
        },
        provider: {
          type: "string",
          description:
            "Optional LLM provider (e.g. 'anthropic', 'openai', 'google'). Default: 'anthropic'.",
        },
        model: {
          type: "string",
          description:
            "Optional LLM model (e.g. 'claude-sonnet-4-5-20250929', 'gpt-5.4').",
        },
      },
      required: ["name", "prompt", "scheduleType"],
    },
  },
  {
    name: "list_cron_jobs",
    dataSource: onDemand("AgenticSchedulerService"),
    description:
      "List all cron jobs and background triggers currently configured in the workspace project.",
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
    description:
      "Delete an existing cron job or trigger by its UUID or unique name.",
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
          description:
            "The unique UUID or exact name of the cron job to delete.",
        },
      },
      required: ["scheduleId"],
    },
  },
  {
    name: "trigger_cron_job",
    dataSource: onDemand("AgenticSchedulerService"),
    description:
      "Trigger a cron job or remote trigger to run in the background immediately. " +
      "Optionally pass context payload variables to be appended to the agent run prompt.",
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
          description:
            "The unique UUID or exact name of the cron job or trigger to fire.",
        },
        payload: {
          type: "object",
          description:
            "Optional key-value object containing context details appended to the run prompt. " +
            "Example: { trigger: 'webhook', ref: 'main', status: 'success' }.",
        },
      },
      required: ["triggerName"],
    },
  },

  // ── Notebook Editing ──────────────────────────────────────
  {
    name: "notebook_edit",
    dataSource: onDemand("AgenticNotebookService"),
    description:
      "Edit Jupyter Notebook (.ipynb) files. Supports structured cell operations: " +
      "list_cells (enumerate all cells with previews), get_cell (read full cell content), " +
      "insert_cell (add a new cell), replace_cell (update content/type), delete_cell (remove a cell). " +
      "All operations work on the notebook's JSON structure — no raw text editing needed.",
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
          description: "Absolute path to the .ipynb notebook file.",
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
          description:
            "Operation to perform. 'list_cells': overview of all cells. 'get_cell': read one cell. " +
            "'insert_cell': add a cell at position. 'replace_cell': update a cell. 'delete_cell': remove a cell.",
        },
        cellIndex: {
          type: "number",
          description:
            "0-based cell index. Required for get_cell, replace_cell, delete_cell. " +
            "Optional for insert_cell (defaults to appending at end).",
        },
        content: {
          type: "string",
          description:
            "Cell source content. Required for insert_cell, optional for replace_cell.",
        },
        cellType: {
          type: "string",
          enum: ["code", "markdown", "raw"],
          description:
            "Cell type. Default: 'code' for insert, unchanged for replace.",
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
    description:
      "Use this tool to reason through complex problems step-by-step before acting. " +
      "Write your private reasoning, analysis, or plan here — this content is NOT shown to the user. " +
      "Use this when you need to: break down a multi-step task, weigh trade-offs between approaches, " +
      "analyze information from previous tool calls, plan your next actions, or reason about ambiguous requirements. " +
      "This tool does not execute anything — it simply records your thinking for context continuity.",
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
          description:
            "Your private reasoning, analysis, or plan. Be thorough — this is your scratchpad.",
        },
      },
      required: ["thought"],
    },
  },
  {
    name: "sleep",
    dataSource: compute("timer"),
    description:
      "Pause execution for a specified duration. Use for polling workflows — e.g. wait for a build " +
      "to finish, a server to restart, or a deployment to propagate before checking results. " +
      "Maximum duration is 120 seconds. The pause can be cancelled if the user aborts the session.",
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
          description: "How long to wait in seconds (1–120). Default: 5.",
        },
        reason: {
          type: "string",
          description:
            "Brief explanation of why you are waiting (shown to the user).",
        },
      },
      required: ["duration_seconds"],
    },
  },
  {
    name: "synthetic_output",
    dataSource: compute("json-schema"),
    description:
      "Produce a structured JSON output conforming to a defined schema. Use this when the user " +
      "or a downstream system needs machine-readable data rather than natural language. " +
      "Provide the output format as a JSON Schema object and the data that conforms to it. " +
      "The tool validates the data against the schema and returns the validated result. " +
      "Use cases: API-like responses, data extraction, typed reports, pipeline outputs.",
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
          description:
            "JSON Schema definition for the expected output structure. " +
            "Example: { type: 'object', properties: { title: { type: 'string' }, score: { type: 'number' } }, required: ['title'] }.",
        },
        data: {
          type: "object",
          description:
            "The structured data to output. Must conform to the provided schema. " +
            "Example: { title: 'My Report', score: 95 }.",
        },
        label: {
          type: "string",
          description:
            "Optional label for this output (e.g. 'analysis_result', 'extracted_entities').",
        },
      },
      required: ["data"],
    },
  },

  // ── Cron Expression Parser ─────────────────────────────────
  {
    name: "parse_cron_expression",
    dataSource: compute("internal"),
    description:
      "Parse, validate, and explain a standard 5-field cron expression (minute hour day month weekday). " +
      "Returns a human-readable explanation of the schedule, the expanded values for each field, " +
      "and the next N execution times. Useful for debugging scheduled tasks, cron jobs, and periodic automations.",
    endpoint: {
      path: "/compute/cron/parse",
      queryParams: ["expression", "count", "from"],
    },
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "Standard 5-field cron expression. Format: 'minute hour dayOfMonth month dayOfWeek'. " +
            "Examples: '*/5 * * * *' (every 5 min), '0 9 * * 1-5' (9am weekdays), '30 2 1 * *' (2:30am on 1st of month)",
        },
        count: {
          type: "number",
          description:
            "Number of next execution times to compute (default: 5, max: 25)",
        },
        from: {
          type: "string",
          description:
            "ISO date to compute next executions from (default: now). E.g. '2026-01-01T00:00:00Z'",
        },
      },
      required: ["expression"],
    },
  },

  // ── Dota 2 (OpenDota) ─────────────────────────────────────────
  {
    name: "get_dota",
    dataSource: onDemand("OpenDota"),
    description:
      "Get Dota 2 game data from the OpenDota API. Supports multiple actions: " +
      "heroes (list all heroes with stats, filterable by role/attribute), " +
      "hero (get details for a specific hero by name or ID), " +
      "matchups (get best/worst hero matchups), " +
      "player (get player profile by Steam32 account ID), " +
      "player_matches (get a player's recent match history), " +
      "match (get detailed match data including all player stats), " +
      "pro_matches (get recent professional matches).",
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
          description: "What data to retrieve",
        },
        query: {
          type: "string",
          description:
            "Hero name or partial name (for action=hero or action=heroes with q filter)",
        },
        heroId: {
          type: "number",
          description: "Hero ID (for action=matchups)",
        },
        accountId: {
          type: "number",
          description:
            "Steam32 Account ID (for action=player or action=player_matches)",
        },
        matchId: {
          type: "number",
          description: "Match ID (for action=match)",
        },
        limit: {
          type: "number",
          description: "Number of results to return (default: 10, max: 50)",
        },
        role: {
          type: "string",
          description:
            "Filter heroes by role (for action=heroes). E.g. 'Carry', 'Support', 'Nuker'",
        },
        attr: {
          type: "string",
          enum: ["str", "agi", "int", "all"],
          description: "Filter heroes by primary attribute (for action=heroes)",
        },
      },
      required: ["action"],
    },
  },

  // ── Bonfire (Cozy Fire Pit) ───────────────────────────────────
  {
    name: "create_bonfire",
    dataSource: compute("Bonfire Generator"),
    description:
      "Start a cozy, custom-designed visual bonfire. You can configure the wood type, wind breeze, flame intensity, custom color chemistry, toss custom items into the fire to incinerate them, or roast marshmallows! Returns a gorgeous colorful ANSI art display for the terminal and a responsive, GPU-accelerated animated HTML/CSS embed to show the user.",
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
          description:
            "The type of wood to burn (affects logs rendering, flame characteristics, and embers). Default: 'oak'.",
        },
        logsCount: {
          type: "number",
          description:
            "Number of logs stacked at the base of the fire (1 to 10). Default: 4.",
        },
        breezeSpeed: {
          type: "number",
          description:
            "Wind breeze speed in MPH (0 to 50). High breeze tilts the flames and blows sparks horizontally to the right. Default: 5.",
        },
        fireColor: {
          type: "string",
          enum: ["classic", "emerald", "sapphire", "amethyst", "ghostly"],
          description:
            "The chemical color chemistry of the flame (classic orange-red, green emerald, blue sapphire, purple amethyst, cyan-white ghostly). Default: 'classic'.",
        },
        intensity: {
          type: "string",
          enum: ["ember", "spark", "cozy", "blazing", "inferno"],
          description:
            "The fire's heat and size (ember, spark, cozy, blazing, or inferno). Default: 'cozy'.",
        },
        marshmallows: {
          type: "number",
          description:
            "Number of marshmallows to toast on sticks over the fire (0, 1, or 2). Default: 0.",
        },
        itemToBurn: {
          type: "string",
          description:
            "An optional custom item name to toss into the fire and incinerate (e.g. 'bugs', 'homework').",
        },
      },
    },
  },

  // ── Music (MusicBrainz) ────────────────────────────────────────
  {
    name: "get_music",
    dataSource: onDemand("MusicBrainz"),
    description:
      "Search and retrieve music metadata from MusicBrainz — the open music encyclopedia. Supports: " +
      "search_artists (find artists by name), " +
      "artist (get detailed artist info including discography, social links, tags), " +
      "search_albums (find albums/release groups by title, optionally filtered by artist), " +
      "album (get album details including track listing, cover art URL, tags), " +
      "search_tracks (find recordings/tracks by title, optionally filtered by artist).",
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
          description: "What music data to retrieve",
        },
        q: {
          type: "string",
          description:
            "Search query — artist name, album title, or track title (for search actions)",
        },
        mbid: {
          type: "string",
          description: "MusicBrainz ID (for action=artist or action=album)",
        },
        artist: {
          type: "string",
          description:
            "Artist name to narrow album/track search results (for action=search_albums or action=search_tracks)",
        },
        limit: {
          type: "number",
          description: "Number of search results to return (default: 10)",
        },
      },
      required: ["action"],
    },
  },

  // ── Wayback Machine ────────────────────────────────────────────
  {
    name: "get_wayback_snapshot",
    dataSource: onDemand("Internet Archive"),
    description:
      "Check if a URL has been archived by the Wayback Machine and retrieve snapshots. " +
      "Two actions: 'snapshot' checks availability and gets the closest archived snapshot " +
      "(optionally near a specific date). 'history' returns the capture timeline with " +
      "deduplicated snapshots, each with archive URL, status code, and size.",
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
          description:
            "'snapshot' for closest available capture, 'history' for capture timeline",
        },
        url: {
          type: "string",
          description:
            "The URL to look up in the Wayback Machine (e.g. 'https://example.com')",
        },
        timestamp: {
          type: "string",
          description:
            "For action=snapshot: find the closest snapshot to this date (YYYYMMDD format)",
        },
        limit: {
          type: "number",
          description:
            "For action=history: max number of snapshots to return (default: 20, max: 100)",
        },
        from: {
          type: "string",
          description: "For action=history: start date filter (YYYYMMDD)",
        },
        to: {
          type: "string",
          description: "For action=history: end date filter (YYYYMMDD)",
        },
      },
      required: ["action", "url"],
    },
  },

  // ── Torrent Search & Download (qBittorrent) ────────────────────
  {
    name: "torrent_search",
    dataSource: onDemand("qBittorrent"),
    description:
      "Search for torrents across multiple public torrent indexers via qBittorrent's search plugin " +
      "system. Searches run against all enabled plugins (60+ public sites including ThePirateBay, " +
      "EZTV, Nyaa, YTS, 1337x, TorrentGalaxy, etc.). Returns a list of results with name, size, " +
      "seeds, leechers, magnet link, and source site. Results are sorted by seed count (most popular first). " +
      "Use category filters to narrow results. After finding a torrent, use torrent_download to add it.",
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
          description: "Must be 'search'",
        },
        q: {
          type: "string",
          description:
            "Search query. Use descriptive terms for best results. " +
            "Examples: 'Ubuntu 24.04 LTS', 'Blender 4.0', 'linux iso', 'public domain film'.",
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
          description: "Category filter to narrow results. Default: 'all'.",
        },
        plugins: {
          type: "string",
          description:
            "Specific search plugins to use (pipe-separated names) or 'enabled' for all active plugins. " +
            "Use torrent_status action=plugins to see installed plugins. Default: 'enabled'.",
        },
        limit: {
          type: "number",
          description: "Max results to return (1–100). Default: 50.",
        },
        timeout: {
          type: "number",
          description:
            "Search timeout in milliseconds (max 60000). Default: 30000.",
        },
      },
      required: ["action", "q"],
    },
  },
  {
    name: "torrent_download",
    dataSource: onDemand("qBittorrent"),
    description:
      "Add a torrent for download via qBittorrent. Accepts magnet links or .torrent file URLs. " +
      "The torrent is added to the qBittorrent instance and begins downloading immediately " +
      "(unless paused=true). Optionally specify a save path, category, and tags for organization. " +
      "Use torrent_search first to find magnet links, then pass the 'link' field here.",
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
          description:
            "Magnet link or .torrent file URL. " +
            "Example: 'magnet:?xt=urn:btih:...' or 'https://example.com/file.torrent'.",
        },
        savePath: {
          type: "string",
          description:
            "Directory path where the torrent should be saved. " +
            "Example: '/downloads/movies'. Uses qBittorrent default if not specified.",
        },
        category: {
          type: "string",
          description:
            "Category label for the torrent (e.g. 'movies', 'software', 'linux-isos').",
        },
        tags: {
          type: "string",
          description: "Comma-separated tags (e.g. 'hd,remux,2024').",
        },
        paused: {
          type: "boolean",
          description:
            "If true, add the torrent in paused state. Default: false (starts immediately).",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "torrent_status",
    dataSource: onDemand("qBittorrent"),
    description:
      "Check torrent download status, list active/completed torrents, view transfer speeds, " +
      "manage installed search plugins, or pause/resume torrents. Actions: " +
      "'status' lists torrents (filterable by state), " +
      "'plugins' lists installed search plugins, " +
      "'transfer' shows global upload/download speeds, " +
      "'pause' pauses torrents by hash, " +
      "'resume' resumes paused torrents.",
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
          description: "What to do.",
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
          description:
            "For action=status: filter torrents by state. Default: 'all'.",
        },
        category: {
          type: "string",
          description: "For action=status: filter by category label.",
        },
        sort: {
          type: "string",
          description:
            "For action=status: sort field (e.g. 'name', 'size', 'progress', 'added_on'). Default: 'added_on'.",
        },
        limit: {
          type: "number",
          description:
            "For action=status: max torrents to return (1–200). Default: 50.",
        },
        hashes: {
          type: "string",
          description:
            "For action=pause/resume: pipe-separated torrent hashes, or 'all'.",
        },
      },
      required: ["action"],
    },
  },
];

// ────────────────────────────────────────────────────────────
// Domain Taxonomy — groups tools by functional area
// ────────────────────────────────────────────────────────────

const TOOL_DOMAINS = {
  // Weather & Environment
  get_weather: "Weather & Environment",
  get_local_environment: "Weather & Environment",
  get_weather_forecast: "Weather & Environment",
  get_avalanche_forecast: "Weather & Environment",
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
  get_weather_warnings: "Weather & Environment",
  get_detailed_air_quality: "Weather & Environment",
  get_weather_history: "Weather & Environment",
  get_weather_marine: "Weather & Environment",
  get_weather_astronomy: "Weather & Environment",
  get_weather_alerts: "Weather & Environment",

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

  // Finance
  get_stock: "Finance",
  get_macro: "Finance",
  get_market_news: "Finance",
  get_earnings_calendar: "Finance",

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
  get_youtube_video: "Knowledge",
  read_url: "Core Tools",
  get_package_info: "Knowledge",
  read_pdf_url: "Knowledge",
  read_rss_feed: "Knowledge",
  get_pypi_package: "Knowledge",

  // Movies & TV
  search_media: "Movies & TV",
  get_media_details: "Movies & TV",
  get_media_credits: "Movies & TV",
  get_trending_media: "Movies & TV",
  browse_media: "Movies & TV",
  get_media_genres: "Movies & TV",

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
  get_next_bus: "Transit",
  get_transit_stop_info: "Transit",
  search_transit_stops_nearby: "Transit",
  get_transit_route_info: "Transit",

  // Utilities
  search_airports: "Utilities",
  calculate_precise: "Core Tools",
  convert_currency: "Utilities",
  get_time_in_timezone: "Utilities",
  get_ip_info: "Utilities",
  search_nearby_places: "Utilities",
  search_places: "Utilities",
  generate_map: "Utilities",
  generate_chart: "Utilities",
  get_public_webcams: "Utilities",
  execute_python: "Utilities",

  // Compute
  execute_javascript: "Core Tools",
  execute_shell: "Compute",
  convert_units: "Compute",
  parse_datetime: "Compute",
  transform_json: "Compute",
  generate_csv: "Compute",
  generate_qr_code: "Compute",
  render_latex: "Compute",
  generate_diagram: "Compute",
  diff_text: "Compute",
  generate_hash: "Compute",
  test_regex: "Compute",
  encode_decode: "Compute",
  convert_color: "Compute",
  manipulate_image: "Compute",
  convert_image_to_ascii: "Compute",
  convert_video_to_gif: "Compute",
  parse_cron_expression: "Compute",
  draw_turtle: "Compute",
  create_3d_mesh: "Compute",
  create_3d_scene: "Compute",
  create_3d_model: "Compute",
  create_3d_voxel: "Compute",
  think: "Core Tools",
  sleep: "Core Tools",
  synthetic_output: "Core Tools",

  // Gaming
  get_dota: "Gaming",
  create_bonfire: "Gaming",

  // Music
  get_music: "Knowledge",

  // Wayback Machine
  get_wayback_snapshot: "Knowledge",

  // Torrent
  torrent_search: "Torrent",
  torrent_download: "Torrent",
  torrent_status: "Torrent",

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
  read_file: "Workspace",
  write_file: "Workspace",
  str_replace_file: "Workspace",
  block_replace_file: "Workspace",
  multi_replace_file: "Workspace",
  patch_file: "Workspace",
  multi_file_read: "Workspace",
  file_info: "Workspace",
  file_diff: "Workspace",
  move_file: "Workspace",
  delete_file: "Workspace",

  // Agentic — Workspace Search
  list_directory: "Workspace",
  grep_search: "Workspace",
  glob_files: "Workspace",
  project_summary: "Workspace",

  // Agentic — Web
  read_web_page: "Web",
  read_pdf: "Web",
  read_docx: "Web",
  read_spreadsheet: "Web",
  search_web: "Core Tools",

  // Agentic — Command Execution
  run_command: "Workspace",

  // Agentic — Git

  git: "Workspace",
  // Agentic — Browser Automation
  browser_action: "Browser",
  browser_script: "Browser",

  // Agentic — Code Intelligence (LSP)
  lsp_action: "Workspace",

  // Agentic — Task Management
  create_task: "Core Tools",
  get_task: "Core Tools",
  list_tasks: "Core Tools",
  update_task: "Core Tools",

  // Agentic — Memory Persistence
  upsert_memory: "Core Tools",

  // Agentic — Agent Management
  create_custom_agent: "Agent Management",
  list_custom_agents: "Agent Management",
  update_custom_agent: "Agent Management",

  // Agentic — Custom Tool Management
  create_custom_tool: "Tool Management",
  create_privileged_tool: "Tool Management",
  list_custom_tools: "Tool Management",
  update_custom_tool: "Tool Management",
  delete_custom_tool: "Tool Management",

  // Agentic — Tool Discovery
  search_tools: "Core Tools",

  // Cron Jobs
  create_cron: "Cron Jobs",
  remote_trigger: "Cron Jobs",
  create_cron_job: "Cron Jobs",
  list_cron_jobs: "Cron Jobs",
  delete_cron_job: "Cron Jobs",
  trigger_cron_job: "Cron Jobs",

  // Agentic — Notebook Editing
  notebook_edit: "Workspace",

  // Communication (Twilio)
  twilio_send_sms: "Communication",
  twilio_list_messages: "Communication",
  twilio_get_account: "Communication",
  twilio_lookup_number: "Communication",
  twilio_list_numbers: "Communication",

  // Creative (Image Generation, Vision, Audio)
  get_emoji_combination: "Creative",
  get_emoji_combinations: "Creative",
  generate_image: "Creative",

  describe_image: "Creative",
  text_to_speech: "Creative",
  generate_audio: "Creative",
  create_vector_animation: "Creative",
  speech_to_text: "Creative",

  // Discord (Lupos DB)
  discord_message_search: "Discord",
  get_discord_message_analytics: "Discord",
  discord_server_activity: "Discord",
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
  lifx_list_lights: "Smart Home",
  lifx_set_state: "Smart Home",
  lifx_toggle_power: "Smart Home",
  lifx_breathe_effect: "Smart Home",
  lifx_pulse_effect: "Smart Home",
  lifx_move_effect: "Smart Home",
  lifx_flame_effect: "Smart Home",
  lifx_morph_effect: "Smart Home",
  lifx_set_states: "Smart Home",
  lifx_set_state_delta: "Smart Home",
  lifx_effects_off: "Smart Home",
  lifx_list_scenes: "Smart Home",
  lifx_activate_scene: "Smart Home",
  lifx_night_lock: "Smart Home",
  lifx_health: "Smart Home",
};

// ────────────────────────────────────────────────────────────
// Tool Emojis — per-tool emoji displayed in the client UI
// ────────────────────────────────────────────────────────────

const TOOL_EMOJIS = {
  // Weather & Environment
  get_weather: "🌤️",
  get_local_environment: "🌍",
  get_weather_forecast: "📅",
  get_avalanche_forecast: "🏔️",
  get_earthquakes: "🌋",
  get_solar_activity: "☀️",
  get_aurora_forecast: "🌌",
  get_solar_wind: "💨",
  get_twilight: "🌅",
  get_tides: "🌊",
  get_wildfires: "🔥",
  get_iss_location: "🛸",
  get_near_earth_objects: "☄️",
  get_space_launches: "🚀",
  get_nasa_apod: "🔭",
  get_weather_warnings: "⚠️",
  get_detailed_air_quality: "🫁",
  get_pollen_forecast: "🌸",
  get_weather_history: "📊",
  get_weather_marine: "⚓",
  get_weather_astronomy: "🌙",
  get_weather_alerts: "🚨",

  // Events
  get_events: "🎟️",

  // Sports
  get_live_scores: "⚽",
  get_upcoming_matches: "📅",
  get_recent_results: "🏆",
  get_league_standings: "📋",
  get_match_details: "📺",
  get_head_to_head: "⚔️",
  search_teams: "🏟️",
  search_players: "🧑‍🤝‍🧑",
  get_team_squad: "👥",
  get_league_top_scorers: "⭐",

  // Markets & Commodities
  get_commodities: "📦",

  // Trends
  get_trends: "📈",

  // Products
  search_products: "🛒",
  get_trending_products: "🔥",
  get_watchlist_availability: "📋",
  check_sku_availability: "✅",
  get_costco_us_products: "🏪",
  get_costco_ca_products: "🏪",

  // Finance
  get_stock: "💹",
  get_macro: "🏛️",
  get_market_news: "📰",
  get_earnings_calendar: "💰",

  // Knowledge
  search_books: "📚",
  get_country: "🗺️",
  get_element: "⚛️",
  get_exoplanet: "🪐",
  get_anime: "🎌",
  get_word_definition: "📖",
  search_papers: "🎓",
  get_wikipedia_summary: "📘",
  get_on_this_day: "📜",
  list_development_indicators: "📊",
  get_youtube_video: "▶️",
  read_url: "🌐",
  get_package_info: "📦",
  read_pdf_url: "📄",
  read_rss_feed: "📡",
  get_pypi_package: "🐍",
  get_music: "🎵",
  get_wayback_snapshot: "🕰️",

  // Movies & TV
  search_media: "🎬",
  get_media_details: "🎥",
  get_media_credits: "🌟",
  get_trending_media: "🔥",
  browse_media: "🍿",
  get_media_genres: "🎭",

  // Health
  rank_foods_by_category: "🥗",
  search_drugs: "💊",
  get_drug_adverse_events: "⚕️",
  get_drug_recalls: "🚫",
  search_usda_nutrition: "🍎",
  rank_foods_by_nutrient: "📊",
  compare_food_nutrition: "⚖️",
  get_food_categories: "🗂️",
  get_nutrient_types: "🧬",
  list_category_nutrients: "📋",
  search_foods_by_taxonomy: "🔍",
  get_food_taxonomy: "🌿",
  get_nutritional_requirements: "📏",
  list_drug_dosage_forms: "💉",
  search_gym_exercises: "🏋️",
  get_gym_exercise_categories: "🗂️",
  get_gym_exercise_by_id: "🎯",
  calculate_caloric_needs: "🔢",
  analyze_nutrient_gaps: "📉",
  search_food_substitutes: "🔄",
  estimate_exercise_calories: "🏃",
  calculate_hydration_needs: "💧",
  build_meal_plan: "🍽️",
  check_drug_nutrient_interactions: "⚠️",

  // Transit
  get_next_bus: "🚌",
  get_transit_stop_info: "🚏",
  search_transit_stops_nearby: "📍",
  get_transit_route_info: "🗺️",

  // Utilities
  search_airports: "✈️",
  calculate_precise: "🧮",
  convert_currency: "💱",
  get_time_in_timezone: "🕐",
  get_ip_info: "🔎",
  search_nearby_places: "📍",
  search_places: "🗺️",
  generate_map: "🗺️",
  generate_chart: "📊",
  get_public_webcams: "📷",
  execute_python: "🐍",

  // Compute
  execute_javascript: "⚡",
  execute_shell: "🖥️",
  convert_units: "📐",
  parse_datetime: "📅",
  transform_json: "🔧",
  generate_csv: "📋",
  generate_qr_code: "📱",
  render_latex: "📐",
  generate_diagram: "📊",
  diff_text: "🔀",
  generate_hash: "🔐",
  test_regex: "🔣",
  encode_decode: "🔁",
  convert_color: "🎨",
  manipulate_image: "🖼️",
  convert_image_to_ascii: "🎨",
  convert_video_to_gif: "🎬",
  parse_cron_expression: "⏰",
  draw_turtle: "🐢",
  create_3d_mesh: "🔺",
  create_3d_scene: "🧊",
  create_3d_model: "🌐",
  create_3d_voxel: "🧱",

  // Reasoning & Control Flow
  think: "🧠",
  sleep: "💤",
  synthetic_output: "📝",

  // Gaming
  get_dota: "🎮",
  create_bonfire: "🔥",

  // Torrent
  torrent_search: "🔍",
  torrent_download: "⬇️",
  torrent_status: "📊",

  // Maritime
  get_tracked_vessels: "🚢",
  get_vessel_by_mmsi: "🚢",
  search_vessels: "⛵",
  get_vessels_in_area: "🗺️",
  get_ais_messages: "📡",

  // Energy
  get_energy_indicators: "⚡",
  get_energy_catalog: "📊",
  get_energy_facets: "🔋",
  search_energy: "📈",
  get_electricity_retail_sales: "🔌",
  get_petroleum_prices: "🛢️",
  get_natural_gas_prices: "🔥",

  // Agentic — File Operations
  read_file: "📄",
  write_file: "✏️",
  str_replace_file: "🔧",
  block_replace_file: "🧱",
  multi_replace_file: "🧱",
  patch_file: "🩹",
  multi_file_read: "📑",
  file_info: "📄",
  file_diff: "🔀",
  move_file: "📂",
  delete_file: "🗑️",
  notebook_edit: "📓",

  // Agentic — Search & Discovery
  list_directory: "📁",
  grep_search: "🔍",
  glob_files: "🔎",
  project_summary: "📋",

  // Agentic — Web
  read_web_page: "🌐",
  read_pdf: "📄",
  read_docx: "📝",
  read_spreadsheet: "📊",
  search_web: "🔍",

  // Agentic — Command Execution
  run_command: "▶️",

  // Agentic — Git
  git: "📦",

  // Agentic — Browser
  browser_action: "🌐",
  browser_script: "📜",

  // Agentic — Code Intelligence
  lsp_action: "🧩",

  // Agentic — Task Management
  create_task: "➕",
  get_task: "📋",
  list_tasks: "📝",
  update_task: "✏️",

  // Agentic — Memory
  upsert_memory: "🧠",

  // Agentic — Agent Management
  create_custom_agent: "🤖",
  list_custom_agents: "📋",
  update_custom_agent: "✏️",

  // Agentic — Tool Management
  create_custom_tool: "🔧",
  create_privileged_tool: "🔐",
  list_custom_tools: "📋",
  update_custom_tool: "✏️",
  delete_custom_tool: "🗑️",

  // Agentic — Meta
  search_tools: "🔍",

  // Cron Jobs
  create_cron: "⏰",
  remote_trigger: "📡",
  create_cron_job: "🗓️",
  list_cron_jobs: "📋",
  delete_cron_job: "🗑️",
  trigger_cron_job: "🚀",

  // Communication (Twilio)
  twilio_send_sms: "💬",
  twilio_list_messages: "📨",
  twilio_get_account: "📱",
  twilio_lookup_number: "📞",
  twilio_list_numbers: "📲",

  // Creative
  get_emoji_combination: "🍳",
  get_emoji_combinations: "🧑‍🍳",
  generate_image: "🖼️",

  describe_image: "👁️",
  text_to_speech: "🔊",
  generate_audio: "🔊",
  create_vector_animation: "🎬",
  speech_to_text: "🎤",

  // Discord
  discord_message_search: "🔍",
  get_discord_message_analytics: "📊",
  discord_server_activity: "📈",
  get_discord_guild_channels: "📁",
  get_discord_guild_members: "👥",
  get_discord_guild_emojis: "😀",
  get_bot_stats: "🤖",
  get_bot_guilds: "🌐",
  get_bot_activity_timeline: "📈",
  get_discord_user_heatmap_data: "🔥",
  get_discord_mention_leaderboard: "💬",
  get_discord_message_leaderboard: "📊",
  get_discord_word_frequencies: "🗣️",
  react_to_discord_message: "🎭",
  get_discord_voice_channel_members: "🔊",
  get_discord_user_profile: "👤",
  get_discord_channel_activity_stats: "📊",

  // Smart Home (LIFX)
  lifx_list_lights: "💡",
  lifx_set_state: "🎚️",
  lifx_toggle_power: "🔌",
  lifx_breathe_effect: "🌬️",
  lifx_pulse_effect: "💥",
  lifx_move_effect: "🔄",
  lifx_flame_effect: "🔥",
  lifx_morph_effect: "🌈",
  lifx_set_states: "💡",
  lifx_set_state_delta: "📊",
  lifx_effects_off: "⏹️",
  lifx_list_scenes: "🎬",
  lifx_activate_scene: "▶️",
  lifx_night_lock: "🌙",
  lifx_health: "❤️",
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

const TOOL_REQUIRED_KEYS = {
  // Movies & TV (all require TMDb API key — unified media tools)
  search_media: ["TMDB_API_KEY"],
  get_media_details: ["TMDB_API_KEY"],
  get_media_credits: ["TMDB_API_KEY"],
  get_trending_media: ["TMDB_API_KEY"],
  browse_media: ["TMDB_API_KEY"],
  get_media_genres: ["TMDB_API_KEY"],

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
  get_next_bus: ["TRANSLINK_API_KEY"],
  get_transit_stop_info: ["TRANSLINK_API_KEY"],
  search_transit_stops_nearby: ["TRANSLINK_API_KEY"],
  get_transit_route_info: ["TRANSLINK_API_KEY"],

  // Places (require Google Places API key)
  search_nearby_places: ["GOOGLE_PLACES_API_KEY"],
  search_places: ["GOOGLE_PLACES_API_KEY"],
  generate_map: ["GOOGLE_API_KEY"],

  // Weather (only specific Google-powered tools)
  get_detailed_air_quality: ["GOOGLE_API_KEY"],
  get_pollen_forecast: ["GOOGLE_API_KEY"],

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

  // Web Search (Brave primary — whole-web; Google CSE fallback — site-restricted)
  search_web: ["BRAVE_SEARCH_API_KEY"],

  // Communication (Twilio — all require account SID + auth token)
  twilio_send_sms: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  twilio_list_messages: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  twilio_get_account: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  twilio_lookup_number: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  twilio_list_numbers: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],

  // Creative (require Prism as LLM backend)
  generate_image: ["PRISM_SERVICE_URL"],
  describe_image: ["PRISM_SERVICE_URL"],
  text_to_speech: ["PRISM_SERVICE_URL"],
  speech_to_text: ["PRISM_SERVICE_URL"],

  // Agent Management (require Prism for CustomAgentService)
  create_custom_agent: ["PRISM_SERVICE_URL"],
  list_custom_agents: ["PRISM_SERVICE_URL"],
  update_custom_agent: ["PRISM_SERVICE_URL"],

  // Custom Tool Management (require Prism for custom_tools collection)
  create_custom_tool: ["PRISM_SERVICE_URL"],
  create_privileged_tool: ["PRISM_SERVICE_URL"],
  list_custom_tools: ["PRISM_SERVICE_URL"],
  update_custom_tool: ["PRISM_SERVICE_URL"],
  delete_custom_tool: ["PRISM_SERVICE_URL"],

  // Torrent (all require qBittorrent connection)
  torrent_search: ["QBITTORRENT_URL"],
  torrent_download: ["QBITTORRENT_URL"],
  torrent_status: ["QBITTORRENT_URL"],
};

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
    logger.info(
      `[ToolSchema] ✅ Re-enabled tool "${toolName}" at runtime`,
    );
  }
}

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
// Tool Labels — multi-value categorization for filtering
// ────────────────────────────────────────────────────────────
// Labels are orthogonal to domains. A tool can have multiple
// labels (e.g. ["coding", "web"]). Consumers can filter tools
// by label to surface relevant capabilities per context.
// ────────────────────────────────────────────────────────────

const TOOL_LABELS = {
  get_weather: ["location"],
  get_local_environment: ["location"],
  rank_foods_by_category: ["health"],
  search_drugs: ["health"],
  search_media: ["media"],
  get_media_details: ["media"],
  get_media_credits: ["media"],
  get_trending_media: ["media"],
  browse_media: ["media"],
  get_media_genres: ["media"],
  git: ["coding", "git"],
  search_books: ["reference"],
  get_country: ["reference"],
  get_element: ["reference"],
  get_exoplanet: ["reference"],
  search_airports: ["location"],
  get_events: ["location"],
  get_trends: ["web"],
  get_anime: ["media"],
  get_commodities: ["finance"],
  get_stock: ["finance"],
  get_macro: ["finance"],
  // ── Weather & Environment ───────────────────────────────
  get_weather_forecast: ["location"],
  get_weather_history: ["location"],
  get_weather_marine: ["location"],
  get_weather_astronomy: ["location"],
  get_weather_alerts: ["location"],
  get_avalanche_forecast: ["location"],
  get_earthquakes: ["location"],
  get_solar_activity: ["reference"],
  get_aurora_forecast: ["location"],
  get_solar_wind: ["reference"],
  get_twilight: ["location"],
  get_tides: ["location"],
  get_wildfires: ["location"],
  get_iss_location: ["reference"],
  get_near_earth_objects: ["reference"],
  get_space_launches: ["reference"],
  get_nasa_apod: ["reference"],
  get_weather_warnings: ["location"],
  get_detailed_air_quality: ["location", "health"],

  // ── Sports ───────────────────────────────────────────────
  get_live_scores: ["sports"],
  get_upcoming_matches: ["sports"],
  get_recent_results: ["sports"],
  get_league_standings: ["sports"],
  get_match_details: ["sports"],
  get_head_to_head: ["sports"],
  search_teams: ["sports"],
  search_players: ["sports"],
  get_team_squad: ["sports"],
  get_league_top_scorers: ["sports"],

  // ── Events ───────────────────────────────────────────────

  // ── Markets & Commodities ────────────────────────────────

  // ── Trends ───────────────────────────────────────────────

  // ── Products ─────────────────────────────────────────────
  search_products: ["shopping"],
  get_trending_products: ["shopping"],
  get_watchlist_availability: ["shopping"],
  check_sku_availability: ["shopping"],
  get_costco_us_products: ["shopping"],
  get_costco_ca_products: ["shopping"],

  // ── Finance ──────────────────────────────────────────────
  get_market_news: ["finance"],
  get_earnings_calendar: ["finance"],

  // ── Knowledge ────────────────────────────────────────────
  get_word_definition: ["reference"],
  search_papers: ["reference", "coding"],
  get_youtube_video: ["web"],
  read_url: ["web", "coding"],
  get_package_info: ["coding"],
  read_pdf_url: ["web"],
  read_rss_feed: ["web"],
  get_wikipedia_summary: ["reference"],
  get_on_this_day: ["reference"],
  list_development_indicators: ["reference"],
  get_pypi_package: ["coding", "reference"],

  // ── Movies & TV ──────────────────────────────────────────

  // ── Health ───────────────────────────────────────────────
  get_drug_adverse_events: ["health"],
  get_drug_recalls: ["health"],
  search_gym_exercises: ["health"],
  get_gym_exercise_categories: ["health"],
  get_gym_exercise_by_id: ["health"],
  search_usda_nutrition: ["health"],
  rank_foods_by_nutrient: ["health"],
  compare_food_nutrition: ["health"],
  get_food_categories: ["health"],
  get_nutrient_types: ["health"],
  list_category_nutrients: ["health"],
  search_foods_by_taxonomy: ["health"],
  get_food_taxonomy: ["health"],
  get_nutritional_requirements: ["health"],
  list_drug_dosage_forms: ["health"],
  calculate_caloric_needs: ["health"],
  analyze_nutrient_gaps: ["health"],
  search_food_substitutes: ["health"],
  estimate_exercise_calories: ["health"],
  calculate_hydration_needs: ["health"],
  build_meal_plan: ["health"],
  check_drug_nutrient_interactions: ["health"],
  get_pollen_forecast: ["health", "location"],

  // ── Transit ──────────────────────────────────────────────
  get_next_bus: ["location"],
  get_transit_stop_info: ["location"],
  search_transit_stops_nearby: ["location"],
  get_transit_route_info: ["location"],

  // ── Utilities ────────────────────────────────────────────
  execute_python: ["coding", "data"],
  calculate_precise: ["data"],
  convert_currency: ["finance", "data"],
  get_time_in_timezone: ["data"],
  get_ip_info: ["data"],
  search_nearby_places: ["location"],
  search_places: ["location"],
  generate_map: ["location"],
  generate_chart: ["data"],
  get_public_webcams: ["location"],

  // ── Compute ──────────────────────────────────────────────
  execute_javascript: ["coding", "data"],
  execute_shell: ["coding"],
  convert_units: ["data"],
  parse_datetime: ["data"],
  transform_json: ["coding", "data"],
  generate_csv: ["data"],
  generate_qr_code: ["data"],
  render_latex: ["data"],
  generate_diagram: ["data"],
  diff_text: ["coding", "data"],
  generate_hash: ["coding", "data"],
  test_regex: ["coding"],
  encode_decode: ["coding", "data"],
  convert_color: ["data"],
  manipulate_image: ["data", "creative"],
  convert_image_to_ascii: ["data", "creative"],
  convert_video_to_gif: ["data", "creative"],
  parse_cron_expression: ["coding", "automation", "data"],
  draw_turtle: ["coding", "creative", "data"],
  create_3d_mesh: ["creative", "data"],
  create_3d_scene: ["creative", "data"],
  create_3d_model: ["creative", "data"],
  create_3d_voxel: ["creative", "data"],
  think: ["coding"],
  sleep: ["coding"],
  synthetic_output: ["coding"],

  // ── Gaming ───────────────────────────────────────────────
  get_dota: ["reference", "media"],
  create_bonfire: ["creative"],

  // ── Music ─────────────────────────────────────────────────
  get_music: ["reference", "media"],

  // ── Wayback Machine ──────────────────────────────────────
  get_wayback_snapshot: ["web", "reference"],

  // ── Torrent ──────────────────────────────────────────────
  torrent_search: ["media", "download"],
  torrent_download: ["media", "download"],
  torrent_status: ["media", "download"],

  // ── Maritime ─────────────────────────────────────────────
  get_tracked_vessels: ["maritime"],
  get_vessel_by_mmsi: ["maritime"],
  search_vessels: ["maritime"],
  get_vessels_in_area: ["maritime"],
  get_ais_messages: ["maritime"],

  // ── Energy ───────────────────────────────────────────────
  get_energy_indicators: ["energy"],
  get_energy_catalog: ["energy"],
  get_energy_facets: ["energy"],
  search_energy: ["energy"],
  get_electricity_retail_sales: ["energy"],
  get_petroleum_prices: ["energy"],
  get_natural_gas_prices: ["energy"],

  // ── Agentic: File Operations ─────────────────────────────
  read_file: ["coding"],
  write_file: ["coding"],
  str_replace_file: ["coding"],
  block_replace_file: ["coding"],
  multi_replace_file: ["coding"],
  patch_file: ["coding"],
  multi_file_read: ["coding"],
  file_info: ["coding"],
  file_diff: ["coding"],
  move_file: ["coding"],
  delete_file: ["coding"],

  // ── Agentic: Search & Discovery ──────────────────────────
  list_directory: ["coding"],
  grep_search: ["coding"],
  glob_files: ["coding"],
  project_summary: ["coding"],

  // ── Agentic: Web ─────────────────────────────────────────
  read_web_page: ["coding", "web"],
  read_pdf: ["coding", "web"],
  read_docx: ["coding", "web"],
  read_spreadsheet: ["coding", "web", "data"],
  search_web: ["coding", "web"],

  // ── Agentic: Command Execution ───────────────────────────
  run_command: ["coding"],

  // ── Agentic: Git ─────────────────────────────────────────

  // ── Agentic: Browser ─────────────────────────────────────
  browser_action: ["coding", "web"],
  browser_script: ["coding", "web"],

  // ── Agentic: Code Intelligence (LSP) ─────────────────────
  lsp_action: ["coding"],

  // ── Agentic: Task Management ─────────────────────────────
  create_task: ["coding"],
  get_task: ["coding"],
  list_tasks: ["coding"],
  update_task: ["coding"],

  // ── Agentic: Memory ──────────────────────────────────────
  upsert_memory: ["coding"],

  // ── Agentic: Agent Management ────────────────────────────
  create_custom_agent: ["coding"],
  list_custom_agents: ["coding"],
  update_custom_agent: ["coding"],

  // ── Agentic: Tool Management ──────────────────────────────
  create_custom_tool: ["coding", "meta"],
  create_privileged_tool: ["coding", "meta"],
  list_custom_tools: ["coding", "meta"],
  update_custom_tool: ["coding", "meta"],
  delete_custom_tool: ["coding", "meta"],

  // ── Agentic: Tool Discovery ──────────────────────────────
  search_tools: ["coding", "meta"],

  // ── Cron Jobs ────────────────────────────────────────────
  create_cron: ["coding", "automation"],
  remote_trigger: ["coding", "automation"],
  create_cron_job: ["coding", "automation"],
  list_cron_jobs: ["coding", "automation"],
  delete_cron_job: ["coding", "automation"],
  trigger_cron_job: ["coding", "automation"],

  // ── Agentic: Notebook Editing ────────────────────────────
  notebook_edit: ["coding", "data_science"],

  // ── Communication ────────────────────────────────────────
  twilio_send_sms: ["communication"],
  twilio_list_messages: ["communication"],
  twilio_get_account: ["communication"],
  twilio_lookup_number: ["communication"],
  twilio_list_numbers: ["communication"],

  // ── Creative (Image Generation & Vision) ────────────────────
  get_emoji_combination: ["creative", "media"],
  get_emoji_combinations: ["creative", "media"],
  generate_image: ["creative", "media"],

  describe_image: ["creative", "media"],
  text_to_speech: ["creative", "media"],
  generate_audio: ["creative", "media"],
  create_vector_animation: ["creative", "media", "animation"],
  speech_to_text: ["creative", "media"],

  // ── Discord ──────────────────────────────────────────────
  discord_message_search: ["discord"],
  get_discord_message_analytics: ["discord"],
  discord_server_activity: ["discord"],
  get_discord_guild_channels: ["discord"],
  get_discord_guild_members: ["discord"],
  get_discord_guild_emojis: ["discord"],
  get_bot_stats: ["discord"],
  get_bot_guilds: ["discord"],
  get_bot_activity_timeline: ["discord"],
  get_discord_user_heatmap_data: ["discord"],
  get_discord_mention_leaderboard: ["discord"],
  get_discord_message_leaderboard: ["discord"],
  get_discord_word_frequencies: ["discord"],
  react_to_discord_message: ["discord"],
  get_discord_voice_channel_members: ["discord"],
  get_discord_user_profile: ["discord"],
  get_discord_channel_activity_stats: ["discord"],

  // ── Smart Home (LIFX) ────────────────────────────────────
  lifx_list_lights: ["smart_home", "lifx"],
  lifx_set_state: ["smart_home", "lifx"],
  lifx_toggle_power: ["smart_home", "lifx"],
  lifx_breathe_effect: ["smart_home", "lifx"],
  lifx_pulse_effect: ["smart_home", "lifx"],
  lifx_move_effect: ["smart_home", "lifx"],
  lifx_flame_effect: ["smart_home", "lifx"],
  lifx_morph_effect: ["smart_home", "lifx"],
  lifx_set_states: ["smart_home", "lifx"],
  lifx_set_state_delta: ["smart_home", "lifx"],
  lifx_effects_off: ["smart_home", "lifx"],
  lifx_list_scenes: ["smart_home", "lifx"],
  lifx_activate_scene: ["smart_home", "lifx"],
  lifx_night_lock: ["smart_home", "lifx"],
  lifx_health: ["smart_home", "lifx"],
};

// ────────────────────────────────────────────────────────────
// Intelligence Tier Taxonomy — maps tools to required LLM capability tier
// ────────────────────────────────────────────────────────────

const TOOL_INTELLIGENCE_TIERS: Record<string, ToolIntelligenceTier> = {
  // 🔴 Frontier — Frontier Models Only (Structured graphs, code writing, mult-tool state)
  generate_audio: "frontier",
  create_vector_animation: "frontier",
  browser_action: "frontier",
  browser_script: "frontier",
  manipulate_image: "frontier",
  build_meal_plan: "frontier",
  analyze_nutrient_gaps: "frontier",
  transform_json: "frontier",
  draw_turtle: "frontier",
  create_3d_mesh: "frontier",
  create_3d_scene: "frontier",
  create_3d_model: "high",
  create_3d_voxel: "high",
  lsp_action: "frontier",
  notebook_edit: "frontier",
  search_energy: "frontier",

  // 🟠 High — Strong Models Recommended (Complex domain enums, conditional required params)
  get_macro: "high",
  get_stock: "high",
  get_country: "high",
  get_element: "high",
  get_exoplanet: "high",
  search_drugs: "high",
  search_foods_by_taxonomy: "high",
  get_food_taxonomy: "high",
  get_nutritional_requirements: "high",
  rank_foods_by_category: "high",
  execute_python: "high",
  execute_shell: "high",
  parse_datetime: "high",
  generate_map: "high",
  generate_chart: "high",
  get_commodities: "high",
  browse_media: "high",
  get_events: "high",
  check_drug_nutrient_interactions: "high",
  search_food_substitutes: "high",
  create_custom_agent: "high",
  create_cron: "high",
  generate_diagram: "high",
  test_regex: "high",
  str_replace_file: "high",
  block_replace_file: "high",
  multi_replace_file: "high",
  get_local_environment: "high",
  get_vessels_in_area: "high",

  // 🟡 Medium — Mid-Tier Models Can Handle (Some dynamic params, enums, standard APIs)
  get_weather: "medium",
  get_trends: "medium",
  search_products: "medium",
  get_anime: "medium",
  search_books: "medium",
  search_media: "medium",
  get_media_details: "medium",
  get_media_credits: "medium",
  get_trending_media: "medium",
  execute_javascript: "medium",
  search_airports: "medium",
  search_nearby_places: "medium",
  search_places: "medium",
  convert_units: "medium",
  convert_currency: "medium",
  calculate_caloric_needs: "medium",
  calculate_hydration_needs: "medium",
  estimate_exercise_calories: "medium",
  compare_food_nutrition: "medium",
  search_usda_nutrition: "medium",
  get_weather_forecast: "medium",
  get_earthquakes: "medium",
  search_gym_exercises: "medium",
  diff_text: "medium",
  encode_decode: "medium",
  generate_hash: "medium",
  convert_color: "medium",
  read_rss_feed: "medium",
  read_pdf_url: "medium",
  read_pdf: "medium",
  read_docx: "low",
  read_spreadsheet: "medium",
  get_next_bus: "medium",
  get_transit_stop_info: "medium",
  get_transit_route_info: "medium",
  search_transit_stops_nearby: "medium",
  get_petroleum_prices: "medium",
  get_natural_gas_prices: "medium",
  get_electricity_retail_sales: "medium",
  get_energy_facets: "medium",
  git: "medium",
  run_command: "medium",
  twilio_send_sms: "medium",
  discord_message_search: "medium",
  get_discord_message_analytics: "medium",
  discord_server_activity: "medium",
  get_discord_guild_channels: "medium",
  get_discord_guild_members: "medium",
  get_discord_guild_emojis: "medium",
  get_bot_stats: "medium",
  get_bot_guilds: "medium",
  get_bot_activity_timeline: "medium",
  get_discord_user_heatmap_data: "medium",
  get_discord_mention_leaderboard: "medium",
  get_discord_message_leaderboard: "medium",
  get_discord_word_frequencies: "medium",
  react_to_discord_message: "medium",
  get_discord_voice_channel_members: "medium",
  get_discord_user_profile: "medium",
  get_discord_channel_activity_stats: "medium",
  generate_image: "medium",
  text_to_speech: "medium",
  speech_to_text: "medium",
  get_public_webcams: "medium",
};

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

// Re-export taxonomy registries for testing and downstream consumers
export {
  TOOL_DOMAINS,
  TOOL_LABELS,
  TOOL_EMOJIS,
  TOOL_INTELLIGENCE_TIERS,
  TOOL_DEFINITIONS,
};

/**
 * Get all tool schemas with endpoint metadata.
 * Used by clients (like Prism Client) to build dynamic executors.
 * Filters out tools whose required API keys are not configured.
 */
export function getToolSchemas(): ToolSchema[] {
  return TOOL_DEFINITIONS.filter((tool) => isToolAvailable(tool.name)).map(
    (tool) => {
      const domain = TOOL_DOMAINS[tool.name as keyof typeof TOOL_DOMAINS] || "Other";
      return {
        ...tool,
        domain,
        domainKey: resolveDomainKey(domain),
        labels: TOOL_LABELS[tool.name as keyof typeof TOOL_LABELS] || [],
        emoji: TOOL_EMOJIS[tool.name as keyof typeof TOOL_EMOJIS] || null,
        intelligenceTier:
          TOOL_INTELLIGENCE_TIERS[
            tool.name as keyof typeof TOOL_INTELLIGENCE_TIERS
          ] || "low",
      };
    },
  );
}

/**
 * Get tool schemas cleaned for LLM consumption.
 * Strips the `endpoint` property since the AI doesn't need routing info.
 * Filters out tools whose required API keys are not configured.
 */
export function getToolSchemasForAI(): ToolSchemaForAI[] {
  return TOOL_DEFINITIONS.filter((tool) => isToolAvailable(tool.name)).map(
    ({ endpoint: _endpoint, dataSource: _dataSource, ...rest }) => ({
      ...rest,
      intelligenceTier:
        TOOL_INTELLIGENCE_TIERS[
          rest.name as keyof typeof TOOL_INTELLIGENCE_TIERS
        ] || "low",
    }),
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
