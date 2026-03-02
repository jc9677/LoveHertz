const globalSlider = document.querySelector("#global-frequency");
const globalFrequencyInput = document.querySelector("#global-frequency-input");
const globalFrequencyLabel = document.querySelector("#global-frequency-label");
const audioToggle = document.querySelector("#audio-toggle");

const generatorElements = Array.from(document.querySelectorAll(".generator"));

const generators = generatorElements.map((element, index) => ({
  index,
  waveformSelect: element.querySelector(".waveform-select"),
  ratioSlider: element.querySelector(".ratio-slider"),
  ratioInput: element.querySelector(".ratio-input"),
  gainSlider: element.querySelector(".gain-slider"),
  ratioLabel: element.querySelector(".ratio-label"),
  gainLabel: element.querySelector(".gain-label"),
  actualFrequencyLabel: element.querySelector(".actual-frequency"),
  waveformIndex: Number(element.querySelector(".waveform-select").value),
  ratio: Number(element.querySelector(".ratio-slider").value),
  gain: Number(element.querySelector(".gain-slider").value),
  node: null,
  gainNode: null,
  filterNode: null,
  pannerNode: null,
}));

let audioContext = null;
let masterGain = null;
let isAudioRunning = false;
let baseFrequencyHz = 4;

const panSpread = [-0.6, 0, 0.6];
const MIN_HZ = 0.1;
const MAX_HZ = 20000;
const MIN_RATIO = 0.25;
const MAX_RATIO = 12;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sliderValueToFrequency(sliderValue) {
  const normalized = Number(sliderValue) / 1000;
  const exponent = Math.log10(MAX_HZ / MIN_HZ) * normalized;
  return MIN_HZ * 10 ** exponent;
}

function frequencyToSliderValue(frequency) {
  const clamped = clamp(frequency, MIN_HZ, MAX_HZ);
  const normalized = Math.log10(clamped / MIN_HZ) / Math.log10(MAX_HZ / MIN_HZ);
  return Math.round(normalized * 1000);
}

function formatHz(value) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} kHz`;
  }
  return `${value.toFixed(2)} Hz`;
}

function calculateActualFrequency(ratio) {
  return clamp(baseFrequencyHz * ratio, 0.1, MAX_HZ);
}

function updateLabelsAndFrequencies() {
  globalFrequencyLabel.textContent = formatHz(baseFrequencyHz);
  globalFrequencyInput.value = baseFrequencyHz.toFixed(2);
  globalSlider.value = String(frequencyToSliderValue(baseFrequencyHz));

  generators.forEach((generator) => {
    const actualFrequency = calculateActualFrequency(generator.ratio);
    generator.actualFrequencyLabel.textContent = formatHz(actualFrequency);
    generator.ratioLabel.textContent = `${generator.ratio.toFixed(2)}x`;
    generator.ratioInput.value = generator.ratio.toFixed(2);
    generator.gainLabel.textContent = generator.gain.toFixed(3);

    if (generator.node && audioContext) {
      generator.node.parameters
        .get("frequency")
        .setTargetAtTime(actualFrequency, audioContext.currentTime, 0.01);
      generator.node.parameters
        .get("waveform")
        .setValueAtTime(generator.waveformIndex, audioContext.currentTime);
    }
  });
}

function updateGain(index) {
  const generator = generators[index];
  if (!generator || !audioContext || !generator.gainNode) {
    return;
  }

  generator.gainNode.gain.setTargetAtTime(generator.gain, audioContext.currentTime, 0.01);
}

function setGlobalFromTypedInput() {
  const typedValue = Number(globalFrequencyInput.value);
  if (!Number.isFinite(typedValue) || globalFrequencyInput.value.trim() === "") {
    return;
  }

  baseFrequencyHz = clamp(typedValue, MIN_HZ, MAX_HZ);
  updateLabelsAndFrequencies();
}

function setGlobalFromSlider() {
  baseFrequencyHz = sliderValueToFrequency(globalSlider.value);
  updateLabelsAndFrequencies();
}

function setRatioFromTypedInput(index) {
  const generator = generators[index];
  if (!generator) {
    return;
  }

  const typedValue = Number(generator.ratioInput.value);
  if (!Number.isFinite(typedValue) || generator.ratioInput.value.trim() === "") {
    return;
  }

  generator.ratio = clamp(typedValue, MIN_RATIO, MAX_RATIO);
  generator.ratioSlider.value = String(generator.ratio);
  updateLabelsAndFrequencies();
}

async function createAudioEngine() {
  audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule("./audio-worklet.js");

  masterGain = new GainNode(audioContext, { gain: 0.8 });
  masterGain.connect(audioContext.destination);

  generators.forEach((generator, idx) => {
    const frequency = calculateActualFrequency(generator.ratio);
    generator.node = new AudioWorkletNode(audioContext, "impulse-train-processor", {
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        frequency,
        waveform: generator.waveformIndex,
      },
    });

    generator.filterNode = new BiquadFilterNode(audioContext, {
      type: "highpass",
      frequency: 10,
      Q: 0.707,
    });

    generator.gainNode = new GainNode(audioContext, { gain: generator.gain });
    generator.pannerNode = new StereoPannerNode(audioContext, { pan: panSpread[idx] ?? 0 });

    generator.node.connect(generator.filterNode);
    generator.filterNode.connect(generator.gainNode);
    generator.gainNode.connect(generator.pannerNode);
    generator.pannerNode.connect(masterGain);
  });
}

async function toggleAudio() {
  if (!audioContext) {
    await createAudioEngine();
  }

  if (!isAudioRunning) {
    await audioContext.resume();
    isAudioRunning = true;
    audioToggle.textContent = "Pause Audio";
  } else {
    await audioContext.suspend();
    isAudioRunning = false;
    audioToggle.textContent = "Start Audio";
  }
}

function wireEvents() {
  globalSlider.addEventListener("input", setGlobalFromSlider);
  globalFrequencyInput.addEventListener("input", setGlobalFromTypedInput);
  globalFrequencyInput.addEventListener("change", setGlobalFromTypedInput);

  generators.forEach((generator, index) => {
    generator.waveformSelect.addEventListener("change", () => {
      generator.waveformIndex = Number(generator.waveformSelect.value);
      if (generator.node && audioContext) {
        generator.node.parameters
          .get("waveform")
          .setValueAtTime(generator.waveformIndex, audioContext.currentTime);
      }
    });

    generator.ratioSlider.addEventListener("input", () => {
      generator.ratio = Number(generator.ratioSlider.value);
      updateLabelsAndFrequencies();
    });

    generator.ratioInput.addEventListener("input", () => {
      setRatioFromTypedInput(index);
    });

    generator.ratioInput.addEventListener("change", () => {
      setRatioFromTypedInput(index);
    });

    generator.gainSlider.addEventListener("input", () => {
      generator.gain = Number(generator.gainSlider.value);
      generator.gainLabel.textContent = generator.gain.toFixed(3);
      updateGain(index);
    });
  });

  audioToggle.addEventListener("click", async () => {
    audioToggle.disabled = true;
    try {
      await toggleAudio();
      updateLabelsAndFrequencies();
    } catch (error) {
      console.error("Audio toggle failed", error);
      audioToggle.textContent = "Audio Error";
    } finally {
      audioToggle.disabled = false;
    }
  });
}

function init() {
  const initialTyped = Number(globalFrequencyInput.value);
  if (Number.isFinite(initialTyped)) {
    baseFrequencyHz = clamp(initialTyped, MIN_HZ, MAX_HZ);
  }

  wireEvents();
  updateLabelsAndFrequencies();
}

init();
