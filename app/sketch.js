//
// some nomenclature:
// * seq_no: global sequence number from 1 to 8760
// * property set: set of propery values generate by a param driver; defines an image category
//

import * as lil from '../node_modules/lil-gui/dist/lil-gui.esm.min.js';
import '../libs/lil-gui-patch.js';
import * as renderer from './renderer.js';
import * as util from './util.js';
import * as data from './data.js';
import * as propgen_old from './propgen_old.js';
import * as propgen from './propgen.js';
import { config, params, soil_data } from './params.js';
import properties from './properties.js';
import * as animation from './animation.js';

let gui;
let img_bee, bee;
let d_edna, current_root; // current edna subtree root
let d_weather, current_weather; // weather data
let propman; // property manager
let animator, animated = {};

// rendering properties of the elements to be drawn
// contains visible elements only
const el = {
    count: 0, // total number of elements to draw (unused)
    idx: 0, // current element being drawn
    colors: [],
    forms: [], // ellipse|quad
    stroked: [], // true|false (only applies to fill and fill_bw type colors)
};

async function setup() {
    // noLoop();
    // return;
    
    createCanvas(config.W, config.H);
    pixelDensity(1);
    frameRate(config.FPS);
    
    // gui
    gui = new lil.GUI;
    gui.title(title_string());
    gui.addAll(params);
    gui.get('_nft_metadata').close();
    gui.get('general').close();
    gui.get('color').close();
    gui.get('animation').close();
    
    gui.get('prop_sets', 'set').options( Object.keys(properties) ).onChange( set_name => {
        propman.select(set_name, 0);
    });
    gui.get('prop_sets', 'set_no').onChange( set_no => {
        propman.select(set_no-1, 0);
    });
    gui.get('prop_sets', 'idx').onChange( idx => {
        propman.select(params.prop_sets.set, idx);
    });
    gui.get('prop_sets', 'seq_no').onChange( no => {
        propman.select_seq_no(no);
    });
    
    // animation setup
    // [dest_obj, dest_prop, src_obj, src_prop, anim_fn, param_obj, param_props ]
    animator = animation.make_animator([
        [ animated, 'el_s', params, 'element.s', 'sin_osc', [params.animation, 'el_s_period', 'el_s_amp', 'el_s_phase'] ],
        [ animated, 'el_r', params, 'element.r', 'sin_osc', [params.animation, 'el_r_period', 'el_r_amp', 'el_r_phase'] ],
        
        [ animated, 'bee_a', null, null, 'saw_osc', [params.animation, 'bee_period', 360, 'bee_phase'] ],
        [ animated, 'bee_r_noise', null, null, 'perlin_osc', [params.animation, 'bee_period', 'bee_noise_amp', 'bee_noise_scale', 'bee_noise_octs', 'bee_noise_adjust', 'bee_noise_seed'] ],
        
        [ animated, 'bee_a_figure', null, null, 'tri_osc', [params.animation, 'bee_period', 180, 'bee_phase'] ], // [0, 180]
        [ animated, 'bee_r_figure', null, null, 'sin_osc', [params.animation, 'bee_period', 1] ], // [-1, 1]
        
        [ animated, 'bee_a_loop2', null, null, 'saw_osc', [params.animation, ['bee_period', x=>x/2], 360, 'bee_phase'] ],  // [0, 360]
        [ animated, 'bee_r_loop2', null, null, 'sin_osc', [params.animation, 'bee_period', 1] ], // [-1, 1]
        
        [ animated, 'bee_a_loop', null, null, 'saw_osc', [params.animation, ['bee_period', x=>x/3*2], 360, 'bee_phase'] ],  // [0, 360]
        [ animated, 'bee_r_loop', null, null, 'sin_osc', [params.animation, ['bee_period', x=>x*2], 1] ], // [-1, 1]
        [ animated, 'bee_noise_sign_loop', null, null, 'square_osc', [params.animation, ['bee_period', x=>x*2]] ], // [0, 1]
        
        [ animated, 'bee_a_tri', null, null, 'saw_osc', [params.animation, ['bee_period', x=>x*2], 360, 'bee_phase'] ],  // [0, 360]
        [ animated, 'bee_r_tri', null, null, 'sin_osc', [params.animation, ['bee_period', x=>x/3*2], 1] ], // [-1, 1]
        [ animated, 'bee_noise_sign_tri', null, null, 'square_osc', [params.animation, ['bee_period', x=>x*2]] ], // [0, 1]
    ], prime_bee_position); // second arg: on_reset callback
    gui.get('animation').add(animator, 'toggle' ).name('start/stop');
    gui.get('animation').add(animator, 'reset' );
    gui.get('render').addFunction(render).name('render');
    
    // assets
    // img_bee = loadImage('./assets/bee_center.png');
    img_bee = loadImage('./assets/bee_oriented.svg');
    bee = make_bee();
    
    // edna data
    d_edna = []; // load all samples
    for (let [i, sample] of config.edna_samples.entries()) {
        console.log('loading eDNA: %s', sample);
        const result = await data.load_process_edna(config.edna_data_file, sample, {
            top_sequences: config.edna_top_sequences,
            fraction_min: config.edna_fraction_min,
            fraction_count: config.edna_fraction_count,
        });
        d_edna.push(result);
        console.log(result);
        // console.log(result.csv);
    }
    
    // weather data
    console.log('loading weather: %o', config.weather_samples)
    d_weather = (await data.load_weather(config.weather_data_file, config.weather_samples));
    for (let [i, weather] of d_weather.entries()) {
        console.log('    weather sample: %s', config.weather_samples[i]);
        console.log('    weather entries: %d', weather.length);
        console.log('    weather timestamps: %s – %s', weather.at(0).dt_iso, weather.at(-1).dt_iso);
        console.log('    temp extrema: %o', util.min_max(weather.map(x => x.temp)));
    }
    
    // property manager
    propman = propgen.make_prop_set_manager(properties, params, on_prop_set_select, config.initial_seq_no, config.propman_seed); 
    window.propman = propman;
    
    // renderer
    renderer.init(propman, animator);
}

