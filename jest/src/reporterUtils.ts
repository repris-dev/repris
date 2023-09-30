import { typeid } from '@repris/base';
import { Column } from './tableReport.js';
import * as config from './config.js';

type Ctx = config.Ctx;

/** @returns an array of graded columns from the given annotations */
export function gradedColumns(
  request: config.AnnotationRequestTree,
  ctx?: Ctx[],
  columns: Column[] = [],
): Column[] {
  // one column for each visible annotation
  for (const ann of request) {
    if (Array.isArray(ann) || typeof ann === 'string') {
      convertToColumn(ann, ctx, columns);
    } else {
      for (const [prefix, nested] of Object.entries(ann)) {
        if (prefix.startsWith('@')) {
          const ctxs: Ctx[] = ctx ? [...ctx, prefix as Ctx] : [prefix as Ctx];
          gradedColumns(nested, ctxs, columns);  
        }
      }
    }
  }

  return columns;
}

function convertToColumn(
  ann: config.AnnotationRequest,
  ctx: Ctx[] | undefined,
  columns: Column[]
) {
  const [type, a] = config.normalize.simpleOpt(ann, {});

  if (typeof a.display === 'undefined' || a.display) {
    const grading = a.grading !== undefined
      ? Array.isArray(a.grading)
        ? { type: a.grading[0] as typeid, rules: a.grading[1].rules, ctx: a.grading[1].ctx ? [a.grading[1].ctx] : ctx  }
        : { type: type as typeid, rules: a.grading?.rules }
      : undefined;

    columns.push({
      type: type as typeid,
      ctx,
      displayName: a.displayName ?? type,
      grading,
    });
  }
}
