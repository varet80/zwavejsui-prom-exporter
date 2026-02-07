import promCli from 'prom-client'
import { HttpServer } from './HttpServer.js'
let instance = null // the singleton instance
/**
 * Registry and Gauge settings for Prometheus
 */
const PromCliRegistry = promCli.Registry
const customRegistry = new PromCliRegistry()
const gauge = new promCli.Gauge({
  registers: [customRegistry],
  name: 'zjui',
  help: 'zwave-js-ui gauges from metrics',
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
function PromClient (ctx) {
  
  if (!(this instanceof PromClient)) {
    return new PromClient(ctx)
  }

  // start http server
  HttpServer(customRegistry)
  
  instance = this
  this.zwave = ctx.zwave
  this.logger = ctx.logger
  this.logger.info('test')
  this.start()
}

PromClient.prototype.start = async function () {
  this.logger.info('Event caller')
  if (this.zwave) {
    this.zwave.on('valueChanged', onValueChanged.bind(this))
    this.zwave.on('nodeRemoved', onNodeRemoved.bind(this))
  }
  // this is async but doesn't need to be awaited
  // this.zwave.connect()
}

// Implements the Payload for gauge, and registers/upgrade gauge
function gaugePayload (payload) {
  ctx.logger.info('Processing payload for gauge')
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
  this.logger.info(`Adding value to metric ${payload.id}`)
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
  this.logger.debug(`Registered ${metricValue} under ${payload.id}`)
}

// TODO: Placeholder for removal
function onNodeRemoved (node) {
  this.logger.debug(`Node data ${node}`)
}

/**
 * Value changes calls for change
 **/
function onValueChanged (valueId) {
  ctx.logger.debug(`Value ${valueId.value} is typeof ${typeof valueId.value}`)
  gaugePayload(valueId)
}

export default PromClient
