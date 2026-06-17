// ─── USPTO Patent Search Fetcher ───────────────────────────────────
// Uses the free USPTO Open Data PatentsView API (no key required).

const PATENTSVIEW_API_BASE = "https://api.patentsview.org/patents/query";

interface PatentResult {
  patentNumber: string;
  title: string;
  abstract: string;
  date: string;
  type: string;
  inventors: Array<{
    firstName: string;
    lastName: string;
    city: string | null;
    state: string | null;
    country: string | null;
  }>;
  assignees: Array<{
    organization: string;
    city: string | null;
    state: string | null;
    country: string | null;
  }>;
  cpcCategories: string[];
}

interface PatentSearchResult {
  query: string;
  count: number;
  totalFound: number;
  patents: PatentResult[];
}

export async function searchPatents(
  query: string,
  options: {
    inventor?: string;
    assignee?: string;
    limit?: number;
  } = {},
): Promise<PatentSearchResult> {
  const limit = Math.min(options.limit || 10, 50);

  // Build query conditions
  const conditions: Array<Record<string, unknown>> = [];

  if (query) {
    conditions.push({
      _or: [
        { _text_any: { patent_title: query } },
        { _text_any: { patent_abstract: query } },
      ],
    });
  }

  if (options.inventor) {
    conditions.push({
      _or: [
        { _text_any: { inventor_first_name: options.inventor } },
        { _text_any: { inventor_last_name: options.inventor } },
      ],
    });
  }

  if (options.assignee) {
    conditions.push({
      _text_any: { assignee_organization: options.assignee },
    });
  }

  const queryPayload = {
    "q": conditions.length === 1 ? conditions[0] : { _and: conditions },
    "f": [
      "patent_number",
      "patent_title",
      "patent_abstract",
      "patent_date",
      "patent_type",
      "inventor_first_name",
      "inventor_last_name",
      "inventor_city",
      "inventor_state",
      "inventor_country",
      "assignee_organization",
      "assignee_city",
      "assignee_state",
      "assignee_country",
      "cpc_category",
    ],
    "o": {
      page: 1,
      per_page: limit,
    },
    s: [{ patent_date: "desc" }],
  };

  const response = await fetch(PATENTSVIEW_API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(queryPayload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `PatentsView API error ${response.status}: ${errorBody}`,
    );
  }

  const responseData = (await response.json()) as {
    patents: Array<{
      patent_number: string;
      patent_title: string;
      patent_abstract: string;
      patent_date: string;
      patent_type: string;
      inventors: Array<{
        inventor_first_name: string;
        inventor_last_name: string;
        inventor_city: string | null;
        inventor_state: string | null;
        inventor_country: string | null;
      }>;
      assignees: Array<{
        assignee_organization: string;
        assignee_city: string | null;
        assignee_state: string | null;
        assignee_country: string | null;
      }>;
      cpcs: Array<{ cpc_category: string }>;
    }>;
    count: number;
    total_patent_count: number;
  };

  const patents: PatentResult[] = (responseData.patents || []).map(
    (patent) => ({
      patentNumber: patent.patent_number,
      title: patent.patent_title,
      abstract: (patent.patent_abstract || "").slice(0, 1000),
      date: patent.patent_date,
      type: patent.patent_type,
      inventors: (patent.inventors || []).map((inventor) => ({
        firstName: inventor.inventor_first_name,
        lastName: inventor.inventor_last_name,
        city: inventor.inventor_city,
        state: inventor.inventor_state,
        country: inventor.inventor_country,
      })),
      assignees: (patent.assignees || []).map((assignee) => ({
        organization: assignee.assignee_organization,
        city: assignee.assignee_city,
        state: assignee.assignee_state,
        country: assignee.assignee_country,
      })),
      cpcCategories: (patent.cpcs || []).map((cpc) => cpc.cpc_category),
    }),
  );

  return {
    query,
    count: patents.length,
    totalFound: responseData.total_patent_count || 0,
    patents,
  };
}
