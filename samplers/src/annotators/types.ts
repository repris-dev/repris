import { Status, typeid, json } from '@sampleci/base';
import { Units } from '../quantity.js';
import * as wt from '../wireTypes.js';

/** Possible values for an annotation */
export type Value = number | bigint | string | boolean | Array<Value>;

/** An annotation */
export type Annotation = Value | { units: Units, quantity: Value };

/** An object which can be annotated */
export type Annotatable = { readonly [typeid]: typeid; };

/** Annotations associated with a sample from an annotator */
export interface AnnotationBag extends json.Serializable<wt.AnnotationBag>
{
  annotations: Map<typeid, Annotation>
}

export interface Annotator
{
  /** Returns a list of annotations this annotator supports */
  annotations(): typeid[];

  /** Annotate the given item */
  annotate(
    item: Annotatable,
    request: Map<typeid, { /* Options */ }>
  ): Status<AnnotationBag | undefined>;
}
