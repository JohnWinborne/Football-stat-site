import "./favorites.css";
import { useEffect, useState } from "react";
import { getFavorites, removeFavorite } from "../utils/favorites";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import defaultAvatar from "../assets/MissingPhotoAvatar.png";
//players colors
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

export default function Favorites() {
  // holds favs and updates that list
  const [favorites, setFavorites] = useState([]);
  // lets navigate to player details page when you click them
  const navigate = useNavigate();
  //reads local storage and stores it
  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  const handleRemove = (id) => {
    const updated = removeFavorite(id); //call remove function
    setFavorites(updated); //updates
  };

  return (
    <div className="favoritesPage">
      <div className="favoritesInner">
        <h1 className="favoritesTitle">Favorites</h1>

        {favorites.length === 0 ? (
          <p className="favoritesEmpty">No favorites yet.</p>
        ) : (
          <div className="favoritesGrid">
            {favorites.map((p) => {
              return (
                <div
                  key={p.PlayerID}
                  className="card"
                  onClick={() => navigate(`/player/${p.PlayerID}`)}
                  style={{
                    "--team-color": TEAM_COLORS[p.Team] || "#ccc",
                  }}
                >
                  <img
                    className="avatar"
                    src={p.photoUrl || defaultAvatar}
                    alt={`${p.FirstName} ${p.LastName}`}
                    onError={(e) => {
                      e.currentTarget.src = defaultAvatar;
                    }}
                  />

                  <div className="cardBody">
                    <h3 className="name">
                      {p.DisplayName || `${p.FirstName} ${p.LastName}`}
                    </h3>

                    <p className="meta">
                      <b>Team:</b> {p.Team || "—"} &nbsp; <b>Pos:</b>{" "}
                      {p.Position || "—"}
                    </p>

                    <p className="meta">
                      <b>Age:</b> {p.Age ?? "—"}
                    </p>

                    <button
                      className="pill"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(p.PlayerID);
                      }}
                    >
                      <FontAwesomeIcon
                        icon={faStar}
                        color="gold"
                        className="starIcon"
                      />
                      Saved
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
