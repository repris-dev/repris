import { typeid } from '@repris/base';

import { Column } from './tableReport.js';
import { AnnotationRequestTree, AnnotationRequest, Ctx, normalize } from './config.js';

/** @returns an array of graded columns from the given annotations */
export function gradedColumns(
  request: AnnotationRequestTree,
  ctx?: Ctx[],
  displayCondition?: string,
  columns: Column[] = [],
): Column[] {
  // one column for each visible annotation
  for (const ann of request) {
    if (Array.isArray(ann) || typeof ann === 'string') {
      convertToColumn(ann, ctx, columns, displayCondition);
    } else {
      // recursive
      for (const [prefix, nested] of Object.entries(ann)) {
        if (prefix.startsWith('@')) {
          const ctxs: Ctx[] = ctx ? [...ctx, prefix as Ctx] : [prefix as Ctx];
          gradedColumns(nested, ctxs, displayCondition, columns);
        }
      }
    }
  }

  return columns;
}

function convertToColumn(
  ann: AnnotationRequest,
  ctx: Ctx[] | undefined,
  columns: Column[],
  displayCondition?: string,
) {
  const [type, a] = normalize.simpleOpt(ann, {});

  if (
    (typeof a.display === 'boolean' && !a.display) ||
    (typeof a.display === 'object' && !a.display.if?.includes(displayCondition!))
  ) {
    // don't display this column
    return;
  }

  const cfgGradings = a.grading ? [a.grading] : a.gradings ?? [];

  const gradings = cfgGradings.map(g =>
    Array.isArray(g)
      ? {
          type: g[0] as typeid,
          rules: g[1].rules,
          ctx: g[1].ctx ? [g[1].ctx] : ctx,
        }
      : { type: type as typeid, rules: g?.rules, ctx },
  );

  columns.push({
    type: type as typeid,
    ctx,
    displayName: a.displayName ?? type,
    grading: gradings.length > 0 ? gradings : void 0,
  });
}
