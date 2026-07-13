export const defaultWebSocketURL = process.env.NEXT_PUBLIC_ANT_MEDIA_WEBSOCKET_URL
  ?? "wss://rtc2.streamssl.com:5443/WebRTCAppEE/websocket";

export const defaultProgramStreamID = process.env.NEXT_PUBLIC_ANT_MEDIA_PROGRAM_STREAM_ID ?? "sell-image";

export function randomStreamID(prefix: "camera" | "microphone") {
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8)
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}-${suffix}`;
}
