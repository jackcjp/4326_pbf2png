const fs = require('fs')

const mbgl = require('@mapbox/mapbox-gl-native');
const sharp = require('sharp');
const zlib = require('zlib');



// const data = fs.readFileSync('168.pbf')
// const z =10,  x =861, y =168
const data = fs.readFileSync('340.pbf')
// const z =10,  x =1723, y =340
const z =9,  x =1723, y =340

let topRightCorner = [-90.0, -180.0];


const tileSize = 256,
    bearing = 0,
    pitch = 0,
    ratio = 1;


const scaleDenominator_dic = {
    '0': 279541132.014358,
    '1': 139770566.007179,
    '2': 69885283.0035897,
    '3': 34942641.5017948,
    '4': 17471320.7508974,
    '5': 8735660.37544871,
    '6': 4367830.18772435,
    '7': 2183915.09386217,
    '8': 1091957.54693108,
    '9': 545978.773465544,
    '10': 272989.386732772,
    '11': 136494.693366386,
    '12': 68247.346683193,
    '13': 34123.6733415964,
    '14': 17061.8366707982,
    '15': 8530.91833539913,
    '16': 4265.45916769956,
    '17': 2132.72958384978
};


let truncate_lnglat = function(lng, lat) {
    if (lng > 180.0) {
        lng = 180.0
    }
    else if (lng < -180.0) {
        lng = -180.0
    }
    if (lat > 90.0) {
        lat = 90.0
    }
    else if (lat < -90.0) {
        lat = -90.0
    }
    return [lng, lat];
}

let changeColorAndFormat = function(zoom, x, y, lon, lat, tileData) {
    try {
        const options = {
            mode: "tile",
            request: function(req, callback) {
                callback(null, { data: zlib.unzipSync(tileData) });
            },
            ratio
        };
        console.log('options', options);
        const map = new mbgl.Map(options);
        map.load(require('./style/fixtures/style.json'));

        const params = {
            zoom: zoom,
            center: [lon, lat],
            bearing,
            pitch,
            width: tileSize * 2,
            height: tileSize * 2
        };

        console.log('options22222', params);
        return new Promise((resolve, reject) => {
            map.render(params, async function(error, buffer) {
                if (error) {
                    console.error(error);
                    reject(error);
                }
                map.release();
                const image = sharp(buffer, {
                    raw: {
                        width: params.width,
                        height: params.width,
                        channels: 4
                    }
                });
                return image.resize(tileSize, tileSize).toFormat(sharp.format.png).toBuffer()
                .then(data => { resolve({'zoom_level':zoom, 'tile_column':x ,'tile_row':y, 'tile_data': data}) })
                .catch( err => { 
                    console.err(err);
                    reject(err); 
                });
            });
        });
    } catch(err) {
        console.log('change color and format err:', err);
    }
}
let ul = function(z, x, y, curCorner) {
    let scaleDenominator = scaleDenominator_dic[(z).toString()];
    let res = scaleDenominator * 0.00028 / (2 * Math.PI * 6378137 / 360.0);  //计算完跟4326度为单位的分辨率一样https://file.geovisearth.com/worldL8ok1_fill_4326_0_18/tilemapresource.xml
    let origin_x = curCorner ? curCorner[1] : topRightCorner[1];
    let origin_y = curCorner ? curCorner[0] : topRightCorner[0];
    let lon = origin_x + x * res * tileSize;
    let lat = origin_y - y * res * tileSize;
    return [lon, lat];
}
let calCenter = function(z, x, y) {
    let lt = ul(z, x, y);
    let left = lt[0], top = lt[1];
    let rb = ul(z, x + 1, y + 1);
    let right = rb[0], bottom = rb[1];
    let curCorner = [parseFloat(top.toFixed(20)), parseFloat((-right).toFixed(20))];
    console.log('curCorner', curCorner);
    let center = ul(z, x, y, curCorner);
    return truncate_lnglat.apply(null, center);
}
const aa = async () => {
    const tileCenter = calCenter(z, x, y);
    console.log('bbbbbb', tileCenter)
    console.log('bbbbbb22222222', data)
    console.log('z',z,'x', x, 'y',y, 'topRightCorner',topRightCorner,'tileCenter', tileCenter);
    console.log('z',z,'x', x, 'y',y, 'topRightCorner',topRightCorner,'tileCenter', tileCenter[0].toFixed(20), tileCenter[1].toFixed(20));

    const tile_data = await changeColorAndFormat(z, x, y, tileCenter[0].toFixed(20), tileCenter[1].toFixed(20), data);
    
    console.log('tile_data', tile_data);

    // fs.writeFileSync('/data/168-out.png', tile_data)
    fs.writeFileSync('/data/340-out.png', tile_data.tile_data)
    console.log('finished')
}
aa();
