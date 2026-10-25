/* =========================================================
   CAREER MODE & CHAMPIONSHIP CONTROLLER
========================================================= */

import { API_BASE_URL, getMyTeam, setMyTeam } from "./config.js";
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { teamsData } from "./teamsData.js";
import { pitwall } from "./pitwall.js";

export let cachedCareerDashboard = null;
let currentRaceInfoTeam = null;

export async function loadCareerDashboard() {
    const panel = document.getElementById("careerPanel");
    if (!panel) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/career/dashboard`, { credentials: "include" });
        if (!response.ok) return;

        const data = await response.json();
        cachedCareerDashboard = data;
        if (!data.started) {
            setCareerReadyState();
            return;
        }

        const career = data.career || {};
        const driverStanding = data.driver_standing || {};

        if (data.my_team) {
            setMyTeam(data.my_team);
        }

        state.selectedCareerDriver = career.driver_id ? {
            id: career.driver_id,
            name: career.driver_name || "Selected Driver",
            team: career.team || getMyTeam()
        } : state.selectedCareerDriver;

        const position = document.getElementById("careerDriverPosition");
        const points = document.getElementById("careerPoints");
        const wins = document.getElementById("careerWins");
        const podiums = document.getElementById("careerPodiums");
        const status = document.getElementById("careerStatusText");
        const button = document.getElementById("startCareerButton");
        const activeControls = document.getElementById("careerActiveControls");
        const driverName = document.getElementById("careerDriverName");

        if (position) position.textContent = driverStanding.position ?? "--";
        if (points) points.textContent = Number(driverStanding.points || 0).toFixed(0);
        if (wins) wins.textContent = driverStanding.wins ?? 0;
        if (podiums) podiums.textContent = driverStanding.podiums ?? 0;
        if (driverName) driverName.textContent = career.driver_name || "--";
        if (button) { button.textContent = "CAREER ACTIVE"; button.disabled = false; }
        if (activeControls) activeControls.style.display = "flex";

        if (status) {
            const teamNameStr = career.team ? ` · ${career.team}` : "";
            status.textContent = career.season_completed
                ? `Career active${teamNameStr} · ${career.season || 2026} Season · Season complete`
                : `Career active${teamNameStr} · ${career.season || 2026} Season · Round ${career.current_round || 1}`;
        }

        const rewardEl = document.getElementById("careerRewardText");
        const lastReward = career.last_development_reward;
        if (rewardEl) {
            if (lastReward && Number(lastReward.points_earned || 0) > 0) {
                rewardEl.style.display = "block";
                rewardEl.innerHTML = `DEVELOPMENT REWARD <strong>+${Number(lastReward.points_earned || 0)} DP</strong>`;
            } else {
                rewardEl.style.display = "none";
                rewardEl.textContent = "";
            }
        }

        const pitWallButton = document.getElementById("launchPitWallButton");
        if (pitWallButton) {
            pitWallButton.disabled = career.season_completed === true;
            pitWallButton.innerHTML = career.season_completed ? "SEASON COMPLETE" : "<span>⚡</span> ENTER PIT WALL COMMAND";
        }

        const raceButton = document.getElementById("runCareerRaceButton");
        if (raceButton) {
            raceButton.disabled = career.season_completed === true;
            raceButton.textContent = career.season_completed ? "SEASON COMPLETE" : "QUICK SIMULATE";
        }

        await loadCareerTeams();
        await loadRacePace();
        await loadCareerUpgrades();
        renderCareerRaceView(data);
    } catch (error) {
        console.error("Career dashboard error:", error);
    }
}

export function setCareerReadyState() {
    const status = document.getElementById("careerStatusText");
    const button = document.getElementById("startCareerButton");
    const activeControls = document.getElementById("careerActiveControls");
    const currentTeam = getMyTeam();
    if (status) status.textContent = `Constructor: ${currentTeam} · Select Start Career to choose your team & driver.`;

    const rewardEl = document.getElementById("careerRewardText");
    if (rewardEl) {
        rewardEl.style.display = "none";
        rewardEl.textContent = "";
    }
    if (button) { button.disabled = false; button.textContent = "START CAREER"; }
    if (activeControls) activeControls.style.display = "none";
    state.selectedCareerDriver = null;
}

export async function loadCareerTeams() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/career/teams`, { credentials: "include" });
        if (!response.ok) return;

        const data = await response.json();
        const container = document.getElementById("careerTeamComparison");
        if (!container || !Array.isArray(data.teams)) return;

        container.innerHTML = data.teams.map(team => {
            const points = Number(team.points || 0);
            const wins = Number(team.wins || 0);
            const podiums = Number(team.podiums || 0);
            const delta = Number(team.points_delta || 0);

            let gapText = "YOUR TEAM";
            let gapClass = "career-gap-level";

            if (!team.is_my_team) {
                if (delta > 0) {
                    gapText = `+${delta.toFixed(0)} pts ahead`;
                    gapClass = "career-gap-ahead";
                } else if (delta < 0) {
                    gapText = `${Math.abs(delta).toFixed(0)} pts behind`;
                    gapClass = "career-gap-behind";
                } else {
                    gapText = "Level on points";
                }
            }

            return `
                <div class="career-team-card ${team.is_my_team ? "mine" : ""}" onclick="openRaceInfoModal('${escapeHtml(team.team || "")}')" style="cursor:pointer;" title="Click to view detailed telemetry for both drivers across all races">
                    <div class="career-team-name">${escapeHtml(team.team || "Unknown Team")}</div>
                    <div class="career-team-points">${points.toFixed(0)} pts</div>
                    <div class="career-team-meta">
                        <span>${wins} wins</span>
                        <span>${podiums} podiums</span>
                    </div>
                    <div class="career-team-gap ${gapClass}">${gapText}</div>
                    <div class="career-team-click-hint"><span>🔍</span> View Race Breakdown</div>
                </div>
            `;
        }).join("");
    } catch (error) {
        console.error("Career team comparison error:", error);
    }
}

