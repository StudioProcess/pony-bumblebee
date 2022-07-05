//
// Defining and generating sets of values for varying properties
// Managing these sets: Switching, stepping through, etc.
//


// two options: return an iterator
// return array
//



// Compute array of linear numbers
export function linear(range, count = 1, options = {}) {
    options = Object.assign({}, {
        step: 1,
        overflow: 'clamp', // clamp|wrap|overflow
        offset: 0,
        inclusive_end: true,
        repeat: 1, // number times each value is repeated ( >= 1 )
    }, options);
    
    // check range
    if (! Array.isArray(range) || range.length !== 2) {
        throw { error: 'linear range needs to be: [a, b]' };
    }
    
    const out = new Array(count);
    let next = range[0];
    
    options.repeat = Math.max(1, options.repeat); // >= 1
    let repeat_idx = 0;
    
    // prepare next value
    function perform_step() {
        repeat_idx += 1;
        if (repeat_idx === options.repeat) {
            next += options.step;
            let is_overflow = options.inclusive_end ? next > range[1] : next >= range[1];
            if (is_overflow) { // overflow condition
                if (options.overflow === 'clamp') {
                    next = range[1];
                } else if (options.overflow === 'wrap') {
                    next = range[0];
                }
            }
            repeat_idx = 0;
        }
    }
    
    // offset implementation: fast forward
    for (let i=0; i<options.offset; i++) { perform_step(); }
    
    for (let i=0; i<count; i++) {
        out[i] = next;
        perform_step();
    }
    
    return out;
}


// Compute array of a constant value
export function constant(value, count = 1, options = {}) {
    // updated: constant can be any value
    // check value
    // if (! (typeof value === 'number' && isFinite(value)) ) {
    //     throw { error: 'constant value needs to be a number' };
    // } 
    
    let out = new Array(count).fill(value);
    return out;
}


// Compute array of uniformly random floats
// p5 specific (uses randomSeed, random)
export function rnd(range, count = 1, options = {}) {
    options = Object.assign({}, {
        seed: 0
    }, options);
    
    // check range
    if (! Array.isArray(range) || range.length !== 2) {
        throw { error: 'rnd range needs to be: [a, b]' };
    }
    
    if (options.seed !== 0) { randomSeed(options.seed); }
    const out = new Array(count);
    for (let i=0; i<count; i++) {
        out[i] = random(range[0], range[1]);
   }
   return out;
}


// Compute array of uniformly random ints
// p5 specific (uses randomSeed, random)
export function rnd_int(range, count = 1, options) {
    options = Object.assign({}, {
        seed: 0
    }, options);
    
    // check range
    if (! Array.isArray(range) || range.length !== 2) {
        throw { error: 'rnd_int range needs to be: [a, b]' };
    }
    
    if (options.seed !== 0) { randomSeed(options.seed); }
    const out = new Array(count);
    for (let i=0; i<count; i++) {
        out[i] = Math.floor( random(range[0], range[1] + 1) );
    }
    return out;
}


// Compute array of uniformly random picks of a set of values
// p5 specific (uses randomSeed, random)
export function rnd_set(choices, count = 1, options = {}) {
    options = Object.assign({}, {
        seed: 0
    }, options);
    
    // check range
    if (! Array.isArray(choices) || choices.length < 1) {
        throw { error: 'rnd_set choices needs to be an array of length >= 1' };
    }
    
    if (options.seed !== 0) { randomSeed(options.seed); }
    const out = new Array(count);
    for (let i=0; i<count; i++) {
        out[i] = random(choices);
    }
    return out;
}


// Number/value generator functions
const fn = {
    linear,
    constant,
    rnd,
    rnd_int,
    rnd_set,
};


//    { p0: [v0, v1, ..., vn], p1: [w0, w1, ..., wn], ... }
// -> [ {p0: v0, p1: w0, ...}, {p0: v1, p1: w1}, ... ]
export function zip_values(set_of_values) {
    const zipped = [];
    for (let i=0; i<count; i++) {
        let obj = {};
        for (let [name, vals] of Object.entries(set_of_values)) {
            obj[name] = vals[i];
        }
        zipped.push(obj);
  }
  return zipped;
}


// Generate values based on property definitions
export function generate_values(props, count = 1, options = {}) {
    options = Object.assign({}, {
        seed: 0,
        // zip: false,
    }, options);
    
    if (options.seed !== 0) { randomSeed(options.seed); }
    
    const out = {};
    
    for (let prop of props) {
        let [prop_name, fn_name, value_or_range, fn_options] = prop;
        // check if fn exists
        if (! Object.keys(fn).includes(fn_name)) {
            throw { error: `not a valid property function: ${fn_name}` };
        }
        out[prop_name] = fn[fn_name](value_or_range, count, fn_options);
    }
    
    // if (options.zip) {
    //    out = zip_values(out);
    // }
    
    return out;
};


// Get value of an object property by path
export function deep_get(obj, path) {
    if (typeof path === 'string') { path = path.split('.'); }
    for (let part of path) {
        obj = obj[part];
    };
    return obj;
}


