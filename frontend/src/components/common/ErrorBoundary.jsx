import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-dvh flex items-center justify-center p-6 bg-canvas">
                    <div className="max-w-md w-full bg-surface border border-line rounded-3xl shadow-card p-8 text-center">
                        <div className="mx-auto w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-2xl mb-4">!</div>
                        <h1 className="text-xl font-extrabold text-ink tracking-tight">Coś poszło nie tak</h1>
                        <p className="text-sm text-ink-soft mt-2">Aplikacja napotkała błąd podczas wyświetlania tego widoku. Odśwież stronę albo wróć na start.</p>
                        {this.state.error && (
                            <pre className="mt-4 text-left text-[11px] text-ink-muted bg-canvas border border-line rounded-xl p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                                {String(this.state.error)}
                            </pre>
                        )}
                        <div className="flex gap-3 mt-6">
                            <button type="button" onClick={() => window.location.reload()} className="btn btn-primary flex-1">Odśwież</button>
                            <button type="button" onClick={() => (window.location.href = '/')} className="btn btn-secondary flex-1">Na start</button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
