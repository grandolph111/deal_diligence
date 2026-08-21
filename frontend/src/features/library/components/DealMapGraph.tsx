import { useRef, useEffect, useCallback, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, NodeSingular } from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize, RefreshCw } from 'lucide-react';
import type { DealMap, DealMapNode } from '../../../api/services/library.service';
import './deal-map.css';

/* ---- palette ----
 * Tuned for a dark canvas. Each node is a flat disc with a hairline rim.
 *
 * The lit-sphere treatment this replaces — radial gradient plus a wide
 * translucent border standing in for a glow — gave every dot a plastic-bead
 * look, and the halo's hard outer edge read as a second, blurry ring. Flat
 * fills with a single crisp edge are what makes a hundred small nodes look
 * like one system rather than a bowl of marbles; depth now comes from the
 * ground and from what happens on hover, not from shading each disc.
 */
type Swatch = { core: string; rim: string; glow: string };

/** Blend two hex colours; used to derive rims that sit between fill and shadow. */
function mix(a: string, b: string, t: number): string {
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
}

/**
 * Risk reads as a continuous ramp, one step per score.
 *
 * Three coarse bands collapsed almost the whole deal into a single colour —
 * 87 of 100 documents score 4-6 — which told the reader nothing. Per-score
 * steps make the difference between a 4 and a 6 visible, which is the
 * comparison someone scanning the map is actually making.
 */
const RISK_RAMP: Swatch[] = [
  { core: '#8fd6c4', rim: '#3f8a78', glow: 'rgba(90,180,160,0.20)' }, // 0
  { core: '#96d8bb', rim: '#428a6e', glow: 'rgba(96,182,150,0.20)' }, // 1
  { core: '#a6da ad'.replace(' ', ''), rim: '#4d8a5f', glow: 'rgba(112,182,130,0.20)' }, // 2
  { core: '#bcdc9e', rim: '#63894a', glow: 'rgba(140,184,110,0.21)' }, // 3
  { core: '#d5dc92', rim: '#7f8740', glow: 'rgba(170,180,95,0.21)' }, // 4
  { core: '#ecd489', rim: '#9c8038', glow: 'rgba(200,168,80,0.22)' }, // 5
  { core: '#f2bd7e', rim: '#b3702f', glow: 'rgba(215,140,70,0.23)' }, // 6
  { core: '#f2a075', rim: '#bd5c2c', glow: 'rgba(220,115,60,0.24)' }, // 7
  { core: '#f08a7c', rim: '#c04432', glow: 'rgba(224,95,60,0.25)' }, // 8
  { core: '#ed7683', rim: '#c33448', glow: 'rgba(226,75,80,0.26)' }, // 9
  { core: '#e8637f', rim: '#bf2748', glow: 'rgba(226,60,85,0.28)' }, // 10
];

const PALETTE: Record<string, Swatch> = {
  // Deliberately duller than the risk ramp: hubs are the frame, and near-white
  // discs made the scaffolding louder than the documents it holds.
  root: { core: '#c9b6f0', rim: '#7d5fca', glow: 'rgba(150,116,222,0.34)' },
  riskCategory: { core: '#9db6d8', rim: '#5c789e', glow: 'rgba(139,164,201,0.26)' },
  none: { core: '#7d8ba4', rim: '#454f63', glow: 'rgba(122,139,164,0.14)' },
  ...Object.fromEntries(RISK_RAMP.map((sw, i) => [`r${i}`, sw])),
};

const EDGE_COLOR = { CONTAINS: '#2f3d56', PEER: '#3b5265' };

/** Which palette entry a node draws from. */
function paletteKey(n: DealMapNode): string {
  if (n.type === 'ROOT') return 'root';
  if (n.type === 'RISK_CATEGORY') return 'riskCategory';
  if (!n.analyzed) return 'none';
  if (n.riskScore != null) {
    return `r${Math.max(0, Math.min(10, Math.round(n.riskScore)))}`;
  }
  // No numeric score — fall back to the coarse level at ramp midpoints.
  const lvl = (n.riskLevel ?? '').toUpperCase();
  if (lvl === 'HIGH') return 'r8';
  if (lvl === 'MEDIUM') return 'r5';
  if (lvl === 'LOW') return 'r2';
  return 'none';
}

