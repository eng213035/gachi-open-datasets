export class UnionFind {
  constructor(keys) {
    this.parent = new Map(keys.map((k) => [k, k]));
    this.rank = new Map(keys.map((k) => [k, 0]));
  }
  find(x) {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    while (this.parent.get(x) !== root) {
      const next = this.parent.get(x);
      this.parent.set(x, root);
      x = next;
    }
    return root;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rka = this.rank.get(ra);
    const rkb = this.rank.get(rb);
    if (rka < rkb) this.parent.set(ra, rb);
    else if (rka > rkb) this.parent.set(rb, ra);
    else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rka + 1);
    }
  }
  groups() {
    const out = new Map();
    for (const k of this.parent.keys()) {
      const root = this.find(k);
      if (!out.has(root)) out.set(root, []);
      out.get(root).push(k);
    }
    return [...out.values()];
  }
}
