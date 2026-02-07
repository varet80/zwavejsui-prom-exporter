import fastify from 'fastify'

// Http Server settings (defaults — can be overridden via options)
const DEFAULT_PORT = 9001
const DEFAULT_ADDR = '0.0.0.0'
const DEFAULT_METRIC_PATH = '/metrics'

// Http Server to return metrics
// - customRegistry: prom-client registry (or similar) with .metrics()
// - logger: optional logger with .info/.error
// - options: { port, host, metricPath, exitOnError }
//   exitOnError: when true, process.exit(1) will be called on startup failure (opt-in)
function HttpServer (customRegistry, logger, options = {}) {
  const port = DEFAULT_PORT
  const host = options.host ?? DEFAULT_ADDR
  const metricPath = options.metricPath ?? DEFAULT_METRIC_PATH
  const exitOnError = !!options.exitOnError

  // Create a fresh fastify instance per server to avoid shared state if module loaded multiple times
  const app = fastify()

  // Declare a route
  app.get(metricPath, async request => {
    try {
      logger?.info?.(`Metrics query from ${request.ip}`)
      // Ensure customRegistry.metrics exists
      if (!customRegistry || typeof customRegistry.metrics !== 'function') {
        const msg = 'metrics registry is unavailable or invalid'
        logger?.error?.(msg)
        return ''
      }
      return customRegistry.metrics()
    } catch (err) {
      logger?.error?.(err?.stack ?? String(err))
      return ''
    }
  })

  let serverIsRunning = false

  // Start the server and return a stop function/promise
  async function start () {
    try {
      // fastify.listen signature: either (port, host) or ({ port, host })
      await app.listen({ port, host })
      serverIsRunning = true
      logger?.info?.(`Metrics HTTP server listening on ${host}:${port}${metricPath}`)
    } catch (err) {
      // Log the error and only exit if explicitly requested
      logger?.error?.('Failed to start metrics HTTP server:')
      logger?.error?.(err?.stack ?? String(err))
      // Also log to console in case a logger isn't present
      if (!logger) {
        console.error('Failed to start metrics HTTP server:', err)
      }
      if (exitOnError) {
        // Explicit and opt-in: only call process.exit when caller asked for it
        process.exit(1)
      }
      // Otherwise fail gracefully — do not terminate the host process
    }
  }

  async function stop () {
    if (!serverIsRunning) return
    try {
      await app.close()
      serverIsRunning = false
      logger?.info?.('Metrics HTTP server stopped')
    } catch (err) {
      logger?.error?.('Error while stopping metrics HTTP server:')
      logger?.error?.(err?.stack ?? String(err))
    }
  }

  // Start immediately (preserves existing behavior)
  // Caller can optionally await start() via the returned object
  start().catch(err => {
    // Defensive: start() should handle errors above; this is extra guard
    logger?.error?.('Unexpected error starting metrics server:')
    logger?.error?.(err?.stack ?? String(err))
  })

  // Return control handles for the caller to manage lifecycle if desired
  return {
    start,
    stop,
    isRunning: () => serverIsRunning,
  }
}

export { HttpServer }
