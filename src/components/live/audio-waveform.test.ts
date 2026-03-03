import { describe, expect, it } from "vitest";
import { extractPeaks } from "./audio-waveform";

describe("extractPeaks", () => {
  it("returns correct bar count", () => {
    const data = new Float32Array(1000);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin((2 * Math.PI * i) / 100);
    }
    const peaks = extractPeaks(data, 10);
    expect(peaks).toHaveLength(10);
  });

  it("normalizes peaks to 0-1 range", () => {
    const data = new Float32Array(400);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin((2 * Math.PI * i) / 100);
    }
    const peaks = extractPeaks(data, 4);
    for (const peak of peaks) {
      expect(peak).toBeGreaterThanOrEqual(0);
      expect(peak).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...peaks)).toBeCloseTo(1, 5);
  });

  it("detects silence as near-zero peaks", () => {
    const data = new Float32Array(400);
    const peaks = extractPeaks(data, 4);
    for (const peak of peaks) {
      expect(peak).toBe(0);
    }
  });

  it("detects a loud bar among quiet bars", () => {
    const data = new Float32Array(400);
    for (let i = 100; i < 200; i++) {
      data[i] = 0.9;
    }
    const peaks = extractPeaks(data, 4);
    expect(peaks[1]).toBeCloseTo(1, 5);
    expect(peaks[0]).toBeLessThan(0.01);
    expect(peaks[2]).toBeLessThan(0.01);
    expect(peaks[3]).toBeLessThan(0.01);
  });
});
