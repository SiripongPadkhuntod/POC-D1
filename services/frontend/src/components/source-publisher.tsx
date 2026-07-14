"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WebRTCAdaptor } from "@antmedia/webrtc_adaptor";
import { ArrowLeft, Camera, FileVideo, Mic, Radio, Square } from "lucide-react";
import { browserWebSocketURL, defaultWebSocketURL, randomStreamID } from "@/shared/config/media";
import { registerSource, unregisterSource, type SourceKind } from "@/features/source-registry/api";

type Status = "idle" | "connecting" | "publishing" | "error";
type ActualVideo = { width?: number; height?: number; frameRate?: number };
type VideoSourceMode = "device" | "file";

export function SourcePublisher({ kind }: { kind: SourceKind }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const adaptorRef = useRef<WebRTCAdaptor | null>(null);
  const activeLocalStreamRef = useRef<MediaStream | null>(null);
  const fileURLRef = useRef("");
  const heartbeatRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const stopRef = useRef<(update?: boolean) => void>(() => undefined);

  const [websocketUrl, setWebsocketUrl] = useState(defaultWebSocketURL);
  const [studioID, setStudioID] = useState(initialStudioID);
  const [streamID, setStreamID] = useState("");
  const [label, setLabel] = useState(kind === "camera" ? "Camera" : "Microphone");
  const [publishToken, setPublishToken] = useState("");
  const [videoSourceMode, setVideoSourceMode] = useState<VideoSourceMode>("device");
  const [videoFileURL, setVideoFileURL] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [loopVideo, setLoopVideo] = useState(true);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDeviceID, setVideoDeviceID] = useState("");
  const [audioDeviceID, setAudioDeviceID] = useState("");
  const [actualVideo, setActualVideo] = useState<ActualVideo | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("พร้อมเชื่อมต่อ D1 จริง");
  const [logs, setLogs] = useState<string[]>([]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!mountedRef.current) return;
      const videos = devices.filter((device) => device.kind === "videoinput");
      const audios = devices.filter((device) => device.kind === "audioinput");
      setVideoDevices(videos);
      setAudioDevices(audios);
      setVideoDeviceID((current) => current && videos.some((device) => device.deviceId === current) ? current : videos[0]?.deviceId ?? "");
      setAudioDeviceID((current) => current && audios.some((device) => device.deviceId === current) ? current : audios[0]?.deviceId ?? "");
    } catch (error) {
      console.info("[POC-D1 DEVICE] device_list_error", error);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setWebsocketUrl(browserWebSocketURL());
    setStreamID(randomStreamID(kind));
    void refreshDevices();
    const handleDeviceChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);
    return () => {
      mountedRef.current = false;
      navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange);
      stopRef.current(false);
      if (fileURLRef.current) URL.revokeObjectURL(fileURLRef.current);
    };
  }, [kind, refreshDevices]);

  function log(event: string, detail = "") {
    const line = `${new Date().toLocaleTimeString("th-TH", { hour12: false })}  ${event}${detail ? ` · ${detail}` : ""}`;
    setLogs((current) => [...current.slice(-49), line]);
    console.info(`[POC-D1 ${kind.toUpperCase()}] ${event}`, detail);
  }

  function selectVideoFile(file?: File) {
    if (fileURLRef.current) URL.revokeObjectURL(fileURLRef.current);
    const url = file ? URL.createObjectURL(file) : "";
    fileURLRef.current = url;
    setVideoFileURL(url);
    setVideoFileName(file?.name ?? "");
    setActualVideo(null);
    setMessage(file ? `เลือกไฟล์ ${file.name} แล้ว · พร้อมส่งเข้า D1` : "กรุณาเลือกไฟล์วิดีโอ");
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
    if (kind === "camera" && videoSourceMode === "file" && !videoFileURL) {
      setStatus("error");
      setMessage("กรุณาเลือกไฟล์ MP4 หรือ Video ก่อนเริ่มส่ง");
      return;
    }
    stop(false);
    setActualVideo(null);
    setStatus("connecting");
    setMessage("กำลังเปิดอุปกรณ์และเชื่อม Ant Media…");
    log("connect_start", `studio=${studio} · ${url} · ${id}`);
    let heartbeatOwner: WebRTCAdaptor | null = null;
    const audioConstraints: MediaTrackConstraints = {
      ...(audioDeviceID ? { deviceId: { exact: audioDeviceID } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const videoConstraints: MediaTrackConstraints = {
      ...(videoDeviceID ? { deviceId: { exact: videoDeviceID } } : {}),
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    };

    try {
      const { WebRTCAdaptor } = await import("@antmedia/webrtc_adaptor");
      if (!mountedRef.current) return;
      const fileStream = kind === "camera" && videoSourceMode === "file" ? await captureVideoFile() : null;
      activeLocalStreamRef.current = fileStream;
      const adaptor = new WebRTCAdaptor({
        websocket_url: url,
        reconnectIfRequiredFlag: false,
        ...(fileStream ? { localStream: fileStream } : { localVideoElement: videoRef.current }),
        mediaConstraints: fileStream
          ? { video: false, audio: false }
          : kind === "camera"
            ? { video: videoConstraints, audio: audioConstraints }
            : { video: false, audio: audioConstraints },
        peerconnection_config: { iceServers: [{ urls: "stun:stun1.l.google.com:19302" }] },
        sdp_constraints: { OfferToReceiveAudio: false, OfferToReceiveVideo: false },
        callback: (info: string) => {
          if (!mountedRef.current) return;
          log(info);
          if (info === "available_devices" && !fileStream) void refreshDevices();
          if (kind === "camera" && (info === "available_devices" || info === "publish_started")) reportActualVideo();
          if (info === "initialized") {
            adaptor.publish(id, publishToken.trim() || undefined);
          } else if (info === "publish_started") {
            setStatus("publishing");
            setMessage(`กำลังส่ง ${id} เข้า Studio ${studio}`);
            void heartbeat();
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
      heartbeatOwner = adaptor;
      adaptorRef.current = adaptor;
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "เริ่ม publisher ไม่สำเร็จ");
    }

    async function captureVideoFile() {
      const video = videoRef.current as (HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }) | null;
      if (!video) throw new Error("Video element ยังไม่พร้อม");
      const capture = video.captureStream ?? video.mozCaptureStream;
      if (!capture) throw new Error("Browser นี้ไม่รองรับการส่ง Video File · กรุณาใช้ Chrome หรือ Edge");
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("Browser เปิดไฟล์วิดีโอนี้ไม่ได้")), { once: true });
        });
      }
      video.loop = loopVideo;
      video.currentTime = 0;
      await video.play();
      const stream = capture.call(video);
      if (!stream.getVideoTracks().length) throw new Error("ไม่พบ Video track ในไฟล์นี้");
      log("file_capture", `${videoFileName} · ${video.videoWidth}×${video.videoHeight} · audio=${stream.getAudioTracks().length > 0}`);
      return stream;
    }

    async function heartbeat() {
      try {
        await registerSource({ studioId: studio, id, kind, label: label.trim(), websocketUrl: url });
      } catch (error) {
        log("registry_heartbeat_error", error instanceof Error ? error.message : String(error));
      } finally {
        if (mountedRef.current && heartbeatOwner && adaptorRef.current === heartbeatOwner) {
          heartbeatRef.current = window.setTimeout(() => void heartbeat(), 10_000);
        }
      }
    }

    function reportActualVideo(attempt = 0) {
      const stream = (videoRef.current?.srcObject as MediaStream | null) ?? activeLocalStreamRef.current;
      const track = stream?.getVideoTracks()[0];
      if (!track) {
        if (mountedRef.current && adaptorRef.current && attempt < 20) window.setTimeout(() => reportActualVideo(attempt + 1), 250);
        return;
      }
      const settings = track.getSettings();
      const actual = { width: settings.width ?? videoRef.current?.videoWidth, height: settings.height ?? videoRef.current?.videoHeight, frameRate: settings.frameRate };
      setActualVideo(actual);
      log("capture_settings", `${actual.width ?? "?"}×${actual.height ?? "?"} @ ${actual.frameRate?.toFixed(1) ?? "?"} FPS · device/browser default`);
    }
  }

  function stop(update = true) {
    if (heartbeatRef.current) window.clearTimeout(heartbeatRef.current);
    heartbeatRef.current = null;
    const id = streamID.trim();
    if (id) void unregisterSource(studioID.trim() || "default", id);
    const adaptor = adaptorRef.current;
    adaptorRef.current = null;
    activeLocalStreamRef.current = null;
    if (adaptor) {
      if (id) adaptor.stop(id);
      adaptor.closeWebSocket();
      adaptor.closeStream();
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (kind === "camera" && videoSourceMode === "file") {
      videoRef.current?.pause();
      if (videoRef.current) videoRef.current.currentTime = 0;
    }
    if (update && mountedRef.current) {
      setStatus("idle");
      setMessage("หยุด Source แล้ว");
      log("stopped");
    }
  }

  stopRef.current = stop;
  const busy = status === "connecting" || status === "publishing";
  const Icon = kind === "camera" ? (videoSourceMode === "file" ? FileVideo : Camera) : Mic;

  return (
    <main className="source-page">
      <header className="source-header"><Link href="/"><ArrowLeft size={16} /> กลับหน้าหลัก</Link><span className={status}><i /> {status.toUpperCase()}</span></header>
      <div className="source-shell">
        <section className={`source-preview ${kind}`}>
          <video ref={videoRef} src={kind === "camera" && videoSourceMode === "file" ? videoFileURL : undefined} autoPlay muted playsInline loop={loopVideo} />
          {status !== "publishing" && <div><Icon size={44} /><strong>{kind === "camera" ? "CAMERA SOURCE" : "AUDIO SOURCE"}</strong><span>Media จะส่งตรงไป Ant Media D1</span></div>}
          {status === "publishing" && <b><i /> LIVE DIRECT TO D1</b>}
          {kind === "camera" && actualVideo && <em className="actual-video">ACTUAL · {actualVideo.width ?? "?"}×{actualVideo.height ?? "?"} @ {actualVideo.frameRate?.toFixed(1) ?? "?"} FPS</em>}
        </section>
        <section className="source-panel">
          <p><Radio size={14} /> DIRECT D1 {kind.toUpperCase()}</p>
          <h1>{kind === "camera" ? "เชื่อมต่อกล้อง" : "เชื่อมต่อไมโครโฟน"}</h1>
          <label><span>STUDIO ID</span><input value={studioID} onChange={(event) => setStudioID(event.target.value)} disabled={busy} placeholder="default" /></label>
          <label><span>WEBRTC WEBSOCKET URL</span><input value={websocketUrl} onChange={(event) => setWebsocketUrl(event.target.value)} disabled={busy} /></label>
          <label><span>STREAM ID</span><input value={streamID} onChange={(event) => setStreamID(event.target.value)} disabled={busy} /></label>
          <label><span>SOURCE NAME</span><input value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} /></label>
          {kind === "camera" && <label><span>VIDEO SOURCE</span><select value={videoSourceMode} onChange={(event) => setVideoSourceMode(event.target.value as VideoSourceMode)} disabled={busy}><option value="device">Camera Device</option><option value="file">MP4 / Video File</option></select></label>}
          {kind === "camera" && videoSourceMode === "device" && <label><span>VIDEO INPUT</span><select value={videoDeviceID} onChange={(event) => setVideoDeviceID(event.target.value)} disabled={busy}><option value="">Default camera</option>{videoDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>}
          {kind === "camera" && videoSourceMode === "file" && <><label><span>VIDEO FILE</span><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => selectVideoFile(event.target.files?.[0])} disabled={busy} /><small>{videoFileName || "รองรับ MP4, WebM และ MOV ที่ Browser เล่นได้"}</small></label><label className="source-check"><input type="checkbox" checked={loopVideo} onChange={(event) => setLoopVideo(event.target.checked)} disabled={busy} /><span>LOOP VIDEO</span></label></>}
          {(kind === "microphone" || videoSourceMode === "device") && <label><span>AUDIO INPUT</span><select value={audioDeviceID} onChange={(event) => setAudioDeviceID(event.target.value)} disabled={busy}><option value="">Default microphone</option>{audioDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select><small>รายการจะอัปเดตเมื่ออนุญาตหรือเสียบอุปกรณ์ใหม่</small></label>}
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
