import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import PlayersPage from "./pages/PlayersPage";
import Favorites from "./pages/Favorites";
import PlayerDetailsPage from "./pages/PlayerDetailsPage";

export default function App() {
  return (
    <BrowserRouter>
      <div>
        <nav style={{ padding: 16, display: "flex", gap: 12 }}>
          <Link to="/">Players</Link>
          <Link to="/favorites">Favorites</Link>
        </nav>

        <Routes>
          <Route path="/" element={<PlayersPage />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/player/:id" element={<PlayerDetailsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
