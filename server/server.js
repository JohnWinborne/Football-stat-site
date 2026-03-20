const express = require("express"); //makes controling traffic easy
const axios = require("axios"); //makes getting apis easy
const cors = require("cors"); //cors controls which websites I can call to the backend from the browser
require("dotenv").config(); //loads variables from my .env file into process.env

const app = express();
app.use(express.json()); //need this to parse a request that comes in with JSON into a JavaScript object

// ---- ENV ----
const PORT = process.env.PORT || 5000;
const DISCOVERYLAB_API_KEY = process.env.DISCOVERYLAB_API_KEY;

const LATEST_SEASON = "2025REG";

const SPORTSDB_API_KEY = process.env.SPORTSDB_API_KEY || "123";

// cap how many players per /api/players call
// to protect it from being slow, breaking, or getting blocked by APIs.
const ENRICH_LIMIT = 3000;

// safety check to make sure I got the API key exists before server runs
if (!DISCOVERYLAB_API_KEY) {
  console.error("Missing DISCOVERYLAB_API_KEY in server/.env");
  process.exit(1);
}

console.log("Using LATEST_SEASON=", LATEST_SEASON);
console.log("Using SPORTSDB key=", SPORTSDB_API_KEY ? "(set)" : "(missing)");

// cors (where I allow requests from)
app.use(
  cors({
    origin: "*",
  }),
);

// in-memory cache (It stores API results in memory so the
// server doesn’t have to call external APIs every time)
const cache = new Map(); //storing in a Map

function getCache(key) {
  // try to find cahced data for that key
  const entry = cache.get(key);
  // no cache return null
  if (!entry) return null;
  //if cached data has expired delete it and return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // return data
  return entry.data;
}

