import { DomEvent, divIcon, type LeafletMouseEvent } from 'leaflet';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Marker, Polyline, Popup, useMapEvents } from 'react-leaflet';

import type {
  Annotation,
  LatLng,
  PenAnnotation,
  TextAnnotation,
} from '../model/annotations';
import { useAnnotationTool } from '../service/annotationTool';

const STROKE_THRESHOLD_PX_SQ = 9; // 3px threshold, squared
const TEXT_DEFAULT_SIZE = 14;
const PEN_DEFAULT_WIDTH = 3;
const ERASER_HIT_WIDTH = 18;

type DraftEditor = {
  id: string | null;
  lat: number;
  lng: number;
  initial: string;
};

type Props = {
  annotations: Annotation[];
  onAdd: (annotation: Annotation) => void;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
  onRemove: (id: string) => void;
};

type MapMovementHandler = {
  enable: () => void;
  disable: () => void;
};

type MapMovementControls = {
  dragging: MapMovementHandler;
  doubleClickZoom: MapMovementHandler;
  scrollWheelZoom: MapMovementHandler;
  touchZoom: MapMovementHandler;
  boxZoom: MapMovementHandler;
  keyboard: MapMovementHandler;
  tap?: MapMovementHandler;
};

function getMovementHandlers(map: MapMovementControls): MapMovementHandler[] {
  return [
    map.dragging,
    map.doubleClickZoom,
    map.scrollWheelZoom,
    map.touchZoom,
    map.boxZoom,
    map.keyboard,
    map.tap,
  ].filter((handler): handler is MapMovementHandler => Boolean(handler));
}

function disableMapMovement(map: MapMovementControls): void {
  for (const handler of getMovementHandlers(map)) {
    handler.disable();
  }
}

