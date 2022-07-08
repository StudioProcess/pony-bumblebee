//
// Specific data loading and processing
// 

import * as util from './util.js';

const LAYER_NAMES = ['kingdom', 'phylum', 'class', 'order', 'family',  'genus', 'species'];


// symmetric log transform
// https://en.wikipedia.org/wiki/Logarithmic_scale#Extensions
export function symlog(x) {
    return Math.sign(x) * Math.log10( 1 + Math.abs(x * Math.LN10) )
}


// simple log transform
// x >= 0
export function log(x) {
    return Math.log10(x + 1);
}


// checks for UID duplicates
export function check_edna_duplicates(data) {
    // check for duplicates
    const found = new Set();
    const duplicates = [];
    for (let row of data) {
        if ( found.has(row.UID) ) {
            const path = '/' + [row.kingdom, row.phylum, row.class, row.order, row.family, row.genus, row.species].join('/');
            duplicates.push([row.UID, path]);
        } else {
            found.add(row.UID);
        }
    }
    if (duplicates.length > 0) {
        console.warn(duplicates.length + ' duplicates found', duplicates);
    }
    return duplicates;
}

// remove path duplicates
export function remove_edna_duplicates(data) {
    const found = new Set();
    const out = [];
    let removed = 0;
    for (let row of data) {
        const path = '/' + [row.kingdom, row.phylum, row.class, row.order, row.family, row.genus, row.species].join('/');
        if ( found.has(path) ) { // duplicate found
            removed += 1;
            // console.log(path);
        } else {
            found.add(path); // remember path
            out.push(row);
        }
    }
    console.log(`    ${removed} duplicate edna rows removed (by path)`);
    return out;
}

export function edna_filter_min_sequences(data, min_sequences = 0) {
    const before = data.length;
    data = data.filter( row => row.Sequences >= min_sequences );
    const removed = before - data.length;
    console.log(`    ${removed} short edna rows removed (< ${min_sequences} sequences)`);
    return data;
}

// A count of Infinity or 0 will not remove anything
export function edna_filter_top_sequences(data, count = Infinity) {
    data = util.sort_objects(data, 'Sequences', true);
    if (count > 0) {
        data = data.slice(0, count);
    }
    return data;
}

// Load eDNA data file (CSV)
// sample: Test|Test_1|Test_2
// Returns: Array of record objects
export async function load_edna(url, sample = 'Test') {
    let data = await util.load_csv(url, {
        cast: x => util.parse_number(x, ','),
        columns: true
    });
    if (sample) {
        data = data.filter( x => x.SampleID == sample );
    }
    
    // hierarchy: kingdom,phylum,class,order,family,genus,species
    return data;
}


function make_node(depth, key) {
    let node = {
        index: -1,
        depth,
        key,
        value: 0,
        children: [],
        parent: 0,
    };
    
    node.key_path = function key_path() {
        if (!node.parent) return [];
        return node.parent.key_path().concat( [key] );
    }
    
    // count nodes up to a certain maximum depth
    // count includes the start node
    node.count = function count( max_depth = Infinity ) {
        if (node.depth > max_depth) return 0;
        let n = 1;
        for (const child of node.children) {
            n += child.count( max_depth );
        }
        return n;
    }
    
    // find max depth 
    node.max_depth = function max_depth( _max_depth = Infinity) {
        if (node.depth === _max_depth) return node.depth;
        let max = node.depth;
        for (const child of node.children) {
            let child_max_depth = child.max_depth(_max_depth);
            if (child_max_depth > max) max = child_max_depth;
        }
        return max;
    }
    
    // find an index starting from this node (included) and down to it's descendents
    node.find_index = function find_index(idx) {
        // console.log(idx, index);
        if (node.index === idx) return node;
        for (let child of node.children) {
            let found = child.find_index(idx);
            if (found !== undefined) return found;
        }
        return undefined;
    }
    
    node.has_descendent_index = function has_descendent_index(idx) {
        const found = node.find_index(idx);
        return found !== undefined;
    }
    
    node.has_ancestor_index = function has_ancestor_index(idx) {
        if (node.index === idx) return true;
        if (!node.parent) return false;
        return node.parent.has_ancestor_index(idx);
    }
    
    // get a list of ancestors of this node 
    node.ancestors = function ancestors() {
        if (!node.parent) return [];
        return node.parent.ancestors().concat( [parent] );
    }
    
    return node;
}

