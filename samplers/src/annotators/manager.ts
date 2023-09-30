import { json, Status, typeid } from '@sampleci/base';
import * as wt from '../wireTypes.js';
import type { Annotator, AnnotationBag, Annotation, Annotatable } from './types.js';

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

/** Serialize an annotation */
export function serialize(ann: Annotation): json.Value {
  return typeof ann === 'bigint'
    ? json.bigint.toJson(ann)
    : Array.isArray(ann)
    ? ann.map((x) => serialize(x))
    : (ann as json.Value);
}

/** Default bag implementation */
export class DefaultBag implements AnnotationBag {
  static from(pairs: Iterable<readonly [typeid, Annotation]>) {
    return new DefaultBag(new Map(pairs));
  }

  constructor(public annotations: Map<typeid, Annotation>) {}

  toJson(): wt.AnnotationBag {
    const r = {} as Record<string, json.Value>;
    for (const [k, v] of this.annotations.entries()) {
      r[k] = serialize(v);
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
