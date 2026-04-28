import fs from "node:fs/promises";
import path from "node:path";

const USERNAME = "Lanjelin";
const API_BASE = "https://api.github.com";
const STRICT_SITE_DATA = process.env.STRICT_SITE_DATA === "true";

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

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function htmlToText(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|main|nav|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "\n");

  return decodeHtmlEntities(cleaned)
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseDownloadCount(raw) {
  const value = String(raw).trim().replace(/,/g, "");
  const match = value.match(/^([\d.]+)\s*([kKmMbB]?)$/);
  if (!match) {
    return 0;
  }

  const number = Number.parseFloat(match[1]);
  if (Number.isNaN(number)) {
    return 0;
  }

  const multiplier = {
    "": 1,
    k: 1_000,
    m: 1_000_000,
    b: 1_000_000_000,
  }[match[2].toLowerCase()] || 1;

  return Math.round(number * multiplier);
}

async function scrapePackages() {
  const html = await fetchHtml(`https://github.com/${USERNAME}?tab=packages&sort_by=downloads_desc`);
  const lines = htmlToText(html);
  const start = lines.findIndex((line) => /^Sort by:\s+Most downloads$/i.test(line));
  const scope = start >= 0 ? lines.slice(start) : lines;
  const packages = [];

  for (let i = 0; i < scope.length - 2; i += 1) {
    const nameLine = scope[i];
    const publishedLine = scope[i + 1];
    const countLine = scope[i + 2];

    if (!/^[*•]\s+/.test(nameLine)) {
      continue;
    }

    if (!/^Published\b/i.test(publishedLine)) {
      continue;
    }

    if (!/^[\d.,]+\s*[kKmMbB]?$/.test(countLine)) {
      continue;
    }

    const name = nameLine.replace(/^[*•]\s+/, "").trim();
    const rawCount = countLine.trim();
    const downloadCount = parseDownloadCount(rawCount);

    packages.push({
      name,
      description: "GitHub package.",
      chip: "container",
      downloadCount,
      statsText: `${rawCount} total downloads`,
      url: `https://github.com/users/${USERNAME}/packages/container/package/${encodeURIComponent(name)}`,
    });
  }

  packages.sort((a, b) => b.downloadCount - a.downloadCount);

  if (STRICT_SITE_DATA && packages.length === 0) {
    throw new Error("No packages were scraped from the GitHub packages page.");
  }

  return packages.slice(0, 6);
}

async function sortPackages() {
  return scrapePackages();
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
