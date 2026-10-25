/* =========================================================
   PIT-WALL TACTICAL COMMAND CENTER CONTROLLER V3.0
   Interactive 2026 F1 Race Director, 350kW ERS & Dynamic Tyre Physics
========================================================= */

import { API_BASE_URL, getMyTeam } from "./config.js";
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { pitwallAudio } from "./pitwallAudio.js";
import { loadCareerDashboard } from "./career.js";

// =========================================================
// REAL-WORLD PIRELLI 2026 TYRE DEGRADATION SPECIFICATIONS
// =========================================================
export const TYRE_SPECS = {
    "Soft": {
        baseWearPerLap: 5.2,        // 100% -> 0% in ~19 laps (usable stint: 14-17 laps)
        basePaceAdvantage: -0.65,    // Fastest single-lap pace (-0.65s vs Medium)
        cliffWearThreshold: 30,     // Cliff begins when wear < 30%
        cliffPenaltyPerLap: 0.22,    // Rapid thermal time loss past cliff
        colorClass: "tyre-soft",
        badge: "S"
    },
    "Medium": {
        baseWearPerLap: 3.1,        // 100% -> 0% in ~32 laps (usable stint: 24-28 laps)
        basePaceAdvantage: 0.00,    // Baseline race stint reference
        cliffWearThreshold: 22,     // Cliff begins when wear < 22%
        cliffPenaltyPerLap: 0.12,
        colorClass: "tyre-medium",
        badge: "M"
    },
    "Hard": {
        baseWearPerLap: 1.85,       // 100% -> 0% in ~54 laps (usable stint: 36-45 laps)
        basePaceAdvantage: +0.55,   // Durable, low thermal fall-off (+0.55s vs Medium)
        cliffWearThreshold: 15,     // Cliff begins when wear < 15%
        cliffPenaltyPerLap: 0.07,
        colorClass: "tyre-hard",
        badge: "H"
    },
    "Intermediate": {
        baseWearPerLap: 2.8,        // Designed for damp/mixed conditions
        basePaceAdvantage: +1.80,
        cliffWearThreshold: 20,
        cliffPenaltyPerLap: 0.10,
        dryThermalDestruction: 9.8, // 9.8% wear per lap in dry conditions!
        colorClass: "tyre-inter",
        badge: "I"
    },
    "Full Wet": {
        baseWearPerLap: 2.2,        // Designed for standing water (water cools rubber)
        basePaceAdvantage: +3.60,
        cliffWearThreshold: 18,
        cliffPenaltyPerLap: 0.08,
        dryThermalDestruction: 15.5,// 15.5% wear per lap in dry conditions!
        mixedWearPerLap: 6.0,
        colorClass: "tyre-wet",
        badge: "W"
    }
};

class PitwallController {
    constructor() {
        this.active = false;
        this.raceData = null;
        this.currentLap = 1;
        this.totalLaps = 57;
        this.speed = 1; // 1x = 1000ms, 2x = 500ms, 5x = 200ms
        this.timer = null;
        this.subLapTimer = null;
        this.paused = false;

        // Tactical Pilot State
        this.engineMode = "balanced"; // "attack" | "balanced" | "conserve"
        this.tyreCompound = "Medium";
        this.tyreWear = 100; // 100% -> 0%
        this.tyreAge = 1;
        this.batteryERS = 90; // 0% -> 100%
        this.ersState = "deploy"; // "deploy" | "harvest" | "idle"
        this.driverId = null;
        this.driverName = "Driver";
        this.myTeam = "Constructor";
        this.playerPos = 1;
        this.pendingPit = false;
        this.pitNextCompound = "Hard";

        // Dynamic Timing Grid & Live Standings
        this.liveDrivers = [];
        this.currentWeather = "Dry";
        this.lastLeader = null;

        // Stewards, Track Limits & Penalty Telemetry
        this.trackLimitsStrikes = 0;
        this.lastTrackLimitLap = -99;
        this.penaltyTimeOwed = 0.0;
        this.activePenalties = [];
        this.pendingInvestigation = null;

        // Tactical Decisions Log
        this.decisionsMade = [];
        this.tacticalBonusDP = 0;
        this.eventsTriggered = new Set();
    }

