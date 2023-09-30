import { Column } from './tableReport.js';
import * as config from './config.js';
import { typeid } from '@repris/base';

/** @returns an array of graded columns from the given annotation configurations */
export function gradedColumns(annotations: (string | [id: string, config: config.AnnotationConfig])[]) {
  const columns: Column[] = [];

  // one column for each visible annotation
  for (const ann of annotations) {
    const [type, a] = config.normalize.simpleOpt(ann, {});

    if (typeof a.display === 'undefined' || a.display) {
      const grading = a.grading !== undefined
        ? Array.isArray(a.grading)
          ? { type: a.grading[0] as typeid, thresholds: a.grading[1].thresholds }
          : { type: type as typeid, thresholds: a.grading?.thresholds }
        : undefined;

      columns.push({
        type: type as typeid,
        displayName: a.displayName ?? type,
        grading,
      });
    }
  }

  return columns;
}