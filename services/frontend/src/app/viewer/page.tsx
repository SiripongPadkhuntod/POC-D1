"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { WebRTCAdaptor } from "@antmedia/webrtc_adaptor";
import { ArrowLeft, Maximize2, Play, RadioTower, Square, Volume2, VolumeX } from "lucide-react";
import { browserWebSocketURL, defaultProgramStreamID, defaultWebSocketURL } from "@/shared/config/media";
import { useWebRTCStats, WebRTCStats } from "@/components/webrtc-stats";

type ViewerStatus = "idle" | "connecting" | "playing" | "error";

export default function ViewerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const adaptorRef = useRef<WebRTCAdaptor | null>(null);
  const mountedRef = useRef(true);
  const activeStreamRef = useRef("");
  const stopRef = useRef<(update?: boolean) => void>(() => undefined);

  const [websocketUrl, setWebsocketUrl] = useState(defaultWebSocketURL);
  const [streamID, setStreamID] = useState(initialStreamID);
  const [playToken, setPlayToken] = useState("");
  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [message, setMessage] = useState("พร้อมรับชม Program จาก D1");
  const [muted, setMuted] = useState(true);
  const stats = useWebRTCStats(adaptorRef, streamID, status === "playing");

  useEffect(() => {
    setWebsocketUrl(browserWebSocketURL());
    return () => {
      mountedRef.current = false;
      stopRef.current(false);
    };
  }, []);

  async function start() {
    const url = websocketUrl.trim();
    const id = streamID.trim();
    if ((!url.startsWith("wss://") && !url.startsWith("ws://")) || !id) {
      setStatus("error");
      setMessage("กรุณาตรวจ WebRTC WebSocket URL และ Stream ID");
      return;
    }

    stop(false);
    setStatus("connecting");
    setMessage(`กำลังเชื่อมต่อ ${id}…`);
    activeStreamRef.current = id;
    window.history.replaceState(null, "", `/viewer?id=${encodeURIComponent(id)}`);

    try {
      const { WebRTCAdaptor } = await import("@antmedia/webrtc_adaptor");
      if (!mountedRef.current) return;
      const adaptor = new WebRTCAdaptor({
        websocket_url: url,
        remoteVideoElement: videoRef.current,
        isPlayMode: true,
        reconnectIfRequiredFlag: false,
        mediaConstraints: { video: false, audio: false },
        peerconnection_config: { iceServers: [{ urls: "stun:stun1.l.google.com:19302" }] },
        callback: (info: string) => {
          if (!mountedRef.current) return;
          if (info === "initialized") {
            adaptor.play(id, playToken.trim() || undefined);
          } else if (info === "play_started") {
            setStatus("playing");
            setMessage(`LIVE · ${id}`);
          } else if (info === "play_finished") {
            setStatus("idle");
            setMessage(`Stream ${id} จบหรือหยุดส่งแล้ว`);
          }
        },
        callbackError: (error: string, detail?: unknown) => {
          if (!mountedRef.current) return;
          const suffix = detailText(detail);
          setStatus("error");
          setMessage(`${viewerError(error)}${suffix ? ` · ${suffix}` : ""}`);
        },
      });
      adaptorRef.current = adaptor;
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "เปิด Viewer ไม่สำเร็จ");
    }
  }

  function stop(update = true) {
    const adaptor = adaptorRef.current;
    const activeID = activeStreamRef.current;
    adaptorRef.current = null;
    activeStreamRef.current = "";
    if (adaptor) {
      if (activeID) adaptor.stop(activeID);
      adaptor.closeWebSocket();
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (update && mountedRef.current) {
      setStatus("idle");
      setMessage("หยุดรับชมแล้ว");
    }
  }

  stopRef.current = stop;
  const busy = status === "connecting" || status === "playing";

  async function toggleAudio() {
    const video = videoRef.current;
    if (!video) return;
    const next = !muted;
    video.muted = next;
    setMuted(next);
    if (!next) await video.play();
  }

  async function enterFullscreen() {
    if (videoRef.current?.requestFullscreen) await videoRef.current.requestFullscreen();
  }

  return (
    <main className="viewer-page">
      <header className="viewer-header shell">
        <Link href="/"><ArrowLeft size={16} /> POC-D1</Link>
        <span className={status}><i /> {status === "playing" ? "LIVE" : status.toUpperCase()}</span>
      </header>

      <section className="viewer-shell shell">
        <div className="viewer-stage">
          <video ref={videoRef} autoPlay muted={muted} playsInline />
          {status !== "playing" && (
            <div className="viewer-placeholder">
              <RadioTower size={42} />
              <strong>{status === "connecting" ? "CONNECTING TO D1" : "PROGRAM OFF AIR"}</strong>
              <span>{status === "connecting" ? streamID : "ใส่ Stream ID แล้วเริ่มรับชม"}</span>
            </div>
          )}
          {status === "playing" && <b className="viewer-live"><i /> LIVE · {activeStreamRef.current}</b>}
          <div className="viewer-media-actions">
            <button onClick={() => void toggleAudio()} disabled={status !== "playing"}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />} {muted ? "เปิดเสียง" : "ปิดเสียง"}</button>
            <button onClick={() => void enterFullscreen()} disabled={status !== "playing"}><Maximize2 size={17} /> เต็มจอ</button>
          </div>
        </div>

        <aside className="viewer-panel">
          <p><RadioTower size={14} /> ANT MEDIA D1 VIEWER</p>
          <h1>รับชม Program</h1>
          <label><span>WEBRTC WEBSOCKET URL</span><input value={websocketUrl} onChange={(event) => setWebsocketUrl(event.target.value)} disabled={busy} /></label>
          <label><span>STREAM ID</span><input value={streamID} onChange={(event) => setStreamID(event.target.value)} disabled={busy} /></label>
          <label><span>PLAY TOKEN <small>ไม่บังคับ</small></span><input type="password" value={playToken} onChange={(event) => setPlayToken(event.target.value)} disabled={busy} /></label>
          <div className={`viewer-message ${status}`}>{message}</div>
          <WebRTCStats stats={stats} />
          {!busy
            ? <button className="primary" onClick={() => void start()}><Play size={16} /> เริ่มรับชม</button>
            : <button className="danger" onClick={() => stop()}><Square size={15} /> หยุดรับชม</button>}
          <small className="viewer-hint">Program เริ่มต้นคือ <code>{defaultProgramStreamID}</code> และต้องอยู่สถานะ LIVE จากหน้า Studio</small>
        </aside>
      </section>
    </main>
  );
}

function initialStreamID() {
  if (typeof window === "undefined") return defaultProgramStreamID;
  return new URLSearchParams(window.location.search).get("id")?.trim() || defaultProgramStreamID;
}

function viewerError(error: string) {
  if (error === "no_stream_exist") return "ยังไม่มี Program สำหรับ Stream ID นี้";
  if (error === "WebSocketNotConnected") return "เชื่อมต่อ Ant Media WebSocket ไม่สำเร็จ";
  if (error === "playTimeoutError") return "รับสัญญาณจาก Ant Media ไม่ทันเวลา";
  return error;
}

function detailText(detail: unknown) {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") return detail.message;
  return "";
}
