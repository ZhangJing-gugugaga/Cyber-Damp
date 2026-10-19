import { BreathEnvelope } from './breath-envelope';

export type MicrophoneWindState = 'disabled' | 'requesting' | 'calibrating' | 'ready' | 'denied' | 'unavailable' | 'error';

interface InputSession {
  context: AudioContext;
  stream: MediaStream | null;
  nodes: AudioNode[];
  analyser: AnalyserNode | null;
  samples: Float32Array<ArrayBuffer> | null;
  ended: () => void;
}

/**
 * Opt-in, local microphone breath input. No output connection, recorder, storage
 * or network: a reusable sample buffer is reduced to RMS and immediately wiped.
 * Call setEnabled(true) from the user's settings gesture; construction is inert.
 */
export class MicrophoneWind {
  private wanted = false;
  private destroyed = false;
  private generation = 0;
  private pending: Promise<boolean> | null = null;
  private session: InputSession | null = null;
  private envelope = new BreathEnvelope();
  private currentState: MicrophoneWindState = 'disabled';
  private currentError: string | null = null;
  private readonly onUnload = (): void => this.dispose();

  constructor() {
    window.addEventListener('pagehide', this.onUnload);
    window.addEventListener('beforeunload', this.onUnload);
  }

  get enabled(): boolean { return this.wanted; }
  get state(): MicrophoneWindState { return this.currentState; }
  get error(): string | null { return this.currentError; }
  get strength(): number { return this.currentState === 'ready' ? this.envelope.strength : 0; }

  setEnabled(on: boolean): Promise<boolean> {
    if (!on) {
      this.wanted = false;
      this.generation++;
      this.pending = null;
      this.release(this.session);
      this.currentState = 'disabled';
      this.currentError = null;
      return Promise.resolve(false);
    }
    if (this.destroyed) return Promise.resolve(false);
    if (this.wanted) return this.pending ?? Promise.resolve(this.currentState === 'ready' || this.currentState === 'calibrating');
    this.wanted = true;
    this.currentState = 'requesting';
    this.currentError = null;
    const generation = ++this.generation;
    const pending = this.start(generation);
    this.pending = pending;
    void pending.then(() => { if (this.pending === pending) this.pending = null; });
    return pending;
  }

  private async start(generation: number): Promise<boolean> {
    let input: InputSession | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
        this.fail('unavailable', '这台设备暂时无法使用麦克风吹气');
        return false;
      }
      // Resume immediately within the opt-in user gesture, before awaiting permission.
      const context = new AudioContext();
      input = { context, stream: null, nodes: [], analyser: null, samples: null,
        ended: () => {
          if (this.session === input) this.fail('unavailable', '麦克风已断开，请重新开启');
        } };
      this.session = input;
      const resumed = context.resume().then(() => true, () => false);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      input.stream = stream;
      if (generation !== this.generation || !this.wanted || this.destroyed) {
        this.release(input);
        return false;
      }
      if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) throw new Error('NoAudioTrack');
      if (!await resumed) throw new Error('AudioStartFailed');
      if (generation !== this.generation || !this.wanted || this.destroyed) {
        this.release(input);
        return false;
      }
      const source = context.createMediaStreamSource(stream);
      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass'; highpass.frequency.value = 45; highpass.Q.value = 0.7;
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass'; lowpass.frequency.value = 650; lowpass.Q.value = 0.7;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      input.nodes = [source, highpass, lowpass, analyser];
      source.connect(highpass).connect(lowpass).connect(analyser);
      // Deliberately no connection to context.destination: microphone feedback is silent.
      input.analyser = analyser;
      input.samples = new Float32Array(analyser.fftSize);
      for (const track of stream.getAudioTracks()) track.addEventListener('ended', input.ended);
      this.envelope.reset();
      this.currentState = 'calibrating';
      return true;
    } catch (error) {
      this.release(input);
      if (generation !== this.generation || !this.wanted || this.destroyed) return false;
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') this.fail('denied', '麦克风权限未开启');
      else if (name === 'NotFoundError' || name === 'NotReadableError') this.fail('unavailable', '没有可用的麦克风');
      else this.fail('error', '麦克风暂时无法启动，请稍后重试');
      return false;
    }
  }

  /** Sample once per game frame. Disabled, denied and unavailable inputs are zero. */
  update(dtSec: number): number {
    const input = this.session;
    if (!this.wanted || !input?.analyser || !input.samples) return 0;
    if (input.context.state !== 'running') {
      this.fail('error', '音频输入已暂停，请重新开启麦克风');
      return 0;
    }
    if (!input.stream?.getAudioTracks().some((track) => track.readyState === 'live' && !track.muted)) {
      this.envelope.reset();
      return 0;
    }
    try {
      input.analyser.getFloatTimeDomainData(input.samples);
      let squares = 0;
      for (const sample of input.samples) squares += sample * sample;
      const rms = Math.sqrt(squares / input.samples.length);
      input.samples.fill(0);
      const gust = this.envelope.step(rms, dtSec);
      this.currentState = this.envelope.ready ? 'ready' : 'calibrating';
      return gust;
    } catch {
      this.fail('error', '麦克风输入已停止，请重新开启');
      return 0;
    }
  }

  private fail(state: 'denied' | 'unavailable' | 'error', error: string): void {
    this.wanted = false;
    this.release(this.session);
    this.currentState = state;
    this.currentError = error;
  }

  private release(input: InputSession | null): void {
    if (!input) { this.envelope.reset(); return; }
    if (this.session === input) { this.session = null; this.envelope.reset(); }
    input.samples?.fill(0);
    input.samples = null;
    input.analyser = null;
    for (const track of input.stream?.getTracks() ?? []) {
      track.removeEventListener('ended', input.ended);
      track.stop();
    }
    input.stream = null;
    for (const node of input.nodes) { try { node.disconnect(); } catch { /* already disconnected */ } }
    input.nodes = [];
    if (input.context.state !== 'closed') void input.context.close().catch(() => undefined);
  }

  dispose(): void {
    this.destroyed = true;
    void this.setEnabled(false);
    window.removeEventListener('pagehide', this.onUnload);
    window.removeEventListener('beforeunload', this.onUnload);
  }
}
