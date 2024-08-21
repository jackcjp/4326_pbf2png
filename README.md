### 支持4326、3857pbf 通过style.json上色，并转格式
读取配置文件路径下的mbtiles/sqlite中的pbf，上色并转换格式保存到mbtiles中。

默认也支持使用http请求的pbf。


docker build -t pbf2imgv4:v1 .

docker run --rm -it --name pbf2imgv4-base -v $(pwd):/data -p 9443:80 pbf2imgv4:v1

change_color_and_format_config.json
```
{
    "options": {
        "paths": {
            "styles": "/data/style",
            "mbtiles": "/data",
            "metadata":"/data/metadata.json",
            "output": "/data/test/output"
        },
        "proj": 3857,
        "format": "png",
        "tileSize": 512,
        "resize": 256,
        "scale": 1,
        "isTransparentWhenEmpty":true
    },
    "styles": {
        "vector": {
            "style": "hillshade_v4.json",
            "tilejson": {
                "bounds": [
                    -180,
                    -80,
                    180,
                    80
                ]
            }
        }
    },
    "data": {
        "vector": {
            "mbtiles": "test/vector/vector.mbtiles"
        },
        "raster": {
            "mbtiles": "0-0-0_webp.mbtiles"
        }
    }
}
```


#### Steps:
0. 准备好docker环境和pbf2img image；

1. 准备样式文件（style.json）和配置文件(change_color_and_format_config.json)：

    自定义style（pbf的上色，一般用mapnik来配色获取json配置文件），替换style.json，
    且需在配置文件change_color_and_format_config.json里配置options['paths']['styles']（路径）和styles['vector']['style']（文件名），以便能找到配置文件。

    默认用style/style.json。

    注：style.json中layers的顺序会影像render的结果，前面的在底层，后面的依次往上覆盖，最后的在最上层。
        比如layers:[{
        "id": "sea",
        ...
        },{
        "id": "ns",
        ...
        },{
        "id": "land",
        ...
        }]这种顺序，那么sea在最低层，ns在中间，land在最上层，这样效果是对的，如顺序乱则结果不对。

2. 准备数据：
    change_color_and_format_config.json中data的key(property)要跟styles.json中sources的key保持一致。
    
    现支持vector和raster一起融合，或vector、raster单独一种融合。
    
    配置文件的options["paths"]["mbtiles"]（路径）和data[key]["mbtiles"]（文件名），以便能找到数据。
    
    data[key]["mbtiles"]单个文件用mbtiles，多个文件用文件夹名；
    如果有raster和vector两种数据类型，则路径类型要保持一致，如是单个mbtiles都是mbtiles，如是文件夹名都是文件夹名；
    如果有vector和raster两种文件夹名路径，则文件夹路径下的文件名应使用统一的命名规则，如都按网格号命名；

    如果两个文件夹名下的文件网格号和数量不一致，则取并集。


    metadata: 可选，默认用输入mbtiles的metadata。json格式的配置文件，样例见test/metadata.json。

    注：输入mbtiles中必须要有metadata表，如没有会报错（如需明确输入数据的格式等，默认格式为pbf，如不是pbf会报错）。
    如果没有metadata表，建议用test/metadata.sql为模板来初始化metadata表。

    output: 可选，默认用options["paths"]["mbtiles"]）；
    如果mbtiles，metadata，output不在同一个文件夹下，那么都需要volume进container中。

    proj: 可选，默认是4326的，支持3857，4326两种坐标系。

    format: 可选，默认是webp，支持png，webp，jpeg，jpg（jpg按jpeg处理）。

    tileSize: 可选，默认是512，渲染时瓦片的大小，支持256和512两种尺寸。

    resize: 可选，默认是256，导出的瓦片大小。
    注：tileSize和resize是为达到更清晰的效果而单独设置的，tileserver-gl的tileSize默认是256，没有resize。

    scale: 可选，默认是1，支持1,2,3。

    isTransparentWhenEmpty: 可选，默认是false， true时会生成透明图。

    verbose: 可选，默认是false，true时会输出更详细的log。

    配置完成后把change_color_and_format_config.json拷贝到 /data 对应的volume的路径下。

3. 通过命令行 (E.g.:'docker run --rm -it --name pbf2imgv4 -v /mnt/nas/data.output/zcc/4326_sea_mbtiles:/data -p 9448:80 pbf2imgv4:v2')
    启动一个container就可以开始跑了。如果想同时开跑多个container实例，记得区分name和port。

4. 跑完后检查日志和生成的mbtiles，看是否正确。

// run script local, recommand use docker envrionment
// sudo apt-get update && sudo apt-get install xvfb && npm install
// EGL_LOG_LEVEL=debug
// output: /input/db/path_png.mbtiles located at the same path
// e.g.: xvfb-run -a -s '-screen 0 800x600x24' node server.js

请求pbf文件
http://host:port/data/gebco_polygon4osm/0/0/0.pbf

请求上色png
http://localhost:port/styles/gebco_polygon4osm/0/0/0.png
