import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "./playerDetails.css";
import { addFavorite, isFavorite, removeFavorite } from "../utils/favorites";

const API_BASE = "http://localhost:5000";
const LATEST_SEASON = "2025REG";

function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function pick(obj, keys, fallback = 0) {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
}

export default function PlayerDetailsPage() {
  const { id } = useParams();

  const [player, setPlayer] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favTick, setFavTick] = useState(0);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);

        const [playersRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/api/players`, { signal: ac.signal }),
          fetch(`${API_BASE}/api/player-season-stats`, { signal: ac.signal }),
        ]);

        if (!playersRes.ok) throw new Error(`Players HTTP ${playersRes.status}`);
        if (!statsRes.ok) throw new Error(`Stats HTTP ${statsRes.status}`);

        const playersData = await playersRes.json();
        const statsData = await statsRes.json();

        const foundPlayer = Array.isArray(playersData)
          ? playersData.find((p) => String(p.PlayerID) === String(id))
          : null;

        const foundStats = Array.isArray(statsData)
          ? statsData.find((row) => String(row.PlayerID ?? row.PlayerId ?? row.playerId ?? row.playerID) === String(id))
          : null;

        setPlayer(foundPlayer || null);
        setStats(foundStats || null);
      } catch (err) {
        console.error(err);
        setPlayer(null);
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [id]);

  const toggleFavorite = () => {
    if (!player) return;

    if (isFavorite(player.PlayerID)) removeFavorite(player.PlayerID);
    else addFavorite(player);

    setFavTick((t) => t + 1);
  };

  if (loading) return <div className="detailsPage">Loading player...</div>;
  if (!player) return <div className="detailsPage">Player not found.</div>;

  const saved = isFavorite(player.PlayerID);
  const age = ageFromBirthDate(player.BirthDate);
  const pos = (player.Position || "").toUpperCase();

  const passYds = pick(stats, ["PassingYards"], 0);
  const passTD = pick(stats, ["PassingTouchdowns"], 0);
  const passInt = pick(stats, ["PassingInterceptions", "Interceptions"], 0);

  const rushYds = pick(stats, ["RushingYards"], 0);
  const rushTD = pick(stats, ["RushingTouchdowns"], 0);

  const recYds = pick(stats, ["ReceivingYards"], 0);
  const recTD = pick(stats, ["ReceivingTouchdowns"], 0);
  const recs = pick(stats, ["Receptions"], 0);

  const tackles =
    pick(stats, ["SoloTackles"], 0) + pick(stats, ["AssistedTackles"], 0);
  const sacks = pick(stats, ["Sacks"], 0);
  const picks = pick(stats, ["Interceptions"], 0);

  return (
    <div className="detailsPage">
      <Link to="/" className="backLink">← Back to Players</Link>

      <h1 className="detailsTitle">Player Details</h1>

      <div className="detailsLayout">
        <div className="detailsLeft">
          {player.photoUrl ? (
            <img
              className="detailsPhoto"
              src={player.photoUrl}
              alt={player.DisplayName || `${player.FirstName} ${player.LastName}`}
            />
          ) : (
            <div className="detailsPhoto placeholder">No Photo</div>
          )}

          <h2 className="detailsName">
            {player.DisplayName || `${player.FirstName} ${player.LastName}`}
          </h2>

          <p>{player.Position || "—"}</p>
          <p>Age: {age ?? "—"}</p>
          <p>Current Team: {player.Team || "—"}</p>
        </div>

        <div className="detailsRight">
          <div className="detailsTopRow">
            <div>
              <p><b>Current team:</b> {player.Team || "—"}</p>
              <p><b>Status:</b> {player.Status || "—"}</p>
              <p><b>BirthDate:</b> {player.BirthDate || "—"}</p>
            </div>

            <button className="favoriteBtn" onClick={toggleFavorite}>
              {saved ? "Remove Favorite" : "Add Favorite"}
            </button>
          </div>

          <div className="statsBox">
            <h3>{LATEST_SEASON} Stats</h3>

            {!stats && <p>No stats found.</p>}

            {stats && pos === "QB" && (
              <>
                <p>Passing Yards: {passYds}</p>
                <p>Passing TD: {passTD}</p>
                <p>Interceptions: {passInt}</p>
              </>
            )}

            {stats && ["RB", "WR", "TE"].includes(pos) && (
              <>
                <p>Rushing Yards: {rushYds}</p>
                <p>Rushing TD: {rushTD}</p>
                <p>Receptions: {recs}</p>
                <p>Receiving Yards: {recYds}</p>
                <p>Receiving TD: {recTD}</p>
              </>
            )}

            {stats && !["QB", "RB", "WR", "TE", "K"].includes(pos) && (
              <>
                <p>Total Tackles: {tackles}</p>
                <p>Sacks: {sacks}</p>
                <p>Interceptions: {picks}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}