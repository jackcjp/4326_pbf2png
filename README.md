### 支持4326、3857pbf 通过style.json上色，并转格式
读取配置文件路径下的mbtiles/sqlite中的pbf，上色并转换格式保存到mbtiles中


docker build -t pbf2imgv4:v1 .

docker run -it --name pbf2imgv4-base -v $(pwd):/data -p 9443:80 pbf2imgv4:v1

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
0. 准备好docker环境和pbf2img image；准备样式文件（style.json）和配置文件(change_color_and_format_config.json)
    自定义style（pbf的上色），你得替换style.json或者在配置文件里配置
    默认用style/style.json
    如果自定义样式文件位置，则在change_color_and_format_config.json里配置路径 "styles": { "vector": { "style": "style.json" } }
    注意：这里要与options["paths"]["styles"]配合使用，以便能找到配置文件。
1. 数据，
    data的type需要跟styles.json中的sources的key保持一致。现支持vector和raster一起融合；也支持有vector或raster中一种的。
    配置文件的data[type]["mbtiles"](只查找该路径下的mbtiles文件)， 注意：这里要与options["paths"]["mbtiles"]配合使用，以便能找到数据。
    data[type]["mbtiles"] 既可是单个mbtiles，也可是文件夹名；
    如果有两种类型，则要保持一致（如是文件夹名都是文件夹名，如是单个mbtiles都是mbtiles）。
    单个文件用mbtiles，多个文件用文件夹名。
    如是文件夹名，则查找该文件夹名下的mbtiles文件；如果有vector和raster两种文件夹名路径，则文件名应保持一致，如都按网格号命名；
    如果两个文件夹名下的文件网格号和数量不一致，则取并集。

    metadata: 可选，默认用原文件的metadata；
    
    注：输入mbtiles中必须要有metadata表，如没有会报错，比如不知输入数据的格式等，会默认格式为pbf，导致报错；
    如果没有metadata表，建议用test/raster/metadata.sql改改来初始化metadata表。
    
    output: 可选，默认用options["paths"]["mbtiles"]）；
    如果mbtiles，metadataDirPath，output不在同一个文件夹下，那么都需要volume进container中。

    proj: 默认是4326的，支持3857，4326两种坐标系
    
    format: 默认是webp，支持png，webp，jpeg，jpg（jpg按jpeg处理）。
    
    tileSize: 渲染时瓦片的大小 默认是512，支持256和512两种尺寸。
    
    resize: 导出的瓦片大小，可选，默认是256。
    注意：tileSize和resize是为达到良好的效果而单独设置的，tileserver-gl的tileSize默认是256，没有resize。
    
    scale: 默认是1，支持1,2,3。

    isTransparentWhenEmpty: 默认是false， true时会生成透明图。
    
    verbose: 默认是false，true会输出更详细的log。

    配置完成后把change_color_and_format_config.json拷贝到 /data 对应的volume的路径下，在这个例子中就是/mnt/144_8/gis_data/sea9下。
2. 通过命令行 (E.g.:'docker run --rm -it --name pbf2imgv4 -v /mnt/nas/data.output/zcc/4326_sea_mbtiles:/data -p 9448:80 pbf2imgv4:v2')
    启动一个container就可以开始跑了。
    如果想同时开跑多个container实例，记得区分name和port就行。
3. 跑完后检查日志和生成的mbtiles，看是否正确。


// run script local, recommand use docker envrionment
// sudo apt-get update && sudo apt-get install xvfb && npm install
// EGL_LOG_LEVEL=debug
// output: /input/db/path_png.mbtiles located at the same path
// e.g.: xvfb-run -a -s '-screen 0 800x600x24' node server.js

请求pbf文件
http://host:port/data/gebco_polygon4osm/0/0/0.pbf

请求上色png
http://localhost:port/styles/gebco_polygon4osm/0/0/0.png
