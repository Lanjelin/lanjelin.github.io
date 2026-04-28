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

const PACKAGE_REPOS = {
  "openaudible-docker": "Lanjelin/openaudible-docker",
  "tor-zero": "Lanjelin/tor-zero",
  "monerod-zero": "Lanjelin/monerod-zero",
  "nvim-docker": "Lanjelin/nvim-docker",
  "proton-bridge-rootless": "Lanjelin/proton-bridge-rootless",
  handl: "Lanjelin/handl",
};

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

function humanizeSlug(value) {
  return String(value)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanRepoAbout(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function fetchRepoAbout(repoPath, fallbackName) {
  const repo = await fetchJson(`${API_BASE}/repos/${repoPath}`).catch(() => null);
  const apiAbout = cleanRepoAbout(repo?.description);
  return apiAbout || humanizeSlug(fallbackName);
}

async function sortPackages() {
  const packages = [];

  for (const name of PACKAGE_ORDER) {
    const [detail, versions] = await Promise.all([
      fetchJson(`${API_BASE}/users/${USERNAME}/packages/container/${encodeURIComponent(name)}`),
      fetchJson(`${API_BASE}/users/${USERNAME}/packages/container/${encodeURIComponent(name)}/versions`),
    ]);
    const repoPath = PACKAGE_REPOS[name];
    const about = repoPath ? await fetchRepoAbout(repoPath, name) : humanizeSlug(name);
    const updated = newestVersionDate(versions);

    packages.push({
      name,
      description: about,
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
