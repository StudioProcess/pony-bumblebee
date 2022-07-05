// recorder
// 
// what: records canvas element to TAR-archived PNG sequence. 
//       optionally manipulates animation timing to create reproducible animations/recordings
// how: hijacks requestAnimationFrame callbacks, performance.now and Date.now to control animation timing
//      periodically saves the canvas to PNGs and archives them as TAR
// requires: canvas element, calls to update() from the render loop

import Tarball from './tar.js';
// import { logFrame } from './main.js';

const state = {
  startTime: 0, // time for first frame
  currentTime: 0, // current faked time
  frameRate: 0, // recording frame rate
  frameTime: 0, // duration of a frame
  totalFrames: 0, // total frames to record. 0 means unbounded
  currentFrame: 0, // current recording frame
  recording: false,
  startRecording: false, // used to wait for one update() after recording was triggered
  tarDownloadedSize: 0,
  tarMaxSize: 0,
  tarSequence: 0,
  tarFilename: '',
};

let tape; // Tarball (i.e. Tape ARchive)


// Save original timing functions (on module load)
const originalTimingFunctions = {
  requestAnimationFrame: window.requestAnimationFrame,
  performanceDotNow: window.performance.now,
  dateDotNow: window.Date.now
};

let requestAnimationFrameCallbacks = [];

function hijackTimingFunctions() {
  window.requestAnimationFrame = function replacementRequestAnimationFrame(callback) {
    requestAnimationFrameCallbacks.push(callback);
  };
  // // Version of replacementRequestAnimationFrame with logging
  // window.requestAnimationFrame = function replacementRequestAnimationFrame(callback) {
  //   logFrame('hijacked requestAnimationFrame ' + state.currentTime);
  //   requestAnimationFrameCallbacks.push(callback);
  // };
  window.performance.now = function replacementPerformanceDotNow() {
    return state.currentTime;
  };
  window.Date.now = function replacementDateDotNow() {
    return state.currentTime;
  };
}

function resetTimingFunctions() {
  window.performance.now = originalTimingFunctions.performanceDotNow;
  window.requestAnimationFrame = originalTimingFunctions.requestAnimationFrame;
  window.Date.now = originalTimingFunctions.dateDotNow;
}

function callRequestAnimationFrameCallbacks() {
  requestAnimationFrameCallbacks.forEach( callback => {
    setTimeout(callback, 0, state.currentTime);
  });
  requestAnimationFrameCallbacks = [];
}

// // Version of callRequestAnimationFrameCallbacks with logging
// function callRequestAnimationFrameCallbacks() {
//   requestAnimationFrameCallbacks.forEach( callback => {
//     logFrame('queuing anim callback ' + state.currentTime);
//     setTimeout((time) => {
//       logFrame('running anim callback ' + time);
//       callback(time);
//     }, 0, state.currentTime);
//   });
//   requestAnimationFrameCallbacks = [];
// }


const default_options = {
  hijackTiming: false,
  onStart: undefined,
  onStop: undefined,
  onBeforeUpdate: undefined,
  onUpdate: undefined,
  start: undefined,
  duration: undefined,
  framerate: 30,
  chunk: 500, // max tar size in MB
};

let options; // options set when calling start
let nextFilename;
let fps_counter;
let timer;

export function start(_options) {
  options = Object.assign({}, default_options, _options);
  console.log('rec: starting', options);
  
  // frame rate and time
  state.frameRate = options.framerate;
  state.frameTime = 1000 / state.frameRate;
  
  // start and current time
  if (options.start === undefined) {
    state.startTime = performance.now(); // no start time given, record from current time
  } else {
    state.startTime = options.start * 1000;
    console.log('setting start time', state.startTime);
  }
  state.currentTime = state.startTime;
  state.currentFrame = 0;
  
  // number of frames to record
  if (options.duration === undefined) {
    state.totalFrames = 0;
  } else {
    state.totalFrames = Math.ceil(options.duration * state.frameRate);
  }
  
  state.tarMaxSize = options.chunk;
  state.tarDownloadedSize = 0;
  state.tarSequence = 0;
  state.tarFilename = new Date().toISOString();
  
  if (options.hijackTiming) {
    hijackTimingFunctions();
    state.recording = false;
    state.startRecording = true;
  } else {
    // immediately start recording
    state.recording = true;
    state.startRecording = false;
  }
  
  tape = new Tarball();
  fps_counter = new FPSCounter(15); // measure over 15 secs
  timer = new Timer();
  
  createHUD();
  
  if (options.onStart && typeof options.onStart === 'function') {
    options.onStart();
  }
}

