"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  width?: number;
  height?: number;
};

// Spritesheet: /public/media/01_130x66_130x230.png
const TILE_W = 130;
const TILE_H = 230;
// Isometrische Oberseite (sichtbare Raute) 128×64 im 130×66-Frame
const ISO_W = 128;
const ISO_H = 64;
// Mittelpunkt der Oberseite im Sprite (Feinabgleich)
const TOPFACE_CENTER_Y = 33;

const ROAD_ROW = 0; // Annahme: Straßen liegen in Zeile 0
const ROAD_COLS = [3, 4, 5, 6, 7, 8, 9] as const;

export default function IsostadtCanvas({ width, height }: Props) {
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const fgRef = useRef<HTMLCanvasElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const redrawRef = useRef<() => void>(() => {});

  const [roadsOpen, setRoadsOpen] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [selectedRoadCol, setSelectedRoadCol] = useState<number | null>(null);
  const [gridXOffset, setGridXOffset] = useState(0); // px
  const [gridYOffset, setGridYOffset] = useState(0); // px
  // Fraktionale Grid-Verschiebung (in Zellen)
  // Vorgabe: 2 Zellen nach unten (beide Achsen gleich verschoben)
  const [gridOffI, setGridOffI] = useState(2);
  const [gridOffJ, setGridOffJ] = useState(2);

  const panRef = useRef(false);
  const toolRef = useRef<[number, number] | null>(null); // [row, col]

  useEffect(() => {
    panRef.current = panMode;
    updateCursor();
  }, [panMode]);

  function updateCursor() {
    const fg = fgRef.current;
    if (!fg) return;
    fg.style.cursor = panRef.current ? "all-scroll" : toolRef.current ? "crosshair" : "default";
  }

  useEffect(() => {
    const bg = bgRef.current!;
    const fg = fgRef.current!;
    const area = areaRef.current!;

    let w = (bg.width = width || area.clientWidth || 1400);
    let h = (bg.height = height || area.clientHeight || 900);
    fg.width = w;
    fg.height = h;

    const resizeToContainer = () => {
      const rect = area.getBoundingClientRect();
      w = Math.max(200, Math.floor(rect.width));
      h = Math.max(200, Math.floor(rect.height));
      bg.width = w;
      bg.height = h;
      fg.width = w;
      fg.height = h;
      drawMap();
  drawHover();
    };
    const ro: ResizeObserver | null = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resizeToContainer) : null;
    if (ro) ro.observe(area);

    const ctx = bg.getContext("2d")!;
    const fgctx = fg.getContext("2d")!;

    // Map
  const n = 16; // Boardgröße (vorher 14)
    let map: [number, number][][] = Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0]));

    // Texture
    const texture = new Image();
    texture.src = "/media/01_130x66_130x230.png";

    // Pan/Zoom
    let panX = 0, panY = 0, scale = 1;
    const minScale = 0.5, maxScale = 2.5;
    let panning = false;
    let panStart = { x: 0, y: 0 };
    let pointerStart = { x: 0, y: 0 };
    let hover: { x: number; y: number } | null = null;

    function drawTile(c: CanvasRenderingContext2D, gx: number, gy: number, i: number, j: number) {
      c.save();
  // Vorwärtsabbildung konsistent zur inversen: (x,y) -> ((y-x)*ISO_W/2, (x+y)*ISO_H/2)
  c.translate(((gy - gx) * ISO_W) / 2, ((gx + gy) * ISO_H) / 2);
  // 2px links überspringen (Rahmen), damit die Oberseite exakt getroffen wird
  const srcX = j * TILE_W + 2;
  // Oberseiten-Zentrum exakt auf Rasterzentrum legen
  c.drawImage(texture, srcX, i * TILE_H, TILE_W, TILE_H, -TILE_W / 2, -TOPFACE_CENTER_Y, TILE_W, TILE_H);
      c.restore();
    }

    function drawMap() {
      if (!texture.complete) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + panX, ISO_H * 2 + panY);
      ctx.scale(scale, scale);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const [ti, tj] = map[i][j];
          drawTile(ctx, i, j, ti, tj);
        }
  }
  // Rasterlinien oberhalb der Tiles, damit die Oberseite erkennbar ist
  drawGridLines();
    }

  function drawGridLines() {
      // Subtiles Gitter für alle Zellen zeichnen
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; // dunkler, halbtransparent
      ctx.lineWidth = Math.max(1, 1 / scale);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
      const ii = i + gridOffI;
      const jj = j + gridOffJ;
      const cx = ((jj - ii) * ISO_W) / 2 + gridXOffset;
    const cy = ((ii + jj) * ISO_H) / 2 + gridYOffset;
          ctx.beginPath();
          ctx.moveTo(cx, cy - ISO_H / 2);
          ctx.lineTo(cx + ISO_W / 2, cy);
          ctx.lineTo(cx, cy + ISO_H / 2);
          ctx.lineTo(cx - ISO_W / 2, cy);
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    function drawHover() {
      fgctx.setTransform(1, 0, 0, 1, 0, 0);
      fgctx.clearRect(0, 0, w, h);
      if (!hover) return;
      fgctx.translate(w / 2 + panX, ISO_H * 2 + panY);
      fgctx.scale(scale, scale);
  const i = hover.x; // row
  const j = hover.y; // col
  const cx = (((j + gridOffJ) - (i + gridOffI)) * ISO_W) / 2 + gridXOffset;
  const cy = (((i + gridOffI) + (j + gridOffJ)) * ISO_H) / 2 + gridYOffset;
      fgctx.beginPath();
      fgctx.moveTo(cx, cy - ISO_H / 2);
      fgctx.lineTo(cx + ISO_W / 2, cy);
      fgctx.lineTo(cx, cy + ISO_H / 2);
      fgctx.lineTo(cx - ISO_W / 2, cy);
      fgctx.closePath();
  // Light fill to make the hovered cell pop on any background
  fgctx.fillStyle = "rgba(59,130,246,0.20)";
  fgctx.fill();
      // Outer white stroke for contrast
      fgctx.strokeStyle = "rgba(255,255,255,0.9)";
      fgctx.lineWidth = Math.max(2, 4 / scale);
      fgctx.stroke();
      // Inner blue stroke
      fgctx.strokeStyle = "rgba(59,130,246,1)";
      fgctx.lineWidth = Math.max(1, 2 / scale);
      fgctx.stroke();
    }

    function gridFromPoint(localX: number, localY: number) {
      const originX = w / 2 + panX;
      const originY = ISO_H * 2 + panY;
      // Mausposition in vor-Transformations-Koordinaten (pre-scale/pre-translate)
  const sx = (localX - originX) / scale - gridXOffset;
  const sy = (localY - originY) / scale - gridYOffset;
      // Inverse kontinuierliche Koordinaten
    // Fractional Offsets abziehen, damit das Raster-Index mit dem versetzten Gitter übereinstimmt
    const iFloat = sy / ISO_H - sx / ISO_W - gridOffI; // row
    const jFloat = sy / ISO_H + sx / ISO_W - gridOffJ; // col
      const i0 = Math.floor(iFloat);
      const j0 = Math.floor(jFloat);
      // Kandidaten um den Mauspunkt (4 Nachbarn)
      const candidates: Array<{ i: number; j: number; d2: number }> = [];
      for (let di = 0; di <= 1; di++) {
        for (let dj = 0; dj <= 1; dj++) {
          const i = i0 + di;
          const j = j0 + dj;
          // Mittelpunkt der Oberseite in pre-scale coords
          const cx = (((j + gridOffJ) - (i + gridOffI)) * ISO_W) / 2 + gridXOffset;
          const cy = (((i + gridOffI) + (j + gridOffJ)) * ISO_H) / 2 + gridYOffset;
          const dx = sx - cx;
          const dy = sy - cy;
          candidates.push({ i, j, d2: dx * dx + dy * dy });
        }
      }
      // Nächsten Mittelpunkt wählen
      candidates.sort((a, b) => a.d2 - b.d2);
      let ix = candidates[0].i;
      let iy = candidates[0].j;
      const inBounds = ix >= 0 && ix < n && iy >= 0 && iy < n;
      // Auf Grid klemmen, damit Hover sichtbar bleibt
      ix = Math.max(0, Math.min(n - 1, ix));
      iy = Math.max(0, Math.min(n - 1, iy));
      return { x: ix, y: iy, inBounds } as const;
    }

    function zoomAt(localX: number, localY: number, delta: number) {
      const prev = scale;
      scale = Math.min(maxScale, Math.max(minScale, scale * (delta > 0 ? 0.9 : 1.111)));
      const originX = w / 2 + panX;
      const originY = ISO_H * 2 + panY;
      const dx = localX - originX;
      const dy = localY - originY;
      panX -= (dx / prev) * (scale - prev);
      panY -= (dy / prev) * (scale - prev);
    }

    // Events
    fg.style.touchAction = "none";

    const onMouseDown = (e: MouseEvent) => {
      if (panRef.current || e.button === 1 || e.shiftKey) {
        panning = true;
        panStart = { x: panX, y: panY };
        pointerStart = { x: e.clientX, y: e.clientY };
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (panning) {
        panning = false;
        return;
      }
      if (!toolRef.current) return;
      const rect = fg.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      const pos = gridFromPoint(lx, ly);
      if (pos.inBounds) {
        map[pos.x][pos.y] = [toolRef.current[0], toolRef.current[1]];
        drawMap();
        hover = { x: pos.x, y: pos.y };
        drawHover();
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (panning) {
        panX = panStart.x + (e.clientX - pointerStart.x);
        panY = panStart.y + (e.clientY - pointerStart.y);
        drawMap();
        drawHover();
        return;
      }
      const rect = fg.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      const pos = gridFromPoint(lx, ly);
      if (!hover || hover.x !== pos.x || hover.y !== pos.y) {
        hover = { x: pos.x, y: pos.y };
        drawHover();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = fg.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      zoomAt(lx, ly, e.deltaY);
      drawMap();
      drawHover();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        zoomAt(w / 2, h / 2, -1);
  drawMap();
  drawHover();
      } else if (e.key === "-" || e.key === "_") {
        zoomAt(w / 2, h / 2, +1);
  drawMap();
  drawHover();
      }
    };

  const onMouseLeave = () => { panning = false; hover = null; drawHover(); };
  fg.addEventListener("mousedown", onMouseDown);
  fg.addEventListener("mouseup", onMouseUp);
  fg.addEventListener("mouseleave", onMouseLeave);
    fg.addEventListener("mousemove", onMouseMove);
    fg.addEventListener("wheel", onWheel, { passive: false } as any);
    window.addEventListener("keydown", onKey);

  texture.onload = () => {
      resizeToContainer();
      drawMap();
      drawHover();
    };
    resizeToContainer();
    drawHover();

  // Externe Redraw-Funktion bereitstellen
  redrawRef.current = () => { drawMap(); drawHover(); };

    return () => {
  fg.removeEventListener("mousedown", onMouseDown);
  fg.removeEventListener("mouseup", onMouseUp);
  fg.removeEventListener("mouseleave", onMouseLeave);
  fg.removeEventListener("mousemove", onMouseMove);
  fg.removeEventListener("wheel", onWheel as any);
      window.removeEventListener("keydown", onKey);
      if (ro) ro.disconnect();
    };
  }, [width, height]);

  // Auf Grid-Settings reagieren und neu zeichnen
  useEffect(() => {
    redrawRef.current?.();
  }, [gridOffI, gridOffJ, gridXOffset, gridYOffset]);

  // Overlay-Öffnung: bereits gewähltes Straßenwerkzeug anzeigen
  useEffect(() => {
    if (roadsOpen) {
      const cur = toolRef.current;
      if (cur && cur[0] === ROAD_ROW) setSelectedRoadCol(cur[1]);
      else setSelectedRoadCol(null);
    }
  }, [roadsOpen]);

  return (
    <div id="main" style={{ display: "grid", gridTemplateColumns: "1fr 3fr", height: "100%", position: "relative" }}>
      <aside id="sidebar" aria-label="Werkzeuge" style={{ borderRight: "1px solid #ddd", padding: 10, overflow: "auto" }}>
        <div className="sidebar-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Werkzeuge</h2>
          <div className="tool-actions" role="toolbar" aria-label="Werkzeuge" style={{ display: "inline-flex", gap: 8 }}>
            <button
              id="panModeBtn"
              className="tool-btn"
              aria-pressed={panMode ? "true" : "false"}
              title="Spielfeld verschieben"
              onClick={() => setPanMode((v) => !v)}
              style={{ border: "1px solid #bbb", background: panMode ? "#dbeafe" : "#f5f5f5", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
                <path d="M12 2l3 3-3-3-3 3 3-3v20l-3-3 3 3 3-3-3 3V2z" />
                <path d="M2 12l3-3-3 3 3 3-3-3h20l-3-3 3 3-3 3 3-3H2z" />
              </svg>
            </button>
            <button
              id="roadBtn"
              className="tool-btn"
              aria-pressed={roadsOpen ? "true" : "false"}
              title="Straßen bauen"
              onClick={() => setRoadsOpen(true)}
              style={{ border: "1px solid #bbb", background: roadsOpen ? "#dbeafe" : "#f5f5f5", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Straße
            </button>
          </div>
        </div>
  <p style={{ color: "#666", fontSize: 14, margin: 0 }}>1) Pfeil-Button: Ziehen zum Verschieben. 2) Straße: Overlay öffnen und Typ wählen, dann ins Feld klicken.</p>
      </aside>

      <div ref={areaRef} id="area" aria-label="Spielfläche" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
  <canvas ref={bgRef} id="bg" style={{ position: "absolute", inset: 0, zIndex: 0 }} />
  <canvas ref={fgRef} id="fg" style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "auto" }} />

        {roadsOpen && (
          <div style={{ position: "absolute", top: 12, right: 12, zIndex: 20, pointerEvents: "none" }}>
            <div style={{ pointerEvents: "auto", background: "#fff", borderRadius: 10, width: 420, maxWidth: "min(90vw, 420px)", padding: 16, boxShadow: "0 10px 40px rgba(0,0,0,0.35)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>Straßen auswählen</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#555", fontSize: 14 }}>Aktuell:</span>
                    <div style={{ width: 65, height: 115, border: "1px solid #ddd", borderRadius: 6, background: "#f9fafb", overflow: "hidden" }}>
                      {selectedRoadCol != null ? (
                        <div
                          aria-label={`Ausgewählte Kachel ${selectedRoadCol}`}
                          style={{ width: TILE_W, height: TILE_H, backgroundImage: "url('/media/01_130x66_130x230.png')", backgroundRepeat: "no-repeat", backgroundPosition: `-${selectedRoadCol * TILE_W + 2}px -${ROAD_ROW * TILE_H}px`, transform: "scale(0.5)", transformOrigin: "top left" }}
                        />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "#aaa", fontSize: 12 }}>—</div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setRoadsOpen(false)} style={{ border: "1px solid #bbb", background: "#f5f5f5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Schließen</button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, justifyContent: "center", maxHeight: "60vh", overflow: "auto", padding: 4 }}>
                {ROAD_COLS.map((col) => (
                  <button
                    key={col}
                    onClick={() => {
                      toolRef.current = [ROAD_ROW, col];
                      setSelectedRoadCol(col);
                      setPanMode(false);
                      updateCursor();
                    }}
                    style={{
                      width: 70,
                      height: 115,
                      border: selectedRoadCol === col ? "3px solid #3b82f6" : "2px solid #b05355",
                      boxShadow: selectedRoadCol === col ? "0 0 0 3px rgba(59,130,246,0.25)" : "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      overflow: "hidden",
                      background: "#f9fafb",
                    }}
                    title={`Objekt ${col}`}
                  >
                    <div
                      style={{
                        width: TILE_W,
                        height: TILE_H,
                        backgroundImage: "url('/media/01_130x66_130x230.png')",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: `-${col * TILE_W + 2}px -${ROAD_ROW * TILE_H}px`,
                        transform: "scale(0.5)",
                        transformOrigin: "top left",
                      }}
                    />
                  </button>
                ))}
              </div>

              <p style={{ marginTop: 10, color: "#666" }}>Klicke eine Kachel, sie bleibt markiert. Panel kann offen bleiben; Feld bleibt interaktiv.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
