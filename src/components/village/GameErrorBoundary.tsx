"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { GameErrorNotice } from "./Notices";

interface State {
  error: Error | null;
}

/** Catches failures loading or rendering the game chunk (e.g. a network error). */
export class GameErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("The village crashed:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return <GameErrorNotice message={this.state.error.message} />;
    }
    return this.props.children;
  }
}
