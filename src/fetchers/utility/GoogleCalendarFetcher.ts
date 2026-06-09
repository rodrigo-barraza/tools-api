// ─── Google Calendar Fetcher ───────────────────────────────────────
// Uses Google Calendar API v3 with service account credentials.

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

interface GoogleAuth {
  accessToken: string;
  expiresAt: number;
}

let cachedGoogleAuth: GoogleAuth | null = null;

async function getServiceAccountToken(
  credentialsJson: string,
): Promise<string> {
  if (cachedGoogleAuth && Date.now() < cachedGoogleAuth.expiresAt - 60_000) {
    return cachedGoogleAuth.accessToken;
  }

  const credentials = JSON.parse(credentialsJson);
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const jwtPayload = Buffer.from(
    JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  ).toString("base64url");

  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(`${jwtHeader}.${jwtPayload}`);
  const signature = signer.sign(credentials.private_key, "base64url");

  const jwtToken = `${jwtHeader}.${jwtPayload}.${signature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtToken,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Google OAuth token exchange failed: ${errorBody}`);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedGoogleAuth = {
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };

  return tokenData.access_token;
}

// ─── Get Calendar Events ───────────────────────────────────────────

interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  status: string;
  htmlLink: string;
  creator: { email: string } | null;
  attendees: { email: string; responseStatus: string }[];
  isAllDay: boolean;
}

interface CalendarEventsResult {
  calendarId: string;
  events: CalendarEvent[];
  count: number;
  timeMin: string;
  timeMax: string;
}

export async function getCalendarEvents(
  credentialsJson: string,
  calendarId: string = "primary",
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 25,
): Promise<CalendarEventsResult> {
  const accessToken = await getServiceAccountToken(credentialsJson);

  const queryParams = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(maxResults, 100)),
  });

  const effectiveTimeMin =
    timeMin || new Date().toISOString();
  queryParams.set("timeMin", effectiveTimeMin);

  const effectiveTimeMax =
    timeMax ||
    new Date(Date.now() + 30 * 86_400_000).toISOString();
  queryParams.set("timeMax", effectiveTimeMax);

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${queryParams}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Calendar API error ${response.status}: ${errorBody}`);
  }

  const responseData = (await response.json()) as {
    items: Array<{
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
      status: string;
      htmlLink: string;
      creator?: { email: string };
      attendees?: Array<{ email: string; responseStatus: string }>;
    }>;
  };

  const events: CalendarEvent[] = (responseData.items || []).map(
    (calendarItem) => ({
      id: calendarItem.id,
      summary: calendarItem.summary || "(No title)",
      description: calendarItem.description || null,
      location: calendarItem.location || null,
      start:
        calendarItem.start.dateTime || calendarItem.start.date || "",
      end: calendarItem.end.dateTime || calendarItem.end.date || "",
      status: calendarItem.status,
      htmlLink: calendarItem.htmlLink,
      creator: calendarItem.creator || null,
      attendees: calendarItem.attendees || [],
      isAllDay: !calendarItem.start.dateTime,
    }),
  );

  return {
    calendarId,
    events,
    count: events.length,
    timeMin: effectiveTimeMin,
    timeMax: effectiveTimeMax,
  };
}

// ─── Create Calendar Event ─────────────────────────────────────────

interface CreateEventOptions {
  calendarId?: string;
  summary: string;
  startDateTime: string;
  endDateTime: string;
  description?: string;
  location?: string;
  attendees?: string[];
  timeZone?: string;
}

interface CreateEventResult {
  id: string;
  summary: string;
  htmlLink: string;
  start: string;
  end: string;
  status: string;
}

export async function createCalendarEvent(
  credentialsJson: string,
  options: CreateEventOptions,
): Promise<CreateEventResult> {
  const accessToken = await getServiceAccountToken(credentialsJson);
  const calendarId = options.calendarId || "primary";

  const eventBody: Record<string, unknown> = {
    summary: options.summary,
    start: {
      dateTime: options.startDateTime,
      timeZone: options.timeZone || "UTC",
    },
    end: {
      dateTime: options.endDateTime,
      timeZone: options.timeZone || "UTC",
    },
  };

  if (options.description) eventBody.description = options.description;
  if (options.location) eventBody.location = options.location;
  if (options.attendees) {
    eventBody.attendees = options.attendees.map((attendeeEmail) => ({
      email: attendeeEmail,
    }));
  }

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google Calendar create event failed ${response.status}: ${errorBody}`,
    );
  }

  const createdEvent = (await response.json()) as {
    id: string;
    summary: string;
    htmlLink: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    status: string;
  };

  return {
    id: createdEvent.id,
    summary: createdEvent.summary,
    htmlLink: createdEvent.htmlLink,
    start:
      createdEvent.start.dateTime || createdEvent.start.date || "",
    end: createdEvent.end.dateTime || createdEvent.end.date || "",
    status: createdEvent.status,
  };
}

// ─── Free/Busy Query ───────────────────────────────────────────────

interface FreeBusyTimeSlot {
  start: string;
  end: string;
}

interface FreeBusyCalendar {
  calendarId: string;
  busySlots: FreeBusyTimeSlot[];
}

interface FreeBusyResult {
  timeMin: string;
  timeMax: string;
  calendars: FreeBusyCalendar[];
}

export async function getFreeBusy(
  credentialsJson: string,
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<FreeBusyResult> {
  const accessToken = await getServiceAccountToken(credentialsJson);

  const response = await fetch(`${CALENDAR_API_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: calendarIds.map((calendarId) => ({ id: calendarId })),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google Calendar freeBusy failed ${response.status}: ${errorBody}`,
    );
  }

  const responseData = (await response.json()) as {
    calendars: Record<
      string,
      { busy: Array<{ start: string; end: string }> }
    >;
  };

  const calendars: FreeBusyCalendar[] = Object.entries(
    responseData.calendars || {},
  ).map(([calendarId, calendarData]) => ({
    calendarId,
    busySlots: calendarData.busy || [],
  }));

  return { timeMin, timeMax, calendars };
}
