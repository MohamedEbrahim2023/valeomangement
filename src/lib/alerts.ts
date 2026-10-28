// Web Audio API Chime Synthesizer & Browser Desktop Notification Manager

export type AlertToneType =
  | 'TASK_ASSIGNED'
  | 'WORK_SUBMITTED'
  | 'TASK_APPROVED'
  | 'DEFAULT';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {
      // Ignore autoplay restrictions until user interaction
    });
  }
  return sharedAudioCtx;
}

/**
 * Unlocks Web Audio API on first user click/keydown so background SSE events can play chimes anytime.
 */
export function unlockAudioOnUserGesture(): void {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

/**
 * Plays a pleasant, non-intrusive synthesized chime using Web Audio API.
 */
export function playNotificationChime(type: AlertToneType = 'DEFAULT'): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Define note frequencies (Hz) for each alert type
    let notes: { freq: number; start: number; duration: number }[] = [];

    if (type === 'TASK_ASSIGNED') {
      // Warm ascending two-note chime for new assigned task (C5 -> G5)
      notes = [
        { freq: 523.25, start: 0, duration: 0.16 },
        { freq: 783.99, start: 0.14, duration: 0.28 },
      ];
    } else if (type === 'WORK_SUBMITTED') {
      // Clear 3-note executive chime when an employee submits a task for manager review (E5 -> G5 -> C6)
      notes = [
        { freq: 659.25, start: 0, duration: 0.13 },
        { freq: 783.99, start: 0.12, duration: 0.13 },
        { freq: 1046.5, start: 0.24, duration: 0.32 },
      ];
    } else if (type === 'TASK_APPROVED') {
      // Celebratory chord arpeggio (C5 -> E5 -> G5 -> C6)
      notes = [
        { freq: 523.25, start: 0, duration: 0.11 },
        { freq: 659.25, start: 0.1, duration: 0.11 },
        { freq: 783.99, start: 0.2, duration: 0.11 },
        { freq: 1046.5, start: 0.3, duration: 0.35 },
      ];
    } else {
      // Gentle standard notification tone (A4 -> E5)
      notes = [
        { freq: 440, start: 0, duration: 0.14 },
        { freq: 659.25, start: 0.13, duration: 0.24 },
      ];
    }

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      // Smooth envelope to avoid clicks
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + note.start + 0.025);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.start + note.duration
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    }
  } catch {
    // Ignore audio context errors if blocked
  }
}

export function getDesktopNotificationPermission():
  | NotificationPermission
  | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function sendDesktopNotification(options: {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
}): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  try {
    const notif = new Notification(options.title, {
      body: options.body,
      tag: options.tag || `velopulse-${Date.now()}`,
      silent: true, // We play our own custom Web Audio chime
    });
    notif.onclick = () => {
      window.focus();
      options.onClick?.();
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}
