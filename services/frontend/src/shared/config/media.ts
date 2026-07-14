export const defaultWebSocketURL = process.env.NEXT_PUBLIC_ANT_MEDIA_WEBSOCKET_URL
  ?? "wss://rtc2.streamssl.com:5443/WebRTCAppEE/websocket";

export function browserWebSocketURL() {
  if (typeof window === "undefined") return defaultWebSocketURL;

  if (window.location.protocol === "http:" && window.location.port === "3544") {
    return `ws://${window.location.host}/live/websocket`;
  }

  try {
    const configured = new URL(defaultWebSocketURL);
    const configuredForLoopback = configured.hostname === "localhost" || configured.hostname === "127.0.0.1";
    const pageIsLoopback = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // Use the page origin for LAN hosts and HTTPS tunnels. A LAN page keeps
    // :3543 from window.location.host, while ngrok correctly stays on public
    // port 443 instead of inheriting the configured local :3543 port.
    if (configuredForLoopback && !pageIsLoopback) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}/live/websocket`;
    }
  } catch {
    // Validation in the form will report an invalid configured URL.
  }

  return defaultWebSocketURL;
}

export const defaultProgramStreamID = process.env.NEXT_PUBLIC_ANT_MEDIA_PROGRAM_STREAM_ID ?? "sell-image";

export function randomStreamID(prefix: "camera" | "microphone") {
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8)
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}-${suffix}`;
}
