// ─── Repository Metadata + README ───────────────────────────

import {
  createGitHubClient,
  parseGitHubRepoInput,
} from "@rodrigo-barraza/utilities-library/github";
import { USER_AGENT } from "../../constants.ts";

const githubClient = createGitHubClient({ userAgent: USER_AGENT });

const MAX_README_CHARS = 15_000;

// ─── Public API ───────────────────────────────────────────────────

/**
 * Fetch GitHub repository info, README, and language breakdown.


 */
export async function getGitHubRepo(
  input: string,
  options: Record<string, unknown> = {},
) {
  const parsed = parseGitHubRepoInput(input);
  if (!parsed) {
    return { error: `Invalid GitHub URL or owner/repo: "${input}"` };
  }

  const { owner, repo } = parsed;
  const { includeReadme = true, includeLanguages = true } = options;

  // Fetch repo metadata + optional README + languages concurrently
  const repoPromise = githubClient.requestRaw(`/repos/${owner}/${repo}`);

  const readmePromise = includeReadme
    ? githubClient
        .requestRaw(`/repos/${owner}/${repo}/readme`, {
          headers: { Accept: "application/vnd.github.v3.raw" },
        })
        .catch(() => null)
    : Promise.resolve(null);

  const langsPromise = includeLanguages
    ? githubClient
        .requestRaw(`/repos/${owner}/${repo}/languages`)
        .catch(() => null)
    : Promise.resolve(null);

  const [repoResponse, readmeResponse, langsResponse] = await Promise.all([
    repoPromise,
    readmePromise,
    langsPromise,
  ]);

  if (!repoResponse.ok) {
    if (repoResponse.status === 404) {
      return { error: `Repository not found: ${owner}/${repo}` };
    }
    if (repoResponse.status === 403) {
      return {
        error: "GitHub API rate limit exceeded (60 req/hr unauthenticated)",
      };
    }
    return {
      error: `GitHub API error: ${repoResponse.status} ${repoResponse.statusText}`,
    };
  }

  const data = await repoResponse.json();

  const result: Record<string, unknown> = {
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

  if (readmeResponse?.ok) {
    let readme = await readmeResponse.text();
    if (readme.length > MAX_README_CHARS) {
      readme = readme.slice(0, MAX_README_CHARS) + "\n\n... [truncated]";
      result.readmeTruncated = true;
    }
    result.readme = readme;
  }

  if (langsResponse?.ok) {
    result.languages = await langsResponse.json();
  }

  return result;
}