function setCache(key, data, ttlMs) {
  // expiresAt tells server to delete it after the current
  // time in ms since jan 1 1970 + the time to live
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// Root
app.get("/", (req, res) => {
  //creates root for http://local:5000/
  res.send("Backend is running");
});

// DiscoveryLab wrapper where I ask the DiscoveryLab API for data
async function dlGet(url, timeout = 10000) {
  return axios.get(url, {
    //sends a HTTP GET request to url
    headers: {
      //this is to prove im allowed acces to this data with key
      "Ocp-Apim-Subscription-Key": DISCOVERYLAB_API_KEY,
    },
    timeout, //if request was longer than timeout abort and throw error
  });
}

// TheSportsDB helpers asks SportsDB for player data and checks cache
// first to avoid calling the API everytime
// endpoint: https://www.thesportsdb.com/api/v1/json/{SPORTSDB_API_KEY}/searchplayers.php?p=NAME
async function sportsDbSearchPlayerByName(fullName, timeout = 10000) {
  // lets me store each player in cache
  const key = `sportsdb_player_${fullName.toLowerCase()}`;
  // so data doesn't have to call api multiple times until time expires
  const cached = getCache(key);
  if (cached !== null) return cached;

  const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/searchplayers.php?p=${encodeURIComponent(fullName)}`;

  try {
    // api call
    const resp = await axios.get(url, { timeout }); //api call
    // gets players from data or null
    const players = resp.data?.player || null;

    // Cache results to avoid repeated lookups
    setCache(key, players, 24 * 60 * 60 * 1000); //24hrs
    return players;
  } catch (e) {
    // Cache failures stops calling the api for 5 mins
    setCache(key, null, 5 * 60 * 1000);
    return null;
  }
}

// function to pick the best match from TheSportsDB
function pickBestSportsDbMatch(list, { firstName, lastName, team }) {
  // makes sure list is an array or not empty
  if (!Array.isArray(list) || list.length === 0) return null;

  // this makes name consiset so comparisons work correctly
  const first = String(firstName || "")
    .trim()
    .toLowerCase();
  const last = String(lastName || "")
    .trim()
    .toLowerCase();
  const firstInitial = first ? first[0] : "";
  const target = `${first} ${last}`.trim();
  const teamCode = String(team || "")
    .trim()
    .toLowerCase();

  //only get football players
  const filtered = list.filter((p) => {
    const sport = String(p.strSport || "").toLowerCase();
    return sport.includes("football");
  });
  //if players exists use them
  const pool = filtered.length > 0 ? filtered : list;

  // finds full-name match and return player
  for (const p of pool) {
    const name = String(p.strPlayer || "")
      .trim()
      .toLowerCase();
    if (name === target) return p;
  }

  // same last name + same first initial + same team
  const teamMatches = pool.filter((p) => {
    const parts = String(p.strPlayer || "")
      .trim()
      .toLowerCase()
      .split(/\s+/);

    const candFirst = parts[0] || "";
    const candLast = parts.slice(1).join(" ");
    const candTeam = String(p.strTeam || "")
      .trim()
      .toLowerCase();

      //comparing results
    return (
      candLast === last &&
      candFirst[0] === firstInitial &&
      candTeam.includes(teamCode)
    );
  });

  if (teamMatches.length === 1) {
    return teamMatches[0];
  }

  // same last name + same first initial
  const initialMatches = pool.filter((p) => {
    const parts = String(p.strPlayer || "")
      .trim()
      .toLowerCase()
      .split(/\s+/);

    const candFirst = parts[0] || "";
    const candLast = parts.slice(1).join(" ");

    return candLast === last && candFirst[0] === firstInitial;
  });
// only return the result if it only found one match
  if (initialMatches.length === 1) {
    return initialMatches[0];
  }

  return null;
}
// Normalize player names so they can be matched 
// correctly across APIs
function parsePlayerName(row) {
  //try and get name from row.name otherwise combine Firstname and LastName
  const rawName = String(
    row.Name || `${row.FirstName || ""} ${row.LastName || ""}`.trim(),
  ).trim();
  //if we got names use them
  let first = String(row.FirstName || "").trim();
  let last = String(row.LastName || "").trim();
  
  if (first && last) {
    return {
      first,
      last,
      displayName: `${first} ${last}`.trim(),
    };
  }
  // handles names like J.Chase using regex line
  if (/^[A-Z]\.[A-Za-z'-]+(?:\s+[A-Za-z'.-]+)*$/i.test(rawName)) {
    const dot = rawName.indexOf(".");
    first = `${rawName.slice(0, dot)}.`;
    last = rawName.slice(dot + 1).trim();
    return {
      first,
      last,
      displayName: `${first} ${last}`.trim(),
    };
  }
  // split by spaces
  const parts = rawName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    first = first || parts[0];
    last = last || parts.slice(1).join(" ");
  } else {
    first = first || rawName;
    last = last || "";
  }

  return {
    first,
    last,
    displayName: `${first} ${last}`.trim(),
  };
}
// calculate players age from birthdate info
function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;

  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();

  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }

  return age;
}

// shared helper to get full season stats array once
async function getSeasonStatsData() {
  const cacheKey = `player_season_stats_${LATEST_SEASON}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `https://api.sportsdata.io/api/nfl/fantasy/json/PlayerSeasonStats/${LATEST_SEASON}`;
  const response = await dlGet(url, 20_000);
  const data = Array.isArray(response.data) ? response.data : [];

  setCache(cacheKey, data, 10 * 60 * 1000);
  return data;
}

// shared helper to build players from season stats
async function getPlayersData() {
  // gets data and check if it's in the cach already
  const limit = ENRICH_LIMIT;
  const cacheKey = `players_from_stats_${LATEST_SEASON}_limit_${limit}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  // get SportsData API array of player stats
  const rows = await getSeasonStatsData();

  // removes dups
  const seen = new Set();
  const players = [];

  for (const r of rows) {
    const id = r.PlayerID ?? r.PlayerId ?? r.playerId;
    if (id == null || seen.has(id)) continue;
    seen.add(id);

    const parsed = parsePlayerName(r);
    const birthDate = r.BirthDate || "";

    players.push({
      PlayerID: id,
      FirstName: parsed.first,
      LastName: parsed.last,
      DisplayName: parsed.displayName,
      Team: r.Team || "",
      Position: r.Position || "",
      Status: r.Status || "",
      Jersey: r.Jersey || "",
      BirthDate: birthDate,
      Age: ageFromBirthDate(birthDate),
      photoUrl: r.PhotoUrl || r.PhotoUrlLarge || r.PhotoUrlSmall || "",
    });
  }
  //limit how many players to enrich
  const subset = players.slice(0, Math.min(players.length, limit));
  // this helps run multiple API calls at the same time
  const CONCURRENCY = 8;
  let idx = 0;
  //grabs a player and processes them one by one
  async function worker() {
    while (idx < subset.length) {
      const i = idx++;
      const p = subset[i];

      let searchName = `${p.FirstName} ${p.LastName}`.trim();

      if (
        !p.FirstName ||
        p.FirstName.length <= 2 ||
        p.FirstName.endsWith(".")
      ) {
        searchName = p.LastName;
      }
      // removes . and suffixes
      searchName = searchName
        .replace(/\./g, "")
        .replace(/\b(Jr|III|II|IV)\b/g, "")
        .trim();

      if (!searchName) continue;

      const results = await sportsDbSearchPlayerByName(searchName, 10000);

      const best = pickBestSportsDbMatch(results, {
        firstName: p.FirstName,
        lastName: p.LastName,
        team: p.Team,
      });

      if (!best) continue;

      // keep Discovery/SportsData names
      // only use SportsDB to fill missing birth date and photo
      if (!p.BirthDate && best.dateBorn) {
        p.BirthDate = best.dateBorn;
        p.Age = ageFromBirthDate(best.dateBorn);
      }
      if (
        !p.photoUrl ||
        p.photoUrl.includes("noimage") ||
        p.photoUrl.trim() === ""
      ) {
        p.photoUrl =
          best.strCutout ||
          best.strThumb ||
          best.strRender ||
          best.strFanart1 ||
          "";
      }
    }
  }
  //runs 8 workers at once so we can run in parallel
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  //save result for 10mins and returns a clean player list
  setCache(cacheKey, players, 10 * 60 * 1000);
  return players;
}

// returns only numeric stats that are not 0
function getNonZeroNumericStats(row) {
  if (!row) return {};
  //what we don't want
  const hiddenKeys = new Set([
    "PlayerID",
    "PlayerId",
    "playerId",
    "Season",
    "SeasonType",
    "Name",
    "Team",
    "Number",
    "Position",
    "PositionCategory",
    "Played",
    "Started",
    "Updated",
  ]);

  const result = {};
  // loop through every stat and ignore irrelvant data and grab whats
  // important
  for (const [key, value] of Object.entries(row)) {
    if (hiddenKeys.has(key)) continue;
    if (typeof value !== "number") continue;
    if (value === 0) continue;

    result[key] = value;
  }

  return result;
}
// debug and test route
app.get("/api/debug/sportsdb", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.status(400).json({ error: "Missing q query param" });
    }

    const results = await sportsDbSearchPlayerByName(q, 10000);

    res.json({
      query: q,
      count: Array.isArray(results) ? results.length : 0,
      results: Array.isArray(results)
        ? results.slice(0, 5).map((p) => ({
            strPlayer: p.strPlayer,
            strSport: p.strSport,
            strLeague: p.strLeague,
            strTeam: p.strTeam,
            strCutout: p.strCutout,
            strThumb: p.strThumb,
            strRender: p.strRender,
            strFanart1: p.strFanart1,
          }))
        : [],
    });
  } catch (err) {
    console.error("SportsDB debug failed:", err.message);
    res.status(500).json({ error: "SportsDB debug failed" });
  }
});
// GET /api/player-season-stats for frontend 
app.get("/api/player-season-stats", async (req, res) => {
  try {
    const data = await getSeasonStatsData(); 

    console.log(
      "fantasy-like keys:",
      Object.keys(data[0] || {}).filter((k) =>
        k.toLowerCase().includes("fantasy"),
      ),
    );
    res.json(data); //send data back to frontend
  } catch (err) {
    console.error("Failed to fetch season stats:", err.message);
    res.status(500).json({ error: "Failed to fetch season stats" });
  }
});

// one route for player details page
app.get("/api/player-details/:id", async (req, res) => {
  try {
    const playerId = Number(req.params.id);

    if (!Number.isFinite(playerId)) {
      return res.status(400).json({ error: "Invalid player id" });
    }

    const [players, statsRows] = await Promise.all([
      getPlayersData(),
      getSeasonStatsData(),
    ]);

    const player = players.find((p) => Number(p.PlayerID) === playerId) || null;

    const stats =
      statsRows.find((row) => {
        const id =
          row.PlayerID ?? row.PlayerId ?? row.playerId ?? row.playerID ?? null;
        return Number(id) === playerId;
      }) || null;

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const nonZeroStats = getNonZeroNumericStats(stats);

    res.json({
      player,
      stats,
      nonZeroStats,
      fantasyPoints: stats?.FantasyPoints ?? 0,
    });
  } catch (err) {
    console.error("Player details route failed:", err.message);
    res.status(500).json({ error: "Failed to fetch player details" });
  }
});

// GET /api/players
app.get("/api/players", async (req, res) => {
  try {
    const players = await getPlayersData(); 

    res.json(players);
  } catch (err) {
    console.error("Players route failed:", err.message);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

// Start Server 
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
