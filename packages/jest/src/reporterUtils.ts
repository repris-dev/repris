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

  const grading =
    a.grading !== undefined
      ? Array.isArray(a.grading)
        ? {
            type: a.grading[0] as typeid,
            rules: a.grading[1].rules,
            ctx: a.grading[1].ctx ? [a.grading[1].ctx] : ctx,
          }
        : { type: type as typeid, rules: a.grading?.rules }
      : undefined;

  columns.push({
    type: type as typeid,
    ctx,
    displayName: a.displayName ?? type,
    grading,
  });
}