// Construct tree data structure from eDNA records
// Returns: the root node
// Node properties: 
//   key: Linnaean taxonomy name of node, or "root" for the root node
//   value: eDNA sequence count
//   depth: depth within the tree, starting with 0 at the root
//   fraction: fraction relative to parent (value / parent.value)
//   fraction_total: fraction relative to the root (value / root.value)
//   children: array of child nodes
//   parent: parent node or null at the root
//   count(max_depth): count nodes from this one down
// Root node additional properties:
//   get_layer(max_depth): get layer of a certain depth
export function make_edna_tree(data) {
    // key names to the layers from the top down
    const max_depth = LAYER_NAMES.length;
    
    // layer data structure
    // keeps map of key to node for each layer/depth of the tree
    // layers[0]['root'] is the root node
    // Note: removed, because keys were not unique inside the layers (i.e. 'NA')
    //      const layers = [];
    //      for (let i=0; i<max_depth+1; i++) layers.push({});
    
    // node map
    // maps: key path -> node
    // nodes['/'] is the root node
    const nodes = {};
   
    function key_path(line, depth) {
        function key_path(line, depth) { // constructs an array
            if (depth === 0) { return [] };
            const layer_name = LAYER_NAMES[depth-1];
            const key = line[layer_name];
            return key_path(line, depth-1).concat([key]);
        }
        return '/' + key_path(line, depth).join('/');
    }
    
    function process_line(line, depth, child_node = null) {
        // console.log(depth, line);
        const layer_name = LAYER_NAMES[depth-1];
        const key = depth > 0 ? line[layer_name] : 'root';
        /*
        
        let node = layers[depth][key];
        if (node === undefined) {
            // console.log('no node');
            node = make_node(depth, key);
            layers[depth][key] = node;
            console.log('creating node: ', path);
        } else {
            console.log('node already present: ', path);
        }
        */
        
        // console.log(depth, layer_name, key);
        const path = key_path(line, depth);
        
        let node = nodes[path];
        if (node === undefined) {
            node = make_node(depth, key);
            nodes[path] = node;
            // console.log('creating node: ', path);
        } else {
            // console.log('node already present: ', path);
        }
        
        node.value += line.Sequences;
        if (child_node) {
            child_node.parent = node;
            if (! node.children.includes(child_node)) {
                node.children.push(child_node);
            }
        }
        // console.log(node);
        if (depth > 0) { // move up
            process_line(line, depth-1, node);
        }
    }
    
    // construct tree data structure, from the bottom up
    // each line of the data contains a leaf node, and its path to the top
    for (const line of data) {
        process_line(line, max_depth);
        // break;
    }
    
    // const root = layers[0]['root'];
    const root = nodes['/'];
    
    // calculate fractions for a node and its children
    function add_fractions(node) {
        if (node.depth == 0) {
            node.fraction = 1.0;
            node.fraction_total = 1.0;
        } else {
            node.fraction = node.value / node.parent.value;
            node.fraction_total = node.value / root.value;
        }
        for (const child of node.children) {
            add_fractions(child);
        }
    }
    
    add_fractions(root);
    
    // add indices by breadth first traversal
    function add_indices(node, index = 0) {
        let q = [];
        node.index = index;
        index += 1;
        q.push(node);
        while (q.length > 0) {
            let n = q.shift();
            for (const child of n.children) {
                if (child.index === -1) {
                    child.index = index;
                    index += 1;
                    q.push(child);
                }
            }
        }
    }
    
    add_indices(root);
    
    // get layer of a certain depth, starting search at the given node
    function get_layer(start_node, depth = max_depth) {
        let nodes = [];
        if (start_node.depth == depth) {
            nodes.push(start_node);
        } else {
            for (const child of start_node.children) {
                nodes = nodes.concat( get_layer(child, depth) );
            }
        }
        return nodes;
    }
    
    root.get_layer = function(depth) {
        return get_layer(root, depth);
    }
    
    // enumerate all subtrees of a node
    // show some properites of each subtree (i.e. index, count, height, etc.)
    function enumerate_subtrees( start_node ) {
        let list = [{
            index: start_node.index, 
            count: start_node.count(),
            depth: start_node.depth,
            height: start_node.max_depth() - start_node.depth + 1,
            sequences: start_node.value,
            fraction: start_node.fraction_total,
            path: '/' + start_node.key_path().join('/'),
            node: start_node 
        }];
        for (let child of start_node.children) {
            list = list.concat( enumerate_subtrees(child) );
        }
        return list;
    }
    
    root.enumerate_subtrees = function() {
        return enumerate_subtrees(root);
    }
    
    return root;
}

