/* =========================================================
   CAREER MODE & CHAMPIONSHIP CONTROLLER
========================================================= */

import { API_BASE_URL, getMyTeam, setMyTeam } from "./config.js";
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { teamsData } from "./teamsData.js";

export async function loadCareerDashboard() {
    const panel = document.getElementById("careerPanel");
    if (!panel) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/career/dashboard`, { credentials: "include" });
        if (!response.ok) return;

        const data = await response.json();
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

        const raceButton = document.getElementById("runCareerRaceButton");
        if (raceButton) {
            raceButton.disabled = career.season_completed === true;
            raceButton.textContent = career.season_completed ? "SEASON COMPLETE" : "SIMULATE CURRENT RACE";
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
                <div class="career-team-card ${team.is_my_team ? "mine" : ""}">
                    <div class="career-team-name">${escapeHtml(team.team || "Unknown Team")}</div>
                    <div class="career-team-points">${points.toFixed(0)} pts</div>
                    <div class="career-team-meta">
                        <span>${wins} wins</span>
                        <span>${podiums} podiums</span>
                    </div>
                    <div class="career-team-gap ${gapClass}">${gapText}</div>
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
    const container = document.getElementById("careerRaceViewContainer");
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

    container.innerHTML = `
        <div class="career-races-grid">
            <div id="careerCurrentRaceBox" class="career-race-card current">
                <div class="race-label">${currentRace.status === "completed" ? "LAST COMPLETED RACE" : "CURRENT ROUND"}</div>
                <h3>R${currentRace.round || 1} · ${escapeHtml(currentRace.circuit || "Grand Prix")}</h3>
                <div class="race-big">${currentRace.driver_position ? `P${currentRace.driver_position}` : (currentRace.status === "completed" ? "DNF" : "UPCOMING")}</div>
                <div class="career-race-meta">
                    <span>${escapeHtml(currentRace.country || "Championship")}</span>
                    <span>${escapeHtml(currentRace.weather || "Dry")}</span>
                    ${currentRace.driver_points !== undefined ? `<span>Driver: ${Number(currentRace.driver_points).toFixed(0)} pts</span>` : ""}
                    ${currentRace.team_points !== undefined ? `<span>Team: ${Number(currentRace.team_points).toFixed(0)} pts</span>` : ""}
                </div>
            </div>
            <div id="careerNextRaceBox" class="career-race-card next">
                <div class="race-label">NEXT UP ON CALENDAR</div>
                <h3>${nextRace.round ? `R${nextRace.round} · ${escapeHtml(nextRace.circuit || "Grand Prix")}` : "SEASON COMPLETED"}</h3>
                <div class="race-big">${nextRace.round ? `ROUND ${nextRace.round}` : "TROPHY READY"}</div>
                <div class="career-race-meta">
                    <span>${escapeHtml(nextRace.country || "")}</span>
                    <span>${escapeHtml(nextRace.weather || "Scheduled")}</span>
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

// Expose modal helper
if (typeof window !== "undefined") {
    window.changeCareerModalTeam = changeCareerModalTeam;
}
