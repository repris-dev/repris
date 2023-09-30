import { Status, typeid } from '@sampleci/base';
import { SampleAnnotator, AnnotationBag } from './types.js';
import { Sample } from '../samples.js';

const annotators = new Map<string, SampleAnnotator>();
const annotatorMap = new Map<typeid, string>();

/** Register a global annotator */
export function register(name: string, annotator: SampleAnnotator): Status {
  if (annotators.has(name)) {
    return Status.err(`Annotator '${ name }' already registered`);
  }

  annotators.set(name, annotator);
  annotator.annotations().forEach(a => annotatorMap.set(a, name));

  return Status.ok;
}

export function supports(annotation: typeid) {
  return annotatorMap.has(annotation);
}

export function annotate(
  sample: Sample<unknown>,
  request: Map<typeid, { /* Options */ }>
): Status<AnnotationBag[]> {
  const result = [];

  for (const [, annotator] of annotators) {
    const r = annotator.annotate(sample, request);
    if (Status.isErr(r)) { return r; }
    const bag = Status.get(r);

    if (bag !== void 0) {
      result.push(bag);
    }
  }

  return Status.value(result);
}
