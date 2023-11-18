import { copyTo, ArrayView } from '../array.js';
import { Kernel } from './kde.js';

function distanceSq(a: number, b: number) {
  const d = a - b;
  return d * d;
}

function distance(a: number, b: number) {
  return Math.sqrt(distanceSq(a, b));
}

function shiftPoint(kernel: Kernel, h: number, point: number, points: ArrayView<number>) {
  const hInv = 1 / h;

  let shiftedPoint = 0;
  let totalWeight = 0;

  for (let i = 0; i < points.length; i++) {
    const tempPoint = points[i];

    const dist = distance(point, tempPoint);
    const weight = kernel(hInv * dist);

    shiftedPoint += tempPoint * weight;
    totalWeight += weight;
  }

  return shiftedPoint / totalWeight;
}

function meanShiftImpl(points: ArrayView<number>, kernel: Kernel, h: number, EPSILON: number) {
  const EPSILON_SQR = EPSILON * EPSILON;

  const stopMoving = new Int8Array(points.length);
  const shiftedPoints = new Float64Array(points.length);
  copyTo(points, shiftedPoints);

  let maxShiftDistance: number;

  do {
    maxShiftDistance = 0;

    for (let i = 0; i < points.length; i++) {
      if (!stopMoving[i]) {
        const pointNew = shiftPoint(kernel, h, shiftedPoints[i], points);
        let shiftSqr = distanceSq(pointNew, shiftedPoints[i]);

        if (shiftSqr > maxShiftDistance) {
          maxShiftDistance = shiftSqr;
        }

        if (shiftSqr <= EPSILON_SQR) {
          stopMoving[i] = 1;
        }

        shiftedPoints[i] = pointNew;
      }
    }
  } while (maxShiftDistance > EPSILON_SQR);

  return shiftedPoints;
}

function cluster(shiftedPoints: ArrayView<number>, eps: number) {
  const clusters: number[] = [shiftedPoints[0]];

  for (let i = 1; i < shiftedPoints.length; i++) {
    const p = shiftedPoints[i];

    let c = 0;
    for (; c < clusters.length; c++) {
      if (distance(p, clusters[c]) <= eps) {
        break;
      }
    }

    if (c === clusters.length) {
      clusters.push(p);
    }
  }

  return clusters;
}

/**
 * Shift the points in the given sample to their clusters.
 * @param sample A list of samples to move
 * @param kernel
 * @param h Kernel smoothing parameter (bandwidth)
 * @param eps
 * @returns The locations of the clusters
 */
export function meanShift(
  sample: ArrayView<number>,
  kernel: Kernel,
  h: number,
  eps = 1e-6,
  clusterEps = eps * 10,
): ArrayView<number> {
  const shiftedPoints = meanShiftImpl(sample, kernel, h, eps);
  return cluster(shiftedPoints, clusterEps);
}
