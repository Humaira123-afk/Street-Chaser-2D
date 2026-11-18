export class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxEnabled = true;
  private voiceEnabled = true;
  private musicEnabled = true;
  private musicTimer: number | null = null;
  private stepIndex = 0;
  private lastNormalVoiceMs = 0;
  private runPhraseIdx = 0;
  private cachedVoice: SpeechSynthesisVoice | null = null;

  setSettings(sfx: boolean, music: boolean, voice = true) {
    this.sfxEnabled = sfx;
    this.voiceEnabled = voice;
    this.musicEnabled = music;
    if (!music) {
      this.stopMusic();
    }
    if (!voice) {
      this.stopVoices();
    }
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.ctx = new Ctx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    if (this.cachedVoice) return this.cachedVoice;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    this.cachedVoice =
      voices.find((v) => v.lang.startsWith('en') && /google|natural|samantha|daniel|alex/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];
    return this.cachedVoice;
  }

  unlock() {
    this.ensureCtx();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.pickVoice();
    }
  }

  stopVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore speech cancel errors
      }
    }
  }

  speak(
    text: string,
    priority: 'high' | 'normal' = 'normal',
    pitch = 1.05,
    rate = 1.15
  ) {
    if (!this.voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    try {
      const synth = window.speechSynthesis;
      const now = performance.now();
      if (priority === 'high') {
        synth.cancel();
      } else {
        if (synth.speaking || now - this.lastNormalVoiceMs < 4200) {
          return;
        }
      }
      this.lastNormalVoiceMs = now;
      const utt = new SpeechSynthesisUtterance(text);
      const v = this.pickVoice();
      if (v) utt.voice = v;
      utt.lang = 'en-US';
      utt.pitch = pitch;
      utt.rate = rate;
      utt.volume = 0.92;
      synth.speak(utt);
    } catch {
      // ignore speech synthesis restrictions
    }
  }

  playStartVoice(role: 'runner' | 'chaser') {
    if (role === 'runner') {
      this.speak('Run! Escape the Hunter!', 'high', 1.08, 1.16);
    } else {
      this.speak('Hunt begins! Catch the runners!', 'high', 0.95, 1.12);
    }
  }

  playRunVoice(kind: 'sprint' | 'dash' = 'sprint') {
    const cues =
      kind === 'dash'
        ? ['Dash! Keep running!', 'Go, go, go!', 'Sprint away!']
        : ['Run! Keep moving!', 'Run faster!', 'Stay ahead!', 'Keep running!'];
    const phrase = cues[this.runPhraseIdx % cues.length];
    this.runPhraseIdx++;
    this.speak(phrase, 'normal', 1.12, 1.2);
  }

  playRevealVoice(colorName: string, isNewRound: boolean) {
    if (isNewRound) {
      this.speak(`New color ${colorName}! Run to ${colorName}!`, 'high', 1.08, 1.18);
    } else {
      this.speak(`Colors revealed! Run to ${colorName}!`, 'high', 1.08, 1.16);
    }
  }

  playSafeVoice(colorName: string) {
    this.speak(`Safe on ${colorName}!`, 'normal', 1.1, 1.15);
  }

  playOutVoice(isPlayerOut: boolean, runnerName?: string, role: 'runner' | 'chaser' = 'runner') {
    if (isPlayerOut) {
      this.speak('You are out! Caught by the Hunter!', 'high', 0.92, 1.05);
    } else if (role === 'chaser') {
      this.speak(`${runnerName || 'Runner'} is out! Nice catch!`, 'high', 1.02, 1.12);
    } else {
      this.speak(`${runnerName || 'Runner'} is out!`, 'high', 0.96, 1.14);
    }
  }

  playAllOutVoice(victory: boolean) {
    if (victory) {
      this.speak('All runners are out! You win!', 'high', 1.05, 1.08);
    } else {
      this.speak('All runners are out! Game over!', 'high', 0.9, 1.04);
    }
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.12,
    slideTo?: number,
    delay = 0
  ) {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, slideTo), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  playButton() {
    this.tone(580, 0.06, 'triangle', 0.08, 760);
  }

  playFootstep(sprinting: boolean) {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const base = sprinting ? 155 + Math.random() * 35 : 112 + Math.random() * 25;
    this.tone(base, 0.048, 'triangle', sprinting ? 0.065 : 0.034, 48);
    if (sprinting) {
      this.tone(310 + Math.random() * 60, 0.03, 'sine', 0.018, 190, 0.01);
    }
  }

  playDash() {
    this.tone(240, 0.14, 'sine', 0.11, 620);
    this.tone(420, 0.12, 'triangle', 0.07, 180, 0.03);
  }

  playHide(entering: boolean) {
    if (entering) {
      this.tone(360, 0.11, 'sine', 0.07, 210);
    } else {
      this.tone(240, 0.1, 'sine', 0.07, 420);
    }
  }

  playCatch() {
    this.tone(210, 0.22, 'sawtooth', 0.15, 65);
    this.tone(130, 0.28, 'square', 0.09, 45, 0.03);
  }

  playTick() {
    this.tone(680, 0.06, 'triangle', 0.08);
  }

  playReveal() {
    this.tone(440, 0.16, 'triangle', 0.12, 660, 0);
    this.tone(659.25, 0.2, 'sine', 0.11, undefined, 0.05);
    this.tone(880, 0.26, 'sine', 0.12, undefined, 0.1);
  }

  playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => this.tone(n, 0.22, 'triangle', 0.12, undefined, i * 0.09));
  }

  playDefeat() {
    const notes = [330, 277.18, 220, 146.83];
    notes.forEach((n, i) => this.tone(n, 0.26, 'sawtooth', 0.11, n * 0.85, i * 0.14));
  }

  startMusic() {
    if (!this.musicEnabled || this.musicTimer !== null) return;
    this.ensureCtx();
    const bassLine = [110, 110, 146.83, 130.81, 110, 110, 164.81, 146.83];
    const leadLine = [440, 0, 523.25, 493.88, 440, 0, 659.25, 587.33];

    this.musicTimer = window.setInterval(() => {
      if (!this.musicEnabled) return;
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;

      const idx = this.stepIndex % bassLine.length;
      const now = ctx.currentTime;

      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(bassLine[idx], now);
      bassGain.gain.setValueAtTime(0.0001, now);
      bassGain.gain.linearRampToValueAtTime(0.042, now + 0.02);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      bassOsc.connect(bassGain);
      bassGain.connect(ctx.destination);
      bassOsc.start(now);
      bassOsc.stop(now + 0.26);

      const lead = leadLine[idx];
      if (lead > 0 && this.stepIndex % 2 === 0) {
        const leadOsc = ctx.createOscillator();
        const leadGain = ctx.createGain();
        leadOsc.type = 'sine';
        leadOsc.frequency.setValueAtTime(lead, now);
        leadGain.gain.setValueAtTime(0.0001, now);
        leadGain.gain.linearRampToValueAtTime(0.024, now + 0.015);
        leadGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        leadOsc.connect(leadGain);
        leadGain.connect(ctx.destination);
        leadOsc.start(now);
        leadOsc.stop(now + 0.22);
      }

      this.stepIndex++;
    }, 270);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
