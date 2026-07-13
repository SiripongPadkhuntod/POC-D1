"use client";

import { useEffect, useRef, useState } from "react";
import type { WebRTCAdaptor } from "@antmedia/webrtc_adaptor";

type StatsSnapshot = {
  estimatedDelay: string;
  rtt: string;
  jitter: string;
  bitrate: string;
  packetLoss: string;
  fps: string;
};

type PreviousSample = {
  timestamp: number;
  bytesReceived: number;
  packetsReceived: number;
  packetsLost: number;
  framesDecoded: number;
};

const emptyStats: StatsSnapshot = {
  estimatedDelay: "—",
  rtt: "—",
  jitter: "—",
  bitrate: "—",
  packetLoss: "—",
  fps: "—",
};

export function useWebRTCStats(
  adaptorRef: { current: WebRTCAdaptor | null },
  streamID: string,
  active: boolean,
) {
  const [stats, setStats] = useState<StatsSnapshot>(emptyStats);
  const previousRef = useRef<PreviousSample | null>(null);

  useEffect(() => {
    previousRef.current = null;
    if (!active) {
      setStats(emptyStats);
      return;
    }

    let disposed = false;
    let polling = false;

    async function update() {
      if (polling) return;
      const connection = peerConnectionFor(adaptorRef.current, streamID);
      if (!connection) return;
      polling = true;
      try {
        const reports = await connection.getStats();
        if (disposed) return;
        let inbound: RTCInboundRtpStreamStats | undefined;
        let rttSeconds: number | undefined;

        reports.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "video" && !report.isRemote) {
            inbound = report as RTCInboundRtpStreamStats;
          }
          if (report.type === "candidate-pair" && report.state === "succeeded" && (report.selected || report.nominated)) {
            const value = Number(report.currentRoundTripTime);
            if (Number.isFinite(value)) rttSeconds = value;
          }
          if (report.type === "remote-inbound-rtp" && report.kind === "video" && rttSeconds === undefined) {
            const value = Number(report.roundTripTime);
            if (Number.isFinite(value)) rttSeconds = value;
          }
        });

        if (!inbound) return;
        const now = Number(inbound.timestamp) || performance.now();
        const current: PreviousSample = {
          timestamp: now,
          bytesReceived: Number(inbound.bytesReceived) || 0,
          packetsReceived: Number(inbound.packetsReceived) || 0,
          packetsLost: Number(inbound.packetsLost) || 0,
          framesDecoded: Number(inbound.framesDecoded) || 0,
        };
        const previous = previousRef.current;
        const elapsedSeconds = previous ? Math.max((current.timestamp - previous.timestamp) / 1000, 0.001) : 0;
        const receivedDelta = previous ? Math.max(current.packetsReceived - previous.packetsReceived, 0) : current.packetsReceived;
        const lostDelta = previous ? Math.max(current.packetsLost - previous.packetsLost, 0) : Math.max(current.packetsLost, 0);
        const packetTotal = receivedDelta + lostDelta;
        const directFps = Number(inbound.framesPerSecond);
        const calculatedFps = previous && elapsedSeconds ? Math.max(current.framesDecoded - previous.framesDecoded, 0) / elapsedSeconds : NaN;
        const rttMs = rttSeconds === undefined ? NaN : rttSeconds * 1000;

        previousRef.current = current;
        setStats({
          estimatedDelay: Number.isFinite(rttMs) ? formatMs(rttMs / 2) : "—",
          rtt: Number.isFinite(rttMs) ? formatMs(rttMs) : "—",
          jitter: Number.isFinite(Number(inbound.jitter)) ? formatMs(Number(inbound.jitter) * 1000) : "—",
          bitrate: previous && elapsedSeconds
            ? formatBitrate(Math.max(current.bytesReceived - previous.bytesReceived, 0) * 8 / elapsedSeconds)
            : "—",
          packetLoss: packetTotal ? `${(lostDelta / packetTotal * 100).toFixed(2)}%` : "0.00%",
          fps: Number.isFinite(directFps) ? `${directFps.toFixed(1)} fps` : Number.isFinite(calculatedFps) ? `${calculatedFps.toFixed(1)} fps` : "—",
        });
      } catch {
        // The peer connection can disappear while stop/close is in progress.
      } finally {
        polling = false;
      }
    }

    void update();
    const timer = window.setInterval(() => void update(), 1_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [active, adaptorRef, streamID]);

  return stats;
}

export function WebRTCStats({ stats, compact = false }: { stats: StatsSnapshot; compact?: boolean }) {
  const items: Array<[string, string]> = [
    ["Estimated Delay (RTT ÷ 2)", stats.estimatedDelay],
    ["WebRTC RTT", stats.rtt],
    ["Jitter", stats.jitter],
    ["Video Bitrate", stats.bitrate],
    ["Packet Loss", stats.packetLoss],
    ["Video FPS", stats.fps],
  ];
  return (
    <div className={`webrtc-stats${compact ? " compact" : ""}`}>
      {items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
  );
}

function peerConnectionFor(adaptor: WebRTCAdaptor | null, streamID: string) {
  if (!adaptor) return null;
  const internal = adaptor as WebRTCAdaptor & {
    peerconnection_list?: Record<string, RTCPeerConnection>;
    remotePeerConnection?: Record<string, RTCPeerConnection>;
  };
  return internal.peerconnection_list?.[streamID] ?? internal.remotePeerConnection?.[streamID] ?? null;
}

function formatMs(value: number) {
  return `${value < 10 ? value.toFixed(1) : value.toFixed(0)} ms`;
}

function formatBitrate(bitsPerSecond: number) {
  return bitsPerSecond >= 1_000_000
    ? `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`
    : `${(bitsPerSecond / 1_000).toFixed(0)} kbps`;
}
