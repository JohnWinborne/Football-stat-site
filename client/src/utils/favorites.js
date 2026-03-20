const STORAGE_KEY = "favoritePlayers";

//Safely read favorites from localStorage
export function getFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return []; //nothing saved yet

    const parsed = JSON.parse(raw); //convert string back into array
    return Array.isArray(parsed) ? parsed : []; //makes sure its an array
  } catch (err) {
    console.error("Failed to read favorites:", err);
    return [];
  }
}

// Check if a player is already saved
export function isFavorite(playerId) {
  if (!playerId) return false; //can’t find playerId

  const favorites = getFavorites(); //loads favorites from localStorage
  return favorites.some((p) => p.PlayerID === playerId); //returns true if any fav player has the same PlayerID
}

// Add a player to favorites
export function addFavorite(player) {
  if (!player || !player.PlayerID) return;
  const favorites = getFavorites(); //get curr favs
  const alreadySaved = favorites.some(
    //check if player is in favs already
    (p) => p.PlayerID === player.PlayerID,
  );

  if (!alreadySaved) {
    //if not saved add the player to favs array
    favorites.push(player);
    saveFavorites(favorites);
  }
}

// Remove a player from favorites
export function removeFavorite(playerId) {
  if (!playerId) return; //check if playerId is missing

  ////get curr favs and makes new array without the playerID we want to get rid of
  const favorites = getFavorites().filter(
    (p) => p.PlayerID !== playerId,
  );
  saveFavorites(favorites); //update favorites
  return favorites;
}

// Clear all favorites
export function clearFavorites() {
  try {
    localStorage.removeItem(STORAGE_KEY); //deletes the entire favoritePlayers from localStorage
  } catch (err) {
    console.error("Failed to clear favorites:", err);
  }
}

// Internal helper to write safely
function saveFavorites(favorites) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)); //store as strings
  } catch (err) {
    console.error("Failed to save favorites:", err);
  }
}
