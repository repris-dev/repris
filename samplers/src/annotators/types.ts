import { Status, typeid } from '@sampleci/base';
import { Units } from '../quantity.js';
import { Sample } from '../samples.js';

/** Possible values for a sample annotation */
export type Value = number | bigint | string | boolean;

/** An annotation */
export type Annotation = Value | Value[] | { units: Units, quantity: Value };

/** Annotations associated with a sample from an annotator */
export interface AnnotationBag
{
  name: string;
  annotations: Map<typeid, Annotation>
}

export interface SampleAnnotator
{
  /** Returns a list of annotations this annotator supports */
  annotations(): typeid[];

  /** Annotate the given sample */
  annotate(
    sample: Sample<unknown>,
    request: Map<typeid, { /* Options */ }>
  ): Status<AnnotationBag | undefined>;
}
