/** Minimal typed event emitter used for decoupled system communication. */
export class Emitter<M extends { [K in keyof M]: unknown }> {
  private handlers: { [K in keyof M]?: Array<(p: M[K]) => void> } = {};

  on<K extends keyof M>(type: K, fn: (p: M[K]) => void): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => this.off(type, fn);
  }

  off<K extends keyof M>(type: K, fn: (p: M[K]) => void): void {
    const list = this.handlers[type];
    if (list) this.handlers[type] = list.filter((h) => h !== fn);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    this.handlers[type]?.forEach((h) => h(payload));
  }
}
