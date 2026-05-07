// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import '@/i18n/config';
import type { Annotation } from '../model/annotations';
import {
  resetAnnotationTool,
  setAnnotationTool,
} from '../service/annotationTool';
import { AnnotationLayer } from './AnnotationLayer';

type Handler = (event: unknown) => void;

const mapEventHandlers: Record<string, Handler | undefined> = {};
const mapDragging = { enable: vi.fn(), disable: vi.fn() };
const mapDoubleClickZoom = { enable: vi.fn(), disable: vi.fn() };

const polylines: Array<{
  positions: Array<[number, number]>;
  pathOptions?: { color?: string; weight?: number; opacity?: number };
  onClick?: Handler;
  interactive?: boolean;
}> = [];

const markers: Array<{
  position: [number, number];
  iconHtml: string | undefined;
  onClick?: Handler;
  interactive?: boolean;
}> = [];

vi.mock('react-leaflet', () => ({
  Polyline: ({
    positions,
    pathOptions,
    eventHandlers,
    interactive,
  }: {
    positions: Array<[number, number]>;
    pathOptions?: { color?: string; weight?: number; opacity?: number };
    eventHandlers?: { click?: Handler };
    interactive?: boolean;
  }) => {
    polylines.push({
      positions,
      pathOptions,
      onClick: eventHandlers?.click,
      interactive,
    });
    return <div data-testid="polyline" />;
  },
  Marker: ({
    position,
    icon,
    eventHandlers,
    interactive,
    children,
  }: {
    position: [number, number];
    icon?: { options?: { html?: string } };
    eventHandlers?: { click?: Handler };
    interactive?: boolean;
    children?: React.ReactNode;
  }) => {
    markers.push({
      position,
      iconHtml: icon?.options?.html,
      onClick: eventHandlers?.click,
      interactive,
    });
    return <div data-testid="marker">{children}</div>;
  },
  Popup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
  useMapEvents: (handlers: Record<string, Handler>) => {
    Object.assign(mapEventHandlers, handlers);
    return {
      dragging: mapDragging,
      doubleClickZoom: mapDoubleClickZoom,
    };
  },
}));

const samplePen: Annotation = {
  type: 'pen',
  id: 'p-1',
  points: [
    [33.31, 35.78],
    [33.32, 35.79],
  ],
  color: '#ef4444',
  width: 3,
  createdAt: 1,
};

const sampleText: Annotation = {
  type: 'text',
  id: 't-1',
  position: [33.31, 35.78],
  text: '<Landmark>',
  color: '#facc15',
  size: 14,
  createdAt: 2,
};

beforeEach(() => {
  for (const key of Object.keys(mapEventHandlers)) {
    delete mapEventHandlers[key];
  }
  polylines.length = 0;
  markers.length = 0;
  mapDragging.enable.mockClear();
  mapDragging.disable.mockClear();
  mapDoubleClickZoom.enable.mockClear();
  mapDoubleClickZoom.disable.mockClear();
  resetAnnotationTool();
});

afterEach(() => {
  cleanup();
  resetAnnotationTool();
});