// get list of node indices sorted by node count (descending)
export function edna_sorted_indices(root, min_count = 0) {
    let sub = root.enumerate_subtrees();
    sub = util.sort_objects(sub, 'index', true); // sort by index, descending
    sub = util.sort_objects(sub, 'count', true); // sort by subtree node count, descending
    if (min_count > 0 ) {
       sub = sub.filter(x => x.count >= min_count);
    }
    return sub.map(x => x.index);
}

export function edna_subtrees_sorted(root, sort_by, order = 'descending', min_value = 0, limit = 0) {
    let sub = root.enumerate_subtrees();
    sub = util.sort_objects(sub, 'index', order === 'descending'); // sort by index, descending
    sub = util.sort_objects(sub, sort_by, order === 'descending'); // sort by subtree node count, descending
    if (min_value > 0) {
       sub = sub.filter(x => x[sort_by] >= min_value);
    }
    if (limit > 0) {
        sub = sub.slice(0, limit);
    }
    // add idx_sorted
    for (let [i, node] of sub.entries()) {
        node.idx_sorted = i;
    }
    return sub;
}


// check for duplicate indices
export function check_edna_tree(root) {
    const found = new Set();
    
    function check(node) {
        // console.log(node.index);
        if (found.has(node.index)) {
            // duplicate
            console.log('duplicate idx ' + node.index, '/' + node.key_path().join('/') );
            console.log(node);
        } else {
            found.add(node.index);
        }
        for (let child of node.children) {
            check(child);
        }
    }
    
    check(root);
}


// returns:
// {
//    url,
//    sample,
//    d_edna,
//    root,
//    max_count,
//    edna_sorted
//    csv
// }
export async function load_process_edna(url, sample = 'Test', options = {}) {
    options = Object.assign({}, {
        top_sequences: 0,
        fraction_min: 0,
        fraction_count: 0,
    }, options);
    
    // edna data
    let obj = {
        url,
        sample,
    };
    obj.d_edna = await load_edna(url, sample); // raw csv data
    obj.d_edna = remove_edna_duplicates(obj.d_edna); // remove entries w/same path
    // d_edna = data.edna_filter_min_sequences(d_edna, config.edna_min_sequences);
    obj.d_edna = edna_filter_top_sequences(obj.d_edna, options.top_sequences);
    console.log('    edna rows: %d', obj.d_edna.length);
    obj.root = make_edna_tree(obj.d_edna); // edna root node
    obj.max_count = obj.root.count();
    // console.log(d_edna);
    console.log('    edna root: %o', obj.root);
    console.log('    edna nodes: %d', obj.max_count);
    check_edna_tree(obj.root);
    // edna_sorted = data.edna_sorted_indices(root, 0);
    obj.edna_sorted = edna_subtrees_sorted(obj.root, 'fraction', 'descending', options.fraction_min, options.fraction_count);
    console.log( '    edna nodes (sorted, filtered): %d', obj.edna_sorted.length );
    console.log( '    edna data (sorted, filtered): %o', obj.edna_sorted );
    
    // output node data
    obj.csv = util.objects_to_csv(obj.edna_sorted, ['node']);
    return obj;
}

