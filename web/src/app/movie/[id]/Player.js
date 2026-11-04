"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Stable references so defaults never change identity between renders.
const NO_SUBS = [];
const NO_CUES = [];

const LANGS = {
  eng: "English", hin: "Hindi", ben: "Bengali", tam: "Tamil", tel: "Telugu",
  mal: "Malayalam", kan: "Kannada", urd: "Urdu", kor: "Korean", jpn: "Japanese",
  chi: "Chinese", zho: "Chinese", fre: "French", fra: "French", ger: "German",
  deu: "German", spa: "Spanish", ita: "Italian", rus: "Russian", ara: "Arabic",
  por: "Portuguese", tha: "Thai", tur: "Turkish",
};

const ICONS = {
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  volume:
    "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1c2.9.9 5 3.5 5 6.7s-2.1 5.8-5 6.7v2.1c4-.9 7-4.5 7-8.8s-3-7.9-7-8.8z",
  mute:
    "M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.5 2.5V12zM19 12c0 .9-.2 1.8-.5 2.6l1.5 1.5A8.8 8.8 0 0 0 21 12c0-4.3-3-7.9-7-8.8v2.1c2.9.9 5 3.5 5 6.7zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.2 4.2c-.7.5-1.4.9-2.2 1.2v2.1a9 9 0 0 0 3.6-1.8l2.1 2.1 1.3-1.3L4.3 3zM12 4 9.9 6.1 12 8.2V4z",
  full: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
  exit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
};

