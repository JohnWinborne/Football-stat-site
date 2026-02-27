import "./favorites.css";
import { useEffect, useState } from "react";
import { getFavorites, removeFavorite } from "../utils/favorites";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function Favorites() {
  const [favorites, setFavorites] = useState([]);

  //reads local storage and stores it
  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  const handleRemove = (id) => {
    const updated = removeFavorite(id); //call remove function
    setFavorites(updated); //updates
  };

  return (
    <div className="favorites-page">
      <h1 className="favorites-title">
        <FontAwesomeIcon icon={faStar} className="favorites-icon" />
        Favorites
      </h1>

      {favorites.length === 0 ? (
        <p className="favorites-empty">No favorites yet.</p>
      ) : (
        favorites.map((p) => (
          <div key={p.PlayerID} className="favorite-item">
            <strong>
              {p.FirstName} {p.LastName}
            </strong>
            <span className="favorite-meta">
              — {p.Team} ({p.Position})
            </span>
            <button
              className="favorite-remove-btn"
              onClick={() => handleRemove(p.PlayerID)}
            >
              Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}