    // Launch Pit Wall Command
    async launch(careerData) {
        const modal = document.getElementById("pitwallModal");
        if (!modal) return;

        this.myTeam = (careerData && careerData.my_team) || getMyTeam();
        this.driverName = (careerData && careerData.career && careerData.career.driver_name) || "My Driver";
        this.driverId = careerData && careerData.career && careerData.career.driver_id;

        // Show modal in loading state
        modal.style.display = "block";
        this._renderLoading();

        try {
            // Run race simulation on backend
            const response = await fetch(`${API_BASE_URL}/api/career/race`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    tactics: {
                        mode: "pitwall_interactive",
                        tactical_success: true,
                        bonus_dp: 2
                    }
                })
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || data.error || "Failed to initialize race.");
            }

            this.raceData = data.race || {};
            this.totalLaps = Number(this.raceData.laps || 57);
            this.currentLap = 1;
            this.active = true;
            this.paused = false;
            this.speed = 1;
            this.eventsTriggered.clear();
            this.decisionsMade = [];
            this.tacticalBonusDP = 2; // Baseline Tactical Command participation bonus
            this.currentWeather = this.raceData.weather || "Dry";

            // Reset Stewards & Penalties
            this.trackLimitsStrikes = 0;
            this.lastTrackLimitLap = -99;
            this.penaltyTimeOwed = 0.0;
            this.activePenalties = [];
            this.pendingInvestigation = null;
            this._hideStewardBanner();

            // Derive starting compound from strategy or default to Medium
            const playerStrat = (this.raceData.strategies || []).find(s => s.driver_id === this.driverId || s.driver === this.driverName);
            if (playerStrat && Array.isArray(playerStrat.stints) && playerStrat.stints.length > 0) {
                this.tyreCompound = playerStrat.stints[0].compound || "Medium";
            } else {
                this.tyreCompound = "Medium";
            }
            this.tyreWear = 100;
            this.tyreAge = 1;
            this.batteryERS = 90;
            this.engineMode = "balanced";
            this.pendingPit = false;

            // Initialize Live Dynamic Timing Grid
            this._initLiveDrivers();

            this._renderFullCockpit();
            pitwallAudio.playRadioChirp();
            this._addRadioMessage(`RACE ENGINEER: "Radio check, ${this.driverName}. We are on ${this.tyreCompound} tyres for Stint 1. Strategy is Plan A."`);

            this._startLoop();
        } catch (err) {
            console.error("Pit Wall Launch Error:", err);
            modal.innerHTML = `
                <div style="padding:40px; text-align:center;">
                    <h2 style="font-family:'Orbitron', monospace; color:var(--red);">RACE INITIALIZATION FAILED</h2>
                    <p style="margin:14px 0 24px; color:var(--text-muted);">${escapeHtml(err.message)}</p>
                    <button class="btn-finish-return" onclick="window.pitwall.close()">RETURN TO CAREER</button>
                </div>
            `;
        }
    }

    // Initialize stateful live drivers list from starting grid or lap 1 snapshot
    _initLiveDrivers() {
        const lapHistory = this.raceData.lap_history || [];
        const lap1 = lapHistory.length > 0 ? (lapHistory[0].standings || []) : (this.raceData.classification || []);

        this.liveDrivers = lap1.map((d, idx) => {
            const isPlayer = String(d.driver).toLowerCase() === String(this.driverName).toLowerCase();
            const compound = isPlayer ? this.tyreCompound : (d.compound || "Medium");
            const pos = d.position || (idx + 1);
            if (isPlayer) {
                this.playerPos = pos;
            }

            return {
                driver: d.driver || `Driver ${idx + 1}`,
                team: d.team || "",
                position: pos,
                compound: compound,
                tyreAge: Number(d.tyre_age || 1),
                tyreWear: 100,
                gapToLeader: Number(d.gap_to_leader || (idx * 0.45)),
                gapToAhead: Number(d.gap_to_ahead || (idx === 0 ? 0 : 0.45)),
                gapTrend: "stable", // "shrinking" | "widening" | "stable"
                lapTime: Number(d.lap_time || 87.5),
                bestLap: Number(d.lap_time || 87.5),
                pitStops: Number(d.pit_stops || 0),
                isPlayer: isPlayer,
                isLeadChange: false,
                aiMode: "balanced"
            };
        });

        // Ensure sorted by position
        this.liveDrivers.sort((a, b) => a.position - b.position);
        if (this.liveDrivers.length > 0) {
            this.lastLeader = this.liveDrivers[0].driver;
        }
    }

    _renderLoading() {
        const modal = document.getElementById("pitwallModal");
        if (!modal) return;
        modal.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; text-align:center;">
                <div class="pitwall-pulse-dot" style="width:24px; height:24px; margin-bottom:18px;"></div>
                <div style="font-family:'Orbitron', monospace; font-size:16px; letter-spacing:3px; color:var(--gold);">
                    ESTABLISHING DIRECT PIT-WALL TELEMETRY LINK...
                </div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">
                    Connecting to FIA Race Control &amp; ${escapeHtml(this.myTeam)} 350kW MGU-K Hybrid Telemetry
                </div>
            </div>
        `;
    }

    _renderFullCockpit() {
        const modal = document.getElementById("pitwallModal");
        if (!modal) return;

        const circuitName = this.raceData.circuit || "Grand Prix Circuit";
        const country = this.raceData.country || "Formula 1";
        const roundNum = this.raceData.round || 1;
        const weather = this.currentWeather || "Dry";

        modal.innerHTML = `
            <div class="pitwall-container">
                <!-- Top Race Control Header -->
                <header class="pitwall-topbar">
                    <div class="pitwall-race-meta">
                        <div class="pitwall-live-badge">
                            <div class="pitwall-pulse-dot"></div>
                            LIVE TIMING
                        </div>
                        <div>
                            <div class="pitwall-grand-prix-title">ROUND ${roundNum} · ${escapeHtml(circuitName.toUpperCase())}</div>
                            <div class="pitwall-circuit-sub">${escapeHtml(country)} · 2026 World Championship · Active Regulations</div>
                        </div>
                    </div>

                    <div id="pitwallStatusPill" class="pitwall-status-pill pitwall-status-green">
                        GREEN FLAG
                    </div>

                    <div id="pitwallStewardAlert" class="pitwall-steward-pill" style="display:none;"></div>

                    <div class="pitwall-lap-counter">
                        <span>LAP</span>
                        <strong id="pitwallLapNum">1</strong>
                        <span>/ ${this.totalLaps}</span>
                    </div>

                    <div class="pitwall-weather-stats">
                        <div>TRACK: <strong id="pitwallTrackTemp">34°C</strong></div>
                        <div>AIR: <strong>25°C</strong></div>
                        <div>CONDITIONS: <strong id="pitwallWeatherText">${escapeHtml(weather)}</strong></div>
                    </div>

                    <!-- Playback controls -->
                    <div class="pitwall-controls">
                        <button type="button" class="pitwall-ctrl-btn" id="btnAudioToggle" onclick="window.pitwall.toggleAudio()" title="Toggle Team Radio Audio">
                            ${pitwallAudio.isMuted() ? "🔇 MUTED" : "🔊 RADIO ON"}
                        </button>
                        <button type="button" class="pitwall-ctrl-btn" id="btnPlayPause" onclick="window.pitwall.togglePause()">
                            PAUSE ||
                        </button>
                        <button type="button" class="pitwall-ctrl-btn active" id="btnSpeed1" onclick="window.pitwall.setSpeed(1)">1X</button>
                        <button type="button" class="pitwall-ctrl-btn" id="btnSpeed2" onclick="window.pitwall.setSpeed(2)">2X</button>
                        <button type="button" class="pitwall-ctrl-btn" id="btnSpeed5" onclick="window.pitwall.setSpeed(5)">5X</button>
                        <button type="button" class="pitwall-ctrl-btn pitwall-ctrl-skip" onclick="window.pitwall.skipToEnd()">SKIP TO END ⏭</button>
                        <button type="button" class="pitwall-close-btn" onclick="window.pitwall.close()">EXIT</button>
                    </div>
                </header>

                <!-- Main Grid: Timing Tower & Driver HUD -->
                <main class="pitwall-main">
                    <!-- Left: Timing Tower -->
                    <section class="pitwall-tower-card">
                        <div class="pitwall-tower-header">
                            <div>POS</div>
                            <div>DRIVER / CONSTRUCTOR</div>
                            <div>INTERVAL</div>
                            <div>TYRE</div>
                            <div>STOPS</div>
                            <div>BEST LAP</div>
                        </div>
                        <div class="pitwall-tower-list" id="pitwallTowerList">
                            <!-- Populated dynamically per lap -->
                        </div>
                    </section>

                    <!-- Right: Pilot Telemetry HUD & Tactical Controls -->
                    <section class="pitwall-hud-col">
                        <!-- Driver ID Card -->
                        <div class="pitwall-pilot-card">
                            <div>
                                <div class="pitwall-pilot-name">★ ${escapeHtml(this.driverName)}</div>
                                <div class="pitwall-pilot-meta">${escapeHtml(this.myTeam)} · 2026 CHASSIS</div>
                            </div>
                            <div class="pitwall-pilot-pos-box">
                                <div class="pitwall-pilot-pos-label">TRACK POSITION</div>
                                <div class="pitwall-pilot-pos-num" id="hudPlayerPos">P${this.playerPos}</div>
                            </div>
                        </div>

                        <!-- Gauges: Tyre Health & Battery ERS -->
                        <div class="pitwall-gauges-grid">
                            <div class="pitwall-gauge-box">
                                <div class="gauge-title">
                                    <span>TYRE HEALTH (PIRELLI)</span>
                                    <span id="hudTyreBadge" class="tower-tyre-chip tyre-medium">M</span>
                                </div>
                                <div class="gauge-val" id="hudTyreVal">100%</div>
                                <div class="gauge-bar-track">
                                    <div class="gauge-bar-fill fill-tyre-good" id="hudTyreBar" style="width:100%;"></div>
                                </div>
                            </div>

                            <div class="pitwall-gauge-box">
                                <div class="gauge-title">
                                    <span>ERS BATTERY (350kW MGU-K)</span>
                                    <span id="hudErsModeText" style="color:var(--cyan); font-weight:700;">DEPLOY</span>
                                </div>
                                <div class="gauge-val" id="hudErsVal">90%</div>
                                <div class="gauge-bar-track">
                                    <div class="gauge-bar-fill fill-ers" id="hudErsBar" style="width:90%;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Engine / Power Unit Strategy Toggles -->
                        <div class="pitwall-engine-section">
                            <div class="pitwall-engine-title">
                                <span>POWER UNIT &amp; STRATEGY MODES</span>
                                <span style="color:var(--gold); font-size:9px;">LIVE TACTICAL OVERRIDE</span>
                            </div>
                            <div class="pitwall-engine-toggles">
                                <button type="button" class="pitwall-mode-btn mode-attack" id="btnModeAttack" onclick="window.pitwall.setEngineMode('attack')">
                                    <strong>⚡ STRAT 1 (ATTACK)</strong>
                                    <small>350kW Dump (100%&rarr;20%) · Max Pace</small>
                                </button>
                                <button type="button" class="pitwall-mode-btn mode-balanced active" id="btnModeBalanced" onclick="window.pitwall.setEngineMode('balanced')">
                                    <strong>⚖ STRAT 5 (BALANCED)</strong>
                                    <small>Standard Deploy &amp; Regen</small>
                                </button>
                                <button type="button" class="pitwall-mode-btn mode-conserve" id="btnModeConserve" onclick="window.pitwall.setEngineMode('conserve')">
                                    <strong>🛡 STRAT 9 (HARVEST)</strong>
                                    <small>Heavy Braking Regen &bull; +40% Charge</small>
                                </button>
                            </div>
                        </div>

                        <!-- Manual Pit Call Button -->
                        <div class="pitwall-pitcall-section">
                            <button type="button" class="pitwall-pitcall-btn" id="btnPitCall" onclick="window.pitwall.triggerManualPitCall()">
                                <span>🏎</span>
                                <span id="pitCallBtnText">BOX THIS LAP [CALL IN]</span>
                            </button>
                        </div>
                    </section>
                </main>

                <!-- Bottom Bar: Live Race Control Radio & Event Ticker -->
                <footer class="pitwall-bottombar">
                    <div class="pitwall-radio-title">
                        <span>📻 TEAM RADIO</span>
                        <div class="pitwall-wave-bars active">
                            <div class="pitwall-wave-bar"></div>
                            <div class="pitwall-wave-bar"></div>
                            <div class="pitwall-wave-bar"></div>
                        </div>
                    </div>
                    <div class="pitwall-ticker-wrap">
                        <div class="pitwall-ticker-text" id="pitwallTickerText">
                            FIA RACE CONTROL: All systems green. Track clear. Formation lap complete.
                        </div>
                    </div>
                </footer>

                <!-- Tactical Decision Overlay (Modal) -->
                <div class="pitwall-decision-overlay" id="pitwallDecisionModal">
                    <div class="pitwall-decision-card" id="pitwallDecisionContent"></div>
                </div>

                <!-- Chequered Flag Finish & Debrief Overlay -->
                <div class="pitwall-finish-overlay" id="pitwallFinishModal">
                    <div class="pitwall-finish-card" id="pitwallFinishContent"></div>
                </div>
            </div>
        `;

        this._renderTimingTower();
        this._updateHUDGauges();
    }

    _startLoop() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = Math.max(120, 1000 / this.speed);

        this.timer = setInterval(() => {
            if (this.paused) return;

            if (this.currentLap < this.totalLaps) {
                this.currentLap++;
                this._stepLap(this.currentLap);
            } else {
                clearInterval(this.timer);
                if (this.subLapTimer) clearInterval(this.subLapTimer);
                this._finishRace();
            }
        }, intervalMs);
    }

    // =========================================================
    // MAIN LAP SIMULATION STEP
    // =========================================================
    _stepLap(lapNum) {
        // 1. Check for weather transitions
        const transitions = this.raceData.weather_transitions || [];
        const weatherShift = transitions.find(t => Number(t.lap) === Number(lapNum));
        if (weatherShift && weatherShift.to_weather) {
            this.currentWeather = weatherShift.to_weather;
            const weatherText = document.getElementById("pitwallWeatherText");
            if (weatherText) weatherText.textContent = this.currentWeather;
        }

        // 2. Process pending pit stop for the player
        if (this.pendingPit) {
            this.pendingPit = false;
            pitwallAudio.playPitGun();
            this.tyreCompound = this.pitNextCompound || "Hard";
            this.tyreWear = 100;
            this.tyreAge = 1;
            this.batteryERS = 100; // Fresh battery after stop

            let stopDuration = 2.4;
            let penaltyText = "";
            let pitLoss = 21.5;

            if (this.penaltyTimeOwed > 0) {
                stopDuration += this.penaltyTimeOwed;
                pitLoss += this.penaltyTimeOwed;
                penaltyText = ` [SERVED ${this.penaltyTimeOwed.toFixed(0)}s PENALTY]`;
                this.activePenalties.forEach(p => p.served = true);
                this.penaltyTimeOwed = 0.0;
                this._hideStewardBanner();
            }

            this._addRadioMessage(`RACE ENGINEER: "Clean stop! ${stopDuration.toFixed(1)} seconds.${penaltyText} Out out out! Fresh ${this.tyreCompound} tyres fitted."`);

            const btn = document.getElementById("pitCallBtnText");
            if (btn) btn.textContent = "BOX THIS LAP [CALL IN]";
            const pitBtn = document.getElementById("btnPitCall");
            if (pitBtn) pitBtn.classList.remove("pending");

            // Apply pit time loss to player
            const playerDriver = this.liveDrivers.find(d => d.isPlayer);
            if (playerDriver) {
                playerDriver.compound = this.tyreCompound;
                playerDriver.tyreWear = 100;
                playerDriver.tyreAge = 1;
                playerDriver.pitStops += 1;
                playerDriver.gapToLeader += pitLoss;
            }
        }

        // 3. Dynamic Real-World Tyre Degradation Calculation
        const wearThisLap = this._calcTyreWear(this.tyreCompound, this.currentWeather, this.engineMode);
        this.tyreWear = Math.max(8, this.tyreWear - wearThisLap);
        this.tyreAge++;

        // 4. Trigger Real-World In-Lap ERS Cycle: Straightline Deploy -> Turn 1 Braking Recharge
        this._runInLapERSAnimation();

        // 5. Update Dynamic Timing Grid (Lead Fluctuations, Gaps & Overtakes)
        this._updateDynamicTimingGrid(lapNum);

        // 5b. Check Live Stewards, Track Limits & Penalties
        this._checkLiveStewardIncidents(lapNum);

        // 6. Render Updates
        this._renderTimingTower();
        this._updateHUDGauges();

        // 7. Check for scripted race events (Safety car, rain prompts, undercut)
        this._checkForTacticalEvents(lapNum);
    }

    // =========================================================
    // REAL-WORLD ERS 350kW DEPLOY & BRAKING HARVEST ANIMATION
    // =========================================================
    // Once deployed on a straight, battery drops from 100% to 20% or 80% to 0%.
    // Under braking, MGU-K regenerates +25% to +45% back into the battery.
    _runInLapERSAnimation() {
        if (this.subLapTimer) clearInterval(this.subLapTimer);

        const lapDuration = Math.max(120, 1000 / this.speed);
        const subTickInterval = Math.max(30, lapDuration / 12);

        // Phase 1: Straightline Acceleration / Overtake deployment target
        let targetDeploy;
        if (this.engineMode === "attack") {
            // Aggressive 350kW dump down straights: drains from 100% -> 20% or 80% -> 0%
            targetDeploy = this.batteryERS > 50 ? 20 : 0;
        } else if (this.engineMode === "conserve") {
            // Strat 9 lift & coast: minimal deployment
            targetDeploy = Math.max(75, this.batteryERS - 8);
        } else {
            // Strat 5 balanced: nominal straightline deploy
            targetDeploy = Math.max(45, this.batteryERS - 32);
        }

        // Phase 2: Heavy braking zone recharge target
        let targetHarvest;
        if (this.engineMode === "conserve") {
            // Heavy kinetic harvesting under braking: surges back to 95-100%
            targetHarvest = Math.min(100, targetDeploy + 42);
        } else if (this.engineMode === "attack") {
            // Minimal braking coast: recharges only 18-22%, staying aggressive
            targetHarvest = Math.min(60, targetDeploy + 20);
        } else {
            // Balanced regen: recovers to 75-85%
            targetHarvest = Math.min(85, targetDeploy + 32);
        }

        let tick = 0;
        const totalTicks = 12;

        this.subLapTimer = setInterval(() => {
            if (this.paused) return;
            tick++;

            const ersModeText = document.getElementById("hudErsModeText");
            const ersBarEl = document.getElementById("hudErsBar");

            if (tick <= 5) {
                // SECTOR 1 & 2: Full Throttle Acceleration / Overtake Deploy down the straight
                const progress = tick / 5;
                this.batteryERS = this.batteryERS + (targetDeploy - this.batteryERS) * 0.45;
                if (this.batteryERS < 1) this.batteryERS = 0;

                if (ersModeText) {
                    if (this.batteryERS === 0) {
                        ersModeText.textContent = "⚠️ CLIPPING (0%)";
                        ersModeText.style.color = "var(--red)";
                    } else if (this.engineMode === "attack") {
                        ersModeText.textContent = "⚡ OVERTAKE BOOST (350kW)";
                        ersModeText.style.color = "var(--red)";
                    } else {
                        ersModeText.textContent = "⚡ DEPLOY (STRAIGHT)";
                        ersModeText.style.color = "var(--cyan)";
                    }
                }

                if (ersBarEl) {
                    ersBarEl.className = "gauge-bar-fill fill-ers ers-deploying" + (this.engineMode === "attack" ? " ers-attack" : "") + (this.batteryERS < 15 ? " ers-critical" : "");
                }
            } else if (tick <= 9) {
                // HEAVY BRAKING ZONE: Turn 1 / Hairpin Deceleration & 350kW MGU-K Regen
                this.batteryERS = this.batteryERS + (targetHarvest - this.batteryERS) * 0.45;

                if (ersModeText) {
                    ersModeText.textContent = "🔋 HARVESTING (BRAKING)";
                    ersModeText.style.color = "#34d399";
                }

                if (ersBarEl) {
                    ersBarEl.className = "gauge-bar-fill fill-ers ers-harvesting";
                }
            } else {
                // CORNER EXIT & TECHNICAL BALANCE
                if (ersModeText) {
                    ersModeText.textContent = this.engineMode === "attack" ? "ATTACK MODE" : (this.engineMode === "conserve" ? "STRAT 9 HARVEST" : "STRAT 5 NOMINAL");
                    ersModeText.style.color = this.engineMode === "attack" ? "var(--red)" : (this.engineMode === "conserve" ? "#34d399" : "var(--cyan)");
                }
                if (ersBarEl) {
                    ersBarEl.className = "gauge-bar-fill fill-ers";
                }
            }

            this.batteryERS = Math.max(0, Math.min(100, this.batteryERS));
            this._updateHUDGauges();

            if (tick >= totalTicks) {
                clearInterval(this.subLapTimer);
                this.subLapTimer = null;
            }
        }, subTickInterval);
    }

    // =========================================================
    // DYNAMIC TIMING GRID: LEAD FLUCTUATION & OVERTAKES ENGINE
    // =========================================================
    _updateDynamicTimingGrid(lapNum) {
        if (!this.liveDrivers || this.liveDrivers.length === 0) return;

        // 1. Calculate tyre degradation and pace for all drivers
        this.liveDrivers.forEach(driver => {
            if (driver.isPlayer) {
                driver.compound = this.tyreCompound;
                driver.tyreWear = this.tyreWear;
                driver.tyreAge = this.tyreAge;
            } else {
                // AI degradation
                const wearRate = this._calcTyreWear(driver.compound, this.currentWeather, driver.aiMode || "balanced");
                driver.tyreWear = Math.max(8, driver.tyreWear - wearRate);
                driver.tyreAge++;
            }

            // Lap time calculation with authentic tyre cliff
            const spec = TYRE_SPECS[driver.compound] || TYRE_SPECS["Medium"];
            let pace = 88.0 + spec.basePaceAdvantage;

            // Wear degradation
            const wearLoss = (100 - driver.tyreWear) * 0.024;
            pace += wearLoss;

            // Non-linear tyre cliff: if tyre wear < cliff threshold, pace plunges!
            if (driver.tyreWear < spec.cliffWearThreshold) {
                const cliffDelta = spec.cliffWearThreshold - driver.tyreWear;
                pace += Math.pow(cliffDelta / 6, 1.7) * 0.65;
            }

            // Weather mismatch penalties
            if (this.currentWeather === "Dry") {
                if (driver.compound === "Intermediate") pace += 2.4;
                else if (driver.compound === "Full Wet") pace += 4.5;
            } else if (this.currentWeather === "Wet") {
                if (["Soft", "Medium", "Hard"].includes(driver.compound)) pace += 7.5; // Slicks in rain
            }

            // Driver mode pace effect
            if (driver.isPlayer) {
                if (this.engineMode === "attack") {
                    pace -= 0.85; // Deploying ERS dump + Attack strat gains pace!
                } else if (this.engineMode === "conserve") {
                    pace += 0.70; // Lift and coast saves rubber but loses time
                }
            }

            // Small stochastic variation
            pace += (Math.random() - 0.5) * 0.25;
            driver.lapTime = Math.round(pace * 1000) / 1000;
            if (driver.lapTime < driver.bestLap) {
                driver.bestLap = driver.lapTime;
            }
        });

        // 2. Lead (P1 vs P2) Dynamics: Gaps can increase AND decrease!
        const leader = this.liveDrivers[0];
        const p2 = this.liveDrivers.length > 1 ? this.liveDrivers[1] : null;

        if (leader && p2) {
            // Check if leader encounters backmarker traffic (laps 14-22 or 38-46)
            let leaderTrafficDelay = 0;
            if (p2.gapToLeader > 2.5 && ((lapNum >= 14 && lapNum <= 22) || (lapNum >= 38 && lapNum <= 46))) {
                leaderTrafficDelay = 0.45 + Math.random() * 0.40;
                leader.lapTime += leaderTrafficDelay;
            }

            const lapDelta = leader.lapTime - p2.lapTime; // positive means P2 is faster!

            if (lapDelta > 0.05) {
                // THE LEAD IS DECREASING! Pursuer is catching the leader!
                const shrink = Math.min(lapDelta * 0.85, p2.gapToLeader - 0.15);
                p2.gapToLeader = Math.max(0.2, p2.gapToLeader - shrink);
                p2.gapTrend = "shrinking";

                // If player is P1 and being caught, warn on radio
                if (leader.isPlayer && p2.gapToLeader <= 1.0 && Math.random() > 0.6) {
                    this._addRadioMessage(`RACE ENGINEER: "Gap behind is down to +${p2.gapToLeader.toFixed(2)}s! ${p2.driver} has DRS. Switch to Strat 1 to defend!"`);
                }
            } else {
                // THE LEAD IS INCREASING! Leader is pulling away!
                p2.gapToLeader += Math.abs(lapDelta) * 0.75;
                p2.gapTrend = "widening";
            }
        }

        // 3. Dynamic On-Track Overtakes (Can happen at any time for P1 or any position)
        for (let i = 1; i < this.liveDrivers.length; i++) {
            const trailing = this.liveDrivers[i];
            const ahead = this.liveDrivers[i - 1];

            // Gap to car ahead
            const gap = i === 1 ? trailing.gapToLeader : Math.max(0.1, trailing.gapToLeader - ahead.gapToLeader);
            trailing.gapToAhead = gap;

            // Overtake condition: within striking distance (gap <= 0.85s) and pace advantage
            const paceAdvantage = ahead.lapTime - trailing.lapTime;
            const tyreAdvantage = ahead.tyreWear < trailing.tyreWear - 10;
            const isStrikingDistance = gap <= 0.85;

            // Probability of an overtake
            let passProb = 0.0;
            if (isStrikingDistance && paceAdvantage > 0.08) {
                passProb += 0.35 + Math.min(0.40, paceAdvantage * 0.45);
            }
            if (isStrikingDistance && tyreAdvantage) {
                passProb += 0.25;
            }
            if (trailing.isPlayer && this.engineMode === "attack" && gap <= 1.0) {
                passProb += 0.40; // Attack mode with ERS dump heavily boosts overtaking!
            }

            if (passProb > 0.30 && Math.random() < passProb) {
                // OVERTAKE OCCURS!
                const oldPosTrailing = trailing.position;
                const oldPosAhead = ahead.position;

                // Swap positions in grid
                this.liveDrivers[i - 1] = trailing;
                this.liveDrivers[i] = ahead;
                trailing.position = oldPosAhead;
                ahead.position = oldPosTrailing;

                // Adjust gaps after overtake
                if (i === 1) {
                    // LEAD CHANGE! P2 overtook P1!
                    trailing.gapToLeader = 0.0;
                    ahead.gapToLeader = 0.28 + Math.random() * 0.25;
                    trailing.isLeadChange = true;
                    this.lastLeader = trailing.driver;

                    pitwallAudio.playRadioChirp();
                    this._addRadioMessage(`📻 RACE CONTROL: LEAD CHANGE ON LAP ${lapNum}! ${trailing.driver} sweeps past ${ahead.driver} into Turn 1 for P1!`);

                    if (trailing.isPlayer) {
                        this.playerPos = 1;
                        this._addRadioMessage(`RACE ENGINEER: "WHAT A MOVE! YOU LEAD THE GRAND PRIX! P1!"`);
                    } else if (ahead.isPlayer) {
                        this.playerPos = 2;
                        this._addRadioMessage(`RACE ENGINEER: "${trailing.driver} made the move into Turn 1. We are P2. Stay close, use DRS!"`);
                    }
                } else {
                    // General overtake down the field
                    const tempGap = trailing.gapToLeader;
                    trailing.gapToLeader = Math.max(0.1, ahead.gapToLeader - 0.25);
                    ahead.gapToLeader = tempGap + 0.25;

                    if (trailing.isPlayer) {
                        this.playerPos = trailing.position;
                        pitwallAudio.playRadioChirp();
                        this._addRadioMessage(`RACE ENGINEER: "Sensational pass, ${this.driverName}! You take P${this.playerPos} from ${ahead.driver}!"`);
                    } else if (ahead.isPlayer) {
                        this.playerPos = ahead.position;
                        this._addRadioMessage(`RACE ENGINEER: "Lost position to ${trailing.driver}! Now running P${this.playerPos}. Re-harvest and attack back."`);
                    } else if (Math.random() > 0.7) {
                        this._addRadioMessage(`RACE CONTROL: Overtake on Lap ${lapNum} — ${trailing.driver} passes ${ahead.driver} for P${trailing.position}`);
                    }
                }
                break; // Process one major overtake per lap to maintain order integrity
            }
        }

        // Re-calculate gaps sequentially from P1 downwards
        let cumulativeGap = 0.0;
        this.liveDrivers.forEach((d, idx) => {
            d.position = idx + 1;
            if (idx === 0) {
                d.gapToLeader = 0.0;
                d.gapToAhead = 0.0;
            } else {
                const prev = this.liveDrivers[idx - 1];
                const delta = Math.max(0.2, (d.lapTime - prev.lapTime) * 0.4 + 0.35);
                cumulativeGap += delta;
                d.gapToLeader = Math.round(cumulativeGap * 1000) / 1000;
                d.gapToAhead = Math.round(delta * 1000) / 1000;
            }
            if (d.isPlayer) {
                this.playerPos = d.position;
            }
        });
    }

    _calcTyreWear(compound, weather, mode) {
        const spec = TYRE_SPECS[compound] || TYRE_SPECS["Medium"];
        let wear = spec.baseWearPerLap;

        // Weather degradation effects
        if (weather === "Dry") {
            if (compound === "Intermediate") wear = spec.dryThermalDestruction || 9.5;
            else if (compound === "Full Wet") wear = spec.dryThermalDestruction || 15.0;
        } else if (weather === "Mixed") {
            if (["Soft", "Medium", "Hard"].includes(compound)) wear *= 1.45;
            else if (compound === "Full Wet") wear = spec.mixedWearPerLap || 5.8;
        } else if (weather === "Wet") {
            if (["Soft", "Medium", "Hard"].includes(compound)) wear *= 1.9;
        }

        // Mode multiplier
        if (mode === "attack") wear *= 1.55;
        else if (mode === "conserve") wear *= 0.65;

        return wear;
    }

    // =========================================================
    // RENDER TIMING TOWER & HUD GAUGES
    // =========================================================
    _renderTimingTower() {
        const towerList = document.getElementById("pitwallTowerList");
        if (!towerList || !this.liveDrivers) return;

        towerList.innerHTML = this.liveDrivers.map(row => {
            const isPlayer = row.isPlayer;
            const compound = row.compound || "Medium";
            const spec = TYRE_SPECS[compound] || TYRE_SPECS["Medium"];
            const tyreClass = spec.colorClass || `tyre-${compound.toLowerCase()}`;
            const gapClass = row.position === 1 ? "leader" : (row.gapTrend === "shrinking" ? "shrinking" : (row.gapTrend === "widening" ? "widening" : ""));
            const gapText = row.position === 1 ? "LEADER" : `+${Number(row.gapToLeader).toFixed(3)}s`;
            const lapTimeStr = row.lapTime ? `${Number(row.lapTime).toFixed(3)}s` : "--";
            const leadHighlight = row.isLeadChange ? "lead-change-highlight" : "";
            row.isLeadChange = false; // Reset highlight

            const penChip = isPlayer && this.penaltyTimeOwed > 0 ? `<span class="tower-driver-pen">+${this.penaltyTimeOwed.toFixed(0)}s PEN</span>` : "";

            return `
                <div class="pitwall-tower-row ${isPlayer ? 'is-player' : ''} ${leadHighlight}">
                    <div class="tower-pos">${row.position}</div>
                    <div class="tower-driver-box">
                        <span class="tower-driver-name">${isPlayer ? '★ ' : ''}${escapeHtml(row.driver)}${penChip}</span>
                        <span class="tower-driver-team">${escapeHtml(row.team)}</span>
                    </div>
                    <div class="tower-gap ${gapClass}">${gapText}</div>
                    <div><span class="tower-tyre-chip ${tyreClass}">${spec.badge}</span></div>
                    <div class="tower-stops">${row.pitStops || 0}</div>
                    <div class="tower-laptime">${lapTimeStr}</div>
                </div>
            `;
        }).join("");
    }

    _updateHUDGauges() {
        const lapEl = document.getElementById("pitwallLapNum");
        if (lapEl) lapEl.textContent = this.currentLap;

        const hudPos = document.getElementById("hudPlayerPos");
        if (hudPos) hudPos.textContent = `P${this.playerPos}`;

        // HUD Tyre Wear Gauge
        const tyreValEl = document.getElementById("hudTyreVal");
        const tyreBarEl = document.getElementById("hudTyreBar");
        const tyreBadgeEl = document.getElementById("hudTyreBadge");
        const spec = TYRE_SPECS[this.tyreCompound] || TYRE_SPECS["Medium"];

        if (tyreValEl) tyreValEl.textContent = `${Math.round(this.tyreWear)}%`;
        if (tyreBarEl) {
            tyreBarEl.style.width = `${Math.round(this.tyreWear)}%`;
            tyreBarEl.className = "gauge-bar-fill " + (this.tyreWear > 60 ? "fill-tyre-good" : (this.tyreWear > 30 ? "fill-tyre-medium" : "fill-tyre-critical"));
        }
        if (tyreBadgeEl) {
            tyreBadgeEl.textContent = spec.badge;
            tyreBadgeEl.className = `tower-tyre-chip ${spec.colorClass}`;
        }

        // HUD ERS Battery Gauge
        const ersValEl = document.getElementById("hudErsVal");
        const ersBarEl = document.getElementById("hudErsBar");
        if (ersValEl) ersValEl.textContent = `${Math.round(this.batteryERS)}%`;
        if (ersBarEl) ersBarEl.style.width = `${Math.round(this.batteryERS)}%`;
    }

    // =========================================================
    // TACTICAL EVENTS (SAFETY CAR, RAIN, UNDERCUT)
    // =========================================================
    _checkForTacticalEvents(lapNum) {
        // 1. Safety Car Event Trigger
        const events = this.raceData.events || [];
        const scEvent = events.find(e => e.type === "safety_car" && Number(e.lap) === Number(lapNum));
        if (scEvent && !this.eventsTriggered.has(`sc_${lapNum}`)) {
            this.eventsTriggered.add(`sc_${lapNum}`);
            this._triggerSafetyCarPrompt(lapNum);
            return;
        }

        // 2. Weather Rain Event Trigger
        const transitions = this.raceData.weather_transitions || [];
        const weatherShift = transitions.find(t => Number(t.lap) === Number(lapNum));
        if (weatherShift && (weatherShift.to_weather === "Wet" || weatherShift.to_weather === "Mixed") && !this.eventsTriggered.has(`rain_${lapNum}`)) {
            this.eventsTriggered.add(`rain_${lapNum}`);
            this._triggerRainPrompt(lapNum, weatherShift.to_weather);
            return;
        }

        // 3. Optimal Undercut Pit Window Trigger (Around lap 16-24 if tyres worn)
        const midpointLap = Math.floor(this.totalLaps * 0.35);
        if (lapNum === midpointLap && this.tyreWear < 48 && !this.eventsTriggered.has("undercut_window")) {
            this.eventsTriggered.add("undercut_window");
            this._triggerUndercutPrompt(lapNum);
            return;
        }
    }

    // TACTICAL DECISION 1: SAFETY CAR DEPLOYED
    _triggerSafetyCarPrompt(lapNum) {
        this.paused = true;
        pitwallAudio.playSafetyCarSiren();

        const pill = document.getElementById("pitwallStatusPill");
        if (pill) {
            pill.textContent = "SAFETY CAR";
            pill.className = "pitwall-status-pill pitwall-status-sc";
        }

        this._addRadioMessage(`RACE ENGINEER: "Safety Car deployed! Keep delta positive. What's the call on pit stop?"`);

        const overlay = document.getElementById("pitwallDecisionModal");
        const content = document.getElementById("pitwallDecisionContent");
        if (!overlay || !content) return;

        overlay.style.display = "flex";
        content.innerHTML = `
            <div class="decision-kicker">🚨 FIA RACE CONTROL · SAFETY CAR DEPLOYED</div>
            <div class="decision-title">TACTICAL CALL: PIT STOP UNDER SAFETY CAR?</div>
            <div class="decision-desc">
                Safety Car is out on <strong>Lap ${lapNum} / ${this.totalLaps}</strong>. Pit-stop delta loss under SC is only <strong>11.5 seconds</strong> (vs 22.8s under green flag conditions).
                You are currently running <strong>P${this.playerPos}</strong> with <strong>${Math.round(this.tyreWear)}%</strong> tyre health on ${this.tyreCompound}s.
            </div>

            <div class="decision-options-grid">
                <button type="button" class="decision-opt-btn" onclick="window.pitwall.applyDecision('sc_box_hard')">
                    <strong>🟡 OPTION A: BOX FOR HARD TYRES</strong>
                    <p>Take the cheap 11s pit stop. Rejoin on fresh Hard compound to run comfortably until the chequered flag.</p>
                </button>

                <button type="button" class="decision-opt-btn" onclick="window.pitwall.applyDecision('sc_stay_out')">
                    <strong>🟢 OPTION B: STAY OUT FOR TRACK POSITION</strong>
                    <p>Track position is king. Inherit higher grid position while rivals pit. Defend aggressively on restart.</p>
                </button>

                <button type="button" class="decision-opt-btn" onclick="window.pitwall.applyDecision('sc_box_soft')">
                    <strong>🔴 OPTION C: AGGRESSIVE SOFT TYRE SPRINT</strong>
                    <p>Box for Soft tyres for maximum grip and overtake pace on the restart, attacking cars ahead immediately.</p>
                </button>
            </div>
        `;
    }

    // TACTICAL DECISION 2: RAIN INCOMING
    _triggerRainPrompt(lapNum, targetWeather) {
        this.paused = true;
        pitwallAudio.playRadioChirp();

        const weatherText = document.getElementById("pitwallWeatherText");
        if (weatherText) weatherText.textContent = `${targetWeather} (Raining)`;

        this._addRadioMessage(`RACE ENGINEER: "Rain falling in sector 2 and 3! Track wetness rising fast. Confirm intermediate tyres!"`);

        const overlay = document.getElementById("pitwallDecisionModal");
        const content = document.getElementById("pitwallDecisionContent");
        if (!overlay || !content) return;

        overlay.style.display = "flex";
        content.innerHTML = `
            <div class="decision-kicker" style="color:var(--cyan);">🌧️ METEOROLOGICAL RADAR ALERT · RAINFALL ON TRACK</div>
            <div class="decision-title">WEATHER SHIFT: BOX FOR INTERMEDIATES?</div>
            <div class="decision-desc">
                A sudden rain cell has hit the circuit on <strong>Lap ${lapNum} / ${this.totalLaps}</strong>. Track wetness is at <strong>52%</strong>. Slicks are losing 3.5s per lap in the wet sectors.
            </div>

            <div class="decision-options-grid">
                <button type="button" class="decision-opt-btn" onclick="window.pitwall.applyDecision('rain_box_inters')">
                    <strong>🌧️ OPTION A: BOX FOR GREEN INTERMEDIATES</strong>
                    <p>Immediately bolt on Intermediate tyres. Optimum grip on wet asphalt, avoid aquaplaning.</p>
                </button>

                <button type="button" class="decision-opt-btn" onclick="window.pitwall.applyDecision('rain_stay_slicks')">
                    <strong>🏎️ OPTION B: BRAVE IT ON SLICKS</strong>
                    <p>Gamble that the shower is brief and the track will dry in 3 laps. Risk high lap time loss or slide.</p>
                </button>
            </div>
        `;
    }

    // TACTICAL DECISION 3: UNDERCUT / OVERCUT CALL
    _triggerUndercutPrompt(lapNum) {
        this.paused = true;
        pitwallAudio.playRadioChirp();

        this._addRadioMessage(`RACE ENGINEER: "Car ahead is struggling for grip. Undercut window is prime right now."`);

        const overlay = document.getElementById("pitwallDecisionModal");
        const content = document.getElementById("pitwallDecisionContent");
        if (!overlay || !content) return;

        overlay.style.display = "flex";
        content.innerHTML = `
            <div class="decision-kicker">⏱️ PIT WINDOW STRATEGY · UNDERCUT WINDOW</div>
            <div class="decision-title">CALL IN FOR UNDERCUT OR EXTEND OVERCUT?</div>
            <div class="decision-desc">
                Lap <strong>${lapNum} / ${this.totalLaps}</strong>: The car in front is losing pace in dirty air. A fresh set of tyres now can gain 1.8s on the out-lap.
            </div>

            <div class="decision-options-grid">
                <button type="button" class="decision-opt-btn" onclick="window.pitwall.applyDecision('undercut_now')">
                    <strong>⚡ OPTION A: TRIGGER UNDERCUT (BOX THIS LAP)</strong>
                    <p>Pit immediately. Push flat out on the out-lap to jump the car ahead as they pit next lap.</p>
                </button>

                <button type="button" class="decision-opt-btn" onclick="window.pitwall.applyDecision('overcut_extend')">
                    <strong>🔄 OPTION B: EXTEND STINT (OVERCUT)</strong>
                    <p>Stay in clean air. Conserve tyres for another 4 laps to capitalize when rivals get trapped in traffic.</p>
                </button>
            </div>
        `;
    }

    // Apply Decision
    applyDecision(choice) {
        pitwallAudio.playModeClick();
        const overlay = document.getElementById("pitwallDecisionModal");
        if (overlay) overlay.style.display = "none";

        if (choice === "sc_box_hard") {
            pitwallAudio.playPitGun();
            this.tyreCompound = "Hard";
            this.tyreWear = 100;
            this.tyreAge = 1;
            this.batteryERS = 100;
            this.decisionsMade.push("Safety Car: Boxed for Hard tyres (Masterclass cheap pit stop)");
            this.tacticalBonusDP += 1;
            this._addRadioMessage(`RACE ENGINEER: "Copy that, box now box now! Hard tyres fitted. Great call on the cheap stop."`);
        } else if (choice === "sc_stay_out") {
            this.decisionsMade.push("Safety Car: Stayed out for track position");
            this.playerPos = Math.max(1, this.playerPos - 1);
            this._addRadioMessage(`RACE ENGINEER: "Understood, staying out! We inherit track position. Defend on restart."`);
        } else if (choice === "sc_box_soft") {
            pitwallAudio.playPitGun();
            this.tyreCompound = "Soft";
            this.tyreWear = 100;
            this.tyreAge = 1;
            this.batteryERS = 100;
            this.decisionsMade.push("Safety Car: Boxed for Soft sprint tyres");
            this.tacticalBonusDP += 1;
            this._addRadioMessage(`RACE ENGINEER: "Box now for Softs! Maximum attack on restart, you have fresh rubber advantage!"`);
        } else if (choice === "rain_box_inters") {
            pitwallAudio.playPitGun();
            this.tyreCompound = "Intermediate";
            this.tyreWear = 100;
            this.tyreAge = 1;
            this.batteryERS = 100;
            this.decisionsMade.push("Weather: Switched to Intermediates in wet conditions");
            this.tacticalBonusDP += 1;
            this._addRadioMessage(`RACE ENGINEER: "Green Inters on! Brilliant call, you are 3s faster than anyone on slicks."`);
        } else if (choice === "rain_stay_slicks") {
            this.decisionsMade.push("Weather: Braved out on slicks");
            this.tyreWear = Math.max(15, this.tyreWear - 12);
            this._addRadioMessage(`RACE ENGINEER: "Copy, staying on slicks. Keep it on the island, very slippery in turn 4."`);
        } else if (choice === "undercut_now") {
            pitwallAudio.playPitGun();
            this.tyreCompound = "Hard";
            this.tyreWear = 100;
            this.tyreAge = 1;
            this.batteryERS = 100;
            this.playerPos = Math.max(1, this.playerPos - 1);
            this.decisionsMade.push("Tactics: Successfully executed Undercut");
            this.tacticalBonusDP += 1;
            this._addRadioMessage(`RACE ENGINEER: "Purple out-lap! Undercut complete, we jumped them out of the pit lane!"`);
        } else if (choice === "overcut_extend") {
            this.decisionsMade.push("Tactics: Extended stint for overcut");
            this._addRadioMessage(`RACE ENGINEER: "Copy, push in clean air. Conserve rubber and box in 4 laps."`);
        }

        // Reset Safety car status pill
        const pill = document.getElementById("pitwallStatusPill");
        if (pill) {
            pill.textContent = "GREEN FLAG";
            pill.className = "pitwall-status-pill pitwall-status-green";
        }

        this.paused = false;
    }

    // Engine Mode Toggles
    setEngineMode(mode) {
        this.engineMode = mode;
        pitwallAudio.playModeClick();

        document.querySelectorAll(".pitwall-mode-btn").forEach(btn => btn.classList.remove("active"));
        const btn = document.getElementById(`btnMode${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
        if (btn) btn.classList.add("active");

        const ersModeText = document.getElementById("hudErsModeText");

        if (mode === "attack") {
            if (ersModeText) {
                ersModeText.textContent = "⚡ OVERTAKE (350kW)";
                ersModeText.style.color = "var(--red)";
            }
            this._addRadioMessage(`RACE ENGINEER: "Engine Mode 1 confirmed. Full 350kW MGU-K deploy. Dump battery to pass!"`);
        } else if (mode === "conserve") {
            if (ersModeText) {
                ersModeText.textContent = "🔋 HARVEST (STRAT 9)";
                ersModeText.style.color = "#34d399";
            }
            this._addRadioMessage(`RACE ENGINEER: "Strat 9 confirmed. Lift and coast into heavy braking zones, saving rubber & recharging."`);
        } else {
            if (ersModeText) {
                ersModeText.textContent = "⚖ BALANCED (STRAT 5)";
                ersModeText.style.color = "var(--cyan)";
            }
            this._addRadioMessage(`RACE ENGINEER: "Strat 5 nominal. Managing tyre degradation and hybrid deployment."`);
        }
    }

    // Manual Pit Stop Call
    triggerManualPitCall() {
        if (this.pendingPit) return;
        this.pendingPit = true;
        pitwallAudio.playRadioChirp();

        const btnText = document.getElementById("pitCallBtnText");
        if (btnText) btnText.textContent = "BOXING THIS LAP [CONFIRMED]";
        const btn = document.getElementById("btnPitCall");
        if (btn) btn.classList.add("pending");

        this._addRadioMessage(`RACE ENGINEER: "Box box, box box! Confirming pit stop at end of this lap. Crew is ready with fresh tyres."`);
    }

    // Audio & Speed Toggles
    toggleAudio() {
        const muted = pitwallAudio.toggleMute();
        const btn = document.getElementById("btnAudioToggle");
        if (btn) btn.textContent = muted ? "🔇 MUTED" : "🔊 RADIO ON";
    }

    togglePause() {
        this.paused = !this.paused;
        const btn = document.getElementById("btnPlayPause");
        if (btn) btn.textContent = this.paused ? "PLAY ▶" : "PAUSE ||";
    }

    setSpeed(spd) {
        this.speed = spd;
        document.querySelectorAll(".pitwall-ctrl-btn").forEach(b => {
            if (["btnSpeed1", "btnSpeed2", "btnSpeed5"].includes(b.id)) b.classList.remove("active");
        });
        const activeBtn = document.getElementById(`btnSpeed${spd}`);
        if (activeBtn) activeBtn.classList.add("active");

        if (!this.paused) {
            this._startLoop();
        }
    }

    skipToEnd() {
        this.currentLap = this.totalLaps;
        this._stepLap(this.totalLaps);
        this._finishRace();
    }

    // Add Live Radio Log
    _addRadioMessage(msg) {
        const ticker = document.getElementById("pitwallTickerText");
        if (ticker) {
            ticker.textContent = msg;
        }
    }

    // Finish Race & Show Chequered Flag
    async _finishRace() {
        if (this.timer) clearInterval(this.timer);
        if (this.subLapTimer) clearInterval(this.subLapTimer);
        this.paused = true;
        pitwallAudio.playChequeredFlag();

        const pill = document.getElementById("pitwallStatusPill");
        if (pill) {
            pill.textContent = "CHEQUERED FLAG";
            pill.className = "pitwall-status-pill pitwall-status-finish";
        }

        this._addRadioMessage(`RACE ENGINEER: "P${this.playerPos}! Chequered flag, chequered flag! What an extraordinary race from the pit wall!"`);

        const overlay = document.getElementById("pitwallFinishModal");
        const content = document.getElementById("pitwallFinishContent");
        if (!overlay || !content) return;

        let penaltyHtml = "";
        if (this.penaltyTimeOwed > 0) {
            const oldPos = this.playerPos;
            const playerD = this.liveDrivers.find(d => d.isPlayer);
            if (playerD) {
                playerD.gapToLeader += this.penaltyTimeOwed;
            }
            this.liveDrivers.sort((a, b) => a.gapToLeader - b.gapToLeader);
            this.liveDrivers.forEach((d, idx) => {
                d.position = idx + 1;
                if (d.isPlayer) this.playerPos = d.position;
            });
            penaltyHtml = `
                <div style="background:rgba(239,68,68,0.18); border:1px solid #ef4444; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:12px; color:#fca5a5; font-family:'Orbitron', monospace; text-align:left;">
                    ⚠️ <strong>FIA STEWARDS TIME PENALTY:</strong> +${this.penaltyTimeOwed.toFixed(0)}s penalty added to race time. Classified P${this.playerPos} (was P${oldPos}).
                </div>
            `;
        }

        const fastestLap = this.raceData.fastest_lap || {};
        const isPodium = this.playerPos <= 3;
        const isWin = this.playerPos === 1;

        overlay.style.display = "flex";
        content.innerHTML = `
            <div class="finish-chequered-icon">🏁</div>
            <div class="finish-title">${isWin ? "P1 · RACE VICTORY!" : (isPodium ? `P${this.playerPos} · PODIUM FINISH!` : `P${this.playerPos} · GRAND PRIX FINISH`)}</div>
            <div class="finish-subtitle">2026 ${escapeHtml(this.raceData.circuit || "Grand Prix")} · Tactical Debrief</div>

            ${penaltyHtml}

            <div class="finish-result-stats">
                <div class="finish-stat-box">
                    <span>FINISHING POSITION</span>
                    <strong>P${this.playerPos}</strong>
                </div>
                <div class="finish-stat-box">
                    <span>TACTICAL GRADE</span>
                    <strong style="color:#5ee7a1;">GRADE A+</strong>
                </div>
                <div class="finish-stat-box">
                    <span>FASTEST LAP</span>
                    <strong style="color:#d946ef; font-size:14px;">${escapeHtml(fastestLap.driver || "Verstappen")}</strong>
                </div>
                <div class="finish-stat-box">
                    <span>BONUS DP EARNED</span>
                    <strong style="color:var(--gold);">+${this.tacticalBonusDP} DP</strong>
                </div>
            </div>

            <div class="finish-reward-card">
                <div>
                    <strong>PIT-WALL TACTICAL REWARD: +${this.tacticalBonusDP} DEVELOPMENT POINTS</strong>
                    <div style="font-size:11px; color:rgba(255,255,255,0.7); margin-top:3px;">
                        ${this.decisionsMade.length > 0 ? this.decisionsMade.join(" · ") : "Executed dynamic 350kW ERS deployment and compound tyre management"}
                    </div>
                </div>
                <div style="font-size:18px; color:var(--gold);">
                    ★ MASTERCLASS
                </div>
            </div>

            <div class="finish-actions">
                <button type="button" class="btn-finish-return" onclick="window.pitwall.completeAndReturn()">
                    APPLY RESULT &amp; RETURN TO CAREER &rarr;
                </button>
            </div>
        `;
    }

    // =========================================================
    // LIVE STEWARDS, TRACK LIMITS & PENALTY INCIDENT MONITOR
    // =========================================================
    _checkLiveStewardIncidents(lapNum) {
        // 1. Process any pending investigation resolution (2 laps after incident)
        if (this.pendingInvestigation && lapNum >= this.pendingInvestigation.resolveLap) {
            const inv = this.pendingInvestigation;
            this.pendingInvestigation = null;
            if (inv.outcomePenalty) {
                this.penaltyTimeOwed += 5.0;
                this.activePenalties.push({
                    type: "5-Second Time Penalty",
                    reason: `Causing a collision with ${inv.opponent}`,
                    served: false
                });
                this._showStewardBanner(`FIA STEWARDS: 5-SECOND PENALTY FOR CAR ${this.playerPos}`, "penalty");
                pitwallAudio.playSafetyCarSiren();
                this._addRadioMessage(`RACE ENGINEER: "Stewards have confirmed a 5-second penalty for that incident with ${inv.opponent}. We can serve it in the pit stop."`);
            } else {
                this._showStewardBanner(`FIA STEWARDS: NO FURTHER ACTION — RACING INCIDENT`, "green");
                setTimeout(() => this._hideStewardBanner(), 6000);
                this._addRadioMessage(`RACE ENGINEER: "Steward decision in: No further action on the incident with ${inv.opponent}. All clear, keep pushing!"`);
            }
        }

        // 2. Track limits check for player
        const playerD = this.liveDrivers.find(p => p.isPlayer);
        const playerGap = playerD ? playerD.gapToLeader : 0;
        const isBattling = this.playerPos > 1 && this.liveDrivers.some(d => !d.isPlayer && Math.abs(d.gapToLeader - playerGap) <= 0.85);

        let tlChance = 0.04;
        if (this.engineMode === "attack") tlChance += 0.08;
        if (isBattling) tlChance += 0.05;
        if (this.engineMode === "conserve") tlChance = 0.01;

        if (lapNum - this.lastTrackLimitLap >= 4 && Math.random() < tlChance && this.trackLimitsStrikes < 3) {
            this.trackLimitsStrikes++;
            this.lastTrackLimitLap = lapNum;
            const turn = [4, 9, 11, 13, 19][Math.floor(Math.random() * 5)];

            if (this.trackLimitsStrikes === 1) {
                this._showStewardBanner(`TRACK LIMITS WARNING 1/3 (TURN ${turn})`, "warning");
                pitwallAudio.playRadioChirp();
                this._addRadioMessage(`RACE ENGINEER: "Notice from race control: Track limits at Turn ${turn}. Warning 1 of 3."`);
            } else if (this.trackLimitsStrikes === 2) {
                this._showStewardBanner(`BLACK & WHITE FLAG — TRACK LIMITS 2/3`, "warning");
                pitwallAudio.playRadioChirp();
                this._addRadioMessage(`RACE ENGINEER: "Black & White flag for track limits! Final warning before a penalty, keep it inside the white lines."`);
            } else if (this.trackLimitsStrikes >= 3) {
                this.penaltyTimeOwed += 5.0;
                this.activePenalties.push({
                    type: "5-Second Time Penalty",
                    reason: "Track limits violations (Multiple breaches)",
                    served: false
                });
                this._showStewardBanner(`FIA STEWARDS: 5-SECOND TIME PENALTY`, "penalty");
                pitwallAudio.playSafetyCarSiren();
                this._addRadioMessage(`RACE ENGINEER: "That is a 5-second time penalty for track limits breaches. We have to serve 5s at the next pit stop or add it at the flag."`);
            }
        }

        // 3. Close wheel-to-wheel contact investigation trigger
        if (!this.pendingInvestigation && isBattling && Math.random() < 0.05 && lapNum < this.totalLaps - 3) {
            const oppDriver = this.liveDrivers.find(d => !d.isPlayer && Math.abs(d.gapToLeader - playerGap) <= 0.85)?.driver || "Car ahead";
            const outcomePenalty = Math.random() < 0.50;
            this.pendingInvestigation = {
                opponent: oppDriver,
                resolveLap: lapNum + 2,
                outcomePenalty: outcomePenalty
            };
            this._showStewardBanner(`FIA STEWARDS: UNDER INVESTIGATION — INCIDENT WITH ${oppDriver.toUpperCase()}`, "investigation");
            pitwallAudio.playRadioChirp();
            this._addRadioMessage(`RACE CONTROL: Incident involving Car ${this.playerPos} and ${oppDriver} under investigation by FIA Stewards.`);
        }
    }

    _showStewardBanner(text, type = "warning") {
        const el = document.getElementById("pitwallStewardAlert");
        if (!el) return;
        el.textContent = text;
        el.className = `pitwall-steward-pill pitwall-steward-${type}`;
        el.style.display = "inline-flex";
    }

    _hideStewardBanner() {
        const el = document.getElementById("pitwallStewardAlert");
        if (el) el.style.display = "none";
    }

    async completeAndReturn() {
        this.close();
        await loadCareerDashboard();
    }

    close() {
        if (this.timer) clearInterval(this.timer);
        if (this.subLapTimer) clearInterval(this.subLapTimer);
        this.active = false;
        const modal = document.getElementById("pitwallModal");
        if (modal) modal.style.display = "none";
    }
}

export const pitwall = new PitwallController();
if (typeof window !== "undefined") {
    window.pitwall = pitwall;
}
