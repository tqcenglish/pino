'use strict'
const { EventEmitter } = require('events')
const SonicBoom = require('sonic-boom')
const flatstr = require('flatstr')
const {
  showFileInfoSym,
  lsCacheSym,
  levelValSym,
  setLevelSym,
  getLevelSym,
  chindingsSym,
  asJsonSym,
  writeSym,
  timeSym,
  streamSym,
  serializersSym,
  useOnlyCustomLevelsSym,
  needsMetadataGsym
} = require('./symbols')
const {
  getLevel,
  setLevel,
  isLevelEnabled,
  mappings,
  initialLsCache,
  genLsCache,
  assertNoLevelCollisions
} = require('./levels')
const {
  asChindings,
  asJson
} = require('./tools')
const {
  version,
  LOG_VERSION
} = require('./meta')

// note: use of class is satirical
// https://github.com/pinojs/pino/pull/433#pullrequestreview-127703127
const constructor = class Pino {}
const prototype = {
  constructor,
  child,
  bindings,
  flush,
  isLevelEnabled,
  version,
  get level () { return this[getLevelSym]() },
  set level (lvl) { return this[setLevelSym](lvl) },
  get levelVal () { return this[levelValSym] },
  set levelVal (n) { throw Error('levelVal is read-only') },
  [lsCacheSym]: initialLsCache,
  [writeSym]: write,
  [asJsonSym]: asJson,
  [getLevelSym]: getLevel,
  [setLevelSym]: setLevel,
  LOG_VERSION
}

Object.setPrototypeOf(prototype, EventEmitter.prototype)

module.exports = prototype

function child (bindings) {
  const { level } = this
  const serializers = this[serializersSym]
  const chindings = asChindings(this, bindings)
  const instance = Object.create(this)
  if (bindings.hasOwnProperty('serializers') === true) {
    instance[serializersSym] = Object.create(null)
    for (var k in serializers) {
      instance[serializersSym][k] = serializers[k]
    }
    for (var bk in bindings.serializers) {
      instance[serializersSym][bk] = bindings.serializers[bk]
    }
  } else instance[serializersSym] = serializers
  if (bindings.hasOwnProperty('customLevels') === true) {
    assertNoLevelCollisions(this.levels, bindings.customLevels)
    instance.levels = mappings(bindings.customLevels, instance[useOnlyCustomLevelsSym])
    genLsCache(instance)
  }
  instance[chindingsSym] = chindings
  const childLevel = bindings.level || level
  instance[setLevelSym](childLevel)

  return instance
}

function bindings () {
  const chindings = this[chindingsSym]
  var chindingsJson = `{${chindings.substr(1)}}` // at least contains ,"pid":7068,"hostname":"myMac"
  var bindingsFromJson = JSON.parse(chindingsJson)
  delete bindingsFromJson['pid']
  delete bindingsFromJson['hostname']
  return bindingsFromJson
}

function write (obj, msg, num) {
  const t = this[timeSym]()
  const s = this[asJsonSym](obj, msg, num, t)
  const stream = this[streamSym]
  if (stream[needsMetadataGsym] === true) {
    stream.lastLevel = num
    stream.lastMsg = this[showFileInfoSym] ? `${stackInfo()} + ${msg}` : msg
    stream.lastObj = obj
    stream.lastTime = t.slice(8)
    stream.lastLogger = this // for child loggers
  }
  if (stream instanceof SonicBoom) stream.write(s)
  else stream.write(flatstr(s))
}

function flush () {
  const stream = this[streamSym]
  if ('flush' in stream) stream.flush()
}

function stackInfo () {
  const error = new Error()
  const regex = /\((.*):(\d+):(\d+)\)$/
  let infos = []
  error.stack.split('\n').forEach(err => {
    const match = regex.exec(err)
    if (match && !match[1].includes(`events.js`) && !match[1].includes(`node_modules`) && !match[1].includes(`internal`) && !match[1].includes(`_stream_readable`)) {
      infos.push(`${match[1]}:${match[2]}:${match[3]}`)
    }
  })
  return infos[0]
}
