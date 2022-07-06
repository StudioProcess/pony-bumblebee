const config = {
    W: 3840,
    H: 3840,
    FPS: 30,
    // edna_data_file: './data/2022-03-14 TestFile_KronaChart_SkriptReadIn - TestFile_KronaChart_SkriptReadIn.csv',
    // edna_sample: 'Test',
    edna_data_file: './data/2022-06-15 IA-2022-04 Complete.csv',
    edna_samples: ['IA-2022-04_01', 'IA-2022-04_02'],
    edna_samples_info: [
        { name: 'PONY Field', geolocation: '48.93035, 15.26854' },
        { name: 'PONY Garden', geolocation: '48.93031, 15.26797' },
    ],
    // edna_min_sequences: 25,
    edna_top_sequences: 400,
    edna_fraction_min: 0.005,
    edna_fraction_count: 0,
    // weather_data_file: './data/2022-03-28 OpenWeather PONY Garden 1y.csv',
    weather_data_file: './data/2022-06-23 openweathermap_final_1y.csv',
    weather_samples: ['PONY Field', 'PONY Garden'],
    bee_filter_size: 5,
    initial_seq_no: 20,
    rendering_use_folders: true,
    rendering_folders: {
        images: 'images',
        frames: 'frames',
        metadata: 'metadata',
    },
    noloop_after_render: true,
};

const soil_data = [
    { _sample: 'PONY Field', 'Humus (Organic Matter)': 3.4, 'Calcium (Ca)': 1605, 'Magnesium (Mg)': 235, 'Potassium (K)': 570, 'Phosphor (P)': 20, 'Nitrogen (N)': 13.5, 'Sulfate (SO4)': 22.6, 'Iron (Fe)': 1.8, 'Manganese (Mn)': 0.32, 'Copper (Cu)': 0.14, 'Zinc (Zn)': 0.02, 'Molybdenum (Mo)': 0, 'Boron (B)': 0.1, 'Silicon (Si)': 20.5, 'Cobalt (Co)': 0.003 },
    { _sample: 'PONY Garden', 'Humus (Organic Matter)': 3.8, 'Calcium (Ca)': 1755, 'Magnesium (Mg)': 210, 'Potassium (K)': 600, 'Phosphor (P)': 20, 'Nitrogen (N)': 9.5, 'Sulfate (SO4)': 18.6, 'Iron (Fe)': 4.4, 'Manganese (Mn)': 2.07, 'Copper (Cu)': 0.14, 'Zinc (Zn)': 0.03, 'Molybdenum (Mo)': 0, 'Boron (B)': 0.14, 'Silicon (Si)': 19.3, 'Cobalt (Co)': 0.004 },
];