function title_string() {
    const sketch = document.querySelector('#sketch');
    return `${sketch.dataset.name} v${sketch.dataset.version} (${sketch.dataset.hash})`;
}

function on_prop_set_select(propman) {
    // console.log('on prop set select');
    // Note: need to set this here instead of in draw(), because properties.disturbance_pos_a is used by animatior
    set_props_from_weather();
    
    params.prop_sets.set = propman.set_name;
    params.prop_sets.set_no = propman.set_idx + 1;
    params.prop_sets.idx = propman.idx;
    params.prop_sets.seq_no = propman.seq_no;
    gui.updateDisplay();
    
    clear_trail();
    // animator.update();
    animator.reset(animator.position); // this causes the animation to be primed to the current position
}

function set_props_from_weather() {
    const current_weather = get_weather(params.properties.edna_sample_idx, params.properties.weather_idx);
    const disturbance_intensity = constrain( map(current_weather.temp, -5, 30, -0.5, 1.0), -0.5, 1.0 );
    
    if (params.bee.displace_by_temp) {
        // gui.get('properties', 'disturbance_intensity').setValue(disturbance_intensity);
        params.properties.disturbance_intensity = disturbance_intensity;
    }
    if (params.bee.displace_by_wind) {
        // gui.get('properties', 'disturbance_pos_a').setValue(current_weather.wind_deg);
        params.properties.disturbance_pos_a = current_weather.wind_deg;
    }
}

// get weather entry by index
// idx: 0 ... d_edna.length-1
// reverse: start from last entry and go in reverse with higher indices
function get_weather(sample_idx = 0, idx = 0, reverse = false) {
    if (!d_weather) return undefined;
    const weather = d_weather[sample_idx];
    idx = constrain(idx, -weather.length, weather.length-1); // clamp
    if (reverse) return weather.at(-1 - idx);
    return weather.at(idx);
}

