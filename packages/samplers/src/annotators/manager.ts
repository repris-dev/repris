import { assert, isObject, json, Status, typeid, quantity as q, iterator } from '@repris/base';
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
  annotator.annotations().forEach(a => annotatorMap.set(a, name));

  return Status.ok;
}

/** Serialize an annotation to json. This simply takes account of bigints */
export function toJson(ann: Annotation): json.Value {
  function toJsonValue(val: Value): json.Value {
    return typeof val === 'bigint'
      ? json.bigint.toJson(val)
      : Array.isArray(val)
      ? val.map(x => toJsonValue(x))
      : (val as json.Value);
  }

  if (q.isQuantity(ann)) {
    return { ['@unit']: ann[q.UnitTag], scalar: ann.scalar };
  }

  return toJsonValue(ann);
}

export function fromJson(val: json.Value): Annotation {
  function fromJsonValue(v: json.Value): Value {
    return json.bigint.isJsonBigint(v)
      ? json.bigint.fromJson(v)
      : Array.isArray(v)
      ? v.map(x => fromJsonValue(x))
      : (v as Value);
  }

  function fromJsonQuantity(v: json.Value): q.Quantity | undefined {
    if (!isObject(v) || !('@unit' in v)) return undefined;
    return { [q.UnitTag]: v['@unit'] as q.Unit, scalar: Number(v.scalar) };
  }

  return fromJsonQuantity(val) ?? fromJsonValue(val);
}

/** Default bag implementation */
export class DefaultBag implements AnnotationBag {
  static from(pairs: Iterable<readonly [typeid, Annotation]>) {
    return new DefaultBag(new Map(pairs));
  }

  static fromJson(bag: wt.AnnotationBag): DefaultBag {
    const m = new Map<typeid, Annotation>();
    for (const [name, value] of Object.entries(bag)) {
      m.set(name as typeid, fromJson(value));
    }
    return new DefaultBag(m);
  }

  readonly annotations: AnnotationBag['annotations'];

  private index = new Map<typeid, Annotation>();
  private contexts = new Map<`@${string}`, AnnotationBag>();

  private constructor(annotations: Map<typeid, Annotation>) {
    const _this = this;

    this.index = annotations;
    this.annotations = {
      [Symbol.iterator]() {
        return _this.index[Symbol.iterator]() as IterableIterator<[typeid, Annotation]>;
      },
      get(type: typeid, context?: `@${string}`[]): Annotation | undefined {
        if (context !== void 0 && context.length > 0) {
          return _this.contexts.get(context[0])?.annotations.get(type, context.slice(1));
        }

        return _this.index.get(type);
      },
    };
  }

  union(child: AnnotationBag, context?: `@${string}`): void {
    if (context !== void 0) {
      if (this.contexts.has(context)) {
        this.contexts.get(context)!.union(child);
      } else {
        this.contexts.set(context, child);
      }
    } else {
      // Union with the root context, not overriding existing annotations
      for (const [id, ann] of child.annotations) {
        if (!this.index.has(id)) {
          this.index.set(id, ann);
        }
      }
    }
  }

  toJson(): wt.AnnotationBag {
    assert.eq(this.contexts.size, 0, 'Serializing contexts not supported');

    const r = {} as Record<string, json.Value>;
    for (const [k, a] of this.annotations) {
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
  const annotatorSubset = new Set<Annotator>();

  for (const [typeid] of request) {
    if (annotatorMap.has(typeid)) {
      annotatorSubset.add(annotators.get(annotatorMap.get(typeid)!)!);
    } else {
      return Status.err(`Unknown annotation "${ typeid }"`)
    }
  }

  // Union the results of each annotator in to one AnnotationBag
  for (const annotator of annotatorSubset) {
    const canAnnotate = annotator.annotations().find(a => request.has(a)) !== void 0;
    if (!canAnnotate) { continue; }

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

  return Status.value(DefaultBag.from(result));
}

export function annotateMissing<A extends Annotatable>(
  bag: AnnotationBag,
  request: Map<typeid, any>,
  annotatable: A
): Status<unknown> {
  // A new request which excludes pre-existing annotations
  const filteredRequest = new Map(
    iterator.filter(request.entries(), anno => bag.annotations.get(anno[1]) === undefined)
  );

  if (filteredRequest.size > 0) {
    // the remaining request is the missing annotations
    const newBag = annotate(annotatable, filteredRequest);
    if (Status.isErr(newBag)) {
      return newBag;
    }

    bag.union(newBag[0]);
  }

  return Status.ok;
}
