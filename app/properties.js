export default {
    'I': {
        count: 87,
        props: [
            [ 'properties.weather_idx', 'linear', [0, 86], {overflow: 'clamp'} ],
            [ 'properties.edna_sorted_idx', 'linear', [0, 161], {overflow: 'wrap', offset: 0, repeat: 2} ],
            [ 'properties.edna_sample_idx', 'linear', [0, 1], {overflow: 'wrap', offset: 0} ],
            [ 'properties.filled', 'rnd', [0.8, 1.0] ],
            [ 'properties.colored', 'constant', 0.8 ],
            [ 'properties.form', 'rnd', [0.5, 1.0] ],
            [ 'properties.disturbance_pos_r', 'rnd', [0.001, 0.20] ],
            // [ 'properties.disturbance_pos_a', 'rnd', [0, 360] ],
            [ 'properties.mirror', 'rnd_set', [ 'both' ] ],
            [ 'element.r', 'rnd', [-180, 180] ],
            [ 'depth.r', 'rnd', [-10, 10] ],
            [ 'depth.tx', 'rnd', [-50, 50] ],
            [ 'depth.ty', 'rnd', [-50, 50] ],
            [ 'properties.bee_visible', 'constant', true ],
        ],
    },
    'II': {
        count: 439,
        props: [
            [ 'properties.weather_idx', 'linear', [87, 525], {overflow: 'clamp'} ],
            [ 'properties.edna_sorted_idx', 'linear', [0, 161], {overflow: 'wrap', offset: 0, repeat: 2} ],
            [ 'properties.edna_sample_idx', 'linear', [0, 1], {overflow: 'wrap', offset: 87} ],
            [ 'properties.filled', 'rnd', [0.4, 0.6] ],
            [ 'properties.colored', 'constant', 0.5 ],
            [ 'properties.form', 'rnd', [0.3, 0.5] ],
            [ 'properties.disturbance_pos_r', 'rnd', [0.1, 0.3] ],
            // [ 'properties.disturbance_pos_a', 'rnd', [0, 360] ],
            [ 'properties.mirror', 'rnd_set', [ 'both' ] ],
            [ 'element.r', 'rnd', [-180, 180] ],
            [ 'depth.r', 'rnd', [-10, 10] ],
            [ 'depth.tx', 'rnd', [-50, 50] ],
            [ 'depth.ty', 'rnd', [-50, 50] ],
            [ 'properties.bee_visible', 'constant', false ],
        ],
    },
    'III': {
        count: 1314,
        props: [
            [ 'properties.weather_idx', 'linear', [526, 1839], {overflow: 'clamp'} ],
            [ 'properties.edna_sorted_idx', 'linear', [0, 161], {overflow: 'wrap', offset: 0, repeat: 2} ],
            [ 'properties.edna_sample_idx', 'linear', [0, 1], {overflow: 'wrap', offset: 526} ],
            [ 'properties.filled', 'rnd', [0.15, 0.20] ],
            [ 'properties.colored', 'constant', 0.5 ],
            [ 'properties.form', 'rnd', [0.20, 0.30] ],
            [ 'properties.disturbance_pos_r', 'rnd', [0.4, 0.5] ],
            // [ 'properties.disturbance_pos_a', 'rnd', [0, 360] ],
            [ 'properties.mirror', 'rnd_set', [ 'x', 'y', 'diag', 'both'] ],
            [ 'element.r', 'rnd', [-180, 180] ],
            [ 'depth.r', 'rnd', [-10, 10] ],
            [ 'depth.tx', 'rnd', [-50, 50] ],
            [ 'depth.ty', 'rnd', [-50, 50] ],
            [ 'properties.bee_visible', 'constant', false ],
        ],
    },
    'IV': {
        count: 2978,
        props: [
            [ 'properties.weather_idx', 'linear', [1840, 4817], {overflow: 'clamp'} ],
            [ 'properties.edna_sorted_idx', 'linear', [0, 161], {overflow: 'wrap', offset: 0, repeat: 2} ],
            [ 'properties.edna_sample_idx', 'linear', [0, 1], {overflow: 'wrap', offset: 1840} ],
            [ 'properties.filled', 'constant', 0.10 ],
            [ 'properties.colored', 'constant', 0.30 ],
            [ 'properties.form', 'constant', 0.20 ],
            [ 'properties.disturbance_pos_r', 'rnd', [0.3, 0.5] ],
            // [ 'properties.disturbance_pos_a', 'rnd', [0, 360] ],
            [ 'properties.mirror', 'rnd_set', [ 'x', 'y', 'diag', 'both'] ],
            [ 'element.r', 'rnd', [-180, 180] ],
            [ 'depth.r', 'rnd', [-10, 10] ],
            [ 'depth.tx', 'rnd', [-50, 50] ],
            [ 'depth.ty', 'rnd', [-50, 50] ],
            [ 'properties.bee_visible', 'constant', false ],
        ],
    },
    'V': {
        count: 3942,
        props: [
            [ 'properties.weather_idx', 'linear', [4818, 8759], {overflow: 'clamp'} ],
            [ 'properties.edna_sorted_idx', 'linear', [0, 161], {overflow: 'wrap', offset: 0, repeat: 2} ],
            [ 'properties.edna_sample_idx', 'linear', [0, 1], {overflow: 'wrap', offset: 4818} ],
            [ 'properties.filled', 'constant', 0 ],
            [ 'properties.colored', 'constant', 0 ],
            [ 'properties.form', 'constant', 0 ],
            [ 'properties.disturbance_pos_r', 'rnd', [0.3, 0.5] ],
            // [ 'properties.disturbance_pos_a', 'rnd', [0, 360] ],
            [ 'properties.mirror', 'rnd_set', [ 'x', 'y', 'diag', 'both'] ],
            [ 'element.r', 'rnd', [-180, 180] ],
            [ 'depth.r', 'rnd', [-10, 10] ],
            [ 'depth.tx', 'rnd', [-50, 50] ],
            [ 'depth.ty', 'rnd', [-50, 50] ],
            [ 'properties.bee_visible', 'constant', false ],
        ],
    },
};
