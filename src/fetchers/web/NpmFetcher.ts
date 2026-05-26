// ─── Package Metadata + README ──────────────────────────────

const NPM_REGISTRY = "https://registry.npmjs.org";
const NPM_DOWNLOADS = "https://api.npmjs.org/downloads/point/last-week";
const MAX_README_CHARS = 15_000;

export interface NpmMaintainer {
  name?: string;
  email?: string;
  [key: string]: unknown;
}

export interface NpmPackageData {
  name: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: string | { url?: string };
  keywords?: string[];
  readme?: string;
  maintainers?: Array<string | NpmMaintainer>;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, {
    description?: string;
    license?: string;
    homepage?: string;
    author?: string | { name?: string };
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    engines?: Record<string, string>;
    types?: string;
    typings?: string;
    bin?: Record<string, string>;
    deprecated?: string;
  }>;
  time?: Record<string, string>;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Fetch NPM package info including version, deps, and README.
 */
export async function getNpmPackage(packageName: string, options: Record<string, unknown> = {}) {
  if (!packageName || typeof packageName !== "string") {
    return { error: "Package name is required" };
  }

  const { includeReadme = true } = options;
  const encoded = encodeURIComponent(packageName);

  // Fetch package metadata + download counts concurrently
  const [pkgRes, dlRes] = await Promise.all([
    fetch(`${NPM_REGISTRY}/${encoded}`, {
      headers: { Accept: "application/json" },
    }),
    fetch(`${NPM_DOWNLOADS}/${encoded}`).catch(() => null),
  ]);

  if (!pkgRes.ok) {
    if (pkgRes.status === 404) {
      return { error: `NPM package not found: "${packageName}"` };
    }
    return { error: `NPM Registry error: ${pkgRes.status}` };
  }

  const data = await pkgRes.json() as NpmPackageData;
  const latest = data["dist-tags"]?.latest || "";
  const version = (data.versions && latest ? data.versions[latest] : null) || {};

  const result: Record<string, unknown> = {
    name: data.name,
    version: latest,
    description: data.description || version.description || null,
    license: version.license || data.license || null,
    homepage: data.homepage || version.homepage || null,
    repository: typeof data.repository === "string"
      ? data.repository
      : data.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") || null,
    keywords: data.keywords || [],
    author: typeof version.author === "string"
      ? version.author
      : version.author?.name || null,
    maintainers: (data.maintainers || []).map((message) => {
      if (typeof message === "string") return message;
      return message.name || JSON.stringify(message);
    }).slice(0, 10),
    dependencies: version.dependencies || {},
    devDependencies: version.devDependencies || {},
    peerDependencies: version.peerDependencies || {},
    engines: version.engines || null,
    types: version.types || version.typings || null,
    bin: version.bin ? Object.keys(version.bin) : null,
    distTags: data["dist-tags"] || {},
    createdAt: data.time?.created || null,
    lastPublished: data.time?.[latest] || null,
  };

  // Download stats
  if (dlRes?.ok) {
    const dlData = await dlRes.json() as { downloads?: number };
    result.weeklyDownloads = dlData.downloads || null;
  }

  // Deprecated?
  if (version.deprecated) {
    result.deprecated = version.deprecated;
  }

  // README
  if (includeReadme && data.readme) {
    result.readme = data.readme.length > MAX_README_CHARS
      ? data.readme.slice(0, MAX_README_CHARS) + "\n\n... [truncated]"
      : data.readme;
    result.readmeTruncated = data.readme.length > MAX_README_CHARS;
  }

  return result;
}
