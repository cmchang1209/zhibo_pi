const io = require('socket.io-client')
const macaddress = require('macaddress')
const exec = require('child_process').exec

/* golbal params */
const minPort = 50000
const maxPort = 60000
const awsPort = 8090
const awsHost = 'videostream.fidodarts.com'
const url = `http://${awsHost}:${awsPort}`
const FFmpegWsd = 'fidodarts'
//const url = `http://192.168.2.130:${awsPort}`

let myMac = ''
let intervalId = null


const ioClient = io.connect(url)

macaddress.one('eth0', (err, mac) => {
    if (!err) {
        myMac = mac
    }
})

ioClient.on('connect', () => {
    console.log('connect')
    run()
    intervalId = setInterval(() => {
        //run()
    }, 10000)
})

ioClient.on("disconnect", () => {
    clearInterval(intervalId)
})

ioClient.on('runFFmpeg', (data) => {
    var cmd = `lsof -i:${data.port} -t`
    exec(cmd, (error, stdout, stderr) => {
        var pid = stdout * 1
        if (!pid) {
            //var cmd = `ffmpeg ${data.cmd}`
            //runFFmpeg(cmd, data)
            runFFmpeg(data)
        } else {
            ioClient.emit('echoPlayImage', { me: data.me, data: { status: true }, indexSid: data.indexSid })
        }
    })

})

ioClient.on('fcnr', (data) => {
    var cmd = `sudo ssh -fCNR ${data.data.port}:localhost:22 pi@${awsHost} -i /home/pi/.ssh/id_rsa`
    fcnr(cmd, data)
})

async function fcnr(cmd, data) {
    var d = await exec(cmd)
    if (!d.error) {
        ioClient.emit('fcnrEcho', { status: true, indexSid: data.indexSid })
    } else {
        ioClient.emit('fcnrEcho', { status: false, indexSid: data.indexSid })
    }
}

async function runFFmpeg(data) {
    console.log(data)
    var size = data.imageInfo[0].size
    if (data.imageInfo[0].type === 1) {
        size = '640x360'
    }
    var ws_realy_url = `http://${awsHost}:${data.port}/${FFmpegWsd}`
    var cmd = `/home/pi/ffmpeg.sh ${data.imageInfo[0].fps} ${size} '${data.imageInfo[0].dev_name}' '${ws_realy_url}'`
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.log(error)
            //ffmpeg 未啟動
            ioClient.emit('echoPlayImage', { me: data.me, data: { status: false, code: '0004' }, indexSid: data.indexSid })
        } else {
            console.log('ok')
            ioClient.emit('echoPlayImage', { me: data.me, data: { status: true, port: data.port }, indexSid: data.indexSid })
        }
    })
    return
    var d = await exec(cmd)
    setTimeout(() => {
        cmd = `lsof -i:${data.port} -t`
        exec(cmd, (error, stdout, stderr) => {
            console.log(stdout * 1, error)
            var pid = stdout * 1
            if (pid) {
                ioClient.emit('echoPlayImage', { me: data.me, data: { status: true, port: data.port }, indexSid: data.indexSid })
            } else {
                //ffmpeg 未啟動
                ioClient.emit('echoPlayImage', { me: data.me, data: { status: false, code: '0004' }, indexSid: data.indexSid })
            }
        })
    }, 1000)
}

async function run() {
    var data = []
    var cmd = "v4l2-ctl --list-devices"
    exec(cmd, (error, stdout, stderr) => {
        var usbList = listUSB(stdout)
        usbList.map((item, index) => {
            item.devices.map((uitem, uindex) => {
                if (uindex === 0) {
                    var cmd1 = `v4l2-ctl --list-formats-ext -d ${uitem.name}`
                    exec(cmd1, (error, stdout, stderr) => {
                        var formats = formatExt(stdout)
                        uitem.formats.push(formats)
                        if (index === usbList.length - 1) {
                            ioClient.emit('run', { mac: myMac, camData: usbList })
                        }
                    })
                } else {
                    item.devices.splice(uindex, 1)
                }
            })
        })
    })
}

function listUSB(txt) {
    let lines = txt.split('\n')
    let devices = []
    let cur
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]

        if (line.endsWith(":")) {
            let dev = {}
            if (line.indexOf('bcm2835') >= 0) {
                cur = undefined
                continue
            }
            dev.name = line.substr(0, line.length - 1)
            dev.devices = []
            devices.push(dev)

            cur = dev
            continue
        }
        if (line.indexOf('/dev/') >= 0 && cur) {
            let dev = { name: line.trim(), formats: [] }
            cur.devices.push(dev)
        }
    }

    return devices
}

function formatExt(txt) {
    let lines = txt.split('\n')
    let exts = []
    let cur
    let curSize
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        if (line.indexOf('ioctl:') >= 0) continue
        if (line.indexOf('Type:') > 0) {
            if (line.indexOf('Video Capture') < 0) {
                console.log("not capture device")
                return
            }
        }
        if (line.indexOf('[') >= 0) {
            let dev = {}
            dev.size = []
            cur = dev
            let x = line.split("'")
            dev.format = x[1]
            exts.push(dev)
            continue
        }
        if (line.indexOf("Size:") >= 0) {
            let sizeObj = {}
            let size = line.split("Discrete")[1].trim()
            sizeObj.size = size
            sizeObj.fps = []
            curSize = sizeObj
            cur.size.push(sizeObj)
            continue
        }
        if (line.indexOf("Interval") >= 0) {
            let f1 = line.split("(")[1]
            let fps = f1.split(".")[0]
            curSize.fps.push(fps)

        }

    }

    return exts
}