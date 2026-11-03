"use client";

export default function Player({ src, title }) {
  if (!src) return <p className="empty">Video pawa jay nai.</p>;

  return (
    <div className="player-wrap">
      <video
        className="player"
        controls
        preload="metadata"
        playsInline
        src={src}
        aria-label={`${title} video player`}
      >
        Apnar browser ei video support kore na. Upore VLC button use korun.
      </video>
    </div>
  );
}