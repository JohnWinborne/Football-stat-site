import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "./playerDetails.css";
import defaultAvatar from "../assets/MissingPhotoAvatar.png";
import { addFavorite, isFavorite, removeFavorite } from "../utils/favorites";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
const LATEST_SEASON = "2025 REG";
// player colors
const TEAM_COLORS = {
  ARI: "#97233F",
  ATL: "#A71930",
  BAL: "#241773",
  BUF: "#00338D",
  CAR: "#0085CA",
  CHI: "#0B162A",
  CIN: "#FB4F14",
  CLE: "#311D00",
  DAL: "#003594",
  DEN: "#FB4F14",
  DET: "#0076B6",
  GB: "#203731",
  HOU: "#03202F",
  IND: "#002C5F",
  JAX: "#006778",
  KC: "#E31837",
  LV: "#000000",
  LAC: "#0080C6",
  LAR: "#003594",
  MIA: "#008E97",
  MIN: "#4F2683",
  NE: "#002244",
  NO: "#D3BC8D",
  NYG: "#0B2265",
  NYJ: "#125740",
  PHI: "#004C54",
  PIT: "#FFB612",
  SEA: "#002244",
  SF: "#AA0000",
  TB: "#D50A0A",
  TEN: "#4B92DB",
  WAS: "#5A1414",
};
//turns PassingYards into Passing Yards 
function formatStatLabel(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (s) => s.toUpperCase());
}

export default function PlayerDetailsPage() {
  //id is going to hold the id of the url
  const { id } = useParams();
  // holds current player and setPlayer updates it
  const [player, setPlayer] = useState(null);
  // holds stats 
  const [stats, setStats] = useState(null);
  // holds stats that are zero
  const [nonZeroStats, setNonZeroStats] = useState({});
  // holds fantasy points 
  const [fantasyPoints, setFantasyPoints] = useState(0);
  // tracks if it still loading
  const [loading, setLoading] = useState(true);
  // setFavtick rerenders page after favorite changes
  const [, setFavTick] = useState(0);
  // useEffect so we can run side effects 
  useEffect(() => {
    // lets me cancel the fetch if user leaves or id changes
    const ac = new AbortController();

    (async () => {
      try {
        //set loading to true before fetching
        setLoading(true);
        // saends request to the backend
        const res = await fetch(`${API_BASE}/api/player-details/${id}`, {
          signal: ac.signal,
        });
        // if server response with an error throw error
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // convert response to JS object
        const data = await res.json();
        // save players details
        setPlayer(data.player || null);
        setStats(data.stats || null);
        setNonZeroStats(data.nonZeroStats || {});
        setFantasyPoints(data.fantasyPoints ?? 0);
      } catch (err) {
        console.error(err);
        setPlayer(null);
        setStats(null);
        setNonZeroStats({});
        setFantasyPoints(0);
      } finally {
        setLoading(false);
      }
    })();
    // cancel old request 
    return () => ac.abort();
  }, [id]); // runs whenever id changes 
  // this adds and removes players from fav
  const toggleFavorite = () => {
    if (!player) return;

    if (isFavorite(player.PlayerID)) removeFavorite(player.PlayerID);
    else addFavorite(player);

    setFavTick((t) => t + 1);
  };

  if (loading) return <div className="detailsPage">Loading player...</div>;
  if (!player) return <div className="detailsPage">Player not found.</div>;
  // checks if this player is in favs
  const saved = isFavorite(player.PlayerID);
  const age = player.Age;

  return (
    <div className="detailsPage">
      <div className="detailsInner">
        <Link to="/" className="backLink">
          ← Back to Players
        </Link>

        <h1 className="detailsTitle">Player Details</h1>

        <div className="detailsLayout">
          <div
            className="detailsLeft"
            style={{
              "--team-color": TEAM_COLORS[player.Team] || "#ccc",
            }}
          >
           
              <img
                className="detailsPhoto"
                src={player.photoUrl || defaultAvatar}
                alt={
                  player.DisplayName || `${player.FirstName} ${player.LastName}`
                }
                style={{
                  "--team-color": TEAM_COLORS[player.Team] || "#ccc",
                }}
                onError={(e) => {
                  e.currentTarget.src = defaultAvatar;
                }}
              />
            

            <h2 className="detailsName">
              {player.DisplayName || `${player.FirstName} ${player.LastName}`}
            </h2>

            <p>{player.Position || "—"}</p>
            <p>Age: {age ?? "—"}</p>
            <p>Current Team: {player.Team || "—"}</p>
          </div>

          <div className="detailsRight">
            <div
              className="detailsTopRow"
              style={{
                "--team-color": TEAM_COLORS[player.Team] || "#ccc",
              }}
            >
              <div>
                <p>
                  <b>Current team:</b> {player.Team || "—"}
                </p>
                <p>
                  <b>BirthDate:</b> {player.BirthDate || "—"}
                </p>
              </div>

              <button className="favoriteBtn" onClick={toggleFavorite}>
                {saved ? "Remove Favorite" : "Add Favorite"}
              </button>
            </div>

            <div
              className="statsBox"
              style={{
                "--team-color": TEAM_COLORS[player.Team] || "#ccc",
              }}
            >
              <h3>{LATEST_SEASON} Stats</h3>

              {!stats && <p>No stats found.</p>}

              {stats && (
                <>
                  <p>
                    <b>Fantasy Points:</b> {fantasyPoints}
                  </p>

                  {Object.entries(nonZeroStats).length === 0 ? (
                    <p>No non-zero stats found.</p>
                  ) : (
                    Object.entries(nonZeroStats).map(([key, value]) => (
                      <p key={key}>
                        <b>{formatStatLabel(key)}:</b> {value}
                      </p>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
