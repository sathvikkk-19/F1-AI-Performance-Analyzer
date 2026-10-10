/* =========================================================
   NAVIGATION & VIEW CONTROLLERS
   Multi-page segregated view switching for F1 Simulator
========================================================= */

import { getMyTeam } from "./config.js";
import { state, resetStrategyState } from "./state.js";
import { show } from "./utils.js";
import { renderTeamHero, renderTeamsGrid } from "./teams.js";
import { loadCareerDashboard } from "./career.js";
import { loadUserProfile } from "./profile.js";

function safeScrollToTop() {
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        try {
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (e) {
            window.scrollTo(0, 0);
        }
    }
}

export function goBack() {
    window.location.href = "index.html";
}

export function setNavActive(mode) {
    const btnMy = document.getElementById("btnMyTeam");
    const btnStrategy = document.getElementById("btnStrategy");
    const btnCareer = document.getElementById("btnCareer");
    const btnOther = document.getElementById("btnOtherTeams");
    const btnProfile = document.getElementById("btnProfile");
    const btnAdmin = document.getElementById("btnAdminView");

    if (btnMy) btnMy.classList.toggle("active", mode === "my");
    if (btnStrategy) btnStrategy.classList.toggle("active", mode === "strategy");
    if (btnCareer) btnCareer.classList.toggle("active", mode === "career");
    if (btnOther) btnOther.classList.toggle("active", mode === "other");
    if (btnProfile) btnProfile.classList.toggle("active", mode === "profile");
    if (btnAdmin) btnAdmin.classList.toggle("active", mode === "admin");
}

export function clearStrategyResults() {
    resetStrategyState();

    const result = document.getElementById("result");
    const analyzeSection = document.getElementById("analyzeSection");
    const generatedScene = document.getElementById("sceneGeneratedStrategy");

    if (result) {
        result.innerHTML = "";
        if (analyzeSection && result.parentElement !== analyzeSection) {
            analyzeSection.appendChild(result);
        }
    }

    if (generatedScene) generatedScene.style.display = "none";
}

function hideAllViews() {
    const views = [
        "viewMyTeam",
        "viewStrategy",
        "viewCareer",
        "viewProfile",
        "viewOtherTeams",
        "viewAdmin"
    ];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

export function setMyTeamScenesVisible(visible) {
    // Compatibility stub for legacy scene toggling
}

export function switchToMyTeam() {
    hideAllViews();
    setNavActive("my");

    const view = document.getElementById("viewMyTeam");
    if (view) view.style.display = "block";

    const activeTeam = getMyTeam();
    renderTeamHero(activeTeam, true);

    // Update URL param without full reload
    if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", "?view=my");
    }

    safeScrollToTop();
}

export function switchToStrategy() {
    hideAllViews();
    setNavActive("strategy");

    const view = document.getElementById("viewStrategy");
    if (view) view.style.display = "block";

    const analyzeSection = document.getElementById("analyzeSection");
    if (analyzeSection) analyzeSection.style.display = "block";

    const activeTeam = getMyTeam();
    const strategyTeam = document.getElementById("strategyActiveTeamName");
    if (strategyTeam) strategyTeam.textContent = activeTeam;

    const trackSelect = document.getElementById("track");
    if (trackSelect && !trackSelect.options.length) {
        if (typeof window.loadTracks === "function") window.loadTracks();
    }

    if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", "?view=strategy");
    }

    safeScrollToTop();
}

export function switchToCareer() {
    hideAllViews();
    setNavActive("career");

    const view = document.getElementById("viewCareer");
    if (view) view.style.display = "block";

    const careerPanel = document.getElementById("careerPanel");
    if (careerPanel) careerPanel.style.display = "block";
    const careerUpdates = document.getElementById("careerUpdatesPanel");
    if (careerUpdates) careerUpdates.style.display = "block";

    loadCareerDashboard();

    if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", "?view=career");
    }

    safeScrollToTop();
}

export function switchToProfile() {
    hideAllViews();
    setNavActive("profile");

    const view = document.getElementById("viewProfile");
    if (view) view.style.display = "block";

    loadUserProfile();

    if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", "?view=profile");
    }

    safeScrollToTop();
}

export function switchToOtherTeams() {
    hideAllViews();
    setNavActive("other");

    const view = document.getElementById("viewOtherTeams");
    if (view) view.style.display = "block";

    const otherTeamsSection = document.getElementById("otherTeamsSection");
    if (otherTeamsSection) otherTeamsSection.style.display = "block";

    renderTeamsGrid();

    if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", "?view=other");
    }

    safeScrollToTop();
}

export function switchToAdmin() {
    hideAllViews();
    setNavActive("admin");

    const view = document.getElementById("viewAdmin");
    if (view) view.style.display = "block";

    const adminSection = document.getElementById("adminSection");
    if (adminSection) adminSection.style.display = "block";

    if (typeof window !== "undefined" && typeof window.loadAdminDashboard === "function") {
        window.loadAdminDashboard();
    }

    if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", "?view=admin");
    }

    safeScrollToTop();
}
