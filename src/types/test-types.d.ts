// Type definitions for testing libraries
import '@testing-library/jest-dom';

declare global {
  namespace jest {
    interface Matchers<R, T = {}> {
      toBeInTheDocument(): R;
      toHaveTextContent(expected: string | RegExp, options?: { normalizeWhitespace: boolean }): R;
      toHaveAttribute(attr: string, value?: string): R;
      toHaveClass(...classNames: string[]): R;
      toHaveStyle(css: Record<string, unknown> | string): R;
      toHaveFocus(): R;
      toBeVisible(): R;
      toBeDisabled(): R;
      toHaveValue(expectedValue: unknown): R;
      toHaveDisplayValue(expectedValue: string | RegExp | (string | RegExp)[]): R;
      toBeChecked(): R;
      toBeEmptyDOMElement(): R;
      toContainElement(element: Element | null): R;
      toContainHTML(html: string): R;
      toHaveAccessibleDescription(expectedAccessibleDescription: string | RegExp): R;
      toHaveAccessibleName(expectedAccessibleName: string | RegExp): R;
    }
  }
  
  // Fügen Sie Jest-ähnliche Typen hinzu, da das Projekt Jest statt Vitest verwendet
  var vi: typeof import('vitest').vi;
}

export {};