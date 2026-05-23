/**
 * Type-safe error handling utilities.
 * Replaces `catch (error: any)` patterns with proper error extraction.
 */

interface ErrorWithMessage {
    message: string;
    response?: {
        data?: any;
        status?: number;
    };
    code?: string;
}

/**
 * Extract a human-readable message from an unknown error.
 * Works with Error objects, Axios errors, and plain strings.
 */
export function getErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const err = error as ErrorWithMessage;
        // Axios-style error response
        if (err.response?.data) {
            if (typeof err.response.data === 'string') return err.response.data;
            if (err.response.data.Message) return err.response.data.Message;
        }
        if (err.message) return err.message;
    }
    return 'An unknown error occurred';
}

/**
 * Extract HTTP status code from an unknown error (Axios errors).
 * Returns undefined if not an HTTP error.
 */
export function getErrorStatus(error: unknown): number | undefined {
    if (error && typeof error === 'object') {
        const err = error as ErrorWithMessage;
        return err.response?.status;
    }
    return undefined;
}

/**
 * Check if an error is a 404 (Not Found).
 */
export function isNotFoundError(error: unknown): boolean {
    return getErrorStatus(error) === 404;
}

/**
 * Log severity levels.
 */
export type LogLevel = 'warn' | 'error';

/**
 * Safely log an error with a context prefix and optional severity.
 * Pass the raw error object as the second argument for proper message extraction.
 *
 * @example
 *   logError('PlayerStore', error, 'Failed to play track');
 *   // Output: [PlayerStore] Failed to play track: some error message
 */
export function logError(
    context: string,
    error: unknown,
    message?: string
): void {
    const prefix = message ? `${message}: ` : '';
    const fullMessage = `[${context}] ${prefix}${getErrorMessage(error)}`;
    // Use 'warn' by default, but actual playback/operation failures should pass 'error'
    console.warn(fullMessage);
}

/**
 * Log an error at 'error' severity (console.error).
 * Same API as logError but uses console.error for critical failures.
 */
export function logCritical(
    context: string,
    error: unknown,
    message?: string
): void {
    const prefix = message ? `${message}: ` : '';
    const fullMessage = `[${context}] ${prefix}${getErrorMessage(error)}`;
    console.error(fullMessage);
}