function make_bee() {
    let bee = {
        fdx: data.make_filter(config.bee_filter_size), // relative movement filters
        fdy: data.make_filter(config.bee_filter_size),
        x:0, y:0, // current position
        px:0, py:0, // previous
        heading:0, // 0 is east,
        trail:[],
    };
    return bee;
}

function update_bee() {
    // save previous position
    bee.px = bee.x;
    bee.py = bee.y;
    
    // determine bee position
    if (params.bee.mouse) {
        bee.x = mouseX;
        bee.y = mouseY;
    } else {
        // base position
        bee.x = width/2 + params.properties.disturbance_pos_r * width/2 * cos( (params.properties.disturbance_pos_a-90) / 360 * TWO_PI );
        bee.y = height/2 + params.properties.disturbance_pos_r * width/2 * sin( (params.properties.disturbance_pos_a-90) / 360 * TWO_PI );
        // add animated position
        if (params.animation.bee_anim) {
            const sign = params.animation.bee_flip_dir ? -1 : 1;
            // const sign_y = params.animation.bee_flip_y ? -1 : 1;
            const noise = params.animation.bee_noise ? animated.bee_r_noise : 0;
            let x, y;
            
            const rx = params.animation.bee_rx;
            // set ry, so sum of rx and ry is [rmax, rmin]
            const ry = params.animation.bee_limit_r ? constrain(
                params.animation.bee_ry,
                max(params.animation.bee_rmin-params.animation.bee_rx, 0), 
                params.animation.bee_rmax-params.animation.bee_rx, 
            ) : params.animation.bee_ry;
            gui.get('info', 'bee_rx').setValue(rx);
            gui.get('info', 'bee_ry').setValue(ry);
            
            if (params.animation.bee_anim_type === 'eight') {
                x = (rx * animated.bee_r_figure + noise) * cos( sign * radians(animated.bee_a_figure-90) );
                y = (ry * animated.bee_r_figure + noise) * sin( sign * radians(animated.bee_a_figure-90) );
            } else if (params.animation.bee_anim_type === 'double-loop') {
                x = (rx * animated.bee_r_loop2 + noise) * cos( sign * radians(animated.bee_a_loop2) );
                y = (ry * animated.bee_r_loop2 + noise) * sin( sign * radians(animated.bee_a_loop2) );
            } else if (params.animation.bee_anim_type === 'loop') {
                // fix discontinuity around 0 degrees, when using noise
                const fix_angle = 30; // scale down noise around 0 degrees +/- fix_angle
                let angle = (animated.bee_a - params.animation.bee_phase) % 360; // [0, 360] // Note: use global bee angle, since loop bee angle has weird period; also respect phase
                if (angle > 180) { angle -= 360; } // [-180, 180]
                const noise_factor = min( abs(angle), fix_angle) / fix_angle;
                const noise_sign = animated.bee_noise_sign_loop * 2 - 1;
                x = (rx * animated.bee_r_loop + noise_sign * noise * noise_factor) * cos( sign * radians(animated.bee_a_loop) );
                y = (ry * animated.bee_r_loop + noise_sign * noise * noise_factor) * sin( sign * radians(animated.bee_a_loop) );
            } else if (params.animation.bee_anim_type === 'tri') {
                // fix discontinuity around 0 degrees, when using noise
                const fix_angle = 30; // scale down noise around 0 degrees +/- fix_angle
                let angle = (animated.bee_a - params.animation.bee_phase) % 360; // [0, 360] // Note: use global bee angle, since loop bee angle has weird period; also respect phase
                if (angle > 180) { angle -= 360; } // [-180, 180]
                const noise_factor = min( abs(angle), fix_angle) / fix_angle;
                const noise_sign = animated.bee_noise_sign_tri * 2 - 1;
                x = (rx * animated.bee_r_tri + noise_sign * noise * noise_factor) * cos( sign * radians(animated.bee_a_tri) );
                y = (ry * animated.bee_r_tri + noise_sign * noise * noise_factor) * sin( sign * radians(animated.bee_a_tri) );
            } else { // ellipse
                x = (rx + noise) * cos( sign * radians(animated.bee_a-90) );
                y = (ry + noise) * sin( sign * radians(animated.bee_a-90) );
            }
            
            // add rotation
            const a = radians(params.animation.bee_rotation);
            let anim_x = x * cos(a) - y * sin(a);
            let anim_y = x * sin(a) + y * cos(a);
            
            bee.x = bee.x + anim_x;
            bee.y = bee.y + anim_y;
        }
    }
    // console.log('update %d / %f', bee.x, params.properties.disturbance_pos_a);
    // only update heading if there is movement
    if (bee.x !== bee.px || bee.y !== bee.py) {
        const dx = bee.x - bee.px;
        const dy = bee.y - bee.py;
        const filtered_dx = bee.fdx.input(dx);
        const filtered_dy = bee.fdy.input(dy);
        bee.heading = degrees( atan2(filtered_dy, filtered_dx) );
        // console.log(`${dx}/${filtered_dx}`, `${dy}/${filtered_dy}`, bee.heading);
        // console.log(`filter update ${dx}/${filtered_dx}`, bee.heading);
        bee.trail.push([bee.x, bee.y]);
        if (bee.trail.length > 300) { bee.trail.shift(); }
    }
}

