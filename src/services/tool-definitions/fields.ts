// ────────────────────────────────────────────────────────────
// FIELDS Constants — extracted from ToolSchemaService.ts
// ────────────────────────────────────────────────────────────

export const FIELDS = {
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
