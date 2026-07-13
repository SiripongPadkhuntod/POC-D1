"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WebRTCAdaptor } from "@antmedia/webrtc_adaptor";
import { ArrowLeft, Camera, Mic, RadioTower, RefreshCw, Square, Volume2, VolumeX } from "lucide-react";
import { defaultProgramStreamID, defaultWebSocketURL } from "@/shared/config/media";
import { listSources, type D1Source } from "@/features/source-registry/api";

type AudioSetting = { enabled: boolean; volume: number };
type StudioStatus = "ready" | "connecting" | "live" | "error";

export default function StudioPage() {
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const programVideoRef = useRef<HTMLVideoElement>(null);
  const streamsRef = useRef(new Map<string, MediaStream>());
  const settingsRef = useRef<Record<string, AudioSetting>>({});
  const publisherRef = useRef<WebRTCAdaptor | null>(null);
  const returnPlayerRef = useRef<WebRTCAdaptor | null>(null);
  const programKeyRef = useRef("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioNodesRef = useRef(new Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode }>());
  const mountedRef = useRef(true);
  const stopRef = useRef<(update?: boolean) => void>(() => undefined);

  const [websocketUrl, setWebsocketUrl] = useState(defaultWebSocketURL);
  const [activeStudioID, setActiveStudioID] = useState(initialStudioID);
  const [studioIDInput, setStudioIDInput] = useState(initialStudioID);
  const [programStreamID, setProgramStreamID] = useState(() => programStreamForStudio(initialStudioID()));
  const [playToken, setPlayToken] = useState("");
  const [publishToken, setPublishToken] = useState("");
  const [sources, setSources] = useState<D1Source[]>([]);
  const [audioSettings, setAudioSettings] = useState<Record<string, AudioSetting>>({});
  const [previewCameraID, setPreviewCameraID] = useState<string | null>(null);
  const [programCameraID, setProgramCameraID] = useState<string | null>(null);
  const [streamVersion, setStreamVersion] = useState(0);
  const [status, setStatus] = useState<StudioStatus>("ready");
  const [message, setMessage] = useState("กำลังค้นหา Source ที่ต่อ D1 อยู่…");
  const [returnAudio, setReturnAudio] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const stream = previewCameraID ? streamsRef.current.get(previewCameraID) : null;
    if (previewVideoRef.current) previewVideoRef.current.srcObject = stream ?? null;
  }, [previewCameraID, streamVersion]);

  useEffect(() => {
    if (status === "live") return;
    const stream = programCameraID ? streamsRef.current.get(programCameraID) : null;
    if (programVideoRef.current) programVideoRef.current.srcObject = stream ?? null;
  }, [programCameraID, status, streamVersion]);

  const refreshSources = useCallback(async () => {
    try {
      const next = await listSources(activeStudioID);
      if (!mountedRef.current) return;
      setSources(next);
      setAudioSettings((current) => {
        const settings: Record<string, AudioSetting> = {};
        next.forEach((source) => { settings[source.id] = current[source.id] ?? { enabled: false, volume: 100 }; });
        settingsRef.current = settings;
        return settings;
      });
      const cameraIDs = next.filter((source) => source.kind === "camera").map((source) => source.id);
      setPreviewCameraID((current) => current && cameraIDs.includes(current) ? current : cameraIDs[0] ?? null);
      setProgramCameraID((current) => current && cameraIDs.includes(current) ? current : cameraIDs[0] ?? null);
      setMessage(next.length ? `Studio ${activeStudioID} พบ Source ออนไลน์ ${next.length} รายการ` : `Studio ${activeStudioID} ยังไม่มี Source ออนไลน์`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลด Source registry ไม่สำเร็จ");
    }
  }, [activeStudioID]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshSources();
    const timer = window.setInterval(() => void refreshSources(), 3_000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      stopRef.current(false);
      destroyAudioMixer();
    };
  }, [refreshSources]);

  function joinStudio() {
    const next = studioIDInput.trim();
    if (!validStudioID(next)) {
      setStatus("error");
      setMessage("Studio ID ใช้ได้เฉพาะตัวอักษร ตัวเลข _ และ -");
      return;
    }
    if (busy) {
      setMessage("กรุณาหยุด Program ก่อนเปลี่ยน Studio");
      return;
    }
    if (next === activeStudioID) {
      void refreshSources();
      return;
    }
    streamsRef.current.clear();
    setSources([]);
    setPreviewCameraID(null);
    setProgramCameraID(null);
    setStatus("ready");
    setMessage(`กำลังเข้า Studio ${next}…`);
    setProgramStreamID((current) => current === programStreamForStudio(activeStudioID) ? programStreamForStudio(next) : current);
    window.history.replaceState(null, "", `/studio?studio=${encodeURIComponent(next)}`);
    setActiveStudioID(next);
  }

  function handleSourceStream(id: string, stream: MediaStream | null) {
    if (stream) streamsRef.current.set(id, stream);
    else streamsRef.current.delete(id);
    setStreamVersion((value) => value + 1);
    log("SOURCE", stream ? "media_received" : "media_removed", id);
  }

  function log(scope: string, event: string, detail = "") {
    const line = `${new Date().toLocaleTimeString("th-TH", { hour12: false })}  ${scope.padEnd(7)} ${event}${detail ? ` · ${detail}` : ""}`;
    setLogs((current) => [...current.slice(-99), line]);
    console.info(`[POC-D1 STUDIO ${scope}] ${event}`, detail);
  }

  function updateAudio(id: string, patch: Partial<AudioSetting>) {
    const next = { ...settingsRef.current, [id]: { ...(settingsRef.current[id] ?? { enabled: false, volume: 100 }), ...patch } };
    settingsRef.current = next;
    setAudioSettings(next);
    if (status === "live") void syncAudioMixer();
  }

  async function syncAudioMixer() {
    prepareAudioMixer();
    const context = audioContextRef.current!;
    const destination = audioDestinationRef.current!;
    audioNodesRef.current.forEach(({ source, gain }) => { source.disconnect(); gain.disconnect(); });
    audioNodesRef.current.clear();
    Object.entries(settingsRef.current).forEach(([id, setting]) => {
      const track = streamsRef.current.get(id)?.getAudioTracks()[0];
      if (!setting.enabled || !track) return;
      const node = context.createMediaStreamSource(new MediaStream([track]));
      const gain = context.createGain();
      gain.gain.value = setting.volume / 100;
      node.connect(gain).connect(destination);
      audioNodesRef.current.set(id, { source: node, gain });
    });
    if (context.state === "suspended") await context.resume();
  }

  function prepareAudioMixer() {
    if (audioContextRef.current && audioDestinationRef.current) return;
    const context = new AudioContext();
    audioContextRef.current = context;
    audioDestinationRef.current = context.createMediaStreamDestination();
  }

  function destroyAudioMixer() {
    audioNodesRef.current.forEach(({ source, gain }) => { source.disconnect(); gain.disconnect(); });
    audioNodesRef.current.clear();
    if (audioContextRef.current) void audioContextRef.current.close();
    audioContextRef.current = null;
    audioDestinationRef.current = null;
  }

  async function startProgram() {
    const url = websocketUrl.trim();
    const key = programStreamID.trim();
    const videoTrack = programCameraID ? streamsRef.current.get(programCameraID)?.getVideoTracks()[0] : null;
    if ((!url.startsWith("wss://") && !url.startsWith("ws://")) || !key || !videoTrack) {
      setStatus("error");
      setMessage("ตรวจ WebSocket URL, Program Stream Key และเลือกกล้องที่มีสัญญาณก่อน");
      return;
    }
    setStatus("connecting");
    setMessage("กำลังผสมเสียงและเปิด Program Publisher…");
    log("PROGRAM", "start", `${url} · ${key}`);
    try {
      await syncAudioMixer();
      const audioTrack = audioDestinationRef.current!.stream.getAudioTracks()[0];
      const { WebRTCAdaptor } = await import("@antmedia/webrtc_adaptor");
      const programStream = new MediaStream([videoTrack, audioTrack]);
      programKeyRef.current = key;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const adaptor = new WebRTCAdaptor({
          websocket_url: url,
          localStream: programStream,
          mediaConstraints: { video: false, audio: false },
          peerconnection_config: { iceServers: [{ urls: "stun:stun1.l.google.com:19302" }] },
          sdp_constraints: { OfferToReceiveAudio: false, OfferToReceiveVideo: false },
          callback: (info: string) => {
            log("PUBLISH", info);
            if (info === "initialized") adaptor.publish(key, publishToken.trim() || undefined);
            if (info === "publish_started") {
              setStatus("live");
              setMessage(`กำลังส่ง Program ${key} เข้า D1 จริง`);
              if (!settled) { settled = true; resolve(); }
              startReturn(WebRTCAdaptor, url, key);
            }
          },
          callbackError: (error: string, detail?: unknown) => {
            const text = detailText(detail);
            log("PUBLISH", `ERROR ${error}`, text);
            if (!settled) { settled = true; reject(new Error(`${error}${text ? ` · ${text}` : ""}`)); }
          },
        });
        publisherRef.current = adaptor;
      });
    } catch (error) {
      stopProgram(false);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "เริ่ม Program ไม่สำเร็จ");
    }
  }

  function startReturn(Adaptor: typeof WebRTCAdaptor, url: string, key: string) {
    const player = new Adaptor({
      websocket_url: url,
      remoteVideoElement: programVideoRef.current,
      isPlayMode: true,
      mediaConstraints: { video: false, audio: false },
      peerconnection_config: { iceServers: [{ urls: "stun:stun1.l.google.com:19302" }] },
      callback: (info: string) => {
        log("RETURN", info);
        if (info === "initialized") player.play(key, playToken.trim() || undefined);
        if (info === "play_started") setMessage(`PROGRAM LIVE · D1 RETURN RECEIVED · ${key}`);
      },
      callbackError: (error: string, detail?: unknown) => log("RETURN", `ERROR ${error}`, detailText(detail)),
    });
    returnPlayerRef.current = player;
  }

  async function cut() {
    if (!previewCameraID) return;
    if (status === "live") {
      const track = streamsRef.current.get(previewCameraID)?.getVideoTracks()[0];
      const sender = publisherRef.current?.getSender(programKeyRef.current, "video") as RTCRtpSender | undefined;
      if (!track || !sender) { setMessage("Video sender หรือกล้อง Preview ยังไม่พร้อม"); return; }
      await sender.replaceTrack(track);
      log("PROGRAM", "cut_replace_track", previewCameraID);
    }
    setProgramCameraID(previewCameraID);
  }

  function stopProgram(update = true) {
    const key = programKeyRef.current;
    const player = returnPlayerRef.current;
    const publisher = publisherRef.current;
    returnPlayerRef.current = null;
    publisherRef.current = null;
    programKeyRef.current = "";
    if (player) { if (key) player.stop(key); player.closeWebSocket(); }
    if (publisher) { if (key) publisher.stop(key); publisher.closeWebSocket(); }
    if (programVideoRef.current) programVideoRef.current.srcObject = programCameraID ? streamsRef.current.get(programCameraID) ?? null : null;
    destroyAudioMixer();
    if (update && mountedRef.current) { setStatus("ready"); setMessage("หยุด Program แล้ว · Source ยังต่อ D1 อยู่"); log("PROGRAM", "stopped"); }
  }

  stopRef.current = stopProgram;
  const busy = status === "connecting" || status === "live";

  async function toggleReturnAudio() {
    const video = programVideoRef.current;
    if (!video) return;
    const next = !returnAudio;
    video.muted = !next;
    setReturnAudio(next);
    if (next) await video.play();
  }

  return (
    <main className="studio-page shell">
      <header className="studio-header"><Link href="/"><ArrowLeft size={16} /> POC-D1</Link><div><span>{sources.length} SOURCES</span><b className={status}><i /> {status.toUpperCase()}</b></div></header>
      <section className="studio-title"><p>DIRECT ANT MEDIA PRODUCTION · STUDIO {activeStudioID}</p><h1>Studio</h1><span>เห็นเฉพาะ Source ที่ลงทะเบียนด้วย Studio ID เดียวกัน</span></section>

      <section className="destination-panel">
        <div className="studio-selector">
          <label><span>STUDIO ID</span><input value={studioIDInput} onChange={(event) => setStudioIDInput(event.target.value)} disabled={busy} placeholder="default" /></label>
          <button className="primary" onClick={joinStudio} disabled={busy}>เข้า Studio</button>
        </div>
        <label className="wide"><span>WEBRTC WEBSOCKET URL</span><input value={websocketUrl} onChange={(event) => setWebsocketUrl(event.target.value)} disabled={busy} /></label>
        <label><span>PROGRAM STREAM KEY</span><input value={programStreamID} onChange={(event) => setProgramStreamID(event.target.value)} disabled={busy} /></label>
        <label><span>PLAY TOKEN <small>ไม่บังคับ</small></span><input type="password" value={playToken} onChange={(event) => setPlayToken(event.target.value)} disabled={busy} /></label>
        <label><span>PUBLISH TOKEN <small>ไม่บังคับ</small></span><input type="password" value={publishToken} onChange={(event) => setPublishToken(event.target.value)} disabled={busy} /></label>
        <div className={`studio-message ${status}`}>{message}</div>
      </section>

      <section className="monitor-grid">
        <Monitor title="PREVIEW" videoRef={previewVideoRef} badge={previewCameraID ?? "NO SOURCE"} />
        <button className="cut-button" onClick={cut} disabled={!previewCameraID || previewCameraID === programCameraID}><span>CUT</span><small>→</small></button>
        <Monitor title="PROGRAM / D1 RETURN" videoRef={programVideoRef} badge={status === "live" ? "ON AIR" : programCameraID ?? "OFF AIR"} live={status === "live"} />
      </section>

      <section className="sources-section">
        <header><div><strong>ONLINE SOURCES · STUDIO {activeStudioID}</strong><span>Source registry TTL 15 วินาที</span></div><button onClick={() => void refreshSources()}><RefreshCw size={14} /> Refresh</button></header>
        <div className="source-grid">
          {sources.length === 0 && <div className="empty-source">ยังไม่มี Camera/Microphone ที่ Publish อยู่บน D1</div>}
          {sources.map((source) => (
            <SourceReceiver
              key={`${source.websocketUrl}:${source.id}:${playToken}`}
              source={source}
              playToken={playToken}
              preview={previewCameraID === source.id}
              program={programCameraID === source.id}
              audio={audioSettings[source.id] ?? { enabled: false, volume: 100 }}
              onStream={handleSourceStream}
              onPreview={() => source.kind === "camera" && setPreviewCameraID(source.id)}
              onAudio={(patch) => updateAudio(source.id, patch)}
            />
          ))}
        </div>
      </section>

      <section className="studio-console"><header><strong>CONNECTION CONSOLE</strong><button onClick={() => setLogs([])}>CLEAR</button></header><div>{logs.length ? logs.map((line, index) => <code key={`${line}-${index}`}>{line}</code>) : <span>Events จะแสดงที่นี่</span>}</div></section>

      <footer className="studio-dock">
        <button className="return-audio" onClick={toggleReturnAudio} disabled={status !== "live"}>{returnAudio ? <Volume2 size={16} /> : <VolumeX size={16} />} {returnAudio ? "ปิดเสียง Return" : "เปิดเสียง Return"}</button>
        {status !== "live" ? <button className="primary" onClick={startProgram} disabled={status === "connecting" || !programCameraID}><RadioTower size={16} /> เริ่ม Program ไป D1</button> : <button className="danger" onClick={() => stopProgram()}><Square size={15} /> หยุด Program</button>}
      </footer>
    </main>
  );
}

