/* =========================================================
   DRIVER PROFILE & TELEMETRY REGISTRY
========================================================= */

import { API_BASE_URL, getMyTeam, setMyTeam } from "./config.js";
import { escapeHtml } from "./utils.js";
import { teamsData } from "./teamsData.js";

export async function loadUserProfile() {
    const container = document.getElementById("profileContainer");
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/profile`, { credentials: "include" });
        if (!response.ok) {
            container.innerHTML = `<div class="career-empty">Please sign in to view your driver profile.</div>`;
            return;
        }

        const data = await response.json();
        if (!data.success || !data.profile) {
            throw new Error(data.message || "Failed to load profile.");
        }

        const profile = data.profile;
        const career = profile.career;
        const currentTeam = profile.selected_team || getMyTeam();
        const teamData = (teamsData && teamsData[currentTeam]) || {};

        // Update session storage
        sessionStorage.setItem("f1_username", profile.username);

        // Update nav badge
        const navUserBadge = document.getElementById("navUserBadge");
        if (navUserBadge) {
            navUserBadge.innerHTML = `
                <span style="color:var(--text-muted); font-size:11px;">CALLSIGN:</span>
                <strong style="color:#ffffff;">${escapeHtml(profile.username)}</strong>
                ${profile.is_admin ? `<span style="background:rgba(255,215,0,0.2); border:1px solid rgba(255,215,0,0.6); color:var(--gold); padding:2px 6px; border-radius:3px; font-size:9px; font-weight:700;">ADMIN</span>` : ""}
            `;
        }

        let careerHtml = "";
        if (career && career.started) {
            const upgradesList = Object.entries(career.upgrades || {}).map(([comp, lvl]) => `
                <div class="profile-upgrade-item">
                    <span class="profile-upgrade-label">${escapeHtml(comp.replace(/_/g, " ").toUpperCase())}</span>
                    <span class="profile-upgrade-val">LVL ${lvl} / 10</span>
                </div>
            `).join("") || "<div style='color:rgba(255,255,255,0.4); font-size:13px;'>No car upgrades purchased yet.</div>";

            careerHtml = `
                <div class="profile-career-grid">
                    <div class="profile-kpi-card">
                        <div class="profile-kpi-label">DRIVER STANDING</div>
                        <div class="profile-kpi-val">${career.driver_position ? `P${career.driver_position}` : "--"}</div>
                        <div class="profile-kpi-sub">${Number(career.driver_points || 0).toFixed(0)} PTS &bull; ${career.driver_wins || 0}W / ${career.driver_podiums || 0}P</div>
                    </div>
                    <div class="profile-kpi-card">
                        <div class="profile-kpi-label">CONSTRUCTOR STANDING</div>
                        <div class="profile-kpi-val">${career.team_position ? `P${career.team_position}` : "--"}</div>
                        <div class="profile-kpi-sub">${Number(career.team_points || 0).toFixed(0)} PTS &bull; ${escapeHtml(career.team)}</div>
                    </div>
                    <div class="profile-kpi-card">
                        <div class="profile-kpi-label">CHAMPIONSHIP PROGRESS</div>
                        <div class="profile-kpi-val">${career.season_completed ? "COMPLETE" : `R${career.current_round} / 24`}</div>
                        <div class="profile-kpi-sub">${career.completed_races} races finished &bull; Season ${career.season}</div>
                    </div>
                    <div class="profile-kpi-card highlight">
                        <div class="profile-kpi-label">DEVELOPMENT POINTS</div>
                        <div class="profile-kpi-val" style="color:var(--gold);">${career.development_points_available} DP</div>
                        <div class="profile-kpi-sub"><strong>${career.development_points_used} DP Used</strong> in car upgrades</div>
                    </div>
                </div>

                <div class="profile-upgrades-section" style="margin-top:24px;">
                    <h4 class="profile-section-heading">ACTIVE CAR DEVELOPMENT &amp; UPGRADES</h4>
                    <div class="profile-upgrades-grid">
                        ${upgradesList}
                    </div>
                </div>
            `;
        } else {
            careerHtml = `
                <div class="profile-empty-career">
                    <div style="font-size:32px; margin-bottom:12px;">🏎️</div>
                    <h3 style="font-family:'Orbitron', monospace; font-size:16px; margin-bottom:8px;">No Active Career Mode Championship</h3>
                    <p style="color:rgba(255,255,255,0.6); max-width:440px; margin:0 auto 16px; font-size:14px;">
                        Start a new 2026 World Championship career to track driver finishes, earn development points, and upgrade your constructor's telemetry.
                    </p>
                    <button type="button" class="btn btn-primary" onclick="switchToCareer()" style="padding:10px 22px; font-size:11px;">
                        START CAREER MODE &rarr;
                    </button>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="profile-layout-grid">
                <!-- LEFT COLUMN: DRIVER CREDENTIALS & EDIT FORM -->
                <div class="profile-card profile-info-card">
                    <div class="profile-header-meta">
                        <div class="profile-avatar">
                            ${escapeHtml(profile.username.substring(0, 2).toUpperCase())}
                        </div>
                        <div>
                            <div class="profile-role-tag">${profile.is_admin ? "OPERATIONS ADMIN" : "FIA SUPER LICENSE DRIVER"}</div>
                            <h2 class="profile-callsign-heading">${escapeHtml(profile.username)}</h2>
                            <div class="profile-email-text">${escapeHtml(profile.email)}</div>
                        </div>
                    </div>

                    <!-- ACTIVE CONSTRUCTOR WIDGET -->
                    <div class="profile-constructor-box">
                        <div style="display:flex; align-items:center; gap:14px;">
                            ${teamData.logo ? `<img src="${teamData.logo}" alt="${escapeHtml(currentTeam)}" style="width:42px; height:42px; object-fit:contain;">` : ""}
                            <div>
                                <div style="font-family:'Orbitron', monospace; font-size:9px; letter-spacing:1.5px; color:var(--text-muted);">ACTIVE CONSTRUCTOR</div>
                                <div style="font-size:16px; font-weight:700; color:#fff;">${escapeHtml(currentTeam)}</div>
                                <div style="font-size:12px; color:rgba(255,255,255,0.5);">${escapeHtml(teamData.engine || "Formula 1")} PU</div>
                            </div>
                        </div>
                        <button type="button" class="btn-change-constructor" onclick="openTeamSelectModal()">
                            Switch Constructor
                        </button>
                    </div>

                    <!-- EDIT PROFILE FORM -->
                    <div class="profile-edit-box">
                        <h4 class="profile-section-heading">UPDATE DRIVER CREDENTIALS</h4>
                        <form id="profileEditForm" onsubmit="handleProfileUpdate(event)">
                            <div class="field">
                                <label for="profileUsernameInput">CALLSIGN / USERNAME</label>
                                <input
                                    type="text"
                                    id="profileUsernameInput"
                                    value="${escapeHtml(profile.username)}"
                                    required
                                    minlength="3"
                                    placeholder="Enter your callsign"
                                >
                            </div>

                            <div class="field">
                                <label for="profileEmailInput">EMAIL ADDRESS</label>
                                <input
                                    type="email"
                                    id="profileEmailInput"
                                    value="${escapeHtml(profile.email)}"
                                    required
                                    placeholder="Enter your email"
                                >
                            </div>

                            <div id="profileAlertBox" class="alert-box" style="display:none; margin-bottom:14px;"></div>

                            <button type="submit" class="btn-submit" id="btnSaveProfile">
                                <span id="saveProfileBtnText">SAVE PROFILE CHANGES</span>
                            </button>
                        </form>
                    </div>

                    <div style="margin-top:20px; font-size:11px; color:rgba(255,255,255,0.4); text-align:center;">
                        Account Registered: ${profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "--"} &bull; Last Session: ${profile.last_login ? new Date(profile.last_login).toLocaleDateString() : "--"}
                    </div>
                </div>

                <!-- RIGHT COLUMN: CHAMPIONSHIP METRICS & DEVELOPMENT -->
                <div class="profile-card profile-stats-card">
                    <h3 class="profile-section-heading" style="margin-bottom:16px;">2026 WORLD CHAMPIONSHIP STANDINGS &amp; TELEMETRY</h3>
                    ${careerHtml}
                </div>
            </div>
        `;
    } catch (err) {
        console.error("Profile load error:", err);
        container.innerHTML = `<div class="career-empty">Error loading profile: ${escapeHtml(err.message)}</div>`;
    }
}

export async function handleProfileUpdate(event) {
    event.preventDefault();
    const alertBox = document.getElementById("profileAlertBox");
    const btn = document.getElementById("btnSaveProfile");
    const btnText = document.getElementById("saveProfileBtnText");
    const newUsername = document.getElementById("profileUsernameInput").value.trim();
    const newEmail = document.getElementById("profileEmailInput").value.trim();

    if (!newUsername || !newEmail) return;

    btn.disabled = true;
    btnText.textContent = "SAVING...";
    alertBox.style.display = "none";

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username: newUsername, email: newEmail })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alertBox.className = "alert-box alert-success";
            alertBox.textContent = "Profile updated successfully!";
            alertBox.style.display = "block";
            sessionStorage.setItem("f1_username", data.profile.username);
            setTimeout(() => {
                loadUserProfile();
            }, 800);
        } else {
            alertBox.className = "alert-box alert-error";
            alertBox.textContent = data.message || "Failed to update profile.";
            alertBox.style.display = "block";
            btn.disabled = false;
            btnText.textContent = "SAVE PROFILE CHANGES";
        }
    } catch (e) {
        alertBox.className = "alert-box alert-error";
        alertBox.textContent = "Server connection error.";
        alertBox.style.display = "block";
        btn.disabled = false;
        btnText.textContent = "SAVE PROFILE CHANGES";
    }
}

// Global hook
if (typeof window !== "undefined") {
    window.loadUserProfile = loadUserProfile;
    window.handleProfileUpdate = handleProfileUpdate;
}
