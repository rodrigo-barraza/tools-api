// ────────────────────────────────────────────────────────────
// Tool Definitions — Knowledge
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, staticDataset, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";

export function getKnowledgeTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
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
    display: {
      activeVerb: "Reading",
      completedVerb: "Read",
      subjectParam: "url",
      subjectFormat: "domain",
    },
  },
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
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "name",
      subjectFormat: "full",
    },
  },
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
    display: {
      activeVerb: "Searching books for",
      completedVerb: "Searched books for",
      subjectParam: "q",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Fetching country details for",
      completedVerb: "Fetched country details for",
      subjectParam: "name",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Fetching element details for",
      completedVerb: "Fetched element details for",
      subjectParam: "symbol",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Fetching exoplanet archive data",
      completedVerb: "Fetched exoplanet archive data",
      subjectParam: "action",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Searching anime for",
      completedVerb: "Searched anime for",
      subjectParam: "q",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Looking up definition for",
      completedVerb: "Looked up definition for",
      subjectParam: "word",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Searching academic papers for",
      completedVerb: "Searched academic papers for",
      subjectParam: "q",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Searching YouTube for",
      completedVerb: "Searched YouTube for",
      subjectParam: "q",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Fetching YouTube video info for",
      completedVerb: "Fetched YouTube video info for",
      subjectParam: "url",
      subjectFormat: "domain",
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
    display: {
      activeVerb: "Downloading video from",
      completedVerb: "Downloaded video from",
      subjectParam: "url",
      subjectFormat: "domain",
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
    display: {
      activeVerb: "Trimming video from",
      completedVerb: "Trimmed video from",
      subjectParam: "url",
      subjectFormat: "domain",
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
    display: {
      activeVerb: "Fetching package info for",
      completedVerb: "Fetched package info for",
      subjectParam: "name",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Fetching Wikipedia summary for",
      completedVerb: "Fetched Wikipedia summary for",
      subjectParam: "title",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Checking historical events",
      completedVerb: "Checked historical events",
      subjectParam: "type",
      subjectFormat: "full",
    },
  },
  {
    name: "list_development_indicators",
    dataSource: staticDataset("World Bank"),
    description: translate("list_development_indicators.description"),
    endpoint: { path: "/knowledge/indicators/list" },
    parameters: {
      type: "object",
      properties: {},
    },
    display: {
      activeVerb: "Listing development indicators",
      completedVerb: "Listed development indicators",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
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
    display: {
      activeVerb: "Fetching music data from MusicBrainz",
      completedVerb: "Fetched music data from MusicBrainz",
      subjectParam: "action",
      subjectFormat: "full",
    },
  },
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
    display: {
      activeVerb: "Fetching Wayback Machine snapshot for",
      completedVerb: "Fetched Wayback Machine snapshot for",
      subjectParam: "url",
      subjectFormat: "domain",
    },
  },
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
    display: {
      activeVerb: "Searching StackOverflow questions for",
      completedVerb: "Searched StackOverflow questions for",
      subjectParam: "q",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Searching USPTO patents for",
      completedVerb: "Searched USPTO patents for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  ];
}