describe('AnnotationLayer rendering', () => {
  test('renders one Polyline per pen annotation', () => {
    render(
      <AnnotationLayer
        annotations={[samplePen]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(polylines).toHaveLength(1);
    expect(polylines[0].positions).toEqual(samplePen.points);
    expect(polylines[0].pathOptions?.color).toBe('#ef4444');
  });

  test('renders one Marker per text annotation with HTML-escaped text', () => {
    render(
      <AnnotationLayer
        annotations={[sampleText]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0].iconHtml).toContain('&lt;Landmark&gt;');
    expect(markers[0].iconHtml).not.toContain('<Landmark>');
  });
});

describe('AnnotationLayer pen tool', () => {
  test('mousedown→move→up commits a pen annotation when over threshold', () => {
    const onAdd = vi.fn();
    setAnnotationTool('pen');
    render(
      <AnnotationLayer
        annotations={[]}
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    act(() => {
      mapEventHandlers.mousedown?.({
        latlng: { lat: 33.3, lng: 35.7 },
        containerPoint: { x: 100, y: 100 },
      });
    });
    act(() => {
      mapEventHandlers.mousemove?.({
        latlng: { lat: 33.31, lng: 35.71 },
        containerPoint: { x: 110, y: 110 },
      });
    });
    act(() => {
      mapEventHandlers.mousemove?.({
        latlng: { lat: 33.32, lng: 35.72 },
        containerPoint: { x: 130, y: 130 },
      });
    });
    act(() => {
      mapEventHandlers.mouseup?.({} as unknown);
    });

    expect(mapDragging.disable).toHaveBeenCalled();
    expect(mapDragging.enable).toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalledTimes(1);
    const stroke = onAdd.mock.calls[0][0] as Annotation;
    expect(stroke.type).toBe('pen');
    if (stroke.type === 'pen') {
      expect(stroke.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('a no-drag tap (single point) discards the stroke', () => {
    const onAdd = vi.fn();
    setAnnotationTool('pen');
    render(
      <AnnotationLayer
        annotations={[]}
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    act(() => {
      mapEventHandlers.mousedown?.({
        latlng: { lat: 33.3, lng: 35.7 },
        containerPoint: { x: 100, y: 100 },
      });
    });
    act(() => {
      mapEventHandlers.mouseup?.({} as unknown);
    });

    expect(onAdd).not.toHaveBeenCalled();
  });

  test('mousemove samples are throttled by ~3px distance', () => {
    const onAdd = vi.fn();
    setAnnotationTool('pen');
    render(
      <AnnotationLayer
        annotations={[]}
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    act(() => {
      mapEventHandlers.mousedown?.({
        latlng: { lat: 33.3, lng: 35.7 },
        containerPoint: { x: 100, y: 100 },
      });
    });
    // Sub-1px movements are well under the 3px threshold and should be ignored.
    for (let i = 1; i <= 4; i++) {
      act(() => {
        mapEventHandlers.mousemove?.({
          latlng: { lat: 33.3 + i * 0.00001, lng: 35.7 },
          containerPoint: { x: 100 + i * 0.5, y: 100 },
        });
      });
    }
    // One movement well outside the threshold.
    act(() => {
      mapEventHandlers.mousemove?.({
        latlng: { lat: 33.31, lng: 35.71 },
        containerPoint: { x: 200, y: 200 },
      });
    });
    act(() => {
      mapEventHandlers.mouseup?.({} as unknown);
    });

    expect(onAdd).toHaveBeenCalledTimes(1);
    const stroke = onAdd.mock.calls[0][0] as Annotation;
    if (stroke.type === 'pen') {
      // Down (1) + one accepted move = 2; throttled moves are dropped.
      expect(stroke.points.length).toBe(2);
    }
  });

  test('does not capture events when tool is none', () => {
    const onAdd = vi.fn();
    render(
      <AnnotationLayer
        annotations={[]}
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    act(() => {
      mapEventHandlers.mousedown?.({
        latlng: { lat: 33.3, lng: 35.7 },
        containerPoint: { x: 100, y: 100 },
      });
    });
    act(() => {
      mapEventHandlers.mousemove?.({
        latlng: { lat: 33.32, lng: 35.72 },
        containerPoint: { x: 200, y: 200 },
      });
    });
    act(() => {
      mapEventHandlers.mouseup?.({} as unknown);
    });

    expect(onAdd).not.toHaveBeenCalled();
    expect(mapDragging.disable).not.toHaveBeenCalled();
  });
});

describe('AnnotationLayer eraser tool', () => {
  test('clicking a polyline in eraser mode removes the annotation', () => {
    const onRemove = vi.fn();
    setAnnotationTool('eraser');
    render(
      <AnnotationLayer
        annotations={[samplePen]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={onRemove}
      />,
    );
    expect(polylines).toHaveLength(1);
    polylines[0].onClick?.({
      originalEvent: new MouseEvent('click'),
    });
    expect(onRemove).toHaveBeenCalledWith('p-1');
  });

  test('clicking a text marker in eraser mode removes the annotation', () => {
    const onRemove = vi.fn();
    setAnnotationTool('eraser');
    render(
      <AnnotationLayer
        annotations={[sampleText]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={onRemove}
      />,
    );
    expect(markers).toHaveLength(1);
    markers[0].onClick?.({
      originalEvent: new MouseEvent('click'),
    });
    expect(onRemove).toHaveBeenCalledWith('t-1');
  });

  test('clicking an annotation in pen mode does NOT remove it', () => {
    const onRemove = vi.fn();
    setAnnotationTool('pen');
    render(
      <AnnotationLayer
        annotations={[samplePen]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={onRemove}
      />,
    );
    polylines[0].onClick?.({
      originalEvent: new MouseEvent('click'),
    });
    expect(onRemove).not.toHaveBeenCalled();
  });
});

describe('AnnotationLayer text tool', () => {
  test('clicking the map in text mode opens an input editor', () => {
    setAnnotationTool('text');
    render(
      <AnnotationLayer
        annotations={[]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    act(() => {
      mapEventHandlers.click?.({
        latlng: { lat: 33.3, lng: 35.7 },
        containerPoint: { x: 100, y: 100 },
      });
    });

    expect(screen.getByPlaceholderText('Type a label…')).toBeTruthy();
  });
});
