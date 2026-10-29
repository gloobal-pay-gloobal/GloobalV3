// src/features/creator/ShopThemeEditor.jsx
//
// WHERE AN OWNER MAKES THE SHOP THEIRS.
//
// A theme is one tap that sets colour, type, corners and card style
// together — and then every one of those is still separately adjustable,
// which is the whole point: a preset is a starting position, not a cage.
//
// ── WHAT IS NOT ON THIS SCREEN ──────────────────────────────────────────
//
// Anything to do with money. There is no control here for how a price is
// drawn, what colour a total is, or what the Pay button looks like, because
// those are the same in every shop on Gloobal under every theme. A customer
// moving between two shops has to read a figure the same way in both.
//
// The preview at the top is the honest version of that rule: it shows the
// real row a customer sees, price included, so an owner can watch their
// colour land on the chip and the Add button and NOT on the figure.
import { useState as useState55, useEffect as useEffect57, useRef as useRef38 } from "react";
import { Check as Check10, Undo2 as Undo2Look, Maximize2 as Maximize2Look, X as X21 } from "lucide-react";

// The dials, in the order they are worth changing. Each is a plain list of
// {key, label} so the same row renderer draws all of them and a new option
// is one line here rather than a new block of JSX.
var SHOP_EDIT_SECTIONS = [
  // First, because it changes the page more than any other dial: the
  // items as rows or as a two-column grid.
  { field: "layout", label: "Items", options: ["list", "grid"], table: "SHOP_LAYOUTS" },
  { field: "corners", label: "Corners", options: ["sharp", "soft", "round", "leaf"], table: "SHOP_CORNERS" },
  { field: "cards", label: "Cards", options: ["raised", "flat", "outline", "plain"], table: null },
  { field: "density", label: "Density", options: ["compact", "cosy", "roomy"], table: "SHOP_DENSITY" },
  { field: "photoShape", label: "Photo shape", options: ["rounded", "circle", "wide", "tall"], table: "SHOP_PHOTO_SHAPES" },
  { field: "buttons", label: "Buttons & badges", options: ["filled", "outline", "soft"], table: "SHOP_BUTTON_STYLES" }
];

var SHOP_CARD_LABELS = { raised: "Raised", flat: "Flat", outline: "Outline", plain: "Plain" };

function shopOptionLabel(field, key) {
  if (field === "cards") return SHOP_CARD_LABELS[key] || key;
  if (field === "corners") return (SHOP_CORNERS[key] || {}).name || key;
  if (field === "density") return (SHOP_DENSITY[key] || {}).name || key;
  if (field === "layout") return (SHOP_LAYOUTS[key] || {}).name || key;
  if (field === "photoShape") return (SHOP_PHOTO_SHAPES[key] || {}).name || key;
  if (field === "buttons") return (SHOP_BUTTON_STYLES[key] || {}).name || key;
  if (field === "heroStyle") return (SHOP_HERO_STYLES[key] || {}).name || key;
  if (field === "coverStyle") return (SHOP_COVER_STYLES[key] || {}).name || key;
  if (field === "pattern") return (SHOP_PATTERNS[key] || {}).name || key;
  return key;
}

