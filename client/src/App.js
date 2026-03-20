import { BrowserRouter as Router, Routes, Route, NavLink } from "react-router-dom";
import PlayersPage from "./pages/PlayersPage";
import Favorites from "./pages/Favorites";
import PlayerDetailsPage from "./pages/PlayerDetailsPage";
import './app.css'

export default function App() {
  return (
    <Router>
      <nav className="navBar">
        <NavLink
          to="/"
          className={({ isActive }) => `navBtn ${isActive ? "active" : ""}`}
          end
        >
          Players
        </NavLink>

        <NavLink
          to="/favorites"
          className={({ isActive }) => `navBtn ${isActive ? "active" : ""}`}
        >
          Favorites
        </NavLink>
      </nav>

      <Routes>
        <Route path="/" element={<PlayersPage />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/player/:id" element={<PlayerDetailsPage />} />
      </Routes>
    </Router>
  );
}
