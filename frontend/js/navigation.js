/* =========================================================
   NAVIGATION & VIEW CONTROLLERS
========================================================= */

import { getMyTeam } from "./config.js";
import { state, resetStrategyState } from "./state.js";
import { show } from "./utils.js";
import { renderTeamHero, renderTeamsGrid } from "./teams.js";
import { loadCareerDashboard } from "./career.js";

export function goBack() {
    window.location.href = "index.html";
}

export function setNavActive(mode) {
    const btnMy = document.getElementById("btnMyTeam");
    const btnOther = document.getElementById("btnOtherTeams");
    const btnAdmin = document.getElementById("btnAdminView");
    if (btnMy) btnMy.classList.toggle("active", mode === "my");
    if (btnOther) btnOther.classList.toggle("active", mode === "other");
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

export function setMyTeamScenesVisible(visible) {
    ["sceneHero", "sceneDrivers", "sceneStrategy", "sceneGeneratedStrategy", "sceneCareer", "sceneUpdates"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? "block" : "none";
    });
}

export function switchToMyTeam() {
    setMyTeamScenesVisible(true);
    setNavActive("my");

    show("adminSection", false);
    show("careerPanel", true);
    loadCareerDashboard();

    show("otherTeamsSection", false);
    const activeTeam = getMyTeam();
    renderTeamHero(activeTeam, true);

    show("heroSection", true, "flex");
    const sceneHero = document.getElementById("sceneHero");
    const sceneDrivers = document.getElementById("sceneDrivers");
    if (sceneHero) sceneHero.style.display = "block";
    if (sceneDrivers) sceneDrivers.style.display = "block";

    show("driversSection", true);
    show("analyzeSection", true);

    clearStrategyResults();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

export function switchToOtherTeams() {
    setMyTeamScenesVisible(false);
    setNavActive("other");
    show("adminSection", false);
    show("careerPanel", false);
    show("heroSection", false);
    show("driversSection", false);
    show("analyzeSection", false);
    clearStrategyResults();
    renderTeamsGrid();
    show("otherTeamsSection", true);

    const otherSection = document.getElementById("otherTeamsSection");
    if (otherSection) {
        otherSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

export function switchToAdmin() {
    setMyTeamScenesVisible(false);
    setNavActive("admin");
    show("careerPanel", false);
    show("heroSection", false);
    show("driversSection", false);
    show("analyzeSection", false);
    show("otherTeamsSection", false);
    clearStrategyResults();

    show("adminSection", true);

    // Call admin loader if registered
    if (typeof window !== "undefined" && typeof window.loadAdminDashboard === "function") {
        window.loadAdminDashboard();
    }

    const adminSection = document.getElementById("adminSection");
    if (adminSection) {
        adminSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}
