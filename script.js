const fallbackRepos = [
  {
    name: "AmiiboConverter",
    description: "Convert, duplicate, randomize. A tool for Amiibo.",
    language: "Python",
    stars: 152,
    forks: 14,
    url: "https://github.com/Lanjelin/AmiiboConverter",
  },
  {
    name: "NBNO.py",
    description: "NB.no nedlaster for books and media.",
    language: "Python",
    stars: 58,
    forks: 13,
    url: "https://github.com/Lanjelin/NBNO.py",
  },
  {
    name: "docker-remote-desktop",
    description: "Remote desktop access for Remmina, NoMachine, Parsec, and Rustdesk through the browser.",
    language: "Dockerfile",
    stars: 20,
    forks: 2,
    url: "https://github.com/Lanjelin/docker-remote-desktop",
  },
  {
    name: "nvim-docker",
    description: "Run NeoVim in Docker, from the terminal or a browser.",
    language: "Shell",
    stars: 8,
    forks: 7,
    url: "https://github.com/Lanjelin/nvim-docker",
  },
  {
    name: "sishc",
    description: "A bash script and web app for managing sish tunnels.",
    language: "HTML",
    stars: 6,
    forks: 1,
    url: "https://github.com/Lanjelin/sishc",
  },
  {
    name: "InternettUtenModem",
    description: "A retro web project asking what the internet looked like in 1997.",
    language: "HTML",
    stars: 1,
    forks: 0,
    url: "https://github.com/Lanjelin/InternettUtenModem",
  },
];

const fallbackPackages = [
  {
    name: "openaudible-docker",
    description: "Published package.",
    chip: "published",
    statsText: "Last updated",
    url: "https://github.com/users/Lanjelin/packages/container/package/openaudible-docker",
  },
  {
    name: "tor-zero",
    description: "Published package.",
    chip: "published",
    statsText: "Last updated",
    url: "https://github.com/users/Lanjelin/packages/container/package/tor-zero",
  },
  {
    name: "monerod-zero",
    description: "Published package.",
    chip: "published",
    statsText: "Last updated",
    url: "https://github.com/users/Lanjelin/packages/container/package/monerod-zero",
  },
  {
    name: "nvim-docker",
    description: "Published package.",
    chip: "published",
    statsText: "Last updated",
    url: "https://github.com/users/Lanjelin/packages/container/package/nvim-docker",
  },
  {
    name: "proton-bridge-rootless",
    description: "Published package.",
    chip: "published",
    statsText: "Last updated",
    url: "https://github.com/users/Lanjelin/packages/container/package/proton-bridge-rootless",
  },
  {
    name: "handl",
    description: "Published package.",
    chip: "published",
    statsText: "Last updated",
    url: "https://github.com/users/Lanjelin/packages/container/package/handl",
  },
];

const fallbackProfile = {
  name: "Lanjelin",
  bio: "Pondering upon world domination.",
  company: "Company",
  location: "Norway",
  avatar_url: "https://github.com/Lanjelin.png?size=192",
  public_repos: 67,
  followers: 28,
  package_count: 30,
  total_stars: 123,
};

const repoTemplate = document.getElementById("repo-card-template");

async function loadSiteData() {
  try {
    const response = await fetch("./data/site.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch {
    return {
      profile: fallbackProfile,
      repos: fallbackRepos,
      packages: fallbackPackages,
    };
  }
}

function renderCards(targetId, entries, { type = "repo" } = {}) {
  const target = document.getElementById(targetId);
  const cards = entries.map((entry) => {
    const node = repoTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".card-title").textContent = entry.name;
    node.querySelector(".card-desc").textContent = entry.description || "";
    node.querySelector(".chip").textContent = entry.chip || entry.language || "Package";
    node.querySelector(".card-stats").textContent =
      entry.statsText ||
      (typeof entry.downloadCount === "number"
        ? `${entry.downloadCount.toLocaleString()} downloads`
        : `${entry.stars ?? 0} stars · ${entry.forks ?? 0} forks`);
    const link = node.querySelector(".card-link");
    link.href = entry.url;
    link.textContent = type === "repo" ? "Open repo" : "View";
    return node;
  });

  target.replaceChildren(...cards);
}

function updateHero(profile, stats) {
  const avatar = document.getElementById("profile-avatar");
  const title = document.getElementById("hero-title");
  const bio = document.getElementById("hero-bio");
  const company = document.getElementById("hero-company");
  const country = document.getElementById("hero-country");

  if (profile.avatar_url) {
    avatar.src = profile.avatar_url;
  }

  title.textContent = profile.name || "Lanjelin";
  bio.textContent = profile.bio || "Pondering upon world domination.";
  company.textContent = profile.company || "Company";
  country.textContent = profile.location || "Country";

  document.querySelector(".stat-value[data-stat='repos']").textContent = String(stats.repoCount ?? profile.public_repos ?? 0);
  document.querySelector(".stat-value[data-stat='packages']").textContent = String(stats.packageCount ?? profile.package_count ?? 0);
  document.querySelector(".stat-value[data-stat='stars']").textContent = String(stats.totalStars ?? profile.total_stars ?? 0);
  document.querySelector(".stat-value[data-stat='followers']").textContent = String(profile.followers ?? 0);
}

function renderSite(data) {
  const profile = data.profile || fallbackProfile;
  const repos = Array.isArray(data.repos) && data.repos.length ? data.repos : fallbackRepos;
  const packages = Array.isArray(data.packages) && data.packages.length ? data.packages : fallbackPackages;

  const stats = {
    repoCount: profile.public_repos ?? repos.length,
    packageCount: profile.package_count ?? packages.length,
    totalStars: profile.total_stars ?? repos.reduce((sum, repo) => sum + (repo.stars || 0), 0),
  };

  updateHero(profile, stats);
  renderCards("repos", repos.slice(0, 6), { type: "repo" });
  renderCards("packages", packages.slice(0, 6), { type: "package" });
}

loadSiteData().then(renderSite);