// prime the filters computing the bee's current heading
function prime_bee_position(pos = 0) {
    // console.log('priming to pos %d', pos);
    // Note: Need to perform 1 more step than filter size, because the filter records a differential property (x - px)!
    // E.g. for filter size 3: we are doing steps -3, -2, -1 and 0, i.e. 4 steps
    for (let i=pos - config.bee_filter_size; i<=pos; i++) {
        // console.log('priming %d', i);
        animator.reset(i, false); // without invoking the reset callback again; sets animated values
        update_bee(); // updates bee positional filters
    }
}

function limit_tilt(heading) {
    // positive heading is cw, negative ccw
    let max_tilt_up = 60;
    let max_tilt_down = 45;
    let tilt;
    if (heading >= 0 && heading < 90) { // Quadrant 1
        tilt = heading;
        tilt = min(tilt, max_tilt_down);
        heading = tilt;
    } else if (heading >= 90 && heading < 180) { // Quadrant 2
        tilt = 180 - heading;
        tilt = min(tilt, max_tilt_down);
        heading = 180 - tilt;
    } else if (heading <= 0 && heading > -90) { // Quadrant 3
        tilt = -heading;
        tilt = min(tilt, max_tilt_up);
        heading = -tilt;
    } else { // Quadrant 4 (<= -90 && > -180)
        tilt = 180 + heading;
        tilt = min(tilt, max_tilt_up);
        heading = -180 + tilt;
    }
    return heading;
}

function draw_bee() {
    push();
    translate(bee.x, bee.y);
    if (params.bee.limit_tilt) {
        bee.heading = limit_tilt(bee.heading);
    }
    rotate( radians(bee.heading) );
    if ( abs(bee.heading) >= 90) {
        scale(1, -1);
    }
    image(img_bee, -params.bee.size/2, -params.bee.size/2, params.bee.size, params.bee.size);
    pop();
}

function draw_trail() {
    if (params.bee.trail) {
        push();
        strokeWeight(3);
        stroke(255, 0, 0);
        let prev;
        for (let pos of bee.trail) {
            if (prev) {
                line(prev[0], prev[1], pos[0], pos[1])
            }
            prev = pos;
        }
        pop();
    }
}

function clear_trail() {
    bee.trail = [];
}


function draw_indicator(x, y) {
    push();
    noStroke();
    fill(params.color.fill);
    ellipse(x, y, params.bee.size * 0.4, params.bee.size * 0.4)
    fill(params.color.fillbw);
    ellipse(x, y, params.bee.size * 0.4 * 0.9, params.bee.size * 0.4 * 0.9)
    pop();
}