export function edna_path_to_obj(path) {
    const key_names = LAYER_NAMES.map( (x, i) => (i+1) + '_' + x );
    const obj = Object.fromEntries( key_names.map(x => [x, '*']) );
    path = path.trim();
    if (path.startsWith('/')) { path = path.slice(1); }
    let parts = path.split('/');
    for (let [i, part] of parts.entries()) {
        if (part !== '') {
            obj[ key_names[i] ] = part;
        }
    }
    return obj;
}



export async function load_weather(url, samples = undefined) {
    let data = await util.load_csv(url , {
        cast: x => util.parse_number(x, ','),
        columns: true
    });
    data.forEach( x => {
        x.rain_1h = x.rain_1h == '' ? 0 : x.rain_1h;
        x.rain_3h = x.rain_3h == '' ? 0 : x.rain_3h;
    });
    if ( Array.isArray(samples) ) {
        data = samples.map( sample => data.filter(x => x.city_name === sample) );
    }
    data.forEach( d => fix_temps(d) );
    return data;
}


export function fix_temps(data, temp_min = -50, temp_max = 50) {
    let count = 0;
    for (let [i, row] of data.entries()) {
        if (row.temp < temp_min) {
            if (i !== 0) {
                row.temp = data[i-1].temp; // use previous temp
                count += 1;
            }
        }
    }
    // console.log('    %d out of bounds temps fixed', count);
}


// Simple FIR-Filter
// export function make_filter(length = 8, initial = 0) {
//     let delay_line = new Array(length).fill(initial);
//     let pos = 0;
//     
//     function input(input_value) {
//         delay_line[pos] = input_value;
//         let result = 0;
//         const coeff = 1 / length;
//         let idx = pos;
//         for (let i=0; i<length; i++) {
//             result += coeff * delay_line[idx];
//             idx--;
//             if (idx < 0) idx = length-1;
//         }
//         pos++;
//         if (pos >= length) pos = 0;
//         return result;
//     }
//     
//     return { input };
// }

// Simple FIR-Filter
export function make_filter(length = 8, initial = 0) {
    length = Math.max(1, length); // min length is 1
    let delay_line = new Array(length).fill(initial);
    
    function input(input_value) {
        delay_line.push(input_value); // add to back
        delay_line.shift(); // remove first
        const sum = delay_line.reduce( (acc, val) => acc + val, 0);
        return sum / length;
    }
    
    return { input };
}

export function gauss_kernel(length = 15, sigma = null, normalize = false) {
    if (sigma === undefined || sigma === 0 || sigma === null) {
        sigma = Math.floor(length/2) / 6;
    }
    const kernel = new Array(length);
    let sum = 0;
    const mean = Math.floor(length / 2); // middle index
    for (let x=0; x<length; x++) {
        kernel[x] = exp( - pow(x-mean,2) / (2 * sigma * sigma ) / (Math.sqrt(2 * Math.PI) * sigma));
        sum += kernel[x];
    }
    if (normalize) {
        for (let x=0; x<length; x++) {
            kernel[x] /= sum;
        }
    }
    return kernel;
}

// Simple FIR-Filter
export function make_gauss_filter(length = 5, initial = 0) {
    length = Math.max(3, length); // min length is 3
    const delay_line = new Array(length).fill(initial);
    const coeffs = gauss_kernel(length, null, true);
    
    function input(input_value) {
        delay_line.push(input_value); // add to back
        delay_line.shift(); // remove first
        
        const acc = delay_line.reduce( (acc, val, i) => acc + val*coeffs[i], 0);
        return acc;
    }
    
    return { input };
}