const truncate = (s: string, max = 30) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/**
 * Deterministic positions: root at centre, risk categories on a ring, each
 * risk category's documents filling a disc around it.
 *
 * A force layout cannot be relied on here. Documents link both to their hub and
 * to peers in other clusters, and any spring setting that keeps a 36-document
 * cluster from collapsing onto its hub also lets the peer links drag every
 * cluster into one mass — it settles into either a ball or a line. The
 * structure is known, so placing it directly is both stable and far more
 * legible; the phyllotaxis fill keeps it organic rather than gridded.
 */
/**
 * Clear radius around a hub: its largest rendered radius (28) plus room for the
 * label that hangs under it, so neither the disc nor its name collides with the
 * documents it holds.
 */
const HUB_HOLE = 52;

function clusterPositions(map: DealMap): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const hubs = map.nodes.filter((n) => n.type === 'RISK_CATEGORY');
  if (hubs.length === 0) return pos;

  const docsByHub = new Map<string, string[]>();
  for (const n of map.nodes) {
    if (n.type !== 'DOCUMENT') continue;
    const key = `ws:${n.riskCategoryId}`;
    const bucket = docsByHub.get(key) ?? [];
    bucket.push(n.id);
    docsByHub.set(key, bucket);
  }

  const discFor = (n: number) => (n === 0 ? 0 : 44 + Math.sqrt(n) * 25);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  // Shelf-pack the clusters into the canvas aspect rather than a ring. A circle
  // spends half its area on the empty middle and forces `fit` to zoom out until
  // the labels stop resolving; packing rows uses the space the canvas actually
  // has, which is wide and short.
  const hubCells = hubs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((hub) => {
      const docs = docsByHub.get(hub.id) ?? [];
      const disc = discFor(docs.length);
      return { id: hub.id, docs, disc, w: Math.max(150, disc * 2 + 96), h: disc * 2 + 78 };
    });

  const cells = hubCells;

  const totalArea = cells.reduce((a, c) => a + c.w * c.h, 0);
  const targetWidth = Math.sqrt(totalArea * 1.9); // canvas is roughly 2:1

  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let maxX = 0;
  for (const c of cells) {
    if (x > 0 && x + c.w > targetWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    const cx = x + c.w / 2;
    const cy = y + c.h / 2;
    pos[c.id] = { x: cx, y: cy };

    c.docs.forEach((id, j) => {
      // Phyllotaxis over an annulus: even coverage of the disc without visible
      // rows, with a hole the size of the hub so no document is drawn sitting
      // on top of the disc and label it belongs to.
      const r = Math.sqrt(HUB_HOLE ** 2 + (c.disc ** 2 - HUB_HOLE ** 2) * ((j + 0.5) / c.docs.length));
      const a = j * GOLDEN;
      pos[id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });

    x += c.w;
    maxX = Math.max(maxX, x);
    rowHeight = Math.max(rowHeight, c.h);
  }

  // Deal sits in its own band above everything, so the hierarchy reads
  // top-down and nothing can collide with it.
  pos.root = { x: maxX / 2, y: -140 };

  return pos;
}

/**
 * Fit, then give back the strip the legend floats over.
 *
 * A plain `fit` centres the graph in the whole canvas, which put the last row
 * of risk categories — the empty ones — underneath the legend where their labels
 * were unreadable.
 */
const LEGEND_STRIP = 64;

function fitMap(cy: Core) {
  cy.fit(undefined, 48);
  const h = cy.height();
  if (h <= LEGEND_STRIP * 2) return;
  cy.zoom({
    level: cy.zoom() * ((h - LEGEND_STRIP) / h),
    renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
  });
  cy.panBy({ x: 0, y: -LEGEND_STRIP / 2 });
}

interface Props {
  map: DealMap;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (node: DealMapNode | null) => void;
  onRefresh: () => void;
}

/**
 * The deal drawn as a network: root → risk categories → documents, with documents
 * linked where they share clause language.
 *
 * Node size follows link count, so the contracts everything else resembles
 * become visibly central. Hovering dims everything that is not a neighbour,
 * which is the only interaction that makes a few hundred edges readable.
 */
export function DealMapGraph({ map, loading, error, selectedId, onSelect, onRefresh }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const nodeIndex = useRef<Map<string, DealMapNode>>(new Map());
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Init once — rebuilding on every prop change would lose pan/zoom and restart
  // the layout mid-interaction.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            width: 'data(size)',
            height: 'data(size)',
            // A hairline rim, not a halo: enough to separate touching discs
            // without giving each one a second visible ring.
            'border-width': 1,
            'border-opacity': 0.85,
            // Glow is spent on the one node being looked at, so it stays a
            // signal instead of a permanent fringe on all 106 of them.
            'outline-width': 0,
            'outline-opacity': 1,
            label: '',
            color: '#c8d4e6',
            'font-size': '9px',
            'font-weight': 500,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            'text-outline-width': 2.5,
            'text-outline-color': '#0a1120',
            'text-outline-opacity': 0.5,
            'transition-property': 'opacity, outline-width',
            'transition-duration': 160,
          } as unknown as cytoscape.Css.Node,
        },
        // One class per palette entry: colours must be literal in the sheet.
        ...Object.entries(PALETTE).map(([key, p]) => ({
          selector: `node.k-${key.toLowerCase()}`,
          style: {
            'background-color': p.core,
            'border-color': mix(p.core, p.rim, 0.7),
            'outline-color': p.glow,
          } as unknown as cytoscape.Css.Node,
        })),
        {
          // Hubs are always named; documents only on demand.
          selector: 'node[type="RISK_CATEGORY"]',
          style: {
            label: 'data(label)',
            'font-size': '11px',
            'font-weight': 600,
            color: '#dbe6f6',
            'text-margin-y': 9,
            // Hub names sit above the documents so a dot from the ring can
            // never be drawn over the label it belongs beside.
            'z-index': 20,
          } as cytoscape.Css.Node,
        },
        {
          selector: 'node[type="ROOT"]',
          style: {
            label: 'data(label)',
            'font-size': '13px',
            'font-weight': 700,
            color: '#f0e9ff',
            'text-margin-y': 8,
            'z-index': 21,
          } as cytoscape.Css.Node,
        },
        {
          selector: 'node.hl',
          style: { 'z-index': 99, 'outline-width': 'data(ring)' } as unknown as cytoscape.Css.Node,
        },
        // Naming every neighbour at once printed forty filenames on top of each
        // other; the hovered node is always named, its neighbours only when few
        // enough that the names do not collide.
        { selector: 'node.hl-label', style: { label: 'data(label)' } as cytoscape.Css.Node },
        {
          selector: 'node.focus',
          style: { label: 'data(label)', color: '#f2f6fd', 'z-index': 101 } as cytoscape.Css.Node,
        },
        { selector: 'node.dim', style: { opacity: 0.12 } as cytoscape.Css.Node },
        {
          selector: 'node:selected',
          style: {
            label: 'data(label)',
            'border-color': '#f0d9a8',
            'outline-color': 'rgba(240,217,168,0.30)',
            'outline-width': 'data(ring)',
            'z-index': 100,
          } as unknown as cytoscape.Css.Node,
        },
        {
          // Gently bowed rather than dead straight: a few hundred taut lines
          // crossing at hard angles is what made the field read as a hairball.
          // Arcs of the same length separate where they overlap.
          selector: 'edge',
          style: {
            width: 'data(w)',
            'line-color': 'data(color)',
            'curve-style': 'unbundled-bezier',
            'control-point-distances': 'data(bow)',
            'control-point-weights': 0.5,
            'target-arrow-shape': 'none',
            opacity: 'data(op)',
            'transition-property': 'opacity, line-color',
            'transition-duration': 160,
          } as unknown as cytoscape.Css.Edge,
        },
        { selector: 'edge.hl', style: { opacity: 0.85, 'line-color': '#8fb3c9', width: 1.6 } as cytoscape.Css.Edge },
        { selector: 'edge.dim', style: { opacity: 0.03 } as cytoscape.Css.Edge },
      ],
      layout: { name: 'preset' },
      minZoom: 0.08,
      maxZoom: 4,
      wheelSensitivity: 0.25,
    });

    const highlight = (node: NodeSingular) => {
      const near = node.closedNeighborhood();
      cy.elements().addClass('dim');
      near.removeClass('dim').addClass('hl');
      node.addClass('focus');
      if (near.nodes().length <= 12) near.nodes().addClass('hl-label');
    };
    const clearHighlight = () => cy.elements().removeClass('dim hl hl-label focus');

    cy.on('mouseover', 'node', (e) => {
      highlight(e.target as NodeSingular);
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'node', () => {
      clearHighlight();
      if (containerRef.current) containerRef.current.style.cursor = 'default';
    });
    cy.on('tap', 'node', (e) => {
      const n = nodeIndex.current.get((e.target as NodeSingular).id());
      if (n) onSelectRef.current(n);
    });
    cy.on('tap', (e) => {
      if (e.target === cy) onSelectRef.current(null);
    });

    cyRef.current = cy;
    setReady(true);
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Feed data + run the force layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || map.nodes.length === 0) return;

    nodeIndex.current = new Map(map.nodes.map((n) => [n.id, n]));

    // Link count drives size, so hubs emerge from the data rather than from type.
    const degree = new Map<string, number>();
    for (const e of map.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }

    const els: ElementDefinition[] = [];
    for (const n of map.nodes) {
      const d = degree.get(n.id) ?? 0;
      // Three separated size bands so the hierarchy is legible at a glance:
      // deal ≫ risk category ≫ document, with no overlap between them.
      const base =
        n.type === 'ROOT'
          // Just clear of the largest risk category (56) — enough to read as the
          // root of the hierarchy without dominating the field.
          ? 64
          : n.type === 'RISK_CATEGORY'
            // Bigger risk categories hold more, but never small enough to be
            // mistaken for a document or big enough to rival the deal.
            ? 40 + Math.min(16, Math.sqrt(n.documentCount) * 2.6)
            : 10 + Math.min(11, Math.sqrt(d) * 2.4);
      els.push({
        data: {
          id: n.id,
          type: n.type,
          label: truncate(n.label, n.type === 'DOCUMENT' ? 34 : 26),
          size: base,
          // Halo shown only under the cursor, so it can be generous.
          ring: Math.max(5, base * 0.38),
        },
        classes: `k-${paletteKey(n)}`,
      });
    }
    const positions = clusterPositions(map);
    map.edges.forEach((e, i) => {
      const a = positions[e.source];
      const b = positions[e.target];
      const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
      // Bow scales with span and alternates side, so parallel runs between two
      // clusters fan out instead of stacking into one thick smear.
      const bow = e.type === 'CONTAINS' ? 0 : Math.min(46, len * 0.075) * (i % 2 ? 1 : -1);
      els.push({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          color: EDGE_COLOR[e.type],
          bow,
          op: e.type === 'CONTAINS' ? 0.16 : 0.2,
          w: e.type === 'CONTAINS' ? 0.8 : Math.min(1.6, 0.5 + e.weight * 0.13),
        },
      });
    });

    cy.elements().remove();
    cy.add(els);
    cy.layout({
      name: 'preset',
      positions: (n: NodeSingular) => positions[n.id()] ?? { x: 0, y: 0 },
      fit: false,
      animate: false,
    } as cytoscape.LayoutOptions).run();
    fitMap(cy);
  }, [map, ready]);

  // Reflect external selection.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.nodes().unselect();
    if (selectedId) cy.getElementById(selectedId).select();
  }, [selectedId]);

  const zoom = useCallback((factor: number) => {
    const cy = cyRef.current;
    if (cy && !cy.destroyed()) cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const fit = useCallback(() => {
    const cy = cyRef.current;
    if (cy && !cy.destroyed()) fitMap(cy);
  }, []);

  return (
    <div className="dmap">
      <div ref={containerRef} className="dmap__canvas" />

      {loading && <div className="dmap__state">Building the map…</div>}
      {!loading && error && (
        <div className="dmap__state">
          <p>{error}</p>
          <button className="button secondary" onClick={onRefresh}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}
      {!loading && !error && map.nodes.length === 0 && (
        <div className="dmap__state">The map appears once documents are analyzed.</div>
      )}

      {!loading && !error && map.nodes.length > 0 && (
        <>
          <div className="dmap__controls">
            <button onClick={onRefresh} title="Rebuild"><RefreshCw size={15} /></button>
            <button onClick={() => zoom(1.3)} title="Zoom in"><ZoomIn size={15} /></button>
            <button onClick={() => zoom(1 / 1.3)} title="Zoom out"><ZoomOut size={15} /></button>
            <button onClick={fit} title="Fit"><Maximize size={15} /></button>
          </div>
          <div className="dmap__legend">
            <span className="dmap__key"><i style={{ background: PALETTE.root.core }} /> Deal</span>
            <span className="dmap__key"><i style={{ background: PALETTE.riskCategory.core }} /> Risk category</span>
            <span className="dmap__key dmap__key--ramp">
              Risk
              <span className="dmap__ramp" aria-hidden="true">
                {RISK_RAMP.map((sw, i) => (
                  <i key={i} style={{ background: sw.core }} />
                ))}
              </span>
              <span className="dmap__ramp-ends">low → high</span>
            </span>
            <span className="dmap__key"><i style={{ background: PALETTE.none.core }} /> Not analyzed</span>
          </div>
        </>
      )}
    </div>
  );
}
