import type { Track, TrackProcessor, VideoProcessorOptions } from "livekit-client";
import { buildCanvasFilter } from "./camera-settings";
import type { CameraSettings } from "./camera-settings";

export function supportsCanvasFilters() {
  return typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
}

// Redraws the camera through a GPU-accelerated canvas filter and publishes the result.
// Look changes only swap a string, so adjusting mid-stream never restarts the camera.
export class CameraFilterProcessor implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions> {
  name = "camera-filters";
  processedTrack?: MediaStreamTrack;

  private filter = "none";
  private fps = 30;
  private appliedFilter = "none";
  private source: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private generation = 0;
  private timer: number | undefined;

  constructor(settings: CameraSettings) {
    this.update(settings);
  }

  update(settings: CameraSettings) {
    this.filter = buildCanvasFilter(settings);
    this.fps = settings.frameRate;
  }

  async init(options: VideoProcessorOptions) {
    const { width = 1280, height = 720 } = options.track.getSettings();
    const source = document.createElement("video");
    source.muted = true;
    source.playsInline = true;
    source.srcObject = new MediaStream([options.track]);
    await source.play();

    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth || width;
    canvas.height = source.videoHeight || height;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) throw new Error("Canvas is not available");

    this.source = source;
    this.canvas = canvas;
    this.context = context;
    this.appliedFilter = "none";
    this.processedTrack = canvas.captureStream().getVideoTracks()[0];
    document.addEventListener("visibilitychange", this.reschedule);
    this.reschedule();
  }

  async restart(options: VideoProcessorOptions) {
    await this.destroy();
    await this.init(options);
  }

  async destroy() {
    document.removeEventListener("visibilitychange", this.reschedule);
    this.generation += 1;
    window.clearTimeout(this.timer);
    this.processedTrack?.stop();
    this.processedTrack = undefined;
    if (this.source) this.source.srcObject = null;
    this.source = null;
    this.canvas = null;
    this.context = null;
  }

  private draw() {
    const { source, canvas, context } = this;
    if (!source || !canvas || !context || source.readyState < 2) return;
    if (source.videoWidth && (canvas.width !== source.videoWidth || canvas.height !== source.videoHeight)) {
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
      this.appliedFilter = "";
    }
    if (this.appliedFilter !== this.filter) {
      context.filter = this.filter;
      this.appliedFilter = this.filter;
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }

  // Frame callbacks stop in background tabs, which would freeze the broadcast, so a
  // hidden tab falls back to a timer paced at the capture frame rate.
  private reschedule = () => {
    this.generation += 1;
    window.clearTimeout(this.timer);
    const generation = this.generation;
    const source = this.source;
    if (!source) return;
    const tick = () => {
      if (generation !== this.generation) return;
      this.draw();
      schedule();
    };
    const schedule = () => {
      if (generation !== this.generation) return;
      if (document.hidden) this.timer = window.setTimeout(tick, 1000 / this.fps);
      else if ("requestVideoFrameCallback" in source) source.requestVideoFrameCallback(tick);
      else requestAnimationFrame(tick);
    };
    schedule();
  };
}
