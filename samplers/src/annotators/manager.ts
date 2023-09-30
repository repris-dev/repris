import { json, Status, typeid } from '@repris/base';
import { Units } from '../quantity.js';
import * as wt from '../wireTypes.js';
import type { Annotator, AnnotationBag, Annotation, Annotatable, Value } from './types.js';

const annotators = new Map<string, Annotator>();
const annotatorMap = new Map<typeid, string>();

/** Register a global annotator */
export function register(name: string, annotator: Annotator): Status {
  if (annotators.has(name)) {
    return Status.err(`Annotator '${name}' already registered`);
  }

  annotators.set(name, annotator);
  annotator.annotations().forEach((a) => annotatorMap.set(a, name));

  return Status.ok;
}

function isQuantity(ann: any): ann is { units: any, quantity: any } {
  return typeof ann === 'object'
    && !Array.isArray(ann)
    && ann.units !== void 0
    && ann.quantity !== void 0;
}

/** Serialize an annotation to json. This simply takes account of bigints */
export function toJson(ann: Annotation): json.Value {
  return isQuantity(ann)
    ? { units: ann.units, quantity: toJson(ann.quantity) }
    : typeof ann === 'bigint'
    ? json.bigint.toJson(ann)
    : Array.isArray(ann)
    ? ann.map(x => toJson(x)) 
    : (ann as json.Value);
}

export function fromJson(val: json.Value): Annotation {
  function valFromJson(v: json.Value): Value {
    return json.bigint.isJsonBigint(v)
      ? json.bigint.fromJson(v)
      : Array.isArray(v)
      ? v.map(x => valFromJson(x))
      : (v as Value);
  }

  return isQuantity(val)
    ? { units: val.units as Units, quantity: valFromJson(val.quantity) }
    : valFromJson(val); 
}

/** Default bag implementation */
export class DefaultBag implements AnnotationBag {
  static from(pairs: Iterable<readonly [typeid, Annotation]>) {
    return new DefaultBag(new Map(pairs));
  }

  static fromJson(bag: wt.AnnotationBag): DefaultBag {
    const m = new Map<typeid, Annotation>();
    for (const [name, value] of Object.entries(bag)) {
      m.set(name as typeid, fromJson(value))
    }
    return new DefaultBag(m);
  }

  constructor(public annotations: Map<typeid, Annotation>) {}

  toJson(): wt.AnnotationBag {
    const r = {} as Record<string, json.Value>;
    for (const [k, a] of this.annotations.entries()) {
      r[k] = toJson(a);
    }
    return r;
  }
}

export function supports(annotation: typeid) {
  return annotatorMap.has(annotation);
}

export function annotate(
  item: Annotatable,
  request: Map<
    typeid,
    {
      /* Options */
    }
  >
): Status<AnnotationBag> {
  const result = new Map<typeid, Annotation>();

  // Union the results of each annotator in to one AnnotationBag
  for (const [, annotator] of annotators) {
    const r = annotator.annotate(item, request);
    if (Status.isErr(r)) {
      return r;
    }

    const bag = Status.get(r);

    if (bag !== void 0) {
      for (const entry of bag.annotations) {
        result.set(entry[0], entry[1]);
      }
    }
  }

  return Status.value(new DefaultBag(result));
}
