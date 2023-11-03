import { iterator, Status, typeid } from '@repris/base';

import * as ann from '../annotators.js';

/** Brands keyed on brandID-DependsOn */
const Brands = new Map<
  `${string}-${string}`,
  { brandId: typeid; dependsOn: typeid; conditions: ann.Condition }
>();

/**
 * Register a brand
 * A brand is an annotation of type @param brandid applied when another
 * annotation @param dependsOn on an object has a value which meets the given conditions.
 *
 * A brand is uniquely identified by the comination of @param brandid and @param dependsOn
 */
export function registerBranding(
  brandId: typeid,
  dependsOn: typeid,
  conditions: ann.Condition,
): Status<unknown> {
  const key = `${brandId}-${dependsOn}` as const;
  if (Brands.has(key)) {
    return Status.err('Brand/dependency combination already registered');
  }

  Brands.set(key, { brandId, dependsOn, conditions });
  return Status.ok;
}

ann.register(
  '@annotator:branding',
  {
    annotations() {
      return iterator.collect(iterator.map(Brands.values(), b => b.brandId));
    },

    annotate(
      _object: unknown,
      request: Map<typeid, {}>,
      current?: Map<typeid, ann.Annotation>,
    ): Status<ann.AnnotationBag | undefined> {
      const annotations = new Map();

      for (const [, brand] of Brands) {
        if (request.has(brand.brandId)) {
          const dependentAnnotation = current?.get(brand.dependsOn);
          if (dependentAnnotation && ann.meetsCondition(dependentAnnotation, brand.conditions)) {
            annotations.set(brand.brandId, true);
          }
        }
      }

      return Status.value(ann.DefaultBag.from(annotations));
    },
  },
  -1,
);
