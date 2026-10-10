/* =========================================================
   API SERVICE LAYER
========================================================= */

import { API_BASE_URL, STRATEGY_API_URL } from "./config.js";

export async function apiAnalyzeStrategy(payload) {
    const response = await fetch(STRATEGY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error((data && data.error) || `HTTP error ${response.status}`);
        error.details = (data && (data.details || data.error)) || `Server returned ${response.status}`;
        throw error;
    }
    return data;
}

export async function apiGetCareerDashboard() {
    const response = await fetch(`${API_BASE_URL}/api/career/dashboard`, {
        credentials: "include"
    });
    return response.json();
}

export async function apiGetCareerTeams() {
    const response = await fetch(`${API_BASE_URL}/api/career/teams`, {
        credentials: "include"
    });
    if (!response.ok) throw new Error("Failed to load career teams");
    return response.json();
}

export async function apiGetRacePace() {
    const response = await fetch(`${API_BASE_URL}/api/career/race-pace`, {
        credentials: "include"
    });
    if (!response.ok) throw new Error("Failed to load race pace");
    return response.json();
}

export async function apiStartCareer(driverId, driverName) {
    const response = await fetch(`${API_BASE_URL}/api/career/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            driver_id: driverId,
            driver_name: driverName
        })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to start career");
    }
    return data;
}

export async function apiRunCareerRace() {
    const response = await fetch(`${API_BASE_URL}/api/career/race`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || "Race simulation failed");
    }
    return data;
}

export async function apiGetCareerUpgrades() {
    const response = await fetch(`${API_BASE_URL}/api/career/upgrades`, {
        credentials: "include"
    });
    if (!response.ok) throw new Error("Failed to load upgrades");
    return response.json();
}

export async function apiBuyCareerUpgrade(component) {
    const response = await fetch(`${API_BASE_URL}/api/career/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ component })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || "Upgrade purchase failed");
    }
    return data;
}
