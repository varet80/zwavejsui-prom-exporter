import promCli from 'prom-client'
import { HttpServer } from './HttpServer.js'
import loggerModule from '../../../lib/logger.js'
const logger = loggerModule.module('Prometheus')
export { logger }

let instance = null // the singleton instance

/**
 * Registry and Gauge settings for Prometheus
 */
const PromCliRegistry = promCli.Registry
const customRegistry = new PromCliRegistry()
const gauge = new promCli.Gauge({
  registers: [customRegistry],
  name: 'zj2m',
  help: 'zwavejs2mqtt gauges from metrics',
  labelNames: [
    'nodeId',
    'location',
    'name',
    'commandClass',
    'property',
    'propertyKey',
    'label',
    'type',
    'endpoint',
    'id'
  ]
})

/**
 * Function to initiate the Client (plugin)
 **/
function PromClient (zwave) {
  
  if (!(this instanceof PromClient)) {
    return new PromClient(zwave)
  }

  if (instance) {
    instance.destroy()
  } else {
    // start http server
    HttpServer(customRegistry, logger)
  }
  
  instance = this
  this.zwave = zwave
  
  this.start()
}

PromClient.prototype.start = async function () {
  logger.info('Event caller')
  if (this.zwave) {
    this.zwave.on('valueChanged', onValueChanged.bind(this))
    this.zwave.on('nodeRemoved', onNodeRemoved.bind(this))
  }
  // this is async but doesn't need to be awaited
  // this.zwave.connect()
}

// Implements the Payload for gauge, and registers/upgrade gauge
function gaugePayload (payload) {
  // Ignore CCs not making sense to monitor
  switch (payload.commandClass) {
    case 112:
    case 114:
    case 134:
      return
  }

  let metricValue = 0
  switch (typeof payload.value) {
    case 'number':
      metricValue = payload.value
      break
    case 'boolean':
      if (payload.value) {
        metricValue = 1
      }
      break
    default:
      return
  }
  logger.info(`Adding value to metric ${payload.id}`)
  const gaugeLabels = {
    nodeId: payload.nodeId,
    name: payload.nodeName,
    location: payload.nodeLocation,
    commandClass: payload.commandClassName,
    property: payload.propertyName,
    propertyKey: payload.propertyKey,
    label: payload.label,
    type: payload.type,
    endpoint: payload.endpoint,
    id: payload.id
  }
  // set gauge
  gauge.set(gaugeLabels, metricValue)
  logger.debug(`Registered ${metricValue} under ${payload.id}`)
}

// TODO: Placeholder for removal
function onNodeRemoved (node) {
  logger.debug(`Node data ${node}`)
}

/**
 * Value changes calls for change
 **/
function onValueChanged (valueId) {
  logger.debug(`Value ${valueId.value} is typeof ${typeof valueId.value}`)
  gaugePayload(valueId)
}

export default PromClient
