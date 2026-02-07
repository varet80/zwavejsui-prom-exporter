import promCli from 'prom-client'
import { HttpServer } from './HttpServer.js'

let instance = null
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

function PromClient (ctx) {
  if (!(this instanceof PromClient)) {
    return new PromClient(ctx)
  }

  this.zwave = ctx.zwave
  this.logger = ctx.logger
  this.mqttClient = ctx.mqtt
  this.httpServer = null

  // Start HTTP server with logger
  this.httpServer = HttpServer(customRegistry, this.logger)

  instance = this
  this.logger.info('Prometheus exporter plugin initialized')
  this.start()
}

PromClient.prototype.start = async function () {
  this.logger.info('Starting Prometheus exporter')
  if (this.zwave) {
    this.zwave.on('valueChanged', onValueChanged.bind(this))
    this.zwave.on('nodeRemoved', onNodeRemoved.bind(this))
  }
}

// ✅ REQUIRED: Implement destroy method
PromClient.prototype.destroy = async function () {
  this.logger.info('Destroying Prometheus exporter plugin')
  
  if (this.zwave) {
    this.zwave.removeAllListeners('valueChanged')
    this.zwave.removeAllListeners('nodeRemoved')
  }
  
  if (this.httpServer) {
    await this.httpServer.stop()
  }
}

function gaugePayload (payload) {
  this.logger.info('Processing payload for gauge')
  
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
  let node = this.zwave.nodes.get(payload.nodeId)
  const gaugeLabels = {
    nodeId: payload.nodeId,
    name: node.name,
    location: node.loc,
    commandClass: payload.commandClassName,
    property: payload.propertyName,
    propertyKey: payload.propertyKey,
    label: payload.label,
    type: payload.type,
    endpoint: payload.endpoint,
    id: payload.id
  }
  
  gauge.set(gaugeLabels, metricValue)
  this.logger.debug(`Registered ${metricValue} under ${payload.id}`)
}

function onNodeRemoved (node) {
  this.logger.debug(`Node removed: ${node.id}`)
}

// ✅ FIX: Use .call(this) to bind the correct context
function onValueChanged (valueId) {
  this.logger.debug(`Value ${valueId.value} is typeof ${typeof valueId.value}`)
  gaugePayload.call(this, valueId)
}

export default PromClient
