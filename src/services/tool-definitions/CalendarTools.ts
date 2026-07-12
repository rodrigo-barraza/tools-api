// ────────────────────────────────────────────────────────────
// Tool Definitions — Calendar
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getCalendarTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
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
    display: {
      activeVerb: "Fetching calendar events",
      completedVerb: "Fetched calendar events",
      subjectParam: "calendarId",
      subjectFormat: "full",
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
    display: {
      activeVerb: "Creating calendar event",
      completedVerb: "Created calendar event",
      subjectParam: "summary",
      subjectFormat: "quoted",
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
    display: {
      activeVerb: "Checking free/busy calendar status",
      completedVerb: "Checked free/busy calendar status",
      subjectParam: "timeMin",
      subjectFormat: "full",
    },
  },
  ];
}
