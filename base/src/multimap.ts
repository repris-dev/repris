export class MultiMap<K, V> {
  _map = new Map<K, V[]>();

  get size(): number {
    return this._map.size;
  }

  add(k: K, v: V): MultiMap<K, V> {
    if (this._map.has(k)) {
      this._map.get(k)!.push(v);
    } else {
      this._map.set(k, [v]);
    }
    return this;
  }

  values(): Iterator<readonly V[]> {
    return this._map.values();
  }

  valuesOf(k: K): V[] | undefined {
    return this._map.get(k);
  }

  keys(): Iterable<K> {
    return this._map.keys();
  }

  has(k: K): boolean {
    return this._map.has(k);
  }
}
