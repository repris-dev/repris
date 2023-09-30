import { Status, typeid, json, quantity as q } from '@repris/base';
import * as wt from '../wireTypes.js';

/** Possible values for an annotation */
export type Value = number | bigint | string | boolean | Array<Value>;

/** An annotation */
export type Annotation = Value | q.Quantity;

/** An object which can be annotated */
export type Annotatable = { readonly [typeid]: typeid; };

/** Annotations associated with a sample from an annotator */
export interface AnnotationBag extends json.Serializable<wt.AnnotationBag>
{
  annotations: {
    /** Returns an iterable of entries in the map. */
    [Symbol.iterator](): IterableIterator<[typeid, Annotation]>;

    /** Get the annotation associated with the given type */
    get(type: typeid, contextName?: string[]): Annotation | undefined;
  };

  union(other: AnnotationBag, contextName?: string): void;
}

export interface Annotator
{
  /** Returns a list of annotations this annotator supports */
  annotations(): typeid[];

  /** Annotate the given item with the requested annotations */
  annotate(
    item: Annotatable,
    request: Map<typeid, { /* Options */ }>,
  ): Status<AnnotationBag | undefined>;
}
