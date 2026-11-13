class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private jitter(base: number): number {
    return base * (0.92 + Math.random() * 0.16);
  }

  public playJump(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const f = this.jitter(290);
    osc.frequency.setValueAtTime(f, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(f * 1.7, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.11);
  }

  public playBounce(intensity: number, heavy: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = heavy ? 'triangle' : 'sine';
    const base = heavy ? this.jitter(115) : this.jitter(220);
    const vol = Math.min(0.22, 0.05 + intensity / 2500);
    osc.frequency.setValueAtTime(base, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  }

  public playShatter(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(this.jitter(180), ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.17);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  }

  public playKO(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.28);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(now + 0.31);
  }

  public playCapture(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [440, 554, 659];
    notes.forEach((n, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = ctx.currentTime + idx * 0.06;
      osc.frequency.setValueAtTime(n, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  public playEmote(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const f = this.jitter(520);
    osc.frequency.setValueAtTime(f, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(f * 1.25, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.11);
  }
}

export const soundEngine = new SoundEngine();
