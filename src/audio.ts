export class GardenAudio {
  private context?: AudioContext;
  private gain?: GainNode;
  private nextBird = 0;
  muted = false;
  start() {
    if (!this.context) {
      this.context = new AudioContext();
      const ctx = this.context;
      this.gain = ctx.createGain();
      this.gain.gain.value = this.muted ? 0 : 0.13;
      this.gain.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < data.length; i++) {
        previous = (previous + 0.018 * (Math.random() * 2 - 1)) / 1.018;
        data[i] = previous * 4;
      }
      const wind = ctx.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 480;
      wind.connect(filter);
      filter.connect(this.gain);
      wind.start();
    }
    void this.context.resume();
  }
  toggle() {
    this.muted = !this.muted;
    if (this.gain && this.context)
      this.gain.gain.setTargetAtTime(
        this.muted ? 0 : 0.13,
        this.context.currentTime,
        0.2,
      );
  }
  chime() {
    if (!this.context || !this.gain) return;
    const ctx = this.context;
    for (const [i, note] of [523.25, 659.25, 783.99, 1046.5].entries()) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = note;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.23, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      o.connect(g);
      g.connect(this.gain);
      o.start(t);
      o.stop(t + 2.6);
    }
  }
  update(time: number) {
    if (time < this.nextBird || !this.context || !this.gain || this.muted)
      return;
    this.nextBird = time + 9 + Math.random() * 12;
    const ctx = this.context,
      o = ctx.createOscillator(),
      g = ctx.createGain(),
      t = ctx.currentTime;
    o.frequency.setValueAtTime(1700, t);
    o.frequency.exponentialRampToValueAtTime(2600, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(1900, t + 0.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g);
    g.connect(this.gain);
    o.start();
    o.stop(t + 0.25);
  }
}
