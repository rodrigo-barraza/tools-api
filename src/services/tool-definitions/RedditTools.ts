// ────────────────────────────────────────────────────────────
// Tool Definitions — Reddit
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getRedditTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
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
    display: {
      activeVerb: "Searching Reddit for",
      completedVerb: "Searched Reddit for",
      subjectParam: "q",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Searching subreddits for",
      completedVerb: "Searched subreddits for",
      subjectParam: "q",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Fetching subreddit details for",
      completedVerb: "Fetched subreddit details for",
      subjectParam: "subreddit",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Fetching subreddit feed for",
      completedVerb: "Fetched subreddit feed for",
      subjectParam: "subreddit",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Fetching subreddit rules for",
      completedVerb: "Fetched subreddit rules for",
      subjectParam: "subreddit",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Fetching subreddit wiki pages for",
      completedVerb: "Fetched subreddit wiki pages for",
      subjectParam: "subreddit",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Fetching wiki page for",
      completedVerb: "Fetched wiki page for",
      subjectParam: "page",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Fetching Reddit user history for",
      completedVerb: "Fetched Reddit user history for",
      subjectParam: "username",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Fetching Reddit user profile for",
      completedVerb: "Fetched Reddit user profile for",
      subjectParam: "username",
      subjectFormat: "full",
    },
  },
  ];
}
