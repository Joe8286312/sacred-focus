/**
 * 原生 Web Audio API 合成提示音
 * 无需外部 mp3 资源，零依赖、完全离线、低延迟。
 */
export function playChimeSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // 创建主增益节点 (音量包络)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.01, now);
    masterGain.gain.exponentialRampToValueAtTime(0.35, now + 0.05);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    masterGain.connect(ctx.destination);

    // 双音调水晶磬音 (高低八度和声，营造清亮唤醒感)
    const freqs = [587.33, 880.0, 1174.66]; // D5, A5, D6
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      osc.connect(masterGain);
      osc.start(now + idx * 0.04);
      osc.stop(now + 2.0);
    });

    // 若设备支持触觉震动，同步触发
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch (err) {
    console.warn('[Audio] Failed to play chime via Web Audio API', err);
  }
}