// Calculate displacement of a target position, relative to a displacer position
// Returns: p5.Vector
function displace_by_distance(target_x = 0, target_y = 0, displacer_x = 0, displacer_y = 0) {

    const d = dist(target_x, target_y, displacer_x, displacer_y);

    if (d > params.bee.displace_radius) { return new p5.Vector(0,0); }
    const v = new p5.Vector(target_x - displacer_x, target_y - displacer_y).normalize();
    // v.setMag( min( 1/max(d,1) * 250, 500) );
    
    v.setMag( (params.bee.displace_radius - d) * (params.bee.displace_strength * params.properties.disturbance_intensity) / params.bee.displace_radius * 100 );

    return v;
}


function draw_element(options) {
    // copy incoming options object, since we're changing some locally
    options = Object.assign({}, { cx:0, cy:0, r:0, sx:1, sy:1, mirror_x:false, mirror_y:false, form:'rect' }, options);
    
    if (!params.bee.displace_mirror) {
        // apply mirroring BEFORE displacement -> DOESN'T MIRROR displacement
        if (options.mirror_x) { options.cx = -options.cx; }
        if (options.mirror_y) { options.cy = -options.cy; }
    }
    
    let d = displace_by_distance(width/2 + options.cx, height/2 + options.cy, bee.x, bee.y);
    if (params.bee.displace_enabled) {
        options.cx += d.x;
        options.cy += d.y;
        
        if (params.bee.displace_mirror) {
            // apply mirroring AFTER displacement -> MIRRORS displacement
            if (options.mirror_x) { options.cx = -options.cx; }
            if (options.mirror_y) { options.cy = -options.cy; }
        }
    }
    
    push();
    // translation chain
    // Note: formerly we applied mirroring here through scaling
    translate(options.cx, options.cy);
    rotate(options.r);
    scale(options.sx, options.sy);
    
    if (options.form === 'pony_quad') {
        pony_quad(
            -options.w/2, -options.h/2, 
            options.w, options.h,
            params.general.quad_inset_top, params.general.quad_inset_right
        );
    } else if (options.form === 'ellipse') {
        ellipse(0, 0, options.w, options.h);
    } else {
        rectMode(CENTER);
        rect(0, 0, options.w, options.h);
    }
    // const tbox = transformed_box(0, 0, params.w, params.h);
    pop();
    // return tbox;
}

function draw_recursive(node, max_depth = null, box = [-50, -50, 100, 100], dir = true) {
    // determine visibility
    const in_subtree = node.has_ancestor_index(current_root.index);
    let visible = in_subtree;
    if (params.properties.path_to_root) {
        const in_path_to_root = node.has_descendent_index(current_root.index);
        visible = visible | in_path_to_root;
    }
    
    // only draw if it's within the selected nodes
    if ( visible ) {
        let center_translate = [ box[0] + box[2]/2, box[1] + box[3]/2 ]; // translate to box center
        let depth_translate = [ params.depth.tx * node.depth, params.depth.ty * node.depth ]; // depth translate
        let total_translate = [ center_translate[0] + depth_translate[0], center_translate[1] + depth_translate[1] ];
        
        let depth_scale = pow(params.depth.s, node.depth);
        // let total_scale = params.element.s * depth_scale; // element scale + depth scale
        let total_scale = animated.el_s * depth_scale; // element scale + depth scale
    
        let depth_rotate = params.depth.r * node.depth;
        // let total_rotate = (params.element.r + depth_rotate) / 360 * TWO_PI;
        let total_rotate = (animated.el_r + depth_rotate) / 360 * TWO_PI;
        
        // draw this node
        let options = {
            cx: total_translate[0],
            cy: total_translate[1],
            r: total_rotate,
            sx: total_scale,
            sy: total_scale,
            w: box[2],
            h: box[3],
        };
    
        // set color
        const col = el.colors[el.idx];
        fill(col);
        // set stroke
        if (col.type === 'fill' || col.type === 'fillbw') {
            strokeWeight(params.color.fill_stroke); 
            const stroked = el.stroked[el.idx];
            if (!stroked) strokeWeight(0);
        } else if (col.type === 'nofill') { strokeWeight(params.color.nofill_stroke); }
        // special stroke options for filled root element 
        if (el.idx === 0 && col.type === 'fill') {
            if (params.color.force_root_fillstroke === 'force_on') { strokeWeight(params.color.fill_stroke); }
            else if (params.color.force_root_fillstroke === 'force_off') { strokeWeight(0); }
        }
        // set form
        options.form = el.forms[el.idx];
        el.idx += 1;
        
        // draw
        draw_element(options);
        if (params.properties.mirror === 'x' || params.properties.mirror === 'both') {
            draw_element( Object.assign({}, options, {mirror_x: true}) );
        }
        if (params.properties.mirror === 'y' || params.properties.mirror === 'both') {
            draw_element( Object.assign({}, options, {mirror_y: true}) );
        }
        if (params.properties.mirror === 'diag' || params.properties.mirror === 'both') {
            draw_element( Object.assign({}, options, {mirror_x: true, mirror_y: true}) );
        }
    }
    
    // recursively draw all children
    if (max_depth != null && node.depth == max_depth) return;
    let x = box[0], y = box[1];
    for (const child of node.children) {
        if (dir) {
            let w = box[2] * child.fraction;
            let h = box[3];
            draw_recursive( child, max_depth, [x, y, w, h], params.general.split_alternate ? !dir : dir );
            x += w;
        } else {
            let w = box[2];
            let h = box[3] * child.fraction;
            draw_recursive( child, max_depth, [x, y, w, h], params.general.split_alternate ? !dir : dir );
            y += h;
        }
    }
}



