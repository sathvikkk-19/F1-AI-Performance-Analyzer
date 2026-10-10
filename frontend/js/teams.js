/* =========================================================
   TEAMS & TRACKS MANAGEMENT
   Authentic F1 Constructor Telemetry browser & Team Selection
========================================================= */

import { getMyTeam, setMyTeam, API_BASE_URL, TRACKS } from "./config.js";
import { state } from "./state.js";
import { escapeHtml, show } from "./utils.js";
import { clearStrategyResults, setMyTeamScenesVisible, switchToMyTeam } from "./navigation.js";
import { teamsData } from "./teamsData.js";

// Ensure global window.teamsData and actions are always available
if (typeof window !== "undefined") {
    window.teamsData = teamsData;
    window.loadOtherTeam = loadOtherTeam;
    window.selectActiveTeam = selectActiveTeam;
}

export function loadTracks() {
    const trackEl = document.getElementById("track");
    if (!trackEl) return;
    trackEl.innerHTML = TRACKS.map(track => `<option value="${track}">${track}</option>`).join("");
}

export function renderTeamHero(name, isMyTeam) {
    const data = teamsData || (typeof window !== "undefined" ? window.teamsData : {}) || {};
    const team = data[name];
    if (!team) return;

    const teamNameEl = document.getElementById("teamName");
    const teamLogoEl = document.getElementById("teamLogo");
    const carImageEl = document.getElementById("carImage");
    const heroBgEl = document.getElementById("heroBg");
    const principalEl = document.getElementById("principal");
    const engineEl = document.getElementById("engine");
    const tagMyEl = document.getElementById("tagMy");
    const tagViewEl = document.getElementById("tagView");
    const driversEl = document.getElementById("drivers");
    const btnReturnConstructors = document.getElementById("btnReturnConstructors");

    if (teamNameEl) teamNameEl.innerText = name;
    if (teamLogoEl) teamLogoEl.src = team.logo;
    if (carImageEl) carImageEl.src = team.car;
    if (heroBgEl) heroBgEl.style.backgroundImage = `url(${team.bg})`;
    if (principalEl) principalEl.innerText = team.principal;
    if (engineEl) engineEl.innerText = team.engine;
    if (tagMyEl) tagMyEl.style.display = isMyTeam ? "block" : "none";
    if (tagViewEl) tagViewEl.style.display = isMyTeam ? "none" : "block";
    if (btnReturnConstructors) btnReturnConstructors.style.display = isMyTeam ? "none" : "inline-flex";

    const heroSection = document.getElementById("heroSection");
    if (heroSection) heroSection.style.display = "flex";
    const driversSection = document.getElementById("driversSection");
    if (driversSection) driversSection.style.display = "block";

    // Update navigation team indicator if present
    const navTeamBadge = document.getElementById("navCurrentTeamText");
    if (navTeamBadge && isMyTeam) {
        navTeamBadge.textContent = name;
    }

    if (driversEl) {
        driversEl.innerHTML = (team.drivers || []).map((driver, idx) => `
            <div class="driver-card">
                <div class="driver-card-img-wrap">
                    <img src="${driver.img}" alt="${escapeHtml(driver.name)}" loading="lazy">
                    <div class="driver-card-badge">CAR #${idx + 1}</div>
                </div>
                <div class="driver-card-info">
                    <div class="driver-card-kicker">OFFICIAL 2026 PILOT</div>
                    <div class="driver-card-name">${escapeHtml(driver.name)}</div>
                </div>
            </div>
        `).join("");
    }
}

