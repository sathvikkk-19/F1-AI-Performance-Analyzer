/* =========================================================
   APPLICATION CONFIGURATION & CONSTANTS
========================================================= */

export const DEFAULT_TEAM = "Oracle Red Bull Racing";

export function getMyTeam() {
    if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem("f1_selected_team") || localStorage.getItem("f1_selected_team");
        if (stored) return stored;
    }
    return DEFAULT_TEAM;
}

export function setMyTeam(teamName) {
    if (!teamName) return;
    if (typeof window !== "undefined") {
        sessionStorage.setItem("f1_selected_team", teamName);
        localStorage.setItem("f1_selected_team", teamName);
    }
    MY_TEAM = teamName;
}

export let MY_TEAM = getMyTeam();

// Dynamic API origin supporting custom domains, subdomains, and local dev
export const API_BASE_URL = (typeof window !== "undefined" && window.location.origin && !window.location.origin.startsWith("file:"))
    ? (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "http://127.0.0.1:5000" : window.location.origin)
    : "http://127.0.0.1:5000";

export const STRATEGY_API_URL = `${API_BASE_URL}/api/strategy/analyze`;

export const TRACKS = [
    "Australia",
    "China",
    "Japan",
    "Bahrain",
    "Saudi Arabia",
    "Miami",
    "Canada",
    "Monaco",
    "Spain",
    "Austria",
    "Great Britain",
    "Belgium",
    "Hungary",
    "Netherlands",
    "Italy",
    "Madrid",
    "Azerbaijan",
    "Singapore",
    "USA Austin",
    "Mexico",
    "Brazil",
    "Las Vegas",
    "Qatar",
    "Abu Dhabi"
];
