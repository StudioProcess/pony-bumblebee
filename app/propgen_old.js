//
// Statistical properties system
// 


import * as util from './util.js';
import * as data from './data.js';


// Load b/w distribution image
// Returns: function [0,1] -> [0,1] where sum of all values = 1
export async function load_distribution_img(url) {
    const img = await util.load_image(url, true);
    
    const width = img.width;
    const values = []; // probability 
    const acc = []; // cumulative probability
    let total = 0;
    
    // count black pixels in each column
    for (let x = 0; x < img.width; x++) {
        let count = 0;
        for (let y = 0; y < img.height; y++) {
            const offset = (y * img.width + x) * 4;
            const r = img.pixels[offset];
            if (r < 128) { count += 1; }
        }
        values[x] = count;
        total += count;
        acc[x] = total;
    }
    
    // calculate inversion of acc
    const inv = Array(width).fill(-1);
    for (let i = 0; i<width; i++) {
        let val = acc[i]; // [0, total]
        val = int(val / total * (width-1)); // [0, width-1]
        inv[ val ] = i / (width-1) * total;
    }
    
    
    // // fill in missing values (don't interpolate, just replicate)
    // let last = 0;
    // for (let i = 0; i<width; i++) {
    //     if (inv[i] === -1) {
    //         inv[i] = last;
    //     } else {
    //         last = inv[i];
    //     }
    // }
    // // smooth values
    // const f = new Filter(16);
    // for (let i = 0; i<width; i++) {
    //     inv[i] = f.input(inv[i]);
    // }
    
    
    // fill in missing values w/linear interpolation
    let last_idx = 0;
    let last_val = 0;
    let next_idx = 0;
    let next_val = 0;
    for (let i = 0; i<width; i++) {
        if (inv[i] === -1) { // missing value
            if (next_idx <= i) { // need to find next index
                next_idx = -1; // mark that we don't have a next index
                for (let j=i+1; j<width; j++) {
                    if ( inv[j] !== -1) {
                        next_idx = j;
                        next_val = inv[j];
                        break;
                    }
                }
                if (next_idx === -1) {
                    next_idx = width-1;
                    next_val = total;
                }
            }
            // compute interpolated value
            inv[i] = map(i, last_idx, next_idx, last_val, next_val);
        } else {
            last_idx = i;
            last_val = inv[i];
        }
    }
    
    function prob(x) {
        x = constrain(x, 0, 1);
        x = x * (width-1);
        x = int(x);
        return values[x] / total;
    }
    
    function acc_prob(x) {
        x = constrain(x, 0, 1);
        x = x * (width-1);
        x = int(x);
        return acc[x] / total;
    }
    
    function inv_acc(x) {
        x = constrain(x, 0, 1);
        x = x * (width-1);
        x = int(x);
        return inv[x] / total;
    }
    
    return { prob, acc_prob, inv_acc };
}


export function sample(dist, n=10000, res=200, smooth=8) {
    let counts = Array(res).fill(0);
    for (let i = 0; i<n; i++) {
        let x = Math.random();
        x = i / (n-1);
        let val = int( dist.inv_acc(x) * (res-1) );
        counts[val] += 1;
    }
    
    let check_total = counts.reduce( (x, acc) => acc + x, 0);
    console.log(check_total);
    
    
    if (smooth > 1) {
        // n = 0; // recount
        const f = data.make_filter(smooth, 0);
        for (let i = 0; i<counts.length; i++) {
            counts[i] = f.input(counts[i]);
            // n += counts[i]; // recount
        }
    }
    
    function prob(x) {
        x = constrain(x, 0, 1);
        x = x * (res-1);
        x = int(x);
        return counts[x] / n;
    }
    
    return { prob };
}





/*

make_sampler({
    complexity: 
    filling: 
    colored: 
});

make_sampler({
    // property: "complexity",
    range: "continuous|discrete",
    value_min: 0,
    value_max: 100,
    values: [0, 1, 2, 3],
    sampling: "uniform|linear|distribution_image",
    sampling: "uniform|linear|distribution_values",
});

make_sampler({
    // property: "complexity",
    range_disc: [0, 1, 2, 3],
    range_cont: [0, 100],
    // sampling: "uniform|linear|distribution_image",
    // sampling: "uniform|linear|distribution_values",
});

*/

export function make_sampler(options) {
    options = Object.assign({}, {
       range: [0, 1], // can be [min, max] w/discrete=false, or [a0, a1, ...] w/discrete=true
       discrete: false,
       sampling: 'uniform', // linear|uniform
       seed: 0,
    }, options);
    
    // sanity check options
    if (options.discrete && options.range.length <= 0) {
        throw { error: 'range needs to have 1 or more elements (when discrete=true)' };
    } else if (!options.discrete && options.range.length < 2) {
        throw { error: 'range needs to have 2 elements (when discrete=false)' };
    }
    
    function get(n) {
        if (n <= 0) return [];
        if (options.seed > 0) randomSeed(options.seed);
        const out = new Array(n);
        
        if (options.sampling === 'linear') {
            for (let i=0; i<n; i++) {
                if (options.discrete) {
                    if (options.range.length === 1) { // range is actually just a single value
                        out[i] = options.range[0];
                    } else if (n === 1) { // requesting single value only -> use middle of range
                        out[i] = options.range[ int(options.range.length / 2) ];
                    } else {
                        out[i] = options.range[ int(i * options.range.length / n) ];
                    }
                } else { // continuous
                    if (options.range[0] === options.range[1]) { // range is actually just a single value
                        out[i] = options.range[0];
                    } else if (n === 1) { // requesting single value only -> use middle of range
                        out[i] = options.range[0] + (options.range[1]-options.range[0])/2; 
                    } else {
                        out[i] = options.range[0] + i * (options.range[1]-options.range[0]) / (n-1);
                    }
                }
            }
        } else { // uniform sampling
            for (let i=0; i<n; i++) {
                if (options.discrete) {
                    out[i] = options.range[ int(random(0, options.range.length)) ];
                } else { // continuous
                    out[i] = random( options.range[0], options.range[1] );
                }
            }
        }
        
        return out;
    }
    
    return { get };
}


// properties: { property_name0, sampling_options0, ... }
export function make_multisampler(properties, options = {zipped: false, seed: 0}) {
    const samplers = {};
    
    if (options.seed > 0) randomSeed(options.seed);
    
    // create samplers
    for (let [k, v] of Object.entries(properties)) {
        samplers[k] = make_sampler(v);
    }
    
    function get(n) {
        const values = {};
        for (let [name, sampler] of Object.entries(samplers)) {
            values[name] = sampler.get(n);
        }
        
        if (options.zipped) {
            const zipped = [];
            for (let i=0; i<n; i++) {
                let obj = {};
                for (let [name, vals] of Object.entries(values)) {
                    obj[name] = vals[i];
                }
                zipped.push(obj);
            }
            return zipped;
        }
        
        return values;
    }
    
    return { get };
}