export function renderTeamsGrid() {
    const grid = document.getElementById("constructorsGrid");
    const track = document.getElementById("otherTeamsLogoTrack");

    const data = teamsData || (typeof window !== "undefined" ? window.teamsData : {}) || {};
    const currentMyTeam = getMyTeam();
    const names = Object.keys(data).filter(name => name !== currentMyTeam);

    if (grid) {
        grid.innerHTML = names.map(name => {
            const team = data[name] || {};
            const safeName = escapeHtml(name);
            const safePrincipal = escapeHtml(team.principal || "Team Principal");
            const safeEngine = escapeHtml(team.engine || "Formula 1 Power Unit");
            const isSelected = name === state.selectedOtherTeam;
            const driversList = (team.drivers || []).map(d => `
                <span class="constructor-driver-chip">${escapeHtml(d.name)}</span>
            `).join("");

            return `
                <div class="constructor-card ${isSelected ? "selected" : ""}">
                    <div class="constructor-card-top">
                        <div class="constructor-logo-wrap">
                            <img src="${team.logo || ""}" alt="${safeName}" loading="lazy">
                        </div>
                        <div class="constructor-title-wrap">
                            <span class="constructor-engine-badge">${safeEngine} PU</span>
                            <h3 class="constructor-name">${safeName}</h3>
                        </div>
                    </div>
                    <div class="constructor-meta">
                        <div class="constructor-meta-item">
                            <span class="meta-label">Principal:</span>
                            <span class="meta-val">${safePrincipal}</span>
                        </div>
                        <div class="constructor-meta-item">
                            <span class="meta-label">Drivers:</span>
                            <div class="constructor-drivers-list">
                                ${driversList}
                            </div>
                        </div>
                    </div>
                    <div class="constructor-card-actions" style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button type="button" class="btn-inspect-constructor" onclick="loadOtherTeam('${safeName}')">
                            Inspect Telemetry &rarr;
                        </button>
                        <button type="button" class="btn-select-constructor" onclick="selectActiveTeam('${safeName}')" style="background: rgba(225,6,0,0.18); border: 1px solid rgba(225,6,0,0.5); color: #fff; padding: 8px 14px; border-radius: 4px; font-family: 'Orbitron', monospace; font-size: 10px; cursor: pointer; transition: all 0.2s;">
                            Select As My Team ★
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    }

    if (track) {
        track.innerHTML = names.map(name => {
            const team = data[name] || {};
            const safeName = escapeHtml(name);
            return `
                <button type="button" class="other-team-logo-item${name === state.selectedOtherTeam ? " selected" : ""}" onclick="loadOtherTeam('${safeName}')" aria-label="View ${safeName}">
                    <img src="${team.logo || ""}" alt="${safeName}" loading="lazy">
                </button>`;
        }).join("");
    }
}

export function loadOtherTeam(name) {
    state.selectedOtherTeam = name;
    renderTeamsGrid();
    renderTeamHero(name, false);

    const viewMyTeam = document.getElementById("viewMyTeam");
    const otherTeams = document.getElementById("viewOtherTeams");
    if (otherTeams) otherTeams.style.display = "none";
    if (viewMyTeam) viewMyTeam.style.display = "block";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

export async function selectActiveTeam(teamName) {
    if (!teamName) return;
    setMyTeam(teamName);

    try {
        await fetch(`${API_BASE_URL}/api/auth/select-team`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ team: teamName })
        });
    } catch (e) {
        console.warn("Could not save team to server:", e);
    }

    switchToMyTeam();
}

export function openTeamSelectModal() {
    const modal = document.getElementById("teamSelectModal");
    const container = document.getElementById("teamSelectOptions");
    if (!modal || !container) return;

    const currentTeam = getMyTeam();
    const data = teamsData || (typeof window !== "undefined" ? window.teamsData : {}) || {};
    const teams = Object.keys(data);

    container.innerHTML = teams.map(teamName => {
        const team = data[teamName] || {};
        const isSelected = teamName === currentTeam;
        return `
            <div class="career-driver-option ${isSelected ? "selected" : ""}" style="cursor:pointer; display:flex; align-items:center; gap:14px; padding:12px 14px;" onclick="chooseTeamAndClose('${escapeHtml(teamName)}')">
                <img src="${team.logo || ""}" style="width:38px; height:38px; object-fit:contain; border-radius:4px; filter:drop-shadow(0 0 4px rgba(255,255,255,0.2));" alt="${escapeHtml(teamName)}">
                <div>
                    <strong style="font-size:15px; display:block; color:#fff;">${escapeHtml(teamName)} ${isSelected ? "★ (Active)" : ""}</strong>
                    <small style="color:rgba(255,255,255,0.6);">${escapeHtml(team.engine || "")} PU &bull; Principal: ${escapeHtml(team.principal || "")}</small>
                </div>
            </div>
        `;
    }).join("");

    modal.style.display = "flex";
}

export function closeTeamSelectModal() {
    const modal = document.getElementById("teamSelectModal");
    if (modal) modal.style.display = "none";
}

export function chooseTeamAndClose(teamName) {
    closeTeamSelectModal();
    selectActiveTeam(teamName);
}

if (typeof window !== "undefined") {
    window.openTeamSelectModal = openTeamSelectModal;
    window.closeTeamSelectModal = closeTeamSelectModal;
    window.chooseTeamAndClose = chooseTeamAndClose;
}