function Svg({ d, size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

// ---------- helpers ----------
function fmt(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function audioLabel(a, i) {
  const lang =
    LANGS[a.lang] ||
    a.title ||
    (a.lang && a.lang !== "und" ? a.lang.toUpperCase() : `Track ${i + 1}`);
  const ch =
    a.channels === 6 ? "5.1" : a.channels === 8 ? "7.1" : a.channels === 2 ? "2.0" : a.channels ? `${a.channels}ch` : "";
  return [lang, a.codec?.toUpperCase(), ch].filter(Boolean).join(" · ");
}

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Only <i> <b> <u> survive. Everything else is escaped, so cue text can never inject HTML.
function cleanCue(text) {
  const stripped = text
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/<\d{1,2}:\d{2}(?::\d{2})?\.\d{3}>/g, "")
    .replace(/<\/?(?:font|c|v|ruby|rt|rp|lang)(?:[ .][^>]*)?>/gi, "");
  return stripped
    .split(/(<\/?(?:i|b|u)>)/i)
    .map((p) => (/^<\/?(?:i|b|u)>$/i.test(p) ? p.toLowerCase() : escapeHtml(decodeEntities(p))))
    .join("")
    .replace(/\n/g, "<br/>");
}

function parseVtt(text) {
  const toSec = (h, m, s, ms) =>
    (Number(h) || 0) * 3600 +
    Number(m) * 60 +
    Number(s) +
    parseInt(String(ms).padEnd(3, "0").slice(0, 3), 10) / 1000;
  const cues = [];
  for (const block of text.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const m = lines[i].match(
      /(?:(\d+):)?(\d+):(\d+)[.,](\d+)\s*-->\s*(?:(\d+):)?(\d+):(\d+)[.,](\d+)/
    );
    if (!m) continue;
    const body = lines.slice(i + 1).join("\n").trim();
    if (!body) continue;
    cues.push({
      start: toSec(m[1], m[2], m[3], m[4]),
      end: toSec(m[5], m[6], m[7], m[8]),
      html: cleanCue(body),
    });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function activeHtml(cues, t) {
  let out = "";
  for (const c of cues) {
    if (c.start > t) break;
    if (t < c.end) out += (out ? "<br/>" : "") + c.html;
  }
  return out;
}

function subLabel(s) {
  const lang =
    LANGS[s.lang] || (s.lang && s.lang !== "und" ? s.lang.toUpperCase() : `Subtitle ${s.index + 1}`);
  return s.title && s.title !== lang ? `${lang} · ${s.title}` : lang;
}

function fileName(url) {
  const last = url.split("/").pop();
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
// ---------- end helpers ----------

export default function Player({ src, title, subtitles = NO_SUBS }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const hideTimer = useRef(null);
  const wantPlay = useRef(false);
  const cueCache = useRef(new Map());
  const lastSub = useRef(null);

  const [base, setBase] = useState("");
  const [status, setStatus] = useState("loading");
  const [info, setInfo] = useState(null);
  const [noServer, setNoServer] = useState(false);
  const [direct, setDirect] = useState(false);
  const [transcode, setTranscode] = useState(false);
  const [audio, setAudio] = useState(0);
  const [offset, setOffset] = useState(0);
  const [time, setTime] = useState(0);
  const [nativeDur, setNativeDur] = useState(0);
  const [bufEnd, setBufEnd] = useState(0);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [isFs, setIsFs] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [menu, setMenu] = useState(null);
  const [preview, setPreview] = useState(null);
  const [failed, setFailed] = useState(false);

  const [subId, setSubId] = useState(null);
  const [cues, setCues] = useState(NO_CUES);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState("");
  const [subDelay, setSubDelay] = useState(0);
  const [subHtml, setSubHtml] = useState("");

  // Depend on the *content* of the subtitle list, not its identity,
  // so an inline array from the parent can't retrigger effects every render.
  const subKey = (subtitles || NO_SUBS).join("\n");
  const externalSubs = useMemo(() => (subKey ? subKey.split("\n") : NO_SUBS), [subKey]);

  // 1. Ask the media server what is inside the file.
  useEffect(() => {
    if (!src) return;
    const b = (
      process.env.NEXT_PUBLIC_MEDIA_SERVER_URL ||
      `${window.location.protocol}//${window.location.hostname}:4000`
    ).replace(/\/+$/, "");
    setBase(b);
    setStatus("loading");
    setInfo(null);
    setNoServer(false);
    setTranscode(false);
    setFailed(false);
    setAudio(0);
    setOffset(0);
    setTime(0);
    setBufEnd(0);
    setNativeDur(0);
    setStarted(false);
    setPlaying(false);
    setSubId(null);
    setSubDelay(0);
    lastSub.current = null;
    wantPlay.current = false;

    const ctrl = new AbortController();
    fetch(`${b}/info?src=${encodeURIComponent(src)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`info ${r.status}`))))
      .then((data) => {
        setInfo(data);
        setDirect(Boolean(data.directPlay));
        setStatus("ready");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        // Media server is off: try the raw file like a normal <video>.
        setNoServer(true);
        setDirect(true);
        setStatus("ready");
      });
    return () => ctrl.abort();
  }, [src]);

  const audioTracks = info?.audio || NO_SUBS;

  // Embedded subtitles (inside the MKV) + external .srt/.vtt files next to the movie.
  const subTracks = useMemo(() => {
    if (!info || !base) return NO_SUBS;
    const embedded = (info.subs || []).map((s) => ({
      id: `e${s.index}`,
      label: subLabel(s),
      url: `${base}/sub?src=${encodeURIComponent(src)}&index=${s.index}`,
    }));
    const external = externalSubs.map((u, i) => ({
      id: `x${i}`,
      label: `External ${i + 1}`,
      hint: fileName(u),
      url: `${base}/sub?src=${encodeURIComponent(u)}&external=1`,
    }));
    return [...embedded, ...external];
  }, [info, base, src, externalSubs]);

  // 2. Load the chosen subtitle track.
  useEffect(() => {
    // Functional updates return the same value when nothing changes,
    // so React bails out instead of re-rendering.
    const resetCues = () => setCues((c) => (c.length ? NO_CUES : c));
    const clearError = () => setSubError((e) => (e ? "" : e));

    if (!subId) {
      resetCues();
      clearError();
      setSubLoading(false);
      return;
    }
    const track = subTracks.find((t) => t.id === subId);
    if (!track) return;

    const cached = cueCache.current.get(track.url);
    if (cached) {
      setCues(cached);
      clearError();
      setSubLoading(false);
      return;
    }

    const ctrl = new AbortController();
    setSubLoading(true);
    clearError();
    resetCues();
    fetch(track.url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("Could not load this subtitle"))))
      .then((text) => {
        const parsed = parseVtt(text);
        if (!parsed.length) throw new Error("This subtitle track is empty");
        cueCache.current.set(track.url, parsed);
        setCues(parsed);
        setSubLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setSubError(err.message || "Could not load this subtitle");
        setSubLoading(false);
      });
    return () => ctrl.abort();
  }, [subId, subTracks]);

  const dur = direct || !info ? nativeDur : info.duration || nativeDur;
  const abs = direct ? time : offset + time;
  const shown = preview ?? abs;
  const playedPct = dur ? Math.min(100, (shown / dur) * 100) : 0;
  const bufPct = dur ? Math.min(100, (((direct ? 0 : offset) + bufEnd) / dur) * 100) : 0;

  const videoSrc =
    status !== "ready"
      ? undefined
      : direct
        ? src
        : `${base}/stream?src=${encodeURIComponent(src)}&audio=${audio}&start=${offset}${transcode ? "&mode=transcode" : ""}`;

  // 3. Show the cue that matches the current time.
  const computeSub = useCallback(() => {
    const v = videoRef.current;
    if (!v || !cues.length) {
      setSubHtml("");
      return;
    }
    setSubHtml(activeHtml(cues, (direct ? 0 : offset) + v.currentTime - subDelay));
  }, [cues, direct, offset, subDelay]);

  useEffect(() => {
    computeSub();
  }, [computeSub, time]);

  useEffect(() => {
    if (!playing || !cues.length) return;
    let id = requestAnimationFrame(function loop() {
      computeSub();
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [playing, cues, computeSub]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted, videoSrc]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.defaultPlaybackRate = rate;
    v.playbackRate = rate;
  }, [rate, videoSrc]);

  useEffect(() => {
    const on = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Close any open menu on outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e) => {
      if (!e.target.closest?.(".pl-menuwrap")) setMenu(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const poke = useCallback(() => {
    setShowUi(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowUi(false), 3000);
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setStarted(true);
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  const toggleFs = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  const seekTo = useCallback(
    (target) => {
      const v = videoRef.current;
      if (!v) return;
      const t = Math.max(0, dur ? Math.min(target, dur - 1) : target);

      if (direct) {
        v.currentTime = t;
        return;
      }

      // Already downloaded? Cheap seek.
      const rel = t - offset;
      for (let i = 0; i < v.buffered.length; i++) {
        if (rel >= v.buffered.start(i) && rel <= v.buffered.end(i) - 0.5) {
          v.currentTime = rel;
          return;
        }
      }

      // Not downloaded: restart the stream from there.
      wantPlay.current = !v.paused;
      setOffset(Math.floor(t));
      setTime(0);
      setBufEnd(0);
      setWaiting(true);
      setPlaying(false);
    },
    [direct, dur, offset]
  );

  const changeAudio = (i) => {
    const v = videoRef.current;
    wantPlay.current = v ? !v.paused : false;
    setOffset(Math.floor(abs));
    setTime(0);
    setBufEnd(0);
    setAudio(i);
    setWaiting(true);
    setPlaying(false);
    setMenu(null);
  };

  const pickSub = (id) => {
    setSubId(id);
    if (id) lastSub.current = id;
    setMenu(null);
  };

  const syncBuffered = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++) {
      if (t >= v.buffered.start(i) - 0.25 && t <= v.buffered.end(i)) {
        end = v.buffered.end(i);
        break;
      }
    }
    setBufEnd(end);
  };

  const onError = () => {
    // Raw file failed but the server is up: let the server convert it.
    if (direct && info && !noServer) {
      wantPlay.current = started;
      setOffset(Math.floor(abs));
      setTime(0);
      setDirect(false);
      setWaiting(true);
      setPlaying(false);
      return;
    }
    // Server copy failed right at the start: retry with full video transcode.
    if (!direct && !transcode && time < 3) {
      wantPlay.current = started;
      setTranscode(true);
      setWaiting(true);
      setPlaying(false);
      return;
    }
    setFailed(true);
    setWaiting(false);
  };

  const commitSeek = () => {
    if (preview != null) {
      seekTo(preview);
      setPreview(null);
    }
  };

  const onKeyDown = (e) => {
    const tag = e.target.tagName;
    // Let buttons handle Space/Enter, and sliders handle their own arrow keys.
    if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    if (tag === "INPUT" && e.key.startsWith("Arrow")) return;

    const k = e.key.toLowerCase();
    if (k === " " || k === "k") toggle();
    else if (k === "arrowleft" || k === "j") seekTo(abs - 10);
    else if (k === "arrowright" || k === "l") seekTo(abs + 10);
    else if (k === "arrowup") setVolume((x) => Math.min(1, +(x + 0.1).toFixed(2)));
    else if (k === "arrowdown") setVolume((x) => Math.max(0, +(x - 0.1).toFixed(2)));
    else if (k === "m") setMuted((x) => !x);
    else if (k === "f") toggleFs();
    else if (k === "c" && subTracks.length) setSubId((cur) => (cur ? null : lastSub.current || subTracks[0].id));
    else return;
    e.preventDefault();
    poke();
  };

  if (!src) return <p className="empty">Video not found.</p>;

  if (failed) {
    return (
      <div className="pl pl-fail" role="note">
        <p>This file can&apos;t be played in the browser.</p>
        <p className="card-meta">
          {noServer
            ? "The media server is not running. Open a terminal, go to the media-server folder and run: node server.mjs"
            : "Use Open in VLC or Download below."}
        </p>
      </div>
    );
  }

  const uiOn = showUi || !playing || menu;
  const toggleMenu = (name) => setMenu((m) => (m === name ? null : name));

  return (
    <div
      ref={wrapRef}
      className={`pl${uiOn ? " pl-ui" : ""}${isFs ? " pl-fs" : ""}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={poke}
      onTouchStart={poke}
      aria-label={`${title} video player`}
    >
      <video
        ref={videoRef}
        className="pl-video"
        src={videoSrc}
        preload={direct ? "metadata" : started ? "auto" : "none"}
        playsInline
        onClick={toggle}
        onDoubleClick={toggleFs}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime);
          syncBuffered();
        }}
        onProgress={syncBuffered}
        onLoadedMetadata={(e) => {
          if (direct && Number.isFinite(e.currentTarget.duration)) setNativeDur(e.currentTarget.duration);
        }}
        onDurationChange={(e) => {
          if (direct && Number.isFinite(e.currentTarget.duration)) setNativeDur(e.currentTarget.duration);
        }}
        onCanPlay={(e) => {
          setWaiting(false);
          if (wantPlay.current) {
            wantPlay.current = false;
            e.currentTarget.play().catch(() => {});
          }
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => {
          setWaiting(false);
          setPlaying(true);
        }}
        onPlay={() => {
          setStarted(true);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={onError}
      />

      {subHtml && (
        <div className="pl-sub" aria-live="off">
          <span dangerouslySetInnerHTML={{ __html: subHtml }} />
        </div>
      )}

      {(subLoading || subError) && (
        <div className="pl-chip" role="status">
          {subLoading ? "Loading subtitles… (first time can take a minute)" : subError}
        </div>
      )}

      {(waiting || status === "loading") && <div className="pl-spinner" aria-label="Loading" />}

      {!playing && !waiting && status === "ready" && (
        <button type="button" className="pl-bigplay" onClick={toggle} aria-label="Play">
          <Svg d={ICONS.play} size={36} />
        </button>
      )}

      <div className="pl-bar">
        <input
          type="range"
          className="pl-seek"
          min={0}
          max={dur || 0}
          step={1}
          value={Math.min(shown, dur || 0)}
          style={{ "--played": `${playedPct}%`, "--buf": `${bufPct}%` }}
          onChange={(e) => setPreview(Number(e.target.value))}
          onPointerUp={commitSeek}
          onBlur={commitSeek}
          aria-label="Seek"
        />

        <div className="pl-row">
          <div className="pl-group">
            <button type="button" className="pl-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
              <Svg d={playing ? ICONS.pause : ICONS.play} />
            </button>
            <button type="button" className="pl-btn pl-text" onClick={() => seekTo(abs - 10)} aria-label="Back 10 seconds">
              -10s
            </button>
            <button type="button" className="pl-btn pl-text" onClick={() => seekTo(abs + 10)} aria-label="Forward 10 seconds">
              +10s
            </button>
            <button type="button" className="pl-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>
              <Svg d={muted || volume === 0 ? ICONS.mute : ICONS.volume} />
            </button>
            <input
              type="range"
              className="pl-vol"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => {
                const x = Number(e.target.value);
                setVolume(x);
                setMuted(x === 0);
              }}
              aria-label="Volume"
            />
            <span className="pl-time">
              {fmt(shown)} / {fmt(dur)}
            </span>
          </div>

          <div className="pl-group">
            {subTracks.length > 0 && (
              <div className="pl-menuwrap">
                <button
                  type="button"
                  className={`pl-btn pl-text${subId ? " is-on" : ""}`}
                  onClick={() => toggleMenu("subs")}
                  aria-haspopup="menu"
                  aria-expanded={menu === "subs"}
                  aria-label="Subtitles"
                >
                  CC
                </button>
                {menu === "subs" && (
                  <ul className="pl-menu" role="menu">
                    <li>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={!subId}
                        className={!subId ? "is-on" : ""}
                        onClick={() => pickSub(null)}
                      >
                        Off
                      </button>
                    </li>
                    {subTracks.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={subId === t.id}
                          className={subId === t.id ? "is-on" : ""}
                          title={t.hint || t.label}
                          onClick={() => pickSub(t.id)}
                        >
                          {t.label}
                          {t.hint && <small className="pl-hint">{t.hint}</small>}
                        </button>
                      </li>
                    ))}
                    {subId && (
                      <li className="pl-menu-sync">
                        <span>
                          Sync {subDelay > 0 ? "+" : ""}
                          {subDelay.toFixed(1)}s
                        </span>
                        <button type="button" onClick={() => setSubDelay((d) => +(d - 0.5).toFixed(1))} aria-label="Subtitles earlier">
                          -
                        </button>
                        <button type="button" onClick={() => setSubDelay((d) => +(d + 0.5).toFixed(1))} aria-label="Subtitles later">
                          +
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {audioTracks.length > 1 && (
              <div className="pl-menuwrap">
                <button
                  type="button"
                  className="pl-btn pl-text"
                  onClick={() => toggleMenu("audio")}
                  aria-haspopup="menu"
                  aria-expanded={menu === "audio"}
                >
                  Audio
                </button>
                {menu === "audio" && (
                  <ul className="pl-menu" role="menu">
                    {audioTracks.map((a, i) => (
                      <li key={a.index}>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={audio === i}
                          className={audio === i ? "is-on" : ""}
                          onClick={() => changeAudio(i)}
                        >
                          {audioLabel(a, i)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="pl-menuwrap">
              <button
                type="button"
                className="pl-btn pl-text"
                onClick={() => toggleMenu("speed")}
                aria-haspopup="menu"
                aria-expanded={menu === "speed"}
              >
                {rate}x
              </button>
              {menu === "speed" && (
                <ul className="pl-menu" role="menu">
                  {RATES.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={rate === r}
                        className={rate === r ? "is-on" : ""}
                        onClick={() => {
                          setRate(r);
                          setMenu(null);
                        }}
                      >
                        {r}x
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="button" className="pl-btn" onClick={toggleFs} aria-label="Fullscreen">
              <Svg d={isFs ? ICONS.exit : ICONS.full} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}