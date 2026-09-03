// src/components/common/brand.jsx
import { useState as useState2, useEffect as useEffect2 } from "react";
function GloobalWordmark({ suffix = "", withSymbols = false }) {
  const DOT_COLORS = ["#2563EB", "#DC2626", "#EA580C", "#059669", "#9333EA", "#DB2777"];
  const randomColor = (exclude) => {
    let c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    while (c === exclude) c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    return c;
  };
  const [c1, setC1] = useState2(() => randomColor());
  const [c2, setC2] = useState2(() => randomColor(c1 || void 0));
  const [s1, setS1] = useState2(() => DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
  const [s2, setS2] = useState2(() => DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
  const [flipped1, setFlipped1] = useState2(false);
  const [flipped2, setFlipped2] = useState2(false);
  useEffect2(() => {
    const interval = setInterval(() => {
      if (withSymbols) {
        if (Math.random() < 0.5) {
          setFlipped1((f) => {
            const next = !f;
            if (next) setS1(DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
            else setC1((prev) => randomColor(prev));
            return next;
          });
        } else {
          setFlipped2((f) => {
            const next = !f;
            if (next) setS2(DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
            else setC2((prev) => randomColor(prev));
            return next;
          });
        }
      } else {
        setC1((prev) => randomColor(prev));
        setC2((prev) => randomColor(prev));
      }
    }, withSymbols ? 900 : 3e3);
    return () => clearInterval(interval);
  }, [withSymbols]);
  const dot = (color, symbol, flipped) => withSymbols ? <span style={{ display: "inline-block", perspective: 160, margin: "0 0.03em", verticalAlign: "-0.05em" }}><span
    aria-hidden="true"
    style={{
      position: "relative",
      display: "inline-block",
      width: "0.85em",
      height: "0.85em",
      borderRadius: "50%",
      transformStyle: "preserve-3d",
      transition: "transform 0.5s cubic-bezier(.4,.15,.2,1)",
      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span style={{ position: "absolute", inset: 0, borderRadius: "50%", backfaceVisibility: "hidden", background: color }} /><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      background: color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "0.55em",
      fontWeight: 800,
      color: "#fff"
    }}
  >{symbol}</span></span></span> : <span
    aria-hidden="true"
    style={{
      display: "inline-block",
      width: "0.85em",
      height: "0.85em",
      borderRadius: "50%",
      background: color,
      margin: "0 0.03em",
      verticalAlign: "-0.05em",
      transition: "background 0.4s ease"
    }}
  />;
  // The wordmark carries its own family rather than inheriting
  // T.fontDisplay. fontWeight 800 was already set here and still rendered
  // at what read as a normal weight: T.fontDisplay is Space Grotesk, which
  // ships no 800 face (Google serves only 500/600/700 for it, and silently
  // drops the 800 that index.html used to ask for), so 800 fell back to
  // the 700 face. Inter does have a true 800, is already loaded for the
  // app, and is the same neutral grotesque category — so the surrounding
  // text ("GL", "BAL ID") now renders at the weight this was always
  // asking for. The two coloured circles are untouched: they are sized in
  // em, so they track the text and keep their proportions.
  return <span aria-label={`Gloobal${suffix}`} style={{ textTransform: "uppercase", fontWeight: 800, fontFamily: T.fontWordmark }}>
      Gl{dot(c1, s1, flipped1)}{dot(c2, s2, flipped2)}bal{suffix}</span>;
}
function CyclingBadge({ words, intervalMs = 1400 }) {
  const [index, setIndex] = useState2(0);
  useEffect2(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(id);
  }, [words, intervalMs]);
  return <span key={index} style={{ display: "inline-block", animation: "badgePop 0.35s ease" }}>{words[index]}</span>;
}
function HoomanMark() {
  const DOT_COLORS = ["#2563EB", "#DC2626", "#EA580C", "#059669", "#9333EA", "#DB2777"];
  const randomColor = (exclude) => {
    let c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    while (c === exclude) c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    return c;
  };
  const DOT_COUNT = 5;
  const [colors, setColors] = useState2(() => Array.from({ length: DOT_COUNT }, () => randomColor()));
  useEffect2(() => {
    const interval = setInterval(() => {
      const i = Math.floor(Math.random() * DOT_COUNT);
      setColors((prev) => {
        const next = [...prev];
        next[i] = randomColor(prev[i]);
        return next;
      });
    }, 900);
    return () => clearInterval(interval);
  }, []);
  const dot = (i, key) => <span
    key={key}
    aria-hidden="true"
    style={{
      display: "inline-block",
      width: "0.95em",
      height: "0.95em",
      borderRadius: "50%",
      background: colors[i],
      margin: "0 0.04em",
      verticalAlign: "-0.1em",
      transition: "background 0.4s ease"
    }}
  />;
  return <span aria-label="Hooman to Hooman" style={{ textTransform: "uppercase", fontWeight: 800 }}>
      H{dot(0, 0)}{dot(1, 1)}MAN&nbsp;&nbsp;&nbsp;T{dot(4, 4)}&nbsp;&nbsp;&nbsp;H{dot(2, 2)}{dot(3, 3)}MAN
    </span>;
}
function ZeroPercentMark({ size = 38, color: baseColor }) {
  const DOT_COLORS = ["#2563EB", "#DC2626", "#EA580C", "#059669", "#9333EA", "#DB2777"];
  const randomColor = (exclude) => {
    let c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    while (c === exclude) c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    return c;
  };
  const DOT_COUNT = 3;
  const [colors, setColors] = useState2(() => Array.from({ length: DOT_COUNT }, () => randomColor()));
  const [symbols, setSymbols] = useState2(() => Array.from({ length: DOT_COUNT }, () => DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]));
  const [flipped, setFlipped] = useState2(() => Array(DOT_COUNT).fill(false));
  useEffect2(() => {
    const interval = setInterval(() => {
      const i = Math.floor(Math.random() * DOT_COUNT);
      setFlipped((prev) => {
        const next = [...prev];
        const willBeFlipped = !next[i];
        next[i] = willBeFlipped;
        if (willBeFlipped) {
          setSymbols((s) => {
            const n = [...s];
            n[i] = DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)];
            return n;
          });
        } else {
          setColors((c) => {
            const n = [...c];
            n[i] = randomColor(c[i]);
            return n;
          });
        }
        return next;
      });
      // 1800ms, up from 900.
      //
      // A dot turned every 0.9s while the turn itself took 0.5s, so with
      // three dots something was mid-flip almost continuously and the mark
      // never settled. At 1.8s a dot is at rest for most of its cycle and
      // the movement reads as occasional rather than restless.
    }, 1800);
    return () => clearInterval(interval);
  }, []);
  const dot = (i, key) => <span key={key} style={{ display: "inline-block", perspective: 200, margin: "0 0.04em", verticalAlign: "-0.02em" }}><span
    aria-hidden="true"
    style={{
      position: "relative",
      display: "inline-block",
      width: "0.72em",
      height: "0.72em",
      borderRadius: "50%",
      transformStyle: "preserve-3d",
      // 0.9s, up from 0.5s. Same reasoning as the logo box: a turn that
      // fast reads as a swap rather than a rotation.
      transition: "transform 0.9s cubic-bezier(.4,.15,.2,1)",
      transform: flipped[i] ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span style={{ position: "absolute", inset: 0, borderRadius: "50%", backfaceVisibility: "hidden", background: colors[i] }} /><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      background: colors[i],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      // 0.38em, down from 0.55em — and the em here is the MARK's font size,
      // not the dot's, which is what made this so easy to get wrong.
      //
      // The dot is 0.72em across, so a 0.55em glyph filled 76% of it. At
      // 800 weight a "+" or "×" then reached the rim on all four sides and
      // the dot stopped reading as a zero with something inside it — it
      // read as a symbol tile sitting in a row of digits, which is what
      // broke the flow of "0.00%". At 0.38em the glyph occupies about half
      // the circle, the way a character sits inside a counter rather than
      // bursting out of one.
      fontSize: "0.38em",
      fontWeight: 800,
      color: "#fff"
    }}
  >{symbols[i]}</span></span></span>;
  return <span aria-label="0.00%" style={{ fontSize: size, fontWeight: 800, color: baseColor, fontFamily: T.fontDisplay, lineHeight: 1 }}>{dot(0, 0)}.{dot(1, 1)}{dot(2, 2)}%
    </span>;
}
function SingleOMark({ before, after }) {
  const DOT_COLORS = ["#2563EB", "#DC2626", "#EA580C", "#059669", "#9333EA", "#DB2777"];
  const randomColor = (exclude) => {
    let c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    while (c === exclude) c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    return c;
  };
  const [color, setColor] = useState2(() => randomColor());
  const [symbol, setSymbol] = useState2(() => DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
  const [flipped, setFlipped] = useState2(false);
  useEffect2(() => {
    const interval = setInterval(() => {
      setFlipped((f) => {
        const next = !f;
        if (next) setSymbol(DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
        else setColor((prev) => randomColor(prev));
        return next;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);
  return <span style={{ textTransform: "uppercase", fontWeight: 800 }}>{before}<span style={{ display: "inline-block", perspective: 200, margin: "0 0.04em", verticalAlign: "-0.1em" }}><span
    aria-hidden="true"
    style={{
      position: "relative",
      display: "inline-block",
      width: "0.85em",
      height: "0.85em",
      borderRadius: "50%",
      transformStyle: "preserve-3d",
      transition: "transform 0.5s cubic-bezier(.4,.15,.2,1)",
      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span style={{ position: "absolute", inset: 0, borderRadius: "50%", backfaceVisibility: "hidden", background: color }} /><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      background: color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "0.55em",
      fontWeight: 800,
      color: "#fff"
    }}
  >{symbol}</span></span></span>{after}</span>;
}
function OneBankMark() {
  return <SingleOMark before="" after="NE BANK" />;
}

