import { useState } from "react";
import PlayersPage from "./pages/PlayersPage";
import Favorites from "./pages/Favorites";

export default function App() {
  const [page, setPage] = useState("players");

  return (
    <div>
      <nav style={{ padding: 16, display: "flex", gap: 12 }}>
        <button onClick={() => setPage("players")}>Players</button>
        <button onClick={() => setPage("favorites")}>Favorites</button>
      </nav>

      {page === "players" ? <PlayersPage /> : <Favorites />}
    </div>
  );
}
