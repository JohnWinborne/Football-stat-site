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
const ENRICH_LIMIT = 3000;

if (!DISCOVERYLAB_API_KEY) {
  console.error("Missing DISCOVERYLAB_API_KEY in server/.env");
  process.exit(1);
}

console.log("Using LATEST_SEASON=", LATEST_SEASON);
console.log("Using SPORTSDB key=", SPORTSDB_API_KEY ? "(set)" : "(missing)");

// ---- CORS ----
app.use(
  cors({
    origin: ["http://localhost:3000"],
  }),
);

// ---- in-memory cache ----
const cache = new Map();

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    //if past time of expiresAt
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttlMs) {
  //expiresAt tells server to delete it after the current time in ms since jan 1 1970 + the time to live
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ---- Root ----
app.get("/", (req, res) => {
  res.send("Backend is running"); //if localhost:5000 is visit this will appear in browser
});

// ---- DiscoveryLab wrapper ----
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

// ---- TheSportsDB helpers ----
//endpoint: https://www.thesportsdb.com/api/v1/json/{SPORTSDB_API_KEY}/searchplayers.php?p=NAME
async function sportsDbSearchPlayerByName(fullName, timeout = 10000) {
  const key = `sportsdb_player_${fullName.toLowerCase()}`;
  const cached = getCache(key);
  if (cached !== null) return cached; //so data doesn't have to call api multiple times until time expires

  const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/searchplayers.php?p=${encodeURIComponent(fullName)}`;

  try {
    const resp = await axios.get(url, { timeout }); //api call
    const players = resp.data?.player || null; //gets players from data or null

    // Cache even null results to avoid repeated lookups
    setCache(key, players, 24 * 60 * 60 * 1000); //24hrs
    return players;
  } catch (e) {
    // Cache failures stops calling the api for 5 mins
    setCache(key, null, 5 * 60 * 1000);
    return null;
  }
}

// function to pick the best match
function pickBestSportsDbMatch(list, { firstName, lastName }) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const first = String(firstName || "")
    .trim()
    .toLowerCase();
  const last = String(lastName || "")
    .trim()
    .toLowerCase();
  const target = `${first} ${last}`.trim();
  const firstInitial = first ? first[0] : "";

  // only require football, do not require strLeague
  const filtered = list.filter((p) => {
    const sport = String(p.strSport || "").toLowerCase();
    return sport.includes("football");
  });

  const pool = filtered.length > 0 ? filtered : list;

  // exact full name first
  for (const p of pool) {
    const name = String(p.strPlayer || "")
      .trim()
      .toLowerCase();
    if (name === target) return p;
  }

  // same last name + same first initial
  for (const p of pool) {
    const parts = String(p.strPlayer || "")
      .trim()
      .toLowerCase()
      .split(/\s+/);
    const candFirst = parts[0] || "";
    const candLast = parts.slice(1).join(" ");

    if (candLast === last && candFirst[0] === firstInitial) {
      return p;
    }
  }

  return pool[0];
}

function parsePlayerName(row) {
  const rawName = String(
    row.Name || `${row.FirstName || ""} ${row.LastName || ""}`.trim(),
  ).trim();

  let first = String(row.FirstName || "").trim();
  let last = String(row.LastName || "").trim();

  if (first && last) {
    return {
      first,
      last,
      displayName: `${first} ${last}`.trim(),
      hasFullFirstName: first.length > 2 && !first.endsWith("."),
    };
  }

  // Handles "M.Prater"
  if (/^[A-Z]\.[A-Za-z'-]+(?:\s+[A-Za-z'.-]+)*$/i.test(rawName)) {
    const dot = rawName.indexOf(".");
    first = `${rawName.slice(0, dot)}.`;
    last = rawName.slice(dot + 1).trim();
    return {
      first,
      last,
      displayName: `${first} ${last}`.trim(),
      hasFullFirstName: false,
    };
  }

  // Handles "M. Prater" or normal full names
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
    hasFullFirstName: first.length > 2 && !first.endsWith("."),
  };
}
app.get("/api/debug/sportsdb", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.status(400).json({ error: "Missing q query param" });
    }

    const results = await sportsDbSearchPlayerByName(q, 10_000);

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
// ---- GET /api/player-season-stats ----
app.get("/api/player-season-stats", async (req, res) => {
  //get endpoint
  try {
    const cacheKey = `player_season_stats_${LATEST_SEASON}`;
    const cached = getCache(cacheKey); //get stored data if not expired
    if (cached) return res.json(cached); //sends cached data to the browser

    const url = `https://api.sportsdata.io/api/nfl/fantasy/json/PlayerSeasonStats/${LATEST_SEASON}`; //endpoint returns all nfl player season stats
    const response = await dlGet(url, 20_000); //makes request and dlGet adds api ke header and sets timeout to 20secs

    const data = Array.isArray(response.data) ? response.data : []; //if api returns valid array use it otherwise use empty array
    console.log("sample stat row:", data[0]);

    setCache(cacheKey, data, 10 * 60 * 1000); // set the cache to expire after 10min

    res.json(data); //send data back to frontend
  } catch (err) {
    console.error("Failed to fetch season stats:", err.message);
    res.status(500).json({ error: "Failed to fetch season stats" });
  }
});
// ---- GET /api/players ----
app.get("/api/players", async (req, res) => {
  //get endpoint
  try {
    const limit = Math.max(0, ENRICH_LIMIT); //so my api quota doesn’t get destroyed

    const cacheKey = `players_from_stats_${LATEST_SEASON}_limit_${limit}`; //get unique cache key
    const cached = getCache(cacheKey); //if already cached skip api call and return
    if (cached) return res.json(cached);

    const statsUrl = `https://api.sportsdata.io/api/nfl/fantasy/json/PlayerSeasonStats/${LATEST_SEASON}`;
    const response = await dlGet(statsUrl, 20_000); //calls sportsdata with api key header 20sec timeout
    const rows = Array.isArray(response.data) ? response.data : []; //if api returns valid array use it otherwise use empty array
    // debug one raw API row

    const seen = new Set(); //get rid of dups
    const players = []; //build a no dups list
    for (const r of rows) {
      //r is a season stat
      const id = r.PlayerID ?? r.PlayerId ?? r.playerId;
      if (id == null || seen.has(id)) continue; //skip if we seen id already or is null
      seen.add(id);

      const parsed = parsePlayerName(r);

      players.push({
        PlayerID: id,
        FirstName: parsed.first,
        LastName: parsed.last,
        DisplayName: parsed.displayName,
        Team: r.Team || "",
        Position: r.Position || "",
        Status: r.Status || "",
        Jersey: r.Jersey || "",
        BirthDate: r.BirthDate || "",
        photoUrl: r.PhotoUrl || r.PhotoUrlLarge || r.PhotoUrlSmall || "",
      });
    }

    // limit=0 will safely skip enrichment
    if (limit === 0) {
      setCache(cacheKey, players, 10 * 60 * 1000);
      return res.json(players);
    }

    // Enrich every player up to the safety cap
    const subset = players.slice(0, Math.min(players.length, limit));

    const CONCURRENCY = 8; //8 enrich tasks at the same time
    let idx = 0; //shared pointer that grab the next player to process

    async function worker() {
      while (idx < subset.length) {
        const i = idx++;
        const p = subset[i];

        const hasPhoto = !!p.photoUrl;
        const hasBirthDate = !!p.BirthDate;
        const hasFullFirstName =
          p.FirstName && p.FirstName.length > 2 && !p.FirstName.endsWith(".");

        if (hasPhoto && hasBirthDate && hasFullFirstName) continue;

        const searchName = hasFullFirstName
          ? `${p.FirstName} ${p.LastName}`.trim()
          : String(p.LastName || "").trim();

        if (!searchName) continue;

        const results = await sportsDbSearchPlayerByName(searchName, 10_000);
        const best = pickBestSportsDbMatch(results, {
          firstName: p.FirstName,
          lastName: p.LastName,
        });
        if (!best) continue;

        // Fill a better display name from TheSportsDB
        if (best.strPlayer) {
          p.DisplayName = best.strPlayer;

          const parts = String(best.strPlayer).trim().split(/\s+/);
          if (parts.length >= 2) {
            p.FirstName = parts[0];
            p.LastName = parts.slice(1).join(" ");
          }
        }

        if (!p.BirthDate && best.dateBorn) {
          p.BirthDate = best.dateBorn;
        }

        if (!p.photoUrl) {
          p.photoUrl =
            best.strCutout ||
            best.strThumb ||
            best.strRender ||
            best.strFanart1 ||
            "";
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker)); //spawn 8 at a time

    setCache(cacheKey, players, 10 * 60 * 1000); //cache players
    res.json(players); //return it
  } catch (err) {
    console.error("Players route failed:", err.message);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

// ---- Start Server ----
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
