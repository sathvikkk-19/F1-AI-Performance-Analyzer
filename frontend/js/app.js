/* =========================================================
   APPLICATION ENTRYPOINT (BOOTSTRAP)
========================================================= */

import { API_BASE_URL, getMyTeam, setMyTeam } from "./config.js";
import {
    goBack,
    setNavActive,
    switchToMyTeam,
    switchToStrategy,
    switchToCareer,
    switchToProfile,
    switchToOtherTeams,
    switchToAdmin,
    clearStrategyResults
} from "./navigation.js";
import { loadTracks, renderTeamsGrid, loadOtherTeam, renderTeamHero, selectActiveTeam } from "./teams.js";
import { analyze, selectStrategy } from "./strategy.js";
import {
    startCareer,
    selectCareerDriver,
    closeDriverCareerModal,
    confirmDriverCareer,
    runCareerRace,
    switchCareerRaceTab,
    loadCareerUpgrades,
    buyCareerUpgrade,
    loadCareerDashboard
} from "./career.js";
import { loadUserProfile, handleProfileUpdate } from "./profile.js";
import { loadAdminDashboard, filterAdminUsers, openAdminInspectModal, closeAdminInspectModal } from "./admin.js";
import { initMotion } from "./motion.js";

/*
 * Expose functions to window for backward compatibility with inline HTML onclick attributes
 */
window.goBack = goBack;
window.setNavActive = setNavActive;
window.switchToMyTeam = switchToMyTeam;
window.switchToStrategy = switchToStrategy;
window.switchToCareer = switchToCareer;
window.switchToProfile = switchToProfile;
window.switchToOtherTeams = switchToOtherTeams;
window.switchToAdmin = switchToAdmin;
window.clearStrategyResults = clearStrategyResults;
window.loadUserProfile = loadUserProfile;
window.handleProfileUpdate = handleProfileUpdate;

window.loadTracks = loadTracks;
window.renderTeamsGrid = renderTeamsGrid;
window.loadOtherTeam = loadOtherTeam;
window.renderTeamHero = renderTeamHero;
window.selectActiveTeam = selectActiveTeam;

window.analyze = analyze;
window.selectStrategy = selectStrategy;

window.startCareer = startCareer;
window.selectCareerDriver = selectCareerDriver;
window.closeDriverCareerModal = closeDriverCareerModal;
window.confirmDriverCareer = confirmDriverCareer;
window.runCareerRace = runCareerRace;
window.switchCareerRaceTab = switchCareerRaceTab;
window.loadCareerUpgrades = loadCareerUpgrades;
window.buyCareerUpgrade = buyCareerUpgrade;
window.loadCareerDashboard = loadCareerDashboard;

window.loadAdminDashboard = loadAdminDashboard;
window.filterAdminUsers = filterAdminUsers;
window.openAdminInspectModal = openAdminInspectModal;
window.closeAdminInspectModal = closeAdminInspectModal;
window.signOut = signOut;

export async function signOut() {
    try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: "POST",
            credentials: "include"
        });
    } catch (e) {
        // ignore
    }
    sessionStorage.clear();
    window.location.href = "login.html";
}

async function syncAuthStatus() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" });
        if (res.ok) {
            const data = await res.json();
            if (data.authenticated && data.user) {
                const user = data.user;
                sessionStorage.setItem("f1_auth_session", "authenticated");
                sessionStorage.setItem("f1_username", user.username || "");
                sessionStorage.setItem("f1_role", user.role || "user");
                sessionStorage.setItem("f1_is_admin", user.is_admin ? "true" : "false");
                if (user.selected_team) {
                    setMyTeam(user.selected_team);
                }
            }
        }
    } catch (err) {
        console.warn("Could not check /api/auth/me:", err);
    }

    const username = sessionStorage.getItem("f1_username") || "Driver";
    const isAdmin = sessionStorage.getItem("f1_is_admin") === "true";
    const currentTeam = getMyTeam();

    const userBadgeEl = document.getElementById("navUserBadge");
    if (userBadgeEl) {
        userBadgeEl.innerHTML = `
            <span style="color:var(--text-muted); font-size:11px;">CALLSIGN:</span>
            <strong style="color:#ffffff; font-family:'Orbitron', monospace;">${username}</strong>
            ${isAdmin ? `<span style="background:rgba(255,215,0,0.2); border:1px solid rgba(255,215,0,0.6); color:var(--gold); padding:2px 6px; border-radius:3px; font-size:9px; font-weight:700;">ADMIN</span>` : ""}
        `;
    }

    const teamBadgeEl = document.getElementById("navCurrentTeamBadge");
    if (teamBadgeEl) {
        teamBadgeEl.textContent = currentTeam;
    }

    const btnAdmin = document.getElementById("btnAdminView");
    if (btnAdmin) {
        btnAdmin.style.display = isAdmin ? "inline-flex" : "none";
    }
}

/*
 * Main Bootstrap
 */
async function boot() {
    await syncAuthStatus();
    loadTracks();
    renderTeamsGrid();

    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");

    if (view === "admin") {
        switchToAdmin();
    } else if (view === "other") {
        switchToOtherTeams();
    } else if (view === "strategy") {
        switchToStrategy();
    } else if (view === "career") {
        switchToCareer();
    } else if (view === "profile") {
        switchToProfile();
    } else {
        switchToMyTeam();
    }

    initMotion();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}