// override filename for next update call
export function setNextFilename(filename) {
  nextFilename = filename;
}


export function update(canvasElement) {
  // console.log('update', canvasElement);
  if (state.startRecording) {
    state.startRecording = false;
    state.recording = true;
    
    // IMPORTANT: Skip recording this frame, just run callback
    // This frame still has unhijacked timing
    if (options.hijackTiming) {
      callRequestAnimationFrameCallbacks();
      return;
    }
  }
  if (!state.recording) return;
  
  if (options.onBeforeUpdate && typeof options.onBeforeUpdate === 'function') {
    options.onBeforeUpdate();
  }
  
  // Capture a frame
  console.log('CAPTURING FRAME #' + (state.currentFrame) + ' TIME ' + state.currentTime);
  // console.assert(performance.now() === state.currentTime, "checking performance.now()");
  let filename = `${state.currentFrame}`.padStart(7,'0') + '.png';
  if (nextFilename !== undefined) {
    filename = nextFilename;
    nextFilename = undefined;
  }
  
  addPNGToTarball(canvasElement, filename).then(() => {
    // advance time
    state.currentTime += state.frameTime;
    state.currentFrame++;
    
    callRequestAnimationFrameCallbacks();
    
    // check for end of recording
    if (state.totalFrames > 0 && state.currentFrame >= state.totalFrames) {
      stop();
    } else if (tape.length / 1000000 >= state.tarMaxSize) {
      saveTarball();
    }
    
    if (options.onUpdate && typeof options.onUpdate === 'function') {
      options.onUpdate();
    }
  });
  
  fps_counter.step();
  updateHUD();
}


export function stop() {
  console.log('rec: stopping');
  
  if (options.hijackTiming) {
    resetTimingFunctions(); // has no effect if they weren't hijacked in the first place
  }
  
  state.recording = false;
  
  if (tape) {
    saveTarball({last:true});
  }
  
  updateHUD();
  // hideHUD(60000 * 3); // don't hide
  addCloseLinkToHUD();
  
  if (options.onStop && typeof options.onStop === 'function') {
    options.onStop();
  }
}


export function toggle(options) {
  if (!state.recording) {
    start(options);
  } else {
    stop();
  }
}

export function now() {
  if (state.recording) {
    return state.currentTime;
  } else {
    return window.performance.now();
  }
}


let t1, t2, t3;
let t1sum = 0, t1count = 0;
let t2sum = 0, t2count = 0;

function saveTarball(options = {last:false}) {
  t3 = new Timer();
  let seq;
  if (options && options.last && state.tarSequence == 0) {
    seq = '';
  } else {
    seq = '_' + ('' + state.tarSequence++).padStart(3, '0');
  }
  saveBlob( tape.save(), state.tarFilename + seq + '.tar');
  state.tarDownloadedSize += tape.length;
  tape = new Tarball();
  let time3 = t3.time(true);
  console.log('TAR save time', time3);
}


async function addPNGToTarball(canvas, filename) {
  // t1 = new Timer();
  return canvasToBlob(canvas, 'image/png')
    .then(blobToArrayBuffer)
    .then(buffer => {
        // let time1 = t1.time(true);
        // t1sum += time1;
        // t1count += 1;
        // 
        // t2 = new Timer();
        tape.append(filename, buffer);
        // let time2 = t2.time(true);
        // t2sum += time2;
        // t2count += 1;
        
        // console.log('blob %d – tar %d', time1, time2);
        // console.log('blob %d – tar %d', t1sum/t1count, t2sum/t2count);
    });
}

async function canvasToBlob(canvas, type = 'image/png') {
  return new Promise(resolve => {
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
    canvas.toBlob(blob => resolve(blob), type);
  });
}

async function blobToArrayBuffer(blob) {
  return new Promise(resolve => {
    let f = new FileReader();
    f.onload = () => resolve(f.result);
    f.readAsArrayBuffer(blob);
  });
}

export function addTextToTarball(text, filename) {
  const encoder = new TextEncoder(); // always utf-8
  const buffer = encoder.encode(text);
  tape.append(filename, buffer);
}

