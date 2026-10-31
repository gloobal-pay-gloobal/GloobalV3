// src/components/charts/ghRing.jsx
import { useRef as useRef8 } from "react";
import {
  History as History3
} from "lucide-react";
function GHSegmentedRing({ size, thickness, segments, gapDeg, children }) {
  const stops = [];
  let angle = 0;
  segments.forEach((seg) => {
    const span = 90 - gapDeg;
    const filled = span * seg.pct;
    stops.push(`${seg.color} ${angle}deg ${angle + filled}deg`);
    stops.push(`${T.surface} ${angle + filled}deg ${angle + span}deg`);
    angle += span;
    stops.push(`${T.bg} ${angle}deg ${angle + gapDeg}deg`);
    angle += gapDeg;
  });
  return <div style={{ position: "relative", width: size, height: size, flexShrink: 0, transition: "transform 0.3s ease" }}><div style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${stops.join(",")})`, boxShadow: `0 0 0 1px rgba(${T.inkRgb},0.07)` }} /><div
    style={{
      position: "absolute",
      inset: thickness,
      borderRadius: "50%",
      background: T.surface,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `inset 0 0 0 1px rgba(${T.inkRgb},0.04)`
    }}
  >{children}</div></div>;
}
function GHColorWheel({ size, hue, sat, onChange }) {
  const ref = useRef8(null);
  const dragging = useRef8(false);
  const update = (clientX, clientY) => {
    const rect = ref.current.getBoundingClientRect();
    const radius2 = rect.width / 2;
    const dx = clientX - (rect.left + radius2);
    const dy = clientY - (rect.top + radius2);
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius2);
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    onChange(angle, radius2 === 0 ? 0 : dist / radius2);
  };
  const handleDown = (e) => {
    dragging.current = true;
    ref.current.setPointerCapture(e.pointerId);
    update(e.clientX, e.clientY);
  };
  const handleMove = (e) => {
    if (!dragging.current) return;
    update(e.clientX, e.clientY);
  };
  const handleUp = (e) => {
    dragging.current = false;
    try {
      ref.current.releasePointerCapture(e.pointerId);
    } catch (err) {
    }
  };
  const radius = size / 2;
  const knobDist = sat * radius;
  const angleRad = hue * Math.PI / 180;
  const knobX = radius + Math.cos(angleRad) * knobDist;
  const knobY = radius + Math.sin(angleRad) * knobDist;
  return <div
    ref={ref}
    onPointerDown={handleDown}
    onPointerMove={handleMove}
    onPointerUp={handleUp}
    style={{
      position: "relative",
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: "58% 42% 45% 55% / 60% 45% 55% 40%",
      touchAction: "none",
      cursor: "pointer",
      background: "radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 100%), conic-gradient(from 90deg, #FF0000 0deg, #FFFF00 60deg, #00FF00 120deg, #00FFFF 180deg, #0000FF 240deg, #FF00FF 300deg, #FF0000 360deg)",
      boxShadow: `inset 0 0 0 1px rgba(${T.inkRgb},0.08)`
    }}
  ><div
    style={{
      position: "absolute",
      left: knobX - 11,
      top: knobY - 11,
      width: 22,
      height: 22,
      borderRadius: "50%",
      background: hsvToHex(hue, sat, 1),
      border: "3px solid #fff",
      boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
      pointerEvents: "none"
    }}
  /></div>;
}

