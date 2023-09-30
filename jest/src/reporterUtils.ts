import { typeid } from '@repris/base';
import { Column } from './tableReport.js';
import * as config from './config.js';

export type Ctx = `@${string}`;

/** @returns an array of graded columns from the given annotation configurations */
export function gradedColumns(annotations: config.NestedAnnotationRequest, ctx?: Ctx[], columns: Column[] = []): Column[] {
  if (Array.isArray(annotations)) {
    // one column for each visible annotation
    for (const ann of annotations) {
      convertToColumn(ann, ctx, columns);
    }
  } else {
    for (const [prefix, nestedRequest] of Object.entries(annotations)) {
      if (prefix.startsWith('@')) {
        const ns: Ctx[] = ctx ? [...ctx, prefix as Ctx] : [prefix as Ctx];

        for (const req of nestedRequest) {
          if (Array.isArray(req) || typeof req === 'string') {
            convertToColumn(req as config.AnnotationRequest, ns, columns)
          } else {
            gradedColumns(req, ns, columns);
          }
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
        ? { type: a.grading[0] as typeid, thresholds: a.grading[1].thresholds }
        : { type: type as typeid, thresholds: a.grading?.thresholds }
      : undefined;

    columns.push({
      type: type as typeid,
      ctx,
      displayName: a.displayName ?? type,
      grading,
    });
  }
}