export function addJSONToTarball(obj, filename) {
  const text = JSON.stringify(obj, null, 4);
  return addTextToTarball(text, filename);
}

// set extra info to be displayed in the HUD
export function setInfo(text) {
    hud_info = text;
}

function saveURL(url, filename) {
  let link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
}

function saveBlob(blob, filename) {
  let url = URL.createObjectURL(blob);
  saveURL(url, filename);
  URL.revokeObjectURL(url);
}

let hud, hud_info = '';

function createHUD() {
  if (hud) return;
  hud = document.createElement( 'div' );
  hud.id = "rec-hud";
  hud.style.position = 'fixed';
  hud.style.left = hud.style.top = 0;
  hud.style.backgroundColor = 'black';
  hud.style.fontFamily = 'system-ui, monospace';
  hud.style.fontVariantNumeric = 'tabular-nums';
  hud.style.fontSize = '12px';
  hud.style.padding = '6px';
  hud.style.color = 'orangered';
  hud.style.zIndex = 99999;
  hud.style.whiteSpace = 'pre-line';
  document.body.appendChild( hud );
}

function updateHUD() {
  hud.style.display = 'block';
  hud.style.color = state.recording ? 'orangered' : 'gainsboro';
  
  let frames = (state.currentFrame + '').padStart(7,'0');
  frames += state.totalFrames > 0 ? '/' + state.totalFrames : '';
  let clock = new Date(state.currentTime - state.startTime).toISOString().substr(14, 5);
  let intraSecondFrame = (state.currentFrame % state.frameRate + '').padStart(2, '0');
  let dataAmount = dataAmountString(state.tarDownloadedSize + tape.length);
  const fps = `${fps_counter.fps.toFixed(2)}\u2009fps`; // using thin space \u2009
  const time = timer.time();
  // eslint-disable-next-line no-irregular-whitespace
  hud.textContent = `●\u2009REC ${clock}.${intraSecondFrame} #${frames} ${dataAmount} ${fps} — ${time}`; // shows number of COMPLETE frames
  if (typeof hud_info === 'string') { hud.textContent += '\n' + hud_info };
}

function addCloseLinkToHUD() {
    const close = document.createElement('span');
    close.innerText = '(close)';
    close.style.textDecoration = 'underline';
    close.style.cursor = 'pointer';
    close.addEventListener('click', e => { hideHUD(); });
    hud.appendChild(document.createElement('br'));
    hud.appendChild(close);
}

function hideHUD(time = 0) {
  setTimeout(() => {
    hud.style.display = 'none';
  }, time);
}


function dataAmountString(numBytes, mbDecimals = 1, gbDecimals = 2) {
  let mb = numBytes / 1000000;
  let gb = mb / 1000;
  return gb < 1 ? mb.toFixed(mbDecimals) + '\u2009MB': gb.toFixed(gbDecimals) + '\u2009GB'; // using thin space \u2009
}


class FPSCounter {
    fps = 0; // current fps value
    timestamps = [];
    
    constructor(history_secs = 15) {
        this.history_secs = history_secs; // how many seconds back to keep history
    }
    
    // call this every frame
    step() {
        const now = Date.now(); // UNIX timestamp
        this.timestamps.push( now );
        
        // discard old timestamps
        let removed = 0;
        while ( this.timestamps[0] !== undefined && (now - this.timestamps[0]) > this.history_secs * 1000) {
            this.timestamps.shift();
            removed += 1;
        }
        // console.log( `removed ${removed} / ${this.timestamps.length}` );
        
        // calculate fps
        const dt = now - this.timestamps[0];
        if (dt > 0) {
            this.fps = this.timestamps.length / (dt / 1000);
        }
    }
}

class Timer {
    constructor() {
        this.start();
    }
    
    start() {
        this.start_time = Date.now();
    }
    
    time(unix = false) {
        let elapsed = 0;
        if (this.start_time !== undefined) {
            elapsed = Date.now() - this.start_time;
            if (unix) {
                return elapsed;
            } else {
                const time = new Date(elapsed);
                const hh = time.getUTCHours().toString().padStart(2, '0');
                const mm = time.getUTCMinutes().toString().padStart(2, '0');
                const ss = time.getUTCSeconds().toString().padStart(2, '0');
                return `${hh}:${mm}:${ss}`;
            }
        }
    }
}