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
import { config, params } from './params.js';
import properties from './properties.js';
import * as animation from './animation.js';

let gui;
let img_bee, bee_px, bee_py, bee_dirx = -1, bee_accx = 0, bee_r = 0, bee_x, bee_y;
// const bee = { x:null, y:null, px:null, py:null, dirx:-1, accx:0, r:0 };

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
    
    createCanvas(config.W, config.H);
    pixelDensity(1);
    frameRate(config.FPS);
    
    // gui
    gui = new lil.GUI;
    gui.addAll(params);
    gui.get('global')?.close();
    gui.get('color').close();
    gui.get('_nft_metadata').close();
    
    gui.get('prop_sets', 'set').options( Object.keys(properties) ).onChange( set_name => {
        propman.select(set_name, 0);
    });
    gui.get('prop_sets', 'idx').onChange( idx => {
        propman.select(params.prop_sets.set, idx);
    });
    
    // animation setup
    // [dest_obj, dest_prop, src_obj, src_prop, anim_fn, param_obj, param_props ]
    animator = animation.make_animator([
        [ animated, 'el_s', params, 'element.s', 'sin_osc', [params.animation, 'el_s_period', 'el_s_amp', 'el_s_phase'] ],
        [ animated, 'el_r', params, 'element.r', 'sin_osc', [params.animation, 'el_r_period', 'el_r_amp', 'el_r_phase'] ],
        [ animated, 'bee_anim_x', null, null, 'sin_osc', [params.animation, 'bee_x_period', 'bee_x_amp', 'bee_x_phase'] ],
        [ animated, 'bee_anim_y', null, null, 'sin_osc', [params.animation, 'bee_y_period', 'bee_y_amp', 'bee_y_phase'] ],
        [ animated, 'bee_anim_a', null, null, 'sin_osc', [params.animation, 'bee_a_period', 'bee_a_amp', 'bee_a_phase'] ],
        [ animated, 'bee_anim_r', null, null, 'sin_osc', [params.animation, 'bee_r_period', 'bee_r_amp', 'bee_r_phase'] ],
    ]);
    gui.get('animation').add(animator, 'toggle' ).name('start/stop');
    gui.get('animation').add(animator, 'reset' );
    gui.get('render').addFunction(render).name('render');
    
    // assets
    // img_bee = loadImage('./assets/bee_center.png');
    img_bee = loadImage('./assets/bee_b_on_y.svg');
    
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
    propman = propgen.make_prop_set_manager(properties, params, on_prop_set_select);
    window.propman = propman;
    
    // renderer
    renderer.init(propman, animator);
}

function on_prop_set_select(propman) {
    params.prop_sets.set = propman.set_name;
    params.prop_sets.idx = propman.idx;
    params.info.seq_no = propman.seq_no;
    gui.updateDisplay();
    animator.update();
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

function draw_bee(x, y) {
    // x direction flipping
    let dx = x - bee_px; // delta x, since last frame (>0 rightwards movement, <0 leftwards movement)
    if (dx) bee_accx += dx;
    // console.log(bee_accx);
    if (abs(bee_accx) > 10) {
        if (Math.sign(bee_accx) !== Math.sign(bee_dirx)) bee_dirx = -bee_dirx;
        bee_accx = 0;
    }
    
    // rotation based on heading direction
    let a = atan2(y-bee_py, x-bee_px) / TWO_PI * 360;
    // treat angles so we get deviation from horizontal axis (pos: tilt down, neg: tilt up)
    if (a > 90) { a = 180 - a; } 
    else if (a < -90) { a = -180 - a; }
    if (a) bee_r = constrain( (bee_r*0.9 + a*0.1), -20, 20 );
    
    push();
    translate(x, y);
    rotate(bee_r/360*TWO_PI * Math.sign(bee_dirx));
    if (bee_dirx > 0) scale(-1, 1);
    // if (params.bee.bg) {
    //     fill(params.color.bg);
    //     noStroke();
    //     ellipse(0, 0, params.bee.size * 1.42, params.bee.size * 1.42);
    // }
    noTint();
    image(img_bee, -params.bee.size/2, -params.bee.size/2, params.bee.size, params.bee.size);
    pop();
    
    bee_px = x;
    bee_py = y;
}

function draw_indicator(x, y) {
    push();
    noStroke();
    fill(params.color.bg);
    ellipse(x, y, params.bee.size * 0.5, params.bee.size * 0.5)
    fill(params.color.fillbw);
    ellipse(x, y, params.bee.size * 0.5 * 0.9, params.bee.size * 0.5 * 0.9)
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
    
    let d = displace_by_distance(width/2 + options.cx, height/2 + options.cy, bee_x, bee_y);
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
            params.quad_inset_top, params.quad_inset_right
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
            draw_recursive( child, max_depth, [x, y, w, h], params.rect_split_alternate ? !dir : dir );
            x += w;
        } else {
            let w = box[2];
            let h = box[3] * child.fraction;
            draw_recursive( child, max_depth, [x, y, w, h], params.rect_split_alternate ? !dir : dir );
            y += h;
        }
    }
}



