import { useRef, useEffect, useCallback, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, NodeSingular } from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize, RefreshCw, Download, Filter } from 'lucide-react';
import type { GraphData } from '../../../api/services/relationships.service';
import type { EntityType } from '../../../types/api';
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS } from '../../../types/api';

interface GraphExplorerProps {
  graphData: GraphData | null;
  loading: boolean;
  error: string | null;
  entityTypeFilter: EntityType | undefined;
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
  onEntityTypeFilterChange: (filter: EntityType | undefined) => void;
  onRefresh: () => void;
}

// Relationship colors
const RELATIONSHIP_COLORS: Record<string, string> = {
  PARTY_TO: '#3b82f6',      // Blue
  REFERENCES: '#10b981',     // Green
  SUPERSEDES: '#f59e0b',     // Amber
  AMENDS: '#ef4444',         // Red
  RELATED_TO: '#8b5cf6',     // Purple
  EMPLOYS: '#ec4899',        // Pink
  SUBSIDIARY_OF: '#06b6d4',  // Cyan
  OWNS: '#f97316',           // Orange
};

/**
 * Graph Explorer component using Cytoscape.js
 * Displays entities as nodes and relationships as edges
 */
export function GraphExplorer({
  graphData,
  loading,
  error,
  entityTypeFilter,
  selectedNodeId,
  onNodeClick,
  onEntityTypeFilterChange,
  onRefresh,
}: GraphExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'color': '#1f2937',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'width': 'mapData(size, 1, 20, 20, 50)',
            'height': 'mapData(size, 1, 20, 20, 50)',
            'text-wrap': 'ellipsis',
            'text-max-width': '80px',
            'border-width': 2,
            'border-color': '#ffffff',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#3b82f6',
            'background-opacity': 1,
          },
        },
        {
          selector: 'node.hover',
          style: {
            'border-width': 3,
            'border-color': '#6366f1',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '8px',
            'color': '#6b7280',
            'text-rotation': 'autorotate',
            'text-margin-y': -8,
            'text-opacity': 0,
          },
        },
        {
          selector: 'edge:selected',
          style: {
            'width': 4,
            'text-opacity': 1,
          },
        },
        {
          selector: 'edge.hover',
          style: {
            'width': 3,
            'text-opacity': 1,
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 500,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 100,
        nodeDimensionsIncludeLabels: true,
      } as cytoscape.LayoutOptions,
      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });

    // Event handlers
    cy.on('tap', 'node', (evt) => {
      const node = evt.target as NodeSingular;
      onNodeClick(node.id());
    });

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target as NodeSingular;
      node.addClass('hover');
      containerRef.current!.style.cursor = 'pointer';
    });

    cy.on('mouseout', 'node', (evt) => {
      const node = evt.target as NodeSingular;
      node.removeClass('hover');
      containerRef.current!.style.cursor = 'default';
    });

    cy.on('mouseover', 'edge', (evt) => {
      const edge = evt.target;
      edge.addClass('hover');
    });

    cy.on('mouseout', 'edge', (evt) => {
      const edge = evt.target;
      edge.removeClass('hover');
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [onNodeClick]);

  // Update graph data
  useEffect(() => {
    if (!cyRef.current || !graphData) return;

    const cy = cyRef.current;

    // Build elements
    const elements: ElementDefinition[] = [];

    // Add nodes
    for (const node of graphData.nodes) {
      elements.push({
        data: {
          id: node.id,
          label: truncateLabel(node.label),
          fullLabel: node.label,
          color: ENTITY_TYPE_COLORS[node.entityType] || '#6b7280',
          entityType: node.entityType,
          size: Math.max(1, Math.min(20, node.documentCount)),
        },
      });
    }

    // Add edges
    for (const edge of graphData.edges) {
      elements.push({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: formatRelationshipType(edge.relationshipType),
          color: RELATIONSHIP_COLORS[edge.relationshipType] || '#9ca3af',
          relationshipType: edge.relationshipType,
          confidence: edge.confidence,
        },
      });
    }

    // Update cytoscape with new elements
    cy.elements().remove();
    cy.add(elements);

    // Run layout
    if (elements.length > 0) {
      cy.layout({
        name: 'cose',
        animate: true,
        animationDuration: 500,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 100,
        nodeDimensionsIncludeLabels: true,
      } as cytoscape.LayoutOptions).run();
    }
  }, [graphData]);

  // Update selected node highlighting
  useEffect(() => {
    if (!cyRef.current) return;

    const cy = cyRef.current;
    cy.nodes().unselect();

    if (selectedNodeId) {
      const node = cy.getElementById(selectedNodeId);
      if (node.length > 0) {
        node.select();
        cy.animate({
          center: { eles: node },
          zoom: 1.5,
          duration: 300,
        });
      }
    }
  }, [selectedNodeId]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.zoom(cyRef.current.zoom() * 1.2);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.zoom(cyRef.current.zoom() / 1.2);
  }, []);

  const handleFitGraph = useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.fit(undefined, 50);
  }, []);

  // Export graph as PNG
  const handleExportImage = useCallback(() => {
    if (!cyRef.current) return;

    const dataUrl = cyRef.current.png({
      output: 'blob',
      bg: '#ffffff',
      scale: 2,
      full: true,
    });

    // Create download link
    const link = document.createElement('a');
    link.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = URL.createObjectURL(dataUrl);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, []);

  // Entity type options
  const entityTypeOptions: Array<{ value: EntityType | undefined; label: string }> = [
    { value: undefined, label: 'All Types' },
    ...Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({
      value: value as EntityType,
      label,
    })),
  ];

  if (loading) {
    return (
      <div className="graph-explorer">
        <div className="graph-loading">
          <div className="loading-spinner" />
          <p>Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="graph-explorer">
        <div className="graph-error">
          <p>{error}</p>
          <button className="button secondary" onClick={onRefresh}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="graph-explorer">
        <div className="graph-empty">
          <p>No entities or relationships found.</p>
          <p className="graph-empty-hint">
            Upload documents and run entity extraction to build the knowledge graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-explorer">
      {/* Toolbar */}
      <div className="graph-toolbar">
        <div className="graph-toolbar-left">
          {/* Entity Type Filter */}
          <div className="graph-filter-dropdown">
            <button
              className="button secondary icon-only"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              title="Filter by entity type"
            >
              <Filter size={16} />
              {entityTypeFilter && <span className="filter-active-indicator" />}
            </button>
            {showFilterDropdown && (
              <div className="filter-dropdown-menu">
                {entityTypeOptions.map((opt) => (
                  <button
                    key={opt.value || 'all'}
                    className={`filter-option ${entityTypeFilter === opt.value ? 'active' : ''}`}
                    onClick={() => {
                      onEntityTypeFilterChange(opt.value);
                      setShowFilterDropdown(false);
                    }}
                  >
                    {opt.value && (
                      <span
                        className="entity-type-dot"
                        style={{ backgroundColor: ENTITY_TYPE_COLORS[opt.value] }}
                      />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="graph-stats">
            {graphData.nodes.length} entities · {graphData.edges.length} relationships
          </span>
        </div>

        <div className="graph-toolbar-right">
          <button
            className="button secondary icon-only"
            onClick={onRefresh}
            title="Refresh graph"
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="button secondary icon-only"
            onClick={handleZoomIn}
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            className="button secondary icon-only"
            onClick={handleZoomOut}
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            className="button secondary icon-only"
            onClick={handleFitGraph}
            title="Fit to view"
          >
            <Maximize size={16} />
          </button>
          <button
            className="button secondary icon-only"
            onClick={handleExportImage}
            title="Export as image"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Graph Container */}
      <div className="graph-container" ref={containerRef} />

      {/* Legend */}
      <div className="graph-legend">
        <div className="legend-section">
          <h4>Entity Types</h4>
          <div className="legend-items">
            {Object.entries(ENTITY_TYPE_LABELS)
              .slice(0, 5)
              .map(([type, label]) => (
                <div key={type} className="legend-item">
                  <span
                    className="legend-dot"
                    style={{ backgroundColor: ENTITY_TYPE_COLORS[type as EntityType] }}
                  />
                  <span>{label}</span>
                </div>
              ))}
          </div>
        </div>
        <div className="legend-section">
          <h4>Relationships</h4>
          <div className="legend-items">
            {Object.entries(RELATIONSHIP_COLORS)
              .slice(0, 4)
              .map(([type, color]) => (
                <div key={type} className="legend-item">
                  <span className="legend-line" style={{ backgroundColor: color }} />
                  <span>{formatRelationshipType(type)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Truncate label for display
 */
function truncateLabel(label: string, maxLength = 20): string {
  if (label.length <= maxLength) return label;
  return label.slice(0, maxLength - 3) + '...';
}

/**
 * Format relationship type for display
 */
function formatRelationshipType(type: string): string {
  return type
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
