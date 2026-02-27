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

const SPORTSDB_API_KEY = process.env.SPORTSDB_API_KEY;

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
  })
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
  if (cached) return cached; //so data doesn't have to call api multiple times until time expires

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
  if (!Array.isArray(list) || list.length === 0) {
    return null; // if empty
  }

  const target = `${firstName} ${lastName}`.trim().toLowerCase(); // normalize name format

  // get items with American Football + NFL
  const filtered = list.filter((p) => {
    const sport = String(p.strSport || "").toLowerCase();
    const league = String(p.strLeague || "").toLowerCase();

    return sport === "american football" && league.includes("nfl");
  });

  if (filtered.length === 0) {
    return null; // no players matched
  }

  // Now find best name match inside filtered results
  for (const p of filtered) {
    const name = String(p.strPlayer || "").toLowerCase();
    if (name === target) {
      return p;
    }
  }

  // If no exact match return first NFL match
  return filtered[0];
}

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
    setCache(cacheKey, data, 10 * 60 * 1000); // set the cache to expire after 10min

    res.json(data); //send data back to frontend
  } catch (err) {
    console.error("Failed to fetch season stats:", err.message);
    res.status(500).json({ error: "Failed to fetch season stats" });
  }
});
// ---- GET /api/players ----
app.get("/api/players", async (req, res) => {//get endpoint
  try {
    const limit = Math.max(0, ENRICH_LIMIT);//so my api quota doesn’t get destroyed

    const cacheKey = `players_from_stats_${LATEST_SEASON}_limit_${limit}`; //get unique cache key
    const cached = getCache(cacheKey); //if already cached skip api call and return
    if (cached) return res.json(cached);

    const statsUrl = `https://api.sportsdata.io/api/nfl/fantasy/json/PlayerSeasonStats/${LATEST_SEASON}`;
    const response = await dlGet(statsUrl, 20_000); //calls sportsdata with api key header 20sec timeout
    const rows = Array.isArray(response.data) ? response.data : []; //if api returns valid array use it otherwise use empty array

    const seen = new Set(); //get rid of dups
    const players = []; //build a no dups list

    for (const r of rows) {
      //r is a season stat
      const id = r.PlayerID ?? r.PlayerId ?? r.playerId;
      if (id == null || seen.has(id)) continue; //skip if we seen id already or is null
      seen.add(id);

      const fullName = (
        r.Name || `${r.FirstName || ""} ${r.LastName || ""}`.trim()
      ).trim(); //makes name depending on weather api gives us one name or first and last name
      const parts = fullName.split(" "); //breaks name into pieces
      const first = (r.FirstName || parts[0] || "").trim(); //set first and last name
      const last = (r.LastName || parts.slice(1).join(" ") || "").trim();

      //get players info
      players.push({
        PlayerID: id,
        FirstName: first,
        LastName: last,
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
      //pull mult players per promise
      while (idx < subset.length) {
        const i = idx++;
        const p = subset[i]; //player in index

        if (p.BirthDate && p.photoUrl) continue;

        const fullName = `${p.FirstName} ${p.LastName}`.trim();
        if (!fullName) continue;

        const results = await sportsDbSearchPlayerByName(fullName, 10_000); //use sportsdb
        const best = pickBestSportsDbMatch(results, {
          firstName: p.FirstName,
          lastName: p.LastName,
        });

        if (!best) continue; //if no match skip

        if (!p.BirthDate && best.dateBorn) p.BirthDate = best.dateBorn;

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
