import fastify from 'fastify'

const app = fastify()

// Http Server settings
const httpPort = 9001
const httpAddr = '0.0.0.0'
const httpMetricPath = '/metrics'

// Http Server to return metrics
function HttpServer (customRegistry, logger) {
  // Declare a route
  app.get(httpMetricPath, async request => {
    logger.info(`Metrics query from ${request.ip}`)
    return customRegistry.metrics()
  })

  // Run the server!
  const start = async () => {
    try {
      await app.listen(httpPort, httpAddr)
    } catch (err) {
      app.log.error(err)
      process.exit(1)
    }
  }
  start()
}
export { HttpServer }
