import { typeid, uuid, random, Status } from '@repris/base';
import { Digest } from './digests.js';
import * as anno from './annotators.js';

export interface PooledHypothesisTest<T extends Digest<any>> {
  /** The kind of pooled comparison */
  readonly [typeid]: typeid;

  /** Unique identifier */
  readonly [uuid]: uuid;

  /** */
  operands(): [lhs: T, rhs: T];
}

export interface BenchmarkComparison<C extends Digest<any>> {
  test: PooledHypothesisTest<C>;
  annotations: anno.AnnotationBag;
}

export class DefaultHypothesis<T extends Digest<any>> implements PooledHypothesisTest<T> {
  static [typeid] = '@hypothesis:default' as typeid;

  static is(x?: any): x is DefaultHypothesis<any> {
    return x !== void 0 && x[typeid] === DefaultHypothesis[typeid];
  }

  readonly [typeid] = DefaultHypothesis[typeid];
  readonly [uuid] = random.newUuid();

  constructor(
    private a: T,
    private b: T,
  ) {}

  operands(): [lhs: T, rhs: T] {
    return [this.a, this.b];
  }
}

export function compare<C extends Digest<any>>(
  a: C,
  b: C,
  annotationRequest: Map<typeid, any>,
): Status<BenchmarkComparison<C>> {
  const h = new DefaultHypothesis(a, b);
  const as = anno.annotate(h, annotationRequest);

  if (Status.isErr(as)) {
    return as;
  }

  return Status.value({
    test: h,
    annotations: as[0],
  });
}
