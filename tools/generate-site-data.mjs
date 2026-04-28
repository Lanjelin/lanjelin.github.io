import fs from "node:fs/promises";
import path from "node:path";

const USERNAME = "Lanjelin";
const API_BASE = "https://api.github.com";
const PACKAGE_TYPES = ["container", "npm", "maven", "rubygems", "docker", "nuget"];

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

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
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

async function downloadCountForPackage(entry) {
  const packageType = entry.package_type || entry.type || "package";
  const packageName = entry.name || entry.package_name || "";
  if (!packageName) {
    return 0;
  }

  try {
    const versions = await fetchJson(
      `${API_BASE}/users/${USERNAME}/packages/${encodeURIComponent(packageType)}/${encodeURIComponent(packageName)}/versions`,
    );
    return versions.reduce((sum, version) => sum + (version.download_count || 0), 0);
  } catch {
    return 0;
  }
}

async function sortPackages() {
  const discovered = [];

  for (const type of PACKAGE_TYPES) {
    try {
      const entries = await fetchJson(
        `${API_BASE}/users/${USERNAME}/packages?package_type=${encodeURIComponent(type)}&per_page=100`,
      );
      discovered.push(...entries);
    } catch {
      continue;
    }
  }

  const ranked = [];
  for (const entry of discovered) {
    if (!entry?.name) {
      continue;
    }
    ranked.push({
      entry,
      downloads: await downloadCountForPackage(entry),
    });
  }

  ranked.sort((a, b) => b.downloads - a.downloads);

  return ranked.slice(0, 6).map(({ entry, downloads }) => ({
    name: entry.name,
    description: entry.description || `${entry.package_type || entry.type || "package"} package.`,
    chip: entry.package_type || entry.type || "package",
    downloadCount: downloads,
    statsText: `${downloads.toLocaleString()} downloads`,
    url: entry.html_url || `https://github.com/${USERNAME}?tab=packages`,
  }));
}

async function main() {
  const [profile, repos, packages] = await Promise.allSettled([
    fetchJson(`${API_BASE}/users/${USERNAME}`),
    fetchJson(`${API_BASE}/users/${USERNAME}/repos?per_page=100&sort=updated&direction=desc`),
    sortPackages(),
  ]);

  const profileValue = profile.status === "fulfilled" ? profile.value : FALLBACK.profile;
  const repoValue = repos.status === "fulfilled" ? sortRepos(repos.value) : FALLBACK.repos;
  const packageValue = packages.status === "fulfilled" ? packages.value : FALLBACK.packages;

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