// Set value of an object property by path
export function deep_set(obj, path, value) {
    if (typeof path === 'string') { path = path.split('.'); }
    if (path.length <= 0) { return obj; }
    
    const last = path.at(-1); // last element of path
    const rest = path.slice(0, -1); // all elements before the last
    
    let sub_obj = obj;
    for (let part of rest) {
        if (sub_obj[part] === undefined) {
            throw { error: `property '${part}' doesn't exist on object`, obj: sub_obj };
        }
        sub_obj = sub_obj[part];
    };
    
    if (sub_obj[last] === undefined) {
        console.warn(`property '${last}' doesn't exist on object; will be created`, sub_obj);
    }
    sub_obj[last] = value;
    return obj;
};


// 
export function make_param_driver(paramobj, props, count, seed = 0) {
    const obj = {
        values: generate_values( props, count, {seed} ), // immediately generate values
        count,
        idx: 0,
    };
    
    const prop_names = Object.keys(obj.values);
    
    // Get a set of values by index
    obj.get = function get(idx) {
        let out = {};
        obj.idx = Math.max( Math.min(idx, count-1), 0 ); // clamp index and set it
        for (let prop_name of prop_names) {
            out[prop_name] = obj.values[prop_name][obj.idx];
        }
        return out;
    };
    
    // Set a set of values on the param object (by index)
    obj.set = function set(idx) {
        // set_of_values: { prop.path.name -> value, ... }
        const set_of_values = obj.get(idx);
        for (let [prop_name, value] of Object.entries(set_of_values)) {
            const prop_path = prop_name.split('.');
            deep_set(paramobj, prop_path, value);
        }
        return set_of_values;
    }
    
    return obj;
}

// properties definition object:
// {
//     'kat.1': {
//         count: 88,
//         props: [...]
//     },
//     ...
// }
export function make_prop_set_manager(properties, params, on_select = undefined, initial_seq_no = 1) {
    let param_driver;
    
    const obj = {
        params,
        set_name: null,    // name of the current set
        set_idx: null,     // index of the current set [0, set_count-1]
        set_count: null,   // number of sets
        idx: null,         // current index within the set
        seq_no: null,      // current global sequence number [1, seq_count]
        seq_count: null,   // max valid sequence number (i.e. total count)
        set_seq_nos: null, // contains seq numbers for all sets e.g. { 'kat.1': {from_seq: 1, to_seq: 88, count: 88}, ... }
    };
    
    // turn property set index into name; also tolerates name, which is returned unchanged
    function get_prop_set_ids(name_or_idx = 0) {
        let name = name_or_idx;
        let idx = name_or_idx;
        if (typeof name_or_idx === 'number') {
            name = Object.keys(properties)[name_or_idx];
        }
        if (typeof name_or_idx === 'string') {
            idx = Object.keys(properties).indexOf(name_or_idx);
        }
        return { name, idx };
    }
    
    // get global sequence number based on provided or current property set and index
    function get_seq_number(set_name_or_idx = undefined, idx = undefined) {
        let set_name;
        if (set_name_or_idx === undefined) { 
            set_name = obj.set_name; 
        } else {
            set_name = get_prop_set_ids(set_name_or_idx).name;
        }
        if (idx === undefined) { idx = obj.idx; }
        
        // sum up counts
        let sum = 0;
        for ( let [current_set_name, prop] of Object.entries(properties) ) {
            if (current_set_name === set_name) break;
            sum += prop.count;
        }
        return 1 + sum + idx;
    }
    
    function get_seq_count() {
        return Object.values(properties).reduce((acc, prop) => {
            return acc + prop.count;
        }, 0);
    }
    
    // get start and end sequence numbers for each set (as well as count )
    function get_set_seq_numbers() {
        const out = {};
        for ( let [set_name, prop] of Object.entries(properties) ) {
            const from_seq = get_seq_number(set_name, 0);
            const to_seq = from_seq + prop.count - 1;
            const count = prop.count;
            out[set_name] = { from_seq, to_seq, count };
        }
        return out;
    }
    
    obj.select = function select(name_or_idx, idx = 0) {
        const { name: new_set_name, idx: new_set_idx } = get_prop_set_ids(name_or_idx);
        // console.log(new_set_name, new_set_idx);
        
        // select set
        if (new_set_name !== obj.set_name) { // if the requested set is not current
            obj.set_name = new_set_name;
            obj.set_idx = new_set_idx;
            const prop_set = properties[obj.set_name];
            param_driver = make_param_driver(params, prop_set.props, prop_set.count, 1);
            // console.log(param_driver);
        }
        
        // select idx within set
        param_driver.set(idx);
        obj.idx = param_driver.idx;
        obj.seq_no = get_seq_number();
        if (typeof on_select === 'function') { on_select(obj); }
    };
    
    obj.step = function step(delta = 1) {
        obj.select(obj.set_name, obj.idx + delta);
    };
    
    obj.step_seq_no = function select_next(delta = 1) {
        obj.select_seq_no(obj.seq_no + delta);
    };
    
    obj.select_seq_no = function select_seq_no(no = 1) {
        no = Math.min( Math.max(1, no), obj.seq_count ); // clamp to valid range
        // check which set it is in
        let name;
        let idx = no-1;
        for ( let [set_name, prop] of Object.entries(properties) ) {
            name = set_name;
            if (prop.count > idx) { break; }
            idx -= prop.count;
        }
        obj.select(name, idx);
    };
    
    // initialize
    obj.set_count = Object.values(properties).length;
    obj.seq_count = get_seq_count();
    obj.set_seq_nos = get_set_seq_numbers();
    // obj.select(0, 0);
    obj.select_seq_no(initial_seq_no);
    
    return obj;
}
