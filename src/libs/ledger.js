import alveyJsLib from 'alveyjs-lib'
import btcApp from '@ledgerhq/hw-app-btc'
import transportU2f from '@ledgerhq/hw-transport-u2f'
import BigNumber from 'bignumber.js'
import SafeBuffer from 'safe-buffer'
import OPS from 'alvey-opcodes'

const Buffer = SafeBuffer.Buffer

function number2Buffer(num) {
  const buffer = []
  const neg = (num < 0)
  num = Math.abs(num)
  while (num) {
    buffer[buffer.length] = num & 0xff
    num = num >> 8
  }

  const top = buffer[buffer.length - 1]
  if (top & 0x80) {
    buffer[buffer.length] = neg ? 0x80 : 0x00
  } else if (neg) {
    buffer[buffer.length - 1] = top | 0x80
  }
  return Buffer.from(buffer)
}

function hex2Buffer(hexString) {
  const buffer = []
  for (let i = 0; i < hexString.length; i += 2) {
    buffer[buffer.length] = (parseInt(hexString[i], 16) << 4) | parseInt(hexString[i + 1], 16)
  }
  return Buffer.from(buffer)
}

export default class Ledger {
  constructor(app) {
    this.alvey = app
  }

  static get defaultPath() {
    return 'm/44\'/88\'/0\'/0'
  }

  static async connect() {
    const alvey = new btcApp(await transportU2f.create())
    // ensure in Alvey App
    const pubkeyRes = await alvey.getWalletPublicKey(Ledger.defaultPath)
    if (pubkeyRes.bitcoinAddress[0] !== 'A') {
      throw 'Not Alvey App'
    }
    return new Ledger(alvey)
  }

  static async generateTx(keyPair, ledger, path, from, to, amount, fee, utxoList, rawTxFetchFunc = () => {}) {
    const amountSat = new BigNumber(amount).times(1e8)
    const feeSat = new BigNumber(fee).times(1e8)
    const pubkeyRes = await ledger.alvey.getWalletPublicKey(path)
    if (pubkeyRes.bitcoinAddress !== from) {
      throw 'Ledger can not restore the source address, please plugin the correct ledger'
    }
    let totalSelectSat = new BigNumber(0)
    const inputs = []
    const paths = []
    const selectUtxo = alveyJsLib.utils.selectTxs(utxoList, amount, fee)
    const rawTxCache = {}
    for (let i = 0; i < selectUtxo.length; i++) {
      const item = selectUtxo[i]
      if (!rawTxCache[item.hash]) {
        rawTxCache[item.hash] = await rawTxFetchFunc(item.hash)
      }
      paths.push(path)
      totalSelectSat = totalSelectSat.plus(item.value)
      inputs.push([
        await ledger.alvey.splitTransaction(rawTxCache[item.hash]),
        item.pos
      ])
    }
    const outputs = new alveyJsLib.TransactionBuilder(keyPair.network)
    outputs.addOutput(to, amountSat.toNumber())
    const changeSat = totalSelectSat.minus(amountSat).minus(feeSat)
    outputs.addOutput(from, changeSat.toNumber())
    const outputsScript = outputs.buildIncomplete().toHex().slice(10, -8)
    return await ledger.alvey.createPaymentTransactionNew(inputs, paths, undefined, outputsScript)
  }

  static async generateSendToContractTx(keyPair, ledger, path, from, contractAddress, encodedData, gasLimit, gasPrice, fee, utxoList, rawTxFetchFunc = () => {}) {
    const pubkeyRes = await ledger.alvey.getWalletPublicKey(path)
    if (pubkeyRes.bitcoinAddress !== from) {
      throw 'Ledger can not restore the source address, please plugin the correct ledger'
    }

    const amount = 0
    const amountSat = new BigNumber(amount).times(1e8)
    fee = new BigNumber(gasLimit).times(gasPrice).div(1e8).add(fee).toNumber()
    const feeSat = new BigNumber(fee).times(1e8)
    let totalSelectSat = new BigNumber(0)
    const inputs = []
    const paths = []
    const selectUtxo = alveyJsLib.utils.selectTxs(utxoList, amount, fee)
    const rawTxCache = {}
    for (let i = 0; i < selectUtxo.length; i++) {
      const item = selectUtxo[i]
      if (!rawTxCache[item.hash]) {
        rawTxCache[item.hash] = await rawTxFetchFunc(item.hash)
      }
      paths.push(path)
      totalSelectSat = totalSelectSat.plus(item.value)
      inputs.push([
        await ledger.alvey.splitTransaction(rawTxCache[item.hash]),
        item.pos
      ])
    }

    const outputs = new alveyJsLib.TransactionBuilder(keyPair.network)
    const contract = alveyJsLib.script.compile([
      OPS.OP_4,
      number2Buffer(gasLimit),
      number2Buffer(gasPrice),
      hex2Buffer(encodedData),
      hex2Buffer(contractAddress),
      OPS.OP_CALL
    ])
    outputs.addOutput(contract, 0)
    const changeSat = totalSelectSat.minus(amountSat).minus(feeSat)
    outputs.addOutput(from, changeSat.toNumber())
    const outputsScript = outputs.buildIncomplete().toHex().slice(10, -8)
    return await ledger.alvey.createPaymentTransactionNew(inputs, paths, undefined, outputsScript)
  }
}
