//
// Animation of parameters
//

import { deep_get, deep_set } from './propgen.js';


const TWO_PI = 2 * Math.PI;

// sine wave oscillator [-amp, amp]
// step: time variable (integer)
// period: steps needed to wrap around (integer)
// amp: output scaling (dimensionless)
// phase: input offset (degrees; 0..360)
export function sin_osc(step, period = 30, amp = 1, phase = 0) {
    return amp * Math.sin( phase / 360 * TWO_PI + step * TWO_PI / period );
}

export function cos_osc(step, period = 30, amp = 1, phase = 0) {
    return sin_osc(step, period, amp, phase + 90);
}

// sawtooth oscillator [0, amp]
export function saw_osc(step, period = 30, amp = 1, phase = 0) {
    return amp * ( (step + phase / 360 * period) % period ) / period;
}

// triangle oscillator [0, amp]
export function tri_osc(step, period = 30, amp = 1, phase = 0) {
    if (step % period < period / 2) {
      return saw_osc(step, period/2, amp, phase);
    } else {
      return amp - saw_osc(step, period/2, amp, phase);
    }
}

// square oscillator (50% duty cycle) [0, amp]
export function square_osc(step, period = 30, amp = 1, phase = 0) {
    if ( (step + phase / 360) % period < period / 2 ) {
      return amp;
    } else {
      return 0;
    }
}

// [0, amp] with noise_adjust = 0
// [-amp, amp] with noise_adjust = -0.5 or -0.25
export function perlin_osc(step, period = 30, amp = 1, noise_scale = 1, noise_octs = 1, noise_adjust = -0.5, noise_seed = 0) {
    // make a circle in noisespace -> produces seamless looping noise
    const r = noise_scale;
    const x = r * Math.cos( step / period * TWO_PI ) + r; // shift to first quadrant, because noise seems to be symmetric around 0
    const y = r * Math.sin( step / period * TWO_PI ) + r;
    noiseDetail(noise_octs);
    noiseSeed(noise_seed);
    if (noise_adjust !== 0) {
        return amp * (noise(x, y) + noise_adjust) * (-1/noise_adjust);
    } else {
        return amp * noise(x, y);
    }
}

const fn = {
    sin_osc,
    cos_osc,
    saw_osc,
    tri_osc,
    square_osc,
    perlin_osc,
};

export function make_transport(pos_cb, reset_cb) {
    const obj = {
        position: 0,
        started: false,
    };
    
    function on_pos_change() {
        if (typeof pos_cb === 'function') {
            pos_cb(obj.position);
        }
    }
    
    function on_reset() {
        if (typeof reset_cb === 'function') {
            reset_cb(obj.position);
        }
    }
    
    obj.step = function step() {
        if (obj.started) {
            obj.position += 1;
            on_pos_change();
        }
    };
    
    obj.reset = function reset(position = 0, invoke_reset_cb = true) {
        obj.position = position;
        on_pos_change();
        if (invoke_reset_cb) {
            on_reset();
        }
    };
    
    // force update
    obj.update = function update() {
        on_pos_change();
    }
    
    obj.start = function start(started = true) {
        obj.started = started;
        if (started) { on_pos_change(); }
    };
    
    obj.stop = function stop() {
        obj.start( false );
    };
    
    obj.toggle = function toggle() {
        obj.start( ! obj.started );
    };
    
    return obj;
}


// props: an array of properties like this:
//        [ dest_obj, 'dest_prop', src_obj, 'src_prop', 'anim_fn', [param_obj, param_prop1, param_prop2] ]
export function make_animator(props, on_reset = undefined) {
    // initialize dest_obj values
    (function init() {
        for (let prop of props) {
            const [ dest_obj, dest_prop, src_obj, src_prop, anim_fn, anim_params ] = prop;
            const src_val = !src_obj ? 0 : deep_get(src_obj, src_prop);
            deep_set( dest_obj, dest_prop, src_val );
        }
    })();
    
    function on_update(pos) {
        // update all props
        // console.log("anim update pos %d", pos);
        for (let prop of props) {
            const [ dest_obj, dest_prop, src_obj, src_prop, anim_fn, anim_params ] = prop;
            // source value
            const src_val = !src_obj ? 0 : deep_get(src_obj, src_prop);
            // parameter values
            const param_obj = anim_params[0];
            const param_props = anim_params.slice(1);
            const param_values = param_props.map( prop_name => {
                if (Array.isArray(prop_name)) { // ['prop_name', x => x * 0.5] // with mapping function
                    let val = deep_get(param_obj, prop_name[0]); // first element is the property name
                    if (typeof prop_name[1] === 'function') { val = prop_name[1](val); } // second element is a mapping function
                    return val;
                }
                if (typeof prop_name !== 'string') { // constant value 
                    return prop_name; // return the given property itself, it's a constant value
                }
                const val = deep_get(param_obj, prop_name);
                // console.log(prop_name, val);
                return val;
            } );
            // function value
            const fn_value = fn[anim_fn]( pos, ...param_values );
            // console.log(pos, param_values, fn_value);
            // set destination value
            // console.log(dest_obj, dest_prop);
            deep_set( dest_obj, dest_prop, src_val + fn_value );
        }
    }
    const transport = make_transport(on_update, on_reset);
    return transport;
};
