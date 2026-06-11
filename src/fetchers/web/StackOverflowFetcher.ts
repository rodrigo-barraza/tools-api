import { errorMessage } from "../../utilities.ts";

// ─── Question + Answers ─────────────────────────────────────

const SE_API = "https://api.stackexchange.com/2.3";
const MAX_ANSWERS = 10;

// ─── URL Parsing ───────────────────────────────────────────────────

const SO_URL_REGEX =
  /(?:https?:\/\/)?(?:stackoverflow\.com|stackexchange\.com|[a-z]+\.stackexchange\.com)\/questions\/(\d+)/i;

/**
 * Extract question ID and site from a Stack Overflow URL or raw ID.

 */
function parseStackOverflowInput(input: string) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  const match = trimmed.match(SO_URL_REGEX);
  if (match) {
    // Determine site from URL
    let site = "stackoverflow";
    if (
      trimmed.includes("stackexchange.com") &&
      !trimmed.includes("stackoverflow")
    ) {
      const siteMatch = trimmed.match(
        /(?:https?:\/\/)?([a-z]+)\.stackexchange\.com/,
      );
      if (siteMatch) site = siteMatch[1];
    }
    return { questionId: match[1], site };
  }

  // Bare numeric ID (assume stackoverflow)
  if (/^\d+$/.test(trimmed)) {
    return { questionId: trimmed, site: "stackoverflow" };
  }

  return null;
}

// ─── HTML → Text ─────────────────────────────────────────────────