export async function loadRacePace() {
    try {
        const [paceResponse, dashboardResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/career/race-pace`, { credentials: "include" }),
            fetch(`${API_BASE_URL}/api/career/dashboard`, { credentials: "include" })
        ]);

        if (!paceResponse.ok) return;

        const data = await paceResponse.json();
        let dashboardData = null;
        if (dashboardResponse.ok) {
            dashboardData = await dashboardResponse.json();
        }

        const completed = document.getElementById("completedRacePace");
        const upcoming = document.getElementById("upcomingRacePace");
        const targetTeam = (dashboardData && dashboardData.my_team) || data.team || getMyTeam();

        const fullRaces =
            dashboardData &&
            dashboardData.career &&
            dashboardData.career.season_result &&
            Array.isArray(dashboardData.career.season_result.races)
                ? dashboardData.career.season_result.races
                : [];

        function getTeamRacePoints(race, teamName) {
            const classification = Array.isArray(race.classification) ? race.classification : [];
            let total = 0;
            const pointTable = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 };
            const fastestDriver = race.fastest_lap && race.fastest_lap.driver ? race.fastest_lap.driver : null;

            classification.forEach(result => {
                if (result.team !== teamName) return;
                const position = Number(result.position);
                let points = pointTable[position] || 0;
                if (fastestDriver && result.driver === fastestDriver && position <= 10) {
                    points += 1;
                }
                total += points;
            });
            return total;
        }

        if (completed) {
            if (Array.isArray(data.completed) && data.completed.length) {
                completed.innerHTML = data.completed.map(race => {
                    const position = race.position ? `P${race.position}` : "--";
                    const fullRace = fullRaces.find(item => Number(item.round) === Number(race.round));
                    const actualPoints = fullRace ? getTeamRacePoints(fullRace, targetTeam) : Number(race.points || 0);

                    return `
                        <div class="pace-row">
                            <span class="pace-circuit">R${race.round} · ${escapeHtml(race.circuit || "Race")}</span>
                            <span class="pace-result pace-neutral">${position} · ${actualPoints.toFixed(1)} pts</span>
                        </div>
                    `;
                }).join("");
            } else {
                completed.innerHTML = `<div class="career-empty">No completed races yet.</div>`;
            }
        }

        if (upcoming) {
            if (Array.isArray(data.upcoming) && data.upcoming.length) {
                upcoming.innerHTML = data.upcoming.map(race => {
                    const expected = race.expected && race.expected.label ? race.expected.label : "Very close";
                    const className = expected === "Faster" ? "pace-faster" : expected === "Slower" ? "pace-slower" : "pace-close";

                    return `
                        <div class="pace-row">
                            <span class="pace-circuit">R${race.round} · ${escapeHtml(race.circuit || "Race")}</span>
                            <span class="pace-result ${className}">${escapeHtml(expected)}</span>
                        </div>
                    `;
                }).join("");
            } else {
                upcoming.innerHTML = `<div class="career-empty">No upcoming races available.</div>`;
            }
        }
    } catch (error) {
        console.error("Race pace error:", error);
    }
}

export async function startCareer(targetTeam = null) {
    const modal = document.getElementById("driverCareerModal");
    const options = document.getElementById("careerDriverOptions");
    const confirm = document.getElementById("confirmDriverCareerButton");
    if (!modal || !options || !confirm) return;

    const currentTeam = targetTeam || state.selectedCareerTeam || getMyTeam();
    state.selectedCareerTeam = currentTeam;

    options.innerHTML = `<div class="career-empty">Loading drivers for ${escapeHtml(currentTeam)}...</div>`;
    confirm.disabled = true;
    modal.style.display = "flex";

    // Inject constructor picker header inside modal if not present
    let teamPickerWrap = document.getElementById("modalTeamPickerWrap");
    if (!teamPickerWrap) {
        teamPickerWrap = document.createElement("div");
        teamPickerWrap.id = "modalTeamPickerWrap";
        teamPickerWrap.style.marginBottom = "14px";
        teamPickerWrap.style.marginTop = "8px";
        options.parentNode.insertBefore(teamPickerWrap, options);
    }

    const allTeams = Object.keys(teamsData || {});
    teamPickerWrap.innerHTML = `
        <label style="display:block; font-family:'Orbitron', monospace; font-size:9px; letter-spacing:1.5px; color:rgba(255,255,255,0.7); margin-bottom:6px;">
            SELECTED CONSTRUCTOR
        </label>
        <select id="modalTeamSelect" style="width:100%; padding:10px 12px; border-radius:4px; border:1px solid rgba(255,255,255,0.2); background:#020617; color:#fff; font:600 14px 'Rajdhani', sans-serif;" onchange="changeCareerModalTeam(this.value)">
            ${allTeams.map(t => `<option value="${escapeHtml(t)}" ${t === currentTeam ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
        </select>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/api/career/drivers?team=${encodeURIComponent(currentTeam)}`, { credentials: "include" });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to load drivers.");

        const drivers = Array.isArray(data.drivers) ? data.drivers : [];
        options.innerHTML = drivers.map(driver => `
            <div class="career-driver-option" data-driver-id="${escapeHtml(driver.id)}" onclick='selectCareerDriver(${JSON.stringify(driver.id)}, ${JSON.stringify(driver.name)}, ${JSON.stringify(currentTeam)})'>
                <strong>${escapeHtml(driver.name)}</strong>
                <small>Race Pace ${Number(driver.performance?.race_pace || 0).toFixed(0)} · Tyre ${Number(driver.performance?.tyre_management || 0).toFixed(0)} · Overtaking ${Number(driver.performance?.overtaking || 0).toFixed(0)}</small>
            </div>
        `).join("") || `<div class="career-empty">No drivers found for ${escapeHtml(currentTeam)}.</div>`;
    } catch (error) {
        options.innerHTML = `<div class="career-empty">${escapeHtml(error.message || "Unable to load drivers.")}</div>`;
    }
}

export function changeCareerModalTeam(teamName) {
    state.selectedCareerTeam = teamName;
    startCareer(teamName);
}

export function selectCareerDriver(driverId, driverName, teamName) {
    const activeTeam = teamName || state.selectedCareerTeam || getMyTeam();
    state.selectedCareerDriver = { id: driverId, name: driverName, team: activeTeam };
    document.querySelectorAll(".career-driver-option").forEach(el => {
        el.classList.toggle("selected", String(el.dataset.driverId) === String(driverId));
    });
    const confirm = document.getElementById("confirmDriverCareerButton");
    if (confirm) confirm.disabled = false;
}

export function closeDriverCareerModal() {
    const modal = document.getElementById("driverCareerModal");
    if (modal) modal.style.display = "none";
}

export async function confirmDriverCareer() {
    if (!state.selectedCareerDriver) return;
    const button = document.getElementById("confirmDriverCareerButton");
    if (button) { button.disabled = true; button.textContent = "STARTING..."; }

    const chosenTeam = state.selectedCareerDriver.team || state.selectedCareerTeam || getMyTeam();

    try {
        const response = await fetch(`${API_BASE_URL}/api/career/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                team: chosenTeam,
                season: 2026,
                driver_id: state.selectedCareerDriver.id,
                driver_name: state.selectedCareerDriver.name
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to start career.");

        setMyTeam(chosenTeam);
        closeDriverCareerModal();
        await loadCareerDashboard();
        document.getElementById("careerPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        alert(error.message || "Unable to start career.");
        if (button) { button.disabled = false; button.textContent = "START CAREER"; }
    }
}

export async function runCareerRace() {
    const button = document.getElementById("runCareerRaceButton");
    if (!button) return;
    button.disabled = true;
    button.textContent = "SIMULATING CURRENT RACE...";

    try {
        const response = await fetch(`${API_BASE_URL}/api/career/race`, { method: "POST", credentials: "include" });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || data.error || `Race simulation failed (HTTP ${response.status}).`);

        state.careerRaceTab = "current";
        await loadCareerDashboard();
        button.textContent = data.season_completed ? "SEASON COMPLETE" : "CURRENT RACE COMPLETED";
        if (!data.season_completed) {
            setTimeout(() => {
                button.disabled = false;
                button.textContent = "SIMULATE CURRENT RACE";
            }, 1000);
        }
    } catch (error) {
        console.error("Career race error:", error);
        button.disabled = false;
        button.textContent = "SIMULATE CURRENT RACE";
        alert(error.message || "Race simulation failed.");
    }
}

export function switchCareerRaceTab(tab) {
    state.careerRaceTab = tab;
    document.querySelectorAll(".career-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    const currentBox = document.getElementById("careerCurrentRaceBox");
    const nextBox = document.getElementById("careerNextRaceBox");
    if (currentBox) currentBox.style.display = tab === "current" ? "block" : "none";
    if (nextBox) nextBox.style.display = tab === "next" ? "block" : "none";
}

export async function loadCareerUpgrades() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/career/upgrades`, { credentials: "include" });
        if (!response.ok) return;

        const data = await response.json();
        const container = document.getElementById("careerUpgradesList");
        const pointsBadge = document.getElementById("careerDevPointsBadge");
        if (pointsBadge) pointsBadge.textContent = `${Number(data.development_points || 0)} DP`;

        if (!container || !Array.isArray(data.upgrades)) return;

        container.innerHTML = data.upgrades.map(item => `
            <div class="upgrade-card">
                <div class="upgrade-header">
                    <div>
                        <div class="upgrade-name">${escapeHtml(item.label)}</div>
                        <div class="upgrade-desc">${escapeHtml(item.description)}</div>
                    </div>
                    <div class="upgrade-level">LVL ${item.level} / ${item.max_level}</div>
                </div>
                <div class="upgrade-bar-wrap">
                    <div class="upgrade-bar" style="width: ${Math.min(100, Math.max(0, item.value))}%"></div>
                </div>
                <div class="upgrade-footer">
                    <span class="upgrade-val">${Number(item.value).toFixed(1)} / 100</span>
                    <button class="upgrade-buy-btn" ${item.can_buy ? "" : "disabled"} onclick="buyCareerUpgrade('${escapeHtml(item.key)}')">
                        UPGRADE (${item.cost} DP)
                    </button>
                </div>
            </div>
        `).join("");
    } catch (error) {
        console.error("Career upgrades error:", error);
    }
}

export async function buyCareerUpgrade(component) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/career/upgrade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ component })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Failed to upgrade.");
        await loadCareerDashboard();
    } catch (error) {
        alert(error.message || "Unable to buy upgrade.");
    }
}