const params = {
    _nft_metadata: {
        'No.': -1,
        // category: -1,
        'Category': '',
        'eDNA Target': '',
        'eDNA Sequences': -1,
        'eDNA Fraction (%)': -1,
        'Sample': '',
        'Geolocation (Lat, Lon)': '',
        'Timestamp': '',
        'Temperature (°C)': -1,
        'Wind Direction': -1,
        'Humus (Organic Matter)': -1,
        'Calcium (Ca)': -1,
        'Magnesium (Mg)': -1,
        'Potassium (K)': -1,
        'Phosphor (P)': -1,
        'Nitrogen (N)': -1,
        'Sulfate (SO4)': -1,
        'Iron (Fe)': -1,
        'Manganese (Mn)': -1,
        'Copper (Cu)': -1,
        'Zinc (Zn)': -1,
        'Molybdenum (Mo)': -1,
        'Boron (B)': -1,
        'Silicon (Si)': -1,
        'Cobalt (Co)': -1,
    },
    prop_sets: {
        set: [null, [null]], // this makes an empty dropdown
        seq_no: [1, 1, undefined, 1],
        idx: [0, 0, undefined, 1],
    },
    info: {
        // seq_no: '',
        // edna_sorted_idx: '',
        total: '',
        edna_root_idx: '',
        edna_root: '',
        edna_nodes: '',
        edna_fraction: '',
        edna_sequences: '',
        edna_start_depth: '',
        edna_end_depth: '',
        weather_ts_iso: '',
        weather_temp: '',
        weather_wind_dir: '',
        bee_rx: '',
        bee_ry: '',
    },
    // global: {
    //     tx: 0,
    //     ty: 0,
    //     s: [1, 0.01, undefined, 0.01],
    //     r: [0, -180, 180, 0.1],
    // },
    properties: {
        edna_sample_idx: [0, 0, 1, 1],
        edna_sorted_idx: [0, 0, undefined, 1],
        // edna_root_idx: [0, 0, undefined, 1],
        edna_depth: [7, 0, 7, 1],
        weather_idx: 0,
        filled: [0.5, 0, 1, 0.01],
        colored: [1.0, 0, 1, 0.01], // proportion of filled
        form: [1, 0, 1, 0.01],
        disturbance_pos_a: [0, 0, 360, 0.01],
        disturbance_pos_r: [0.5, 0.01, 1, 0.01],
        disturbance_intensity: [0.5, -1, 1, 0.01],
        bee_visible: true,
        mirror: ['none', ['none', 'x', 'y', 'diag', 'both']],
        path_to_root: true,
    },
    element: {
       w: 1500,
       h: 1500,
       s: [1, 0.01, undefined, 0.01],
       r: [0, -180, 180, 0.1], 
    },
    depth: {
        tx: 100,
        ty: 100,
        s: [1, 0.01, undefined, 0.01],
        r: [0, -180, 180, 0.1],
    },
    color: {
        fill: '#febe00',
        fill_opacity: [1, 0, 1, 0.01],
        fillbw: '#000',
        fillbw_opacity: [1, 0, 1, 0.01],
        nofill: '#fff',
        nofill_opacity: [0, 0, 1, 0.01],
        stroke: '#000',
        fill_stroke: [1, 0, undefined, 0.01],
        nofill_stroke: [1.2, 0, undefined, 0.1],
        fill_stroked: [0.20, 0, 1, 0.01],
        force_root_fillstroke: ['force_off', ['none', 'force_on', 'force_off']],
        bg: '#fef9ea',
        shading: {
            fill_h: [3.33, undefined, undefined, 0.01],
            fill_s: [0, undefined, undefined, 0.01],
            fill_l: [0, undefined, undefined, 0.01],
            fill_a: [0.15, undefined, undefined, 0.01],
        }
    },
    bee: {
        displace_enabled: true,
        displace_radius: 500,
        displace_strength: 20,
        displace_mirror: false,
        mouse: false,
        size: 200,
        displace_by_temp: true,
        displace_by_wind: true,
        indicator: false,
        trail: false,
        limit_tilt: false,
    },
    animation: {
        el_s_period: 300,
        el_s_amp: 0.1,
        el_s_phase: 0,
        el_r_period: 150,
        el_r_amp: 3,
        el_r_phase: 0,
        bee_anim: true,
        bee_anim_type: ['ellipse', ['ellipse', 'eight', 'double-loop', 'loop', 'tri']],
        bee_rotation: [0, 0, 360, 1],
        bee_flip_dir: false,
        bee_rx: 500,
        bee_ry: 250,
        bee_limit_r: true,
        bee_rmin: [450, 0],
        bee_rmax: [800, 0],
        bee_period: 300,
        bee_phase: 0,
        bee_noise: true,
        bee_noise_amp: 60,
        bee_noise_scale: 2,
        bee_noise_octs: 1,
        bee_noise_adjust: -0.25,
        bee_noise_seed: 0,
    },
    render: {
        scope: [ 'seq_list', ['current_set', 'all_sets', 'seq_range', 'seq_list']],
        limit: [100, 0, undefined],
        seq_range_from: [1, 1, undefined],
        seq_range_to: [10, 1, undefined],
        seq_list: '20, 30, 40',
        animation: true,
        animation_frames: 300,
    },
    fill_seed: 1,
    form_seed: 1,
    stroked_seed: 1,
    quad_inset_top: [0.06, undefined, undefined, 0.001],
    quad_inset_right: [0.04125, undefined, undefined, 0.001],
    rect_split_dir: ['horizontal', { horizontal:true, vertical:false }],
    rect_split_alternate: true,
    max_depth: [7,  0, 7, 1],
    // bbox: true,
};

export { config, params, soil_data };