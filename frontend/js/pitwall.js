/* =========================================================
   PIT-WALL TACTICAL COMMAND CENTER CONTROLLER
   Interactive F1 Race Director, Engine Modes & Radio
========================================================= */

import { API_BASE_URL, getMyTeam } from "./config.js";
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { pitwallAudio } from "./pitwallAudio.js";
import { loadCareerDashboard } from "./career.js";

class PitwallController {
    constructor() {
        this.active = false;
        this.raceData = null;
        this.currentLap = 1;
        this.totalLaps = 57;
        this.speed = 1; // 1x = 1000ms, 2x = 500ms, 5x = 200ms
        this.timer = null;
        this.paused = false;

        // Tactical Pilot State
        this.engineMode = "balanced"; // "attack" | "balanced" | "conserve"
        this.tyreCompound = "Medium";
        this.tyreWear = 100; // 100% -> 0%
        this.batteryERS = 85; // 0% -> 100%
        this.driverId = null;
        this.driverName = "Driver";
        this.myTeam = "Constructor";
        this.playerPos = 1;
        this.pendingPit = false;
        this.pitNextCompound = "Hard";

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

            // Derive starting compound from strategy or default to Medium
            const playerStrat = (this.raceData.strategies || []).find(s => s.driver_id === this.driverId || s.driver === this.driverName);
            if (playerStrat && Array.isArray(playerStrat.stints) && playerStrat.stints.length > 0) {
                this.tyreCompound = playerStrat.stints[0].compound || "Medium";
            } else {
                this.tyreCompound = "Medium";
            }
            this.tyreWear = 100;
            this.batteryERS = 90;
            this.engineMode = "balanced";
            this.pendingPit = false;

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
                    Connecting to FIA Race Control &amp; ${escapeHtml(this.myTeam)} Engine Sensors
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
        const weather = this.raceData.weather || "Dry";

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
                            <div class="pitwall-circuit-sub">${escapeHtml(country)} · 2026 World Championship</div>
                        </div>
                    </div>

                    <div id="pitwallStatusPill" class="pitwall-status-pill pitwall-status-green">
                        GREEN FLAG
                    </div>

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
                                <div class="pitwall-pilot-meta">${escapeHtml(this.myTeam)} · CAR #1</div>
                            </div>
                            <div class="pitwall-pilot-pos-box">
                                <div class="pitwall-pilot-pos-label">TRACK POSITION</div>
                                <div class="pitwall-pilot-pos-num" id="hudPlayerPos">P--</div>
                            </div>
                        </div>

                        <!-- Gauges: Tyre Health & Battery ERS -->
                        <div class="pitwall-gauges-grid">
                            <div class="pitwall-gauge-box">
                                <div class="gauge-title">
                                    <span>TYRE HEALTH</span>
                                    <span id="hudTyreBadge" class="tower-tyre-chip tyre-medium">M</span>
                                </div>
                                <div class="gauge-val" id="hudTyreVal">100%</div>
                                <div class="gauge-bar-track">
                                    <div class="gauge-bar-fill fill-tyre-good" id="hudTyreBar" style="width:100%;"></div>
                                </div>
                            </div>

                            <div class="pitwall-gauge-box">
                                <div class="gauge-title">
                                    <span>ERS BATTERY (350kW)</span>
                                    <span id="hudErsModeText" style="color:var(--cyan); font-weight:700;">DEPLOY</span>
                                </div>
                                <div class="gauge-val" id="hudErsVal">85%</div>
                                <div class="gauge-bar-track">
                                    <div class="gauge-bar-fill fill-ers" id="hudErsBar" style="width:85%;"></div>
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
                                    <strong>⚡ ATTACK</strong>
                                    <small>+Pace &amp; Pass / High Wear</small>
                                </button>
                                <button type="button" class="pitwall-mode-btn mode-balanced active" id="btnModeBalanced" onclick="window.pitwall.setEngineMode('balanced')">
                                    <strong>⚖ BALANCED</strong>
                                    <small>Nominal Pace &amp; Tyre Target</small>
                                </button>
                                <button type="button" class="pitwall-mode-btn mode-conserve" id="btnModeConserve" onclick="window.pitwall.setEngineMode('conserve')">
                                    <strong>🛡 CONSERVE</strong>
                                    <small>-40% Tyre Wear / Recharges ERS</small>
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

        this._updateLapView(1);
    }

    _startLoop() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = Math.max(100, 1000 / this.speed);

