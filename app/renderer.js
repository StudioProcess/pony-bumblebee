//
// Rendering still frames and animations to disk
//

import * as util from './util.js';
import * as recorder from '../libs/recorder.js';
import { config } from './params.js';

export let running = false;

let initialized = false;
let stop_requested = false;

let propman;
let animator;

export function init(_propman, _animator) {
    propman = _propman;
    animator = _animator;
    initialized = true;
}

export function update(canvas) {
    recorder.update(canvas);
}

export function stop() {
    stop_requested = true;
}


// render a list of sequence numbers
// if anim_frames > 0, animations are rendered
// returns promise, which resolves when rendering is finished (or was stopped)
export async function render_list(seq_nos, limit = 0, anim_frames = 0) {
    if ( !initialized || running || seq_nos.length < 1) { return; }
    running = true;
    stop_requested = false;
    
    console.log(`RENDERING ${seq_nos.length} No.s`);
    
    let idx = 0;
    let seq_no = seq_nos[idx];
    let count = 0; // number of rendered images
    
    let with_anim = anim_frames > 0; // rendering animation or not?
    let anim_idx = 0; // current animation frame idx
    let animating = false;
    
    // prepare state, then draw the frame;
    function update() {
        if (animating) {
            // console.log('setting anim ' + seq_no.toString().padStart(4,'0') + '_' + (anim_idx+1).toString().padStart(4,'0'));
            animator.reset(anim_idx, false); // set animation frame, without invoking on_reset callback
            const seq_no_str = seq_no.toString().padStart(4,'0');
            const frame_no_str = anim_idx.toString().padStart(4,'0');
            const folder = config.rendering_use_folders ? config.rendering_folders.frames + '/' : '';
            recorder.setNextFilename(`${folder}${seq_no_str}/${seq_no_str}_${frame_no_str}.png`); // e.g. 0005/0005_0001.png
        } else {
            // console.log('setting still ' + seq_no.toString().padStart(4,'0'))
            propman.select_seq_no(seq_no); // causes animation priming
            const folder = config.rendering_use_folders ? config.rendering_folders.images + '/' : '';
            recorder.setNextFilename(`${folder}${seq_no.toString().padStart(4,'0')}.png`);
        }
        redraw(); // draw once; initial draw of kick off next iteration
    }
    
    // set initial state
    noLoop(); // will redraw manually from now on
    animator.stop(); // stop interactive animation, just in case (we'll be stepping manually)
    animator.reset(); // reset animation so initial still frame is correct; invokes on_reset callback (actually not really needed, since propman will cause animation priming in the next call)
    update(); // initial draw
    recorder.setInfo('');
    
    return new Promise(resolve => {
        recorder.start({
            chunk: config.CHUNK_SIZE_MB, // max tar size in MB
            onUpdate: function() {
                // Note: the current frame was just recorded (given by current seq_no, anim_idx) -> update count if it wasn't an animation frame
                if (!animating) { count += 1; }

                console.log(`onUpdate seq_no=${seq_no} count=${count} anim_idx=${anim_idx}`);
                let info = `Seq (${count}/${seq_nos.length})`;
                if (animating) { info += ` — Anim (${anim_idx+1}/${anim_frames})`; }
                recorder.setInfo(info);
                
                // add metadata
                if (!animating) {
                    const metadata_folder = config.rendering_use_folders ? config.rendering_folders.metadata + '/' : '';
                    recorder.addJSONToTarball(propman.params, `${metadata_folder}${seq_no.toString().padStart(4,'0')}.json`);
                }
                
                if (with_anim && !stop_requested) {
                    if (animating) {
                        if (anim_idx >= anim_frames-1) { // animation stop condition
                            console.log('ending animation');
                            animator.reset(); // reset animation for next still frame to be correct; invokes on_reset callback
                            animating = false;
                            anim_idx = 0;
                            // -> no return; fall through to preparing next still frame
                        } else {
                            anim_idx += 1;
                            update();
                            return;
                        }
                    } else {
                        // kick off animation
                        animating = true;
                        anim_idx = 0;
                        update();
                        return;
                    }
                }
                
                // check for end condition
                if ( stop_requested || idx >= seq_nos.length-1 || (limit > 0 && count >= limit) ) {
                    console.log('stopping');
                    recorder.stop();
                    return;
                }
                
                // set new params for next iteration
                idx += 1;
                seq_no = seq_nos[idx];
                update(); // kick off next iteration
            },
            onStop: function() {
                console.log('onStop');
                running = false;
                loop();
                resolve();
            }
        });
    });
}


// returns promise, which resolves when rendering is finished (or was stopped)
export async function render_set(name, limit = 0, anim_frames = 0) {
    const { from_seq, to_seq } = propman.set_seq_nos[name];
    // console.log( util.range(from_seq, to_seq+1) );
    return render_list( util.range(from_seq, to_seq+1), limit, anim_frames );
}


// returns promise, which resolves when rendering is finished (or was stopped)
export async function render_all_sets(limit = 0, anim_frames = 0) {
    // construct list of sequence numbers 
    let list = [];
    // { 'kat.1': {from_seq: 1, to_seq: 88, count: 88}, ... }
    for (let { from_seq, count } of Object.values(propman.set_seq_nos)) {
        const stop = limit > 0 ? from_seq + Math.min(count, limit) : from_seq + count; // limit counts for EACH set
        list = list.concat( util.range(from_seq, stop) );
    };
    return render_list( list, 0, anim_frames ); // call this with limit 0, each set is already limited
}


// returns promise, which resolves when rendering is finished (or was stopped)
export async function render_range(from_seq, to_seq, limit = 0, anim_frames = 0) {
    if (from_seq > to_seq) {
        [from_seq, to_seq] = [to_seq, from_seq]; // flip
    }
    // console.log( util.range(from_seq, to_seq+1) )
    return render_list( util.range(from_seq, to_seq+1), limit, anim_frames );
}