function enableMapMovement(map: MapMovementControls): void {
  for (const handler of getMovementHandlers(map)) {
    handler.enable();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function buildTextIcon(text: string, color: string, size: number) {
  const safeText = escapeHtml(text);
  const safeColor = escapeHtml(color);
  return divIcon({
    html: `<span dir="auto" style="display:inline-block;padding:2px 6px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.4);border-radius:4px;color:${safeColor};font-size:${size}px;font-weight:600;white-space:nowrap;line-height:1.2;transform:translate(-50%,-50%);">${safeText}</span>`,
    className: 'annotation-text-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function makeId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AnnotationLayer({
  annotations,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const { t } = useTranslation();
  const { tool, color } = useAnnotationTool();
  const [draftPoints, setDraftPoints] = useState<LatLng[]>([]);
  const draftPointsRef = useRef<LatLng[]>([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [editor, setEditor] = useState<DraftEditor | null>(null);
  const editorInputRef = useRef<HTMLInputElement | null>(null);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;

  const map = useMapEvents({
    mousedown(event: LeafletMouseEvent) {
      if (toolRef.current !== 'pen') return;
      drawingRef.current = true;
      lastPointRef.current = {
        x: event.containerPoint.x,
        y: event.containerPoint.y,
      };
      const points: LatLng[] = [[event.latlng.lat, event.latlng.lng]];
      draftPointsRef.current = points;
      setDraftPoints(points);
    },
    mousemove(event: LeafletMouseEvent) {
      if (toolRef.current !== 'pen' || !drawingRef.current) return;
      const last = lastPointRef.current;
      if (last) {
        const dx = event.containerPoint.x - last.x;
        const dy = event.containerPoint.y - last.y;
        if (dx * dx + dy * dy < STROKE_THRESHOLD_PX_SQ) return;
      }
      lastPointRef.current = {
        x: event.containerPoint.x,
        y: event.containerPoint.y,
      };
      setDraftPoints((prev) => {
        const next: LatLng[] = [...prev, [event.latlng.lat, event.latlng.lng]];
        draftPointsRef.current = next;
        return next;
      });
    },
    mouseup() {
      if (toolRef.current !== 'pen' || !drawingRef.current) return;
      drawingRef.current = false;
      lastPointRef.current = null;
      const points = draftPointsRef.current;
      draftPointsRef.current = [];
      setDraftPoints([]);
      if (points.length >= 2) {
        const stroke: PenAnnotation = {
          type: 'pen',
          id: makeId(),
          points,
          color: colorRef.current,
          width: PEN_DEFAULT_WIDTH,
          createdAt: Date.now(),
        };
        onAdd(stroke);
      }
    },
    click(event: LeafletMouseEvent) {
      if (toolRef.current !== 'text') return;
      setEditor({
        id: null,
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        initial: '',
      });
    },
  });

  // When the active tool changes, clear any in-progress drawing or editor.
  useEffect(() => {
    if (tool !== 'pen' && drawingRef.current) {
      drawingRef.current = false;
      lastPointRef.current = null;
      draftPointsRef.current = [];
      setDraftPoints([]);
    }
    if (tool !== 'text' && editor) {
      setEditor(null);
    }
  }, [tool, editor]);

  // Annotation tools own map gestures only while an editing tool is active.
  useEffect(() => {
    if (tool === 'none') {
      enableMapMovement(map);
      return;
    }
    disableMapMovement(map);
    return () => {
      enableMapMovement(map);
    };
  }, [map, tool]);

  // Free-standing <Popup position={...}> auto-opens; just focus the input.
  useEffect(() => {
    if (editor) {
      editorInputRef.current?.focus();
    }
  }, [editor]);

  const handleAnnotationClick = (
    annotation: Annotation,
    event: LeafletMouseEvent,
  ) => {
    const currentTool = toolRef.current;
    if (currentTool === 'none' || currentTool === 'pen') {
      return;
    }
    DomEvent.stopPropagation(event);
    if (currentTool === 'eraser') {
      onRemove(annotation.id);
      return;
    }
    if (currentTool === 'text' && annotation.type === 'text') {
      setEditor({
        id: annotation.id,
        lat: annotation.position[0],
        lng: annotation.position[1],
        initial: annotation.text,
      });
    }
  };

  const commitEditor = (rawText: string) => {
    if (!editor) return;
    const text = rawText.trim();
    if (text.length === 0) {
      setEditor(null);
      return;
    }
    if (editor.id) {
      onUpdate(editor.id, { text } as Partial<TextAnnotation>);
    } else {
      const annotation: TextAnnotation = {
        type: 'text',
        id: makeId(),
        position: [editor.lat, editor.lng],
        text,
        color: colorRef.current,
        size: TEXT_DEFAULT_SIZE,
        createdAt: Date.now(),
      };
      onAdd(annotation);
    }
    setEditor(null);
  };

  return (
    <>
      {annotations.map((annotation) => {
        if (annotation.type === 'pen') {
          const isErasable = tool === 'eraser';
          return (
            <Fragment key={annotation.id}>
              <Polyline
                positions={annotation.points as [number, number][]}
                pathOptions={{
                  color: annotation.color,
                  weight: annotation.width,
                  opacity: 0.95,
                }}
                interactive={tool !== 'none' && tool !== 'pen'}
                eventHandlers={{
                  click: (event) => handleAnnotationClick(annotation, event),
                }}
              />
              {isErasable ? (
                <Polyline
                  positions={annotation.points as [number, number][]}
                  pathOptions={{
                    color: annotation.color,
                    weight: Math.max(ERASER_HIT_WIDTH, annotation.width),
                    opacity: 0,
                  }}
                  interactive={true}
                  eventHandlers={{
                    click: (event) => handleAnnotationClick(annotation, event),
                  }}
                />
              ) : null}
            </Fragment>
          );
        }
        return (
          <Marker
            key={annotation.id}
            position={annotation.position as [number, number]}
            icon={buildTextIcon(
              annotation.text,
              annotation.color,
              annotation.size,
            )}
            interactive={tool !== 'none' && tool !== 'pen'}
            eventHandlers={{
              click: (event) => handleAnnotationClick(annotation, event),
            }}
          />
        );
      })}
      {draftPoints.length > 1 && (
        <Polyline
          positions={draftPoints as [number, number][]}
          pathOptions={{ color, weight: PEN_DEFAULT_WIDTH, opacity: 0.7 }}
          interactive={false}
        />
      )}
      {editor && (
        <Popup
          position={[editor.lat, editor.lng]}
          autoPan={false}
          closeButton={false}
          closeOnClick={false}
          eventHandlers={{ remove: () => setEditor(null) }}
        >
          <input
            ref={editorInputRef}
            type="text"
            defaultValue={editor.initial}
            placeholder={t('annotations.textPlaceholder')}
            dir="auto"
            className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none focus-visible:border-primary"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitEditor(event.currentTarget.value);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setEditor(null);
              }
            }}
            onBlur={(event) => commitEditor(event.currentTarget.value)}
          />
        </Popup>
      )}
    </>
  );
}