function renderCareerRaceView(data) {
    const container = document.getElementById("careerRaceView") || document.getElementById("careerRaceViewContainer");
    if (!container || !data || !data.career) return;

    const currentRace = data.current_race || {};
    const nextRace = data.next_race || {};
    const driver = data.driver_standing || {};
    const team = data.my_standing || {};
    const comparison = Array.isArray(data.driver_comparison) ? data.driver_comparison : [];
    const lastReward = data.career.last_development_reward;
    const currentTeam = data.my_team || getMyTeam();

    let rewardHtml = "";
    if (lastReward && Number(lastReward.points_earned || 0) > 0) {
        const b = lastReward.breakdown || {};
        rewardHtml = `
            <div class="career-reward-banner">
                <div>
                    <strong>RACE REWARD: +${lastReward.points_earned} DEVELOPMENT POINTS</strong>
                    <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:3px;">
                        Completion +${b.race_completed || 0}
                        ${b.points_finish ? `· Points Finish +${b.points_finish}` : ""}
                        ${b.podium ? `· Podium +${b.podium}` : ""}
                        ${b.win ? `· Win +${b.win}` : ""}
                    </div>
                </div>
                <div style="font-family:'Orbitron', monospace; font-size:16px; color:var(--gold);">
                    BALANCE: ${lastReward.new_balance} DP
                </div>
            </div>
        `;
    }

    const activeUpcomingQual = (currentRace.status !== "completed" ? currentRace.qualifying : nextRace.qualifying) || data.upcoming_qualifying;
    const activePlayerPos = activeUpcomingQual && activeUpcomingQual.player_result ? activeUpcomingQual.player_result.position : null;
    const activeWeather = (currentRace.status !== "completed" ? currentRace.weather_report : nextRace.weather_report) || data.upcoming_weather;
    const weatherLabel = activeWeather ? `${activeWeather.condition === 'Dry' ? '☀️' : (activeWeather.condition === 'Damp' ? '🌦️' : '🌧️')} ${activeWeather.condition} (${activeWeather.track_temp_c}°C Track)` : null;

    container.innerHTML = `
        <div class="career-races-grid">
            <div id="careerCurrentRaceBox" class="career-race-card current" ${currentRace.status === "completed" ? `onclick="openRaceInfoModal('${escapeHtml(currentTeam)}')"` : ""} style="${currentRace.status === "completed" ? "cursor:pointer;" : ""}" title="${currentRace.status === "completed" ? "Click to view full race results & telemetry archive" : ""}">
                <div class="race-label">${currentRace.status === "completed" ? "LAST COMPLETED RACE (CLICK FOR TELEMETRY)" : "CURRENT ROUND · UPCOMING GP"}</div>
                <h3>R${currentRace.round || 1} · ${escapeHtml(currentRace.circuit || "Grand Prix")}</h3>
                <div class="race-big">${currentRace.status === "completed" ? (currentRace.driver_position ? `P${currentRace.driver_position}` : "DNF") : (activePlayerPos ? `GRID P${activePlayerPos}` : "UPCOMING")}</div>
                <div class="career-race-meta">
                    <span>${escapeHtml(currentRace.country || "Championship")}</span>
                    <span>${weatherLabel ? escapeHtml(weatherLabel) : escapeHtml(currentRace.weather || "Dry")}</span>
                    ${currentRace.driver_points !== undefined ? `<span>Driver: ${Number(currentRace.driver_points).toFixed(0)} pts</span>` : ""}
                    ${currentRace.team_points !== undefined ? `<span>Team: ${Number(currentRace.team_points).toFixed(0)} pts</span>` : ""}
                    ${!currentRace.completed && activePlayerPos && activeUpcomingQual && activeUpcomingQual.player_result ? `<span style="color:var(--gold);">Qual: ${escapeHtml(activeUpcomingQual.player_result.gap_to_pole || "")}</span>` : ""}
                </div>
                ${currentRace.status === "completed" ? `<div style="margin-top:10px; font-family:'Orbitron', monospace; font-size:10px; color:var(--cyan); display:flex; align-items:center; gap:6px;"><span>📊</span> VIEW RACE TELEMETRY &amp; RESULTS &rarr;</div>` : ""}
            </div>
            <div id="careerNextRaceBox" class="career-race-card next">
                <div class="race-label">NEXT UP ON CALENDAR</div>
                <h3>${nextRace.round ? `R${nextRace.round} · ${escapeHtml(nextRace.circuit || "Grand Prix")}` : "SEASON COMPLETED"}</h3>
                <div class="race-big">${nextRace.round ? (activePlayerPos ? `GRID P${activePlayerPos}` : `ROUND ${nextRace.round}`) : "TROPHY READY"}</div>
                <div class="career-race-meta">
                    <span>${escapeHtml(nextRace.country || "")}</span>
                    <span>${weatherLabel ? escapeHtml(weatherLabel) : escapeHtml(nextRace.weather || "Scheduled")}</span>
                    ${activePlayerPos && activeUpcomingQual && activeUpcomingQual.player_result ? `<span style="color:var(--gold);">Qual: ${escapeHtml(activeUpcomingQual.player_result.formatted_time || "")}</span>` : ""}
                </div>
            </div>
        </div>
        <div class="career-races-grid" style="margin-top:14px;">
            <div class="career-race-card">
                <div class="race-label">DRIVER STANDINGS</div>
                <h3>${escapeHtml(data.career.driver_name || "Driver")}</h3>
                <div class="race-big">${Number(driver.points || 0).toFixed(0)}</div>
                <div class="career-race-meta"><span>P${driver.position || "--"}</span><span>${driver.wins || 0} wins</span><span>${driver.podiums || 0} podiums</span></div>
            </div>
            <div class="career-race-card">
                <div class="race-label">TEAM POINTS</div>
                <h3>${escapeHtml(currentTeam)}</h3>
                <div class="race-big">${Number(team.points || 0).toFixed(0)}</div>
                <div class="career-race-meta"><span>P${team.position || "--"}</span><span>${team.wins || 0} wins</span><span>${team.podiums || 0} podiums</span></div>
            </div>
        </div>
        <div class="career-section" style="margin-top:14px;">
            <div class="career-section-title">Driver Points Comparison</div>
            <div class="career-comparison-grid">
                ${comparison.slice(0, 6).map(row => `
                    <div class="career-team-card ${String(row.driver_id) === String(data.career.driver_id) ? "mine" : ""}">
                        <div class="career-team-name">${escapeHtml(row.driver || "Driver")}</div>
                        <div class="career-team-points">${Number(row.points || 0).toFixed(0)} pts</div>
                        <div class="career-team-meta"><span>P${row.position || "--"}</span><span>${row.team ? escapeHtml(row.team) : ""}</span></div>
                    </div>
                `).join("")}
            </div>
        </div>
        ${rewardHtml}
    `;
}