// create an array of colors according to the color.* parameters
function make_colors(num, seed = 0) {
    randomSeed(seed);
    let out = [];
    
    // the three colors to be used
    const fill_color = util.set_alpha( params.color.fill, params.color.fill_opacity * 255);
    const fillbw_color = util.set_alpha( params.color.fillbw, params.color.fillbw_opacity * 255);
    const nofill_color = util.set_alpha( params.color.nofill, params.color.nofill_opacity * 255);
    fill_color.type = 'fill';
    fillbw_color.type = 'fillbw';
    nofill_color.type = 'nofill';
    
    // number of filled colors
    const n_filled = ceil(num * params.properties.filled); // round up, so there is minimum 1 filled object, if properties.filled > 0
    // number of filled and colored
    const n_colored = ceil(n_filled * params.properties.colored);
    
    // generate colors
    for (let i=0; i < num; i++) {
        if (i < n_filled) {
            // filled
            if (i < n_colored) {
                let col = util.vary_color( fill_color, params.color.shading.fill_h, params.color.shading.fill_s, params.color.shading.fill_l, params.color.shading.fill_a, true );
                out.push( col );
            } else {
                out.push( fillbw_color );
            }
        } else { 
            // not filled
            out.push( nofill_color );
        };
    }
    
    out = util.shuffle(out);
    
    return out;
}


// create an array of form strings according to the properties.form parameter
function make_forms(num, seed = 0) {
    const forms = ['pony_quad', 'ellipse'];
    let out = [];
    const n = int(num * params.properties.round);
    for (let i=0; i < num; i++) {
        if (i < n) { 
          out.push(forms[1]);
        } else { 
          out.push(forms[0]);
        };
    }
    randomSeed(seed);
    out = util.shuffle(out);
    if (num > 0 && params.properties.root_round_chance > 0) {
        if (random() < params.properties.root_round_chance) { 
            out[0] = forms[1];
        }
    }
    return out;
}


function make_stroked(num, seed = 0) {
    let out = [];
    const n = int(num * params.color.fill_stroked);
    for (let i=0; i < num; i++) {
        if (i < n) out.push(true);
        else out.push(false);
    }
    randomSeed(seed);
    out = util.shuffle(out);
    return out;
}


function pony_quad(x, y, w, h, inset_top=0.06, inset_right=0.04125) {
    quad(
        x, y + inset_top * h, // top left
        x + w, y, // top right
        x + w - inset_right * w, y + h, // bottom right
        x, y + h // bottom left
    );
}

