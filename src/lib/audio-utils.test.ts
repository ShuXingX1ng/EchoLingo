import { describe, expect, it } from "vitest";
import { encodeWAV } from "./audio-utils";

async function readBlob(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

function readString(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, index) =>
    String.fromCharCode(view.getUint8(offset + index))
  ).join("");
}

describe("encodeWAV", () => {
  it("writes a mono 16-bit WAV header", async () => {
    const blob = encodeWAV([new Float32Array([0, 0.5, -0.5])], 16000);
    const view = await readBlob(blob);

    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(50);
    expect(readString(view, 0, 4)).toBe("RIFF");
    expect(readString(view, 8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readString(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(6);
  });

  it("clamps samples into the signed 16-bit range", async () => {
    const blob = encodeWAV([new Float32Array([2, -2])], 16000);
    const view = await readBlob(blob);

    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});
