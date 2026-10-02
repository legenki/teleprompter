// Forwards mono Float32 blocks from the audio thread to the offscreen page.
class PcmForwarder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice());
    return true;
  }
}
registerProcessor('pcm-forwarder', PcmForwarder);
