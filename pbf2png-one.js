const fs = require('fs')

const mbgl = require('@mapbox/mapbox-gl-native');
const sharp = require('sharp');
const zlib = require('zlib');
const mercator = new (require('@mapbox/sphericalmercator'))();


// 4326 test
// const data = fs.readFileSync('168.pbf')
// const z =10,  x =861, y =168
// const data = fs.readFileSync('340.pbf')
// // const z =10,  x =1723, y =340
// const z = 9, x = 1723, y = 340

// 3857 test
// const data = fs.readFileSync('./pbf/0_0_0.pbf')
// const z = 0, x = 0, y = 0

// const data = fs.readFileSync('./pbf/1_0_0.pbf')
// const z = 1, x = 0, y = 0
// const data = fs.readFileSync('./pbf/5_26_12.pbf')
// const z = 5, x = 26, y = 12
// const data = fs.readFileSync('/data/pbf/7_105_57.pbf')
// let z = 7, x = 105, y = 57
const data = fs.readFileSync('/data/pbf/1-0-1.pbf')
let z = 1, x = 0, y = 1
// const data = fs.readFileSync('./pbf/6_53_24.pbf')
// const z = 6, x = 53, y = 24

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


let truncate_lnglat = function (lng, lat) {
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

let changeColorAndFormat = function (zoom, x, y, lon, lat, tileData) {
    try {
        const options = {
            mode: "tile",
            request: function ({ }, callback) {
                // 3857的pbf 读本地pbf不需要unzipSync, 可能读mbtiles文件需要unzipSync（待验证）
                callback(null, { data: tileData });
                // callback(null, { data: zlib.unzipSync(tileData) });
            },
            ratio
        };
        console.log('options', options);
        const map = new mbgl.Map(options);
        // map.load(require('/data/0-12-style-up.json'));
        map.load(require('/data/style.json'));

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
            map.render(params, async function (error, buffer) {
                if (error) {
                    console.error(error);
                    reject(error);
                }
                map.release();

                // Fix semi-transparent outlines on raw, premultiplied input
                // https://github.com/maptiler/tileserver-gl/issues/350#issuecomment-477857040
                for (var i = 0; i < buffer.length; i += 4) {
                    var alpha = buffer[i + 3];
                    var norm = alpha / 255;
                    if (alpha === 0) {
                        buffer[i] = 0;
                        buffer[i + 1] = 0;
                        buffer[i + 2] = 0;
                    } else {
                        buffer[i] = buffer[i] / norm;
                        buffer[i + 1] = buffer[i + 1] / norm;
                        buffer[i + 2] = buffer[i + 2] / norm;
                    }
                }
                const image = sharp(buffer, {
                    raw: {
                        width: params.width,
                        height: params.height,
                        channels: 4
                    }
                });
                return image.resize(tileSize, tileSize).toFormat(sharp.format.png).toBuffer()
                    .then(data => { resolve({ 'zoom_level': zoom, 'tile_column': x, 'tile_row': y, 'tile_data': data }) })
                    .catch(err => {
                        console.err(err);
                        reject(err);
                    });
            });
        });
    } catch (err) {
        console.log('change color and format err:', err);
    }
}
let ul = function (z, x, y, curCorner) {
    let scaleDenominator = scaleDenominator_dic[(z).toString()];
    let res = scaleDenominator * 0.00028 / (2 * Math.PI * 6378137 / 360.0);  //计算完跟4326度为单位的分辨率一样https://file.geovisearth.com/worldL8ok1_fill_4326_0_18/tilemapresource.xml
    let origin_x = curCorner ? curCorner[1] : topRightCorner[1];
    let origin_y = curCorner ? curCorner[0] : topRightCorner[0];
    let lon = origin_x + x * res * tileSize;
    let lat = origin_y - y * res * tileSize;
    return [lon, lat];
}
let calCenter = function (z, x, y) {
    let lt = ul(z, x, y);
    let left = lt[0], top = lt[1];
    let rb = ul(z, x + 1, y + 1);
    let right = rb[0], bottom = rb[1];
    let curCorner = [parseFloat(top.toFixed(20)), parseFloat((-right).toFixed(20))];
    console.log('curCorner', curCorner);
    let center = ul(z, x, y, curCorner);
    return truncate_lnglat.apply(null, center);
}

const mercatorCenter = function (z, x, y) {
    return mercator.ll([
        ((x + 0.5) / (1 << z)) * (256 << z),
        ((y + 0.5) / (1 << z)) * (256 << z)
    ], z);
}

const aa = async (proj) => {
    y = 2 ** z - 1 - y;
    const tileCenter = proj === 3857 ? mercatorCenter(z, x, y) : calCenter(z, x, y);
    // console.log('bbbbbb', tileCenter)
    // console.log('bbbbbb22222222', data)
    console.log('z', z, 'x', x, 'y', y, 'topRightCorner', topRightCorner, 'tileCenter', tileCenter);
    console.log('z', z, 'x', x, 'y', y, 'tileCenter', tileCenter[0].toFixed(20), tileCenter[1].toFixed(20));

    const tile_data = await changeColorAndFormat(z, x, y, parseFloat(tileCenter[0].toFixed(20)), parseFloat(tileCenter[1].toFixed(20)), data);

    console.log('tile_data', tile_data);

    // fs.writeFileSync('/data/168-out.png', tile_data)
    // fs.writeFileSync('/data/000-out.png', tile_data.tile_data)
    // fs.writeFileSync('/data/100-out.png', tile_data.tile_data)
    // fs.writeFileSync('/data/6_53_24-out.png', tile_data.tile_data)
    // fs.writeFileSync('/data/5_26_12-out.png', tile_data.tile_data)
    fs.writeFileSync(`/data/${z}_${x}_${y}-out.webp`, tile_data.tile_data)

    console.log('finished')
}
// aa();
aa(3857);

// 配置sources有两种可用的方案

// 方案一 这里style的sources会影响转色结果，tiles需要http://10.1.108.195:32527/data/gebco_polygon4osm/{z}/{x}/{y}.pbf这种形式
//   "sources": {
//     "gebco_polygon4osm": {
//         "type": "vector",
//         "tiles": [
//           "http://10.1.108.195:32527/data/gebco_polygon4osm/{z}/{x}/{y}.pbf"
//         ],
//         "minZoom": 0,
//         "maxZoom": 14
//       }
//     }

// 方案二 也可参考官方案例，具体配置见 [https://github.com/mapbox/mapbox-gl-native/blob/f2778251c97ba3403582b9c04290c50f927fd338/platform/node/test/fixtures/style.json#L8-L10]
// 若要按官方配置需要把tiles/0-0-0.vector.pbf放到style/fixtures/下面

// mbtiles暂不可用（报错Invalid value. at offset 0，官方文档[https://github.com/mapbox/mapbox-gl-native/blob/f2778251c97ba3403582b9c04290c50f927fd338/platform/node/README.md]提供的也是上面tiles这种形式）
// "sources": {
//     "gebco_polygon4osm": {
//       "type": "vector",
//       "url": "mbtiles://gebco_polygon4osm.mbtiles",
//       "minZoom": 0,
//       "maxZoom": 14
//     }
//   },

// xvfb-run -a -s '-screen 0 800x600x24' node pbf2png-one.js ./2-6-1.mbtiles


// style.json与pbf  在4326和3857下有没有区别？
// style 可以相同，但是pbf是不同的，也就是说做4326的和3857的pbf是不同的，但是style是可以相同的


