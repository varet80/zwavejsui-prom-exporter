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


function zwaveLabel(label) {
    return label.toString()
        .toLowerCase()
        .replaceAll(' ', '_')
        .replaceAll('₂', '2') // special case for co2
        .replaceAll(/[^a-zA-Z0-9_]/ig, '') // Remove all non-allowed letters (see https://prometheus.io/docs/concepts/data_model/#metric-names-and-labels)
}

function PromClient (ctx) {
  if (!(this instanceof PromClient)) {
    return new PromClient(ctx)
  }

  this.zwave = ctx.zwave
  this.logger = ctx.logger
  this.mqttClient = ctx.mqtt
  this.httpServer = null
  this.gauges = {}
  this.nodeInfo = {}
    // Start HTTP server with logger
  this.httpServer = HttpServer(customRegistry, this.logger)

  instance = this
  this.logger.info('Prometheus exporter plugin initialized')
  this.start()
}

PromClient.prototype.start = async function () {
  this.logger.info('Starting Prometheus exporter')
  if (this.zwave) {
    this.zwave.on('nodeStatus', onNodeStatus.bind(this))
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

function isDefined(v) {
    return v !== undefined && v !== null
}

function checkOrCreate(dict, id, func) {
    let i = dict[id]
    if (!isDefined(i)) {
        i = func()
        dict[id] = i
    }

    return i
}



function gaugePayload (payload) {
    
  let gaugeName = `zjui_${zwaveLabel(payload.commandClassName)}`
  this.logger.debug(`Gauge name: ${gaugeName}`)
  let gaugeHelp = `Gauge for ${payload.commandClassName}`

  let gauge = checkOrCreate(this.gauges, gaugeName, () => 
    new promCli.Gauge({ 
        registers: [customRegistry], 
        name: gaugeName, 
        help: gaugeHelp, 
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
      }))

  switch (payload.commandClass) {
    case 112:
    case 114:
    case 134:
    case 96:
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

  let node = checkOrCreate(this.nodeInfo, payload.nodeId.toString(), () => ({
    name: this.zwave.nodes.get(payload.nodeId)?.name,
    loc: this.zwave.nodes.get(payload.nodeId)?.loc
  }))
  this.logger.debug( `Node info ${node.name} at ${node.loc}`)
  
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

function onNodeStatus(node) {
  this.logger.debug(`Node state changed: ${node.id} is now ${node.status}`)

  let workNode = checkOrCreate(this.nodeInfo, node.id.toString(), () => ({
    name: node.name,
    loc: node.loc,
    status: node.status
  }))

  this.logger.debug( `Node info ${workNode.name} at ${workNode.loc} with state ${workNode.status}`)  
  this.nodeInfo[node.id.toString()].status = node.status

  let gaugeName = `zjui_node_status`
  this.logger.debug(`Gauge name: ${gaugeName}`)
  let gaugeHelp = `Gauge for Node Status`

  let gauge = checkOrCreate(this.gauges, gaugeName, () => 
    new promCli.Gauge({ 
        registers: [customRegistry], 
        name: gaugeName, 
        help: gaugeHelp, 
        labelNames: [
          'nodeId', 
          'location', 
          'name'
        ] 
      }))
    const gaugeLabels = {
      nodeId: node.id,
      name: node.name,
      location: node.loc
    }
    let nodeStatusNumeric = 0

    switch (workNode.status) {
      case 'Alive':
        nodeStatusNumeric = 1
        break
      case 'Asleep':
        nodeStatusNumeric = 2
        break
      case 'Dead':
        nodeStatusNumeric = 3
        break
      default:
        nodeStatusNumeric = 0
    }
    gauge.set(gaugeLabels, nodeStatusNumeric)
  }
export default PromClient