// One product row, drawn exactly as the real page draws it.
//
// Not an approximation: it takes the same resolved theme and the same
// GeuFigure. If this says the price is unthemed, the page is telling the
// truth about it.
function ShopThemePreview({ shop, lens, ccyCode }) {
  const theme = resolveShopTheme(shop);
  const announce = shopAnnouncement(shop);
  const thumb = shopThumbBox(theme);
  const card = shopCardStyle(theme);
  const paint = businessMarkInk("Masala chai");
  return <div style={{
    borderRadius: 20, overflow: "hidden", background: theme.page,
    boxShadow: T.shadowCard, border: `1px solid ${theme.line}`
  }}>{announce ? <div style={{
    background: announce.color, color: "#fff", padding: "6px 12px",
    fontSize: 9.5, fontWeight: 800, textAlign: "center", letterSpacing: 0.3
  }}>{announce.text}</div> : null}<div style={{ padding: 13 }}><div style={{
    display: "flex", alignItems: "center", gap: 10, marginBottom: 11, padding: "11px 12px",
    borderRadius: theme.corners.mark, color: "#fff",
    background: `linear-gradient(140deg, ${theme.hero.from} 0%, ${theme.hero.to} 100%)`
  }}><span style={{
    width: 38, height: 38, borderRadius: theme.corners.mark, flexShrink: 0,
    background: "rgba(255,255,255,0.92)", color: theme.hero.from,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 800, fontFamily: theme.font.stack
  }}>रस</span><span style={{ minWidth: 0 }}><span style={{
    display: "block", fontSize: 14, fontWeight: theme.font.weight,
    color: "#fff", fontFamily: theme.font.stack
  }}>रसोई ghar</span>{(shop && shop.tagline) ? <span style={{
    display: "block", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginTop: 2
  }}>{shop.tagline}</span> : null}</span></div><div style={{
    display: "flex", gap: 6, marginBottom: 11
  }}>{["All", "Chai"].map((c, i) => <span key={c} style={{
    borderRadius: theme.corners.pill, padding: "5px 10px", fontSize: 10, fontWeight: 700,
    background: i === 0 ? theme.hero.from : theme.surface,
    color: i === 0 ? "#fff" : theme.inkFaint
  }}>{c}</span>)}</div>{theme.layout === "grid" ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{["Masala chai", "Samosa"].map((t, i) => <div key={t} style={{
    ...card, padding: 6, color: theme.ink
  }}><span style={{
    display: "flex", alignItems: "center", justifyContent: "center", width: "100%", aspectRatio: "1.3",
    borderRadius: theme.photo.radius === "50%" ? theme.corners.photo : (theme.photo.radius || theme.corners.photo),
    background: businessMarkInk(t).bg, color: businessMarkInk(t).fg, fontSize: 13, fontWeight: 800
  }}>{businessMarkInitials(t)}</span><span style={{
    display: "block", fontSize: 11, fontWeight: 700, marginTop: 5
  }}>{t}</span><span style={{ display: "block", marginTop: 2 }}><GeuFigure amount={i === 0 ? 20 : 15} currency={ccyCode} lens={lens} size={10.5} /></span></div>)}</div> : <div style={{
    display: "flex", alignItems: "center", gap: 10, padding: theme.density.rowPad, ...card
  }}><span style={{
    ...thumb, flexShrink: 0, background: paint.bg, display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: paint.fg
  }}>MC</span><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 12, fontWeight: 700, color: theme.ink
  }}>Masala chai<span style={{
    marginLeft: 6, fontSize: 8, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase",
    color: theme.color, background: theme.soft, borderRadius: 4, padding: "2px 4px"
  }}>Bestseller</span></span><span style={{ display: "block", marginTop: 3 }}>{
    /* The price, drawn by the app and not by the theme — which is the thing
       this preview exists to let somebody check. */
  }<GeuFigure amount={20} currency={ccyCode} lens={lens} size={11.5} /></span></span><span style={{
    width: 26, height: 26, borderRadius: theme.corners.pill, background: theme.hero.from,
    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 15, fontWeight: 800, flexShrink: 0
  }}>+</span></div>}</div></div>;
}

// ── THE LIVE PREVIEW ────────────────────────────────────────────────────
//
// The REAL shop page — CreatorPage itself, with the draft look — drawn at
// phone width and scaled down to fit the top of the screen. Not a mock:
// every dial changes exactly what a customer will see, the price included
// (which no dial reaches). It scrolls, so the owner can look further down,
// but taps are swallowed: this is a picture of the page, not the page.
var LOOK_PREVIEW_PHONE_W = 390;

