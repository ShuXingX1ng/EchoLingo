// Audio utility functions for recording and WAV encoding

export interface AudioCapture {
  audioContext: AudioContext;
  mediaStream: MediaStream;
  scriptProcessor: ScriptProcessorNode;
  audioData: Float32Array[];
}

export function encodeWAV(audioData: Float32Array[], sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;

  // Calculate total length
  let totalLength = 0;
  for (const buffer of audioData) {
    totalLength += buffer.length;
  }

  // Create the buffer
  const buffer = new ArrayBuffer(44 + totalLength * bytesPerSample);
  const view = new DataView(buffer);

  // Write WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + totalLength * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, totalLength * bytesPerSample, true);

  // Write audio data
  let offset = 44;
  for (const buffer of audioData) {
    for (let i = 0; i < buffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, buffer[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function startAudioCapture(): Promise<AudioCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const audioData: Float32Array[] = [];
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    const data = new Float32Array(inputData.length);
    data.set(inputData);
    audioData.push(data);
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return { audioContext, mediaStream: stream, scriptProcessor: processor, audioData };
}

export function stopAudioCapture(capture: AudioCapture): Blob | null {
  capture.scriptProcessor.disconnect();
  capture.audioContext.close();
  capture.mediaStream.getTracks().forEach((track) => track.stop());

  if (capture.audioData.length > 0) {
    const wavBlob = encodeWAV(capture.audioData, 16000);
    return wavBlob;
  }
  return null;
}
