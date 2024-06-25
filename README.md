### 支持4326、3857pbf 通过style.json上色，并转格式
读取配置文件路径下的mbtiles/sqlite中的pbf，上色并转换格式保存到mbtiles中


docker build -t cjp/pbf2png:v1 .

docker run -it --name pbf2png-base -v $(pwd):/data -p 9443:80 cjp/pbf2png:v1

#### Steps:
0. Prepare the docker environment and cjp/pbf2png image; You may need to replace the style.json if you want customed style.
    Use style/fixtures/style.json by default.
1. Modify and copy config.json to current data dir, the config path should match the $(pwd);
    E.g.: $(pwd) is /mnt/144_8/gis_data/sea9, the inputDirPath is the mbtile in /mnt/144_8/gis_data/sea9, such as '/data', 
    Only search for sqlites files under the inputDirPath.

    the metadataDirPath is the metadata location dir path, such as 'sea2-0-1-z9'.
    If the metadataDirPath dir is not same as the inputDirPath, more volumes are needed.
    E.g.: 'docker run -it --name pbf2png-base3 -v /mnt/nas/data.output/zcc/4326_sea_mbtiles:/data -v /mnt/sharedata/test/sea/sea10:/sea10 -p 9445:80 cjp/pbf2png:v1'
    The outputDirPath(optional) can also be defined in the config.json, volume may be also needed.
    The outputDirPath is needed if the inputDirPath is a sqlite file.

    The default projection is 4326. You need to add "proj":3857 into config.json if you want mercator(3857).

2. Run a docker container to remove over bound tiles, add color, change format with the command above; 
    NOTE: pay attention to container name and port when running more than one instance.
3. Recheck the log, mbtiles to confirm it works well.
#### 步骤
0. 准备好docker环境和cjp/pbf2png image；如果你想自定义style（pbf的上色），你得替换style/fixtures/里的style.json或者在配置文件里(如："stypePath":"/data/style.json")
    默认用style/fixtures/style.json
    如果是矢量直接叠加栅格和样式，则在config.json里配置路径 "styles": { "vector": { "style": "/data/style.json" } }
1. 修改change_color_and_format_config.json，添加inputDirPath(只查找该路径下的sqlite文件)， metadataDirPath（可选的）， outputDirPath（可选的）
    config.json的路径要和映射的volume 的路径对应
    例如：volume 的路径是/mnt/144_8/gis_data/sea9:/data， inputDirPath就是sea9目录下的一个mbtiles， inputDirPath:"/data";
    metadataDirPath，outputDirPath也是同样的。
    如果inputDirPath，metadataDirPath，outputDirPath不是在同一个文件夹下，那么都需要volume进到container中。
    如果inputDirPath是以sqlite结尾的,按sqlite处理且需要传outputDirPath.

    proj 默认是4326的，如果需要做3857的，就需要配置proj为3857
    format 默认是webp，如果需要png，就需要配置format为png，支持png，webp，jpeg，jpg。

    配置完成后把change_color_and_format_config.json拷贝到 /data 对应的volume的路径下，在这个例子中就是/mnt/144_8/gis_data/sea9下。
2. 通过命令行 (E.g.:'docker run -it --name pbf2png-base3 -v /mnt/nas/data.output/zcc/4326_sea_mbtiles:/data -v /mnt/sharedata/test/sea/sea10:/sea10 -p 9445:80 cjp/pbf2png:v1')
    启动一个container就可以开始跑了。
    如果想同时开跑多个container实例，记得区分name和port就行。
3. 跑完后检查日志和生成的mbtiles，看是否正确。


// run script local, recommand use docker envrionment
// sudo apt-get update && sudo apt-get install xvfb && npm install
// EGL_LOG_LEVEL=debug
// output: /input/db/path_png.mbtiles located at the same path
// xvfb-run -a -s '-screen 0 800x600x24' node server.js
// e.g.: xvfb-run -a -s '-screen 0 800x600x24' node server.js

请求pbf文件
http://host:port/data/gebco_polygon4osm/0/0/0.pbf

请求上色png
http://localhost:port/styles/gebco_polygon4osm/0/0/0.png
