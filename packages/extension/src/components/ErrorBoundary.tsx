import { Component, type ComponentChildren } from 'preact';

/** UI error boundary (PLAN §47). Isolates a region's crash with a reset action. */
interface Props {
  children: ComponentChildren;
  label?: string;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.error('[BrowseCortex]', this.props.label, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div class="m-2 rounded border border-red-300 bg-red-50 p-3 text-sm dark:border-red-700 dark:bg-red-950">
          <p class="mb-2">⚠️ Something went wrong in this section.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            class="rounded bg-red-500 px-3 py-1 text-white"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
