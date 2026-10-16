import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] [${new Date().toISOString()}] Caught unhandled renderer error:`, error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A142E] text-slate-100 flex flex-col items-center justify-center p-6 font-['Inter',sans-serif]">
          <div className="max-w-md w-full bg-[#0D1B3D] border border-rose-800/60 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <h2 className="text-base font-bold font-['Poppins',sans-serif] text-white">Application Render Error</h2>
                <p className="text-xs text-rose-300">An unexpected error occurred while rendering the dashboard.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs font-mono text-rose-200 overflow-x-auto max-h-40">
              {this.state.error?.toString() || 'Unknown error'}
              {this.state.errorInfo?.componentStack && (
                <div className="mt-2 text-[10px] text-slate-400 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
              className="w-full py-2.5 px-4 bg-[#F4A62A] hover:bg-[#F6B54A] text-[#0D1B3D] font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors font-['Poppins',sans-serif]"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
