"use client";

import { useMemo, useState } from "react";
import Player from "./Player";

const NATIVE = ["mp4", "webm", "m4v"];
const LANG_NAMES = {
  hin: "Hindi", tel: "Telugu", tam: "Tamil", mal: "Malayalam",
  kan: "Kannada", ben: "Bengali", eng: "English", urd: "Urdu",
};

export default function VersionPlayer({ versions, title }) {
  const options = useMemo(
    () =>
      versions
        .map((v) => {
          const file = v.files.find((f) => NATIVE.includes(f.ext)) || v.files[0];
          return {
            key: v.path || v.quality,
            label: v.label || v.quality || "HD",
            src: file?.url,
            subtitles: v.subtitles || [],
            audioLangs: v.audioLangs || [],
          };
        })
        .filter((o) => o.src),
    [versions]
  );

  const langs = useMemo(() => [...new Set(options.flatMap((o) => o.audioLangs))], [options]);

  const [key, setKey] = useState(
    () => options.find((o) => o.audioLangs.includes(langs[0]))?.key ?? options[0]?.key
  );
  const [lang, setLang] = useState(langs[0] ?? null);

  const current = options.find((o) => o.key === key) ?? options[0];
  if (!current) return null;

  const pickVersion = (k) => {
    setKey(k);
    const o = options.find((x) => x.key === k);
    if (o && lang && !o.audioLangs.includes(lang)) setLang(o.audioLangs[0] ?? null);
  };

  const pickLang = (code) => {
    setLang(code);
    if (current.audioLangs.includes(code)) return;
    const next = options.find((x) => x.audioLangs.includes(code));
    if (next) setKey(next.key);
  };

  return (
    <>
      {(options.length > 1 || langs.length > 1) && (
        <div className="pl-picker">
          {options.length > 1 && (
            <label>
              Version{" "}
              <select value={current.key} onChange={(e) => pickVersion(e.target.value)}>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </label>
          )}
          {langs.length > 1 && (
            <label>
              Audio{" "}
              <select value={lang ?? ""} onChange={(e) => pickLang(e.target.value)}>
                {langs.map((c) => (
                  <option key={c} value={c}>{LANG_NAMES[c] || c}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <Player
        src={current.src}
        title={title}
        subtitles={current.subtitles}
        preferredLang={lang}
      />
    </>
  );
}