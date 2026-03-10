interface AudioAnalysis {
  duration: number;
  peaks: number[];
}

export function extractPeaks(channelData: Float32Array, barCount: number): number[] {
  const samplesPerBar = Math.floor(channelData.length / barCount);
  const rawPeaks: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, channelData.length);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > peak) peak = abs;
    }
    rawPeaks.push(peak);
  }
  const max = Math.max(...rawPeaks, 0.001);
  return rawPeaks.map((p) => p / max);
}

export async function analyzeAudioBlob(blob: Blob, barCount = 40): Promise<AudioAnalysis> {
  const buffer = await blob.arrayBuffer();
  const audioCtx = new OfflineAudioContext(1, 1, 44100);
  const decoded = await audioCtx.decodeAudioData(buffer);
  const duration = decoded.duration;
  const peaks = extractPeaks(decoded.getChannelData(0), barCount);
  return { duration, peaks };
}
