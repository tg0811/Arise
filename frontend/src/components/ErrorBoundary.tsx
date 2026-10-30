import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Shows a crash on screen instead of a blank page, so a failure on a phone can be read
 * (and screenshotted) without developer tools.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; stack: string }> {
  state = { error: null as Error | null, stack: '' };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Arise crashed:', error, info.componentStack);
    this.setState({ stack: (info.componentStack ?? '').trim().split('\n').slice(0, 6).join('\n') });
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center p-5">
        <div className="glass w-full max-w-lg rounded-2xl p-5">
          <p className="label !text-bad">[ System error ]</p>
          <h1 className="mt-2 font-display text-2xl font-bold">The System hit a fault.</h1>
          <p className="mt-3 break-words rounded-lg bg-black/40 p-3 font-mono text-sm text-bad">{error.name}: {error.message}</p>
          {stack && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-[11px] text-ink2">{stack}</pre>}
          <p className="mt-3 text-xs text-muted">{navigator.userAgent}</p>
          <button onClick={() => location.reload()} className="mt-4 w-full rounded-xl border border-line py-2.5 text-sm font-bold text-ink2">Reload</button>
        </div>
      </div>
    );
  }
}
