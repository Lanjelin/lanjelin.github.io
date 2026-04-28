import fs from "node:fs/promises";
import path from "node:path";

const USERNAME = "Lanjelin";
const API_BASE = "https://api.github.com";
const STRICT_SITE_DATA = process.env.STRICT_SITE_DATA === "true";
const PACKAGE_ORDER = [
  "openaudible-docker",
  "tor-zero",
  "monerod-zero",
  "nvim-docker",
  "proton-bridge-rootless",
  "handl",
];

const FALLBACK = {
  profile: {
    name: "Lanjelin",
    bio: "Pondering upon world domination.",
    company: "Company",
    location: "Norway",
    avatar_url: "https://github.com/Lanjelin.png?size=192",
    public_repos: 67,
    followers: 28,
    package_count: 30,
    total_stars: 123,
  },
  repos: [],
  packages: [],
};

async function fetchJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const token = process.env.GH_PACKAGES_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchHtml(url) {
  const headers = {
    Accept: "text/html,application/xhtml+xml",
    "User-Agent": "Mozilla/5.0 (compatible; GitHubPagesBot/1.0)",
  };

  const token = process.env.GH_PACKAGES_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

function sortRepos(repos) {
  return repos
    .filter((repo) => !repo.fork)
    .sort((a, b) => {
      if (b.stargazers_count !== a.stargazers_count) {
        return b.stargazers_count - a.stargazers_count;
      }

      return b.forks_count - a.forks_count;
    })
    .slice(0, 6)
    .map((repo) => ({
      name: repo.name,
      description: repo.description || "No description provided.",
      language: repo.language || "Repo",
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      url: repo.html_url,
    }));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function newestVersionDate(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    return "";
  }

  const timestamps = versions
    .map((version) => version.updated_at || version.created_at || version.published_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (timestamps.length === 0) {
    return "";
  }

  timestamps.sort((a, b) => b.getTime() - a.getTime());
  return formatDate(timestamps[0].toISOString());
}

function extractMetaContent(html, metaName) {
  const regex = new RegExp(
    `<meta[^>]+(?:name|property)=["']${metaName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const match = html.match(regex);
  return match ? match[1].trim() : "";
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|main|nav|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function cleanAboutText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+\|\s+GitHub$/, "")
    .replace(/\s+\|\s+.*$/, "");
}

function extractReadmeLine(html) {
  const lines = htmlToText(html);
  const readmeIndex = lines.findIndex((line) => /^README$/i.test(line));
  const startIndex = readmeIndex >= 0 ? readmeIndex + 1 : 0;
  const skip = new Set([
    "Learn more about packages",
    "Install from the command line",
    "Details",
    "Last published",
    "Total downloads",
    "README",
  ]);

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || skip.has(line)) {
      continue;
    }
    if (line.startsWith("Published ") || line.startsWith("Version downloads")) {
      continue;
    }
    if (line.length < 8) {
      continue;
    }
    return line;
  }

  return "";
}

function extractConnectedRepoPath(html) {
  const candidates = [];
  const sourceIndex = html.toLowerCase().indexOf("repository source");
  const searchSpace = sourceIndex >= 0 ? html.slice(sourceIndex, sourceIndex + 6000) : html;
  const repoUrlRegex = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:["'?#/>\s]|$)/g;
  let match;

  while ((match = repoUrlRegex.exec(searchSpace))) {
    const owner = match[1];
    const repo = match[2];
    if (["users", "orgs", "settings", "marketplace", "topics"].includes(owner)) {
      continue;
    }
    if (repo === "packages" || repo === "search") {
      continue;
    }
    const path = `${owner}/${repo}`;
    if (!candidates.includes(path)) {
      candidates.push(path);
    }
  }

  return candidates[0] || "";
}

async function sortPackages() {
  const packages = [];

  for (const name of PACKAGE_ORDER) {
    const [detail, versions] = await Promise.all([
      fetchJson(`${API_BASE}/users/${USERNAME}/packages/container/${encodeURIComponent(name)}`),
      fetchJson(`${API_BASE}/users/${USERNAME}/packages/container/${encodeURIComponent(name)}/versions`),
    ]);
    const pageHtml = await fetchHtml(detail.html_url || `https://github.com/users/${USERNAME}/packages/container/package/${encodeURIComponent(name)}`);
    const connectedRepoPath = extractConnectedRepoPath(pageHtml);
    const connectedRepo = connectedRepoPath ? await fetchJson(`${API_BASE}/repos/${connectedRepoPath}`) : null;
    const readmeLine = cleanAboutText(extractReadmeLine(pageHtml));
    const about = cleanAboutText(
      connectedRepo?.description ||
        readmeLine ||
        extractMetaContent(pageHtml, "description") ||
        extractMetaContent(pageHtml, "og:description") ||
        detail.description ||
        "",
    );
    const updated = newestVersionDate(versions);

    if (STRICT_SITE_DATA && !about) {
      throw new Error(`Missing package about text: ${name}`);
    }

    packages.push({
      name,
      description: about || "About unavailable.",
      chip: "published",
      statsText: updated ? `Last updated ${updated}` : "Last updated",
      url: detail.html_url || `https://github.com/users/${USERNAME}/packages/container/package/${encodeURIComponent(name)}`,
    });
  }

  return packages;
}

async function main() {
  const [profileValue, repoValue, packageValue] = STRICT_SITE_DATA
    ? [
        await fetchJson(`${API_BASE}/users/${USERNAME}`),
        sortRepos(await fetchJson(`${API_BASE}/users/${USERNAME}/repos?per_page=100&sort=updated&direction=desc`)),
        await sortPackages(),
      ]
    : await Promise.allSettled([
        fetchJson(`${API_BASE}/users/${USERNAME}`),
        fetchJson(`${API_BASE}/users/${USERNAME}/repos?per_page=100&sort=updated&direction=desc`),
        sortPackages(),
      ]).then(([profile, repos, packages]) => [
        profile.status === "fulfilled" ? profile.value : FALLBACK.profile,
        repos.status === "fulfilled" ? sortRepos(repos.value) : FALLBACK.repos,
        packages.status === "fulfilled" ? packages.value : FALLBACK.packages,
      ]);

  const data = {
    generatedAt: new Date().toISOString(),
    profile: {
      name: profileValue.name || USERNAME,
      bio: profileValue.bio || FALLBACK.profile.bio,
      company: profileValue.company || FALLBACK.profile.company,
      location: profileValue.location || FALLBACK.profile.location,
      avatar_url: profileValue.avatar_url || FALLBACK.profile.avatar_url,
      public_repos: profileValue.public_repos ?? repoValue.length,
      followers: profileValue.followers ?? FALLBACK.profile.followers,
      package_count: packageValue.length,
      total_stars:
        profileValue.total_stars ??
        repoValue.reduce((sum, repo) => sum + (repo.stars || 0), 0),
    },
    repos: repoValue,
    packages: packageValue,
  };

  const outputPath = path.resolve("data", "site.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
