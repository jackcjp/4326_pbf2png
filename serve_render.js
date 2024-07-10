
const path = require('path');
const fs = require('node:fs');
const { createCanvas } = require('canvas')
const advancedPool = require('advanced-pool');
const mlgl = require('@maplibre/maplibre-gl-native');
const sharp = require('sharp');
const mercator = new (require('@mapbox/sphericalmercator'))();
const axios = require('axios');
const MBTiles = require('node-mbtilesv123');
const zlib = require('node:zlib');
const Color = require('color');
const config = require('/data/change_color_and_format_config.json');

const isValidHttpUrl = (string) => {
    let url;

    try {
        url = new URL(string);
    } catch (_) {
        return false;
    }

    return url.protocol === 'http:' || url.protocol === 'https:';
};

function createTransparentResponse(format = 'png', callback) {
    const canvas = createCanvas(1, 1);
    const context = canvas.getContext('2d');

    // 设置全透明（RGBA: 0, 0, 0, 0）
    context.clearRect(0, 0, 1, 1);

    // 将Canvas内容转换为Buffer
    callback(null, { data: canvas.toBuffer(`image/png`) })
    return
}

/**
 * Cache of response data by sharp output format and color.  Entry for empty
 * string is for unknown or unsupported formats.
 */
const cachedEmptyResponses = {
    '': Buffer.alloc(0),
};

/**
 * Create an appropriate mlgl response for http errors.
 * @param {string} format The format (a sharp format or 'pbf').
 * @param {string} color The background color (or empty string for transparent).
 * @param {Function} callback The mlgl callback.
 */
function createEmptyResponse(format, color, callback) {
    if (!format || format === 'pbf') {
        callback(null, { data: cachedEmptyResponses[''] });
        return;
    }

    if (format === 'jpg') {
        format = 'jpeg';
    }
    if (!color) {
        color = 'rgba(255,255,255,0)';
    }

    const cacheKey = `${format},${color}`;
    const data = cachedEmptyResponses[cacheKey];
    if (data) {
        callback(null, { data: data });
        return;
    }

    // create an "empty" response image
    color = new Color(color);
    const array = color.array();
    const channels = array.length === 4 && format !== 'jpeg' ? 4 : 3;
    sharp(Buffer.from(array), {
        raw: {
            width: 1,
            height: 1,
            channels,
        },
    })
        .toFormat(format)
        .toBuffer((err, buffer, info) => {
            if (!err) {
                cachedEmptyResponses[cacheKey] = buffer;
            }
            callback(null, { data: buffer });
        });
}

const data = config.data;

const map = {
    renderers: [],
    renderersStatic: [],
    sources: {},
    sourceTypes: {},
};
let repoobj = {};
const options = config.options,
    // 因config.styles只有一个，故取第一个，参考server.js中L269-L277 addStyle
    id = Object.keys(config.styles)[0], params = config.styles[id],
    publicUrl = undefined,
    dataResolver = function (styleSourceId, type) {
        // console.log('styleSourceId:', styleSourceId);
        let fileType;
        let inputFile;
        for (const id of Object.keys(data)) {
            fileType = Object.keys(data[id])[0];
            if (styleSourceId == id) {
                inputFile = data[id][fileType];
                break;
            } else if (data[id][fileType] == styleSourceId) {
                inputFile = data[id][fileType];
                break;
            }
        }
        if (!inputFile) {
            if (data[type][fileType].endsWith(styleSourceId)) {
                inputFile = path.resolve(options.paths[fileType], data[type][fileType]);
            } else {
                inputFile = path.resolve(options.paths[fileType], data[type][fileType], styleSourceId);
            }
        }
        if (!isValidHttpUrl(inputFile)) {
            inputFile = path.resolve(options.paths[fileType], inputFile);
        }
        // console.log('inputFile:', inputFile, 'fileType', fileType);
        return { inputFile, fileType };
    }
// 赋默认值
if (!options.resize) {
    options.resize = 256
}

// console.log('options:', options, 'params:', params, 'id:', id)

