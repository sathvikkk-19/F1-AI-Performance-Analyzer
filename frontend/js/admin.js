/* =========================================================
   ADMIN CONSOLE & USER ACTIVITY MONITORING
========================================================= */

import { API_BASE_URL } from "./config.js";
import { escapeHtml } from "./utils.js";

let allUsersCache = [];

export async function loadAdminDashboard() {
    const adminContainer = document.getElementById("adminUserTableBody");
    const statsContainer = document.getElementById("adminStatsCards");
    if (!adminContainer) return;

    adminContainer.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:rgba(255,255,255,0.5);">Loading telemetry user registry...</td></tr>`;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users`, { credentials: "include" });
        if (response.status === 401 || response.status === 403) {
            adminContainer.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#f87171;">Admin authorization required. Please sign in with F1 Admin credentials.</td></tr>`;
            return;
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || "Failed to load admin data.");
        }

        allUsersCache = data.users || [];
        renderAdminStats(data.stats || {});
        renderAdminUserTable(allUsersCache);
    } catch (err) {
        console.error("Admin dashboard error:", err);
        adminContainer.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#f87171;">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderAdminStats(stats) {
    const container = document.getElementById("adminStatsCards");
    if (!container) return;

    const teamDist = stats.team_distribution || {};
    const topTeams = Object.entries(teamDist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([team, count]) => `${escapeHtml(team)} (${count})`)
        .join(", ") || "None yet";

    container.innerHTML = `
        <div class="admin-kpi-card">
            <div class="admin-kpi-label">TOTAL REGISTERED USERS</div>
            <div class="admin-kpi-val">${stats.total_users ?? 0}</div>
            <div class="admin-kpi-sub">Database user accounts</div>
        </div>
        <div class="admin-kpi-card">
            <div class="admin-kpi-label">ACTIVE CAREERS</div>
            <div class="admin-kpi-val">${stats.active_careers ?? 0}</div>
            <div class="admin-kpi-sub">Users with active season</div>
        </div>
        <div class="admin-kpi-card">
            <div class="admin-kpi-label">TOTAL SIMULATED RACES</div>
            <div class="admin-kpi-val">${stats.total_races_simulated ?? 0}</div>
            <div class="admin-kpi-sub">Across all user championships</div>
        </div>
        <div class="admin-kpi-card">
            <div class="admin-kpi-label">POPULAR CONSTRUCTORS</div>
            <div class="admin-kpi-val" style="font-size:18px; line-height:1.3; margin-top:4px;">${topTeams}</div>
            <div class="admin-kpi-sub">Driver team choices</div>
        </div>
    `;
}

export function filterAdminUsers(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) {
        renderAdminUserTable(allUsersCache);
        return;
    }
    const filtered = allUsersCache.filter(u =>
        (u.username || "").toLowerCase().includes(q) ||
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.email_provider || "").toLowerCase().includes(q) ||
        (u.selected_team || "").toLowerCase().includes(q) ||
        (u.career?.team || "").toLowerCase().includes(q) ||
        (u.career?.driver_name || "").toLowerCase().includes(q)
    );
    renderAdminUserTable(filtered);
}

function getProviderBadge(provider) {
    const p = (provider || "").toLowerCase();
    if (p.includes("google") || p.includes("gmail")) {
        return `<span style="background:rgba(234,67,53,0.15); border:1px solid rgba(234,67,53,0.4); color:#fca5a5; padding:1px 6px; border-radius:3px; font-size:9.5px; font-weight:700;">Google</span>`;
    } else if (p.includes("yahoo")) {
        return `<span style="background:rgba(123,44,191,0.15); border:1px solid rgba(123,44,191,0.4); color:#d8b4fe; padding:1px 6px; border-radius:3px; font-size:9.5px; font-weight:700;">Yahoo</span>`;
    } else if (p.includes("outlook") || p.includes("microsoft")) {
        return `<span style="background:rgba(0,120,212,0.15); border:1px solid rgba(0,120,212,0.4); color:#93c5fd; padding:1px 6px; border-radius:3px; font-size:9.5px; font-weight:700;">Outlook</span>`;
    }
    return `<span style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#cbd5e1; padding:1px 6px; border-radius:3px; font-size:9.5px;">${escapeHtml(provider || "Email")}</span>`;
}

