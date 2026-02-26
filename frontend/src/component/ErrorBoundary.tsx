import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Component, type ReactNode } from 'react';
import { i18n } from '@/i18n/config';

type FallbackProps = {
  error: Error;
  resetError: () => void;
  section: string;
};

type BoundaryProps = {
  section: string;
  children: ReactNode;
  onReset?: () => void;
  fallback?: (props: FallbackProps) => ReactNode;
};

type BoundaryState = {
  error: Error | null;
};

function DefaultFallback({ error, resetError, section }: FallbackProps) {
  return (
    <div className="flex items-center justify-center p-4">
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-sm font-medium text-destructive">
          {i18n.t('errors.sectionFailed', { section })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        <button
          type="button"
          onClick={resetError}
          className="mt-2 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
        >
          {i18n.t('errors.retry')}
        </button>
      </div>
    </div>
  );
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  resetError = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const {
      section,
      children,
      fallback: Fallback = DefaultFallback,
    } = this.props;

    if (error) {
      return (
        <Fallback
          error={error}
          resetError={this.resetError}
          section={section}
        />
      );
    }

    return children;
  }
}

export function ErrorBoundary({
  section,
  children,
  fallback,
}: {
  section: string;
  children: ReactNode;
  fallback?: (props: FallbackProps) => ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <Boundary section={section} onReset={reset} fallback={fallback}>
          {children}
        </Boundary>
      )}
    </QueryErrorResetBoundary>
  );
}