const serve_render_add = async (vectorUrl, rasterUrl, isDir = false) => {
    let styleJSON;

    const styleFile = params.style;
    const styleJSONPath = path.resolve(options.paths.styles, styleFile);
    try {
        styleJSON = JSON.parse(fs.readFileSync(styleJSONPath));
    } catch (e) {
        console.error('Error parsing style file, file path:', styleJSONPath, e);
        return false;
    }

    // 只在vectorUrl和rasterUrl有一个为空时重置styleJSON.sources，同时为空或者同时不空都不处理
    if ((vectorUrl === undefined) ^ (rasterUrl === undefined)) { // 使用异或运算符^
        const sourceTypes = { vector: vectorUrl !== undefined, raster: rasterUrl !== undefined };
        let sourceTypeKey = sourceTypes.vector ? 'vector' : 'raster'; // 根据哪个URL不为空设置sourceTypeKey

        // 查找对应的源名称
        let name = Object.keys(styleJSON.sources).find(p => styleJSON.sources[p].type === sourceTypeKey);

        // 如果找到了对应的name，则更新sources对象并应用到styleJSON.sources
        if (name) {
            const sources = { [name]: styleJSON.sources[name] }; // 使用计算属性名语法
            styleJSON.sources = sources;
        }
    }

    for (const layer of styleJSON.layers || []) {
        if (layer && layer.paint) {
            // Remove (flatten) 3D buildings
            if (layer.paint['fill-extrusion-height']) {
                layer.paint['fill-extrusion-height'] = 0;
            }
            if (layer.paint['fill-extrusion-base']) {
                layer.paint['fill-extrusion-base'] = 0;
            }
        }
    }

    const tileJSON = {
        tilejson: '2.0.0',
        name: styleJSON.name,
        attribution: '',
        minzoom: 0,
        maxzoom: 20,
        bounds: [-180, -85.0511, 180, 85.0511],
        format: 'png',
        type: 'baselayer',
    };
    if (styleJSON.center && styleJSON.zoom) {
        tileJSON.center = styleJSON.center.concat(Math.round(styleJSON.zoom));
    }
    Object.assign(tileJSON, params.tilejson || {});
    tileJSON.tiles = params.domains || options.domains;
    const attributionOverride = params.tilejson && params.tilejson.attribution;

    const fixTileJSONCenter = (tileJSON) => {
        if (tileJSON.bounds && !tileJSON.center) {
            const fitWidth = 1024;
            const tiles = fitWidth / 256;
            tileJSON.center = [
                (tileJSON.bounds[0] + tileJSON.bounds[2]) / 2,
                (tileJSON.bounds[1] + tileJSON.bounds[3]) / 2,
                Math.round(
                    -Math.log((tileJSON.bounds[2] - tileJSON.bounds[0]) / 360 / tiles) /
                    Math.LN2,
                ),
            ];
        }
    };

    fixTileJSONCenter(tileJSON);

    repoobj = {
        tileJSON,
        publicUrl,
        map,
        dataProjWGStoInternalWGS: null,
        lastModified: new Date().toUTCString(),
        watermark: params.watermark || options.watermark,
        staticAttributionText:
            params.staticAttributionText || options.staticAttributionText,
    };

    const queue = [];
    for (const name of Object.keys(styleJSON.sources)) {
        let sourceType;
        let source = styleJSON.sources[name];

        // 当data[type]["mbtiles"]为文件夹名时需要用传入的路径
        let url = isDir ? (source.type === id ? vectorUrl : rasterUrl) : source.url;
        // console.log(name, source.type, id, isDir, source.url, url, '__________11111111111111111')
        if (
            url &&
            (url.startsWith('pmtiles://') || url.startsWith('mbtiles://'))
        ) {
            // found pmtiles or mbtiles source, replace with info from local file
            delete source.url;

            let dataId = url.replace('pmtiles://', '').replace('mbtiles://', '');
            if (dataId.startsWith('{') && dataId.endsWith('}')) {
                dataId = dataId.slice(1, -1);
            }

            const mapsTo = (params.mapping || {})[dataId];
            if (mapsTo) {
                dataId = mapsTo;
            }

            let inputFile;
            // console.log('dataId_source.type', dataId, name)
            const dataInfo = dataResolver(dataId, name);
            if (dataInfo.inputFile) {
                inputFile = dataInfo.inputFile;
                sourceType = dataInfo.fileType;
            } else {
                console.error(`ERROR: data "${inputFile}" not found!`);
                process.exit(1);
            }

            if (!isValidHttpUrl(inputFile)) {
                const inputFileStats = fs.statSync(inputFile);
                if (!inputFileStats.isFile() || inputFileStats.size === 0) {
                    throw Error(`Not valid PMTiles file: "${inputFile}"`);
                }
            }

            if (sourceType === 'pmtiles') {
                map.sources[name] = openPMtiles(inputFile);
                map.sourceTypes[name] = 'pmtiles';
                const metadata = await getPMtilesInfo(map.sources[name]);

                if (!repoobj.dataProjWGStoInternalWGS && metadata.proj4) {
                    // how to do this for multiple sources with different proj4 defs?
                    const to3857 = proj4('EPSG:3857');
                    const toDataProj = proj4(metadata.proj4);
                    repoobj.dataProjWGStoInternalWGS = (xy) =>
                        to3857.inverse(toDataProj.forward(xy));
                }

                const type = source.type;
                Object.assign(source, metadata);
                source.type = type;
                source.tiles = [
                    // meta url which will be detected when requested
                    `pmtiles://${name}/{z}/{x}/{y}.${metadata.format || 'pbf'}`,
                ];
                delete source.scheme;

                if (
                    !attributionOverride &&
                    source.attribution &&
                    source.attribution.length > 0
                ) {
                    if (!tileJSON.attribution.includes(source.attribution)) {
                        if (tileJSON.attribution.length > 0) {
                            tileJSON.attribution += ' | ';
                        }
                        tileJSON.attribution += source.attribution;
                    }
                }
            } else {
                queue.push(
                    new Promise((resolve, reject) => {
                        inputFile = path.resolve(options.paths.mbtiles, inputFile);
                        const inputFileStats = fs.statSync(inputFile);
                        if (!inputFileStats.isFile() || inputFileStats.size === 0) {
                            throw Error(`Not valid MBTiles file: "${inputFile}"`);
                        }
                        map.sources[name] = new MBTiles(inputFile + '?mode=ro', (err) => {
                            map.sources[name].getInfo((err, info) => {
                                if (err) {
                                    console.error(err);
                                    return;
                                }
                                map.sourceTypes[name] = 'mbtiles';

                                if (!repoobj.dataProjWGStoInternalWGS && info.proj4) {
                                    // how to do this for multiple sources with different proj4 defs?
                                    const to3857 = proj4('EPSG:3857');
                                    const toDataProj = proj4(info.proj4);
                                    repoobj.dataProjWGStoInternalWGS = (xy) =>
                                        to3857.inverse(toDataProj.forward(xy));
                                }

                                const type = source.type;
                                Object.assign(source, info);
                                source.type = type;
                                source.tiles = [
                                    // meta url which will be detected when requested
                                    `mbtiles://${name}/{z}/{x}/{y}.${info.format || 'pbf'}`,
                                ];
                                // console.log('source.tiles____', source.tiles);
                                delete source.scheme;

                                if (options.dataDecoratorFunc) {
                                    source = options.dataDecoratorFunc(
                                        name,
                                        'tilejson',
                                        source,
                                    );
                                }

                                if (
                                    !attributionOverride &&
                                    source.attribution &&
                                    source.attribution.length > 0
                                ) {
                                    if (!tileJSON.attribution.includes(source.attribution)) {
                                        if (tileJSON.attribution.length > 0) {
                                            tileJSON.attribution += ' | ';
                                        }
                                        tileJSON.attribution += source.attribution;
                                    }
                                }
                                resolve();
                            });
                        });
                    }),
                );
            }
        }
    }

    await Promise.all(queue);

    let maxScaleFactor = 2;

    maxScaleFactor = Math.min(Math.floor(options.maxScaleFactor || 3), 9);

    const createPool = (ratio, mode, min, max) => {
        const createRenderer = (ratio, createCallback) => {
            const renderer = new mlgl.Map({
                mode,
                ratio,
                request: async (req, callback) => {
                    const protocol = req.url.split(':')[0];
                    // console.log('Handling request:_____________________', req);
                    if (protocol === 'sprites') {
                        const dir = options.paths[protocol];
                        const file = unescape(req.url).substring(protocol.length + 3);
                        fs.readFile(path.join(dir, file), (err, data) => {
                            callback(err, { data: data });
                        });
                    } else if (protocol === 'fonts') {
                        const parts = req.url.split('/');
                        const fontstack = unescape(parts[2]);
                        const range = parts[3].split('.')[0];

                        try {
                            const concatenated = await getFontsPbf(
                                null,
                                options.paths[protocol],
                                fontstack,
                                range,
                                existingFonts,
                            );
                            callback(null, { data: concatenated });
                        } catch (err) {
                            callback(err, { data: null });
                        }
                    } else if (protocol === 'mbtiles' || protocol === 'pmtiles') {
                        // console.log('Handling request:_____________________', req.url);
                        const parts = req.url.split('/');
                        const sourceId = parts[2];
                        const source = map.sources[sourceId];
                        const sourceType = map.sourceTypes[sourceId];
                        const sourceInfo = styleJSON.sources[sourceId];

                        const z = parts[3] | 0;
                        const x = parts[4] | 0;
                        const y = parts[5].split('.')[0] | 0;
                        const format = parts[5].split('.')[1];

                        if (sourceType === 'pmtiles') {
                            let tileinfo = await getPMtilesTile(source, z, x, y);
                            let data = tileinfo.data;
                            let headers = tileinfo.header;
                            if (data == undefined) {
                                if (options.verbose)
                                    console.log('MBTiles error, serving empty', err);
                                createEmptyResponse(
                                    sourceInfo.format,
                                    sourceInfo.color,
                                    callback,
                                );
                                return;
                            } else {
                                const response = {};
                                response.data = data;
                                if (headers['Last-Modified']) {
                                    response.modified = new Date(headers['Last-Modified']);
                                }

                                if (format === 'pbf') {
                                    if (options.dataDecoratorFunc) {
                                        response.data = options.dataDecoratorFunc(
                                            sourceId,
                                            'data',
                                            response.data,
                                            z,
                                            x,
                                            y,
                                        );
                                    }
                                }

                                callback(null, response);
                            }
                        } else if (sourceType === 'mbtiles') {
                            source.getTile(z, x, y, (err, data, headers) => {
                                if (err) {
                                    if (options.verbose)
                                        console.log('MBTiles error, serving empty', err, req.url);
                                    if (options.isTransparentWhenEmpty) {
                                        createTransparentResponse(sourceInfo.format, callback)
                                    } else {
                                        createEmptyResponse(
                                            sourceInfo.format,
                                            sourceInfo.color,
                                            callback,
                                        );
                                    }
                                    return;
                                }

                                const response = {};
                                if (format === 'pbf') {
                                    try {
                                        response.data = zlib.unzipSync(data);
                                    } catch (err) {
                                        console.log(err)
                                        console.log(
                                            'Skipping incorrect header for tile mbtiles://%s/%s/%s/%s.pbf',
                                            id,
                                            z,
                                            x,
                                            y,
                                        );
                                    }
                                    if (options.dataDecoratorFunc) {
                                        response.data = options.dataDecoratorFunc(
                                            sourceId,
                                            'data',
                                            response.data,
                                            z,
                                            x,
                                            y,
                                        );
                                    }
                                } else {
                                    response.data = data;
                                }

                                callback(null, response);
                            }, sourceInfo.type === id);
                        }
                    } else if (protocol === 'http' || protocol === 'https') {
                        try {
                            const response = await axios.get(req.url, {
                                responseType: 'arraybuffer', // Get the response as raw buffer
                                // Axios handles gzip by default, so no need for a gzip flag
                            });

                            const responseHeaders = response.headers;
                            const responseData = response.data;

                            const parsedResponse = {};
                            if (responseHeaders['last-modified']) {
                                parsedResponse.modified = new Date(
                                    responseHeaders['last-modified'],
                                );
                            }
                            if (responseHeaders.expires) {
                                parsedResponse.expires = new Date(responseHeaders.expires);
                            }
                            if (responseHeaders.etag) {
                                parsedResponse.etag = responseHeaders.etag;
                            }

                            parsedResponse.data = responseData;
                            callback(null, parsedResponse);
                        } catch (error) {
                            console.log('Handling request error :', error)
                        }
                    }
                },
            });
            renderer.load(styleJSON);
            createCallback(null, renderer);
        };
        return new advancedPool.Pool({
            min,
            max,
            create: createRenderer.bind(null, ratio),
            destroy: (renderer) => {
                renderer.release();
            },
        });
    };
    // standard and @2x tiles are much more usual -> default to larger pools
    const minPoolSizes = options.minRendererPoolSizes || [8, 4, 2];
    const maxPoolSizes = options.maxRendererPoolSizes || [16, 8, 4];
    for (let s = 1; s <= maxScaleFactor; s++) {
        const i = Math.min(minPoolSizes.length - 1, s - 1);
        const j = Math.min(maxPoolSizes.length - 1, s - 1);
        const minPoolSize = minPoolSizes[i];
        const maxPoolSize = Math.max(minPoolSize, maxPoolSizes[j]);
        map.renderers[s] = createPool(s, 'tile', minPoolSize, maxPoolSize);
        map.renderersStatic[s] = createPool(
            s,
            'static',
            minPoolSize,
            maxPoolSize,
        );
    }
    return repoobj
}