// create an array of colors according to the color.* parameters
function make_colors(num, seed = 0) {
    if (seed !== 0) { randomSeed(seed); }
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
    const n = int(num * params.properties.form);
    for (let i=0; i < num; i++) {
        if (i < n) { 
          out.push(forms[1]);
        } else { 
          out.push(forms[0]);
        };
    }
    if (seed !== 0) {
        randomSeed(seed);
        out = util.shuffle(out);
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
    if (seed !== 0) {
        randomSeed(seed);
        out = util.shuffle(out);
    }
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
    if (!d_edna) {
        console.log('no edna');
        return;
    }
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
    gui.get('info', 'edna_root').setValue(edna_path);
    gui.get('info', 'edna_nodes').setValue(draw_count);
    gui.get('info', 'edna_start_depth').setValue(current_root.depth);
    gui.get('info', 'edna_end_depth').setValue(max_depth);
    gui.get('info', 'edna_root_idx').setValue(current_root.index);
    gui.get('info', 'edna_fraction').setValue(current_root.fraction_total);
    gui.get('info', 'edna_sequences').setValue(current_root.value);
    
    // get weather data
    current_weather = get_weather(sample_idx, params.properties.weather_idx);
    gui.get('info', 'weather_ts_iso').setValue(current_weather.dt_iso);
    gui.get('info', 'weather_temp').setValue(current_weather.temp);
    gui.get('info', 'weather_wind_dir').setValue(current_weather.wind_deg);
    
    // set nft metadata
    gui.get('_nft_metadata', 'no').setValue(propman.seq_no);
    gui.get('_nft_metadata', 'category').setValue(propman.set_idx + 1);
    gui.get('_nft_metadata', 'category_name').setValue(propman.set_name);
    gui.get('_nft_metadata', 'edna_subtree').setValue(edna_path);
    gui.get('_nft_metadata', 'edna_sequences').setValue(current_root.value);
    gui.get('_nft_metadata', 'edna_fraction').setValue(current_root.fraction_total);
    gui.get('_nft_metadata', 'sample').setValue(config.edna_samples_info[sample_idx].name);
    gui.get('_nft_metadata', 'geolocation_lat_lon').setValue(config.edna_samples_info[sample_idx].geolocation);
    gui.get('_nft_metadata', 'timestamp_utc').setValue(current_weather.dt_iso);
    gui.get('_nft_metadata', 'temp_celsius').setValue(current_weather.temp);
    gui.get('_nft_metadata', 'wind_dir_deg').setValue(current_weather.wind_deg);
    
    // determine element rendering properties
    el.idx = 0;
    el.count = draw_count; // total number of elements to draw (unused)
    el.colors = make_colors(draw_count, params.fill_seed);
    el.forms = make_forms(draw_count, params.form_seed);
    el.stroked = make_stroked(draw_count, params.stroked_seed);

    stroke(params.color.stroke);
    fill('#fafafa');
    
    // bee position (need to be set before drawing elements)
    if (params.bee.mouse) {
        bee_x = mouseX;
        bee_y = mouseY;
    } else {
        let temp = current_weather.temp;
        let disturbance_intensity = constrain( map(temp, -5, 30, -0.5, 1.0), -0.5, 1.0 );
        if (params.bee.displace_by_temp) {
            gui.get('properties', 'disturbance_intensity').setValue(disturbance_intensity);
        }
        if (params.bee.displace_by_wind) {
            gui.get('properties', 'disturbance_pos_a').setValue(current_weather.wind_deg);
        }
        bee_x = width/2 + params.properties.disturbance_pos_r * width/2 * cos( (params.properties.disturbance_pos_a-90) / 360 * TWO_PI );
        bee_y = height/2 + params.properties.disturbance_pos_r * width/2 * sin( (params.properties.disturbance_pos_a-90) / 360 * TWO_PI );
        if (params.animation.bee_anim) {
            if (params.animation.bee_anim_type === 'polar') {
                bee_x += animated.bee_anim_r * cos(animated.bee_anim_a / 360 * TWO_PI);
                bee_y += animated.bee_anim_r * sin(animated.bee_anim_a / 360 * TWO_PI);
            } else if (params.animation.bee_anim_type === 'polar2') {
                bee_x = width/2 + (params.properties.disturbance_pos_r * width/2 + animated.bee_anim_r) * cos( (params.properties.disturbance_pos_a-90 + animated.bee_anim_a) / 360 * TWO_PI );
                bee_y = height/2 + (params.properties.disturbance_pos_r * width/2 + animated.bee_anim_r) * sin( (params.properties.disturbance_pos_a-90 + animated.bee_anim_a) / 360 * TWO_PI );
            } else {
                bee_x += animated.bee_anim_x;
                bee_y += animated.bee_anim_y;
            }
        }
    }
    
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
        params.rect_split_dir
    );
    pop();
    
    // draw bee
    if (params.bee.indicator) {
        draw_indicator(bee_x, bee_y);
    } else if (params.properties.bee_visible) {
        draw_bee(bee_x, bee_y);
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
    const anim_frames = !params.render.animation ? 0 : params.render.animation_frames;
    if (params.render.scope === 'current_set') {
        renderer.render_set(propman.set_name, params.render.limit, anim_frames);
    } else if (params.render.scope === 'all_sets') {
        renderer.render_all_sets(params.render.limit, anim_frames);
    } else if (params.render.scope === 'seq_range') {
        renderer.render_range(params.render.seq_range_from, params.render.seq_range_to, params.render.limit, anim_frames);
    }
}

document.addEventListener('keydown', e => {
    // console.log(e.key, e.keyCode, e);
    
    if (e.key == 'f') { // f .. fullscreen
        util.toggle_fullscreen();
    }
    
    else if (e.key == 's') { // s .. save frame
        util.save_canvas( params );
    }
    
    else if (e.key == 'h') { // h .. toggle gui
        gui.show(gui._hidden);
    }
    
    else if (e.key === 'ArrowUp') {
        propman.step(+1);
    }
    
    else if (e.key === 'ArrowDown') {
        propman.step(-1);
    }
    
    else if (e.key === ' ') {
        animator?.toggle();
    }
    
    else if (e.key === 'Backspace') {
        animator?.reset();
    }
    
    else if (e.key == 'r') {
        render();
    }
});
