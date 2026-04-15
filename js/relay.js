export class RelayChannel {
  constructor(sessionId, role) {
    this.sessionId = sessionId;
    this.role = role;
    this.handlers = new Set();
    this.bc = null;

    if ("BroadcastChannel" in window && sessionId) {
      try {
        this.bc = new BroadcastChannel(`jimador-solar-${sessionId}`);
        this.bc.onmessage = (event) => this._emit(event.data, "broadcast");
      } catch (error) {
        this.bc = null;
      }
    }

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.sessionId !== this.sessionId) return;
      if (data.__relayLoopGuard === this.role) return;
      this._emit(data, "window");
    });
  }

  onMessage(handler) {
    this.handlers.add(handler);
  }

  offMessage(handler) {
    this.handlers.delete(handler);
  }

  send(type, payload = {}) {
    const message = {
      type,
      payload,
      role: this.role,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      __relayLoopGuard: this.role,
    };

    if (this.bc) {
      this.bc.postMessage(message);
    }

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(message, "*");
      } catch (error) {
        // noop
      }
    }
  }

  _emit(data, source) {
    this.handlers.forEach((handler) => handler(data, source));
  }
}
