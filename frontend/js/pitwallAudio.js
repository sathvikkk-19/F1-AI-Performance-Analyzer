/* =========================================================
   PIT-WALL AUDIO SYNTHESIZER (WEB AUDIO API)
   Zero external dependencies — authentic procedural F1 SFX
========================================================= */

class PitwallAudio {
    constructor() {
        this.ctx = null;
        this.muted = localStorage.getItem("f1_pitwall_muted") === "true";
    }

    _initCtx() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume();
        }
    }

    isMuted() {
        return this.muted;
    }

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem("f1_pitwall_muted", this.muted ? "true" : "false");
        return this.muted;
    }

    // Classic F1 Team Radio Beep / Chirp
    playRadioChirp() {
        if (this.muted) return;
        try {
            this._initCtx();
            if (!this.ctx) return;

            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = "sine";
            // Two-tone rapid burst (880Hz to 1320Hz)
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1320, now + 0.05);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.18);
        } catch (e) {
            console.warn("Audio error:", e);
        }
    }

    // Pneumatic Air Gun Whir during Pit Stop
    playPitGun() {
        if (this.muted) return;
        try {
            this._initCtx();
            if (!this.ctx) return;

            const now = this.ctx.currentTime;
            // Rapid pulse burst mimicking wheel gun
            for (let i = 0; i < 4; i++) {
                const burstTime = now + (i * 0.08);
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(240, burstTime);
                osc.frequency.exponentialRampToValueAtTime(80, burstTime + 0.06);

                gain.gain.setValueAtTime(0.12, burstTime);
                gain.gain.exponentialRampToValueAtTime(0.001, burstTime + 0.06);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(burstTime);
                osc.stop(burstTime + 0.06);
            }
        } catch (e) {
            console.warn("Audio error:", e);
        }
    }

    // Safety Car / Warning Siren (Alternating tone)
    playSafetyCarSiren() {
        if (this.muted) return;
        try {
            this._initCtx();
            if (!this.ctx) return;

            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = "triangle";
            osc.frequency.setValueAtTime(620, now);
            osc.frequency.setValueAtTime(440, now + 0.18);
            osc.frequency.setValueAtTime(620, now + 0.36);
            osc.frequency.setValueAtTime(440, now + 0.54);

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.72);
        } catch (e) {
            console.warn("Audio error:", e);
        }
    }

    // Engine Mode Toggle / Mode Change Beep
    playModeClick() {
        if (this.muted) return;
        try {
            this._initCtx();
            if (!this.ctx) return;

            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.07);

            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.07);
        } catch (e) {
            console.warn("Audio error:", e);
        }
    }

    // Chequered Flag / Victory Fanfare
    playChequeredFlag() {
        if (this.muted) return;
        try {
            this._initCtx();
            if (!this.ctx) return;

            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            const now = this.ctx.currentTime;

            notes.forEach((freq, index) => {
                const noteTime = now + (index * 0.12);
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, noteTime);

                gain.gain.setValueAtTime(0.15, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(noteTime);
                osc.stop(noteTime + 0.35);
            });
        } catch (e) {
            console.warn("Audio error:", e);
        }
    }
}

export const pitwallAudio = new PitwallAudio();
