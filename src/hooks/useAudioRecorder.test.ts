import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAudioRecorder } from "./useAudioRecorder";

// Mock audio-utils
vi.mock("@/lib/audio-utils", () => ({
  encodeWAV: vi.fn(() => new Blob(["wav-data"], { type: "audio/wav" })),
}));

// Mock MediaStream
class MockMediaStream {
  tracks = [{ stop: vi.fn() }];
  getTracks() {
    return this.tracks;
  }
}

// Mock AudioContext
class MockAudioContext {
  createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
  }));
  createScriptProcessor = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null,
  }));
  destination = {};
  close = vi.fn();
}

describe("useAudioRecorder", () => {
  let mockGetUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetUserMedia = vi.fn();

    Object.defineProperty(global.navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
    });

    // @ts-expect-error Mock AudioContext
    global.AudioContext = MockAudioContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with isRecording false", () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.isRecording).toBe(false);
  });

  it("sets isRecording to true after startRecording", async () => {
    mockGetUserMedia.mockResolvedValue(new MockMediaStream());

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
  });

  it("sets isRecording to false after stopRecording", async () => {
    mockGetUserMedia.mockResolvedValue(new MockMediaStream());

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
  });

  it("returns null when stopping with no audio data", async () => {
    mockGetUserMedia.mockResolvedValue(new MockMediaStream());

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    let blob: Blob | null = null;
    act(() => {
      blob = result.current.stopRecording();
    });

    expect(blob).toBeNull();
  });

  it("returns WAV blob when stopping with audio data", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValue(mockStream);

    let processorCallback: ((e: AudioProcessingEvent) => void) | null = null;
    const mockProcessor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as ((e: AudioProcessingEvent) => void) | null,
    };

    // Create a proper class mock
    const MockAudioContextClass = class {
      createMediaStreamSource = vi.fn(() => ({
        connect: vi.fn(),
      }));
      createScriptProcessor = vi.fn(() => {
        const proc = { ...mockProcessor };
        // Store reference to capture callback
        Object.defineProperty(proc, 'onaudioprocess', {
          set(cb) {
            processorCallback = cb;
          },
          get() {
            return processorCallback;
          },
        });
        return proc;
      });
      destination = {};
      close = vi.fn();
    };

    // @ts-expect-error Mock AudioContext
    global.AudioContext = MockAudioContextClass;

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    // Simulate audio data
    act(() => {
      if (processorCallback) {
        const mockEvent = {
          inputBuffer: {
            getChannelData: () => new Float32Array([0.1, 0.2, 0.3]),
          },
        } as unknown as AudioProcessingEvent;
        processorCallback(mockEvent);
      }
    });

    let blob: Blob | null = null;
    act(() => {
      blob = result.current.stopRecording();
    });

    expect(blob).toBeInstanceOf(Blob);
  });

  it("stops media stream tracks on stopRecording", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValue(mockStream);

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(mockStream.tracks[0].stop).toHaveBeenCalled();
  });

  it("throws when getUserMedia fails", async () => {
    mockGetUserMedia.mockRejectedValue(new Error("Permission denied"));

    const { result } = renderHook(() => useAudioRecorder());

    await expect(
      act(async () => {
        await result.current.startRecording();
      })
    ).rejects.toThrow("Permission denied");
  });

  it("respects custom sampleRate option", async () => {
    mockGetUserMedia.mockResolvedValue(new MockMediaStream());

    const { result } = renderHook(() => useAudioRecorder({ sampleRate: 44100 }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ sampleRate: 44100 }),
      })
    );
  });
});
