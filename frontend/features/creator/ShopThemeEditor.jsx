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
import { useState as useState55, useEffect as useEffect57 } from "react";
import { Check as Check10 } from "lucide-react";

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
  { field: "photoShape", label: "Photo shape", options: ["rounded", "circle", "wide", "tall"], table: "SHOP_PHOTO_SHAPES" }
];

var SHOP_CARD_LABELS = { raised: "Raised", flat: "Flat", outline: "Outline", plain: "Plain" };

function shopOptionLabel(field, key) {
  if (field === "cards") return SHOP_CARD_LABELS[key] || key;
  if (field === "corners") return (SHOP_CORNERS[key] || {}).name || key;
  if (field === "density") return (SHOP_DENSITY[key] || {}).name || key;
  if (field === "layout") return (SHOP_LAYOUTS[key] || {}).name || key;
  if (field === "photoShape") return (SHOP_PHOTO_SHAPES[key] || {}).name || key;
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

function ShopThemeEditor({ shop, cover, symbolId, ccyCode = "USD", lens = null, onClose, onSave, onSaveCover }) {
  // Edited as a draft and written once. A screen with eleven controls that
  // saved on every tap would be eleven requests and eleven chances for a
  // half-applied look.
  const [draft, setDraft] = useState55(() => Object.assign({
    theme: "gloobal", color: "", font: "grotesk", corners: "round", cards: "raised",
    density: "cosy", photoShape: "rounded", layout: "list", tagline: "", announceText: "",
    announceColor: "", announceOn: true
  }, shop && typeof shop === "object" ? shop : {}));
  const [saving, setSaving] = useState55(false);
  const [error, setError] = useState55("");

  const set = (patch) => setDraft((d) => Object.assign({}, d, patch));
  // Every sample in the Type list is drawn in its own face, so all of them
  // are fetched when this screen opens rather than one by one as tapped.
  useEffect57(() => { Object.keys(SHOP_FONTS).forEach(ensureShopFont); }, []);
  const theme = resolveShopTheme(draft);

  // Picking a theme REPLACES the dials rather than merging over them.
  //
  // The alternative — keeping whatever corners somebody had set — means
  // tapping "Studio" gives a thing that is not Studio, and the preset stops
  // meaning anything. Everything stays editable immediately afterwards, so
  // nothing is lost that cannot be put back in one tap.
  const applyTheme = (key) => {
    const base = SHOP_THEMES[key] || SHOP_THEMES.gloobal;
    set({
      theme: key, color: base.color, font: base.font, corners: base.corners,
      cards: base.cards, density: base.density, photoShape: base.photoShape, dark: base.dark
    });
  };

  const row = (label, children) => <div style={{ marginBottom: 16 }}><div style={{
    fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase",
    color: T.inkSoft, marginBottom: 9
  }}>{label}</div>{children}</div>;

  return <div style={{
    position: "fixed", inset: 0, zIndex: 350, background: T.bg,
    display: "flex", flexDirection: "column", overflow: "hidden"
  }}><div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "calc(15px + env(safe-area-inset-top, 0px)) 16px 10px", flexShrink: 0
  }}><NavBackButton onClick={onClose} /><span style={{
    flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay
  }}>How your shop looks</span><button
    onClick={async () => {
      setSaving(true);
      setError("");
      const ok = onSave ? await onSave(draft) : false;
      setSaving(false);
      if (ok) onClose && onClose(); else setError("Could not save that just now.");
    }}
    disabled={saving}
    style={{
      background: T.gradButton, color: "#fff", border: "none", borderRadius: 13,
      padding: "9px 16px", fontSize: 12.5, fontWeight: 800, fontFamily: "inherit",
      cursor: saving ? "default" : "pointer", flexShrink: 0, opacity: saving ? 0.7 : 1
    }}
  >{saving ? "Saving…" : "Save"}</button></div>

  <div style={{
    flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px 30px"
  }}><div style={{ marginBottom: 6 }}><ShopThemePreview shop={draft} lens={lens} ccyCode={ccyCode} /></div>
  <div style={{
    fontSize: 11, color: T.inkFaint, fontWeight: 600, margin: "9px 2px 18px", lineHeight: 1.5
  }}>Your colour washes the page and fills your name card, the chips and the Add button. The price keeps the app's own look in every shop, so people can read a figure the same way everywhere.</div>

  {row("Cover photo", <ShopCoverPicker
    cover={cover}
    accent={theme.color}
    onError={(m) => setError(m)}
    onPick={async (photo) => { setError(""); if (onSaveCover) await onSaveCover({ photo }); }}
    onMove={(focusY) => { if (onSaveCover) onSaveCover({ focusY }); }}
    onRemove={async () => { if (onSaveCover) await onSaveCover({ remove: true }); }}
  />)}

  {row("Theme", <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{
    SHOP_THEME_KEYS.map((key) => {
      const t = SHOP_THEMES[key];
      const on = draft.theme === key;
      return <button
        key={key}
        onClick={() => applyTheme(key)}
        style={{
          textAlign: "left", border: "none", cursor: "pointer", fontFamily: "inherit",
          background: T.surface, borderRadius: 16, padding: "12px 13px",
          boxShadow: on ? `0 0 0 2.5px ${T.accent}, ${T.shadowCard}` : T.shadowCard
        }}
      ><span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{
        width: 22, height: 22, borderRadius: 7, background: t.color, flexShrink: 0
      }} /><span style={{
        flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: T.ink,
        fontFamily: (SHOP_FONTS[t.font] || {}).stack
      }}>{t.name}</span>{on ? <Check10 size={13} color={T.accent} /> : null}</span><span style={{
        display: "block", fontSize: 10, color: T.inkFaint, marginTop: 5, fontWeight: 600, lineHeight: 1.35
      }}>{t.note}</span></button>;
    })
  }</div>)}

  {row("Colour", <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>{
    SHOP_COLORS.map((c) => {
      const on = (draft.color || theme.color).toUpperCase() === c.toUpperCase();
      return <button
        key={c}
        onClick={() => set({ color: c })}
        aria-label={`Use ${c}`}
        style={{
          width: 40, height: 40, borderRadius: 13, background: c, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: on ? `0 0 0 2.5px ${T.surface}, 0 0 0 5px ${T.ink}` : "none"
        }}
      >{on ? <Check10 size={15} color="#fff" /> : null}</button>;
    })
  }</div>)}

  {row("Type", <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{
    Object.keys(SHOP_FONTS).map((key) => {
      const f = SHOP_FONTS[key];
      const on = (draft.font || theme.font) === key || theme.font === f;
      const active = draft.font === key;
      return <button
        key={key}
        onClick={() => set({ font: key })}
        style={{
          display: "flex", alignItems: "center", gap: 12, textAlign: "left",
          background: T.surface, borderRadius: 15, padding: "12px 14px", border: "none",
          cursor: "pointer", fontFamily: "inherit",
          boxShadow: active ? `0 0 0 2px ${T.accent}, ${T.shadowCard}` : T.shadowCard
        }}
      ><span style={{ flex: 1, minWidth: 0 }}><span style={{
        display: "block", fontSize: 17, color: T.ink, fontFamily: f.stack, fontWeight: f.weight
      }}>रसोई ghar</span><span style={{
        display: "block", fontSize: 10, color: T.inkFaint, fontWeight: 600, marginTop: 3
      }}>{f.name} · {f.note}</span></span>{active ? <Check10 size={15} color={T.accent} /> : null}</button>;
    })
  }</div>)}

  {SHOP_EDIT_SECTIONS.map((sec) => row(sec.label, <div style={{ display: "flex", gap: 8 }}>{
    sec.options.map((key) => {
      const active = draft[sec.field] === key;
      return <button
        key={key}
        onClick={() => set({ [sec.field]: key })}
        style={{
          flex: 1, background: T.surface, borderRadius: 13, padding: "10px 4px", border: "none",
          cursor: "pointer", fontFamily: "inherit",
          boxShadow: active ? `0 0 0 2px ${T.accent}, ${T.shadowCard}` : T.shadowCard
        }}
      ><span style={{
        display: "block", fontSize: 10.5, fontWeight: 700,
        color: active ? T.accent : T.ink
      }}>{shopOptionLabel(sec.field, key)}</span></button>;
    })
  }</div>))}

  {row("Tagline", <div style={{
    background: T.surface, borderRadius: 15, padding: "11px 14px", boxShadow: T.shadowCard
  }}><label htmlFor="shop-tagline" style={{
    display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7,
    textTransform: "uppercase", color: T.inkFaint
  }}>One line under your name</label><input
    id="shop-tagline"
    value={draft.tagline || ""}
    maxLength={60}
    placeholder="Chai since 2015"
    onChange={(e) => set({ tagline: e.target.value })}
    style={{
      width: "100%", border: "none", outline: "none", background: "none", marginTop: 5,
      fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: "inherit"
    }}
  /></div>)}

  {row("Announcement", <>
    <div style={{
      background: T.surface, borderRadius: 15, padding: "11px 14px", boxShadow: T.shadowCard, marginBottom: 9
    }}><label htmlFor="shop-announce" style={{
      display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7,
      textTransform: "uppercase", color: T.inkFaint
    }}>A band across the very top</label><input
      id="shop-announce"
      value={draft.announceText || ""}
      maxLength={70}
      placeholder="Fresh samosas from 4pm"
      onChange={(e) => set({ announceText: e.target.value })}
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
    /></div></>)}

  {error ? <div style={{
    fontSize: 12, fontWeight: 700, color: T.negative, marginTop: 4
  }}>{error}</div> : null}
  </div></div>;
}