function Monitor({ title, videoRef, badge, live }: { title: string; videoRef: React.RefObject<HTMLVideoElement | null>; badge: string; live?: boolean }) {
  return <div className="monitor"><header><strong>{title}</strong><span className={live ? "live" : ""}>{badge}</span></header><video ref={videoRef} autoPlay muted playsInline /><div className="monitor-empty">NO SIGNAL</div></div>;
}

function SourceReceiver({ source, playToken, preview, program, audio, onStream, onPreview, onAudio }: {
  source: D1Source;
  playToken: string;
  preview: boolean;
  program: boolean;
  audio: AudioSetting;
  onStream: (id: string, stream: MediaStream | null) => void;
  onPreview: () => void;
  onAudio: (patch: Partial<AudioSetting>) => void;
}) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const adaptorRef = useRef<WebRTCAdaptor | null>(null);
  const onStreamRef = useRef(onStream);
  const [state, setState] = useState("CONNECTING");
  onStreamRef.current = onStream;

  useEffect(() => {
    let disposed = false;
    void import("@antmedia/webrtc_adaptor").then(({ WebRTCAdaptor }) => {
      if (disposed) return;
      const adaptor = new WebRTCAdaptor({
        websocket_url: source.websocketUrl,
        remoteVideoElement: mediaRef.current,
        isPlayMode: true,
        mediaConstraints: { video: false, audio: false },
        peerconnection_config: { iceServers: [{ urls: "stun:stun1.l.google.com:19302" }] },
        callback: (info: string) => {
          if (disposed) return;
          if (info === "initialized") adaptor.play(source.id, playToken.trim() || undefined);
          if (info === "play_started") { setState("RECEIVING"); window.setTimeout(reportStream, 150); }
          if (info === "play_finished") setState("OFFLINE");
        },
        callbackError: (error: string) => setState(`ERROR · ${error}`),
      });
      adaptorRef.current = adaptor;
    });
    function reportStream() {
      const stream = mediaRef.current?.srcObject;
      if (stream instanceof MediaStream) onStreamRef.current(source.id, stream);
    }
    return () => {
      disposed = true;
      const adaptor = adaptorRef.current;
      adaptorRef.current = null;
      if (adaptor) { adaptor.stop(source.id); adaptor.closeWebSocket(); }
      onStreamRef.current(source.id, null);
    };
  }, [playToken, source.id, source.websocketUrl]);

  return (
    <article className={`receiver-card ${preview ? "preview" : ""} ${program ? "program" : ""}`}>
      <div className="receiver-media">
        <video ref={mediaRef} autoPlay muted playsInline onLoadedMetadata={() => { const stream = mediaRef.current?.srcObject; if (stream instanceof MediaStream) onStreamRef.current(source.id, stream); }} />
        {source.kind === "microphone" && <div className="audio-icon"><Mic size={32} /></div>}
        <span>{state}</span>
      </div>
      <div className="receiver-info"><div>{source.kind === "camera" ? <Camera size={15} /> : <Mic size={15} />}<strong>{source.label}</strong></div><code>{source.id}</code></div>
      <div className="receiver-actions">
        {source.kind === "camera" && <button onClick={onPreview} className={preview ? "active" : ""}>PREVIEW</button>}
        <label><input type="checkbox" checked={audio.enabled} onChange={(event) => onAudio({ enabled: event.target.checked })} /> MIX AUDIO</label>
        <input type="range" min="0" max="150" value={audio.volume} onChange={(event) => onAudio({ volume: Number(event.target.value) })} />
        <small>{audio.volume}%</small>
      </div>
    </article>
  );
}

function detailText(detail: unknown) {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") return detail.message;
  return "";
}

function initialStudioID() {
  if (typeof window === "undefined") return "default";
  return new URLSearchParams(window.location.search).get("studio")?.trim() || "default";
}

function validStudioID(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function programStreamForStudio(studioID: string) {
  return studioID === "default" ? defaultProgramStreamID : `${defaultProgramStreamID}-${studioID}`;
}