// Launch Pit Wall Command
export async function launchPitWall() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/career/dashboard`, { credentials: "include" });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.started) {
            alert("Please start your career first.");
            return;
        }
        if (data.career && data.career.season_completed) {
            alert("The 2026 World Championship season is already complete!");
            return;
        }
        await pitwall.launch(data);
    } catch (error) {
        console.error("Error launching Pit Wall:", error);
        alert("Unable to launch Pit Wall Command: " + (error.message || error));
    }
}

// =========================================================
// RACE INFO & TELEMETRY ARCHIVE MODAL CONTROLLER
// =========================================================
export async function openRaceInfoModal(teamName = null) {
    const modal = document.getElementById("raceInfoModal");
    if (!modal) return;

    // Default to active career team or fallback
    if (!teamName) {
        teamName = (cachedCareerDashboard && cachedCareerDashboard.my_team) || getMyTeam() || "Oracle Red Bull Racing";
    }
    currentRaceInfoTeam = teamName;

    modal.style.display = "flex";

    // Populate team selection dropdown
    const select = document.getElementById("raceInfoTeamSelect");
    if (select) {
        const teamNames = Object.keys(teamsData);
        select.innerHTML = teamNames.map(t => `<option value="${escapeHtml(t)}" ${t.toLowerCase() === teamName.toLowerCase() ? 'selected' : ''}>${escapeHtml(t)}</option>`).join("");
    }

    // Refresh dashboard data if not cached
    if (!cachedCareerDashboard || !cachedCareerDashboard.career) {
        try {
            const resp = await fetch(`${API_BASE_URL}/api/career/dashboard`, { credentials: "include" });
            if (resp.ok) {
                cachedCareerDashboard = await resp.json();
            }
        } catch (e) {
            console.error("Error refreshing dashboard for race info modal:", e);
        }
    }

    renderRaceInfoModalContent(currentRaceInfoTeam);
}

export function closeRaceInfoModal() {
    const modal = document.getElementById("raceInfoModal");
    if (modal) modal.style.display = "none";
}

export function switchRaceInfoTeam(teamName) {
    currentRaceInfoTeam = teamName;
    renderRaceInfoModalContent(teamName);
}

function renderRaceInfoModalContent(selectedTeam) {
    const body = document.getElementById("raceInfoModalBody");
    const titleEl = document.getElementById("raceInfoModalTitle");
    const subtitleEl = document.getElementById("raceInfoModalSubtitle");
    if (!body) return;

    if (titleEl) {
        titleEl.textContent = `${selectedTeam.toUpperCase()} · RACE RESULTS & TELEMETRY`;
    }
    if (subtitleEl) {
        subtitleEl.textContent = `Comprehensive breakdown for both drivers: Grid start vs Finish positions, points scored, overtakes, contact telemetry, and steward penalties.`;
    }

    const teamMeta = teamsData[selectedTeam] || {};
    const defaultDrivers = teamMeta.drivers || [
        { name: "Driver 1", img: "" },
        { name: "Driver 2", img: "" }
    ];

    const data = cachedCareerDashboard || {};
    const career = data.career || {};
    const seasonResult = career.season_result || {};
    const races = Array.isArray(seasonResult.races) ? seasonResult.races : [];
    const constructorStandings = Array.isArray(data.standings) ? data.standings : (Array.isArray(seasonResult.constructor_standings) ? seasonResult.constructor_standings : []);
    const teamStanding = constructorStandings.find(s => String(s.team || "").toLowerCase() === selectedTeam.toLowerCase()) || {};

    const teamPoints = Number(teamStanding.points || 0);
    const teamPos = teamStanding.position ? `P${teamStanding.position}` : "--";
    const teamWins = teamStanding.wins ?? 0;
    const teamPodiums = teamStanding.podiums ?? 0;

    // Detect actual driver names from race records or teamsData
    let d1Name = defaultDrivers[0]?.name || "Driver 1";
    let d2Name = defaultDrivers[1]?.name || "Driver 2";

    if (races.length > 0 && Array.isArray(races[0].classification)) {
        const teamDrivers = races[0].classification.filter(c => String(c.team || "").toLowerCase() === selectedTeam.toLowerCase()).map(c => c.driver);
        if (teamDrivers.length >= 2) {
            d1Name = teamDrivers[0];
            d2Name = teamDrivers[1];
        } else if (teamDrivers.length === 1) {
            d1Name = teamDrivers[0];
        }
    }

    const d1Img = defaultDrivers.find(d => d.name === d1Name)?.img || defaultDrivers[0]?.img || "";
    const d2Img = defaultDrivers.find(d => d.name === d2Name)?.img || defaultDrivers[1]?.img || "";

    const pointTable = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 };

    // Process all completed races for D1 and D2
    const roundsList = [];
    const d1Series = [];
    const d2Series = [];
    const raceBreakdownRows = [];

    let d1TotalPoints = 0;
    let d1TotalOvertakes = 0;
    let d1TotalLost = 0;
    let d1BestFinish = 999;
    let d1ContactsCount = 0;
    let d1PenaltiesCount = 0;

    let d2TotalPoints = 0;
    let d2TotalOvertakes = 0;
    let d2TotalLost = 0;
    let d2BestFinish = 999;
    let d2ContactsCount = 0;
    let d2PenaltiesCount = 0;

    races.forEach(r => {
        const roundNum = r.round || 1;
        roundsList.push(`R${roundNum}`);

        const classification = Array.isArray(r.classification) ? r.classification : [];
        const events = Array.isArray(r.events) ? r.events : [];
        const fastestDriver = r.fastest_lap?.driver;

        // Driver 1 extraction
        const d1Entry = classification.find(c => c.driver === d1Name) || classification.find(c => String(c.team || "").toLowerCase() === selectedTeam.toLowerCase());
        const d1Pos = d1Entry ? Number(d1Entry.position) : 999;
        const d1Grid = d1Entry?.grid_position !== undefined ? Number(d1Entry.grid_position) : (r.starting_grid?.find(g => g.driver === d1Name)?.position || "--");
        let d1Pts = d1Entry ? (pointTable[d1Pos] || 0) : 0;
        const d1IsFastest = d1Entry && fastestDriver === d1Name && d1Pos <= 10;
        if (d1IsFastest) d1Pts += 1;

        if (d1Pos < d1BestFinish) d1BestFinish = d1Pos;
        d1TotalPoints += d1Pts;

        const d1Overtakes = d1Entry?.overtakes_made !== undefined ? Number(d1Entry.overtakes_made) : events.filter(e => e.type === "overtake" && e.driver === d1Name).length;
        const d1Lost = d1Entry?.positions_lost !== undefined ? Number(d1Entry.positions_lost) : events.filter(e => e.type === "overtake" && e.overtaken_driver === d1Name).length;
        d1TotalOvertakes += d1Overtakes;
        d1TotalLost += d1Lost;

        const d1Contacts = Array.isArray(d1Entry?.contacts) && d1Entry.contacts.length ? d1Entry.contacts : events.filter(e => e.type === "contact" && (e.driver === d1Name || e.other_driver === d1Name)).map(e => e.details || `Contact on Lap ${e.lap}`);
        d1ContactsCount += d1Contacts.length;

        const d1Penalties = Array.isArray(d1Entry?.penalties) && d1Entry.penalties.length ? d1Entry.penalties : events.filter(e => e.type === "penalty" && e.driver === d1Name).map(e => `${e.penalty_type || '5s Penalty'}: ${e.reason || 'Track Limits/Collision'}`);
        d1PenaltiesCount += d1Penalties.length;

        d1Series.push({ round: roundNum, points: d1Pts, finish: d1Pos === 999 ? 'DNF' : d1Pos, grid: d1Grid });

        // Driver 2 extraction
        const d2Entry = classification.find(c => c.driver === d2Name) || classification.find(c => String(c.team || "").toLowerCase() === selectedTeam.toLowerCase() && c !== d1Entry);
        const d2Pos = d2Entry ? Number(d2Entry.position) : 999;
        const d2Grid = d2Entry?.grid_position !== undefined ? Number(d2Entry.grid_position) : (r.starting_grid?.find(g => g.driver === d2Name)?.position || "--");
        let d2Pts = d2Entry ? (pointTable[d2Pos] || 0) : 0;
        const d2IsFastest = d2Entry && fastestDriver === d2Name && d2Pos <= 10;
        if (d2IsFastest) d2Pts += 1;

        if (d2Pos < d2BestFinish) d2BestFinish = d2Pos;
        d2TotalPoints += d2Pts;

        const d2Overtakes = d2Entry?.overtakes_made !== undefined ? Number(d2Entry.overtakes_made) : events.filter(e => e.type === "overtake" && e.driver === d2Name).length;
        const d2Lost = d2Entry?.positions_lost !== undefined ? Number(d2Entry.positions_lost) : events.filter(e => e.type === "overtake" && e.overtaken_driver === d2Name).length;
        d2TotalOvertakes += d2Overtakes;
        d2TotalLost += d2Lost;

        const d2Contacts = Array.isArray(d2Entry?.contacts) && d2Entry.contacts.length ? d2Entry.contacts : events.filter(e => e.type === "contact" && (e.driver === d2Name || e.other_driver === d2Name)).map(e => e.details || `Contact on Lap ${e.lap}`);
        d2ContactsCount += d2Contacts.length;

        const d2Penalties = Array.isArray(d2Entry?.penalties) && d2Entry.penalties.length ? d2Entry.penalties : events.filter(e => e.type === "penalty" && e.driver === d2Name).map(e => `${e.penalty_type || '5s Penalty'}: ${e.reason || 'Track Limits/Collision'}`);
        d2PenaltiesCount += d2Penalties.length;

        d2Series.push({ round: roundNum, points: d2Pts, finish: d2Pos === 999 ? 'DNF' : d2Pos, grid: d2Grid });

        // Delta calculations
        const d1DeltaVal = (d1Grid !== '--' && d1Pos !== 999) ? (Number(d1Grid) - d1Pos) : 0;
        const d2DeltaVal = (d2Grid !== '--' && d2Pos !== 999) ? (Number(d2Grid) - d2Pos) : 0;

        const d1DeltaClass = d1DeltaVal > 0 ? "pos-delta-gained" : (d1DeltaVal < 0 ? "pos-delta-lost" : "pos-delta-level");
        const d2DeltaClass = d2DeltaVal > 0 ? "pos-delta-gained" : (d2DeltaVal < 0 ? "pos-delta-lost" : "pos-delta-level");

        const d1DeltaStr = d1DeltaVal > 0 ? `▲ +${d1DeltaVal} GAINED` : (d1DeltaVal < 0 ? `▼ ${d1DeltaVal} LOST` : `= LEVEL`);
        const d2DeltaStr = d2DeltaVal > 0 ? `▲ +${d2DeltaVal} GAINED` : (d2DeltaVal < 0 ? `▼ ${d2DeltaVal} LOST` : `= LEVEL`);

        const roundTotalPoints = d1Pts + d2Pts;

        raceBreakdownRows.push(`
            <div class="race-card-item">
                <div class="race-item-topbar">
                    <div>
                        <span class="race-item-circuit">ROUND ${roundNum} · ${escapeHtml(r.circuit || "Grand Prix")}</span>
                        <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">${escapeHtml(r.country || "")}</span>
                    </div>
                    <div class="race-item-badges">
                        <span class="race-weather-badge">${escapeHtml(r.weather || "Dry")}</span>
                        <span class="race-team-haul">+${roundTotalPoints} PTS HAUL</span>
                    </div>
                </div>

                <div class="race-drivers-comparison">
                    <!-- Driver 1 Row -->
                    <div class="driver-race-result-box d1-box">
                        <div class="driver-race-name-row">
                            <span class="driver-race-name">★ ${escapeHtml(d1Name)}</span>
                            <span class="driver-race-points-badge">+${d1Pts} pts ${d1IsFastest ? '⚡ <small style="font-size:9px; color:#d946ef;">FL</small>' : ''}</span>
                        </div>
                        <div class="driver-pos-delta-row">
                            <span>Grid: <strong>P${d1Grid}</strong> &rarr; Finish: <strong style="color:var(--gold);">P${d1Pos === 999 ? 'DNF' : d1Pos}</strong></span>
                            <span class="pos-delta-pill ${d1DeltaClass}">${d1DeltaStr}</span>
                        </div>
                        <div class="driver-telemetry-tags">
                            <span class="tag-telemetry">⚡ ${d1Overtakes} overtakes made</span>
                            <span class="tag-telemetry">🛡 ${d1Lost} positions lost</span>
                            ${d1Contacts.length > 0 ? d1Contacts.map(c => `<span class="tag-telemetry tag-contact">💥 ${escapeHtml(c)}</span>`).join("") : '<span class="tag-telemetry tag-clean">🛡 0 contacts</span>'}
                            ${d1Penalties.length > 0 ? d1Penalties.map(p => `<span class="tag-telemetry tag-penalty">⚠️ ${escapeHtml(p)}</span>`).join("") : '<span class="tag-telemetry tag-clean">⚖️ Clean (0 pen)</span>'}
                        </div>
                    </div>

                    <!-- Driver 2 Row -->
                    <div class="driver-race-result-box d2-box">
                        <div class="driver-race-name-row">
                            <span class="driver-race-name">◆ ${escapeHtml(d2Name)}</span>
                            <span class="driver-race-points-badge" style="color:var(--cyan);">+${d2Pts} pts ${d2IsFastest ? '⚡ <small style="font-size:9px; color:#d946ef;">FL</small>' : ''}</span>
                        </div>
                        <div class="driver-pos-delta-row">
                            <span>Grid: <strong>P${d2Grid}</strong> &rarr; Finish: <strong style="color:var(--cyan);">P${d2Pos === 999 ? 'DNF' : d2Pos}</strong></span>
                            <span class="pos-delta-pill ${d2DeltaClass}">${d2DeltaStr}</span>
                        </div>
                        <div class="driver-telemetry-tags">
                            <span class="tag-telemetry">⚡ ${d2Overtakes} overtakes made</span>
                            <span class="tag-telemetry">🛡 ${d2Lost} positions lost</span>
                            ${d2Contacts.length > 0 ? d2Contacts.map(c => `<span class="tag-telemetry tag-contact">💥 ${escapeHtml(c)}</span>`).join("") : '<span class="tag-telemetry tag-clean">🛡 0 contacts</span>'}
                            ${d2Penalties.length > 0 ? d2Penalties.map(p => `<span class="tag-telemetry tag-penalty">⚠️ ${escapeHtml(p)}</span>`).join("") : '<span class="tag-telemetry tag-clean">⚖️ Clean (0 pen)</span>'}
                        </div>
                    </div>
                </div>
            </div>
        `);
    });

    // Empty state if no races completed yet
    if (races.length === 0) {
        body.innerHTML = `
            <div style="text-align:center; padding:45px 20px; background:rgba(255,255,255,0.02); border:1px dashed var(--border); border-radius:12px;">
                <div style="font-size:36px; margin-bottom:12px;">🏎</div>
                <h3 style="font-family:'Orbitron', monospace; font-size:16px; color:#ffffff; margin-bottom:8px;">NO GRAND PRIX ROUNDS COMPLETED YET</h3>
                <p style="color:var(--text-muted); font-size:13px; max-width:540px; margin:0 auto 20px; line-height:1.5;">
                    Complete your first race using <strong>Pit Wall Command</strong> or <strong>Quick Simulate</strong> to unlock rich telemetry, start-to-finish position changes, overtakes, contact telemetry, and FIA steward decisions.
                </p>
                <button type="button" class="career-start-btn" onclick="closeRaceInfoModal(); if(window.launchPitWall) window.launchPitWall();">
                    <span>⚡</span> ENTER PIT WALL COMMAND &rarr;
                </button>
            </div>
        `;
        return;
    }

    const svgChartHtml = generatePointsPositionSVGChart(roundsList, d1Name, d2Name, d1Series, d2Series);

    body.innerHTML = `
        <!-- Constructor Overview Header Bar -->
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,215,0,0.05); border:1px solid rgba(255,215,0,0.25); border-radius:10px; padding:14px 20px; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
            <div>
                <span style="font-family:'Orbitron', monospace; font-size:8px; letter-spacing:2px; color:var(--text-muted); text-transform:uppercase;">CONSTRUCTOR CHAMPIONSHIP</span>
                <div style="font-family:'Orbitron', monospace; font-size:16px; font-weight:700; color:#ffffff; margin-top:2px;">
                    ${teamPos} &bull; ${teamPoints} PTS &bull; ${teamWins} WINS &bull; ${teamPodiums} PODIUMS
                </div>
            </div>
            <div style="font-family:'Orbitron', monospace; font-size:12px; color:var(--gold);">
                ${races.length} / 24 ROUNDS COMPLETED
            </div>
        </div>

        <!-- Dual Driver Season Summaries -->
        <div class="race-info-drivers-grid">
            <!-- Driver 1 -->
            <div class="driver-profile-card primary-driver">
                ${d1Img ? `<img src="${escapeHtml(d1Img)}" alt="${escapeHtml(d1Name)}" class="driver-avatar-thumb">` : '<div class="driver-avatar-thumb" style="display:flex; align-items:center; justify-content:center; font-size:24px;">🏎</div>'}
                <div class="driver-profile-info">
                    <div class="driver-profile-name">★ ${escapeHtml(d1Name)}</div>
                    <div class="driver-profile-team">${escapeHtml(selectedTeam)}</div>
                    <div class="driver-metrics-mini">
                        <div class="metric-mini-box">
                            <span>POINTS</span>
                            <strong style="color:var(--gold);">${d1TotalPoints}</strong>
                        </div>
                        <div class="metric-mini-box">
                            <span>BEST FINISH</span>
                            <strong>${d1BestFinish === 999 ? '--' : `P${d1BestFinish}`}</strong>
                        </div>
                        <div class="metric-mini-box">
                            <span>OVERTAKES</span>
                            <strong style="color:#38bdf8;">${d1TotalOvertakes}</strong>
                        </div>
                        <div class="metric-mini-box">
                            <span>PENALTIES</span>
                            <strong style="color:${d1PenaltiesCount > 0 ? '#fca5a5' : '#5ee7a1'};">${d1PenaltiesCount}</strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Driver 2 -->
            <div class="driver-profile-card secondary-driver">
                ${d2Img ? `<img src="${escapeHtml(d2Img)}" alt="${escapeHtml(d2Name)}" class="driver-avatar-thumb">` : '<div class="driver-avatar-thumb" style="display:flex; align-items:center; justify-content:center; font-size:24px;">🏎</div>'}
                <div class="driver-profile-info">
                    <div class="driver-profile-name">◆ ${escapeHtml(d2Name)}</div>
                    <div class="driver-profile-team">${escapeHtml(selectedTeam)}</div>
                    <div class="driver-metrics-mini">
                        <div class="metric-mini-box">
                            <span>POINTS</span>
                            <strong style="color:var(--cyan);">${d2TotalPoints}</strong>
                        </div>
                        <div class="metric-mini-box">
                            <span>BEST FINISH</span>
                            <strong>${d2BestFinish === 999 ? '--' : `P${d2BestFinish}`}</strong>
                        </div>
                        <div class="metric-mini-box">
                            <span>OVERTAKES</span>
                            <strong style="color:#38bdf8;">${d2TotalOvertakes}</strong>
                        </div>
                        <div class="metric-mini-box">
                            <span>PENALTIES</span>
                            <strong style="color:${d2PenaltiesCount > 0 ? '#fca5a5' : '#5ee7a1'};">${d2PenaltiesCount}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Graphical Display (SVG Points Progression) -->
        <div class="race-chart-card">
            <div class="race-chart-header">
                <div class="race-chart-title">
                    <span>📊</span> DRIVER POINTS PROGRESSION PER GRAND PRIX
                </div>
                <div class="race-chart-legend">
                    <div class="legend-item">
                        <div class="legend-color-dot" style="background:#ffd700; box-shadow:0 0 6px #ffd700;"></div>
                        <span>★ ${escapeHtml(d1Name)}</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color-dot" style="background:#38bdf8; box-shadow:0 0 6px #38bdf8;"></div>
                        <span>◆ ${escapeHtml(d2Name)}</span>
                    </div>
                </div>
            </div>
            <div class="chart-svg-wrap">
                ${svgChartHtml}
            </div>
        </div>

        <!-- Race by Race Detailed Telemetry Breakdown -->
        <div class="race-breakdown-section-title">
            <span>🏁</span> RACE-BY-RACE CLASSIFICATION &amp; INCIDENT ARCHIVE
        </div>
        <div class="race-breakdown-list">
            ${raceBreakdownRows.join("")}
        </div>
    `;
}

// =========================================================
// INTERACTIVE SVG CHART GENERATOR
// =========================================================
function generatePointsPositionSVGChart(rounds, d1Name, d2Name, d1Series, d2Series) {
    if (!rounds.length) return "";
    const width = 740;
    const height = 200;
    const padL = 45;
    const padR = 30;
    const padT = 20;
    const padB = 30;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxVal = Math.max(26, ...d1Series.map(d => d.points), ...d2Series.map(d => d.points));
    const stepX = rounds.length > 1 ? plotW / (rounds.length - 1) : plotW / 2;

    const getX = (idx) => padL + (rounds.length > 1 ? idx * stepX : plotW / 2);
    const getY = (val) => padT + plotH - (Math.max(0, val) / maxVal) * plotH;

    // Grid lines
    let gridLinesHtml = "";
    [0, 0.25, 0.5, 0.75, 1].forEach(pct => {
        const y = padT + plotH - pct * plotH;
        const val = Math.round(pct * maxVal);
        gridLinesHtml += `
            <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3"/>
            <text x="${padL - 8}" y="${y + 4}" fill="rgba(255,255,255,0.4)" font-size="9" text-anchor="end" font-family="'Orbitron', monospace">${val}</text>
        `;
    });

    // Round labels
    rounds.forEach((r, idx) => {
        const x = getX(idx);
        gridLinesHtml += `
            <line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="rgba(255,255,255,0.04)"/>
            <text x="${x}" y="${height - 8}" fill="rgba(255,255,255,0.6)" font-size="9" text-anchor="middle" font-family="'Orbitron', monospace">${r}</text>
        `;
    });

    // Path for D1
    const d1Coords = d1Series.map((d, idx) => ({ x: getX(idx), y: getY(d.points), p: d.points, pos: d.finish }));
    const d1Path = d1Coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");

    // Path for D2
    const d2Coords = d2Series.map((d, idx) => ({ x: getX(idx), y: getY(d.points), p: d.points, pos: d.finish }));
    const d2Path = d2Coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");

    // Nodes for D1
    let d1Nodes = d1Coords.map(c => `
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5" fill="#ffd700" stroke="#000" stroke-width="2"/>
        <text x="${c.x.toFixed(1)}" y="${(c.y - 8).toFixed(1)}" fill="#ffd700" font-size="10" font-weight="700" text-anchor="middle" font-family="'Orbitron', monospace">${c.p}pts (P${c.pos})</text>
    `).join("");

    // Nodes for D2
    let d2Nodes = d2Coords.map(c => `
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4.5" fill="#38bdf8" stroke="#000" stroke-width="2"/>
        <text x="${c.x.toFixed(1)}" y="${(c.y + 16).toFixed(1)}" fill="#38bdf8" font-size="10" font-weight="700" text-anchor="middle" font-family="'Orbitron', monospace">${c.p}pts (P${c.pos})</text>
    `).join("");

    return `
        <svg viewBox="0 0 ${width} ${height}" class="race-chart-svg" style="width:100%; height:auto; overflow:visible;">
            <defs>
                <filter id="glowGold" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ffd700" flood-opacity="0.6"/>
                </filter>
                <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#38bdf8" flood-opacity="0.6"/>
                </filter>
            </defs>
            ${gridLinesHtml}
            <path d="${d1Path}" fill="none" stroke="#ffd700" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#glowGold)"/>
            <path d="${d2Path}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 3" filter="url(#glowCyan)"/>
            ${d1Nodes}
            ${d2Nodes}
        </svg>
    `;
}

// Expose modal helpers globally
if (typeof window !== "undefined") {
    window.changeCareerModalTeam = changeCareerModalTeam;
    window.launchPitWall = launchPitWall;
    window.openRaceInfoModal = openRaceInfoModal;
    window.closeRaceInfoModal = closeRaceInfoModal;
    window.switchRaceInfoTeam = switchRaceInfoTeam;
}

