// Encodes a Float32Array of audio samples into a WAV (RIFF PCM 16-bit mono) ArrayBuffer.
export function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE")
  str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  str(36, "data"); view.setUint32(40, samples.length * 2, true)
  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    off += 2
  }
  return buf
}

// Converts any audio Blob (webm/opus etc.) to a WAV Blob using the Web Audio API.
export async function blobToWav(blob: Blob): Promise<Blob> {
  const ab = await blob.arrayBuffer()
  const ctx = new AudioContext()
  const audioBuffer = await ctx.decodeAudioData(ab)
  await ctx.close()
  const ch0 = audioBuffer.getChannelData(0)
  let samples = ch0
  if (audioBuffer.numberOfChannels > 1) {
    const ch1 = audioBuffer.getChannelData(1)
    samples = new Float32Array(ch0.length)
    for (let i = 0; i < ch0.length; i++) samples[i] = (ch0[i] + ch1[i]) / 2
  }
  return new Blob([encodeWAV(samples, audioBuffer.sampleRate)], { type: "audio/wav" })
}