const serve_render_remove = (repo, id) => {
    const item = repo[id];
    if (item) {
        item.map.renderers.forEach((pool) => {
            pool.close();
        });
        item.map.renderersStatic.forEach((pool) => {
            pool.close();
        });
        Object.keys(item.map.sources).forEach((key) => {
            item.map.sources[key].close();
        });
    }
    delete repo[id];
}

const renderingImage = async (
    options,
    item,
    z, x, y,
    lon,
    lat,
    bearing,
    pitch,
    width,
    height,
    scale,
    format,
    overlay = null,
    mode = 'tile',
) => {
    if (
        Math.abs(lon) > 180 ||
        Math.abs(lat) > 85.06 ||
        lon !== lon ||
        lat !== lat
    ) {
        console.error('Invalid center', lon, lat);
    }

    if (
        Math.min(width, height) <= 0 ||
        Math.max(width, height) * scale > (options.maxSize || 2048) ||
        width !== width ||
        height !== height
    ) {
        console.error('Invalid size', width, height);
    }

    if (format === 'png' || format === 'webp') {
    } else if (format === 'jpg' || format === 'jpeg') {
        format = 'jpeg';
    } else {
        console.error('Invalid format', format);
    }

    const tileMargin = Math.max(options.tileMargin || 0, 0);
    let pool;
    if (mode === 'tile' && tileMargin === 0) {
        pool = item.map.renderers[scale];
    } else {
        pool = item.map.renderersStatic[scale];
    }

    return new Promise((resolve, reject) => {
        pool.acquire((err, renderer) => {
            // For 512px tiles, use the actual maplibre-native zoom. For 256px tiles, use zoom - 1
            let mlglZ;
            if (width === 512) {
                mlglZ = Math.max(0, z);
            } else {
                mlglZ = Math.max(0, z - 1);
            }

            const params = {
                zoom: mlglZ,
                center: [lon, lat],
                bearing,
                pitch,
                width,
                height,
            };

            // HACK(Part 1) 256px tiles are a zoom level lower than maplibre-native default tiles. this hack allows tileserver-gl to support zoom 0 256px tiles, which would actually be zoom -1 in maplibre-native. Since zoom -1 isn't supported, a double sized zoom 0 tile is requested and resized in Part 2.
            if (z === 0 && width === 256) {
                params.width *= 2;
                params.height *= 2;
            }
            // END HACK(Part 1)

            if (z > 0 && tileMargin > 0) {
                params.width += tileMargin * 2;
                params.height += tileMargin * 2;
            }
            renderer.render(params, (err, data) => {
                pool.release(renderer);
                if (err) {
                    console.error(err, 'renderer.render error!');
                    return reject(err)
                }

                const image = sharp(data, {
                    raw: {
                        premultiplied: true,
                        width: params.width * scale,
                        height: params.height * scale,
                        channels: 4,
                    },
                });

                // image.toFile('/data/image_test0.png', function (err) {
                //     console.log('666666666666_image_test.png')
                //     if (err) throw err;
                // });
                if (z > 0 && tileMargin > 0) {
                    const y = mercator.px(params.center, z)[1];
                    const yoffset = Math.max(
                        Math.min(0, y - 128 - tileMargin),
                        y + 128 + tileMargin - Math.pow(2, z + 8),
                    );
                    image.extract({
                        left: tileMargin * scale,
                        top: (tileMargin + yoffset) * scale,
                        width: width * scale,
                        height: height * scale,
                    });
                }

                // HACK(Part 2) 256px tiles are a zoom level lower than maplibre-native default tiles. this hack allows tileserver-gl to support zoom 0 256px tiles, which would actually be zoom -1 in maplibre-native. Since zoom -1 isn't supported, a double sized zoom 0 tile is requested and resized here.
                if (z === 0 && width === 256) {
                    image.resize(width * scale, height * scale);
                }
                // END HACK(Part 2)

                const composites = [];
                // console.log('overlay________', overlay)
                if (overlay) {
                    composites.push({ input: overlay });
                }
                if (item.watermark) {
                    const canvas = renderWatermark(width, height, scale, item.watermark);

                    composites.push({ input: canvas.toBuffer() });
                }

                if (mode === 'static' && item.staticAttributionText) {
                    const canvas = renderAttribution(
                        width,
                        height,
                        scale,
                        item.staticAttributionText,
                    );

                    composites.push({ input: canvas.toBuffer() });
                }

                if (composites.length > 0) {
                    image.composite(composites);
                }

                const formatQuality = (options.formatQuality || {})[format];
                // console.log('formatQuality___________', formatQuality)

                if (format === 'png') {
                    image.png({ adaptiveFiltering: false });
                } else if (format === 'jpeg') {
                    image.jpeg({ quality: formatQuality || 80 });
                } else if (format === 'webp') {
                    image.webp({ quality: formatQuality || 90 });
                }
                // image.toBuffer((err, buffer, info) => {
                //     if (!buffer) {
                //         console.error(err, 'image.toBuffer error: Not found!');
                //     }
                //     return fs.writeFileSync(`/data/${z}_${x}_${y}-out2.webp`, buffer)
                // });

                return image.resize(options.resize || 256, options.resize || 256).toBuffer()
                    .then(data => { resolve({ 'zoom_level': z, 'tile_column': x, 'tile_row': y, 'tile_data': data }) })
                    .catch(err => {
                        // console.err(err);
                        reject(err);
                    });
            });
        });
    });
};


async function renderImage(z, x, y, tileCenter, format = 'png', tileSize = 512, scale = 1) {
    if (
        z < 0 ||
        x < 0 ||
        y < 0 ||
        z > 22 ||
        x >= Math.pow(2, z) ||
        y >= Math.pow(2, z)
    ) {
        console.error('Out of bounds', z, x, y)
    }

    // prettier-ignore
    return renderingImage(
        options, repoobj, z, x, y, tileCenter[0], tileCenter[1], 0, 0, tileSize, tileSize, scale, format
    );
}

module.exports = {
    serve_render_add,
    serve_render_remove,
    renderImage,
    repo: {
        [id]: repoobj
    }
}

// const aa =  async() => {
//     await serve_render_add()
//     return await renderImage(3, 6, 3, 'webp');
// }
// console.log(aa)

// xvfb-run -a -s '-screen 0 1024x768x24' node serve_render.js