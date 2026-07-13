"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { WebRTCAdaptor } from "@antmedia/webrtc_adaptor";
import { ArrowLeft, Camera, Mic, Radio, Square } from "lucide-react";
import { defaultWebSocketURL, randomStreamID } from "@/shared/config/media";
import { registerSource, unregisterSource, type SourceKind } from "@/features/source-registry/api";

type Status = "idle" | "connecting" | "publishing" | "error";

export function SourcePublisher({ kind }: { kind: SourceKind }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const adaptorRef = useRef<WebRTCAdaptor | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const stopRef = useRef<(update?: boolean) => void>(() => undefined);

  const [websocketUrl, setWebsocketUrl] = useState(defaultWebSocketURL);
  const [studioID, setStudioID] = useState(initialStudioID);
  const [streamID, setStreamID] = useState("");
  const [label, setLabel] = useState(kind === "camera" ? "Camera" : "Microphone");
  const [publishToken, setPublishToken] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("พร้อมเชื่อมต่อ D1 จริง");
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    setStreamID(randomStreamID(kind));
    return () => {
      mountedRef.current = false;
      stopRef.current(false);
    };
  }, [kind]);

  function log(event: string, detail = "") {
    const line = `${new Date().toLocaleTimeString("th-TH", { hour12: false })}  ${event}${detail ? ` · ${detail}` : ""}`;
    setLogs((current) => [...current.slice(-49), line]);
    console.info(`[POC-D1 ${kind.toUpperCase()}] ${event}`, detail);
  }

  async function start() {
    const url = websocketUrl.trim();
    const id = streamID.trim();
    const studio = studioID.trim();
    if ((!url.startsWith("wss://") && !url.startsWith("ws://")) || !validStudioID(studio) || !id || !label.trim()) {
      setStatus("error");
      setMessage("กรุณาตรวจ Studio ID, WebSocket URL, Stream ID และชื่อ Source");
      return;
    }
    stop(false);
    setStatus("connecting");
    setMessage("กำลังเปิดอุปกรณ์และเชื่อม Ant Media…");
    log("connect_start", `studio=${studio} · ${url} · ${id}`);

    try {
      const { WebRTCAdaptor } = await import("@antmedia/webrtc_adaptor");
      if (!mountedRef.current) return;
      const adaptor = new WebRTCAdaptor({
        websocket_url: url,
        localVideoElement: videoRef.current,
        mediaConstraints: kind === "camera"
          ? { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
          : { video: false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
        peerconnection_config: { iceServers: [{ urls: "stun:stun1.l.google.com:19302" }] },
        sdp_constraints: { OfferToReceiveAudio: false, OfferToReceiveVideo: false },
        callback: (info: string) => {
          if (!mountedRef.current) return;
          log(info);
          if (info === "initialized") {
            adaptor.publish(id, publishToken.trim() || undefined);
          } else if (info === "publish_started") {
            setStatus("publishing");
            setMessage(`กำลังส่ง ${id} เข้า Studio ${studio}`);
            void heartbeat();
            heartbeatRef.current = window.setInterval(() => void heartbeat(), 5_000);
          } else if (info === "publish_finished") {
            setStatus("idle");
            setMessage("หยุด Publish แล้ว");
          }
        },
        callbackError: (error: string, detail?: unknown) => {
          if (!mountedRef.current) return;
          const suffix = detailText(detail);
          log(`ERROR ${error}`, suffix);
          setStatus("error");
          setMessage(`${error}${suffix ? ` · ${suffix}` : ""}`);
        },
      });
      adaptorRef.current = adaptor;
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "เริ่ม publisher ไม่สำเร็จ");
    }

    async function heartbeat() {
      await registerSource({ studioId: studio, id, kind, label: label.trim(), websocketUrl: url });
    }
  }

  function stop(update = true) {
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    const id = streamID.trim();
    if (id) void unregisterSource(studioID.trim() || "default", id);
    const adaptor = adaptorRef.current;
    adaptorRef.current = null;
    if (adaptor) {
      if (id) adaptor.stop(id);
      adaptor.closeWebSocket();
      adaptor.closeStream();
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (update && mountedRef.current) {
      setStatus("idle");
      setMessage("หยุด Source แล้ว");
      log("stopped");
    }
  }

  stopRef.current = stop;
  const busy = status === "connecting" || status === "publishing";
  const Icon = kind === "camera" ? Camera : Mic;

  return (
    <main className="source-page">
      <header className="source-header"><Link href="/"><ArrowLeft size={16} /> กลับหน้าหลัก</Link><span className={status}><i /> {status.toUpperCase()}</span></header>
      <div className="source-shell">
        <section className={`source-preview ${kind}`}>
          <video ref={videoRef} autoPlay muted playsInline />
          {status !== "publishing" && <div><Icon size={44} /><strong>{kind === "camera" ? "CAMERA SOURCE" : "AUDIO SOURCE"}</strong><span>Media จะส่งตรงไป Ant Media D1</span></div>}
          {status === "publishing" && <b><i /> LIVE DIRECT TO D1</b>}
        </section>
        <section className="source-panel">
          <p><Radio size={14} /> DIRECT D1 {kind.toUpperCase()}</p>
          <h1>{kind === "camera" ? "เชื่อมต่อกล้อง" : "เชื่อมต่อไมโครโฟน"}</h1>
          <label><span>STUDIO ID</span><input value={studioID} onChange={(event) => setStudioID(event.target.value)} disabled={busy} placeholder="default" /></label>
          <label><span>WEBRTC WEBSOCKET URL</span><input value={websocketUrl} onChange={(event) => setWebsocketUrl(event.target.value)} disabled={busy} /></label>
          <label><span>STREAM ID</span><input value={streamID} onChange={(event) => setStreamID(event.target.value)} disabled={busy} /></label>
          <label><span>SOURCE NAME</span><input value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} /></label>
          <label><span>PUBLISH TOKEN <small>ไม่บังคับ</small></span><input type="password" value={publishToken} onChange={(event) => setPublishToken(event.target.value)} disabled={busy} /></label>
          <div className={`source-message ${status}`}>{message}</div>
          {!busy
            ? <button className="primary" onClick={start}><Radio size={16} /> เริ่มส่งตรงไป D1</button>
            : <button className="danger" onClick={() => stop()}><Square size={15} /> หยุด Source</button>}
          <div className="source-log">{logs.length ? logs.map((line, index) => <code key={`${line}-${index}`}>{line}</code>) : <span>Connection events จะแสดงที่นี่</span>}</div>
        </section>
      </div>
    </main>
  );
}

function initialStudioID() {
  if (typeof window === "undefined") return "default";
  return new URLSearchParams(window.location.search).get("studio")?.trim() || "default";
}

function validStudioID(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function detailText(detail: unknown) {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") return detail.message;
  return "";
}
