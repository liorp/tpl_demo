import { z } from 'zod';

export type LatLng = readonly [number, number];

export type PenAnnotation = {
  type: 'pen';
  id: string;
  points: LatLng[];
  color: string;
  width: number;
  createdAt: number;
};

export type TextAnnotation = {
  type: 'text';
  id: string;
  position: LatLng;
  text: string;
  color: string;
  size: number;
  createdAt: number;
};

export type Annotation = PenAnnotation | TextAnnotation;

const finiteNumberSchema = z.number().refine(Number.isFinite);
const latLngSchema = z.tuple([finiteNumberSchema, finiteNumberSchema]);

const penAnnotationSchema = z.object({
  type: z.literal('pen'),
  id: z.string().min(1),
  points: z.array(latLngSchema).min(2),
  color: z.string().min(1),
  width: finiteNumberSchema.positive(),
  createdAt: finiteNumberSchema,
});

const textAnnotationSchema = z.object({
  type: z.literal('text'),
  id: z.string().min(1),
  position: latLngSchema,
  text: z.string().min(1),
  color: z.string().min(1),
  size: finiteNumberSchema.positive(),
  createdAt: finiteNumberSchema,
});

export const annotationSchema = z.discriminatedUnion('type', [
  penAnnotationSchema,
  textAnnotationSchema,
]);
