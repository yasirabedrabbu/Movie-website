"use client";

import { useState } from "react";

const NATIVE = ["mp4", "webm", "m4v"];

export default function Player({ src, title }) {
  const [failed, setFailed] = useState(false);

  if (!src) return <p className="empty">Video not found.</p>;

  const ext = src.split("?")[0].split(".").pop().toLowerCase();

  if (!NATIVE.includes(ext) || failed) {
    return (
      <div className="player-wrap player-unsupported" role="note">
        <p>This browser can&apos;t play this file. Use Open in VLC or Download below.</p>
      </div>
    );
  }

  return (
    <div className="player-wrap">
      <video
        className="player"
        controls
        preload="metadata"
        playsInline
        src={src}
        aria-label={`${title} video player`}
        onError={() => setFailed(true)}
      >
        Your browser does not support this video.
      </video>
    </div>
  );
}