function LookLivePreview({ creator, ccyCode, lens, height }) {
  const host = useRef38(null);
  const [w, setW] = useState55(340);
  useEffect57(() => {
    const el = host.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(220, el.clientWidth || 340));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, w / LOOK_PREVIEW_PHONE_W);
  return <div
    ref={host}
    aria-label="Preview of your shop"
    onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
    style={{
      position: "relative", height, borderRadius: 22, overflow: "hidden",
      boxShadow: "0 10px 30px rgba(20,18,43,0.18), inset 0 0 0 1px rgba(20,18,43,0.06)", background: T.bg
    }}
  ><div style={{
    position: "absolute", left: 0, top: 0, width: LOOK_PREVIEW_PHONE_W, height: height / scale,
    transform: `scale(${scale})`, transformOrigin: "0 0"
  }}><CreatorPage
    creator={creator}
    isOwner={false}
    preview
    ccyCode={ccyCode}
    lens={lens}
    onClose={() => {}}
  /></div></div>;
}

// A light tap on phones that have one; nothing anywhere else.
function lookBuzz() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(8);
  } catch (e) {
    // A vibration that is refused is not worth anything.
  }
}

var LOOK_TABS = [
  { key: "theme", label: "Theme" },
  { key: "colour", label: "Colour" },
  { key: "font", label: "Font" },
  { key: "layout", label: "Layout" },
  { key: "cover", label: "Cover" },
  { key: "extras", label: "Extras" }
];

var LOOK_DRAFT_FIELDS = ["theme", "color", "font", "corners", "cards", "density", "photoShape", "layout", "buttons",
  "heroStyle", "coverStyle", "pattern", "dark", "tagline", "announceText", "announceColor", "announceOn"];

function lookSnapshot(d) {
  const out = {};
  for (const k of LOOK_DRAFT_FIELDS) out[k] = d[k] === undefined ? null : d[k];
  return JSON.stringify(out);
}

