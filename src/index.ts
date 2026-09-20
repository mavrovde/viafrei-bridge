/**
 * Programmatic entry point.
 *
 * The bridge is a command-line tool first (`npx viafrei`), but a client that
 * wants to embed the relay - a desktop app shipping its own supervisor, say -
 * should not have to spawn a process to do it.
 */
export { startBridge, type BridgeHandle, type BridgeHooks } from './bridge.js';
export {
    DEFAULT_MCP_ORIGIN,
    DEFAULT_MCP_PATH,
    DEFAULT_MCP_URL,
    DEFAULT_TIMEOUT_MS,
    EXIT,
    TIMEOUT_ENV_VAR,
    URL_ENV_VAR,
    UsageError,
    helpText,
    parseOptions,
    type ExitCode,
    type Options
} from './config.js';
export { describeFailure, RequestTimeoutError, type Failure } from './failure.js';
export { packageVersion } from './version.js';