        this.timer = setInterval(() => {
            if (this.paused) return;

            if (this.currentLap < this.totalLaps) {
                this.currentLap++;
                this._stepLap(this.currentLap);
            } else {
                clearInterval(this.timer);
                this._finishRace();
            }
        }, intervalMs);
    }

    _stepLap(lapNum) {
        // Update Tyre Wear and ERS battery dynamically
        if (this.engineMode === "attack") {
            this.tyreWear = Math.max(12, this.tyreWear - 2.4);
            this.batteryERS = Math.max(8, this.batteryERS - 11);
        } else if (this.engineMode === "conserve") {
            this.tyreWear = Math.max(12, this.tyreWear - 0.85);
            this.batteryERS = Math.min(100, this.batteryERS + 14);
        } else {
            this.tyreWear = Math.max(12, this.tyreWear - 1.4);
            this.batteryERS = Math.min(95, Math.max(25, this.batteryERS + (Math.random() > 0.5 ? 4 : -4)));
        }

        // Process scheduled pit stop
        if (this.pendingPit) {
            this.pendingPit = false;
            pitwallAudio.playPitGun();
            this.tyreCompound = this.pitNextCompound || "Hard";
            this.tyreWear = 100;
            this.batteryERS = 100;
            this._addRadioMessage(`RACE ENGINEER: "Clean stop! 2.3 seconds. Out out out! Mind the white line on exit."`);
            const btn = document.getElementById("pitCallBtnText");
            if (btn) btn.textContent = "BOX THIS LAP [CALL IN]";
            const pitBtn = document.getElementById("btnPitCall");
            if (pitBtn) pitBtn.classList.remove("pending");
        }

        this._updateLapView(lapNum);
        this._checkForTacticalEvents(lapNum);
    }

    _updateLapView(lapNum) {
        const lapEl = document.getElementById("pitwallLapNum");
        if (lapEl) lapEl.textContent = lapNum;

        // HUD Tyre Wear
        const tyreValEl = document.getElementById("hudTyreVal");
        const tyreBarEl = document.getElementById("hudTyreBar");
        const tyreBadgeEl = document.getElementById("hudTyreBadge");
        if (tyreValEl) tyreValEl.textContent = `${Math.round(this.tyreWear)}%`;
        if (tyreBarEl) {
            tyreBarEl.style.width = `${Math.round(this.tyreWear)}%`;
            tyreBarEl.className = "gauge-bar-fill " + (this.tyreWear > 60 ? "fill-tyre-good" : (this.tyreWear > 30 ? "fill-tyre-medium" : "fill-tyre-critical"));
        }
        if (tyreBadgeEl) {
            tyreBadgeEl.textContent = this.tyreCompound.charAt(0);
            tyreBadgeEl.className = `tower-tyre-chip tyre-${this.tyreCompound.toLowerCase()}`;
        }

        // HUD ERS Battery
        const ersValEl = document.getElementById("hudErsVal");
        const ersBarEl = document.getElementById("hudErsBar");
        if (ersValEl) ersValEl.textContent = `${Math.round(this.batteryERS)}%`;
        if (ersBarEl) ersBarEl.style.width = `${Math.round(this.batteryERS)}%`;

        // Update Timing Tower Standings
        const lapHistory = this.raceData.lap_history || [];
        const lapSnap = lapHistory.find(l => Number(l.lap) === Number(lapNum));
        const standings = lapSnap && Array.isArray(lapSnap.standings) ? lapSnap.standings : (this.raceData.classification || []);

        const towerList = document.getElementById("pitwallTowerList");
        if (towerList && standings.length) {
            towerList.innerHTML = standings.map((row, idx) => {
                const pos = row.position || (idx + 1);
                const isPlayer = String(row.driver).toLowerCase() === String(this.driverName).toLowerCase();
                if (isPlayer) {
                    this.playerPos = pos;
                    const hudPos = document.getElementById("hudPlayerPos");
                    if (hudPos) hudPos.textContent = `P${pos}`;
                }

                const gapText = pos === 1 ? "LEADER" : (row.gap_to_leader ? `+${Number(row.gap_to_leader).toFixed(3)}s` : "+0.000s");
                const compound = isPlayer ? this.tyreCompound : (row.compound || "Medium");
                const tyreClass = `tyre-${compound.toLowerCase()}`;
                const lapTimeStr = row.lap_time ? `${Number(row.lap_time).toFixed(3)}s` : "--";

                return `
                    <div class="pitwall-tower-row ${isPlayer ? 'is-player' : ''}">
                        <div class="tower-pos">${pos}</div>
                        <div class="tower-driver-box">
                            <span class="tower-driver-name">${isPlayer ? '★ ' : ''}${escapeHtml(row.driver || 'Driver')}</span>
                            <span class="tower-driver-team">${escapeHtml(row.team || '')}</span>
                        </div>
                        <div class="tower-gap ${pos === 1 ? 'leader' : ''}">${gapText}</div>
                        <div><span class="tower-tyre-chip ${tyreClass}">${compound.charAt(0)}</span></div>
                        <div class="tower-stops">${row.pit_stops || 0}</div>
                        <div class="tower-laptime">${lapTimeStr}</div>
                    </div>
                `;
            }).join("");
        }
    }

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

        // 3. Optimal Undercut Pit Window Trigger (Around lap 18-24 if tyres worn)
        const midpointLap = Math.floor(this.totalLaps * 0.38);
        if (lapNum === midpointLap && this.tyreWear < 45 && !this.eventsTriggered.has("undercut_window")) {
            this.eventsTriggered.add("undercut_window");
            this._triggerUndercutPrompt(lapNum);
            return;
        }

        // Minor lap ticker incident notifications
        const lapEvent = events.find(e => e.lap === lapNum && e.type !== "safety_car");
        if (lapEvent) {
            if (lapEvent.type === "overtake") {
                this._addRadioMessage(`RACE CONTROL: Overtake on Lap ${lapNum} — ${lapEvent.driver} passed ${lapEvent.overtaken_driver} for P${lapEvent.to_position}`);
            } else if (lapEvent.type === "pit_stop") {
                this._addRadioMessage(`PIT LANE: ${lapEvent.driver} (${lapEvent.team}) in the pit box for tyres.`);
            } else if (lapEvent.type === "driver_mistake") {
                this._addRadioMessage(`YELLOW FLAG SECTOR 2: Mistake for ${lapEvent.driver}, lost +${lapEvent.time_loss}s.`);
            }
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
                A sudden rain cell has hit the circuit on <strong>Lap ${lapNum} / ${this.totalLaps}</strong>. Track wetness is at <strong>52%</strong>. Slicks are losing 3.2s per lap in the wet sectors.
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
            this.decisionsMade.push("Safety Car: Boxed for Soft sprint tyres");
            this.tacticalBonusDP += 1;
            this._addRadioMessage(`RACE ENGINEER: "Box now for Softs! Maximum attack on restart, you have fresh rubber advantage!"`);
        } else if (choice === "rain_box_inters") {
            pitwallAudio.playPitGun();
            this.tyreCompound = "Intermediate";
            this.tyreWear = 100;
            this.decisionsMade.push("Weather: Switched to Intermediates in wet conditions");
            this.tacticalBonusDP += 1;
            this._addRadioMessage(`RACE ENGINEER: "Green Inters on! Brilliant call, you are 3s faster than anyone on slicks."`);
        } else if (choice === "rain_stay_slicks") {
            this.decisionsMade.push("Weather: Braved out on slicks");
            this.tyreWear = Math.max(15, this.tyreWear - 10);
            this._addRadioMessage(`RACE ENGINEER: "Copy, staying on slicks. Keep it on the island, very slippery in turn 4."`);
        } else if (choice === "undercut_now") {
            pitwallAudio.playPitGun();
            this.tyreCompound = "Hard";
            this.tyreWear = 100;
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
            if (ersModeText) { ersModeText.textContent = "OVERTAKE"; ersModeText.style.color = "var(--red)"; }
            this._addRadioMessage(`RACE ENGINEER: "Engine Mode 1 confirmed. Full power. Attack car ahead."`);
        } else if (mode === "conserve") {
            if (ersModeText) { ersModeText.textContent = "HARVEST"; ersModeText.style.color = "#34d399"; }
            this._addRadioMessage(`RACE ENGINEER: "Strat 9 confirmed. Lift and coast, saving rubber and battery."`);
        } else {
            if (ersModeText) { ersModeText.textContent = "BALANCED"; ersModeText.style.color = "var(--cyan)"; }
            this._addRadioMessage(`RACE ENGINEER: "Strat 5 nominal. Managing gap."`);
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

        this._addRadioMessage(`RACE ENGINEER: "Box box, box box! Confirming pit stop at end of this lap. Crew is ready."`);
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
        this._updateLapView(this.totalLaps);
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
        this.paused = true;
        pitwallAudio.playChequeredFlag();

        const pill = document.getElementById("pitwallStatusPill");
        if (pill) {
            pill.textContent = "CHEQUERED FLAG";
            pill.className = "pitwall-status-pill pitwall-status-finish";
        }

        this._addRadioMessage(`RACE ENGINEER: "P${this.playerPos}! Chequered flag, chequered flag! What a race from the pit wall!"`);

        const overlay = document.getElementById("pitwallFinishModal");
        const content = document.getElementById("pitwallFinishContent");
        if (!overlay || !content) return;

        const classification = this.raceData.classification || [];
        const fastestLap = this.raceData.fastest_lap || {};
        const isPodium = this.playerPos <= 3;
        const isWin = this.playerPos === 1;

        overlay.style.display = "flex";
        content.innerHTML = `
            <div class="finish-chequered-icon">🏁</div>
            <div class="finish-title">${isWin ? "P1 · RACE VICTORY!" : (isPodium ? `P${this.playerPos} · PODIUM FINISH!` : `P${this.playerPos} · GRAND PRIX FINISH`)}</div>
            <div class="finish-subtitle">2026 ${escapeHtml(this.raceData.circuit || "Grand Prix")} · Tactical Debrief</div>

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
                        ${this.decisionsMade.length > 0 ? this.decisionsMade.join(" · ") : "Executed flawless engine and tyre management strategy"}
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

    async completeAndReturn() {
        this.close();
        await loadCareerDashboard();
    }

    close() {
        if (this.timer) clearInterval(this.timer);
        this.active = false;
        const modal = document.getElementById("pitwallModal");
        if (modal) modal.style.display = "none";
    }
}

export const pitwall = new PitwallController();
if (typeof window !== "undefined") {
    window.pitwall = pitwall;
}
