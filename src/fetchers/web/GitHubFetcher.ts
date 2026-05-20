// ─── Repository Metadata + README ───────────────────────────

import { USER_AGENT } from "../../constants.ts";

const GITHUB_API = "https://api.github.com";
const GITHUB_HEADERS = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": USER_AGENT,
};

const MAX_README_CHARS = 15_000;

// ─── URL Parsing ───────────────────────────────────────────────────

const GITHUB_REPO_REGEX =
  /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s#?]+)\/([^/\s#?]+)/;

/**
 * Parse a GitHub repo URL or "owner/repo" shorthand.

 */
function parseGitHubInput(input: any) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/$/, "");

  const match = trimmed.match(GITHUB_REPO_REGEX);
  if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, "") };

  // owner/repo shorthand
  const parts = trimmed.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Fetch GitHub repository info, README, and language breakdown.


 */
export async function getGitHubRepo(input: any, options: Record<string, any> = {}) {
  const parsed = parseGitHubInput(input);
  if (!parsed) {
    return { error: `Invalid GitHub URL or owner/repo: "${input}"` };
  }

  const { owner, repo } = parsed;
  const { includeReadme = true, includeLanguages = true } = options;

  // Fetch repo metadata + optional README + languages concurrently
  const tasks = [
    fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers: GITHUB_HEADERS }),
  ];

  if (includeReadme) {
    tasks.push(
      // @ts-expect-error - suppress remaining error
      fetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, {
        headers: { ...GITHUB_HEADERS, Accept: "application/vnd.github.v3.raw" },
      }).catch(() => null),
    );
  } else {
    // @ts-expect-error - suppress remaining error
    tasks.push(null);
  }

  if (includeLanguages) {
    tasks.push(
      // @ts-expect-error - suppress remaining error
      fetch(`${GITHUB_API}/repos/${owner}/${repo}/languages`, {
        headers: GITHUB_HEADERS,
      }).catch(() => null),
    );
  } else {
    // @ts-expect-error - suppress remaining error
    tasks.push(null);
  }

  const [repoRes, readmeRes, langsRes] = await Promise.all(tasks);

  if (!repoRes.ok) {
    if (repoRes.status === 404) {
      return { error: `Repository not found: ${owner}/${repo}` };
    }
    if (repoRes.status === 403) {
      return { error: "GitHub API rate limit exceeded (60 req/hr unauthenticated)" };
    }
    return { error: `GitHub API error: ${repoRes.status} ${repoRes.statusText}` };
  }

  const data = await repoRes.json();

  const result: Record<string, any> = {
    fullName: data.full_name,
    description: data.description,
    url: data.html_url,
    homepage: data.homepage || null,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    watchers: data.subscribers_count,
    language: data.language,
    license: data.license?.spdx_id || data.license?.name || null,
    topics: data.topics || [],
    defaultBranch: data.default_branch,
    isArchived: data.archived,
    isFork: data.fork,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    pushedAt: data.pushed_at,
    sizeKb: data.size,
  };

  if (readmeRes?.ok) {
    let readme = await readmeRes.text();
    if (readme.length > MAX_README_CHARS) {
      readme = readme.slice(0, MAX_README_CHARS) + "\n\n... [truncated]";
      result.readmeTruncated = true;
    }
    result.readme = readme;
  }

  if (langsRes?.ok) {
    result.languages = await langsRes.json();
  }

  return result;
}