function renderAdminUserTable(users) {
    const tbody = document.getElementById("adminUserTableBody");
    if (!tbody) return;

    if (!users || !users.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:rgba(255,255,255,0.5);">No users found.</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(user => {
        const career = user.career;
        const roleBadge = user.is_admin
            ? `<span style="background:rgba(255,215,0,0.15); border:1px solid rgba(255,215,0,0.5); color:#ffd700; padding:2px 8px; border-radius:3px; font-size:10px; font-weight:700;">ADMIN</span>`
            : `<span style="background:rgba(6,182,212,0.15); border:1px solid rgba(6,182,212,0.5); color:#06b6d4; padding:2px 8px; border-radius:3px; font-size:10px; font-weight:700;">DRIVER</span>`;

        const verifiedBadge = user.is_verified
            ? `<span style="display:inline-block; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.4); color:#34d399; padding:1px 6px; border-radius:3px; font-size:9.5px; font-weight:700;">VERIFIED &#10003;</span>`
            : `<span style="display:inline-block; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); color:#fbbf24; padding:1px 6px; border-radius:3px; font-size:9.5px;">PENDING</span>`;

        const chosenTeam = career?.team || user.selected_team || "None selected";
        const teamBadge = `<span style="font-weight:600; color:#ffffff;">${escapeHtml(chosenTeam)}</span>`;

        let careerStatus = `<span style="color:rgba(255,255,255,0.4);">Not started</span>`;
        let driverInfo = "--";
        let statsInfo = "--";

        if (career && career.started) {
            careerStatus = career.season_completed
                ? `<span style="color:#34d399; font-weight:600;">Season Complete</span>`
                : `<span style="color:#38bdf8; font-weight:600;">Round ${career.current_round} / 24</span>`;

            driverInfo = `<strong>${escapeHtml(career.driver_name || "Unknown")}</strong>`;
            statsInfo = `${career.driver_points ?? 0} pts · ${career.driver_wins ?? 0}W / ${career.driver_podiums ?? 0}P`;
        }

        const providerBadge = getProviderBadge(user.email_provider);
        const displayName = user.full_name || user.username;

        return `
            <tr>
                <td>
                    <div style="font-weight:700; color:#fff; font-size:13px;">${escapeHtml(displayName)}</div>
                    <div style="font-size:11px; color:rgba(255,255,255,0.45); font-family:'Orbitron', monospace;">@${escapeHtml(user.username)}</div>
                </td>
                <td>
                    <div style="font-size:12px; color:#f1f5f9; margin-bottom:3px;">${escapeHtml(user.email)}</div>
                    <div>${providerBadge}</div>
                </td>
                <td>
                    <div>${roleBadge}</div>
                    <div style="margin-top:4px;">${verifiedBadge}</div>
                </td>
                <td>${teamBadge}</td>
                <td>${driverInfo}</td>
                <td>${careerStatus}</td>
                <td>${statsInfo}</td>
                <td>
                    <button type="button" class="admin-inspect-btn" onclick="openAdminInspectModal(${user.id})" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:6px 10px; border-radius:4px; font-family:'Orbitron', monospace; font-size:9px; cursor:pointer; transition:all 0.2s;">
                        Inspect Telemetry &rarr;
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

export function openAdminInspectModal(userId) {
    const user = allUsersCache.find(u => u.id === userId);
    if (!user) return;

    const modal = document.getElementById("adminInspectModal");
    const content = document.getElementById("adminInspectContent");
    if (!modal || !content) return;

    const career = user.career;
    let detailsHtml = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:20px;">
            <div class="admin-kpi-card">
                <div class="admin-kpi-label">DRIVER IDENTITY</div>
                <div class="admin-kpi-val" style="font-size:18px;">${escapeHtml(user.full_name || user.username)}</div>
                <div class="admin-kpi-sub">@${escapeHtml(user.username)} &bull; ${escapeHtml(user.email_provider || "Mail")}</div>
            </div>
            <div class="admin-kpi-card">
                <div class="admin-kpi-label">VERIFIED MAILBOX</div>
                <div class="admin-kpi-val" style="font-size:15px; word-break:break-all;">${escapeHtml(user.email)}</div>
                <div class="admin-kpi-sub">${user.is_verified ? "Verified via 6-digit OTP ✓" : "Pending Verification"}</div>
            </div>
            <div class="admin-kpi-card">
                <div class="admin-kpi-label">CLEARANCE &amp; TEAM</div>
                <div class="admin-kpi-val" style="font-size:18px;">${user.is_admin ? "FIA ADMIN" : "DRIVER"}</div>
                <div class="admin-kpi-sub">${escapeHtml(career?.team || user.selected_team || "No Constructor")}</div>
            </div>
        </div>
    `;

    if (career && career.started) {
        const races = career.season_result?.races || [];
        const upgrades = career.upgrades || {};

        const upgradeList = Object.entries(upgrades).map(([comp, lvl]) => `
            <span style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); padding:4px 8px; border-radius:4px; font-size:11px; font-family:'Orbitron', monospace;">
                ${escapeHtml(comp.toUpperCase())}: LVL ${lvl}
            </span>
        `).join("") || "<span style='color:rgba(255,255,255,0.4);'>No upgrades purchased yet</span>";

        const raceRows = races.length ? races.map((r, i) => {
            const classif = r.classification || [];
            const userFinish = classif.find(c =>
                c.driver === career.driver_name || (c.driver_id && String(c.driver_id) === String(career.driver_id))
            );
            const pos = userFinish ? `P${userFinish.position}` : "Finished";
            return `
                <div style="display:flex; justify-content:space-between; padding:8px 12px; background:rgba(0,0,0,0.3); border-radius:4px; margin-bottom:6px; font-size:13px;">
                    <span>Round ${r.round || i+1}: ${escapeHtml(r.circuit || "Grand Prix")}</span>
                    <span style="font-weight:700; color:var(--cyan);">${pos}</span>
                </div>
            `;
        }).join("") : "<div style='color:rgba(255,255,255,0.4);'>No races run yet.</div>";

        detailsHtml += `
            <div style="margin-bottom:18px;">
                <h4 style="font-family:'Orbitron', monospace; font-size:12px; letter-spacing:1px; margin-bottom:10px; color:var(--gold);">DEVELOPMENT UPGRADES</h4>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">${upgradeList}</div>
            </div>
            <div>
                <h4 style="font-family:'Orbitron', monospace; font-size:12px; letter-spacing:1px; margin-bottom:10px; color:var(--red);">RACE TELEMETRY LOGS (${races.length} COMPLETED)</h4>
                <div style="max-height:200px; overflow-y:auto; padding-right:6px;">${raceRows}</div>
            </div>
        `;
    } else {
        detailsHtml += `<div style="padding:20px; text-align:center; color:rgba(255,255,255,0.5);">User has not started a career mode season yet.</div>`;
    }

    content.innerHTML = detailsHtml;
    modal.style.display = "flex";
}

export function closeAdminInspectModal() {
    const modal = document.getElementById("adminInspectModal");
    if (modal) modal.style.display = "none";
}

// Expose functions globally for onclick handles
if (typeof window !== "undefined") {
    window.loadAdminDashboard = loadAdminDashboard;
    window.filterAdminUsers = filterAdminUsers;
    window.openAdminInspectModal = openAdminInspectModal;
    window.closeAdminInspectModal = closeAdminInspectModal;
}
