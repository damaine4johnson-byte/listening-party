// Decodes an audio file in the browser and re-encodes it as 256 kbps MP3.
export async function compressToMp3(file: File, onProgress?: (fraction: number) => void): Promise<File> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const AudioCtx: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    void ctx.close();
  }

  const channels = Math.min(buffer.numberOfChannels, 2);
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, 256);
  const toInt16 = (data: Float32Array) => {
    const out = new Int16Array(data.length);
    for (let i = 0; i < data.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return out;
  };

  const left = toInt16(buffer.getChannelData(0));
  const right = channels === 2 ? toInt16(buffer.getChannelData(1)) : undefined;
  const chunks: Uint8Array[] = [];
  const block = 1152 * 20;
  for (let i = 0; i < left.length; i += block) {
    const part = right
      ? encoder.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block))
      : encoder.encodeBuffer(left.subarray(i, i + block));
    if (part.length) chunks.push(new Uint8Array(part));
    if ((i / block) % 25 === 0) {
      onProgress?.(i / left.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(new Uint8Array(tail));

  const name = file.name.replace(/\.[^.]+$/, "") + ".mp3";
  return new File(chunks as BlobPart[], name, { type: "audio/mpeg" });
}