function ShopThemeEditor({ shop, cover, symbolId, creator = null, ccyCode = "USD", lens = null, onClose, onSave, onSaveCover, onToast }) {
  // Edited as a draft and written once. A screen with this many controls
  // that saved on every tap would be that many requests and that many
  // chances for a half-applied look.
  const [draft, setDraft] = useState55(() => {
    const t = resolveShopTheme(shop);
    return Object.assign({
      theme: t.key, color: "", font: t.fontKey, corners: "round", cards: t.cards,
      density: "cosy", photoShape: "rounded", layout: t.layout, buttons: t.buttons, heroStyle: t.heroStyle,
      coverStyle: t.coverStyle, pattern: t.pattern, dark: t.dark, tagline: "", announceText: "",
      announceColor: "", announceOn: true
    }, shop && typeof shop === "object" ? shop : {});
  });
  const [saved] = useState55(() => lookSnapshot(draft));
  // Every change pushes the look before it, so Undo steps back one tap at
  // a time — thirty deep, which is more taps than anybody undoes.
  const [history, setHistory] = useState55([]);
  const [saving, setSaving] = useState55(false);
  const [error, setError] = useState55("");
  const [tab, setTab] = useState55("theme");
  const [leaving, setLeaving] = useState55(false);
  const [fullPage, setFullPage] = useState55(false);

  const dirty = lookSnapshot(draft) !== saved;
  const set = (patch) => {
    lookBuzz();
    setHistory((h) => h.concat([draft]).slice(-30));
    setDraft((d) => Object.assign({}, d, patch));
  };
  const undo = () => {
    if (!history.length) return;
    lookBuzz();
    setDraft(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };
  // Every sample in the Font tab is drawn in its own face, so all of them
  // are fetched when this screen opens rather than one by one as tapped.
  useEffect57(() => { Object.keys(SHOP_FONTS).forEach(ensureShopFont); }, []);
  const theme = resolveShopTheme(draft);

  // Picking a theme REPLACES the dials rather than merging over them.
  //
  // The alternative — keeping whatever corners somebody had set — means
  // tapping "Studio" gives a thing that is not Studio, and the preset stops
  // meaning anything. Everything stays editable immediately afterwards, and
  // Undo puts the previous look back in one tap.
  const applyTheme = (key) => {
    const base = SHOP_THEMES[key] || SHOP_THEMES.gloobal;
    set({
      theme: key, color: base.color, font: base.font, corners: base.corners,
      cards: base.cards, density: base.density, photoShape: base.photoShape, dark: base.dark,
      layout: base.layout || "list", buttons: base.buttons || "filled", heroStyle: base.heroStyle || "gradient",
      coverStyle: base.coverStyle || "photo", pattern: base.pattern || "dots"
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const ok = onSave ? await onSave(draft) : false;
    setSaving(false);
    if (ok) {
      lookBuzz();
      if (onToast) onToast("Look saved");
      if (onClose) onClose();
    } else {
      setError("Could not save that just now.");
      setLeaving(false);
    }
  };
  const close = () => (dirty ? setLeaving(true) : onClose && onClose());

  const label = (text, extra) => <div style={{
    display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkSoft, margin: "4px 2px 9px"
  }}><span>{text}</span>{extra || null}</div>;
  const row = (text, children, extra) => <div style={{ marginBottom: 18 }}>{label(text, extra)}{children}</div>;
  const ring = (on) => (on ? `0 0 0 2.5px ${T.accent}, ${T.shadowCard}` : T.shadowCard);
  const chips = (field, options, render) => <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{options.map((key) => {
    const on = theme[field === "font" ? "fontKey" : field] === key || draft[field] === key;
    return <button
      key={key}
      onClick={() => set({ [field]: key })}
      aria-pressed={on}
      className="v2-tap"
      style={{
        flex: "1 1 0", minWidth: 72, background: T.surface, borderRadius: 14, padding: "10px 6px 9px", border: "none",
        cursor: "pointer", fontFamily: "inherit", boxShadow: ring(on), transition: "box-shadow 0.15s ease",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 7
      }}
    >{render ? render(key, on) : null}<span style={{
      fontSize: 11, fontWeight: 700, color: on ? T.accent : T.ink
    }}>{shopOptionLabel(field, key)}</span></button>;
  })}</div>;

  const previewCreator = Object.assign({ handleFirst: "Your", handleLast: "shop", items: [] }, creator || {}, { shop: draft, cover });
  const name = creatorDisplayName(previewCreator);

  // ── THE TABS ────────────────────────────────────────────────────────────
  const tabs = {
    theme: <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{SHOP_THEME_KEYS.map((key) => {
      const t = SHOP_THEMES[key];
      const look = resolveShopTheme({ theme: key });
      const on = draft.theme === key;
      const ground = (t.coverStyle === "pattern") ? shopPatternCss(t.pattern, look.color, look.dark)
        : `linear-gradient(140deg, ${look.hero.from}, ${look.hero.to})`;
      return <button
        key={key}
        onClick={() => applyTheme(key)}
        aria-pressed={on}
        className="v2-tap"
        style={{
          textAlign: "left", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, overflow: "hidden",
          background: look.dark ? "#1E1814" : T.surface, borderRadius: 16, boxShadow: ring(on), transition: "box-shadow 0.15s ease"
        }}
      ><span style={{
        display: "flex", alignItems: "flex-end", height: 58, padding: "0 10px 8px", background: ground, position: "relative"
      }}><span style={{
        fontSize: 17, lineHeight: 1, fontFamily: look.font.stack, fontWeight: look.font.weight,
        color: t.coverStyle === "pattern" ? look.hero.from : "#fff"
      }}>Aa</span><span style={{
        marginLeft: "auto", width: 22, height: 22, ...shopButtonStyle(look), ...(look.buttons !== "filled" ? { background: "#fff" } : {}),
        borderRadius: look.corners.pill, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800
      }}>+</span>{on ? <span style={{
        position: "absolute", top: 7, right: 7, width: 18, height: 18, borderRadius: "50%", background: T.accent,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}><Check10 size={11} color="#fff" strokeWidth={3} /></span> : null}</span><span style={{ display: "block", padding: "8px 10px 10px" }}><span style={{
        display: "block", fontSize: 13, fontWeight: 800, color: look.dark ? "#F3EBE1" : T.ink, fontFamily: look.font.stack
      }}>{t.name}</span><span style={{
        display: "block", fontSize: 10.5, color: look.dark ? "#C3B5A5" : T.inkFaint, marginTop: 3, fontWeight: 600, lineHeight: 1.35
      }}>{t.note}</span></span></button>;
    })}</div>,

    colour: <>{row("Shop colour", <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>{SHOP_COLORS.map((c) => {
      const on = theme.color.toUpperCase() === c.toUpperCase();
      return <button
        key={c}
        onClick={() => set({ color: c })}
        aria-label={`Use ${c}`}
        aria-pressed={on}
        style={{
          aspectRatio: "1", borderRadius: "50%", background: c, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: on ? `0 0 0 3px ${T.bg}, 0 0 0 5.5px ${c}` : "0 2px 6px rgba(20,18,43,0.15)",
          transform: on ? "scale(1.05)" : "none", transition: "transform 0.15s ease, box-shadow 0.15s ease"
        }}
      >{on ? <Check10 size={16} color="#fff" strokeWidth={3} /> : null}</button>;
    })}</div>)}<div style={{
      display: "flex", alignItems: "center", gap: 12, background: T.surface, borderRadius: 15, padding: "12px 14px", boxShadow: T.shadowCard
    }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>Dark page</span><span style={{
      display: "block", fontSize: 11, color: T.inkFaint, fontWeight: 600, marginTop: 2
    }}>For late-night shops. Prices stay just as readable.</span></span><ProfileToggle
      on={Boolean(theme.dark)}
      onToggle={() => set({ dark: !theme.dark })}
      label="Dark page"
    /></div><div style={{
      fontSize: 11, color: T.inkFaint, fontWeight: 600, margin: "12px 2px 0", lineHeight: 1.5
    }}>Your colour washes the page and fills your name card, the chips and the Add button. The price keeps the app's own look in every shop, so people can read a figure the same way everywhere.</div></>,

    font: <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{Object.keys(SHOP_FONTS).map((key) => {
      const f = SHOP_FONTS[key];
      const on = theme.fontKey === key;
      const quick = SHOP_FONT_QUICK.find((q) => q.key === key);
      return <button
        key={key}
        onClick={() => set({ font: key })}
        aria-pressed={on}
        className="v2-tap"
        style={{
          display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: T.surface, borderRadius: 15,
          padding: "11px 14px", border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: ring(on)
        }}
      ><span style={{ flex: 1, minWidth: 0 }}><span style={{
        display: "block", fontSize: 19, lineHeight: 1.3, color: T.ink, fontFamily: f.stack, fontWeight: f.weight,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
      }}>{name}</span><span style={{
        display: "block", fontSize: 10.5, color: T.inkFaint, fontWeight: 600, marginTop: 2
      }}>{f.name} · {quick ? quick.label : f.note}</span></span>{on ? <Check10 size={16} color={T.accent} /> : null}</button>;
    })}</div>,

    layout: <>{SHOP_EDIT_SECTIONS.map((sec) => <div key={sec.field}>{row(sec.label, chips(sec.field, sec.options, (key, on) => {
      // A small picture of each choice, so nobody has to know what
      // "outline" or "tall" means before seeing it.
      const c = on ? T.accent : T.inkFaint;
      if (sec.field === "layout") {
        return key === "grid"
          ? <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, width: 30 }}>{[0, 1, 2, 3].map((i) => <span key={i} style={{ height: 11, borderRadius: 3, background: c, opacity: 0.6 }} />)}</span>
          : <span style={{ display: "flex", flexDirection: "column", gap: 3, width: 30 }}>{[0, 1, 2].map((i) => <span key={i} style={{ height: 6, borderRadius: 3, background: c, opacity: 0.6 }} />)}</span>;
      }
      if (sec.field === "buttons") {
        return <span style={{
          width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800,
          ...shopButtonStyle({ ...theme, buttons: key })
        }}>+</span>;
      }
      if (sec.field === "corners") return <span style={{ width: 28, height: 20, border: `2px solid ${c}`, borderRadius: (SHOP_CORNERS[key] || {}).card }} />;
      if (sec.field === "photoShape") {
        const shp = SHOP_PHOTO_SHAPES[key] || {};
        const h = 22;
        return <span style={{ width: Math.round(h * (shp.ratio || 1)), height: h, background: c, opacity: 0.55, borderRadius: shp.radius || 5 }} />;
      }
      if (sec.field === "cards") {
        const st = shopCardStyle({ ...theme, cards: key, corners: SHOP_CORNERS.soft });
        return <span style={{ width: 34, height: 20, ...st, borderRadius: 6, boxShadow: key === "raised" ? "0 2px 6px rgba(20,18,43,0.18)" : st.boxShadow }} />;
      }
      if (sec.field === "density") {
        const gap = { compact: 2, cosy: 4, roomy: 6 }[key];
        return <span style={{ display: "flex", flexDirection: "column", gap, width: 28 }}>{[0, 1, 2].map((i) => <span key={i} style={{ height: 4, borderRadius: 2, background: c, opacity: 0.6 }} />)}</span>;
      }
      return null;
    }))}</div>)}</>,

    cover: <>{row("Cover photo", <ShopCoverPicker
      cover={cover}
      accent={theme.color}
      onError={(m) => setError(m)}
      onPick={async (photo) => { setError(""); if (onSaveCover) await onSaveCover({ photo }); if (!cover || !cover.photo) set({ coverStyle: "photo" }); }}
      onMove={(focusY) => { if (onSaveCover) onSaveCover({ focusY }); }}
      onRemove={async () => { if (onSaveCover) await onSaveCover({ remove: true }); }}
    />)}{row("Across the top", chips("coverStyle", ["photo", "gradient", "pattern"], (key) => <span style={{
      width: 44, height: 24, borderRadius: 6, overflow: "hidden",
      background: key === "pattern" ? shopPatternCss(theme.pattern, theme.color, theme.dark)
        : key === "gradient" ? `linear-gradient(140deg, ${theme.hero.from}, ${theme.hero.to})`
          : (cover && cover.photo ? `center / cover url("${cover.photo}")` : T.surfaceAlt)
    }} />), <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: T.inkFaint }}>{draft.coverStyle === "photo" && !(cover && cover.photo) ? "Add a photo above" : ""}</span>)}{
      theme.coverStyle === "pattern" ? row("Pattern", chips("pattern", Object.keys(SHOP_PATTERNS), (key) => <span style={{
        width: 44, height: 28, borderRadius: 7, background: shopPatternCss(key, theme.color, theme.dark)
      }} />)) : null
    }{row("Name card", chips("heroStyle", Object.keys(SHOP_HERO_STYLES), (key) => <span style={{
      width: 44, height: 26, borderRadius: 7, position: "relative", overflow: "hidden",
      background: key === "glass" ? (theme.coverStyle === "pattern" ? shopPatternCss(theme.pattern, theme.color, theme.dark) : `linear-gradient(140deg, ${theme.hero.from}, ${theme.hero.to})`) : "transparent",
      boxShadow: key === "minimal" ? `inset 0 0 0 1.5px ${T.line}` : "none"
    }}><span style={{
      position: "absolute", inset: key === "glass" ? 5 : 0, borderRadius: key === "glass" ? 5 : 7,
      background: key === "gradient" ? `linear-gradient(140deg, ${theme.hero.from}, ${theme.hero.to})` : key === "solid" ? theme.hero.from
        : key === "glass" ? "rgba(18,14,26,0.45)" : "transparent"
    }} /><span style={{ position: "absolute", left: key === "glass" ? 10 : 6, top: key === "glass" ? 10 : 9, width: 18, height: 4, borderRadius: 2, background: key === "minimal" ? T.ink : "#fff" }} /></span>), <span style={{
      textTransform: "none", letterSpacing: 0, fontWeight: 600, color: T.inkFaint
    }}>{theme.heroStyle === "glass" && !(theme.coverStyle !== "photo" || (cover && cover.photo)) ? "Glass needs a cover" : ""}</span>)}</>,

    extras: <>{row("Tagline", <div style={{
      background: T.surface, borderRadius: 15, padding: "11px 14px", boxShadow: T.shadowCard
    }}><label htmlFor="shop-tagline" style={{
      display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkFaint
    }}>One line under your name</label><input
      id="shop-tagline"
      value={draft.tagline || ""}
      maxLength={60}
      placeholder="Chai since 2015"
      onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
      onBlur={() => setHistory((h) => h.concat([draft]).slice(-30))}
      style={{
        width: "100%", border: "none", outline: "none", background: "none", marginTop: 5,
        fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: "inherit"
      }}
    /></div>)}{row("Announcement", <>
      <div style={{
        background: T.surface, borderRadius: 15, padding: "11px 14px", boxShadow: T.shadowCard, marginBottom: 9
      }}><label htmlFor="shop-announce" style={{
        display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkFaint
      }}>A band across the very top</label><input
        id="shop-announce"
        value={draft.announceText || ""}
        maxLength={70}
        placeholder="Fresh samosas from 4pm"
        onChange={(e) => setDraft((d) => ({ ...d, announceText: e.target.value }))}
        style={{
          width: "100%", border: "none", outline: "none", background: "none", marginTop: 5,
          fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: "inherit"
        }}
      /></div>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, background: T.surface,
        borderRadius: 15, padding: "12px 14px", boxShadow: T.shadowCard
      }}><span style={{ flex: 1, minWidth: 0 }}><span style={{
        display: "block", fontSize: 13, fontWeight: 700, color: T.ink
      }}>Show the band</span><span style={{
        display: "block", fontSize: 11, color: T.inkFaint, fontWeight: 600, marginTop: 2
      }}>Leaving it empty hides it too</span></span><ProfileToggle
        on={draft.announceOn !== false}
        onToggle={() => set({ announceOn: draft.announceOn === false })}
        label="Show the announcement band"
      /></div></>)}</>
  };

  return <div style={{
    position: "fixed", inset: 0, zIndex: 350, background: T.bg,
    display: "flex", flexDirection: "column", overflow: "hidden"
  }}><div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 8px", flexShrink: 0
  }}><NavBackButton onClick={close} /><span style={{
    flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay
  }}>How your shop looks</span><button
    onClick={() => setFullPage(true)}
    className="v2-tap"
    style={{
      display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 999, border: "none",
      background: T.surface, boxShadow: T.shadowCard, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, color: T.ink
    }}
  ><Maximize2Look size={14} />Full page</button></div>

  {
    /* The real page, small — or the old one-row sample when this editor is
       opened without a shop to draw (a profile that has none yet). */
  }<div style={{ padding: "2px 16px 10px", flexShrink: 0 }}>{creator
    ? <LookLivePreview creator={previewCreator} ccyCode={ccyCode} lens={lens} height={Math.round(Math.min(320, (typeof window !== "undefined" ? window.innerHeight : 800) * 0.36))} />
    : <ShopThemePreview shop={draft} lens={lens} ccyCode={ccyCode} />}</div>

  <div role="tablist" aria-label="What to change" style={{
    display: "flex", gap: 6, overflowX: "auto", padding: "4px 16px 10px", flexShrink: 0, scrollbarWidth: "none",
    borderBottom: `1px solid ${T.line}`
  }}>{LOOK_TABS.map((t) => <button
    key={t.key}
    role="tab"
    aria-selected={tab === t.key}
    onClick={() => setTab(t.key)}
    style={{
      flexShrink: 0, border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit",
      fontSize: 12.5, fontWeight: 800, background: tab === t.key ? T.ink : "transparent",
      color: tab === t.key ? "#fff" : T.inkSoft, transition: "background 0.15s ease, color 0.15s ease"
    }}
  >{t.label}</button>)}</div>

  <div key={tab} style={{
    flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "14px 16px 20px",
    animation: "lookTabIn 0.22s ease"
  }}><style>{"@keyframes lookTabIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } } @media (prefers-reduced-motion: reduce) { [role=tabpanel] { animation: none !important; } }"}</style><div role="tabpanel">{tabs[tab]}</div>{error ? <div style={{
    fontSize: 12, fontWeight: 700, color: T.negative, marginTop: 10
  }}>{error}</div> : null}</div>

  <div style={{
    flexShrink: 0, display: "flex", alignItems: "center", gap: 10, background: T.surface, borderTop: `1px solid ${T.line}`,
    padding: "10px 16px calc(12px + env(safe-area-inset-bottom, 0px))"
  }}><button
    onClick={undo}
    disabled={!history.length}
    aria-label="Undo the last change"
    style={{
      display: "inline-flex", alignItems: "center", gap: 6, height: 46, padding: "0 14px", borderRadius: 14, border: "none",
      background: T.surfaceAlt, color: history.length ? T.ink : T.inkFaint, cursor: history.length ? "pointer" : "default",
      fontFamily: "inherit", fontSize: 13, fontWeight: 800, opacity: history.length ? 1 : 0.6
    }}
  ><Undo2Look size={16} />Undo</button><button
    onClick={save}
    disabled={saving || !dirty}
    style={{
      flex: 1, height: 46, borderRadius: 14, border: "none", fontFamily: "inherit", fontSize: 14, fontWeight: 800,
      background: dirty ? T.gradButton : T.surfaceAlt, color: dirty ? "#fff" : T.inkFaint,
      cursor: saving || !dirty ? "default" : "pointer", opacity: saving ? 0.7 : 1,
      boxShadow: dirty ? "0 8px 20px rgba(124,58,237,0.28)" : "none"
    }}
  >{saving ? "Saving…" : dirty ? "Save look" : "No changes"}</button></div>

  {
    /* ── LEAVING WITH CHANGES ─────────────────────────────────────────
       Three answers, not a yes/no: save them, throw them away, or go back
       — said in an app sheet, not the browser's confirm(). */
    leaving ? <div onClick={() => setLeaving(false)} style={{
      position: "absolute", inset: 0, zIndex: 30, background: "rgba(21,19,42,0.4)", display: "flex", alignItems: "flex-end"
    }}><div role="dialog" aria-label="Unsaved changes" onClick={(e) => e.stopPropagation()} style={{
      width: "100%", background: T.bg, borderRadius: "24px 24px 0 0", padding: "18px 18px calc(18px + env(safe-area-inset-bottom, 0px))"
    }}><div style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>You have unsaved changes</div><div style={{
      fontSize: 12.5, color: T.inkSoft, marginTop: 4, lineHeight: 1.5
    }}>Save your new look before leaving?</div><div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}><button
      onClick={save}
      style={{ height: 48, borderRadius: 14, border: "none", background: T.gradButton, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}
    >{saving ? "Saving…" : "Save and leave"}</button><button
      onClick={() => { setLeaving(false); if (onClose) onClose(); }}
      style={{ height: 46, borderRadius: 14, border: "none", background: T.surface, color: T.negative, fontSize: 13.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", boxShadow: T.shadowCard }}
    >Discard changes</button><button
      onClick={() => setLeaving(false)}
      style={{ height: 44, borderRadius: 14, border: "none", background: "none", color: T.inkSoft, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
    >Keep editing</button></div></div></div> : null
  }{
    /* ── THE WHOLE PAGE, BEFORE SAVING ────────────────────────────────
       The real page at full size with the new look, scrollable, with a
       bar to come back. Nothing on it is saved yet. */
    fullPage ? <div style={{ position: "fixed", inset: 0, zIndex: 40 }}><CreatorPage
      creator={previewCreator}
      isOwner={false}
      preview
      ccyCode={ccyCode}
      lens={lens}
      onClose={() => setFullPage(false)}
    /><div style={{
      position: "fixed", left: 12, right: 12, bottom: "calc(14px + env(safe-area-inset-bottom, 0px))", zIndex: 400,
      display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 10px 16px", borderRadius: 18,
      background: "rgba(21,19,42,0.92)", color: "#fff", boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
    }}><span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700 }}>Preview — not saved yet</span><button
      onClick={() => setFullPage(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 14px", borderRadius: 12, border: "none",
        background: "#fff", color: T.ink, fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer"
      }}
    ><X21 size={14} />Back to editing</button></div></div> : null
  }</div>;
}