function draw() {
    background(params.color.bg);
    if (!d_edna) return;
    if (!d_weather) return;
    
    // TODO: do this only when data selection changes (edna_root_idx, edna_depth, path_to_root)
    // get edna data
    const sample_idx = params.properties.edna_sample_idx;
    const edna = d_edna[sample_idx]; // get current sample
    const new_root_idx = edna.edna_sorted[params.properties.edna_sorted_idx]?.index;
    // let new_root = edna.root.find_index(params.properties.edna_root_idx);
    let new_root = edna.root.find_index(new_root_idx);
    if (new_root !== undefined) { current_root = new_root; }
    if (!current_root) return;
    
    const count = current_root.count( current_root.depth + params.properties.edna_depth );
    const path_to_root_count = params.properties.path_to_root ? current_root.ancestors().length : 0;
    const draw_count = count + path_to_root_count;
    const edna_path = '/' + current_root.key_path().join('/');
    const max_depth = current_root.max_depth(current_root.depth + params.properties.edna_depth)
    // gui.get('info', 'seq_no').setValue(propman.seq_no);
    // gui.get('info', 'edna_sorted_idx').setValue(params.properties.edna_sorted_idx);
    gui.get('info', 'total').setValue(propman.seq_count);
    gui.get('info', 'edna_root_idx').setValue(current_root.index);
    gui.get('info', 'edna_root').setValue(edna_path);
    gui.get('info', 'edna_nodes').setValue(draw_count);
    gui.get('info', 'edna_fraction').setValue(current_root.fraction_total);
    gui.get('info', 'edna_sequences').setValue(current_root.value);
    gui.get('info', 'edna_start_depth').setValue(current_root.depth);
    gui.get('info', 'edna_end_depth').setValue(max_depth);
    
    // get weather data
    current_weather = get_weather(sample_idx, params.properties.weather_idx);
    gui.get('info', 'weather_ts_iso').setValue(current_weather.dt_iso);
    gui.get('info', 'weather_temp').setValue(current_weather.temp);
    gui.get('info', 'weather_wind_dir').setValue(current_weather.wind_deg);
    
    // set nft metadata
    gui.get('_nft_metadata', '_category_name').setValue(propman.set_name);
    gui.get('_nft_metadata', '_category_no').setValue(propman.set_idx + 1);
    gui.get('_nft_metadata', 'No.').setValue(propman.seq_no);
    // gui.get('_nft_metadata', 'Category').setValue(propman.set_name);
    gui.get('_nft_metadata', 'eDNA Target').setValue(edna_path);
    gui.get('_nft_metadata', 'eDNA Sequences').setValue(current_root.value);
    gui.get('_nft_metadata', 'eDNA Fraction (%)').setValue((current_root.fraction_total * 100).toFixed(2));
    gui.get('_nft_metadata', 'Sample').setValue(config.edna_samples_info[sample_idx].name);
    gui.get('_nft_metadata', 'Geolocation (Lat, Lon)').setValue(config.edna_samples_info[sample_idx].geolocation);
    gui.get('_nft_metadata', 'Timestamp').setValue(current_weather.dt_iso);
    gui.get('_nft_metadata', 'Temperature (°C)').setValue(current_weather.temp);
    gui.get('_nft_metadata', 'Wind Direction').setValue(current_weather.wind_deg);
    const soil = soil_data[sample_idx];
    for ( let key of Object.keys(soil).filter( k => !k.startsWith('_') )) {
        gui.get('_nft_metadata', key).setValue(soil[key]);
    }
    const edna_path_obj = data.edna_path_to_obj(edna_path);
    for ( let [key, val] of Object.entries(edna_path_obj) ) {
        // let controller = gui.get('_nft_metadata', '_edna_target', key)
        // console.log(controller);
        // noLoop();
        gui.get('_nft_metadata', '_edna_target', key).setValue(val);
    }
    
    // determine element rendering properties
    el.idx = 0;
    el.count = draw_count; // total number of elements to draw (unused)
    el.colors = make_colors(draw_count, params.general.fill_seed);
    el.forms = make_forms(draw_count, params.general.form_seed);
    el.stroked = make_stroked(draw_count, params.general.stroked_seed);

    stroke(params.color.stroke);
    fill('#fafafa');
    
    // bee position (need to be set before drawing elements)
    update_bee();
    
    // draw
    push();
    // global transformation
    
    translate(width/2, height/2);
    
    // translate(params.global.tx, params.global.ty);
    // scale(params.global.s, params.global.s);
    // rotate(params.global.r / 360 * TWO_PI);
    // draw root element (recursive)
    draw_recursive(
        edna.root,
        max_depth,
        [ -params.element.w/2, -params.element.h/2, params.element.w, params.element.h ],
        params.general.split_dir
    );
    pop();
    
    // draw bee
    if (params.bee.trail && (params.bee.indicator || params.properties.bee_visible) ) { draw_trail(); }
    if (params.bee.indicator) {
        draw_indicator(bee.x, bee.y);
    } else if (params.properties.bee_visible) {
        draw_bee();
    } 
    if (params.properties.bee_visible && params.bee.mouse) {
        noCursor();
    } else {
        cursor();
    }
    
    renderer.update(drawingContext.canvas);
    animator.step();
    if (!animator.started) { animator.update(); } // update in any case; fixes GUI changes of animated properties (e.g. el.r, el.s)
}

