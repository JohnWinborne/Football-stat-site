import { useEffect, useMemo, useState } from "react";
import "./players.css";
import { addFavorite, isFavorite, removeFavorite } from "../utils/favorites";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar as solidStar } from "@fortawesome/free-solid-svg-icons";
import { faStar as regularStar } from "@fortawesome/free-regular-svg-icons";

const API_BASE = "http://localhost:5000";
const LATEST_SEASON = "2025REG";

function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const d = new Date(birthDate); //use date object to turn 2000-05-10 into may 10, 2000
  if (Number.isNaN(d.getTime())) return null; //checks if date valid

  const now = new Date(); //get current date
  let age = now.getFullYear() - d.getFullYear(); //get now year - birth year
  const m = now.getMonth() - d.getMonth(); //if negative the birthday has not happened yet this year
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function pick(obj, keys, fallback = 0) {
  if (!obj) return fallback; //check obj and uses fallback if obj is null or undefined
  for (const k of keys) {
    const v = obj[k]; // get the value of property k from the object
    if (v !== undefined && v !== null) return v; //check if we successfully got stat and returns
  }
  return fallback;
}

export default function PlayersPage() {
  //array for full player objects like id, fname, lname, ...
  const [players, setPlayers] = useState([]);
  //text typed into search bar
  const [query, setQuery] = useState("");
  //loading state for players
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  //holds error messages
  const [playersError, setPlayersError] = useState("");
  //load state for stats cause it loads after
  const [loadingStats, setLoadingStats] = useState(false);
  //error for stats
  const [statsError, setStatsError] = useState("");
  //store stats in a look up table
  const [statsByPlayerId, setStatsByPlayerId] = useState({});
  // forces rerender after localStorage changes
  const [, setFavTick] = useState(0);

  // ---- Filters ----
  const [teamOn, setTeamOn] = useState(false);
  const [team, setTeam] = useState("");

  const [posOn, setPosOn] = useState(false);
  const [pos, setPos] = useState("");

  const [statusOn, setStatusOn] = useState(false);
  const [status, setStatus] = useState("");

  const [ageOn, setAgeOn] = useState(false);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");

  // Load players
  useEffect(() => {
    const ac = new AbortController(); //can cancel the fetch request

    (async () => {
      //async so we can await
      try {
        setLoadingPlayers(true); //set loading state
        setPlayersError(""); // clear error message

        const res = await fetch(`${API_BASE}/api/players`, {
          //request to backend
          signal: ac.signal, //connect to abort controller
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`); //throw error if http status is not 200-299
        const data = await res.json(); //read and parse response body as JSON

        setPlayers(Array.isArray(data) ? data : []); //if data is an array store it if not store empty array
      } catch (e) {
        if (e.name !== "AbortError")
          //if not an abort
          setPlayersError(e.message || "Failed to load players");
      } finally {
        //always run no mater what
        setLoadingPlayers(false);
      }
    })();

    return () => ac.abort(); //returns a function that React treats it as a cleanup function
  }, []); //run this effect once when component mounts and cleanup when component unmounts

  // Load stats (no season filter)
  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        setLoadingStats(true);
        setStatsError("");

        const res = await fetch(`${API_BASE}/api/player-season-stats`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const map = {}; //an empty look up table for players
        if (Array.isArray(data)) {
          //makes sure api returned an array
          for (const row of data) {
            //loop through every stats recorded
            const id =
              row.PlayerID ?? // try multiple possible PlayerID field name
              row.PlayerId ??
              row.playerId ??
              row.playerID ??
              null;
            if (id != null) map[id] = row; // if a valid id exists, store this row in the lookup table under that id
          }
        }
        setStatsByPlayerId(map); //save the table into react state
      } catch (e) {
        if (e.name !== "AbortError") {
          setStatsError(e.message || "Failed to load season stats");
          setStatsByPlayerId({});
        }
      } finally {
        setLoadingStats(false);
      }
    })();

    return () => ac.abort();
  }, []);

  const teams = useMemo(() => {
    //useMemo recomputes this value when 'players' change
    const set = new Set(players.map((p) => p.Team).filter(Boolean));
    //takes players array and creates a new array of just team values and removes falsey values, and dups
    return ["", ...Array.from(set).sort()]; //makes set an array and sorted
    //also starts with an empty string for all teams
  }, [players]); //dependency

  const positions = useMemo(() => {
    const set = new Set(players.map((p) => p.Position).filter(Boolean));
    return ["", ...Array.from(set).sort()];
  }, [players]);

  const statuses = useMemo(() => {
    const set = new Set(players.map((p) => p.Status).filter(Boolean));
    return ["", ...Array.from(set).sort()];
  }, [players]);

  const filtered = useMemo(() => {
    //useMemo depends on players, query, and filter states
    const q = query.trim().toLowerCase(); //makes query have no spaces and lowercase

    return players.filter((p) => {
      //loops over every player and keeps only players that return true
      const name = `${p.FirstName || ""} ${p.LastName || ""}`
        .trim()
        .toLowerCase(); //combine first and last names, handle missing values, and normalize for search

      const matchQuery = !q || name.includes(q); //if query is empty match everything
      const matchTeam = !teamOn || !team || p.Team === team; //if team filter is off or no team selected allow all otherwise require matching team
      const matchPos = !posOn || !pos || p.Position === pos;
      const matchStatus = !statusOn || !status || p.Status === status;

      const age = ageFromBirthDate(p.BirthDate);
      const min = ageMin === "" ? null : Number(ageMin); //converts string inputs into numbers
      const max = ageMax === "" ? null : Number(ageMax);

      const matchAge =
        !ageOn ||
        (age != null &&
          (min == null || age >= min) &&
          (max == null || age <= max));

      // a player is included only if these are true
      return matchQuery && matchTeam && matchPos && matchStatus && matchAge;
    });
  }, [
    players,
    query,
    teamOn,
    team,
    posOn,
    pos,
    statusOn,
    status,
    ageOn,
    ageMin,
    ageMax,
  ]); //dependency array

  const toggleFavorite = (player) => {
    //this adds and removes players from favs
    if (isFavorite(player.PlayerID)) removeFavorite(player.PlayerID);
    else addFavorite(player);
    setFavTick((t) => t + 1); //force a rerender after localStorage changes by updating dummy state
  };

  const clearAll = () => {
    //resets filters
    setTeamOn(false);
    setTeam("");
    setPosOn(false);
    setPos("");
    setStatusOn(false);
    setStatus("");
    setAgeOn(false);
    setAgeMin("");
    setAgeMax("");
    setQuery("");
  };

  return (
    <div className="page">
      <h1 className="title">NFL PLAYER STATS</h1>
      <div className="searchRow">
        <input
          className="search"
          placeholder="search player name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Filters bar */}
      <div className="filtersRow">
        {/* TEAM */}
        <label
          className="pill"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            type="checkbox"
            checked={teamOn}
            onChange={(e) => setTeamOn(e.target.checked)}
          />
          Team
        </label>
        <select
          className="pill"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          disabled={!teamOn}
        >
          {teams.map((t) => (
            <option key={t || "all"} value={t}>
              {t ? t : "All Teams"}
            </option>
          ))}
        </select>

        {/* POSITION */}
        <label
          className="pill"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            type="checkbox"
            checked={posOn}
            onChange={(e) => setPosOn(e.target.checked)}
          />
          Position
        </label>
        <select
          className="pill"
          value={pos}
          onChange={(e) => setPos(e.target.value)}
          disabled={!posOn}
        >
          {positions.map((p) => (
            <option key={p || "all"} value={p}>
              {p ? p : "All Positions"}
            </option>
          ))}
        </select>

        {/* STATUS */}
        <label
          className="pill"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            type="checkbox"
            checked={statusOn}
            onChange={(e) => setStatusOn(e.target.checked)}
          />
          Status
        </label>
        <select
          className="pill"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={!statusOn}
        >
          {statuses.map((s) => (
            <option key={s || "all"} value={s}>
              {s ? s : "All Statuses"}
            </option>
          ))}
        </select>

        {/* AGE */}
        <label className="pill pillCheck">
          <input
            type="checkbox"
            checked={ageOn}
            onChange={(e) => setAgeOn(e.target.checked)}
          />
          Age
        </label>
        <input
          className="pill pillNum"
          type="number"
          placeholder="Min"
          value={ageMin}
          onChange={(e) => setAgeMin(e.target.value)}
          disabled={!ageOn}
        />
        <input
          className="pill"
          type="number"
          placeholder="Max"
          value={ageMax}
          onChange={(e) => setAgeMax(e.target.value)}
          disabled={!ageOn}
          style={{ width: 80 }}
        />

        <button className="pill" onClick={clearAll}>
          Clear
        </button>
      </div>

      {loadingPlayers && <p className="meta">Loading players…</p>}
      {playersError && <p className="meta">Players error: {playersError}</p>}
      {loadingStats && <p className="meta">Loading stats…</p>}
      {statsError && <p className="meta">Stats error: {statsError}</p>}

      <div className="grid">
        {filtered.map((p) => {
          //loop through filtered players
          const saved = isFavorite(p.PlayerID);
          const age = ageFromBirthDate(p.BirthDate);
          const row = statsByPlayerId[p.PlayerID] || null;

          const pos = (p.Position || "").toUpperCase();
          //passing yards
          const passYds = pick(row, ["PassingYards"], 0);
          const passTD = pick(row, ["PassingTouchdowns"], 0);
          const passInt = pick(
            row,
            ["PassingInterceptions", "Interceptions"],
            0,
          );
          // rushing stats
          const rushYds = pick(row, ["RushingYards"], 0);
          const rushTD = pick(row, ["RushingTouchdowns"], 0);

          const recYds = pick(row, ["ReceivingYards"], 0);
          const recTD = pick(row, ["ReceivingTouchdowns"], 0);
          const recs = pick(row, ["Receptions"], 0);
          // defensive stats
          const tackles =
            pick(row, ["SoloTackles"], 0) + pick(row, ["AssistedTackles"], 0);
          const sacks = pick(row, ["Sacks"], 0);
          const picks = pick(row, ["Interceptions"], 0);
          // kicking stats
          const fgMade = pick(row, ["FieldGoalsMade"], 0);
          const fgAtt = pick(row, ["FieldGoalsAttempted"], 0);
          const xpMade = pick(row, ["ExtraPointsMade"], 0);

          return (
            <div className="card" key={p.PlayerID}>
              {p.photoUrl ? (
                <img
                  className="avatar"
                  src={p.photoUrl}
                  alt={`${p.FirstName} ${p.LastName}`}
                />
              ) : (
                <div className="avatar" />
              )}

              <div className="cardBody">
                <h3 className="name">
                  {p.DisplayName || `${p.FirstName} ${p.LastName}`}
                </h3>

                <p className="meta">
                  <b>Team:</b> {p.Team || "—"} &nbsp; <b>Pos:</b>{" "}
                  {p.Position || "—"}
                </p>

                <p className="meta">
                  <b>Age:</b> {age ?? "—"}
                </p>
                <p className="meta">
                  <b>BirthDate:</b> {p.BirthDate || "missing"}
                </p>

                {!row && (
                  <p className="meta">
                    <b>{LATEST_SEASON}:</b> No stats found
                  </p>
                )}

                {row && pos === "QB" && (
                  <p className="meta">
                    <b>{LATEST_SEASON} QB:</b> {passYds} pass yds, {passTD} TD,{" "}
                    {passInt} INT
                  </p>
                )}

                {row && ["RB", "WR", "TE"].includes(pos) && (
                  <p className="meta">
                    <b>{LATEST_SEASON} Off:</b> Rush {rushYds} yds/{rushTD} TD •
                    Rec {recs} / {recYds} yds/{recTD} TD
                  </p>
                )}

                {row && pos === "K" && (
                  <p className="meta">
                    <b>{LATEST_SEASON} K:</b> FG {fgMade}/{fgAtt} • XP {xpMade}
                  </p>
                )}

                {row && !["QB", "RB", "WR", "TE", "K"].includes(pos) && (
                  <p className="meta">
                    <b>{LATEST_SEASON} Def:</b> {tackles} tackles • {sacks}{" "}
                    sacks • {picks} INT
                  </p>
                )}

                <button className="pill" onClick={() => toggleFavorite(p)}>
                  <FontAwesomeIcon
                    icon={saved ? solidStar : regularStar}
                    color={saved ? "gold" : "gray"}
                    className="starIcon"
                  />
                  {saved ? "Saved" : "Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
