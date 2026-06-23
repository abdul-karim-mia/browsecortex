/**
 * Main-world content script injected at document_start (PLAN §28).
 * Wraps console logging and network requests (fetch/XHR) to maintain a local
 * ring buffer on the window object, allowing tools to query logs/requests.
 */
(function () {
  // Prevent double injection
  if ((window as any).__browsecortex_spy_active) return;
  (window as any).__browsecortex_spy_active = true;

  // 1. Console Logging Interceptor
  const logs: Array<{ level: string; message: string; timestamp: number }> = [];
  (window as any).__browsecortex_logs = logs;

  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  for (const level of levels) {
    const original = console[level];
    if (typeof original === 'function') {
      console[level] = function (...args: any[]) {
        try {
          const msg = args
            .map((arg) => {
              if (arg === null) return 'null';
              if (arg === undefined) return 'undefined';
              if (arg instanceof Error) return arg.message;
              if (typeof arg === 'object') {
                try {
                  return JSON.stringify(arg);
                } catch {
                  return String(arg);
                }
              }
              return String(arg);
            })
            .join(' ');

          logs.push({
            level,
            message: msg.slice(0, 1000), // Cap length per message
            timestamp: Date.now(),
          });

          if (logs.length > 500) {
            logs.shift(); // Capped buffer
          }
        } catch {
          // Safe fallback
        }
        return original.apply(this, args);
      };
    }
  }

  // 2. Fetch/XHR Network Request Interceptor
  const requests: Array<{
    id: string;
    method: string;
    url: string;
    status?: number;
    type: 'fetch' | 'xhr';
    timestamp: number;
    contentType?: string;
    requestBody?: string;
    responseBody?: string;
  }> = [];
  (window as any).__browsecortex_requests = requests;

  // Wrap fetch
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (this: any, input: RequestInfo | URL, init?: RequestInit) {
      let url = '';
      let method = 'GET';
      let requestBodyPromise: Promise<string> | undefined;

      try {
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof URL) {
          url = input.href;
        } else if (input && typeof input === 'object') {
          url = (input as Request).url || '';
          method = (input as Request).method || 'GET';
          requestBodyPromise = (input as Request).clone().text().catch(() => '');
        }
        if (init?.method) {
          method = init.method;
        }
        if (init?.body) {
          if (typeof init.body === 'string') {
            requestBodyPromise = Promise.resolve(init.body);
          } else if (init.body instanceof URLSearchParams) {
            requestBodyPromise = Promise.resolve(init.body.toString());
          } else if (init.body instanceof Blob) {
            requestBodyPromise = init.body.text().catch(() => '');
          }
        }
      } catch {
        // Fallback on parsing error
      }

      const reqEntry: any = {
        id: Math.random().toString(36).substring(2, 11),
        method: method.toUpperCase(),
        url,
        type: 'fetch' as const,
        timestamp: Date.now(),
        status: undefined as number | undefined,
        contentType: undefined as string | undefined,
        requestBody: undefined as string | undefined,
        responseBody: undefined as string | undefined,
      };

      requests.push(reqEntry);
      if (requests.length > 500) {
        requests.shift();
      }

      const fetchPromise = originalFetch.apply(this, arguments as any);

      // Async response body/metadata capture without blocking client fetch
      fetchPromise.then(async (response) => {
        reqEntry.status = response.status;
        try {
          const contentType = response.headers.get('content-type') || '';
          reqEntry.contentType = contentType;

          // Check if response is text-like before reading to save memory
          const isText = contentType && (
            contentType.includes('json') ||
            contentType.includes('text') ||
            contentType.includes('xml') ||
            contentType.includes('javascript') ||
            contentType.includes('urlencoded')
          );

          if (isText) {
            const responseClone = response.clone();
            const [reqBody, resBody] = await Promise.all([
              requestBodyPromise ? requestBodyPromise : Promise.resolve(''),
              responseClone.text().catch(() => '')
            ]);
            reqEntry.requestBody = reqBody || undefined;
            reqEntry.responseBody = resBody.slice(0, 100000) || undefined; // Cap at 100kb
          } else {
            const reqBody = requestBodyPromise ? await requestBodyPromise : '';
            reqEntry.requestBody = reqBody || undefined;
          }
        } catch {
          // ignore
        }
      }).catch(async () => {
        try {
          const reqBody = requestBodyPromise ? await requestBodyPromise : '';
          reqEntry.requestBody = reqBody || undefined;
        } catch {
          // ignore
        }
      });

      return fetchPromise;
    };
  }

  // Wrap XHR
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  if (typeof originalXHROpen === 'function' && typeof originalXHRSend === 'function') {
    XMLHttpRequest.prototype.open = function (this: any, method: string, url: string | URL) {
      this.__method = method;
      this.__url = typeof url === 'string' ? url : (url as URL).href;
      return originalXHROpen.apply(this, arguments as any);
    } as any;

    XMLHttpRequest.prototype.send = function (this: any, body?: any) {
      const xhr = this;
      const method = xhr.__method || 'GET';
      const url = xhr.__url || '';
      let requestBodyPromise: Promise<string> | undefined;

      try {
        if (body) {
          if (typeof body === 'string') {
            requestBodyPromise = Promise.resolve(body);
          } else if (body instanceof URLSearchParams) {
            requestBodyPromise = Promise.resolve(body.toString());
          } else if (body instanceof Blob) {
            requestBodyPromise = body.text().catch(() => '');
          }
        }
      } catch {
        // ignore
      }

      const reqEntry: any = {
        id: Math.random().toString(36).substring(2, 11),
        method: method.toUpperCase(),
        url,
        type: 'xhr' as const,
        timestamp: Date.now(),
        status: undefined as number | undefined,
        contentType: undefined as string | undefined,
        requestBody: undefined as string | undefined,
        responseBody: undefined as string | undefined,
      };

      requests.push(reqEntry);
      if (requests.length > 500) {
        requests.shift();
      }

      xhr.addEventListener('load', () => {
        reqEntry.status = xhr.status;
        try {
          const contentType = xhr.getResponseHeader('content-type') || '';
          reqEntry.contentType = contentType;

          const isText = contentType && (
            contentType.includes('json') ||
            contentType.includes('text') ||
            contentType.includes('xml') ||
            contentType.includes('javascript') ||
            contentType.includes('urlencoded')
          );

          if (isText) {
            if (!xhr.responseType || xhr.responseType === 'text') {
              reqEntry.responseBody = (xhr.responseText || '').slice(0, 100000);
            } else if (xhr.responseType === 'json') {
              reqEntry.responseBody = JSON.stringify(xhr.response).slice(0, 100000);
            }
          }
        } catch {
          // ignore
        }
      });

      if (requestBodyPromise) {
        requestBodyPromise.then((text) => {
          reqEntry.requestBody = text || undefined;
        }).catch(() => {});
      }

      return originalXHRSend.apply(this, arguments as any);
    };
  }
})();
