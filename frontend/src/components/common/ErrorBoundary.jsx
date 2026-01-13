import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 max-w-2xl mx-auto mt-10 bg-red-50 border border-red-200 rounded-2xl">
                    <h1 className="text-2xl font-bold text-red-700 mb-4">Coś poszło nie tak</h1>
                    <p className="text-gray-700 mb-4">Aplikacja napotkała krytyczny błąd podczas wyświetlania tego widoku.</p>

                    <div className="bg-white p-4 rounded-lg border border-red-100 overflow-auto max-h-96 mb-6">
                        <p className="font-mono text-red-600 font-bold mb-2">{this.state.error && this.state.error.toString()}</p>
                        <pre className="font-mono text-xs text-gray-500 whitespace-pre-wrap">
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </pre>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-red-600 text-white px-6 py-2 rounded-xl hover:bg-red-700 transition-colors"
                        >
                            Odśwież stronę
                        </button>
                        <button
                            onClick={() => window.location.href = '/'}
                            className="bg-white text-gray-700 px-6 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Wróć na Dashboard
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