util.register_global({setup, draw});


async function render() {
    if (renderer.running) { 
        renderer.stop();
        return;
    }
    gui.lock();
    const anim_frames = !params.render.animation ? 0 : params.render.animation_frames;
    if (params.render.scope === 'current_set') {
        await renderer.render_set(propman.set_name, params.render.limit, anim_frames);
    } else if (params.render.scope === 'all_sets') {
        await renderer.render_all_sets(params.render.limit, anim_frames);
    } else if (params.render.scope === 'seq_range') {
        await renderer.render_range(params.render.seq_range_from, params.render.seq_range_to, params.render.limit, anim_frames);
    } else if (params.render.scope === 'seq_list') {
        let list = params.render.seq_list.split(/[ ,]/).map(x => x.trim()).filter(x => x != '').map(x => Number.parseInt(x)).filter(x => !Number.isNaN(x));
        await renderer.render_list(list, params.render.limit, anim_frames);
    }
    gui.lock(false);
    if (config.noloop_after_render) {
        noLoop();
        setTimeout(() => {
            alert('Rendering finished. Sleeping...');
            loop();
        });
    }
}


document.addEventListener('keydown', e => {
    // console.log(e.key, e.keyCode, e);
    
    // SHIFT-R
    if (e.key === 'R' && !e.ctrlKey && !e.metaKey ) {
        render();
    }
    
    if (renderer.running) { 
        return; 
    }
    
    // following commands disabled during rendering
   
    if (e.key == 'f') { // f .. fullscreen
        util.toggle_fullscreen();
    }
    
    else if (e.key == 's') { // s .. save frame
        util.save_canvas( params );
    }
    
    else if (e.key == 'h') { // h .. toggle gui
        gui.show(gui._hidden);
    }
    
    else if (e.key == 't') { // t .. toggle bee's trail
        gui.get('bee', 'trail').setValue(!params.bee.trail);
    }
    
    else if (e.key == 'b') { // b .. toggle bee
        gui.get('properties', 'bee_visible').setValue(!params.properties.bee_visible);
    }
    
    else if (e.key == 'i') { // i .. toggle indicator
        gui.get('bee', 'indicator').setValue(!params.bee.indicator);
    }
    
    else if (e.key === 'ArrowUp') {
        // propman.step(+1);
        propman.step_seq_no(+1);
    }
    
    else if (e.key === 'ArrowDown') {
        // propman.step(-1);
        propman.step_seq_no(-1);
    }
    
    else if (e.key === ' ') {
        animator?.toggle();
    }
    
    else if (e.key === 'Backspace') {
        animator?.reset();
        clear_trail();
    }

});