function htmlToText(html: string) {
  if (!html) return "";
  return html
    .replace(
      /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
      (_match: string, code: string) => {
        return "\n```\n" + decodeHtmlEntities(code) + "\n```\n";
      },
    )
    .replace(
      /<code[^>]*>([\s\S]*?)<\/code>/gi,
      (_match: string, code: string) => {
        return "`" + decodeHtmlEntities(code) + "`";
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(htmlString: string) {
  return htmlString
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ─── Public API ───────────────────────────────────────────────────

export interface StackOverflowOptions {
  answerLimit?: number;
}

interface SOAnswer {
  answerId: number;
  author: string | null;
  authorReputation: number | null;
  body: string;
  score: number;
  isAccepted: boolean;
  createdAt: string | null;
}

/**
 * Fetch a Stack Overflow question with accepted and top answers.


 */
export async function getStackOverflowQuestion(
  input: string,
  options: StackOverflowOptions = {},
) {
  const parsed = parseStackOverflowInput(input);
  if (!parsed) {
    return { error: `Invalid Stack Overflow URL or question ID: "${input}"` };
  }

  const { questionId, site } = parsed;
  const answerLimit = options.answerLimit ?? 5;
  const clampedLimit = Math.min(answerLimit, MAX_ANSWERS);

  try {
    // Use the "withbody" filter to get full HTML body in one request
    const params = new URLSearchParams({
      site,
      order: "desc",
      sort: "votes",
      filter: "withbody",
    });

    // Fetch question and answers concurrently
    const [qResponse, aResponse] = await Promise.all([
      fetch(`${SE_API}/questions/${questionId}?${params}`),
      fetch(
        `${SE_API}/questions/${questionId}/answers?${params}&pagesize=${clampedLimit}`,
      ),
    ]);

    if (!qResponse.ok || !aResponse.ok) {
      const status = !qResponse.ok ? qResponse.status : aResponse.status;
      if (status === 400) return { error: "Question not found" };
      return { error: `Stack Exchange API error: ${status}` };
    }

    const qData = await qResponse.json();
    const aData = await aResponse.json();

    const question = qData.items?.[0];
    if (!question) {
      return { error: `Question not found: ${questionId}` };
    }

    const result = {
      questionId: question.question_id,
      title: question.title || null,
      url: question.link || `https://stackoverflow.com/questions/${questionId}`,
      author: question.owner?.display_name || null,
      authorReputation: question.owner?.reputation || null,
      body: htmlToText(question.body),
      tags: question.tags || [],
      score: question.score || 0,
      viewCount: question.view_count || 0,
      answerCount: question.answer_count || 0,
      isAnswered: question.is_answered || false,
      acceptedAnswerId: question.accepted_answer_id || null,
      createdAt: question.creation_date
        ? new Date(question.creation_date * 1000).toISOString()
        : null,
      lastActivityAt: question.last_activity_date
        ? new Date(question.last_activity_date * 1000).toISOString()
        : null,
      answers: [] as SOAnswer[],
      quotaRemaining: qData.quota_remaining,
    };

    // Process answers
    interface SeApiAnswer {
      answer_id: number;
      owner?: { display_name?: string; reputation?: number };
      body: string;
      score?: number;
      is_accepted?: boolean;
      creation_date?: number;
    }

    result.answers = (aData.items || []).map(
      (seApiAnswer: SeApiAnswer): SOAnswer => ({
        answerId: seApiAnswer.answer_id,
        author: seApiAnswer.owner?.display_name || null,
        authorReputation: seApiAnswer.owner?.reputation || null,
        body: htmlToText(seApiAnswer.body),
        score: seApiAnswer.score || 0,
        isAccepted: seApiAnswer.is_accepted || false,
        createdAt: seApiAnswer.creation_date
          ? new Date(seApiAnswer.creation_date * 1000).toISOString()
          : null,
      }),
    );

    // Sort: accepted answer first, then by score
    result.answers.sort((sOAnswer: SOAnswer, b: SOAnswer) => {
      if (sOAnswer.isAccepted !== b.isAccepted) return sOAnswer.isAccepted ? -1 : 1;
      return b.score - sOAnswer.score;
    });

    // API quota info
    if (qData.quota_remaining !== undefined) {
      result.quotaRemaining = qData.quota_remaining;
    }

    return result;
  } catch (error: unknown) {
    return { error: `Stack Overflow fetch failed: ${errorMessage(error)}` };
  }
}

// ─── Search Questions by Tags / Keywords ──────────────────────────

interface StackOverflowSearchOptions {
  tagged?: string;
  sort?: "activity" | "votes" | "creation" | "hot" | "week" | "month";
  order?: "asc" | "desc";
  limit?: number;
  site?: string;
}

interface StackOverflowQuestionSummary {
  questionId: number;
  title: string;
  tags: string[];
  score: number;
  viewCount: number;
  answerCount: number;
  isAnswered: boolean;
  accepted: boolean;
  author: string | null;
  authorReputation: number | null;
  createdAt: string | null;
  lastActivityAt: string | null;
  url: string;
}

export async function searchStackOverflowQuestions(
  query: string,
  options: StackOverflowSearchOptions = {},
): Promise<{
  query: string;
  count: number;
  questions: StackOverflowQuestionSummary[];
  quotaRemaining?: number;
}> {
  const site = options.site || "stackoverflow";
  const sort = options.sort || "relevance";
  const order = options.order || "desc";
  const limit = Math.min(options.limit || 10, 30);

  const queryParams = new URLSearchParams({
    site,
    order,
    sort,
    pagesize: String(limit),
    filter: "default",
    intitle: query,
  });

  if (options.tagged) {
    queryParams.set("tagged", options.tagged);
  }

  try {
    const response = await fetch(
      `${SE_API}/search/advanced?${queryParams}`,
      { signal: AbortSignal.timeout(10_000) },
    );

    if (!response.ok) {
      return { query, count: 0, questions: [] };
    }

    const responseData = (await response.json()) as {
      items: Array<{
        question_id: number;
        title: string;
        tags: string[];
        score: number;
        view_count: number;
        answer_count: number;
        is_answered: boolean;
        accepted_answer_id?: number;
        owner?: { display_name?: string; reputation?: number };
        creation_date?: number;
        last_activity_date?: number;
        link: string;
      }>;
      quota_remaining?: number;
    };

    const questions: StackOverflowQuestionSummary[] = (
      responseData.items || []
    ).map((item) => ({
      questionId: item.question_id,
      title: item.title,
      tags: item.tags || [],
      score: item.score || 0,
      viewCount: item.view_count || 0,
      answerCount: item.answer_count || 0,
      isAnswered: item.is_answered || false,
      accepted: !!item.accepted_answer_id,
      author: item.owner?.display_name || null,
      authorReputation: item.owner?.reputation || null,
      createdAt: item.creation_date
        ? new Date(item.creation_date * 1000).toISOString()
        : null,
      lastActivityAt: item.last_activity_date
        ? new Date(item.last_activity_date * 1000).toISOString()
        : null,
      url: item.link,
    }));

    return {
      query,
      count: questions.length,
      questions,
      quotaRemaining: responseData.quota_remaining,
    };
  } catch (error: unknown) {
    return {
      query,
      count: 0,
      questions: [],
    };
  }
}
